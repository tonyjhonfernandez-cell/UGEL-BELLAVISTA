require('dotenv').config({ path: 'c:\\\\Users\\\\jrengifo\\\\Desktop\\\\SISTEMA_MONITOREO\\\\.env' });
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.query("INSERT INTO eventos_calendario (supervisor_id, titulo, descripcion, estado, fecha, hora_inicio, hora_fin, area, sub_area) VALUES (1, 'Test', 'Desc', 'Pendiente', '2026-06-15', '09:00', '10:00', 'Area 1', 'Sub 1') RETURNING id")
.then(res => {
    console.log("Insert result:", res.rows);
    return pool.query("SELECT id, titulo, fecha, hora_inicio, hora_fin, fecha || 'T' || hora_inicio as start, fecha || 'T' || hora_fin as end FROM eventos_calendario");
})
.then(res => {
    console.log("Select result:", res.rows);
    process.exit(0);
})
.catch(e => {
    console.error(e);
    process.exit(1);
});
