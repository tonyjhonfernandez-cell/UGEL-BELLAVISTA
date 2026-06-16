require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'eventos_calendario'").then(res => {
    console.log(res.rows);
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});
