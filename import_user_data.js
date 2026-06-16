const { Pool } = require('pg');
const fs = require('fs');

const url = fs.readFileSync('.env.txt', 'utf8').split('=').slice(1).join('=').trim();
const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
});

function normalizeStr(str) {
    if (!str) return '';
    return str.toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

async function run() {
    try {
        const text = fs.readFileSync('user_pasted.tsv', 'utf8');
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        
        const dbIes = await pool.query('SELECT id, nombre, codigo FROM instituciones_educativas');
        const ieMap = new Map();
        dbIes.rows.forEach(ie => {
            ieMap.set(normalizeStr(ie.nombre), ie);
            const match = ie.nombre.match(/^0*(\d+)/);
            if (match && match[1]) {
                ieMap.set(match[1], ie);
            }
        });

        let cmUpdates = 0;
        let notFound = 0;

        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length < 7) continue;
            
            const codMod = parts[3].trim();
            const nombreIE = parts[5].trim();
            const nivel = parts[6].toLowerCase();
            
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
                let col = null;
                if (nivel.includes('inicial')) col = 'cm_inicial';
                else if (nivel.includes('primaria')) col = 'cm_primaria';
                else if (nivel.includes('secundaria')) col = 'cm_secundaria';
                
                if (col) {
                    await pool.query(`UPDATE instituciones_educativas SET ${col} = $1 WHERE id = $2`, [codMod, matchedIE.id]);
                    cmUpdates++;
                }
            } else {
                console.log(`NO MATCH: ${nombreIE} (${codMod}) en nivel ${nivel}`);
                notFound++;
            }
        }
        
        console.log(`\n¡Hecho! Se actualizaron ${cmUpdates} códigos modulares. No se encontraron ${notFound} IEs.`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
