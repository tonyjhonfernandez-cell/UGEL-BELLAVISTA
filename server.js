require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const path = require('path');
const { seedDatabase } = require('./seed');

const app = express();

if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL no configurada en .env');
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

function toPgSql(sql) {
    let i = 0;
    return String(sql).replace(/\?/g, () => `$${++i}`);
}

const db = {
    async exec(sql) { await pool.query(sql); },
    prepare(sql) {
        const pgSql = toPgSql(sql);
        return {
            all: async (...params) => (await pool.query(pgSql, params)).rows,
            get: async (...params) => (await pool.query(pgSql, params)).rows[0],
            run: async (...params) => {
                let q = pgSql;
                if (/^\s*insert/i.test(sql) && !/returning/i.test(sql)) q += ' RETURNING id';
                const result = await pool.query(q, params);
                return { lastInsertRowid: result.rows[0]?.id, changes: result.rowCount };
            }
        };
    }
};

app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    store: new PgSession({
        pool: pool,
        tableName: 'user_sessions',
        createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || 'ugel_monitoreo_2026',
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 8 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
}));

// En Vercel (serverless) no hay estado global persistente.
// Usamos la BD misma para saber si ya se migró.
async function syncPasswords() {
    try {
        await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password TEXT");
        // Solo para usuarios nuevos (password NULL/vacío) - no revertir cambios manuales
        await pool.query(`
            UPDATE usuarios
            SET password = COALESCE(NULLIF(TRIM(dni),''), NULLIF(ie_codigo,''), '12345678')
            WHERE (password IS NULL OR password = '') AND rol NOT IN ('admin')
        `);
    } catch(e) {
        console.error('Error en syncPasswords:', e.message);
    }
}

async function runUserMigration() {
    try {
        // Añadir columnas si no existen
        await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS usuario VARCHAR(100)");
        await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password TEXT");

        // Asignar password = DNI donde falta (supervisores y directores)
        await pool.query(`
            UPDATE usuarios
            SET password = COALESCE(NULLIF(TRIM(dni),''), NULLIF(ie_codigo,''), '12345678')
            WHERE (password IS NULL OR password = '') AND rol NOT IN ('admin')
        `);

        // Asignar usuario para directores donde falta
        await pool.query(`
            UPDATE usuarios
            SET usuario = 'director.' || COALESCE(ie_codigo, id::text)
            WHERE (usuario IS NULL OR usuario = '') AND rol = 'director'
        `);

        // Asignar usuario para supervisores: primer_nombre.primer_apellido
        const sups = await pool.query(
            "SELECT id, nombre_completo FROM usuarios WHERE (usuario IS NULL OR usuario = '') AND rol = 'supervisor'"
        );
        for (const u of sups.rows) {
            const parts = (u.nombre_completo || '').trim().toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
            let base = parts.length >= 2 ? parts[0] + '.' + parts[1] : (parts[0] || 'supervisor');
            let uname = base, cnt = 2;
            while ((await pool.query('SELECT id FROM usuarios WHERE usuario = $1 AND id != $2', [uname, u.id])).rows.length > 0) {
                uname = base + cnt++;
            }
            await pool.query('UPDATE usuarios SET usuario = $1 WHERE id = $2', [uname, u.id]);
        }

        // Crear/verificar admin
        const adminR = await pool.query("SELECT id FROM usuarios WHERE rol = 'admin' LIMIT 1");
        if (adminR.rows.length === 0) {
            await pool.query("INSERT INTO usuarios (nombre_completo, rol, usuario, password, activo) VALUES ('Administrador', 'admin', 'admin', 'admin', true)");
        } else {
            await pool.query("UPDATE usuarios SET usuario = COALESCE(NULLIF(usuario,''), 'admin'), password = COALESCE(NULLIF(password,''), 'admin') WHERE rol = 'admin'");
        }
    } catch(e) {
        console.error('Error en runUserMigration:', e.message);
    }
}

async function applyMigrations() {
    try {
        await pool.query("ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS remitente_id INTEGER REFERENCES usuarios(id)");
    } catch (e) {
        // Ignorar
    }
    try {
        await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS usuario VARCHAR(100) UNIQUE");
        await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password TEXT");
    } catch (e) {
        // Ignorar
    }
    try {
        await pool.query("ALTER TABLE actividades ADD COLUMN IF NOT EXISTS fecha_inicio DATE");
        await pool.query("UPDATE actividades SET fecha_inicio = fecha_limite WHERE fecha_inicio IS NULL");
    } catch (e) {
        // Ignorar
    }
    try {
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS tipo VARCHAR(100)");
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS provincia VARCHAR(100)");
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS distrito VARCHAR(100)");
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS lugar VARCHAR(150)");
    } catch (e) {
        // Ignorar
    }
    try {
        await pool.query("ALTER TABLE actividades ADD COLUMN IF NOT EXISTS link_url TEXT");
        await pool.query("ALTER TABLE actividades ADD COLUMN IF NOT EXISTS niveles_aplicados TEXT");
    } catch (e) { /* Ignorar */ }
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS listas_ie (
                id SERIAL PRIMARY KEY,
                nombre TEXT NOT NULL,
                ie_ids TEXT NOT NULL,
                creador_id INTEGER REFERENCES usuarios(id),
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
    } catch (e) { /* Ignorar */ }
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cap_data (
                id INTEGER PRIMARY KEY DEFAULT 1,
                datos JSONB NOT NULL DEFAULT '[]',
                subido_por TEXT,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
    } catch (e) { /* Ignorar */ }
}

async function initDatabase() {
    // Si ya hay usuarios migrados, salir rápido
    try {
        const r = await pool.query("SELECT COUNT(*) as c FROM usuarios WHERE usuario IS NOT NULL AND usuario != ''");
        if (parseInt(r.rows[0].c) > 0) {
            await applyMigrations();
            return;
        }
    } catch(e) { /* tabla no existe aún */ }
    await db.exec(`
        CREATE TABLE IF NOT EXISTS instituciones_educativas (
            id SERIAL PRIMARY KEY,
            codigo VARCHAR(20) UNIQUE NOT NULL,
            nombre TEXT NOT NULL,
            ruralidad VARCHAR(20) DEFAULT 'URBANO',
            tiene_inicial BOOLEAN DEFAULT false,
            tiene_primaria BOOLEAN DEFAULT false,
            tiene_secundaria BOOLEAN DEFAULT false,
            tiene_otros BOOLEAN DEFAULT false,
            tipo_otros TEXT,
            cm_inicial VARCHAR(20),
            cm_primaria VARCHAR(20),
            cm_secundaria VARCHAR(20),
            tiene_ebe BOOLEAN DEFAULT false,
            tiene_cetpro BOOLEAN DEFAULT false,
            tiene_pronoei BOOLEAN DEFAULT false,
            tiene_eba BOOLEAN DEFAULT false,
            cm_ebe VARCHAR(20),
            cm_cetpro VARCHAR(20),
            cm_pronoei VARCHAR(20),
            cm_eba VARCHAR(20),
            tipo VARCHAR(100),
            provincia VARCHAR(100),
            distrito VARCHAR(100),
            lugar VARCHAR(150),
            activa BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            nombre_completo TEXT NOT NULL,
            dni VARCHAR(20),
            ie_codigo VARCHAR(20),
            rol VARCHAR(20) NOT NULL DEFAULT 'director',
            dependencia VARCHAR(50),
            puesto TEXT,
            email VARCHAR(150),
            telefono VARCHAR(20),
            foto TEXT,
            activo BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS tipos_actividad (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS actividades (
            id SERIAL PRIMARY KEY,
            titulo TEXT NOT NULL,
            descripcion TEXT,
            tipo_id INTEGER REFERENCES tipos_actividad(id),
            fecha_limite DATE NOT NULL,
            hora_limite TIME DEFAULT '23:59',
            estado VARCHAR(20) DEFAULT 'pendiente',
            asignador_id INTEGER REFERENCES usuarios(id),
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS asignaciones (
            id SERIAL PRIMARY KEY,
            actividad_id INTEGER REFERENCES actividades(id) ON DELETE CASCADE,
            ie_id INTEGER REFERENCES instituciones_educativas(id),
            director_id INTEGER REFERENCES usuarios(id),
            estado VARCHAR(20) DEFAULT 'pendiente',
            fecha_completado TIMESTAMP,
            notas_supervisor TEXT,
            niveles_aplicados TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS notificaciones (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER REFERENCES usuarios(id),
            titulo TEXT NOT NULL,
            mensaje TEXT,
            leida BOOLEAN DEFAULT false,
            tipo VARCHAR(50),
            created_at TIMESTAMP DEFAULT NOW()
        );
    `);

    await applyMigrations();

    try {
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS cm_inicial VARCHAR(20)");
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS cm_primaria VARCHAR(20)");
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS cm_secundaria VARCHAR(20)");
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS tiene_ebe BOOLEAN DEFAULT false");
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS tiene_cetpro BOOLEAN DEFAULT false");
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS tiene_pronoei BOOLEAN DEFAULT false");
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS tiene_eba BOOLEAN DEFAULT false");
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS cm_ebe VARCHAR(20)");
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS cm_cetpro VARCHAR(20)");
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS cm_pronoei VARCHAR(20)");
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS cm_eba VARCHAR(20)");
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS tiene_cuna_jardin BOOLEAN DEFAULT false");
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS cm_cuna_jardin VARCHAR(20)");
        await pool.query("ALTER TABLE asignaciones ADD COLUMN IF NOT EXISTS niveles_aplicados TEXT");
    } catch (e) {}

    // New dynamic niveles tables
    await pool.query(`
        CREATE TABLE IF NOT EXISTS niveles_educativos (
            id SERIAL PRIMARY KEY,
            nombre TEXT NOT NULL,
            clave VARCHAR(60) UNIQUE NOT NULL,
            color VARCHAR(40) DEFAULT 'bg-info-light',
            orden INTEGER DEFAULT 99,
            activo BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ie_niveles (
            id SERIAL PRIMARY KEY,
            ie_id INTEGER REFERENCES instituciones_educativas(id) ON DELETE CASCADE,
            nivel_id INTEGER REFERENCES niveles_educativos(id) ON DELETE CASCADE,
            codigo_modular VARCHAR(20),
            UNIQUE(ie_id, nivel_id)
        )
    `);

    // Seed default niveles if empty
    const nivelesCount = await pool.query('SELECT COUNT(*) as c FROM niveles_educativos');
    if (parseInt(nivelesCount.rows[0].c) === 0) {
        const defaults = [
            { nombre: 'Inicial - Jardín', clave: 'inicial', color: 'bg-info-light', orden: 1 },
            { nombre: 'Inicial - Cuna-Jardín', clave: 'cuna_jardin', color: 'bg-purple-light', orden: 2 },
            { nombre: 'Primaria', clave: 'primaria', color: 'bg-primary-light', orden: 3 },
            { nombre: 'Secundaria', clave: 'secundaria', color: 'bg-success-light', orden: 4 },
            { nombre: 'EBE', clave: 'ebe', color: 'bg-danger-light', orden: 5 },
            { nombre: 'CETPRO', clave: 'cetpro', color: 'bg-warning-light', orden: 6 },
            { nombre: 'PRONOEI', clave: 'pronoei', color: 'bg-neutral-light', orden: 7 },
            { nombre: 'EBA', clave: 'eba', color: 'bg-eba-light', orden: 8 },
        ];
        for (const n of defaults) {
            await pool.query('INSERT INTO niveles_educativos (nombre, clave, color, orden) VALUES ($1, $2, $3, $4) ON CONFLICT (clave) DO NOTHING', [n.nombre, n.clave, n.color, n.orden]);
        }
    }

    // Migrate existing IE nivel columns → ie_niveles (one-time, idempotent)
    const colToNivel = [
        { col: 'tiene_inicial', cmCol: 'cm_inicial', clave: 'inicial' },
        { col: 'tiene_cuna_jardin', cmCol: 'cm_cuna_jardin', clave: 'cuna_jardin' },
        { col: 'tiene_primaria', cmCol: 'cm_primaria', clave: 'primaria' },
        { col: 'tiene_secundaria', cmCol: 'cm_secundaria', clave: 'secundaria' },
        { col: 'tiene_ebe', cmCol: 'cm_ebe', clave: 'ebe' },
        { col: 'tiene_cetpro', cmCol: 'cm_cetpro', clave: 'cetpro' },
        { col: 'tiene_pronoei', cmCol: 'cm_pronoei', clave: 'pronoei' },
        { col: 'tiene_eba', cmCol: 'cm_eba', clave: 'eba' },
    ];
    for (const mapping of colToNivel) {
        const nv = await pool.query('SELECT id FROM niveles_educativos WHERE clave = $1', [mapping.clave]);
        if (nv.rows.length === 0) continue;
        const nivelId = nv.rows[0].id;
        try {
            await pool.query(`
                INSERT INTO ie_niveles (ie_id, nivel_id, codigo_modular)
                SELECT id, $1, ${mapping.cmCol}
                FROM instituciones_educativas
                WHERE ${mapping.col} = true AND activa = true
                ON CONFLICT (ie_id, nivel_id) DO NOTHING
            `, [nivelId]);
        } catch(e) { /* column may not exist */ }
    }

    const tipos = await db.prepare('SELECT COUNT(*) as c FROM tipos_actividad').get();
    if (tipos.c == 0) {
        const tiposList = ['Tarea', 'Documento', 'Reunión', 'Informe'];
        for (const t of tiposList) {
            await db.prepare('INSERT INTO tipos_actividad (nombre) VALUES (?)').run(t);
        }
    }
    const iesCount = await db.prepare('SELECT COUNT(*) as c FROM instituciones_educativas').get();
    if (iesCount.c === 0) {
        // ...
    }
    await seedDatabase(db);

    await runUserMigration();
}

// Middleware: asegurar que la BD esté lista antes de cada petición a /api
app.use('/api', async (req, res, next) => {
    try {
        await initDatabase();
        next();
    } catch (err) {
        console.error('DB init error en middleware:', err);
        res.status(500).json({ error: 'Error al inicializar la base de datos' });
    }
});

// También iniciar al arrancar (para entornos no-serverless)
initDatabase().catch(err => console.error('DB init error:', err));
syncPasswords().catch(err => console.error('syncPasswords error:', err));

// Endpoint para forzar migración manual (útil en Vercel después de deploy)
app.get('/api/migrate', async (req, res) => {
    try {
        await runUserMigration();
        const stats = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE usuario IS NOT NULL AND usuario != '') AS con_usuario,
                COUNT(*) FILTER (WHERE password IS NOT NULL AND password != '') AS con_password,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE rol='supervisor') AS supervisores,
                COUNT(*) FILTER (WHERE rol='director') AS directores
            FROM usuarios
        `);
        res.json({ ok: true, mensaje: 'Migración completada', stats: stats.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Endpoint para importar datos desde Excel (ejecutar en producción)
app.get('/api/import-excel', async (req, res) => {
    try {
        const xlsx = require('xlsx');
        const path = require('path');
        const fs = require('fs');

        const codigosPath = path.join(__dirname, 'codigos modulares.xlsx');
        const supPath = path.join(__dirname, 'DATA COLABORADORES- UGEL BELLAVISTA 2026.xlsx');

        if (!fs.existsSync(codigosPath) || !fs.existsSync(supPath)) {
            return res.status(404).json({ error: 'Faltan archivos Excel en el servidor' });
        }

        // 1. IMPORTAR CÓDIGOS MODULARES
        const cmWorkbook = xlsx.readFile(codigosPath);
        const dbIes = await pool.query('SELECT id, nombre, codigo FROM instituciones_educativas');
        
        function normalizeStr(str) {
            if (!str) return '';
            return str.toString()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '');
        }

        const ieMap = new Map();
        dbIes.rows.forEach(ie => {
            ieMap.set(normalizeStr(ie.nombre), ie);
            const match = ie.nombre.match(/^0*(\d+)/);
            if (match && match[1]) {
                ieMap.set(match[1], ie);
            }
        });

        const niveles = [
            { sheet: 'inical', col: 'cm_inicial' },
            { sheet: 'primaria', col: 'cm_primaria' },
            { sheet: 'secunadaria', col: 'cm_secundaria' }
        ];

        let cmUpdates = 0;
        let unmatched = [];

        for (const nivel of niveles) {
            if (!cmWorkbook.Sheets[nivel.sheet]) continue;
            const startRow = nivel.sheet === 'secunadaria' ? 2 : 1; 
            const rows = xlsx.utils.sheet_to_json(cmWorkbook.Sheets[nivel.sheet], { header: 1 });
            
            for (let i = startRow; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length < 9) continue;
                
                const codMod = (row[6] || '').toString().trim();
                const nombreIE = (row[8] || '').toString().trim();
                
                if (!codMod || !nombreIE) continue;

                const normName = normalizeStr(nombreIE);
                let matchedIE = ieMap.get(normName);
                if (!matchedIE) {
                    const matchNum = nombreIE.match(/^0*(\d+)/);
                    if (matchNum && matchNum[1]) {
                        matchedIE = ieMap.get(matchNum[1]);
                    }
                }
                
                if (matchedIE) {
                    await pool.query(`UPDATE instituciones_educativas SET ${nivel.col} = $1 WHERE id = $2`, [codMod, matchedIE.id]);
                    cmUpdates++;
                } else {
                    unmatched.push(nombreIE);
                }
            }
        }

        // 2. IMPORTAR SUPERVISORES
        const supWorkbook = xlsx.readFile(supPath);
        const sheetSup = supWorkbook.Sheets[supWorkbook.SheetNames[0]]; 
        const supRows = xlsx.utils.sheet_to_json(sheetSup, { header: 1 });
        
        let supCount = 0;
        for (let i = 2; i < supRows.length; i++) {
            const row = supRows[i];
            if (!row || !row[1] || row[1].toString().trim().toLowerCase() !== 'bellavista') continue;
            
            const nombre = (row[3] || '').toString().trim();
            const apellidos = (row[4] || '').toString().trim();
            const nombreCompleto = `${nombre} ${apellidos}`.trim();
            const dni = (row[5] || '').toString().trim();
            const dependencia = (row[8] || '').toString().trim();
            const puesto = (row[9] || '').toString().trim();
            const celular = (row[10] || '').toString().trim();
            const email = (row[11] || '').toString().trim();
            
            if (!nombre || !dni) continue;

            const parts = nombreCompleto.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
            
            let uname = 'supervisor';
            if (parts.length > 0) {
                const primerNombre = parts[0];
                const partsApellidos = apellidos.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
                const primerApellido = partsApellidos.length > 0 ? partsApellidos[0] : (parts.length > 1 ? parts[1] : 'sup');
                uname = `${primerNombre}.${primerApellido}`;
            }

            const existing = await pool.query("SELECT id FROM usuarios WHERE dni = $1 OR nombre_completo = $2", [dni, nombreCompleto]);
            
            if (existing.rows.length > 0) {
                const uId = existing.rows[0].id;
                let finalUname = uname;
                let c = 1;
                while ((await pool.query('SELECT id FROM usuarios WHERE usuario = $1 AND id != $2', [finalUname, uId])).rows.length > 0) {
                    finalUname = uname + (++c);
                }
                
                await pool.query(`
                    UPDATE usuarios 
                    SET nombre_completo = $1, dependencia = $2, puesto = $3, telefono = $4, email = $5, rol = 'supervisor', usuario = $6, password = $7
                    WHERE id = $8
                `, [nombreCompleto, dependencia, puesto, celular, email, finalUname, dni, uId]);
            } else {
                let finalUname = uname;
                let c = 1;
                while ((await pool.query('SELECT id FROM usuarios WHERE usuario = $1', [finalUname])).rows.length > 0) {
                    finalUname = uname + (++c);
                }

                await pool.query(`
                    INSERT INTO usuarios (nombre_completo, dni, rol, dependencia, puesto, telefono, email, usuario, password, activo)
                    VALUES ($1, $2, 'supervisor', $3, $4, $5, $6, $7, $8, true)
                `, [nombreCompleto, dni, dependencia, puesto, celular, email, finalUname, dni]);
            }
            supCount++;
        }

        res.json({ ok: true, mensaje: 'Importación Excel completada', cmUpdates, unMatchedCount: unmatched.length, supCount, sampleUnmatched: unmatched.slice(0, 10) });
    } catch (err) {
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

function normalizar(txt) {
    return String(txt || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function autoExpireAssignments() {
    try {
        const localStr = new Date().toLocaleString('sv', { timeZone: 'America/Lima' });
        const [localDate, localTime] = localStr.split(' ');
        await db.prepare(`
            UPDATE asignaciones
            SET estado = 'no_cumplida'
            WHERE id IN (
                SELECT ase.id
                FROM asignaciones ase
                INNER JOIN actividades a ON ase.actividad_id = a.id
                WHERE ase.estado = 'pendiente'
                  AND (a.fecha_limite < ?::date OR (a.fecha_limite = ?::date AND a.hora_limite < ?::time))
            )
        `).run(localDate, localDate, localTime);
    } catch (err) {
        console.error('Error auto-expiring assignments:', err);
    }
}

const NIVELES_VALIDOS = ['inicial', 'cuna_jardin', 'primaria', 'secundaria', 'ebe', 'cetpro', 'pronoei', 'eba', 'otros'];
function validarNivel(nivel) {
    if (!nivel) return '';
    return /^[a-z0-9_]{1,60}$/.test(nivel) ? nivel : '';
}

const authSupervisor = (req, res, next) => {
    if (!req.session.user || (req.session.user.rol !== 'supervisor' && req.session.user.rol !== 'admin' && req.session.user.usuario !== 'tony.fernandez')) {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    next();
};

const authAdmin = (req, res, next) => {
    if (!req.session.user || (req.session.user.rol !== 'admin' && req.session.user.usuario !== 'tony.fernandez')) {
        return res.status(403).json({ error: 'Acceso denegado (solo administradores)' });
    }
    next();
};

const authDirector = (req, res, next) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'No autenticado' });
    }
    next();
};

app.post('/api/login', async (req, res) => {
    try {
        const { usuario, password } = req.body;
        if (!usuario || !password) {
            return res.status(400).json({ error: 'Ingrese usuario y contraseña' });
        }

        const user = await db.prepare(
            "SELECT * FROM usuarios WHERE (usuario = ? OR dni = ? OR ie_codigo = ?) AND activo = true LIMIT 1"
        ).get(usuario, usuario, usuario);

        if (!user) {
            return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
        }

        if (user.rol === 'director' && !usuario.startsWith('director.')) {
            return res.status(403).json({ error: 'Los directores no pueden iniciar sesión aquí. Use el panel público.' });
        }

        if (user.password !== password) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }

        let ie = null;
        if (user.rol === 'director' && user.ie_codigo) {
            ie = await db.prepare(
                "SELECT * FROM instituciones_educativas WHERE codigo = ? AND activa = true"
            ).get(user.ie_codigo);
        }

        req.session.user = {
            id: user.id,
            nombre: user.nombre_completo,
            rol: (user.usuario === 'tony.fernandez') ? 'admin' : user.rol,
            usuario: user.usuario || null,
            ie_codigo: user.ie_codigo || null,
            ie_nombre: ie ? ie.nombre : null,
            ie_id: ie ? ie.id : null
        };

        req.session.save(() => res.json({ ok: true, user: req.session.user }));
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/check-session', (req, res) => {
    if (req.session.user) {
        res.json({ ok: true, user: req.session.user });
    } else {
        res.json({ ok: false });
    }
});

// GET all niveles
app.get('/api/niveles', async (req, res) => {
    try {
        const rows = await db.prepare('SELECT * FROM niveles_educativos ORDER BY orden, id').all();
        res.json(rows);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST create nivel (admin only)
app.post('/api/niveles', authAdmin, async (req, res) => {
    try {
        const { nombre, clave, color, orden } = req.body;
        if (!nombre || !clave) return res.status(400).json({ error: 'Nombre y clave son requeridos' });
        const claveClean = clave.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 60);
        const existing = await db.prepare('SELECT id FROM niveles_educativos WHERE clave = ?').get(claveClean);
        if (existing) return res.status(400).json({ error: `La clave "${claveClean}" ya existe` });
        const result = await db.prepare(
            'INSERT INTO niveles_educativos (nombre, clave, color, orden) VALUES (?, ?, ?, ?)'
        ).run(nombre.trim(), claveClean, color || 'bg-info-light', orden || 99);
        res.json({ ok: true, id: result.lastInsertRowid });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// PUT edit nivel (admin only)
app.put('/api/niveles/:id', authAdmin, async (req, res) => {
    try {
        const { nombre, color, orden } = req.body;
        if (!nombre) return res.status(400).json({ error: 'Nombre es requerido' });
        await db.prepare('UPDATE niveles_educativos SET nombre=?, color=?, orden=? WHERE id=?')
            .run(nombre.trim(), color || 'bg-info-light', orden || 99, req.params.id);
        res.json({ ok: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// DELETE nivel (admin only) — only if no IE uses it
app.delete('/api/niveles/:id', authAdmin, async (req, res) => {
    try {
        const usage = await db.prepare('SELECT COUNT(*) as c FROM ie_niveles WHERE nivel_id = ?').get(req.params.id);
        if (parseInt(usage.c) > 0) {
            return res.status(400).json({ error: `No se puede eliminar: ${usage.c} IE(s) tienen este nivel asignado` });
        }
        await db.prepare('DELETE FROM niveles_educativos WHERE id = ?').run(req.params.id);
        res.json({ ok: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/ies', async (req, res) => {
    try {
        const { nivel, buscar } = req.query;
        let whereExtra = '';
        const params = [];

        if (nivel) {
            const nivelClean = validarNivel(nivel);
            if (nivelClean) {
                whereExtra += ` AND EXISTS (SELECT 1 FROM ie_niveles iln2 JOIN niveles_educativos ne2 ON iln2.nivel_id = ne2.id WHERE iln2.ie_id = ie.id AND ne2.clave = '${nivelClean}')`;
            }
        }
        if (buscar) {
            whereExtra += ' AND (ie.nombre ILIKE ? OR ie.codigo ILIKE ? OR u.nombre_completo ILIKE ?)';
            const q = `%${buscar}%`;
            params.push(q, q, q);
        }

        const ies = await db.prepare(`
            SELECT ie.*,
                   u.id as director_id, u.nombre_completo as director_nombre,
                   u.email as director_email, u.telefono as director_telefono
            FROM instituciones_educativas ie
            LEFT JOIN usuarios u ON u.ie_codigo = ie.codigo AND u.rol = 'director' AND u.activo = true
            WHERE ie.activa = true ${whereExtra}
            ORDER BY ie.codigo
        `).all(...params);

        // Attach niveles to each IE
        const allIeNiveles = await db.prepare(`
            SELECT iln.ie_id, ne.id as nivel_id, ne.nombre, ne.clave, ne.color, ne.orden, iln.codigo_modular
            FROM ie_niveles iln
            JOIN niveles_educativos ne ON iln.nivel_id = ne.id
            WHERE ne.activo = true
            ORDER BY ne.orden
        `).all();

        const nivelMap = {};
        for (const n of allIeNiveles) {
            if (!nivelMap[n.ie_id]) nivelMap[n.ie_id] = [];
            nivelMap[n.ie_id].push({ nivel_id: n.nivel_id, nombre: n.nombre, clave: n.clave, color: n.color, orden: n.orden, codigo_modular: n.codigo_modular });
        }

        for (const ie of ies) {
            ie.niveles = nivelMap[ie.id] || [];
        }

        res.json(ies);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/ies/:id', async (req, res) => {
    try {
        const ie = await db.prepare(`
            SELECT ie.*, 
                   u.id as director_id, u.nombre_completo as director_nombre, 
                   u.email as director_email, u.telefono as director_telefono
            FROM instituciones_educativas ie
            LEFT JOIN usuarios u ON u.ie_codigo = ie.codigo AND u.rol = 'director' AND u.activo = true
            WHERE ie.id = ?
        `).get(req.params.id);
        if (!ie) return res.status(404).json({ error: 'IE no encontrada' });
        res.json(ie);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ies', authAdmin, async (req, res) => {
    try {
        const {
            codigo, nombre, tiene_inicial, tiene_cuna_jardin, tiene_primaria, tiene_secundaria, tiene_otros, tipo_otros,
            tiene_ebe, tiene_cetpro, tiene_pronoei, tiene_eba,
            cm_inicial, cm_cuna_jardin, cm_primaria, cm_secundaria,
            cm_ebe, cm_cetpro, cm_pronoei, cm_eba,
            tipo, provincia, distrito, lugar,
            director_nombre, director_email, director_telefono
        } = req.body;

        if (!codigo || !nombre) {
            return res.status(400).json({ error: 'Código y nombre son requeridos' });
        }

        const existing = await db.prepare('SELECT id FROM instituciones_educativas WHERE codigo = ?').get(codigo);
        if (existing) {
            return res.status(400).json({ error: `El código "${codigo}" ya existe en la base de datos.` });
        }

        const result = await db.prepare(`
            INSERT INTO instituciones_educativas (
                codigo, nombre, tiene_inicial, tiene_cuna_jardin, tiene_primaria, tiene_secundaria, tiene_otros, tipo_otros,
                tiene_ebe, tiene_cetpro, tiene_pronoei, tiene_eba,
                cm_inicial, cm_cuna_jardin, cm_primaria, cm_secundaria,
                cm_ebe, cm_cetpro, cm_pronoei, cm_eba,
                tipo, provincia, distrito, lugar, activa
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true)
        `).run(
            codigo, nombre, tiene_inicial || false, tiene_cuna_jardin || false, tiene_primaria || false, tiene_secundaria || false, tiene_otros || false, tipo_otros || null,
            tiene_ebe || false, tiene_cetpro || false, tiene_pronoei || false, tiene_eba || false,
            cm_inicial || null, cm_cuna_jardin || null, cm_primaria || null, cm_secundaria || null,
            cm_ebe || null, cm_cetpro || null, cm_pronoei || null, cm_eba || null,
            tipo || null, provincia || null, distrito || null, lugar || null
        );
        
        const newIeId = result.lastInsertRowid;

        // Handle niveles array
        if (req.body.niveles && Array.isArray(req.body.niveles)) {
            await db.prepare('DELETE FROM ie_niveles WHERE ie_id = ?').run(newIeId);
            for (const nv of req.body.niveles) {
                if (!nv.nivel_id) continue;
                await pool.query(
                    'INSERT INTO ie_niveles (ie_id, nivel_id, codigo_modular) VALUES ($1, $2, $3) ON CONFLICT (ie_id, nivel_id) DO UPDATE SET codigo_modular = EXCLUDED.codigo_modular',
                    [newIeId, nv.nivel_id, nv.codigo_modular || null]
                );
            }
        }

        if (director_nombre) {
            const username = 'director.' + codigo;
            await pool.query(`
                INSERT INTO usuarios (
                    nombre_completo, ie_codigo, rol, usuario, password, email, telefono, activo
                ) VALUES ($1, $2, 'director', $3, $4, $5, $6, true)
                ON CONFLICT (usuario) DO UPDATE SET
                    nombre_completo = EXCLUDED.nombre_completo,
                    ie_codigo = EXCLUDED.ie_codigo,
                    email = EXCLUDED.email,
                    telefono = EXCLUDED.telefono,
                    activo = true
            `, [
                director_nombre, codigo, username, codigo,
                director_email || null, director_telefono || null
            ]);
        }

        res.json({ ok: true, id: newIeId });
    } catch (err) {
        console.error('Error al crear IE:', err);
        if (err.code === '23505') {
            return res.status(400).json({ error: `El código "${req.body.codigo}" ya existe. Use un código diferente.` });
        }
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/ies/:id', authAdmin, async (req, res) => {
    try {
        const {
            codigo, nombre, tiene_inicial, tiene_cuna_jardin, tiene_primaria, tiene_secundaria, tiene_otros, tipo_otros,
            tiene_ebe, tiene_cetpro, tiene_pronoei, tiene_eba,
            cm_inicial, cm_cuna_jardin, cm_primaria, cm_secundaria,
            cm_ebe, cm_cetpro, cm_pronoei, cm_eba,
            tipo, provincia, distrito, lugar,
            director_nombre, director_email, director_telefono
        } = req.body;

        const oldIe = await db.prepare('SELECT codigo FROM instituciones_educativas WHERE id = ?').get(req.params.id);

        await db.prepare(`
            UPDATE instituciones_educativas
            SET codigo=?, nombre=?, tiene_inicial=?, tiene_cuna_jardin=?, tiene_primaria=?, tiene_secundaria=?, tiene_otros=?, tipo_otros=?,
                tiene_ebe=?, tiene_cetpro=?, tiene_pronoei=?, tiene_eba=?,
                cm_inicial=?, cm_cuna_jardin=?, cm_primaria=?, cm_secundaria=?,
                cm_ebe=?, cm_cetpro=?, cm_pronoei=?, cm_eba=?,
                tipo=?, provincia=?, distrito=?, lugar=?
            WHERE id=?
        `).run(
            codigo, nombre, tiene_inicial || false, tiene_cuna_jardin || false, tiene_primaria || false, tiene_secundaria || false, tiene_otros || false, tipo_otros || null,
            tiene_ebe || false, tiene_cetpro || false, tiene_pronoei || false, tiene_eba || false,
            cm_inicial || null, cm_cuna_jardin || null, cm_primaria || null, cm_secundaria || null,
            cm_ebe || null, cm_cetpro || null, cm_pronoei || null, cm_eba || null,
            tipo || null, provincia || null, distrito || null, lugar || null,
            req.params.id
        );
        
        // Handle niveles array
        if (req.body.niveles && Array.isArray(req.body.niveles)) {
            const ieRow = await db.prepare('SELECT id FROM instituciones_educativas WHERE id = ?').get(req.params.id);
            if (ieRow) {
                await db.prepare('DELETE FROM ie_niveles WHERE ie_id = ?').run(ieRow.id);
                for (const nv of req.body.niveles) {
                    if (!nv.nivel_id) continue;
                    await pool.query(
                        'INSERT INTO ie_niveles (ie_id, nivel_id, codigo_modular) VALUES ($1, $2, $3) ON CONFLICT (ie_id, nivel_id) DO UPDATE SET codigo_modular = EXCLUDED.codigo_modular',
                        [ieRow.id, nv.nivel_id, nv.codigo_modular || null]
                    );
                }
            }
        }

        if (director_nombre) {
            const username = 'director.' + codigo;
            await pool.query(`
                INSERT INTO usuarios (
                    nombre_completo, ie_codigo, rol, usuario, password, email, telefono, activo
                ) VALUES ($1, $2, 'director', $3, $4, $5, $6, true)
                ON CONFLICT (usuario) DO UPDATE SET
                    nombre_completo = EXCLUDED.nombre_completo,
                    ie_codigo = EXCLUDED.ie_codigo,
                    email = EXCLUDED.email,
                    telefono = EXCLUDED.telefono,
                    activo = true
            `, [
                director_nombre, codigo, username, codigo,
                director_email || null, director_telefono || null
            ]);
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('Error al actualizar IE:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/ies/:id', authAdmin, async (req, res) => {
    try {
        await db.prepare('UPDATE instituciones_educativas SET activa = false WHERE id = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.get('/api/directores', authSupervisor, async (req, res) => {
    try {
        const directores = await db.prepare(`
            SELECT u.*, ie.nombre as ie_nombre, ie.codigo as ie_cod,
                (SELECT STRING_AGG(DISTINCT asignador.dependencia, ', ') FROM asignaciones ase2 INNER JOIN actividades a2 ON ase2.actividad_id = a2.id LEFT JOIN usuarios asignador ON a2.asignador_id = asignador.id WHERE ase2.director_id = u.id) as areas
            FROM usuarios u
            LEFT JOIN instituciones_educativas ie ON u.ie_codigo = ie.codigo
            WHERE u.rol = 'director' AND u.activo = true
            ORDER BY ie.codigo, u.nombre_completo
        `).all();
        res.json(directores);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/directores/:id', authSupervisor, async (req, res) => {
    try {
        const director = await db.prepare(`
            SELECT u.*, ie.nombre as ie_nombre, ie.codigo as ie_cod
            FROM usuarios u
            LEFT JOIN instituciones_educativas ie ON u.ie_codigo = ie.codigo
            WHERE u.id = ?
        `).get(req.params.id);
        if (!director) return res.status(404).json({ error: 'Director no encontrado' });
        res.json(director);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/directores/:id/historial', authSupervisor, async (req, res) => {
    try {
        const historial = await db.prepare(`
            SELECT a.titulo, a.fecha_limite, a.fecha_inicio, a.hora_limite, ase.estado, ase.notas_supervisor, 
                   ta.nombre as tipo_nombre, u.nombre_completo as asignador_nombre
            FROM asignaciones ase
            JOIN actividades a ON ase.actividad_id = a.id
            LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
            LEFT JOIN usuarios u ON a.asignador_id = u.id
            WHERE ase.director_id = ?
            ORDER BY a.fecha_limite DESC, a.hora_limite DESC
        `).all(req.params.id);
        res.json(historial);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/directores/:id', authSupervisor, async (req, res) => {
    try {
        const { nombre, nombre_completo, dni, ie_codigo, email, telefono } = req.body;
        const name = nombre_completo || nombre;
        await db.prepare(
            'UPDATE usuarios SET nombre_completo=?, dni=?, ie_codigo=?, email=?, telefono=? WHERE id=?'
        ).run(name, dni, ie_codigo, email, telefono, req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/directores/:id', authSupervisor, async (req, res) => {
    try {
        await db.prepare('UPDATE usuarios SET activo = false WHERE id = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/tipos-actividad', async (req, res) => {
    try {
        const tipos = await db.prepare('SELECT * FROM tipos_actividad ORDER BY id').all();
        res.json(tipos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/actividades', authSupervisor, async (req, res) => {
    try {
        const { titulo, descripcion, tipo_id, fecha_limite, hora_limite, ie_ids, ies, fecha_inicio, link_url, niveles_aplicados } = req.body;
        const hora = hora_limite || '23:59';
        const inicio = fecha_inicio || fecha_limite;
        const tituloUp = titulo ? titulo.toUpperCase() : titulo;

        const targetIes = ies || (ie_ids || []).map(id => ({ id, niveles: null }));

        if (targetIes && targetIes.length > 0) {
            const result = await db.prepare(
                'INSERT INTO actividades (titulo, descripcion, tipo_id, fecha_limite, hora_limite, asignador_id, fecha_inicio, link_url, niveles_aplicados) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id'
            ).run(tituloUp, descripcion, tipo_id || null, fecha_limite, hora, req.session.user.id, inicio, link_url || null, niveles_aplicados || null);
            const actividadId = result.lastInsertRowid;

            for (const ieData of targetIes) {
                const ieId = ieData.id;
                const nivelesAplicados = ieData.niveles ? ieData.niveles.join(',') : null;
                
                const ie = await db.prepare('SELECT * FROM instituciones_educativas WHERE id = ?').get(ieId);
                if (ie) {
                    let director = await db.prepare(
                        "SELECT id FROM usuarios WHERE ie_codigo = ? AND rol = 'director' AND activo = true LIMIT 1"
                    ).get(ie.codigo);

                    if (!director) {
                        const dirResult = await db.prepare(
                            "INSERT INTO usuarios (nombre_completo, ie_codigo, rol, usuario, password) VALUES (?, ?, 'director', ?, ?) RETURNING id"
                        ).run(ie.nombre, ie.codigo, 'director.' + ie.codigo, ie.codigo);
                        director = { id: dirResult.lastInsertRowid };
                    }

                    await db.prepare(
                        'INSERT INTO asignaciones (actividad_id, ie_id, director_id, niveles_aplicados) VALUES (?, ?, ?, ?)'
                    ).run(actividadId, ieId, director.id, nivelesAplicados);

                    await db.prepare(
                        'INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo) VALUES (?, ?, ?, ?)'
                    ).run(
                        director.id,
                        'Nueva actividad asignada',
                        `Se te asignó: ${titulo} - Fecha límite: ${fecha_limite}`,
                        'asignacion'
                    );
                }
            }
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('Error crear actividad:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/actividades', authDirector, async (req, res) => {
    try {
        await autoExpireAssignments();
        let actividades;
        const isSuperAdminAct = req.session.user.rol === 'admin' || req.session.user.usuario === 'tony.fernandez';
        if (req.session.user.rol === 'supervisor' || req.session.user.rol === 'admin') {
            const supFilter = (!isSuperAdminAct && req.session.user.rol === 'supervisor') ? 'WHERE a.asignador_id = ?' : '';
            const supParams = (!isSuperAdminAct && req.session.user.rol === 'supervisor') ? [req.session.user.id] : [];
            actividades = await db.prepare(`
                SELECT a.*, ta.nombre as tipo_nombre, u.nombre_completo as asignador_nombre,
                (SELECT COUNT(*) FROM asignaciones WHERE actividad_id = a.id) as total_asignaciones,
                (SELECT COUNT(*) FROM asignaciones WHERE actividad_id = a.id AND estado = 'completada') as completadas,
                (SELECT COUNT(*) FROM asignaciones WHERE actividad_id = a.id AND estado = 'no_cumplida') as no_cumplidas
                FROM actividades a
                LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
                LEFT JOIN usuarios u ON a.asignador_id = u.id
                ${supFilter}
                ORDER BY a.fecha_limite ASC
            `).all(...supParams);
        } else {
            actividades = await db.prepare(`
                SELECT a.*, ta.nombre as tipo_nombre, ase.estado as asignacion_estado,
                ase.fecha_completado, ase.notas_supervisor, ase.niveles_aplicados,
                u.nombre_completo as asignador_nombre,
                ie.cm_inicial, ie.cm_primaria, ie.cm_secundaria
                FROM actividades a
                LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
                LEFT JOIN usuarios u ON a.asignador_id = u.id
                INNER JOIN asignaciones ase ON a.id = ase.actividad_id
                WHERE ase.director_id = ?
                ORDER BY a.fecha_limite ASC
            `).all(req.session.user.id);
        }
        res.json(actividades);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/actividades/:id', authDirector, async (req, res) => {
    try {
        await autoExpireAssignments();
        const act = await db.prepare(`
            SELECT a.*, ta.nombre as tipo_nombre, u.nombre_completo as asignador_nombre
            FROM actividades a
            LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
            LEFT JOIN usuarios u ON a.asignador_id = u.id
            WHERE a.id = ?
        `).get(req.params.id);
        if (!act) return res.status(404).json({ error: 'Actividad no encontrada' });

        const asignaciones = await db.prepare(`
            SELECT ase.*, ie.nombre as ie_nombre, ie.codigo as ie_codigo,
                   u.nombre_completo as director_nombre
            FROM asignaciones ase
            LEFT JOIN instituciones_educativas ie ON ase.ie_id = ie.id
            LEFT JOIN usuarios u ON ase.director_id = u.id
            WHERE ase.actividad_id = ?
            ORDER BY ie.codigo
        `).all(req.params.id);

        res.json({ ...act, asignaciones });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/actividades/:id', authSupervisor, async (req, res) => {
    try {
        const { titulo, descripcion, tipo_id, fecha_limite, hora_limite, fecha_inicio, link_url, niveles_aplicados } = req.body;
        const hora = hora_limite || '23:59';
        const inicio = fecha_inicio || fecha_limite;
        const tituloUp = titulo ? titulo.toUpperCase() : titulo;
        await db.prepare(
            'UPDATE actividades SET titulo=?, descripcion=?, tipo_id=?, fecha_limite=?, hora_limite=?, fecha_inicio=?, link_url=?, niveles_aplicados=? WHERE id=?'
        ).run(tituloUp, descripcion, tipo_id || null, fecha_limite, hora, inicio, link_url || null, niveles_aplicados || null, req.params.id);

        const localStr = new Date().toLocaleString('sv', { timeZone: 'America/Lima' });
        const [localDate, localTime] = localStr.split(' ');
        const isFuture = (fecha_limite > localDate) || (fecha_limite === localDate && hora > localTime);
        if (isFuture) {
            await db.prepare(`
                UPDATE asignaciones
                SET estado = 'pendiente', fecha_completado = NULL
                WHERE actividad_id = ? AND estado = 'no_cumplida'
            `).run(req.params.id);
        }

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/asignaciones/:id', authDirector, async (req, res) => {
    try {
        const asignacion = await db.prepare(`
            SELECT ase.*, a.titulo as actividad_titulo, a.fecha_limite, a.fecha_inicio, a.descripcion as actividad_descripcion, a.hora_limite, a.link_url,
                   ta.nombre as tipo_nombre,
                   ie.nombre as ie_nombre, ie.codigo as ie_codigo,
                   u.nombre_completo as director_nombre,
                   asignador.nombre_completo as asignador_nombre, asignador.dependencia as area, asignador.puesto as subarea
            FROM asignaciones ase
            LEFT JOIN actividades a ON ase.actividad_id = a.id
            LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
            LEFT JOIN instituciones_educativas ie ON ase.ie_id = ie.id
            LEFT JOIN usuarios u ON ase.director_id = u.id
            LEFT JOIN usuarios asignador ON a.asignador_id = asignador.id
            WHERE ase.id = ?
        `).get(req.params.id);

        if (!asignacion) {
            return res.status(404).json({ error: 'Asignación no encontrada' });
        }

        res.json(asignacion);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/asignaciones/:id/estado', authSupervisor, async (req, res) => {
    try {
        const { estado, notas_supervisor } = req.body;
        const fecha = estado === 'completada' ? new Date().toISOString() : null;
        await db.prepare(
            'UPDATE asignaciones SET estado=?, notas_supervisor=?, fecha_completado=? WHERE id=?'
        ).run(estado, notas_supervisor || null, fecha, req.params.id);

        const asig = await db.prepare('SELECT * FROM asignaciones WHERE id = ?').get(req.params.id);
        if (asig && asig.director_id) {
            const act = await db.prepare('SELECT titulo FROM actividades WHERE id = ?').get(asig.actividad_id);
            const mensaje = estado === 'completada'
                ? `Tu actividad "${act?.titulo}" fue marcada como completada`
                : `Tu actividad "${act?.titulo}" fue marcada como no cumplida`;

            await db.prepare(
                'INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo) VALUES (?, ?, ?, ?)'
            ).run(asig.director_id, `Actividad ${estado}`, mensaje, 'estado');
        }

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/actividades/:id', authSupervisor, async (req, res) => {
    try {
        await db.prepare('DELETE FROM actividades WHERE id = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/actividades/bulk-delete', authSupervisor, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'No se especificaron IDs para eliminar' });
        }
        for (const id of ids) {
            await db.prepare('DELETE FROM actividades WHERE id = ?').run(id);
        }
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/asignaciones', async (req, res) => {
    try {
        await autoExpireAssignments();
        const { ie_codigo } = req.query;

        if (ie_codigo) {
            // Acceso público para una escuela específica por su código modular
            const asignaciones = await db.prepare(`
                SELECT ase.*, a.titulo as actividad_titulo, a.fecha_limite, a.fecha_inicio, a.descripcion as actividad_descripcion, a.hora_limite, a.link_url,
                       ta.nombre as tipo_nombre,
                       ie.nombre as ie_nombre, ie.codigo as ie_codigo, ie.cm_inicial, ie.cm_primaria, ie.cm_secundaria,
                       u.nombre_completo as director_nombre,
                       asignador.nombre_completo as asignador_nombre, asignador.dependencia as area, asignador.puesto as subarea, asignador.telefono as asignador_telefono
                FROM asignaciones ase
                LEFT JOIN actividades a ON ase.actividad_id = a.id
                LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
                LEFT JOIN instituciones_educativas ie ON ase.ie_id = ie.id
                LEFT JOIN usuarios u ON ase.director_id = u.id
                LEFT JOIN usuarios asignador ON a.asignador_id = asignador.id
                WHERE ie.codigo = ?
                ORDER BY a.fecha_limite ASC
            `).all(ie_codigo);
            return res.json(asignaciones);
        }

        // Si no se especifica ie_codigo, requerir autenticación
        if (!req.session.user) {
            return res.status(403).json({ error: 'No autenticado' });
        }

        const nivel = validarNivel(req.query.nivel || '');
        const { estado, buscar, asignador_id, mes, anio } = req.query;
        const nivelWhere = nivel ? `AND EXISTS (SELECT 1 FROM ie_niveles iln_f JOIN niveles_educativos ne_f ON iln_f.nivel_id = ne_f.id WHERE iln_f.ie_id = ie.id AND ne_f.clave = '${nivel}')` : '';
        const estadoWhere = estado ? 'AND ase.estado = ?' : '';
        const buscarWhere = buscar ? 'AND (ie.nombre ILIKE ? OR ie.codigo ILIKE ? OR a.titulo ILIKE ?)' : '';
        const asignadorWhere = asignador_id ? 'AND a.asignador_id = ?' : '';
        const mesWhere = mes ? 'AND EXTRACT(MONTH FROM a.fecha_limite) = ?' : '';
        const anioWhere = anio ? 'AND EXTRACT(YEAR FROM a.fecha_limite) = ?' : '';
        const params = [];
        if (estado) params.push(estado);
        if (buscar) { const q = `%${buscar}%`; params.push(q, q, q); }
        if (asignador_id) params.push(asignador_id);
        if (mes) params.push(parseInt(mes));
        if (anio) params.push(parseInt(anio));
        const isSuperAdmin = req.session.user.rol === 'admin' || req.session.user.usuario === 'tony.fernandez';
        let asignaciones;
        if (req.session.user.rol === 'supervisor' || req.session.user.rol === 'admin') {
            // Supervisors only see activities THEY created, unless super-admin
            const supervisorWhere = (!isSuperAdmin && req.session.user.rol === 'supervisor') ? 'AND a.asignador_id = ?' : '';
            if (!isSuperAdmin && req.session.user.rol === 'supervisor') params.push(req.session.user.id);
            asignaciones = await db.prepare(`
                SELECT ase.*, a.titulo as actividad_titulo, a.fecha_limite, a.fecha_inicio, a.descripcion as actividad_descripcion, a.hora_limite, a.link_url,
                       ta.nombre as tipo_nombre,
                       ie.nombre as ie_nombre, ie.codigo as ie_codigo, ie.cm_inicial, ie.cm_primaria, ie.cm_secundaria,
                       u.nombre_completo as director_nombre,
                       asignador.nombre_completo as asignador_nombre, asignador.dependencia as area, asignador.puesto as subarea, asignador.telefono as asignador_telefono
                FROM asignaciones ase
                LEFT JOIN actividades a ON ase.actividad_id = a.id
                LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
                LEFT JOIN instituciones_educativas ie ON ase.ie_id = ie.id
                LEFT JOIN usuarios u ON ase.director_id = u.id
                LEFT JOIN usuarios asignador ON a.asignador_id = asignador.id
                WHERE 1=1 ${nivelWhere} ${estadoWhere} ${buscarWhere} ${asignadorWhere} ${supervisorWhere} ${mesWhere} ${anioWhere}
                ORDER BY a.fecha_limite ASC
            `).all(...params);
        } else {
            asignaciones = await db.prepare(`
                SELECT ase.*, a.titulo as actividad_titulo, a.fecha_limite, a.fecha_inicio, a.descripcion as actividad_descripcion, a.hora_limite, a.link_url,
                       ta.nombre as tipo_nombre,
                       ie.nombre as ie_nombre, ie.codigo as ie_codigo, ie.cm_inicial, ie.cm_primaria, ie.cm_secundaria,
                       asignador.nombre_completo as asignador_nombre, asignador.dependencia as area, asignador.puesto as subarea, asignador.telefono as asignador_telefono
                FROM asignaciones ase
                LEFT JOIN actividades a ON ase.actividad_id = a.id
                LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
                LEFT JOIN instituciones_educativas ie ON ase.ie_id = ie.id
                LEFT JOIN usuarios asignador ON a.asignador_id = asignador.id
                WHERE ase.director_id = ? ${nivelWhere}
                ORDER BY a.fecha_limite ASC
            `).all(req.session.user.id);
        }
        res.json(asignaciones);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/dashboard', authDirector, async (req, res) => {
    try {
        await autoExpireAssignments();
        const nivel = validarNivel(req.query.nivel || '');
        const estado = req.query.estado || '';

        function buildWhere(extra) {
            let w = 'WHERE 1=1';
            if (nivel) w += ` AND EXISTS (SELECT 1 FROM ie_niveles iln_f JOIN niveles_educativos ne_f ON iln_f.nivel_id = ne_f.id WHERE iln_f.ie_id = ie.id AND ne_f.clave = '${nivel}')`;
            if (estado) w += ' AND ase.estado = ?';
            if (extra) w += ' ' + extra;
            return w;
        }
        function buildParams(extra) {
            const p = [];
            if (estado) p.push(estado);
            if (extra) p.push(...extra);
            return p;
        }

        if (req.session.user.rol === 'supervisor' || req.session.user.rol === 'admin') {
            const baseJoin = 'FROM asignaciones ase INNER JOIN instituciones_educativas ie ON ase.ie_id = ie.id';
            const total = await db.prepare(`SELECT COUNT(*) as c ${baseJoin} ${buildWhere()}`).get(...buildParams());
            const completadas = await db.prepare(`SELECT COUNT(*) as c ${baseJoin} ${buildWhere("AND ase.estado = 'completada'")}`).get(...buildParams());
            const pendientes = await db.prepare(`SELECT COUNT(*) as c ${baseJoin} ${buildWhere("AND ase.estado IN ('pendiente', 'inconclusa')")}`).get(...buildParams());
            const no_cumplidas = await db.prepare(`SELECT COUNT(*) as c ${baseJoin} ${buildWhere("AND ase.estado = 'no_cumplida'")}`).get(...buildParams());

            const hoy = new Date().toISOString().split('T')[0];
            const vencidas = await db.prepare(`
                SELECT COUNT(*) as c ${baseJoin}
                INNER JOIN actividades a ON ase.actividad_id = a.id
                ${buildWhere("AND ase.estado = 'pendiente' AND a.fecha_limite < ?")}
            `).get(...buildParams([hoy]));

            const por_ie = await db.prepare(`
                SELECT ie.codigo, ie.nombre,
                    COUNT(*) as total,
                    COUNT(CASE WHEN ase.estado = 'completada' THEN 1 END) as completadas,
                    COUNT(CASE WHEN ase.estado IN ('pendiente', 'inconclusa') THEN 1 END) as pendientes,
                    COUNT(CASE WHEN ase.estado = 'no_cumplida' THEN 1 END) as no_cumplidas
                ${baseJoin} ${buildWhere()}
                GROUP BY ie.id, ie.codigo, ie.nombre
                HAVING COUNT(*) > 0
                ORDER BY COUNT(CASE WHEN ase.estado = 'no_cumplida' THEN 1 END) DESC
                LIMIT 10
            `).all(...buildParams());

            const recientes = await db.prepare(`
                SELECT a.*, ta.nombre as tipo_nombre, ase.estado as asignacion_estado,
                       ie.nombre as ie_nombre, ie.codigo as ie_codigo
                ${baseJoin}
                LEFT JOIN actividades a ON ase.actividad_id = a.id
                LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
                ${buildWhere()}
                ORDER BY a.created_at DESC LIMIT 10
            `).all(...buildParams());

            const nivelIeWhere = nivel ? `AND EXISTS (SELECT 1 FROM ie_niveles iln_f JOIN niveles_educativos ne_f ON iln_f.nivel_id = ne_f.id WHERE iln_f.ie_id = instituciones_educativas.id AND ne_f.clave = '${nivel}')` : '';
            const total_ies = await db.prepare(`SELECT COUNT(*) as c FROM instituciones_educativas WHERE activa = true ${nivelIeWhere}`).get();
            const total_directores = await db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE rol = 'director' AND activo = true").get();

            const directores_por_area = await db.prepare(`
                SELECT asignador.dependencia as area,
                       d.id, d.nombre_completo, d.ie_codigo,
                       ie.nombre as ie_nombre
                FROM usuarios d
                INNER JOIN asignaciones ase ON d.id = ase.director_id
                LEFT JOIN actividades a ON ase.actividad_id = a.id
                LEFT JOIN usuarios asignador ON a.asignador_id = asignador.id
                LEFT JOIN instituciones_educativas ie ON d.ie_codigo = ie.codigo
                WHERE d.rol = 'director' AND d.activo = true
                GROUP BY asignador.dependencia, d.id, d.nombre_completo, d.ie_codigo, ie.nombre
                ORDER BY asignador.dependencia, d.nombre_completo
            `).all();

            const ranking_ies = await db.prepare(`
                SELECT ie.codigo, ie.nombre,
                    COUNT(*) as total,
                    COUNT(CASE WHEN ase.estado = 'completada' THEN 1 END) as completadas,
                    COUNT(CASE WHEN ase.estado IN ('pendiente', 'inconclusa') THEN 1 END) as pendientes,
                    COUNT(CASE WHEN ase.estado = 'no_cumplida' THEN 1 END) as no_cumplidas
                ${baseJoin} ${buildWhere()}
                GROUP BY ie.id, ie.codigo, ie.nombre
                HAVING COUNT(*) > 0
                ORDER BY COUNT(CASE WHEN ase.estado = 'completada' THEN 1 END) DESC, COUNT(CASE WHEN ase.estado = 'no_cumplida' THEN 1 END) ASC
                LIMIT 15
            `).all(...buildParams());

            res.json({
                total: total.c,
                completadas: completadas.c,
                pendientes: pendientes.c,
                no_cumplidas: no_cumplidas.c,
                vencidas: vencidas.c,
                porcentaje_cumplimiento: total.c > 0 ? Math.round((completadas.c / total.c) * 100) : 0,
                por_ie,
                ranking_ies,
                recientes,
                total_ies: total_ies.c,
                total_directores: total_directores.c,
                directores_por_area
            });
        } else {
            const userId = req.session.user.id;
            const nivelExistsOnAseId = nivel ? `AND EXISTS (SELECT 1 FROM ie_niveles iln_f JOIN niveles_educativos ne_f ON iln_f.nivel_id = ne_f.id WHERE iln_f.ie_id = ase.ie_id AND ne_f.clave = '${nivel}')` : '';
            const nivelJoin = '';
            const nivelWhere = nivelExistsOnAseId;
            const fromDir = `FROM asignaciones ase WHERE ase.director_id = ? ${nivelWhere}`;

            const total = await db.prepare(`SELECT COUNT(*) as c ${fromDir}`).get(userId);
            const completadas = await db.prepare(`SELECT COUNT(*) as c ${fromDir} AND ase.estado = 'completada'`).get(userId);
            const pendientes = await db.prepare(`SELECT COUNT(*) as c ${fromDir} AND ase.estado IN ('pendiente', 'inconclusa')`).get(userId);
            const no_cumplidas = await db.prepare(`SELECT COUNT(*) as c ${fromDir} AND ase.estado = 'no_cumplida'`).get(userId);

            const hoy = new Date().toISOString().split('T')[0];
            const vencidas = await db.prepare(`
                SELECT COUNT(*) as c FROM asignaciones ase
                INNER JOIN actividades a ON ase.actividad_id = a.id
                ${nivelJoin}
                WHERE ase.director_id = ? AND ase.estado = 'pendiente' AND a.fecha_limite < ? ${nivelWhere}
            `).get(userId, hoy);

            const recientes = await db.prepare(`
                SELECT a.*, ta.nombre as tipo_nombre, ase.estado as asignacion_estado,
                ase.fecha_completado, ase.notas_supervisor,
                asignador.nombre_completo as asignador_nombre, asignador.dependencia as area, asignador.puesto as subarea
                FROM actividades a
                LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
                INNER JOIN asignaciones ase ON a.id = ase.actividad_id
                LEFT JOIN usuarios asignador ON a.asignador_id = asignador.id
                WHERE ase.director_id = ?
                ORDER BY a.fecha_limite ASC
                LIMIT 10
            `).all(userId);

            const por_area = await db.prepare(`
                SELECT asignador.dependencia as area,
                    COUNT(*) as total,
                    COUNT(CASE WHEN ase.estado = 'completada' THEN 1 END) as completadas,
                    COUNT(CASE WHEN ase.estado IN ('pendiente', 'inconclusa') THEN 1 END) as pendientes,
                    COUNT(CASE WHEN ase.estado = 'no_cumplida' THEN 1 END) as no_cumplidas
                FROM asignaciones ase
                INNER JOIN actividades a ON ase.actividad_id = a.id
                LEFT JOIN usuarios asignador ON a.asignador_id = asignador.id
                WHERE ase.director_id = ?
                GROUP BY asignador.dependencia
                ORDER BY asignador.dependencia
            `).all(userId);

            res.json({
                total: total.c,
                completadas: completadas.c,
                pendientes: pendientes.c,
                no_cumplidas: no_cumplidas.c,
                vencidas: vencidas.c,
                porcentaje_cumplimiento: total.c > 0 ? Math.round((completadas.c / total.c) * 100) : 0,
                recientes,
                por_area
            });
        }
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/notificaciones', authDirector, async (req, res) => {
    try {
        const notifs = await db.prepare(`
            SELECT n.*, u.nombre_completo as remitente_nombre
            FROM notificaciones n
            LEFT JOIN usuarios u ON n.remitente_id = u.id
            WHERE n.usuario_id = ?
            ORDER BY n.created_at DESC LIMIT 50
        `).all(req.session.user.id);
        res.json(notifs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/notificaciones/no-leidas', authDirector, async (req, res) => {
    try {
        const result = await db.prepare(
            "SELECT COUNT(*) as c FROM notificaciones WHERE usuario_id = ? AND leida = false"
        ).get(req.session.user.id);
        res.json({ count: result.c });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notificaciones/marcar-leidas', authDirector, async (req, res) => {
    try {
        await db.prepare(
            'UPDATE notificaciones SET leida = true WHERE usuario_id = ? AND leida = false'
        ).run(req.session.user.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/notificaciones', authSupervisor, async (req, res) => {
    try {
        const { usuario_id, titulo, mensaje, tipo } = req.body;
        const result = await db.prepare(
            'INSERT INTO notificaciones (usuario_id, remitente_id, titulo, mensaje, tipo) VALUES (?, ?, ?, ?, ?) RETURNING id'
        ).run(usuario_id, req.session.user.id, titulo, mensaje, tipo || 'manual');
        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/responder', authDirector, async (req, res) => {
    try {
        const { actividad_id, mensaje } = req.body;
        if (!actividad_id || !mensaje) return res.status(400).json({ error: 'Faltan datos' });
        const actividad = await db.prepare(
            'SELECT asignador_id, titulo FROM actividades WHERE id = ?'
        ).get(actividad_id);
        if (!actividad || !actividad.asignador_id) return res.status(404).json({ error: 'Actividad no encontrada' });
        await db.prepare(
            'INSERT INTO notificaciones (usuario_id, remitente_id, titulo, mensaje, tipo) VALUES (?, ?, ?, ?, ?)'
        ).run(actividad.asignador_id, req.session.user.id, 'Respuesta: ' + actividad.titulo, mensaje, 'respuesta');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/perfil', authDirector, async (req, res) => {
    try {
        const user = await db.prepare(`
            SELECT u.*, ie.nombre as ie_nombre, ie.codigo as ie_cod
            FROM usuarios u
            LEFT JOIN instituciones_educativas ie ON u.ie_codigo = ie.codigo
            WHERE u.id = ?
        `).get(req.session.user.id);
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/perfil', authDirector, async (req, res) => {
    try {
        const { nombre, email, telefono, dni, dependencia, puesto, password } = req.body;
        const updates = [];
        const params = [];
        if (nombre !== undefined) { updates.push('nombre_completo=?'); params.push(nombre); }
        if (email !== undefined) { updates.push('email=?'); params.push(email); }
        if (telefono !== undefined) { updates.push('telefono=?'); params.push(telefono || null); }
        if (dni !== undefined) { updates.push('dni=?'); params.push(dni || null); }
        if (dependencia !== undefined) { updates.push('dependencia=?'); params.push(dependencia); }
        if (puesto !== undefined) { updates.push('puesto=?'); params.push(puesto); }
        if (password !== undefined && password !== '') { updates.push('password=?'); params.push(password); }
        if (updates.length > 0) {
            params.push(req.session.user.id);
            await db.prepare(`UPDATE usuarios SET ${updates.join(',')} WHERE id=?`).run(...params);
            if (nombre) req.session.user.nombre = nombre;
        }
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoints de Administración (para rol admin)
app.get('/api/admin/users', authAdmin, async (req, res) => {
    try {
        const users = await db.prepare("SELECT id, nombre_completo, dni, ie_codigo, rol, dependencia, puesto, email, telefono, activo, usuario FROM usuarios WHERE rol != 'director' ORDER BY rol, nombre_completo").all();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/users/:id/password', authAdmin, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ error: 'La contraseña es requerida' });
        }
        await db.prepare("UPDATE usuarios SET password = ? WHERE id = ?").run(password, req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/users', authAdmin, async (req, res) => {
    try {
        const { nombre_completo, dni, rol, dependencia, puesto, email, telefono, password, usuario } = req.body;
        if (!nombre_completo) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }
        const result = await db.prepare(
            "INSERT INTO usuarios (nombre_completo, dni, rol, dependencia, puesto, email, telefono, activo) VALUES (?, ?, ?, ?, ?, ?, ?, true) RETURNING id"
        ).run(nombre_completo, dni || null, rol || 'supervisor', dependencia || null, puesto || null, email || null, telefono || null);
        const newId = result.lastInsertRowid;
        const setPass = password || dni || '12345678';
        await db.prepare("UPDATE usuarios SET password = ? WHERE id = ?").run(setPass, newId);
        if (usuario) {
            await db.prepare("UPDATE usuarios SET usuario = ? WHERE id = ?").run(usuario, newId);
        }
        res.json({ ok: true, id: newId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/users/:id', authAdmin, async (req, res) => {
    try {
        const fields = [];
        const values = [];
        const { nombre_completo, dni, dependencia, puesto, email, telefono, activo } = req.body;
        if (nombre_completo !== undefined) { fields.push('nombre_completo'); values.push(nombre_completo); }
        if (dni !== undefined) { fields.push('dni'); values.push(dni); }
        if (dependencia !== undefined) { fields.push('dependencia'); values.push(dependencia); }
        if (puesto !== undefined) { fields.push('puesto'); values.push(puesto); }
        if (email !== undefined) { fields.push('email'); values.push(email); }
        if (telefono !== undefined) { fields.push('telefono'); values.push(telefono); }
        if (activo !== undefined) { fields.push('activo'); values.push(activo); }
        if (fields.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });
        const setClause = fields.map((f, i) => `${f} = $${i+1}`).join(', ');
        values.push(req.params.id);
        await pool.query(`UPDATE usuarios SET ${setClause} WHERE id = $${values.length}`, values);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/impersonate', authAdmin, async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'ID de usuario es requerido' });
        }
        const targetUser = await db.prepare("SELECT * FROM usuarios WHERE id = ? AND activo = true").get(userId);
        if (!targetUser) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        let ie = null;
        if (targetUser.rol === 'director' && targetUser.ie_codigo) {
            ie = await db.prepare(
                "SELECT * FROM instituciones_educativas WHERE codigo = ? AND activa = true"
            ).get(targetUser.ie_codigo);
        }
        
        req.session.user = {
            id: targetUser.id,
            nombre: targetUser.nombre_completo,
            rol: targetUser.rol,
            usuario: targetUser.usuario || null,
            ie_codigo: targetUser.ie_codigo || null,
            ie_nombre: ie ? ie.nombre : null,
            ie_id: ie ? ie.id : null,
            impersonated: true
        };
        req.session.save(() => res.json({ ok: true, user: req.session.user }));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.get('/api/seed', async (req, res) => {
    try {
        const result = await seedDatabase(db);
        res.json({ ok: true, msg: 'Datos cargados exitosamente', ies: result.ies });
    } catch (err) {
        console.error('Seed error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/status', async (req, res) => {
    try {
        const ies = await db.prepare('SELECT COUNT(*) as c FROM instituciones_educativas').get();
        const supervis = await db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE rol = 'supervisor'").get();
        const direct = await db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE rol = 'director'").get();
        res.json({
            db_conectada: true,
            instituciones_educativas: ies.c,
            supervisores: supervis.c,
            directores: direct.c,
            seed_necesario: ies.c === 0
        });
    } catch (err) {
        res.json({ db_conectada: false, error: err.message });
    }
});

app.get('/api/force-seed', async (req, res) => {
    try {
        await seedDatabase(db);
        res.json({ ok: true, message: 'Base de datos inicializada y seedeada correctamente.' });
    } catch (err) {
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

// ===================== LISTAS IE =====================
app.get('/api/listas-ie', authSupervisor, async (req, res) => {
    try {
        const rows = await db.prepare('SELECT * FROM listas_ie ORDER BY nombre').all();
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/listas-ie', authSupervisor, async (req, res) => {
    try {
        const { nombre, ie_ids } = req.body;
        if (!nombre || !ie_ids || !Array.isArray(ie_ids) || ie_ids.length === 0) {
            return res.status(400).json({ error: 'Nombre y lista de IEs son requeridos' });
        }
        const result = await db.prepare(
            'INSERT INTO listas_ie (nombre, ie_ids, creador_id) VALUES (?, ?, ?)'
        ).run(nombre.trim(), JSON.stringify(ie_ids), req.session.user.id);
        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/listas-ie/:id', authSupervisor, async (req, res) => {
    try {
        await db.prepare('DELETE FROM listas_ie WHERE id = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===================== DASHBOARD STATS =====================
app.get('/api/dashboard/stats', authDirector, async (req, res) => {
    try {
        const { nivel, zona, tipo } = req.query;
        // Build extra WHERE conditions for filters
        let extraWhere = '';
        if (nivel) {
            const safeNivel = nivel.replace(/[^a-z0-9_]/gi, '');
            extraWhere += ` AND EXISTS (SELECT 1 FROM ie_niveles iln_f JOIN niveles_educativos ne_f ON iln_f.nivel_id = ne_f.id WHERE iln_f.ie_id = ie.id AND ne_f.clave = '${safeNivel}')`;
        }
        if (zona) {
            const safeZona = zona.replace(/['"\\;]/g, '');
            extraWhere += ` AND ie.ruralidad = '${safeZona}'`;
        }
        if (tipo) {
            const safeTipo = tipo.replace(/['"\\;]/g, '');
            extraWhere += ` AND ie.tipo = '${safeTipo}'`;
        }

        // Locales: IEs sin contar PRONOEI (cada código local = 1 IE)
        const total_inst = await pool.query(`
            SELECT COUNT(DISTINCT ie.codigo) as c FROM instituciones_educativas ie WHERE ie.activa = true${extraWhere}
            AND NOT EXISTS (
                SELECT 1 FROM ie_niveles iln2 JOIN niveles_educativos ne2 ON iln2.nivel_id = ne2.id
                WHERE iln2.ie_id = ie.id AND ne2.clave = 'pronoei'
                AND NOT EXISTS (
                    SELECT 1 FROM ie_niveles iln3 JOIN niveles_educativos ne3 ON iln3.nivel_id = ne3.id
                    WHERE iln3.ie_id = ie.id AND ne3.clave != 'pronoei'
                )
            )
        `);
        // Servicios: códigos modulares excluyendo PRONOEI
        const total_serv = await pool.query(`
            SELECT COUNT(*) as c FROM ie_niveles iln
            JOIN instituciones_educativas ie ON iln.ie_id = ie.id
            JOIN niveles_educativos ne ON iln.nivel_id = ne.id
            WHERE ie.activa = true AND ne.clave != 'pronoei'${extraWhere}
        `);
        // PRONOEI separado
        const total_pronoei = await pool.query(`
            SELECT COUNT(*) as c FROM ie_niveles iln
            JOIN instituciones_educativas ie ON iln.ie_id = ie.id
            JOIN niveles_educativos ne ON iln.nivel_id = ne.id
            WHERE ie.activa = true AND ne.clave = 'pronoei'${extraWhere}
        `);
        const por_zona = await pool.query(`
            SELECT COALESCE(ruralidad, 'URBANO') as zona, COUNT(DISTINCT codigo) as total
            FROM instituciones_educativas ie WHERE activa = true${extraWhere}
            AND codigo NOT IN (
                SELECT DISTINCT ie2.codigo FROM instituciones_educativas ie2
                JOIN ie_niveles iln2 ON iln2.ie_id = ie2.id
                JOIN niveles_educativos ne2 ON iln2.nivel_id = ne2.id
                WHERE ne2.clave = 'pronoei'
                AND NOT EXISTS (
                    SELECT 1 FROM ie_niveles iln3 JOIN niveles_educativos ne3 ON iln3.nivel_id = ne3.id
                    WHERE iln3.ie_id = ie2.id AND ne3.clave != 'pronoei'
                )
            )
            GROUP BY ruralidad ORDER BY ruralidad
        `);
        const por_tipo = await pool.query(`
            SELECT COALESCE(tipo, 'NO APLICA') as tipo, COUNT(DISTINCT codigo) as total
            FROM instituciones_educativas ie WHERE activa = true${extraWhere}
            GROUP BY tipo ORDER BY tipo
        `);
        const zonaMap = {};
        por_zona.rows.forEach(r => { zonaMap[r.zona] = parseInt(r.total); });
        const tipoMap = {};
        por_tipo.rows.forEach(r => { tipoMap[r.tipo] = parseInt(r.total); });
        res.json({
            total_instituciones: parseInt(total_inst.rows[0].c),
            total_servicios: parseInt(total_serv.rows[0].c),
            total_pronoei: parseInt(total_pronoei.rows[0].c),
            por_zona: zonaMap,
            por_tipo: tipoMap
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===================== CONSOLIDADO =====================
app.get('/api/consolidado', authDirector, async (req, res) => {
    try {
        const { mes, anio, buscar } = req.query;
        const user = req.session.user;
        const params = [];
        let where = 'WHERE 1=1';

        // All authenticated users see all activities in Consolidado
        if (mes) {
            where += ' AND EXTRACT(MONTH FROM a.fecha_limite) = $' + (params.length + 1);
            params.push(parseInt(mes));
        }
        if (anio) {
            where += ' AND EXTRACT(YEAR FROM a.fecha_limite) = $' + (params.length + 1);
            params.push(parseInt(anio));
        }
        if (buscar) {
            where += ' AND a.titulo ILIKE $' + (params.length + 1);
            params.push('%' + buscar + '%');
        }

        const rows = await pool.query(`
            SELECT a.id, a.titulo, a.descripcion, a.fecha_limite, a.link_url,
                   u.nombre_completo as asignador_nombre,
                   COUNT(ase.id) as total,
                   COUNT(CASE WHEN ase.estado='completada' THEN 1 END) as completadas,
                   COUNT(CASE WHEN ase.estado='inconclusa' THEN 1 END) as inconclusas,
                   COUNT(CASE WHEN ase.estado='no_cumplida' THEN 1 END) as no_cumplidas,
                   COUNT(CASE WHEN ase.estado='pendiente' THEN 1 END) as pendientes
            FROM actividades a
            LEFT JOIN asignaciones ase ON ase.actividad_id = a.id
            LEFT JOIN usuarios u ON a.asignador_id = u.id
            ${where}
            GROUP BY a.id, a.titulo, a.descripcion, a.fecha_limite, a.link_url, u.nombre_completo
            ORDER BY a.fecha_limite DESC
        `, params);

        res.json(rows.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/consolidado/:actividadId', authDirector, async (req, res) => {
    try {
        const { actividadId } = req.params;
        const { buscar, estado } = req.query;
        const params = [parseInt(actividadId)];
        let where = 'WHERE ase.actividad_id = $1';
        if (estado) {
            where += ' AND ase.estado = $' + (params.length + 1);
            params.push(estado);
        }
        if (buscar) {
            where += ' AND (ie.nombre ILIKE $' + (params.length + 1) + ' OR ie.codigo ILIKE $' + (params.length + 2) + ')';
            const p = '%' + buscar + '%';
            params.push(p, p);
        }
        const rows = await pool.query(`
            SELECT ase.id, ase.estado, ase.fecha_completado, ase.notas_supervisor,
                   ie.nombre as ie_nombre, ie.codigo as ie_codigo,
                   u.nombre_completo as director_nombre,
                   STRING_AGG(DISTINCT ne.nombre, ', ' ORDER BY ne.nombre) as nivel_nombre
            FROM asignaciones ase
            JOIN instituciones_educativas ie ON ase.ie_id = ie.id
            LEFT JOIN usuarios u ON ase.director_id = u.id
            LEFT JOIN ie_niveles iln ON iln.ie_id = ie.id
            LEFT JOIN niveles_educativos ne ON iln.nivel_id = ne.id
            ${where}
            GROUP BY ase.id, ase.estado, ase.fecha_completado, ase.notas_supervisor,
                     ie.nombre, ie.codigo, u.nombre_completo
            ORDER BY ie.nombre
        `, params);
        res.json(rows.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/export/consolidado/:actividadId', authDirector, async (req, res) => {
    try {
        const { actividadId } = req.params;
        // Get activity info
        const actRes = await pool.query('SELECT titulo, fecha_limite FROM actividades WHERE id = $1', [parseInt(actividadId)]);
        const act = actRes.rows[0] || { titulo: 'Actividad', fecha_limite: null };

        const rows = await pool.query(`
            SELECT ase.estado, ase.fecha_completado, ase.notas_supervisor,
                   ie.nombre as ie_nombre, ie.codigo as ie_codigo,
                   u.nombre_completo as director_nombre,
                   STRING_AGG(DISTINCT ne.nombre, ', ' ORDER BY ne.nombre) as nivel_nombre
            FROM asignaciones ase
            JOIN instituciones_educativas ie ON ase.ie_id = ie.id
            LEFT JOIN usuarios u ON ase.director_id = u.id
            LEFT JOIN ie_niveles iln ON iln.ie_id = ie.id
            LEFT JOIN niveles_educativos ne ON iln.nivel_id = ne.id
            WHERE ase.actividad_id = $1
            GROUP BY ase.estado, ase.fecha_completado, ase.notas_supervisor,
                     ie.nombre, ie.codigo, u.nombre_completo
            ORDER BY ie.nombre
        `, [parseInt(actividadId)]);

        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        wb.creator = 'UGEL Bellavista';
        wb.created = new Date();
        const ws = wb.addWorksheet('Consolidado');

        ws.columns = [
            { header: '#', key: 'num', width: 5 },
            { header: 'CÓDIGO LOCAL', key: 'codigo', width: 14 },
            { header: 'INSTITUCIÓN EDUCATIVA', key: 'nombre', width: 44 },
            { header: 'DIRECTOR', key: 'director', width: 28 },
            { header: 'NIVEL(ES)', key: 'nivel', width: 24 },
            { header: 'ESTADO', key: 'estado', width: 16 },
            { header: 'FECHA COMPLETADO', key: 'fecha', width: 20 },
            { header: 'NOTAS', key: 'notas', width: 36 },
        ];

        const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
        const headerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };
        const thinBorder = { style: 'thin', color: { argb: 'FFDDDDDD' } };
        const cellBorder = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

        const hRow = ws.getRow(1);
        hRow.height = 30;
        ws.columns.forEach((col, i) => {
            const cell = hRow.getCell(i + 1);
            cell.value = col.header;
            cell.fill = headerFill;
            cell.font = headerFont;
            cell.alignment = headerAlign;
            cell.border = cellBorder;
        });

        const estadoStyles = {
            completada: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }, font: { color: { argb: 'FF2E7D32' }, bold: true, name: 'Calibri', size: 10 } },
            pendiente:  { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } }, font: { color: { argb: 'FFE65100' }, bold: true, name: 'Calibri', size: 10 } },
            inconclusa: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0B2' } }, font: { color: { argb: 'FFF57C00' }, bold: true, name: 'Calibri', size: 10 } },
            no_cumplida:{ fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } }, font: { color: { argb: 'FFC62828' }, bold: true, name: 'Calibri', size: 10 } }
        };

        rows.rows.forEach((r, i) => {
            const rowNum = i + 2;
            const row = ws.getRow(rowNum);
            const bg = rowNum % 2 === 0 ? 'FFF8F9FF' : 'FFFFFFFF';
            row.values = [
                i + 1, r.ie_codigo, r.ie_nombre, r.director_nombre || '',
                r.nivel_nombre || '', r.estado,
                r.fecha_completado ? new Date(r.fecha_completado).toLocaleDateString('es-PE') : '',
                r.notas_supervisor || ''
            ];
            row.height = 20;
            row.eachCell({ includeEmpty: true }, (cell, ci) => {
                cell.border = cellBorder;
                cell.alignment = { vertical: 'middle', wrapText: true };
                if (ci === 6 && estadoStyles[r.estado]) {
                    cell.fill = estadoStyles[r.estado].fill;
                    cell.font = estadoStyles[r.estado].font;
                } else {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
                    cell.font = { name: 'Calibri', size: 10 };
                }
            });
        });

        ws.views = [{ state: 'frozen', ySplit: 1 }];
        const safeTitle = (act.titulo || 'consolidado').replace(/[^a-z0-9]/gi, '_').substring(0, 30);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="consolidado_${safeTitle}.xlsx"`);
        await wb.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Error export consolidado:', err);
        res.status(500).json({ error: err.message });
    }
});

// ===================== EXPORT CONSOLIDADO GLOBAL =====================
app.get('/api/export/consolidado-global', authDirector, async (req, res) => {
    try {
        const { fecha_inicio, fecha_fin, mes, anio } = req.query;
        let where = 'WHERE 1=1';
        const params = [];
        if (fecha_inicio) { params.push(fecha_inicio); where += ` AND a.fecha_limite >= $${params.length}`; }
        if (fecha_fin) { params.push(fecha_fin); where += ` AND a.fecha_limite <= $${params.length}`; }
        if (mes && anio) { params.push(parseInt(mes), parseInt(anio)); where += ` AND EXTRACT(MONTH FROM a.fecha_limite) = $${params.length-1} AND EXTRACT(YEAR FROM a.fecha_limite) = $${params.length}`; }
        const isAdmin = req.session.user.rol === 'admin' || req.session.user.usuario === 'tony.fernandez';
        if (!isAdmin && req.session.user.rol === 'supervisor') {
            params.push(req.session.user.id);
            where += ` AND a.asignador_id = $${params.length}`;
        }
        const rows = await pool.query(`
            SELECT a.titulo, a.fecha_limite, a.descripcion,
                   ie.codigo as ie_codigo, ie.nombre as ie_nombre,
                   u.nombre_completo as director,
                   ase.estado, ase.fecha_completado, ase.notas_supervisor
            FROM actividades a
            JOIN asignaciones ase ON ase.actividad_id = a.id
            JOIN instituciones_educativas ie ON ase.ie_id = ie.id
            LEFT JOIN usuarios u ON ase.director_id = u.id
            ${where}
            ORDER BY a.fecha_limite DESC, ie.nombre
        `, params);
        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        wb.creator = 'UGEL Bellavista';
        const ws = wb.addWorksheet('Consolidado');
        ws.columns = [
            { header: '#', key: 'num', width: 5 },
            { header: 'ACTIVIDAD', key: 'actividad', width: 40 },
            { header: 'FECHA LÍMITE', key: 'fecha', width: 14 },
            { header: 'IE CÓDIGO', key: 'codigo', width: 12 },
            { header: 'INSTITUCIÓN EDUCATIVA', key: 'ie', width: 42 },
            { header: 'DIRECTOR', key: 'director', width: 30 },
            { header: 'ESTADO', key: 'estado', width: 14 },
            { header: 'FECHA COMPLETADO', key: 'fecha_comp', width: 18 },
            { header: 'NOTAS', key: 'notas', width: 40 },
        ];
        const hFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        const hFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
        const border = { style: 'thin', color: { argb: 'FFDDDDDD' } };
        const cellBorder = { top: border, left: border, bottom: border, right: border };
        const hRow = ws.getRow(1); hRow.height = 28;
        ws.columns.forEach((col, i) => {
            const c = hRow.getCell(i+1);
            c.value = col.header; c.fill = hFill; c.font = hFont;
            c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = cellBorder;
        });
        const estadoColors = { completada: 'FF16a34a', inconclusa: 'FFf97316', no_cumplida: 'FFdc2626', pendiente: 'FF64748b' };
        rows.rows.forEach((row, i) => {
            const r = ws.addRow([
                i+1, row.titulo,
                row.fecha_limite ? new Date(row.fecha_limite).toLocaleDateString('es-PE') : '',
                row.ie_codigo, row.ie_nombre, row.director || '',
                (row.estado || 'pendiente').replace('_',' ').toUpperCase(),
                row.fecha_completado ? new Date(row.fecha_completado).toLocaleDateString('es-PE') : '',
                row.notas_supervisor || ''
            ]);
            const bg = i % 2 === 0 ? 'FFF8F9FF' : 'FFFFFFFF';
            r.eachCell({ includeEmpty: true }, cell => {
                cell.border = cellBorder;
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
                cell.alignment = { vertical: 'middle', wrapText: true };
                cell.font = { name: 'Calibri', size: 10 };
            });
            const estadoCell = r.getCell(7);
            const color = estadoColors[row.estado] || 'FF64748b';
            estadoCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: color } };
        });
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="consolidado_actividades.xlsx"');
        await wb.xlsx.write(res);
        res.end();
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ===================== EXPORT CONSOLIDADO POR IE =====================
app.get('/api/export/consolidado-ie', authDirector, async (req, res) => {
    try {
        const { ie_codigo, fecha_inicio, fecha_fin } = req.query;
        if (!ie_codigo) return res.status(400).json({ error: 'ie_codigo requerido' });
        const params = [ie_codigo];
        let where = 'WHERE ie.codigo = $1';
        if (fecha_inicio) { params.push(fecha_inicio); where += ` AND a.fecha_limite >= $${params.length}`; }
        if (fecha_fin) { params.push(fecha_fin); where += ` AND a.fecha_limite <= $${params.length}`; }
        const rows = await pool.query(`
            SELECT a.titulo, a.fecha_limite, a.descripcion, a.link_url,
                   ie.codigo as ie_codigo, ie.nombre as ie_nombre,
                   u.nombre_completo as director,
                   ase.estado, ase.fecha_completado, ase.notas_supervisor
            FROM actividades a
            JOIN asignaciones ase ON ase.actividad_id = a.id
            JOIN instituciones_educativas ie ON ase.ie_id = ie.id
            LEFT JOIN usuarios u ON ase.director_id = u.id
            ${where}
            ORDER BY a.fecha_limite DESC
        `, params);
        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        wb.creator = 'UGEL Bellavista';
        const ieName = rows.rows[0]?.ie_nombre || ie_codigo;
        const ws = wb.addWorksheet('Reporte IE');
        ws.columns = [
            { header: '#', key: 'num', width: 5 },
            { header: 'ACTIVIDAD', key: 'actividad', width: 42 },
            { header: 'DESCRIPCIÓN', key: 'desc', width: 40 },
            { header: 'FECHA LÍMITE', key: 'fecha', width: 14 },
            { header: 'ESTADO', key: 'estado', width: 14 },
            { header: 'FECHA COMPLETADO', key: 'fecha_comp', width: 18 },
            { header: 'NOTAS', key: 'notas', width: 40 },
        ];
        const hFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        const hFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
        const border = { style: 'thin', color: { argb: 'FFDDDDDD' } };
        const cellBorder = { top: border, left: border, bottom: border, right: border };
        ws.mergeCells('A1:G1');
        const titleCell = ws.getCell('A1');
        titleCell.value = 'REPORTE DE ACTIVIDADES - ' + ieName.toUpperCase();
        titleCell.font = { bold: true, size: 13, name: 'Calibri', color: { argb: 'FF1e293b' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFe0e7ff' } };
        ws.getRow(1).height = 28;
        const hRow = ws.getRow(2); hRow.height = 26;
        ws.columns.forEach((col, i) => {
            const c = hRow.getCell(i+1);
            c.value = col.header; c.fill = hFill; c.font = hFont;
            c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = cellBorder;
        });
        const estadoColors = { completada: 'FF16a34a', inconclusa: 'FFf97316', no_cumplida: 'FFdc2626', pendiente: 'FF64748b' };
        rows.rows.forEach((row, i) => {
            const r = ws.addRow([
                i+1, row.titulo, row.descripcion || '',
                row.fecha_limite ? new Date(row.fecha_limite).toLocaleDateString('es-PE') : '',
                (row.estado || 'pendiente').replace('_',' ').toUpperCase(),
                row.fecha_completado ? new Date(row.fecha_completado).toLocaleDateString('es-PE') : '',
                row.notas_supervisor || ''
            ]);
            const bg = i % 2 === 0 ? 'FFF8F9FF' : 'FFFFFFFF';
            r.eachCell({ includeEmpty: true }, cell => {
                cell.border = cellBorder;
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
                cell.alignment = { vertical: 'middle', wrapText: true };
                cell.font = { name: 'Calibri', size: 10 };
            });
            const estadoCell = r.getCell(5);
            const color = estadoColors[row.estado] || 'FF64748b';
            estadoCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: color } };
        });
        ws.views = [{ state: 'frozen', ySplit: 2 }];
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="reporte_ie_${ie_codigo}.xlsx"`);
        await wb.xlsx.write(res);
        res.end();
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ===================== SUPERVISORES (para filtros) =====================
app.get('/api/supervisores', async (req, res) => {
    try {
        const lista = await db.prepare(
            "SELECT id, nombre_completo, dependencia FROM usuarios WHERE rol = 'supervisor' AND activo = true ORDER BY nombre_completo"
        ).all();
        res.json(lista);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================== CAP DATA =====================
app.get('/api/cap/data', authDirector, async (req, res) => {
    try {
        const r = await pool.query('SELECT datos, subido_por, updated_at FROM cap_data WHERE id = 1');
        if (r.rows.length === 0) return res.json({ datos: [], subido_por: null, updated_at: null });
        res.json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/cap/upload', authDirector, async (req, res) => {
    const user = req.session.user;
    if (user.rol !== 'admin' && user.usuario !== 'tony.fernandez') {
        return res.status(403).json({ error: 'Solo administradores pueden actualizar la DATA CAP' });
    }
    try {
        const { datos } = req.body;
        if (!Array.isArray(datos)) return res.status(400).json({ error: 'Datos inválidos' });
        await pool.query(`
            INSERT INTO cap_data (id, datos, subido_por, updated_at)
            VALUES (1, $1::jsonb, $2, NOW())
            ON CONFLICT (id) DO UPDATE SET datos = EXCLUDED.datos, subido_por = EXCLUDED.subido_por, updated_at = NOW()
        `, [JSON.stringify(datos), user.nombre_completo || user.usuario]);
        res.json({ ok: true, total: datos.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===================== EXPORT EXCEL =====================
app.get('/api/export/instituciones', authSupervisor, async (req, res) => {
    try {
        const { nivel, zona, tipo } = req.query;
        let extraWhere = '';
        if (nivel) {
            const safeNivel = nivel.replace(/[^a-z0-9_]/gi, '');
            extraWhere += ` AND EXISTS (SELECT 1 FROM ie_niveles iln_f JOIN niveles_educativos ne_f ON iln_f.nivel_id = ne_f.id WHERE iln_f.ie_id = ie.id AND ne_f.clave = '${safeNivel}')`;
        }
        if (zona) {
            const safeZona = zona.replace(/['"\\;]/g, '');
            extraWhere += ` AND ie.ruralidad = '${safeZona}'`;
        }
        if (tipo) {
            const safeTipo = tipo.replace(/['"\\;]/g, '');
            extraWhere += ` AND ie.tipo = '${safeTipo}'`;
        }
        const ies = await pool.query(`
            SELECT ie.codigo, ie.nombre, ie.ruralidad, ie.tipo, ie.provincia, ie.distrito, ie.lugar,
                   ie.activa, u.nombre_completo as director, u.email as director_email, u.telefono as director_telefono
            FROM instituciones_educativas ie
            LEFT JOIN usuarios u ON u.ie_codigo = ie.codigo AND u.rol = 'director' AND u.activo = true
            WHERE ie.activa = true${extraWhere}
            ORDER BY ie.codigo
        `);
        const ieNiveles = await pool.query(`
            SELECT iln.ie_id, ne.nombre as nivel_nombre, ne.clave, iln.codigo_modular,
                   ie.codigo as ie_codigo
            FROM ie_niveles iln
            JOIN instituciones_educativas ie ON iln.ie_id = ie.id
            JOIN niveles_educativos ne ON iln.nivel_id = ne.id
            WHERE ie.activa = true
            ORDER BY ne.orden
        `);
        // Map niveles by ie_codigo
        const nivelesMap = {};
        for (const n of ieNiveles.rows) {
            if (!nivelesMap[n.ie_codigo]) nivelesMap[n.ie_codigo] = [];
            nivelesMap[n.ie_codigo].push({ nivel: n.nivel_nombre, cm: n.codigo_modular || '' });
        }

        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        wb.creator = 'UGEL Bellavista';
        wb.created = new Date();
        const ws = wb.addWorksheet('Instituciones Educativas');

        ws.columns = [
            { header: '#',                      key: 'num',       width: 5  },
            { header: 'CÓDIGO LOCAL',           key: 'codigo',    width: 14 },
            { header: 'INSTITUCIÓN EDUCATIVA',  key: 'nombre',    width: 44 },
            { header: 'NIVEL(ES)',              key: 'niveles',   width: 38 },
            { header: 'CÓDIGO(S) MODULAR(ES)',  key: 'cms',       width: 30 },
            { header: 'ZONA',                   key: 'ruralidad', width: 14 },
            { header: 'TIPO',                   key: 'tipo',      width: 24 },
            { header: 'PROVINCIA',              key: 'provincia', width: 16 },
            { header: 'DISTRITO',               key: 'distrito',  width: 16 },
            { header: 'LUGAR',                  key: 'lugar',     width: 20 },
            { header: 'DIRECTOR',               key: 'director',  width: 34 },
            { header: 'EMAIL',                  key: 'email',     width: 28 },
            { header: 'TELÉFONO',               key: 'telefono',  width: 16 },
        ];

        const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
        const headerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };
        const thinBorder = { style: 'thin', color: { argb: 'FFDDDDDD' } };
        const cellBorder = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

        const hRow = ws.getRow(1);
        hRow.height = 30;
        ws.columns.forEach((col, i) => {
            const cell = hRow.getCell(i + 1);
            cell.value = col.header;
            cell.fill = headerFill;
            cell.font = headerFont;
            cell.alignment = headerAlign;
            cell.border = cellBorder;
        });

        let rowNum = 2;
        for (let i = 0; i < ies.rows.length; i++) {
            const ie = ies.rows[i];
            const nivs = nivelesMap[ie.codigo] || [];
            const nivelesStr = nivs.map(n => n.nivel).join('\n');
            const cmsStr = nivs.map(n => n.cm || '-').join('\n');
            const row = ws.getRow(rowNum);
            row.values = [
                i + 1, ie.codigo, ie.nombre, nivelesStr, cmsStr,
                ie.ruralidad || '', ie.tipo || '', ie.provincia || '',
                ie.distrito || '', ie.lugar || '',
                ie.director || '', ie.director_email || '', ie.director_telefono || ''
            ];
            row.height = Math.max(16, nivs.length * 16);
            const bg = rowNum % 2 === 0 ? 'FFF8F9FF' : 'FFFFFFFF';
            row.eachCell({ includeEmpty: true }, cell => {
                cell.border = cellBorder;
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
                cell.alignment = { vertical: 'middle', wrapText: true };
                cell.font = { name: 'Calibri', size: 10 };
            });
            rowNum++;
        }

        // Freeze header
        ws.views = [{ state: 'frozen', ySplit: 1 }];

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="instituciones_educativas.xlsx"');
        await wb.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Error export IEs:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/export/asignaciones', async (req, res) => {
    try {
        const { nivel, estado, buscar, asignador_id, mes, anio } = req.query;
        const params = [];
        let where = 'WHERE 1=1';
        if (nivel && validarNivel(nivel)) {
            where += ` AND EXISTS (SELECT 1 FROM ie_niveles iln_f JOIN niveles_educativos ne_f ON iln_f.nivel_id = ne_f.id WHERE iln_f.ie_id = ie.id AND ne_f.clave = '${validarNivel(nivel)}')`;
        }
        if (estado) {
            where += ' AND ase.estado = ?';
            params.push(estado);
        }
        if (buscar) {
            where += ' AND (ie.nombre ILIKE ? OR ie.codigo ILIKE ? OR a.titulo ILIKE ?)';
            const p = '%' + buscar + '%';
            params.push(p, p, p);
        }
        if (asignador_id) {
            where += ' AND a.asignador_id = ?';
            params.push(asignador_id);
        }
        if (mes) {
            where += ' AND EXTRACT(MONTH FROM a.fecha_limite) = ?';
            params.push(parseInt(mes));
        }
        if (anio) {
            where += ' AND EXTRACT(YEAR FROM a.fecha_limite) = ?';
            params.push(parseInt(anio));
        }

        const rows = await db.prepare(`
            SELECT ase.estado,
                   a.titulo as actividad,
                   a.fecha_inicio,
                   a.fecha_limite,
                   a.descripcion,
                   ta.nombre as tipo,
                   ie.codigo as ie_codigo,
                   ie.nombre as ie_nombre,
                   u.nombre_completo as director,
                   u.dni as director_dni,
                   u.telefono as director_telefono,
                   asignador.nombre_completo as asignador,
                   asignador.dependencia as area
            FROM asignaciones ase
            LEFT JOIN actividades a ON ase.actividad_id = a.id
            LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
            LEFT JOIN instituciones_educativas ie ON ase.ie_id = ie.id
            LEFT JOIN usuarios u ON ase.director_id = u.id
            LEFT JOIN usuarios asignador ON a.asignador_id = asignador.id
            ${where}
            ORDER BY ie.nombre, a.fecha_limite
        `).all(...params);

        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        wb.creator = 'UGEL Bellavista';
        wb.created = new Date();
        const ws = wb.addWorksheet('Asignaciones');

        // Columnas
        ws.columns = [
            { header: '#', key: 'num', width: 5 },
            { header: 'IE CÓDIGO', key: 'ie_codigo', width: 14 },
            { header: 'INSTITUCIÓN EDUCATIVA', key: 'ie_nombre', width: 42 },
            { header: 'ACTIVIDAD', key: 'actividad', width: 38 },
            { header: 'TIPO', key: 'tipo', width: 16 },
            { header: 'FECHA INICIO', key: 'fecha_inicio', width: 16 },
            { header: 'FECHA LÍMITE', key: 'fecha_limite', width: 16 },
            { header: 'ESTADO', key: 'estado', width: 16 },
            { header: 'DIRECTOR', key: 'director', width: 32 },
            { header: 'DNI DIRECTOR', key: 'director_dni', width: 14 },
            { header: 'TELÉFONO', key: 'director_telefono', width: 16 },
            { header: 'ASIGNADO POR', key: 'asignador', width: 28 },
            { header: 'ÁREA', key: 'area', width: 20 },
            { header: 'DESCRIPCIÓN', key: 'descripcion', width: 48 }
        ];

        // Estilo header
        const headerStyle = {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B5E8A' } },
            font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' },
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
            border: {
                top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
            }
        };
        const headerRow = ws.getRow(1);
        headerRow.height = 32;
        ws.columns.forEach((col, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = col.header;
            Object.assign(cell, headerStyle);
        });

        // Datos
        const estadoStyles = {
            completada: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }, font: { color: { argb: 'FF2E7D32' }, bold: true } },
            pendiente: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } }, font: { color: { argb: 'FFE65100' }, bold: true } },
            inconclusa: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0B2' } }, font: { color: { argb: 'FFF57C00' }, bold: true } },
            no_cumplida: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } }, font: { color: { argb: 'FFC62828' }, bold: true } }
        };
        const dataStyle = {
            alignment: { vertical: 'middle', wrapText: true },
            border: {
                top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
            }
        };

        rows.forEach((r, i) => {
            const rowNum = i + 2;
            const row = ws.getRow(rowNum);
            row.height = 24;
            const vals = [
                i + 1, r.ie_codigo, r.ie_nombre, r.actividad, r.tipo,
                r.fecha_inicio ? new Date(r.fecha_inicio).toLocaleDateString('es-PE') : '',
                r.fecha_limite ? new Date(r.fecha_limite).toLocaleDateString('es-PE') : '',
                r.estado, r.director, r.director_dni, r.director_telefono,
                r.asignador, r.area, r.descripcion
            ];
            vals.forEach((v, ci) => {
                const cell = row.getCell(ci + 1);
                cell.value = v || '';
                Object.assign(cell, dataStyle);
            });
            // Color por estado
            const estadoCell = row.getCell(8);
            if (estadoStyles[r.estado]) {
                Object.assign(estadoCell, estadoStyles[r.estado]);
            }
        });

        // Auto-filtro
        ws.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: rows.length + 1, column: ws.columns.length }
        };

        // Freeze header
        ws.views = [{ state: 'frozen', ySplit: 1 }];

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="asignaciones_ugel.xlsx"');
        await wb.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Error exportando Excel:', err);
        res.status(500).json({ error: 'Error al exportar' });
    }
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Error no capturado:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    initDatabase().then(() => {
        app.listen(PORT, () => {
            console.log(`Servidor corriendo en http://localhost:${PORT}`);
        });
    }).catch(err => {
        console.error('Error al iniciar:', err);
        process.exit(1);
    });
}

module.exports = app;
