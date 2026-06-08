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

    const tipos = await db.prepare('SELECT COUNT(*) as c FROM tipos_actividad').get();
    if (tipos.c == 0) {
        const tiposList = ['Tarea', 'Documento', 'Reunión', 'Informe'];
        for (const t of tiposList) {
            await db.prepare('INSERT INTO tipos_actividad (nombre) VALUES (?)').run(t);
        }
    }
    const iesCount = await db.prepare('SELECT COUNT(*) as c FROM instituciones_educativas').get();
    if (iesCount.c === 0) {
        await seedDatabase(db);
    }
    dbInitialized = true;
}

app.use(async (req, res, next) => {
    try {
        await initDatabase();
        next();
    } catch (err) {
        console.error('DB init error:', err);
        return res.status(503).json({ error: 'Base de datos no disponible' });
    }
});

function normalizar(txt) {
    return String(txt || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const NIVELES_VALIDOS = ['inicial', 'primaria', 'secundaria'];
function validarNivel(nivel) {
    return NIVELES_VALIDOS.includes(nivel) ? nivel : '';
}

const authSupervisor = (req, res, next) => {
    if (!req.session.user || req.session.user.rol !== 'supervisor') {
        return res.status(403).json({ error: 'Acceso denegado' });
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
        const { codigo } = req.body;
        if (!codigo) return res.status(400).json({ error: 'Ingrese un código o nombre' });

        const cod = normalizar(codigo);

        const allSupervisors = await db.prepare(
            "SELECT * FROM usuarios WHERE rol = 'supervisor' AND activo = true"
        ).all();

        for (const s of allSupervisors) {
            if (normalizar(s.nombre_completo) === cod) {
                req.session.user = { id: s.id, nombre: s.nombre_completo, rol: 'supervisor' };
                req.session.save(() => res.json({ ok: true, user: req.session.user }));
            }
        }

        let ie = await db.prepare(
            "SELECT * FROM instituciones_educativas WHERE codigo = ? AND activa = true"
        ).get(codigo);

        if (!ie) {
            const allIes = await db.prepare(
                "SELECT * FROM instituciones_educativas WHERE activa = true"
            ).all();
            let bestMatch = null;
            for (const candidate of allIes) {
                const nName = normalizar(candidate.nombre);
                const nCod = normalizar(candidate.codigo);
                if (nName === cod || nCod === cod) {
                    bestMatch = candidate;
                    break;
                }
                const firstToken = nName.split(' ')[0];
                if (cod === firstToken || nName.includes(cod)) {
                    bestMatch = candidate;
                    break;
                }
            }
            ie = bestMatch;
        }

        if (!ie) return res.status(401).json({ error: 'Institución o nombre no encontrado' });

        let director = await db.prepare(
            "SELECT * FROM usuarios WHERE ie_codigo = ? AND rol = 'director' AND activo = true LIMIT 1"
        ).get(ie.codigo);

        if (!director) {
            const result = await db.prepare(
                "INSERT INTO usuarios (nombre_completo, ie_codigo, rol) VALUES (?, ?, 'director') RETURNING id"
            ).run(ie.nombre, ie.codigo);
            director = { id: result.lastInsertRowid, nombre_completo: ie.nombre, rol: 'director', ie_codigo: ie.codigo };
        }

        req.session.user = {
            id: director.id,
            nombre: director.nombre_completo,
            rol: 'director',
            ie_codigo: ie.codigo,
            ie_nombre: ie.nombre,
            ie_id: ie.id
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
        const { ruralidad } = req.query;
        let sql = 'SELECT * FROM instituciones_educativas WHERE activa = true';
        const params = [];
        if (ruralidad) { sql += ' AND ruralidad = ?'; params.push(ruralidad); }
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


app.put('/api/ies/:id', authSupervisor, async (req, res) => {
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


app.get('/api/directores', authSupervisor, async (req, res) => {
    try {
        const directores = await db.prepare(`
            SELECT u.*, ie.nombre as ie_nombre, ie.codigo as ie_cod, ie.ruralidad
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

        const result = await db.prepare(
            'INSERT INTO actividades (titulo, descripcion, tipo_id, fecha_limite, hora_limite, asignador_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
        ).run(titulo, descripcion, tipo_id, fecha_limite, hora_limite || '23:59', req.session.user.id);

        const actividadId = result.lastInsertRowid;

        if (ie_ids && ie_ids.length > 0) {
            for (const ieId of ie_ids) {
                const ie = await db.prepare('SELECT * FROM instituciones_educativas WHERE id = ?').get(ieId);
                if (ie) {
                    let director = await db.prepare(
                        "SELECT id FROM usuarios WHERE ie_codigo = ? AND rol = 'director' AND activo = true LIMIT 1"
                    ).get(ie.codigo);

                    if (!director) {
                        const dirResult = await db.prepare(
                            "INSERT INTO usuarios (nombre_completo, ie_codigo, rol) VALUES (?, ?, 'director') RETURNING id"
                        ).run(ie.nombre, ie.codigo);
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

        res.json({ ok: true, id: actividadId });
    } catch (err) {
        console.error('Error crear actividad:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/actividades', authDirector, async (req, res) => {
    try {
        let actividades;
        if (req.session.user.rol === 'supervisor') {
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
                ase.fecha_completado, ase.notas_supervisor
                FROM actividades a
                LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
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
        await db.prepare(
            'UPDATE actividades SET titulo=?, descripcion=?, tipo_id=?, fecha_limite=?, hora_limite=? WHERE id=?'
        ).run(titulo, descripcion, tipo_id, fecha_limite, hora_limite || '23:59', req.params.id);
        res.json({ ok: true });
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

app.get('/api/asignaciones', authDirector, async (req, res) => {
    try {
        const nivel = validarNivel(req.query.nivel || '');
        const { ruralidad, estado, buscar } = req.query;
        const nivelWhere = nivel ? `AND ie.tiene_${nivel} = true` : '';
        const ruralidadWhere = ruralidad ? 'AND ie.ruralidad = ?' : '';
        const estadoWhere = estado ? 'AND ase.estado = ?' : '';
        const buscarWhere = buscar ? 'AND (ie.nombre ILIKE ? OR ie.codigo ILIKE ?)' : '';
        const params = [];
        if (ruralidad) params.push(ruralidad);
        if (estado) params.push(estado);
        if (buscar) { const q = `%${buscar}%`; params.push(q, q); }
        let asignaciones;
        if (req.session.user.rol === 'supervisor') {
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

        if (req.session.user.rol === 'supervisor') {
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

            res.json({
                total: total.c,
                completadas: completadas.c,
                pendientes: pendientes.c,
                no_cumplidas: no_cumplidas.c,
                vencidas: vencidas.c,
                porcentaje_cumplimiento: total.c > 0 ? Math.round((completadas.c / total.c) * 100) : 0,
                por_ruralidad,
                por_ie,
                recientes,
                total_ies: total_ies.c,
                total_directores: total_directores.c
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

            res.json({
                total: total.c,
                completadas: completadas.c,
                pendientes: pendientes.c,
                no_cumplidas: no_cumplidas.c,
                vencidas: vencidas.c,
                porcentaje_cumplimiento: total.c > 0 ? Math.round((completadas.c / total.c) * 100) : 0,
                recientes
            });
        }
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/notificaciones', authDirector, async (req, res) => {
    try {
        const notifs = await db.prepare(
            'SELECT * FROM notificaciones WHERE usuario_id = ? ORDER BY created_at DESC LIMIT 50'
        ).all(req.session.user.id);
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
            'INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo) VALUES (?, ?, ?, ?) RETURNING id'
        ).run(usuario_id, titulo, mensaje, tipo || 'manual');
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
            'INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo) VALUES (?, ?, ?, ?)'
        ).run(actividad.asignador_id, 'Respuesta: ' + actividad.titulo, mensaje, 'respuesta');
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
        const { nombre, email, telefono, dni } = req.body;
        const updates = [];
        const params = [];
        if (nombre !== undefined) { updates.push('nombre_completo=?'); params.push(nombre); }
        if (email !== undefined) { updates.push('email=?'); params.push(email); }
        if (telefono !== undefined) { updates.push('telefono=?'); params.push(telefono); }
        if (dni !== undefined) { updates.push('dni=?'); params.push(dni); }
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


app.get('/api/seed', async (req, res) => {
    try {
        const iesData = [
            ['084429','0005 SAN JOSE OBRERO','RURAL 3',true,true,false,false,null],
            ['471255','001 MADRE TERESA DE CALCUTA','URBANO',true,false,false,false,null],
            ['471279','091 TERESA GONZALES DE FANNING','RURAL 3',true,false,false,false,null],
            ['471284','094 RAITOS DE SOL','URBANO',true,false,false,false,null],
            ['471302','100 SEMILLITAS DEL SABER','URBANO',true,false,false,false,null],
            ['471316','101 GABRIELA MISTRAL','RURAL 2',true,false,false,false,null],
            ['471321','109 SANTA TERESITA','RURAL 3',true,false,false,false,null],
            ['471335','137 FE Y ALEGRIA','URBANO',true,false,false,false,null],
            ['471340','185','RURAL 3',true,false,false,false,null],
            ['471364','0198 MARIA EDITH VILLACORTA PINEDO','RURAL 3',false,true,false,false,null],
            ['471378','223 PASITO A PASO','RURAL 2',true,false,false,false,null],
            ['471383','0199 SANTA ROSA','URBANO',false,true,false,false,null],
            ['471397','0069 FRANCISCO IZQUIERDO RIOS','RURAL 2',false,true,false,false,null],
            ['471415','0205 ELVIRA RUIZ DAVILA','RURAL 3',false,true,false,false,null],
            ['471420','0116 SAGRADO CORAZON DE JESUS','RURAL 2',true,true,false,false,null],
            ['471444','0164 MICAELA BASTIDA PUYUCAWA','RURAL 2',false,true,false,false,null],
            ['471458','0180 SEÑOR DE LOS MILAGROS','URBANO',true,true,false,false,null],
            ['471463','0215 VALENTIN PANIAGUA CORAZAO','RURAL 3',false,true,true,false,null],
            ['471477','176 ROMAN RIVERO SALDAÑA','URBANO',true,false,false,false,null],
            ['471482','0224','RURAL 2',false,true,true,false,null],
            ['471496','0050 ABRAHAM CARDENAS RUIZ','URBANO',false,false,true,false,'Básica Alternativa'],
            ['471509','0760 JOSE OLAYA BALANDRA','RURAL 3',false,false,true,false,null],
            ['471514','0766 RUBEN CACHIQUE SANGAMA','RURAL 3',false,false,true,false,null],
            ['471528','0208 SANTIAGO ANTUNEZ DE MAYOLO','URBANO',true,true,true,false,null],
            ['471533','0482 CIRO SALDAÑA GIRALDO','URBANO',true,true,true,false,null],
            ['471547','0001','URBANO',false,false,false,false,'Técnico Productiva'],
            ['471566','0266 MIGUEL GRAU SEMINARIO','RURAL 3',true,true,false,false,null],
            ['471571','0194 TEODOCIA NAVARRO VEGA','RURAL 2',false,true,true,false,null],
            ['471590','006 SAN MARTIN DE PORRES','RURAL 2',true,false,false,false,null],
            ['471608','093','RURAL 1',true,false,false,false,null],
            ['471613','098 MERLIN GARCIA USHIÑAHUA','RURAL 2',true,false,false,false,null],
            ['471627','127 CUNITA DE AMOR','RURAL 3',true,false,false,false,null],
            ['471632','190 ROSALIA PEZO REYNA','RURAL 2',true,false,false,false,null],
            ['471646','128 MODESTA GARCIA SAAVEDRA','RURAL 2',true,false,false,false,null],
            ['471651','0001 ALBERTO UPIACHIHUA PUYO','RURAL 1',true,true,false,false,null],
            ['471665','0242 BENJAMIN TORRES TORRES','RURAL 1',false,true,true,false,null],
            ['471670','0122 JOSE CARLOS MARIATEGUI','RURAL 1',false,true,true,false,null],
            ['471689','0206 ISAAC NEWTON','RURAL 3',false,true,true,false,null],
            ['471694','151 SAGRADO CORAZON DE JESUS','RURAL 1',true,false,false,false,null],
            ['471707','0003 ELEAZAR FASABI ZATALAYA','RURAL 1',false,true,true,false,null],
            ['471726','0249 SARITA COLINA SAMBRANO','RURAL 1',false,true,false,false,null],
            ['471731','0238 MANCO CAPAC','RURAL 2',false,true,true,false,null],
            ['471745','0250 LOS HEROES DE ARICA','RURAL 1',false,true,true,false,null],
            ['471750','0259 RAMON CASTILLA MARQUESADO','RURAL 1',false,true,false,false,null],
            ['471769','0489 JORGE CHAVEZ DARNELL','RURAL 1',false,true,true,false,null],
            ['471774','0488 CARLOS CUETO FERNANDINI','RURAL 2',false,true,false,false,null],
            ['471788','0678 JUAN PINCHI URQUIA','RURAL 2',false,true,true,false,null],
            ['471793','0679 ABELARDO PAREDES TANANTA','RURAL 2',false,true,false,false,null],
            ['471811','0207 FERNANDO BELAUNDE TERRY','RURAL 2',false,true,true,false,null],
            ['471825','0123 REYNALDO PAREDES SAAVEDRA','RURAL 1',true,true,false,false,null],
            ['471830','0002','RURAL 2',true,true,true,false,null],
            ['471849','097 SEÑOR DE LOS MILAGROS','RURAL 1',true,false,false,false,null],
            ['471854','0772 JOSE F. SANCHEZ CARRION','RURAL 3',false,false,true,false,null],
            ['471868','0780','RURAL 1',false,true,false,false,null],
            ['471887','095','RURAL 3',true,false,false,false,null],
            ['471892','129','RURAL 2',true,false,false,false,null],
            ['471929','321','RURAL 3',true,false,false,false,null],
            ['471934','331','RURAL 1',true,false,false,false,null],
            ['471948','0044','RURAL 2',true,true,true,false,null],
            ['471953','0048','RURAL 2',false,true,false,false,null],
            ['471967','0084 ANDRES AVELINO CACERES DORREGARAY','RURAL 3',false,true,true,false,null],
            ['471972','0085','RURAL 2',false,true,false,false,null],
            ['471991','0136','RURAL 2',false,true,false,false,null],
            ['472014','0141','RURAL 2',true,true,false,false,null],
            ['472028','0142','RURAL 3',false,true,false,false,null],
            ['472052','0298','RURAL 2',true,true,false,false,null],
            ['472066','0475','RURAL 3',false,true,true,false,null],
            ['472071','0577','RURAL 3',true,true,true,false,null],
            ['472085','0724','RURAL 2',false,true,false,false,null],
            ['472113','AGROPECUARIO DOS UNIDOS','RURAL 3',false,false,true,false,null],
            ['472212','0016 JOSE GABRIEL CONDORCANQUI','URBANO',true,true,true,false,null],
            ['472245','120 EMILIA BARCIA BONIFATTI','URBANO',true,false,false,false,null],
            ['472250','136 MARIA CALVO RUIZ','RURAL 3',true,false,false,false,null],
            ['472269','175 ANTORCHA DEL SABER','RURAL 2',true,false,false,false,null],
            ['472274','0014 CORONEL LEONCIO PRADO','RURAL 2',false,true,false,false,null],
            ['472288','0042 HUMBERTO DEL AGUILA ARRIEGA','RURAL 2',false,true,false,false,null],
            ['472293','0045','RURAL 2',false,true,false,false,null],
            ['472306','0046 JOSE DE LA TORRE UGARTE','RURAL 2',false,true,false,false,null],
            ['472311','0174','RURAL 3',false,true,true,false,null],
            ['472330','005','RURAL 2',true,false,false,false,null],
            ['472349','0202','URBANO',false,true,false,false,null],
            ['472354','0267','RURAL 2',false,true,false,false,null],
            ['472368','0231 ALFONSO UGARTE VERNAL','RURAL 2',false,true,false,false,null],
            ['472373','226 MARIA ANDREA PARADO DE BELLIDO','RURAL 2',true,false,false,false,null],
            ['472392','0306 JOSE SANTOS CHOCANO GASTANODI','RURAL 3',true,true,true,false,null],
            ['472410','0213 PASCUAL SANGAMA VALLES','RURAL 2',false,true,false,false,null],
            ['472429','0388 JUAN DE LA CRUZ SALAS SALAS','RURAL 2',false,true,false,false,null],
            ['472448','0029 JUAN VELASCO ALVARADO','URBANO',false,false,true,false,'Básica Alternativa'],
            ['472453','0687 JOSE AVELARDO QUIÑONES GONZALES','RURAL 2',false,true,false,false,null],
            ['472467','0758 RICARDO PALMA','RURAL 3',true,true,true,false,null],
            ['472472','177 CARMELA PERDOMO PANDURO','RURAL 2',true,false,false,false,null],
            ['472486','0630 JUSTINIANO SHUÑA PAIMA','RURAL 2',false,true,false,false,null],
            ['472491','229 MARIA ELENA MOYANO','RURAL 2',true,false,false,false,null],
            ['472518','003 ROSA MERINO','URBANO',true,false,false,false,null],
            ['472523','0485 IGANCIO ISUIZA SANANCINA','RURAL 2',false,true,false,false,null],
            ['472542','004 AMIGUITOS DE JESUS','RURAL 3',true,false,false,false,null],
            ['472556','090 LOS ANGELITOS DE PALESTINA','RURAL 2',true,false,false,false,null],
            ['472561','103 CORAZONES TIERNOS','RURAL 3',true,false,false,false,null],
            ['472575','228 DIVINO NIÑO JESUS','RURAL 3',true,false,false,false,null],
            ['472580','0190 CESAR VALLEJO MENDOZA','RURAL 3',false,true,false,false,null],
            ['472617','0225 MERVIN TANANTA GARCIA','RURAL 2',false,true,false,false,null],
            ['472622','0617 NATIVIDAD BARRERA ARELLANO','RURAL 2',false,true,false,false,null],
            ['472636','0047 JESUS EL BUEN MAESTRO','RURAL 3',false,true,false,false,null],
            ['472641','0049 IMACULADA CONCEPCION','RURAL 3',false,true,false,false,null],
            ['472660','0005 DANIEL ALCIDES CARRION','RURAL 3',true,true,true,false,null],
            ['472679','0700 SAN JUAN BAUTISTA','RURAL 3',false,false,true,false,null],
            ['472684','0759 FRANCISCO BOLOGNESI','RURAL 3',false,false,true,false,null],
            ['472698','0226 JUAN DANIEL DEL AGUILA VELASQUEZ','RURAL 3',false,true,false,false,null],
            ['474466','085 RAMON RODRIGUEZ RIOS','RURAL 3',true,false,false,false,null],
            ['474471','0184 OSCAR PANDURO DAVILA','RURAL 3',false,true,false,false,null],
            ['474485','0010 JULIO PIZARRO CARDENAS','RURAL 3',false,false,true,false,null],
            ['520859','CORPUS CHRISTE','RURAL 3',true,true,true,false,null],
            ['523650','0201 VIRGITA ALVARADO CARDENAS','RURAL 3',false,true,false,false,null],
            ['523669','104 ANGELITOS DEL SABER','RURAL 3',true,false,false,false,null],
            ['533159','0720','RURAL 1',false,true,false,false,null],
            ['541381','0721','RURAL 1',false,true,true,false,null],
            ['541395','0718','RURAL 1',false,true,false,false,null],
            ['555274','0080','RURAL 1',true,true,false,false,null],
            ['555368','0751','RURAL 1',true,false,false,false,null],
            ['562156','0719 SAN ANTONIO DE PADUA','RURAL 2',true,true,false,false,null],
            ['562175','0727 INTERCULTURAL BILINGUE','RURAL 1',false,true,true,false,null],
            ['580443','421','RURAL 3',true,false,false,false,null],
            ['580457','422','RURAL 2',true,false,false,false,null],
            ['600931','231','RURAL 1',true,false,false,false,null],
            ['639250','477','RURAL 1',true,true,false,false,null],
            ['639269','478','RURAL 1',true,false,false,false,null],
            ['639274','479','RURAL 1',true,false,false,false,null],
            ['639288','480','RURAL 1',true,false,false,false,null],
            ['639325','468','RURAL 2',true,false,false,false,null],
            ['668389','1121','URBANO',true,false,false,false,null],
            ['668394','1122','RURAL 2',true,false,false,false,null],
            ['768647','1164','RURAL 1',true,true,false,false,null],
            ['768652','1165','RURAL 1',true,false,false,false,null],
            ['768666','1166','RURAL 1',true,false,false,false,null],
            ['768671','1167','RURAL 1',true,false,false,false,null],
            ['768685','1168','RURAL 1',true,false,false,false,null],
            ['775959','1169','RURAL 1',true,false,false,false,null],
            ['775964','1170','RURAL 2',true,false,false,false,null],
            ['792416','1249','RURAL 1',true,false,false,false,null],
            ['792421','1250','RURAL 1',true,true,false,false,null],
            ['792435','1251','RURAL 1',true,false,false,false,null],
            ['792440','1252','RURAL 1',true,true,false,false,null],
            ['792459','1253','RURAL 1',true,false,false,false,null],
            ['800497','1309','RURAL 1',false,false,true,false,null],
            ['800505','1310','RURAL 1',false,false,true,false,null],
            ['804339','0086','RURAL 2',true,true,false,false,null],
            ['804344','0143','RURAL 1',false,true,false,false,null],
            ['804358','0605','RURAL 2',false,true,false,false,null],
            ['804438','0647','RURAL 1',false,true,true,false,null],
            ['804508','01360','RURAL 2',false,true,false,false,null],
            ['804565','0751','RURAL 1',false,true,false,false,null],
            ['804631','0779','RURAL 1',true,true,true,false,null],
            ['804754','0781','RURAL 1',false,true,false,false,null],
            ['805447','0007','RURAL 1',false,true,false,false,null],
            ['805452','0008 JULIO RAMON RIBEYRO','RURAL 1',true,true,true,false,null],
            ['805541','0732 JOSE DEL CARMEN MARIN ARISTA','RURAL 1',true,true,true,false,null],
            ['806220','0001','URBANO',false,false,false,false,'Básica Especial'],
            ['806244','0726','RURAL 1',false,true,false,false,null],
            ['806258','0376 MARIANO MELGAR Y VALDIVIESO','RURAL 2',true,true,true,false,null],
            ['806282','0690 PEDRO VILCA APAZA','RURAL 2',false,true,false,false,null],
            ['806296','0723','RURAL 1',false,true,false,false,null],
            ['806300','0714 CIRO ALEGRIA BAZAN','RURAL 1',true,true,false,false,null],
            ['806319','0689','RURAL 2',true,true,true,false,null],
            ['806324','0688','RURAL 1',true,true,true,false,null],
            ['806338','0716 MICAELA BASTIDAS','RURAL 1',true,true,false,false,null],
            ['806362','0717 GILBERTO SATALAYA TUANAMA','RURAL 1',false,true,false,false,null],
            ['806376','230 MI PEQUEÑO UNIVERSO','RURAL 2',true,false,false,false,null],
            ['806395','0725','RURAL 1',false,true,false,false,null],
            ['806418','01367','RURAL 1',true,true,true,false,null],
            ['821763','1319','RURAL 1',true,false,false,false,null],
            ['821777','1320','RURAL 1',true,true,false,false,null],
            ['821782','1321','RURAL 1',true,false,false,false,null],
            ['821796','1322','RURAL 1',true,true,false,false,null],
            ['830418','SANTA MARIA GORETTI','URBANO',false,true,true,false,null],
            ['851378','01361','RURAL 1',true,true,false,false,null],
            ['900703','HOGAR NAZARET DEL CORAZON INMACULADO DE MARIA','RURAL 3',false,false,true,false,null],
            ['902108','NUESTRA SEÑORA DEL ROCIO','URBANO',false,false,true,false,null],
            ['903773','1374 EDGAR ANTONIO CHAVEZ GIL','RURAL 1',true,true,false,false,null],
            ['911971','467','RURAL 2',true,false,false,false,null],
            ['999247','0722 NUEVO AMANECER','RURAL 2',true,true,false,false,null],
            ['867497','ODEC BELLAVISTA','URBANO',false,false,false,false,'No aplica'],
            ['472047','AGROPECUARIO DOS UNIDOS','RURAL 3',false,true,false,false,null],
            ['471910','AGROPECUARIO DOS UNIDOS','RURAL 3',true,false,false,false,null]
        ];

        for (const ie of iesData) {
            await db.prepare(
                'INSERT INTO instituciones_educativas (codigo, nombre, ruralidad, tiene_inicial, tiene_primaria, tiene_secundaria, tiene_otros, tipo_otros) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (codigo) DO UPDATE SET nombre = excluded.nombre, ruralidad = excluded.ruralidad, tiene_inicial = excluded.tiene_inicial, tiene_primaria = excluded.tiene_primaria, tiene_secundaria = excluded.tiene_secundaria, tiene_otros = excluded.tiene_otros, tipo_otros = excluded.tipo_otros'
            ).run(...ie);
        }

        const supervisores = [
            ['Poel Rufino Herrera Bendezú','DIRECCION','Director'],
            ['Margot Fonseca de Vera','DIRECCION','Secretaria de Dirección'],
            ['Leydi Marín Quezada','ADMINISTRACION','Jefe de la Oficina de Administración'],
            ['Tony Jhon Fernandez Díaz','AGI','Jefe del Área de Gestión Institucional'],
            ['Oscar Enrique Ayay Sánchez','AGP','Jefe del Área de Gestión Pedagógica'],
            ['Yolby Tapullima Tapullima','AGP','Servicio Profesional Especializado en Gestión Pedagógica'],
            ['Karen Esther Vela Arirama','AGP','Servicio Profesional Especializado en Gestión Pedagógica'],
            ['Sheily Say Huansi Vásquez','AGP','Especialista en Convivencia Escolar'],
            ['Franklin Cárdenas Ruíz','AGP','Especialista en Educación Nivel Primaria'],
            ['Antonio Wilmer Rojas Miranda','AGP','Especialista en Educación Nivel Secundaria'],
            ['Gianmarco Panduro Mego','ADMINISTRACION','Especialista en Informática I'],
            ['Yeny Judith Martínez Rafael','AGI','Especialista en Planificación y Presupuesto'],
            ['Daniel Leonidas La Torre Rengifo','AGI','Especialista en Infraestructura'],
            ['Jheimmy Carmin Guevara Tafur','AGI','Especialista en Finanzas'],
            ['Ynes Paola Pérez Avila','AGI','Especialista en Racionalización y Estadística'],
            ['Roxanita Carrasco Holguín','AGI','Especialista de SIAGIE'],
            ['Gisela Yudith Vásquez Gonzales','AGI','Servicio Profesional Especializado en Gestión Institucional'],
            ['Zack Kevin Alvarado Maldonado','AGI','Servicio Profesional Especializado en Infraestructura'],
            ['Jhoy Lider Gonzales Pinedo','AGI','Servicio Profesional Especializado en Planificación y Presupuesto'],
            ['Kevin Hafid Rojas Cubas','DIRECCION','Servicio Profesional Especializado en Asesoría Legal'],
            ['Gianny Pezo Cumapa','DIRECCION','Asesora Legal'],
            ['Zarita Isabel Mijahuanga Chumbe','AGP','Especialista en Educación Nivel Inicial'],
            ['Silvia Janet Heredia Romero','AGP','Especialista en Educación Nivel Inicial'],
            ['Salustiano Valdemar Salas Namay','AGP','Especialista en Educación Nivel Secundaria Matemática'],
            ['Manuel Ramírez Ruíz','AGP','Especialista en Educación Nivel Secundaria Comunicación'],
            ['Victor Vela Ramirez','AGP','Especialista en Educación Nivel Primaria'],
            ['Antonio Angulo Ramírez','AGP','Coordinador de PRONOEI'],
            ['Sonia Angulo Cabrera','AGP','Coordinador de PRONOEI'],
            ['Pedro Antonio Rengifo Ramírez','AGP','Coordinador de PRONOEI'],
            ['Ayrunedi Lopez Putpaña','AGP','Coordinador de PRONOEI'],
            ['Rolita Sangama Del Aguila','AGP','Coordinador de PRONOEI'],
            ['Hiber Miller Yalta Cubas','AGP','Profesional III Equipo Itinerante Convivencia Escolar'],
            ['Jhoel Villacorta Salazar','AGP','Profesional III Equipo Itinerante Convivencia Escolar'],
            ['Maria de los Angeles Nole Vargas de Merino','AGP','PREVAED'],
            ['Ernesto Jimenez Chapoñan','AGP','Especialista en Educación Nivel Secundaria CC.SS.'],
            ['Keyla Livany Vasquez Chuquilin','ADMINISTRACION','Analista de la CPPADD'],
            ['Gerges Gabriel Isuiza Chanchari','ADMINISTRACION','Servicio Profesional Especializado en Imagen Institucional'],
            ['Leidy Luz Cárdenas Vásquez','ADMINISTRACION','Servicio Profesional Especializado en Planilla y AIRHSP'],
            ['Beroccio Ramirez Ríos','ADMINISTRACION','Especialista en Tesorería'],
            ['Ketty Paola Alvarado Cárdenas','ADMINISTRACION','Servicio Profesional Especializado en PAD'],
            ['Karen Janeth Flores Lanares','ADMINISTRACION','Especialista en Contabilidad'],
            ['Veronica Salazar Castro','ADMINISTRACION','Especialista en Abastecimiento'],
            ['Violeta Salazar García','ADMINISTRACION','Especialista en Bienestar'],
            ['Fiorella Vela Vásquez','ADMINISTRACION','Proyectista'],
            ['Sutkey Milagritos Ramirez Cabanillas','ADMINISTRACION','Especialista en Archivo'],
            ['Segundo Hipólito Saldaña Pérez','ADMINISTRACION','Responsable de Gestión de Recursos Humanos'],
            ['Yesenia Marisol Escobedo Vilchez','ADMINISTRACION','Secretaria de RR.HH.'],
            ['Carlos Bendezú Ushiñahua Fasabi','ADMINISTRACION','Servicio Profesional Especializado en Archivo'],
            ['Lleny Sangama Guerra','ADMINISTRACION','Secretaria de Administración'],
            ['Diego Torres Rengifo','ADMINISTRACION','Analista en Nexus'],
            ['Breidis Santiago Upiachihua Cárdenas','ADMINISTRACION','Servicio Profesional Especializado en Tesorería'],
            ['Juan Carlos Campos Viera','ADMINISTRACION','Especialista en Planillas'],
            ['Dayxs Bravo Bustamante','ADMINISTRACION','Especialista en Escalafón'],
            ['Karen Tatiana Hidalgo Vásquez','ADMINISTRACION','Servicio Profesional Especializado en RR.HH.'],
            ['Herberth Rivera Cabrera','ADMINISTRACION','Vigilante'],
            ['Maryori Stephany Muñoz Gonzales','ADMINISTRACION','Técnico Administrativo de Mesa de Partes'],
            ['Ricardo Saldaña Guevara','ADMINISTRACION','Servicio Profesional Especializado en Seguridad y Vigilancia'],
            ['Rober Cachique Cachique','ADMINISTRACION','Servicio Profesional Especializado en Seguridad y Vigilancia'],
            ['Ruber Cárdenas Ramirez','ADMINISTRACION','Servicio Profesional Especializado en Seguridad y Vigilancia'],
            ['Hugo Ushiñahua Trigoso','ADMINISTRACION','Chofer'],
            ['Gianfranco Nieto Cárdenas','ADMINISTRACION','Servicio Profesional Especializado en Almacén'],
            ['Maria Leonor Revilla Guevara','ADMINISTRACION','Servicio Profesional Especializado en Limpieza'],
            ['Maria Margarita Cubas Sanchéz','ADMINISTRACION','Especialista en Patrimonio y Almacén'],
            ['Joel Gonza Peña','ADMINISTRACION','Servicio Profesional Especializado en RR.HH.'],
            ['Gilma Veronica Gutierrez Vasquez','ADMINISTRACION','Servicio Profesional Especializado en Abastecimiento'],
            ['Alfredo Silva Pisco','ADMINISTRACION','Servicio Profesional Especializado en Seguridad y Vigilancia'],
            ['Lorena Diaz Diaz','AGI','Practicante Pre profesional'],
            ['Mary Saavedra Taricuarima','DIRECCION','Servicio Profesional Especializado en la Oficina de Dirección']
        ];

        for (const s of supervisores) {
            const existing = await db.prepare(
                "SELECT id FROM usuarios WHERE nombre_completo = ? AND rol = 'supervisor'"
            ).get(s[0]);
            if (!existing) {
                await db.prepare(
                    "INSERT INTO usuarios (nombre_completo, rol, dependencia, puesto) VALUES (?, 'supervisor', ?, ?)"
                ).run(...s);
            }
        }

        const tipos = await db.prepare('SELECT COUNT(*) as c FROM tipos_actividad').get();
        if (tipos.c == 0) {
            for (const t of ['Tarea', 'Documento', 'Reunión', 'Informe']) {
                await db.prepare('INSERT INTO tipos_actividad (nombre) VALUES (?)').run(t);
            }
        }

        const total = await db.prepare('SELECT COUNT(*) as c FROM instituciones_educativas').get();
        res.json({ ok: true, msg: 'Datos cargados exitosamente', ies: total.c });
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
