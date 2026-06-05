require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const path = require('path');
const ExcelJS = require('exceljs');

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
    cookie: { maxAge: 8 * 60 * 60 * 1000, secure: false }
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
    dbInitialized = true;
}

app.use(async (req, res, next) => {
    try {
        await initDatabase();
        next();
    } catch (err) {
        console.error('DB init error:', err);
        next();
    }
});

function normalizar(txt) {
    return String(txt || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
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

        const supervisor = await db.prepare(
            "SELECT * FROM usuarios WHERE rol = 'supervisor' AND activo = true AND normalizar(nombre_completo) = ?"
        ).get(cod);

        if (supervisor) {
            req.session.user = { id: supervisor.id, nombre: supervisor.nombre_completo, rol: 'supervisor' };
            return res.json({ ok: true, user: req.session.user });
        }

        const allSupervisors = await db.prepare(
            "SELECT * FROM usuarios WHERE rol = 'supervisor' AND activo = true"
        ).all();

        for (const s of allSupervisors) {
            if (normalizar(s.nombre_completo) === cod) {
                req.session.user = { id: s.id, nombre: s.nombre_completo, rol: 'supervisor' };
                return res.json({ ok: true, user: req.session.user });
            }
        }

        const ie = await db.prepare(
            "SELECT * FROM instituciones_educativas WHERE codigo = ? AND activa = true"
        ).get(codigo);

        if (!ie) return res.status(401).json({ error: 'Institución o nombre no encontrado' });

        let director = await db.prepare(
            "SELECT * FROM usuarios WHERE ie_codigo = ? AND rol = 'director' AND activo = true LIMIT 1"
        ).get(codigo);

        if (!director) {
            const result = await db.prepare(
                "INSERT INTO usuarios (nombre_completo, ie_codigo, rol) VALUES (?, ?, 'director') RETURNING id"
            ).run(ie.nombre, codigo);
            director = { id: result.lastInsertRowid, nombre_completo: ie.nombre, rol: 'director', ie_codigo: codigo };
        }

        req.session.user = {
            id: director.id,
            nombre: director.nombre_completo,
            rol: 'director',
            ie_codigo: codigo,
            ie_nombre: ie.nombre,
            ie_id: ie.id
        };
        res.json({ ok: true, user: req.session.user });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ ok: true });
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
        const ies = await db.prepare(
            'SELECT * FROM instituciones_educativas WHERE activa = true ORDER BY codigo'
        ).all();
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

app.post('/api/ies', authSupervisor, async (req, res) => {
    try {
        const { codigo, nombre, ruralidad, tiene_inicial, tiene_primaria, tiene_secundaria, tiene_otros, tipo_otros } = req.body;
        const result = await db.prepare(
            'INSERT INTO instituciones_educativas (codigo, nombre, ruralidad, tiene_inicial, tiene_primaria, tiene_secundaria, tiene_otros, tipo_otros) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id'
        ).run(codigo, nombre, ruralidad || 'URBANO', tiene_inicial || false, tiene_primaria || false, tiene_secundaria || false, tiene_otros || false, tipo_otros || null);
        res.json({ ok: true, id: result.lastInsertRowid });
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

app.delete('/api/ies/:id', authSupervisor, async (req, res) => {
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
        const { nombre_completo, dni, ie_codigo, email, telefono } = req.body;
        await db.prepare(
            'UPDATE usuarios SET nombre_completo=?, dni=?, ie_codigo=?, email=?, telefono=? WHERE id=?'
        ).run(nombre_completo, dni, ie_codigo, email, telefono, req.params.id);
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
        ).run(titulo, descripcion, tipo_id, fecha_limite, hora_limite, req.params.id);
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

app.get('/api/asignaciones', authDirector, async (req, res) => {
    try {
        let asignaciones;
        if (req.session.user.rol === 'supervisor') {
            asignaciones = await db.prepare(`
                SELECT ase.*, a.titulo as actividad_titulo, a.fecha_limite, a.descripcion as actividad_descripcion,
                       ta.nombre as tipo_nombre,
                       ie.nombre as ie_nombre, ie.codigo as ie_codigo, ie.ruralidad,
                       u.nombre_completo as director_nombre
                FROM asignaciones ase
                LEFT JOIN actividades a ON ase.actividad_id = a.id
                LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
                LEFT JOIN instituciones_educativas ie ON ase.ie_id = ie.id
                LEFT JOIN usuarios u ON ase.director_id = u.id
                ORDER BY a.fecha_limite ASC
            `).all();
        } else {
            asignaciones = await db.prepare(`
                SELECT ase.*, a.titulo as actividad_titulo, a.fecha_limite, a.descripcion as actividad_descripcion,
                       ta.nombre as tipo_nombre,
                       ie.nombre as ie_nombre, ie.codigo as ie_codigo
                FROM asignaciones ase
                LEFT JOIN actividades a ON ase.actividad_id = a.id
                LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
                LEFT JOIN instituciones_educativas ie ON ase.ie_id = ie.id
                WHERE ase.director_id = ?
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
        if (req.session.user.rol === 'supervisor') {
            const total = await db.prepare('SELECT COUNT(*) as c FROM asignaciones').get();
            const completadas = await db.prepare("SELECT COUNT(*) as c FROM asignaciones WHERE estado = 'completada'").get();
            const pendientes = await db.prepare("SELECT COUNT(*) as c FROM asignaciones WHERE estado = 'pendiente'").get();
            const no_cumplidas = await db.prepare("SELECT COUNT(*) as c FROM asignaciones WHERE estado = 'no_cumplida'").get();

            const hoy = new Date().toISOString().split('T')[0];
            const vencidas = await db.prepare(`
                SELECT COUNT(*) as c FROM asignaciones ase
                INNER JOIN actividades a ON ase.actividad_id = a.id
                WHERE ase.estado = 'pendiente' AND a.fecha_limite < ?
            `).get(hoy);

            const por_ruralidad = await db.prepare(`
                SELECT ie.ruralidad,
                    COUNT(*) as total,
                    COUNT(CASE WHEN ase.estado = 'completada' THEN 1 END) as completadas,
                    COUNT(CASE WHEN ase.estado = 'pendiente' THEN 1 END) as pendientes,
                    COUNT(CASE WHEN ase.estado = 'no_cumplida' THEN 1 END) as no_cumplidas
                FROM asignaciones ase
                INNER JOIN instituciones_educativas ie ON ase.ie_id = ie.id
                GROUP BY ie.ruralidad
                ORDER BY ie.ruralidad
            `).all();

            const por_ie = await db.prepare(`
                SELECT ie.codigo, ie.nombre, ie.ruralidad,
                    COUNT(*) as total,
                    COUNT(CASE WHEN ase.estado = 'completada' THEN 1 END) as completadas,
                    COUNT(CASE WHEN ase.estado = 'pendiente' THEN 1 END) as pendientes,
                    COUNT(CASE WHEN ase.estado = 'no_cumplida' THEN 1 END) as no_cumplidas
                FROM asignaciones ase
                INNER JOIN instituciones_educativas ie ON ase.ie_id = ie.id
                GROUP BY ie.id, ie.codigo, ie.nombre, ie.ruralidad
                HAVING COUNT(*) > 0
                ORDER BY COUNT(CASE WHEN ase.estado = 'no_cumplida' THEN 1 END) DESC
                LIMIT 10
            `).all();

            const recientes = await db.prepare(`
                SELECT a.*, ta.nombre as tipo_nombre, ase.estado as asignacion_estado,
                       ie.nombre as ie_nombre, ie.codigo as ie_codigo
                FROM actividades a
                LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
                LEFT JOIN asignaciones ase ON a.id = ase.actividad_id
                LEFT JOIN instituciones_educativas ie ON ase.ie_id = ie.id
                ORDER BY a.created_at DESC
                LIMIT 10
            `).all();

            const total_ies = await db.prepare("SELECT COUNT(*) as c FROM instituciones_educativas WHERE activa = true").get();
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
            const total = await db.prepare("SELECT COUNT(*) as c FROM asignaciones WHERE director_id = ?").get(userId);
            const completadas = await db.prepare("SELECT COUNT(*) as c FROM asignaciones WHERE director_id = ? AND estado = 'completada'").get(userId);
            const pendientes = await db.prepare("SELECT COUNT(*) as c FROM asignaciones WHERE director_id = ? AND estado = 'pendiente'").get(userId);
            const no_cumplidas = await db.prepare("SELECT COUNT(*) as c FROM asignaciones WHERE director_id = ? AND estado = 'no_cumplida'").get(userId);

            const hoy = new Date().toISOString().split('T')[0];
            const vencidas = await db.prepare(`
                SELECT COUNT(*) as c FROM asignaciones ase
                INNER JOIN actividades a ON ase.actividad_id = a.id
                WHERE ase.director_id = ? AND ase.estado = 'pendiente' AND a.fecha_limite < ?
            `).get(userId, hoy);

            const recientes = await db.prepare(`
                SELECT a.*, ta.nombre as tipo_nombre, ase.estado as asignacion_estado,
                ase.fecha_completado, ase.notas_supervisor
                FROM actividades a
                LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
                INNER JOIN asignaciones ase ON a.id = ase.actividad_id
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
        const { email, telefono } = req.body;
        await db.prepare('UPDATE usuarios SET email=?, telefono=? WHERE id=?')
            .run(email, telefono, req.session.user.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/exportar-excel', authSupervisor, async (req, res) => {
    try {
        const { ie_id, ruralidad, estado, fecha_desde, fecha_hasta } = req.query;

        let where = 'WHERE 1=1';
        const params = [];

        if (ie_id) { where += ' AND ase.ie_id = ?'; params.push(ie_id); }
        if (ruralidad) { where += ' AND ie.ruralidad = ?'; params.push(ruralidad); }
        if (estado) { where += ' AND ase.estado = ?'; params.push(estado); }
        if (fecha_desde) { where += ' AND a.fecha_limite >= ?'; params.push(fecha_desde); }
        if (fecha_hasta) { where += ' AND a.fecha_limite <= ?'; params.push(fecha_hasta); }

        const asignaciones = await db.prepare(`
            SELECT ase.*, a.titulo as actividad_titulo, a.fecha_limite, a.descripcion,
                   ta.nombre as tipo_nombre,
                   ie.codigo as ie_codigo, ie.nombre as ie_nombre, ie.ruralidad,
                   u.nombre_completo as director_nombre
            FROM asignaciones ase
            LEFT JOIN actividades a ON ase.actividad_id = a.id
            LEFT JOIN tipos_actividad ta ON a.tipo_id = ta.id
            LEFT JOIN instituciones_educativas ie ON ase.ie_id = ie.id
            LEFT JOIN usuarios u ON ase.director_id = u.id
            ${where}
            ORDER BY ie.codigo, a.fecha_limite
        `).all(...params);

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Reporte Monitoreo');

        sheet.columns = [
            { header: 'Código IE', key: 'ie_codigo', width: 15 },
            { header: 'Institución', key: 'ie_nombre', width: 35 },
            { header: 'Ruralidad', key: 'ruralidad', width: 15 },
            { header: 'Director', key: 'director_nombre', width: 30 },
            { header: 'Actividad', key: 'actividad_titulo', width: 30 },
            { header: 'Tipo', key: 'tipo_nombre', width: 15 },
            { header: 'Fecha Límite', key: 'fecha_limite', width: 15 },
            { header: 'Estado', key: 'estado', width: 15 },
            { header: 'Descripción', key: 'descripcion', width: 40 },
            { header: 'Notas Supervisor', key: 'notas_supervisor', width: 30 }
        ];

        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7A1E2C' } };

        asignaciones.forEach(a => {
            sheet.addRow({
                ie_codigo: a.ie_codigo,
                ie_nombre: a.ie_nombre,
                ruralidad: a.ruralidad,
                director_nombre: a.director_nombre,
                actividad_titulo: a.actividad_titulo,
                tipo_nombre: a.tipo_nombre,
                fecha_limite: a.fecha_limite,
                estado: a.estado,
                descripcion: a.descripcion,
                notas_supervisor: a.notas_supervisor
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=reporte_monitoreo.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/seed', async (req, res) => {
    try {
        const existing = await db.prepare('SELECT COUNT(*) as c FROM instituciones_educativas').get();
        if (existing.c > 0) {
            return res.json({ ok: true, msg: 'Datos ya cargados', ies: existing.c });
        }

        const iesData = [
            ['084429','SAN JOSE OBRERO','RURAL 3',true,true,false,false,null],
            ['471255','MADRE TERESA DE CALCUTA','URBANO',true,false,false,false,null],
            ['471279','TERESA GONZALES DE FANNING','RURAL 3',true,false,false,false,null],
            ['471284','RAITOS DE SOL','URBANO',true,false,false,false,null],
            ['471302','SEMILLITAS DEL SABER','URBANO',true,false,false,false,null],
            ['471316','GABRIELA MISTRAL','RURAL 2',true,false,false,false,null],
            ['471321','SANTA TERESITA','RURAL 3',true,false,false,false,null],
            ['471335','FE Y ALEGRIA','URBANO',true,false,false,false,null],
            ['471340','185','RURAL 3',true,false,false,false,null],
            ['471364','MARIA EDITH VILLACORTA PINEDO','RURAL 3',false,true,false,false,null],
            ['471378','PASITO A PASO','RURAL 2',true,false,false,false,null],
            ['471383','SANTA ROSA','URBANO',false,true,false,false,null],
            ['471397','FRANCISCO IZQUIERDO RIOS','RURAL 2',false,true,false,false,null],
            ['471415','ELVIRA RUIZ DAVILA','RURAL 3',false,true,false,false,null],
            ['471420','SAGRADO CORAZON DE JESUS','RURAL 2',true,true,false,false,null],
            ['471444','MICAELA BASTIDA PUYUCAWA','RURAL 2',false,true,false,false,null],
            ['471458','SEÑOR DE LOS MILAGROS','URBANO',true,true,false,false,null],
            ['471463','VALENTIN PANIAGUA CORAZAO','RURAL 3',false,true,true,false,null],
            ['471477','ROMAN RIVERO SALDAÑA','URBANO',true,false,false,false,null],
            ['471482','0224','RURAL 2',false,true,true,false,null],
            ['471496','ABRAHAM CARDENAS RUIZ','URBANO',false,false,true,false,'Básica Alternativa'],
            ['471509','JOSE OLAYA BALANDRA','RURAL 3',false,false,true,false,null],
            ['471514','RUBEN CACHIQUE SANGAMA','RURAL 3',false,false,true,false,null],
            ['471528','SANTIAGO ANTUNEZ DE MAYOLO','URBANO',true,true,true,false,null],
            ['471533','CIRO SALDAÑA GIRALDO','URBANO',true,true,true,false,null],
            ['471547','0001 TECNICO PRODUCTIVA','URBANO',false,false,false,false,'Técnico Productiva'],
            ['471566','MIGUEL GRAU SEMINARIO','RURAL 3',true,true,false,false,null],
            ['471571','TEODOCIA NAVARRO VEGA','RURAL 2',false,true,true,false,null],
            ['471590','SAN MARTIN DE PORRES','RURAL 2',true,false,false,false,null],
            ['471608','093','RURAL 1',true,false,false,false,null],
            ['471613','MERLIN GARCIA USHIÑAHUA','RURAL 2',true,false,false,false,null],
            ['471627','CUNITA DE AMOR','RURAL 3',true,false,false,false,null],
            ['471632','ROSALIA PEZO REYNA','RURAL 2',true,false,false,false,null],
            ['471646','MODESTA GARCIA SAAVEDRA','RURAL 2',true,false,false,false,null],
            ['471651','ALBERTO UPIACHIHUA PUYO','RURAL 1',true,true,false,false,null],
            ['471665','BENJAMIN TORRES TORRES','RURAL 1',false,true,true,false,null],
            ['471670','JOSE CARLOS MARIATEGUI','RURAL 1',false,true,true,false,null],
            ['471689','ISAAC NEWTON','RURAL 3',false,true,true,false,null],
            ['471694','SAGRADO CORAZON DE JESUS 151','RURAL 1',true,false,false,false,null],
            ['471707','ELEAZAR FASABI ZATALAYA','RURAL 1',false,true,true,false,null],
            ['471726','SARITA COLINA SAMBRANO','RURAL 1',false,true,false,false,null],
            ['471731','MANCO CAPAC','RURAL 2',false,true,true,false,null],
            ['471745','LOS HEROES DE ARICA','RURAL 1',false,true,true,false,null],
            ['471750','RAMON CASTILLA MARQUESADO','RURAL 1',false,true,false,false,null],
            ['471769','JORGE CHAVEZ DARNELL','RURAL 1',false,true,true,false,null],
            ['471774','CARLOS CUETO FERNANDINI','RURAL 2',false,true,false,false,null],
            ['471788','JUAN PINCHI URQUIA','RURAL 2',false,true,true,false,null],
            ['471793','ABELARDO PAREDES TANANTA','RURAL 2',false,true,false,false,null],
            ['471811','FERNANDO BELAUNDE TERRY','RURAL 2',false,true,true,false,null],
            ['471825','REYNALDO PAREDES SAAVEDRA','RURAL 1',true,true,false,false,null],
            ['471830','0002','RURAL 2',true,true,true,false,null],
            ['471849','SEÑOR DE LOS MILAGROS 097','RURAL 1',true,false,false,false,null],
            ['471854','JOSE F. SANCHEZ CARRION','RURAL 3',false,false,true,false,null],
            ['471868','0780','RURAL 1',false,true,false,false,null],
            ['471887','095','RURAL 3',true,false,false,false,null],
            ['471892','129','RURAL 2',true,false,false,false,null],
            ['471929','321','RURAL 3',true,false,false,false,null],
            ['471934','331','RURAL 1',true,false,false,false,null],
            ['471948','0044','RURAL 2',true,true,true,false,null],
            ['471953','0048','RURAL 2',false,true,false,false,null],
            ['471967','ANDRES AVELINO CACERES DORREGARAY','RURAL 3',false,true,true,false,null],
            ['471972','0085','RURAL 2',false,true,false,false,null],
            ['471991','0136','RURAL 2',false,true,false,false,null],
            ['472014','0141','RURAL 2',true,true,false,false,null],
            ['472028','0142','RURAL 3',false,true,false,false,null],
            ['472052','0298','RURAL 2',true,true,false,false,null],
            ['472066','0475','RURAL 3',false,true,true,false,null],
            ['472071','0577','RURAL 3',true,true,true,false,null],
            ['472085','0724','RURAL 2',false,true,false,false,null],
            ['472113','AGROPECUARIO DOS UNIDOS','RURAL 3',false,false,true,false,null],
            ['472212','JOSE GABRIEL CONDORCANQUI','URBANO',true,true,true,false,null],
            ['472245','EMILIA BARCIA BONIFATTI','URBANO',true,false,false,false,null],
            ['472250','MARIA CALVO RUIZ','RURAL 3',true,false,false,false,null],
            ['472269','ANTORCHA DEL SABER','RURAL 2',true,false,false,false,null],
            ['472274','CORONEL LEONCIO PRADO','RURAL 2',false,true,false,false,null],
            ['472288','HUMBERTO DEL AGUILA ARRIEGA','RURAL 2',false,true,false,false,null],
            ['472293','0045','RURAL 2',false,true,false,false,null],
            ['472306','JOSE DE LA TORRE UGARTE','RURAL 2',false,true,false,false,null],
            ['472311','0174','RURAL 3',false,true,true,false,null],
            ['472330','005','RURAL 2',true,false,false,false,null],
            ['472349','0202','URBANO',false,true,false,false,null],
            ['472354','0267','RURAL 2',false,true,false,false,null],
            ['472368','ALFONSO UGARTE VERNAL','RURAL 2',false,true,false,false,null],
            ['472373','MARIA ANDREA PARADO DE BELLIDO','RURAL 2',true,false,false,false,null],
            ['472392','JOSE SANTOS CHOCANO GASTANODI','RURAL 3',true,true,true,false,null],
            ['472410','PASCUAL SANGAMA VALLES','RURAL 2',false,true,false,false,null],
            ['472429','JUAN DE LA CRUZ SALAS SALAS','RURAL 2',false,true,false,false,null],
            ['472448','JUAN VELASCO ALVARADO','URBANO',false,false,true,false,'Básica Alternativa'],
            ['472453','JOSE AVELARDO QUIÑONES GONZALES','RURAL 2',false,true,false,false,null],
            ['472467','RICARDO PALMA','RURAL 3',true,true,true,false,null],
            ['472472','CARMELA PERDOMO PANDURO','RURAL 2',true,false,false,false,null],
            ['472486','JUSTINIANO SHUÑA PAIMA','RURAL 2',false,true,false,false,null],
            ['472491','MARIA ELENA MOYANO','RURAL 2',true,false,false,false,null],
            ['472518','ROSA MERINO','URBANO',true,false,false,false,null],
            ['472523','IGANCIO ISUIZA SANANCINA','RURAL 2',false,true,false,false,null],
            ['472542','AMIGUITOS DE JESUS','RURAL 3',true,false,false,false,null],
            ['472556','LOS ANGELITOS DE PALESTINA','RURAL 2',true,false,false,false,null],
            ['472561','CORAZONES TIERNOS','RURAL 3',true,false,false,false,null],
            ['472575','DIVINO NIÑO JESUS','RURAL 3',true,false,false,false,null],
            ['472580','CESAR VALLEJO MENDOZA','RURAL 3',false,true,false,false,null],
            ['472617','MERVIN TANANTA GARCIA','RURAL 2',false,true,false,false,null],
            ['472622','NATIVIDAD BARRERA ARELLANO','RURAL 2',false,true,false,false,null],
            ['472636','JESUS EL BUEN MAESTRO','RURAL 3',false,true,false,false,null],
            ['472641','IMACULADA CONCEPCION','RURAL 3',false,true,false,false,null],
            ['472660','DANIEL ALCIDES CARRION','RURAL 3',true,true,true,false,null],
            ['472679','SAN JUAN BAUTISTA','RURAL 3',false,false,true,false,null],
            ['472684','FRANCISCO BOLOGNESI','RURAL 3',false,false,true,false,null],
            ['472698','JUAN DANIEL DEL AGUILA VELASQUEZ','RURAL 3',false,true,false,false,null],
            ['474466','RAMON RODRIGUEZ RIOS','RURAL 3',true,false,false,false,null],
            ['474471','OSCAR PANDURO DAVILA','RURAL 3',false,true,false,false,null],
            ['474485','JULIO PIZARRO CARDENAS','RURAL 3',false,false,true,false,null],
            ['520859','CORPUS CHRISTE','RURAL 3',true,true,true,false,null],
            ['523650','VIRGITA ALVARADO CARDENAS','RURAL 3',false,true,false,false,null],
            ['523669','ANGELITOS DEL SABER','RURAL 3',true,false,false,false,null],
            ['533159','0720','RURAL 1',false,true,false,false,null],
            ['541381','0721','RURAL 1',false,true,true,false,null],
            ['541395','0718','RURAL 1',false,true,false,false,null],
            ['555274','0080','RURAL 1',true,true,false,false,null],
            ['555368','0751 INICIAL','RURAL 1',true,false,false,false,null],
            ['562156','SAN ANTONIO DE PADUA','RURAL 2',true,true,false,false,null],
            ['562175','INTERCULTURAL BILINGUE','RURAL 1',false,true,true,false,null],
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
            ['804565','0751 PRIMARIA','RURAL 1',false,true,false,false,null],
            ['804631','0779','RURAL 1',true,true,true,false,null],
            ['804754','0781','RURAL 1',false,true,false,false,null],
            ['805447','0007','RURAL 1',false,true,false,false,null],
            ['805452','JULIO RAMON RIBEYRO','RURAL 1',true,true,true,false,null],
            ['805541','JOSE DEL CARMEN MARIN ARISTA','RURAL 1',true,true,true,false,null],
            ['806220','0001 BASICA ESPECIAL','URBANO',false,false,false,false,'Básica Especial'],
            ['806244','0726','RURAL 1',false,true,false,false,null],
            ['806258','MARIANO MELGAR Y VALDIVIESO','RURAL 2',true,true,true,false,null],
            ['806282','PEDRO VILCA APAZA','RURAL 2',false,true,false,false,null],
            ['806296','0723','RURAL 1',false,true,false,false,null],
            ['806300','CIRO ALEGRIA BAZAN','RURAL 1',true,true,false,false,null],
            ['806319','0689','RURAL 2',true,true,true,false,null],
            ['806324','0688','RURAL 1',true,true,true,false,null],
            ['806338','MICAELA BASTIDAS 0716','RURAL 1',true,true,false,false,null],
            ['806362','GILBERTO SATALAYA TUANAMA','RURAL 1',false,true,false,false,null],
            ['806376','MI PEQUEÑO UNIVERSO','RURAL 2',true,false,false,false,null],
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
            ['903773','EDGAR ANTONIO CHAVEZ GIL','RURAL 1',true,true,false,false,null],
            ['911971','467','RURAL 2',true,false,false,false,null],
            ['999247','NUEVO AMANECER','RURAL 2',true,true,false,false,null],
            ['867497','ODEC BELLAVISTA','URBANO',false,false,false,false,'No aplica'],
            ['472047','AGROPECUARIO DOS UNIDOS PRIM','RURAL 3',false,true,false,false,null],
            ['471910','AGROPECUARIO DOS UNIDOS INIC','RURAL 3',true,false,false,false,null]
        ];

        for (const ie of iesData) {
            await db.prepare(
                'INSERT INTO instituciones_educativas (codigo, nombre, ruralidad, tiene_inicial, tiene_primaria, tiene_secundaria, tiene_otros, tipo_otros) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (codigo) DO NOTHING'
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
