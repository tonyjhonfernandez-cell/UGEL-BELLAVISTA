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
        
        // Asegurar que las columnas nuevas existan
        console.log('Verificando columnas de niveles educativos...');
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
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS es_modalidad_alternativa BOOLEAN DEFAULT false");
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS codigo_base VARCHAR(20)");
        await pool.query("ALTER TABLE instituciones_educativas ADD COLUMN IF NOT EXISTS modelo VARCHAR(20)");
        console.log('Columnas verificadas OK.');
        
        // Obtener IDs de niveles educativos
        const { rows: dbNiveles } = await pool.query('SELECT id, clave FROM niveles_educativos WHERE activo = true');
        const claveToId = {};
        for (const row of dbNiveles) {
            claveToId[row.clave] = row.id;
        }

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
            const levelStr = String(rawNivel || '').trim().toLowerCase();
            
            // Detectar modalidades alternativas que necesitan entrada separada
            const isEBA = levelStr.includes('básica alternativa') || levelStr.includes('basica alternativa') || levelStr.includes('eba');
            const isCETPRO = levelStr.includes('cetpro') || levelStr.includes('técnico productiv') || levelStr.includes('tecnico productiv');
            
            // Si es PRONOEI, usamos el código modular de 7 dígitos como su código único local
            // Si es EBA o CETPRO, usamos código local + sufijo para crear entrada independiente
            let localCode;
            if (isPRONOEI) {
                localCode = modularCode;
            } else if (isEBA) {
                localCode = padLocal(rawLocal) + '-EBA';
            } else if (isCETPRO) {
                localCode = padLocal(rawLocal) + '-CET';
            } else {
                localCode = padLocal(rawLocal);
            }
            
            if (!localCode) continue;
            
            if (!schoolsMap[localCode]) {
                schoolsMap[localCode] = {
                    codigo: localCode,
                    codigo_base: (isEBA || isCETPRO) ? padLocal(rawLocal) : null,
                    es_modalidad_alternativa: (isEBA || isCETPRO),
                    nombre: String(row[4] || '').trim().replace(/\s+/g, ' '),
                    ruralidad: '',
                    tiene_inicial: false,
                    tiene_cuna_jardin: false,
                    tiene_primaria: false,
                    tiene_secundaria: false,
                    tiene_ebe: false,
                    tiene_cetpro: false,
                    tiene_pronoei: false,
                    tiene_eba: false,
                    tiene_otros: false,
                    tipo_otros: null,
                    cm_inicial: null,
                    cm_cuna_jardin: null,
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
                    directores: [],
                    niveles: []
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
            // Normalizar tildes para comparación
            const levelNorm = level.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            let mappedClave = null;
            if (levelNorm.includes('basica alternativa') || levelNorm.includes('eba') || levelNorm.includes('adulto')) {
                school.tiene_eba = true;
                school.cm_eba = modularCode;
                if (levelNorm.includes('avanzado')) {
                    mappedClave = 'eba_avanzado';
                } else {
                    mappedClave = 'eba_intermedio';
                }
            } else if (levelNorm.includes('cetpro') || levelNorm.includes('tecnico productiv')) {
                school.tiene_cetpro = true;
                school.cm_cetpro = modularCode;
                mappedClave = 'cetpro';
            } else if (levelNorm.includes('pronoei') || levelNorm.includes('pronoi')) {
                school.tiene_pronoei = true;
                school.cm_pronoei = modularCode;
                mappedClave = 'pronoei';
            } else if (levelNorm.includes('ebe') || levelNorm.includes('basica especial')) {
                school.tiene_ebe = true;
                school.cm_ebe = modularCode;
                mappedClave = 'ebe';
            } else if (levelNorm.includes('cuna')) {
                school.tiene_cuna_jardin = true;
                school.cm_cuna_jardin = modularCode;
                mappedClave = 'cuna_jardin';
            } else if (levelNorm.includes('inicial') || levelNorm.includes('jardin')) {
                school.tiene_inicial = true;
                school.cm_inicial = modularCode;
                mappedClave = 'inicial';
            } else if (levelNorm.includes('primaria')) {
                school.tiene_primaria = true;
                school.cm_primaria = modularCode;
                mappedClave = 'primaria';
            } else if (levelNorm.includes('secundaria')) {
                school.tiene_secundaria = true;
                school.cm_secundaria = modularCode;
                mappedClave = 'secundaria';
            } else {
                school.tiene_otros = true;
                school.tipo_otros = String(rawNivel || '').trim();
            }

            if (mappedClave) {
                const already = school.niveles.some(n => n.clave === mappedClave);
                if (!already) {
                    school.niveles.push({ clave: mappedClave, codigo_modular: modularCode });
                }
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
                        tiene_inicial = $3, tiene_cuna_jardin = $4, tiene_primaria = $5, tiene_secundaria = $6, tiene_otros = $7,
                        tipo_otros = $8, cm_inicial = $9, cm_cuna_jardin = $10, cm_primaria = $11, cm_secundaria = $12,
                        tipo = $13, provincia = $14, distrito = $15, lugar = $16,
                        tiene_ebe = $17, tiene_cetpro = $18, tiene_pronoei = $19, tiene_eba = $20,
                        cm_ebe = $21, cm_cetpro = $22, cm_pronoei = $23, cm_eba = $24,
                        es_modalidad_alternativa = $25, codigo_base = $26,
                        activa = true
                    WHERE codigo = $27
                `, [
                    school.nombre, school.ruralidad,
                    school.tiene_inicial, school.tiene_cuna_jardin, school.tiene_primaria, school.tiene_secundaria, school.tiene_otros,
                    school.tipo_otros, school.cm_inicial, school.cm_cuna_jardin, school.cm_primaria, school.cm_secundaria,
                    school.tipo || null, school.provincia || null, school.distrito || null, school.lugar || null,
                    school.tiene_ebe, school.tiene_cetpro, school.tiene_pronoei, school.tiene_eba,
                    school.cm_ebe, school.cm_cetpro, school.cm_pronoei, school.cm_eba,
                    school.es_modalidad_alternativa, school.codigo_base || null,
                    school.codigo
                ]);
                ieUpdated++;
            } else {
                await pool.query(`
                    INSERT INTO instituciones_educativas (
                        codigo, nombre, ruralidad,
                        tiene_inicial, tiene_cuna_jardin, tiene_primaria, tiene_secundaria, tiene_otros,
                        tipo_otros, cm_inicial, cm_cuna_jardin, cm_primaria, cm_secundaria,
                        tipo, provincia, distrito, lugar,
                        tiene_ebe, tiene_cetpro, tiene_pronoei, tiene_eba,
                        cm_ebe, cm_cetpro, cm_pronoei, cm_eba,
                        es_modalidad_alternativa, codigo_base,
                        activa
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, true)
                `, [
                    school.codigo, school.nombre, school.ruralidad,
                    school.tiene_inicial, school.tiene_cuna_jardin, school.tiene_primaria, school.tiene_secundaria, school.tiene_otros,
                    school.tipo_otros, school.cm_inicial, school.cm_cuna_jardin, school.cm_primaria, school.cm_secundaria,
                    school.tipo || null, school.provincia || null, school.distrito || null, school.lugar || null,
                    school.tiene_ebe, school.tiene_cetpro, school.tiene_pronoei, school.tiene_eba,
                    school.cm_ebe, school.cm_cetpro, school.cm_pronoei, school.cm_eba,
                    school.es_modalidad_alternativa, school.codigo_base || null
                ]);
                ieInserted++;
            }
            
            // Obtener el ID de la IE insertada/actualizada
            const ieId = (await pool.query('SELECT id FROM instituciones_educativas WHERE codigo = $1', [school.codigo])).rows[0].id;
            
            // Sincronizar ie_niveles
            await pool.query('DELETE FROM ie_niveles WHERE ie_id = $1', [ieId]);
            for (const nv of school.niveles) {
                const nivelId = claveToId[nv.clave];
                if (nivelId) {
                    await pool.query(
                        'INSERT INTO ie_niveles (ie_id, nivel_id, codigo_modular) VALUES ($1, $2, $3) ON CONFLICT (ie_id, nivel_id) DO UPDATE SET codigo_modular = EXCLUDED.codigo_modular',
                        [ieId, nivelId, nv.codigo_modular || null]
                    );
                }
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
        }
        
        console.log('Actualizando modelos EIB y JEC...');
        const eibCodes = ['562175', '668394', '768652', '768671', '806282', '806362', '471340', '471415', '471514', '471632', '471707', '471731', '472354', '472392', '472453'];
        const jecCodes = ['0537183', '0537282', '0537381', '0548818', '0548917', '0726323'];
        await pool.query("UPDATE instituciones_educativas SET modelo = NULL");
        await pool.query("UPDATE instituciones_educativas SET modelo = 'EIB' WHERE codigo = ANY($1)", [eibCodes]);
        await pool.query("UPDATE instituciones_educativas SET modelo = 'JEC' WHERE cm_secundaria = ANY($1)", [jecCodes]);
        console.log('Modelos actualizados OK.');
        
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
