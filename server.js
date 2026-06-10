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
    cookie: { maxAge: 8 * 60 * 60 * 1000, secure: process.env.NODE_ENV === 'production' }
}));

let dbInitialized = false;

async function initDatabase() {
    if (dbInitialized) return;
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
            activa BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            nombre_completo TEXT NOT NULL,
            dni VARCHAR(20) UNIQUE,
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

    try {
        await pool.query("ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS remitente_id INTEGER REFERENCES usuarios(id)");
    } catch (e) {
        // Ignorar si hay error al añadir la columna
    }

    try {
        await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS usuario VARCHAR(100) UNIQUE");
        await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password TEXT");
    } catch (e) {
        // Ignorar si ya existen
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

    try {
        const users = await db.prepare("SELECT * FROM usuarios").all();
        for (const u of users) {
            let updated = false;
            let userVal = u.usuario;
            let passVal = u.password;
            
            if (!userVal) {
                if (u.rol === 'admin') {
                    userVal = 'admin';
                } else if (u.rol === 'supervisor') {
                    const parts = (u.nombre_completo || '').trim().toLowerCase()
                        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                        .replace(/[^a-z0-9\s]/g, '')
                        .split(/\s+/);
                    if (parts.length >= 2) {
                        userVal = parts[0] + '.' + parts[parts.length - 2];
                    } else {
                        userVal = parts[0] || 'supervisor';
                    }
                } else {
                    userVal = 'director.' + (u.ie_codigo || u.id);
                }
                updated = true;
            }
            
            if (!passVal || passVal === '12345678' || passVal === u.ie_codigo) {
                const targetPass = u.dni || u.ie_codigo || '12345678';
                if (passVal !== targetPass) {
                    passVal = targetPass;
                    updated = true;
                }
            }
            
            if (updated) {
                let uniqueUser = userVal;
                let count = 1;
                while (true) {
                    const check = await db.prepare("SELECT id FROM usuarios WHERE usuario = ? AND id != ?").get(uniqueUser, u.id);
                    if (!check) break;
                    uniqueUser = userVal + count;
                    count++;
                }
                await db.prepare("UPDATE usuarios SET usuario = ?, password = ? WHERE id = ?").run(uniqueUser, passVal, u.id);
            }
        }

        const adminCheck = await db.prepare("SELECT id FROM usuarios WHERE rol = 'admin'").get();
        if (!adminCheck) {
            await db.prepare("INSERT INTO usuarios (nombre_completo, rol, usuario, password, activo) VALUES (?, ?, ?, ?, true)").run('Administrador', 'admin', 'admin', 'admin');
            console.log('Usuario admin creado exitosamente.');
        }
    } catch (migrationErr) {
        console.error('Error en migración de usuarios:', migrationErr);
    }
    dbInitialized = true;
}

initDatabase().catch(err => console.error('DB init error:', err));

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

const NIVELES_VALIDOS = ['inicial', 'primaria', 'secundaria', 'otros'];
function validarNivel(nivel) {
    return NIVELES_VALIDOS.includes(nivel) ? nivel : '';
}

const authSupervisor = (req, res, next) => {
    if (!req.session.user || (req.session.user.rol !== 'supervisor' && req.session.user.rol !== 'admin')) {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    next();
};

const authAdmin = (req, res, next) => {
    if (!req.session.user || req.session.user.rol !== 'admin') {
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
            rol: user.rol,
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

app.get('/api/ies', async (req, res) => {
    try {
        const { ruralidad, nivel, buscar } = req.query;
        let sql = 'SELECT * FROM instituciones_educativas WHERE activa = true';
        const params = [];
        if (ruralidad) {
            sql += ' AND ruralidad = ?';
            params.push(ruralidad);
        }
        if (nivel) {
            const nv = (['inicial', 'primaria', 'secundaria', 'otros'].includes(nivel)) ? nivel : '';
            if (nv) {
                sql += ` AND tiene_${nv} = true`;
            }
        }
        if (buscar) {
            sql += ' AND (nombre ILIKE ? OR codigo ILIKE ?)';
            const q = `%${buscar}%`;
            params.push(q, q);
        }
        sql += ' ORDER BY codigo';
        const ies = await db.prepare(sql).all(...params);
        res.json(ies);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/ies/:id', async (req, res) => {
    try {
        const ie = await db.prepare('SELECT * FROM instituciones_educativas WHERE id = ?').get(req.params.id);
        if (!ie) return res.status(404).json({ error: 'IE no encontrada' });
        res.json(ie);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.post('/api/ies', authAdmin, async (req, res) => {
    try {
        const { codigo, nombre, ruralidad, tiene_inicial, tiene_primaria, tiene_secundaria, tiene_otros, tipo_otros } = req.body;
        if (!codigo || !nombre) {
            return res.status(400).json({ error: 'Código y nombre son requeridos' });
        }
        const result = await db.prepare(
            'INSERT INTO instituciones_educativas (codigo, nombre, ruralidad, tiene_inicial, tiene_primaria, tiene_secundaria, tiene_otros, tipo_otros, activa) VALUES (?, ?, ?, ?, ?, ?, ?, ?, true)'
        ).run(codigo, nombre, ruralidad || 'URBANO', tiene_inicial || false, tiene_primaria || false, tiene_secundaria || false, tiene_otros || false, tipo_otros || null);
        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/ies/:id', authAdmin, async (req, res) => {
    try {
        const { codigo, nombre, ruralidad, tiene_inicial, tiene_primaria, tiene_secundaria, tiene_otros, tipo_otros } = req.body;
        await db.prepare(
            'UPDATE instituciones_educativas SET codigo=?, nombre=?, ruralidad=?, tiene_inicial=?, tiene_primaria=?, tiene_secundaria=?, tiene_otros=?, tipo_otros=? WHERE id=?'
        ).run(codigo, nombre, ruralidad, tiene_inicial, tiene_primaria, tiene_secundaria, tiene_otros, tipo_otros, req.params.id);
        res.json({ ok: true });
    } catch (err) {
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
            SELECT u.*, ie.nombre as ie_nombre, ie.codigo as ie_cod, ie.ruralidad,
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
            SELECT u.*, ie.nombre as ie_nombre, ie.codigo as ie_cod, ie.ruralidad
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
            SELECT a.titulo, a.fecha_limite, a.hora_limite, ase.estado, ase.notas_supervisor, 
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
        const { titulo, descripcion, tipo_id, fecha_limite, hora_limite, ie_ids } = req.body;
        const hora = hora_limite || '23:59';

        if (ie_ids && ie_ids.length > 0) {
            for (const ieId of ie_ids) {
                const result = await db.prepare(
                    'INSERT INTO actividades (titulo, descripcion, tipo_id, fecha_limite, hora_limite, asignador_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
                ).run(titulo, descripcion, tipo_id, fecha_limite, hora, req.session.user.id);

                const actividadId = result.lastInsertRowid;

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
                        'INSERT INTO asignaciones (actividad_id, ie_id, director_id) VALUES (?, ?, ?)'
                    ).run(actividadId, ieId, director.id);

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
        if (req.session.user.rol === 'supervisor' || req.session.user.rol === 'admin') {
            actividades = await db.prepare(`
                SELECT a.*, ta.nombre as tipo_nombre, u.nombre_completo as asignador_nombre,
                (SELECT COUNT(*) FROM asignaciones WHERE actividad_id = a.id) as total_asignaciones,
                (SELECT COUNT(*) FROM asignaciones WHERE actividad_id = a.id AND estado = 'completada') as completadas,
                (SELECT COUNT(*) FROM asignaciones WHERE actividad_id = a.id AND estado = 'no_cumplida') as no_cumplidas
                FROM actividades a
                LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
                LEFT JOIN usuarios u ON a.asignador_id = u.id
                ORDER BY a.fecha_limite ASC
            `).all();
        } else {
            actividades = await db.prepare(`
                SELECT a.*, ta.nombre as tipo_nombre, ase.estado as asignacion_estado,
                ase.fecha_completado, ase.notas_supervisor,
                u.nombre_completo as asignador_nombre
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
            SELECT ase.*, ie.nombre as ie_nombre, ie.codigo as ie_codigo, ie.ruralidad,
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
        const { titulo, descripcion, tipo_id, fecha_limite, hora_limite } = req.body;
        const hora = hora_limite || '23:59';
        await db.prepare(
            'UPDATE actividades SET titulo=?, descripcion=?, tipo_id=?, fecha_limite=?, hora_limite=? WHERE id=?'
        ).run(titulo, descripcion, tipo_id, fecha_limite, hora, req.params.id);

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
            SELECT ase.*, a.titulo as actividad_titulo, a.fecha_limite, a.descripcion as actividad_descripcion, a.hora_limite,
                   ta.nombre as tipo_nombre,
                   ie.nombre as ie_nombre, ie.codigo as ie_codigo, ie.ruralidad,
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
                SELECT ase.*, a.titulo as actividad_titulo, a.fecha_limite, a.descripcion as actividad_descripcion,
                       ta.nombre as tipo_nombre,
                       ie.nombre as ie_nombre, ie.codigo as ie_codigo, ie.ruralidad,
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
        const { ruralidad, estado, buscar } = req.query;
        const nivelWhere = nivel ? `AND ie.tiene_${nivel} = true` : '';
        const ruralidadWhere = ruralidad ? 'AND ie.ruralidad = ?' : '';
        const estadoWhere = estado ? 'AND ase.estado = ?' : '';
        const buscarWhere = buscar ? 'AND (ie.nombre ILIKE ? OR ie.codigo ILIKE ? OR a.titulo ILIKE ?)' : '';
        const params = [];
        if (ruralidad) params.push(ruralidad);
        if (estado) params.push(estado);
        if (buscar) { const q = `%${buscar}%`; params.push(q, q, q); }
        let asignaciones;
        if (req.session.user.rol === 'supervisor' || req.session.user.rol === 'admin') {
            asignaciones = await db.prepare(`
                SELECT ase.*, a.titulo as actividad_titulo, a.fecha_limite, a.descripcion as actividad_descripcion,
                       ta.nombre as tipo_nombre,
                       ie.nombre as ie_nombre, ie.codigo as ie_codigo, ie.ruralidad,
                       u.nombre_completo as director_nombre,
                       asignador.nombre_completo as asignador_nombre, asignador.dependencia as area, asignador.puesto as subarea
                FROM asignaciones ase
                LEFT JOIN actividades a ON ase.actividad_id = a.id
                LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
                LEFT JOIN instituciones_educativas ie ON ase.ie_id = ie.id
                LEFT JOIN usuarios u ON ase.director_id = u.id
                LEFT JOIN usuarios asignador ON a.asignador_id = asignador.id
                WHERE 1=1 ${nivelWhere} ${ruralidadWhere} ${estadoWhere} ${buscarWhere}
                ORDER BY a.fecha_limite ASC
            `).all(...params);
        } else {
            asignaciones = await db.prepare(`
                SELECT ase.*, a.titulo as actividad_titulo, a.fecha_limite, a.descripcion as actividad_descripcion,
                       ta.nombre as tipo_nombre,
                       ie.nombre as ie_nombre, ie.codigo as ie_codigo,
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
        const ruralidad = req.query.ruralidad || '';
        const estado = req.query.estado || '';

        function buildWhere(extra) {
            let w = 'WHERE 1=1';
            if (nivel) w += ` AND ie.tiene_${nivel} = true`;
            if (ruralidad) w += ' AND ie.ruralidad = ?';
            if (estado) w += ' AND ase.estado = ?';
            if (extra) w += ' ' + extra;
            return w;
        }
        function buildParams(extra) {
            const p = [];
            if (ruralidad) p.push(ruralidad);
            if (estado) p.push(estado);
            if (extra) p.push(...extra);
            return p;
        }

        if (req.session.user.rol === 'supervisor' || req.session.user.rol === 'admin') {
            const baseJoin = 'FROM asignaciones ase INNER JOIN instituciones_educativas ie ON ase.ie_id = ie.id';
            const total = await db.prepare(`SELECT COUNT(*) as c ${baseJoin} ${buildWhere()}`).get(...buildParams());
            const completadas = await db.prepare(`SELECT COUNT(*) as c ${baseJoin} ${buildWhere("AND ase.estado = 'completada'")}`).get(...buildParams());
            const pendientes = await db.prepare(`SELECT COUNT(*) as c ${baseJoin} ${buildWhere("AND ase.estado = 'pendiente'")}`).get(...buildParams());
            const no_cumplidas = await db.prepare(`SELECT COUNT(*) as c ${baseJoin} ${buildWhere("AND ase.estado = 'no_cumplida'")}`).get(...buildParams());

            const hoy = new Date().toISOString().split('T')[0];
            const vencidas = await db.prepare(`
                SELECT COUNT(*) as c ${baseJoin}
                INNER JOIN actividades a ON ase.actividad_id = a.id
                ${buildWhere("AND ase.estado = 'pendiente' AND a.fecha_limite < ?")}
            `).get(...buildParams([hoy]));

            const por_ruralidad = await db.prepare(`
                SELECT ie.ruralidad,
                    COUNT(*) as total,
                    COUNT(CASE WHEN ase.estado = 'completada' THEN 1 END) as completadas,
                    COUNT(CASE WHEN ase.estado = 'pendiente' THEN 1 END) as pendientes,
                    COUNT(CASE WHEN ase.estado = 'no_cumplida' THEN 1 END) as no_cumplidas
                ${baseJoin} ${buildWhere()}
                GROUP BY ie.ruralidad ORDER BY ie.ruralidad
            `).all(...buildParams());

            const por_ie = await db.prepare(`
                SELECT ie.codigo, ie.nombre, ie.ruralidad,
                    COUNT(*) as total,
                    COUNT(CASE WHEN ase.estado = 'completada' THEN 1 END) as completadas,
                    COUNT(CASE WHEN ase.estado = 'pendiente' THEN 1 END) as pendientes,
                    COUNT(CASE WHEN ase.estado = 'no_cumplida' THEN 1 END) as no_cumplidas
                ${baseJoin} ${buildWhere()}
                GROUP BY ie.id, ie.codigo, ie.nombre, ie.ruralidad
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

            const nivelIeWhere = nivel ? `AND tiene_${nivel} = true` : '';
            const total_ies = await db.prepare(`SELECT COUNT(*) as c FROM instituciones_educativas WHERE activa = true ${nivelIeWhere}`).get();
            const total_directores = await db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE rol = 'director' AND activo = true").get();

            const directores_por_area = await db.prepare(`
                SELECT asignador.dependencia as area,
                       d.id, d.nombre_completo, d.ie_codigo,
                       ie.nombre as ie_nombre, ie.ruralidad
                FROM usuarios d
                INNER JOIN asignaciones ase ON d.id = ase.director_id
                LEFT JOIN actividades a ON ase.actividad_id = a.id
                LEFT JOIN usuarios asignador ON a.asignador_id = asignador.id
                LEFT JOIN instituciones_educativas ie ON d.ie_codigo = ie.codigo
                WHERE d.rol = 'director' AND d.activo = true
                GROUP BY asignador.dependencia, d.id, d.nombre_completo, d.ie_codigo, ie.nombre, ie.ruralidad
                ORDER BY asignador.dependencia, d.nombre_completo
            `).all();

            const ranking_ies = await db.prepare(`
                SELECT ie.codigo, ie.nombre, ie.ruralidad,
                    COUNT(*) as total,
                    COUNT(CASE WHEN ase.estado = 'completada' THEN 1 END) as completadas,
                    COUNT(CASE WHEN ase.estado = 'pendiente' THEN 1 END) as pendientes,
                    COUNT(CASE WHEN ase.estado = 'no_cumplida' THEN 1 END) as no_cumplidas
                ${baseJoin} ${buildWhere()}
                GROUP BY ie.id, ie.codigo, ie.nombre, ie.ruralidad
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
                por_ruralidad,
                por_ie,
                ranking_ies,
                recientes,
                total_ies: total_ies.c,
                total_directores: total_directores.c,
                directores_por_area
            });
        } else {
            const userId = req.session.user.id;
            const nivelJoin = nivel ? `INNER JOIN instituciones_educativas ie ON ase.ie_id = ie.id AND ie.tiene_${nivel} = true` : '';
            const nivelWhere = nivel ? `AND ie.tiene_${nivel} = true` : '';
            const fromDir = `FROM asignaciones ase ${nivelJoin} WHERE ase.director_id = ?`;

            const total = await db.prepare(`SELECT COUNT(*) as c ${fromDir}`).get(userId);
            const completadas = await db.prepare(`SELECT COUNT(*) as c ${fromDir} AND ase.estado = 'completada'`).get(userId);
            const pendientes = await db.prepare(`SELECT COUNT(*) as c ${fromDir} AND ase.estado = 'pendiente'`).get(userId);
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
                    COUNT(CASE WHEN ase.estado = 'pendiente' THEN 1 END) as pendientes,
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
            SELECT u.*, ie.nombre as ie_nombre, ie.codigo as ie_cod, ie.ruralidad
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
        const users = await db.prepare("SELECT id, nombre_completo, dni, ie_codigo, rol, dependencia, puesto, email, telefono, activo, usuario FROM usuarios ORDER BY rol, nombre_completo").all();
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
