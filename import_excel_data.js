require('dotenv').config();
const { Pool } = require('pg');
const xlsx = require('xlsx');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

function padLocal(val) {
    if (val === undefined || val === null) return '';
    const s = String(val).trim();
    if (!s) return '';
    return s.padStart(6, '0');
}

function padModular(val) {
    if (val === undefined || val === null) return '';
    const s = String(val).trim();
    if (!s) return '';
    return s.padStart(7, '0');
}

async function runImport() {
    try {
        console.log('Iniciando importación desde datos.xlsx.xlsx...');
        
        const excelPath = path.join(__dirname, 'datos.xlsx.xlsx');
        const workbook = xlsx.readFile(excelPath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Cargar filas
        const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        console.log(`Total de filas leídas del Excel (incluyendo cabecera): ${rows.length}`);
        
        // Agrupar filas por CÓDIGO LOCAL (o por CÓDIGO MODULAR si es PRONOEI)
        const schoolsMap = {};
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            
            const rawLocal = row[0];
            const rawModular = row[1];
            const rawNivel = row[5];
            
            if (rawLocal === undefined || rawLocal === null || rawModular === undefined || rawModular === null) {
                continue; // fila vacía o inválida
            }
            
            const isPRONOEI = String(rawLocal).trim() === '999999' || String(rawNivel).trim().toUpperCase() === 'PRONOEI';
            const modularCode = padModular(rawModular);
            
            // Si es PRONOEI, usamos el código modular de 7 dígitos como su código único local
            const localCode = isPRONOEI ? modularCode : padLocal(rawLocal);
            
            if (!localCode) continue;
            
            if (!schoolsMap[localCode]) {
                schoolsMap[localCode] = {
                    codigo: localCode,
                    nombre: String(row[4] || '').trim().replace(/\s+/g, ' '),
                    ruralidad: '',
                    tiene_inicial: false,
                    tiene_primaria: false,
                    tiene_secundaria: false,
                    tiene_ebe: false,
                    tiene_cetpro: false,
                    tiene_pronoei: false,
                    tiene_eba: false,
                    tiene_otros: false,
                    tipo_otros: null,
                    cm_inicial: null,
                    cm_primaria: null,
                    cm_secundaria: null,
                    cm_ebe: null,
                    cm_cetpro: null,
                    cm_pronoei: null,
                    cm_eba: null,
                    tipo: '',
                    provincia: '',
                    distrito: '',
                    lugar: '',
                    directores: []
                };
            }
            
            const school = schoolsMap[localCode];
            
            // Ruralidad
            let rurality = String(row[2] || '').trim().toUpperCase();
            if (rurality === 'URBANA') rurality = 'URBANO';
            if (rurality && !school.ruralidad) {
                school.ruralidad = rurality;
            }
            
            // Tipo, Provincia, Distrito, Lugar
            if (row[3] && !school.tipo) school.tipo = String(row[3]).trim().toUpperCase();
            if (row[6] && !school.provincia) school.provincia = String(row[6]).trim().toUpperCase();
            if (row[7] && !school.distrito) school.distrito = String(row[7]).trim().toUpperCase();
            if (row[8] && !school.lugar) school.lugar = String(row[8]).trim().toUpperCase();
            
            // Mapear niveles y códigos modulares
            const level = String(rawNivel || '').trim().toLowerCase();
            if (level.includes('inicial') || level.includes('jardin') || level.includes('cuna')) {
                school.tiene_inicial = true;
                school.cm_inicial = modularCode;
            } else if (level.includes('primaria')) {
                school.tiene_primaria = true;
                school.cm_primaria = modularCode;
            } else if (level.includes('secundaria')) {
                school.tiene_secundaria = true;
                school.cm_secundaria = modularCode;
            } else if (level.includes('ebe') || level === 'educacion basica especial') {
                school.tiene_ebe = true;
                school.cm_ebe = modularCode;
            } else if (level.includes('cetpro') || level.includes('tecnico productiv')) {
                school.tiene_cetpro = true;
                school.cm_cetpro = modularCode;
            } else if (level.includes('pronoei') || level.includes('pronoi')) {
                school.tiene_pronoei = true;
                school.cm_pronoei = modularCode;
            } else if (level.includes('eba') || level.includes('educacion basica alternativa') || level.includes('adulto')) {
                school.tiene_eba = true;
                school.cm_eba = modularCode;
            } else {
                school.tiene_otros = true;
                school.tipo_otros = String(rawNivel || '').trim();
            }
            
            // Director
            const dirName = String(row[9] || '').trim().replace(/\s+/g, ' ');
            const dirEmail = String(row[10] || '').trim();
            const dirPhone = String(row[11] || '').trim();
            if (dirName) {
                school.directores.push({
                    nombre: dirName,
                    email: dirEmail,
                    telefono: dirPhone
                });
            }
        }
        
        const uniqueSchools = Object.values(schoolsMap);
        console.log(`Se identificaron ${uniqueSchools.length} instituciones únicas (incluyendo PRONOEIs individuales).`);
        
        let ieInserted = 0;
        let ieUpdated = 0;
        let dirProcessed = 0;
        
        // Conexión y transacciones a la base de datos
        for (const school of uniqueSchools) {
            // Decidir director principal
            const primaryDir = school.directores[0] || {
                nombre: school.nombre, // fallback si no hay director
                email: '',
                telefono: ''
            };
            
            // 1. Insertar / Actualizar Institución Educativa
            const ieCheck = await pool.query('SELECT id FROM instituciones_educativas WHERE codigo = $1', [school.codigo]);
            const exists = ieCheck.rows.length > 0;
            
            if (exists) {
                await pool.query(`
                    UPDATE instituciones_educativas 
                    SET nombre = $1, ruralidad = $2, 
                        tiene_inicial = $3, tiene_primaria = $4, tiene_secundaria = $5, tiene_otros = $6, 
                        tipo_otros = $7, cm_inicial = $8, cm_primaria = $9, cm_secundaria = $10,
                        tipo = $11, provincia = $12, distrito = $13, lugar = $14,
                        tiene_ebe = $15, tiene_cetpro = $16, tiene_pronoei = $17, tiene_eba = $18,
                        cm_ebe = $19, cm_cetpro = $20, cm_pronoei = $21, cm_eba = $22,
                        activa = true
                    WHERE codigo = $23
                `, [
                    school.nombre, school.ruralidad, 
                    school.tiene_inicial, school.tiene_primaria, school.tiene_secundaria, school.tiene_otros,
                    school.tipo_otros, school.cm_inicial, school.cm_primaria, school.cm_secundaria,
                    school.tipo || null, school.provincia || null, school.distrito || null, school.lugar || null,
                    school.tiene_ebe, school.tiene_cetpro, school.tiene_pronoei, school.tiene_eba,
                    school.cm_ebe, school.cm_cetpro, school.cm_pronoei, school.cm_eba,
                    school.codigo
                ]);
                ieUpdated++;
            } else {
                await pool.query(`
                    INSERT INTO instituciones_educativas (
                        codigo, nombre, ruralidad, 
                        tiene_inicial, tiene_primaria, tiene_secundaria, tiene_otros, 
                        tipo_otros, cm_inicial, cm_primaria, cm_secundaria,
                        tipo, provincia, distrito, lugar,
                        tiene_ebe, tiene_cetpro, tiene_pronoei, tiene_eba,
                        cm_ebe, cm_cetpro, cm_pronoei, cm_eba,
                        activa
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, true)
                `, [
                    school.codigo, school.nombre, school.ruralidad, 
                    school.tiene_inicial, school.tiene_primaria, school.tiene_secundaria, school.tiene_otros,
                    school.tipo_otros, school.cm_inicial, school.cm_primaria, school.cm_secundaria,
                    school.tipo || null, school.provincia || null, school.distrito || null, school.lugar || null,
                    school.tiene_ebe, school.tiene_cetpro, school.tiene_pronoei, school.tiene_eba,
                    school.cm_ebe, school.cm_cetpro, school.cm_pronoei, school.cm_eba
                ]);
                ieInserted++;
            }
            
            // 2. Insertar / Actualizar Director de la IE
            const username = `director.${school.codigo}`;
            const defaultPassword = school.codigo; // El código local (o modular en caso de PRONOEI) es su contraseña inicial
            
            await pool.query(`
                INSERT INTO usuarios (
                    nombre_completo, ie_codigo, rol, usuario, password, email, telefono, activo
                ) VALUES ($1, $2, 'director', $3, $4, $5, $6, true)
                ON CONFLICT (usuario) DO UPDATE SET
                    nombre_completo = EXCLUDED.nombre_completo,
                    ie_codigo = EXCLUDED.ie_codigo,
                    email = EXCLUDED.email,
                    telefono = EXCLUDED.telefono,
                    password = COALESCE(usuarios.password, EXCLUDED.password),
                    activo = true
            `, [
                primaryDir.nombre, school.codigo, username, defaultPassword,
                primaryDir.email || null, primaryDir.telefono || null
            ]);
            dirProcessed++;
        }
        
        console.log('\n--- Resumen de la Importación ---');
        console.log(`IEs creadas: ${ieInserted}`);
        console.log(`IEs actualizadas: ${ieUpdated}`);
        console.log(`Directores procesados (creados/actualizados): ${dirProcessed}`);
        console.log('¡Importación finalizada con éxito!');
        process.exit(0);
    } catch (err) {
        console.error('Error durante la importación:', err);
        process.exit(1);
    }
}

runImport();
