require('dotenv').config();
const { Pool } = require('pg');
const xlsx = require('xlsx');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

function normalizeStr(str) {
    if (!str) return '';
    return str.toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

async function runImport() {
    try {
        console.log('Iniciando importación...');
        
        // 1. IMPORTAR CÓDIGOS MODULARES
        const codigosPath = path.join(__dirname, 'codigos modulares.xlsx');
        const cmWorkbook = xlsx.readFile(codigosPath);
        
        const dbIes = await pool.query('SELECT id, nombre, codigo FROM instituciones_educativas');
        const ieMap = new Map();
        dbIes.rows.forEach(ie => {
            ieMap.set(normalizeStr(ie.nombre), ie);
            // También mapeamos partes numéricas como clave alternativa (ej: "0208" para "0208 SANTIAGO ANTUNEZ...")
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

        for (const nivel of niveles) {
            if (!cmWorkbook.Sheets[nivel.sheet]) continue;
            // Para inical y primaria los headers están en index 0, secundaria en index 1
            const startRow = nivel.sheet === 'secunadaria' ? 2 : 1; 
            const rows = xlsx.utils.sheet_to_json(cmWorkbook.Sheets[nivel.sheet], { header: 1 });
            
            for (let i = startRow; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length < 9) continue;
                
                const codMod = (row[6] || '').toString().trim();
                const nombreIE = (row[8] || '').toString().trim();
                
                if (!codMod || !nombreIE) continue;

                // Intentar match
                const normName = normalizeStr(nombreIE);
                let matchedIE = ieMap.get(normName);
                
                // Si no coincide, intentar por número si empieza con número
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
                    console.log(`NO MATCH: ${nombreIE} (${codMod}) en nivel ${nivel.col}`);
                }
            }
        }
        console.log(`Se actualizaron ${cmUpdates} códigos modulares en IEs.`);

        // 2. IMPORTAR SUPERVISORES
        const supPath = path.join(__dirname, 'DATA COLABORADORES- UGEL BELLAVISTA 2026.xlsx');
        const supWorkbook = xlsx.readFile(supPath);
        const sheetSup = supWorkbook.Sheets[supWorkbook.SheetNames[0]]; // MAYO
        const supRows = xlsx.utils.sheet_to_json(sheetSup, { header: 1 });
        
        let supCount = 0;
        // Data empieza en index 2
        for (let i = 2; i < supRows.length; i++) {
            const row = supRows[i];
            if (!row || !row[1] || row[1].toString().trim().toLowerCase() !== 'bellavista') continue; // Asegurar que es fila válida
            
            const nombre = (row[3] || '').toString().trim();
            const apellidos = (row[4] || '').toString().trim();
            const nombreCompleto = `${nombre} ${apellidos}`.trim();
            const dni = (row[5] || '').toString().trim();
            const dependencia = (row[8] || '').toString().trim();
            const puesto = (row[9] || '').toString().trim();
            const celular = (row[10] || '').toString().trim();
            const email = (row[11] || '').toString().trim();
            
            if (!nombre || !dni) continue;

            // Generar usuario: primer nombre . primer apellido
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

            // Buscar si ya existe por DNI o por nombre
            const existing = await pool.query("SELECT id, usuario FROM usuarios WHERE dni = $1 OR nombre_completo = $2", [dni, nombreCompleto]);
            
            if (existing.rows.length > 0) {
                // Actualizar
                const uId = existing.rows[0].id;
                // Asegurar usuario único
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
                // Insertar
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
        console.log(`Se procesaron ${supCount} supervisores.`);

        console.log('¡Importación completada!');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

runImport();
