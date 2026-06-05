require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

function toPgSql(sql) {
    let i = 0;
    return String(sql).replace(/\?/g, () => `$${++i}`);
}

const db = {
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

const ies = [
    { codigo: '084429', nombre: 'SAN JOSE OBRERO', ruralidad: 'RURAL 3', inicial: true, primaria: true, secundaria: false },
    { codigo: '471255', nombre: 'MADRE TERESA DE CALCUTA', ruralidad: 'URBANO', inicial: true, primaria: false, secundaria: false },
    { codigo: '471279', nombre: 'TERESA GONZALES DE FANNING', ruralidad: 'RURAL 3', inicial: true, primaria: false, secundaria: false },
    { codigo: '471284', nombre: 'RAITOS DE SOL', ruralidad: 'URBANO', inicial: true, primaria: false, secundaria: false },
    { codigo: '471302', nombre: 'SEMILLITAS DEL SABER', ruralidad: 'URBANO', inicial: true, primaria: false, secundaria: false },
    { codigo: '471316', nombre: 'GABRIELA MISTRAL', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '471321', nombre: 'SANTA TERESITA', ruralidad: 'RURAL 3', inicial: true, primaria: false, secundaria: false },
    { codigo: '471335', nombre: 'FE Y ALEGRIA', ruralidad: 'URBANO', inicial: true, primaria: false, secundaria: false },
    { codigo: '471340', nombre: '185', ruralidad: 'RURAL 3', inicial: true, primaria: false, secundaria: false },
    { codigo: '471364', nombre: 'MARIA EDITH VILLACORTA PINEDO', ruralidad: 'RURAL 3', inicial: false, primaria: true, secundaria: false },
    { codigo: '471378', nombre: 'PASITO A PASO', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '471383', nombre: 'SANTA ROSA', ruralidad: 'URBANO', inicial: false, primaria: true, secundaria: false },
    { codigo: '471397', nombre: 'FRANCISCO IZQUIERDO RIOS', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '471415', nombre: 'ELVIRA RUIZ DAVILA', ruralidad: 'RURAL 3', inicial: false, primaria: true, secundaria: false },
    { codigo: '471420', nombre: 'SAGRADO CORAZON DE JESUS', ruralidad: 'RURAL 2', inicial: true, primaria: true, secundaria: false },
    { codigo: '471444', nombre: 'MICAELA BASTIDA PUYUCAWA', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '471458', nombre: 'SEÑOR DE LOS MILAGROS', ruralidad: 'URBANO', inicial: true, primaria: true, secundaria: false },
    { codigo: '471463', nombre: 'VALENTIN PANIAGUA CORAZAO', ruralidad: 'RURAL 3', inicial: false, primaria: true, secundaria: true },
    { codigo: '471477', nombre: 'ROMAN RIVERO SALDAÑA', ruralidad: 'URBANO', inicial: true, primaria: false, secundaria: false },
    { codigo: '471482', nombre: '0224', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: true },
    { codigo: '471496', nombre: 'ABRAHAM CARDENAS RUIZ', ruralidad: 'URBANO', inicial: false, primaria: false, secundaria: true, otros: 'Básica Alternativa' },
    { codigo: '471509', nombre: 'JOSE OLAYA BALANDRA', ruralidad: 'RURAL 3', inicial: false, primaria: false, secundaria: true },
    { codigo: '471514', nombre: 'RUBEN CACHIQUE SANGAMA', ruralidad: 'RURAL 3', inicial: false, primaria: false, secundaria: true },
    { codigo: '471528', nombre: 'SANTIAGO ANTUNEZ DE MAYOLO', ruralidad: 'URBANO', inicial: true, primaria: true, secundaria: true },
    { codigo: '471533', nombre: 'CIRO SALDAÑA GIRALDO', ruralidad: 'URBANO', inicial: true, primaria: true, secundaria: true },
    { codigo: '471547', nombre: '0001 TECNICO PRODUCTIVA', ruralidad: 'URBANO', inicial: false, primaria: false, secundaria: false, otros: 'Técnico Productiva' },
    { codigo: '471566', nombre: 'MIGUEL GRAU SEMINARIO', ruralidad: 'RURAL 3', inicial: true, primaria: true, secundaria: false },
    { codigo: '471571', nombre: 'TEODOCIA NAVARRO VEGA', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: true },
    { codigo: '471590', nombre: 'SAN MARTIN DE PORRES', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '471608', nombre: '093', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '471613', nombre: 'MERLIN GARCIA USHIÑAHUA', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '471627', nombre: 'CUNITA DE AMOR', ruralidad: 'RURAL 3', inicial: true, primaria: false, secundaria: false },
    { codigo: '471632', nombre: 'ROSALIA PEZO REYNA', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '471646', nombre: 'MODESTA GARCIA SAAVEDRA', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '471651', nombre: 'ALBERTO UPIACHIHUA PUYO', ruralidad: 'RURAL 1', inicial: true, primaria: true, secundaria: false },
    { codigo: '471665', nombre: 'BENJAMIN TORRES TORRES', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: true },
    { codigo: '471670', nombre: 'JOSE CARLOS MARIATEGUI', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: true },
    { codigo: '471689', nombre: 'ISAAC NEWTON', ruralidad: 'RURAL 3', inicial: false, primaria: true, secundaria: true },
    { codigo: '471694', nombre: 'SAGRADO CORAZON DE JESUS 151', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '471707', nombre: 'ELEAZAR FASABI ZATALAYA', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: true },
    { codigo: '471726', nombre: 'SARITA COLINA SAMBRANO', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: false },
    { codigo: '471731', nombre: 'MANCO CAPAC', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: true },
    { codigo: '471745', nombre: 'LOS HEROES DE ARICA', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: true },
    { codigo: '471750', nombre: 'RAMON CASTILLA MARQUESADO', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: false },
    { codigo: '471769', nombre: 'JORGE CHAVEZ DARNELL', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: true },
    { codigo: '471774', nombre: 'CARLOS CUETO FERNANDINI', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '471788', nombre: 'JUAN PINCHI URQUIA', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: true },
    { codigo: '471793', nombre: 'ABELARDO PAREDES TANANTA', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '471811', nombre: 'FERNANDO BELAUNDE TERRY', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: true },
    { codigo: '471825', nombre: 'REYNALDO PAREDES SAAVEDRA', ruralidad: 'RURAL 1', inicial: true, primaria: true, secundaria: false },
    { codigo: '471830', nombre: '0002', ruralidad: 'RURAL 2', inicial: true, primaria: true, secundaria: true },
    { codigo: '471849', nombre: 'SEÑOR DE LOS MILAGROS 097', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '471854', nombre: 'JOSE F. SANCHEZ CARRION', ruralidad: 'RURAL 3', inicial: false, primaria: false, secundaria: true },
    { codigo: '471868', nombre: '0780', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: false },
    { codigo: '471887', nombre: '095', ruralidad: 'RURAL 3', inicial: true, primaria: false, secundaria: false },
    { codigo: '471892', nombre: '129', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '471929', nombre: '321', ruralidad: 'RURAL 3', inicial: true, primaria: false, secundaria: false },
    { codigo: '471934', nombre: '331', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '471948', nombre: '0044', ruralidad: 'RURAL 2', inicial: true, primaria: true, secundaria: true },
    { codigo: '471953', nombre: '0048', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '471967', nombre: 'ANDRES AVELINO CACERES DORREGARAY', ruralidad: 'RURAL 3', inicial: false, primaria: true, secundaria: true },
    { codigo: '471972', nombre: '0085', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '471991', nombre: '0136', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '472014', nombre: '0141', ruralidad: 'RURAL 2', inicial: true, primaria: true, secundaria: false },
    { codigo: '472028', nombre: '0142', ruralidad: 'RURAL 3', inicial: false, primaria: true, secundaria: false },
    { codigo: '472052', nombre: '0298', ruralidad: 'RURAL 2', inicial: true, primaria: true, secundaria: false },
    { codigo: '472066', nombre: '0475', ruralidad: 'RURAL 3', inicial: false, primaria: true, secundaria: true },
    { codigo: '472071', nombre: '0577', ruralidad: 'RURAL 3', inicial: true, primaria: true, secundaria: true },
    { codigo: '472085', nombre: '0724', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '472113', nombre: 'AGROPECUARIO DOS UNIDOS SEC', ruralidad: 'RURAL 3', inicial: false, primaria: false, secundaria: true },
    { codigo: '472212', nombre: 'JOSE GABRIEL CONDORCANQUI', ruralidad: 'URBANO', inicial: true, primaria: true, secundaria: true },
    { codigo: '472245', nombre: 'EMILIA BARCIA BONIFATTI', ruralidad: 'URBANO', inicial: true, primaria: false, secundaria: false },
    { codigo: '472250', nombre: 'MARIA CALVO RUIZ', ruralidad: 'RURAL 3', inicial: true, primaria: false, secundaria: false },
    { codigo: '472269', nombre: 'ANTORCHA DEL SABER', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '472274', nombre: 'CORONEL LEONCIO PRADO', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '472288', nombre: 'HUMBERTO DEL AGUILA ARRIEGA', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '472293', nombre: '0045', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '472306', nombre: 'JOSE DE LA TORRE UGARTE', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '472311', nombre: '0174', ruralidad: 'RURAL 3', inicial: false, primaria: true, secundaria: true },
    { codigo: '472330', nombre: '005', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '472349', nombre: '0202', ruralidad: 'URBANO', inicial: false, primaria: true, secundaria: false },
    { codigo: '472354', nombre: '0267', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '472368', nombre: 'ALFONSO UGARTE VERNAL', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '472373', nombre: 'MARIA ANDREA PARADO DE BELLIDO', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '472392', nombre: 'JOSE SANTOS CHOCANO GASTANODI', ruralidad: 'RURAL 3', inicial: true, primaria: true, secundaria: true },
    { codigo: '472410', nombre: 'PASCUAL SANGAMA VALLES', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '472429', nombre: 'JUAN DE LA CRUZ SALAS SALAS', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '472448', nombre: 'JUAN VELASCO ALVARADO', ruralidad: 'URBANO', inicial: false, primaria: false, secundaria: true, otros: 'Básica Alternativa' },
    { codigo: '472453', nombre: 'JOSE AVELARDO QUIÑONES GONZALES', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '472467', nombre: 'RICARDO PALMA', ruralidad: 'RURAL 3', inicial: true, primaria: true, secundaria: true },
    { codigo: '472472', nombre: 'CARMELA PERDOMO PANDURO', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '472486', nombre: 'JUSTINIANO SHUÑA PAIMA', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '472491', nombre: 'MARIA ELENA MOYANO', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '472518', nombre: 'ROSA MERINO', ruralidad: 'URBANO', inicial: true, primaria: false, secundaria: false },
    { codigo: '472523', nombre: 'IGANCIO ISUIZA SANANCINA', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '472542', nombre: 'AMIGUITOS DE JESUS', ruralidad: 'RURAL 3', inicial: true, primaria: false, secundaria: false },
    { codigo: '472556', nombre: 'LOS ANGELITOS DE PALESTINA', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '472561', nombre: 'CORAZONES TIERNOS', ruralidad: 'RURAL 3', inicial: true, primaria: false, secundaria: false },
    { codigo: '472575', nombre: 'DIVINO NIÑO JESUS', ruralidad: 'RURAL 3', inicial: true, primaria: false, secundaria: false },
    { codigo: '472580', nombre: 'CESAR VALLEJO MENDOZA', ruralidad: 'RURAL 3', inicial: false, primaria: true, secundaria: false },
    { codigo: '472617', nombre: 'MERVIN TANANTA GARCIA', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '472622', nombre: 'NATIVIDAD BARRERA ARELLANO', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '472636', nombre: 'JESUS EL BUEN MAESTRO', ruralidad: 'RURAL 3', inicial: false, primaria: true, secundaria: false },
    { codigo: '472641', nombre: 'IMACULADA CONCEPCION', ruralidad: 'RURAL 3', inicial: false, primaria: true, secundaria: false },
    { codigo: '472660', nombre: 'DANIEL ALCIDES CARRION', ruralidad: 'RURAL 3', inicial: true, primaria: true, secundaria: true },
    { codigo: '472679', nombre: 'SAN JUAN BAUTISTA', ruralidad: 'RURAL 3', inicial: false, primaria: false, secundaria: true },
    { codigo: '472684', nombre: 'FRANCISCO BOLOGNESI', ruralidad: 'RURAL 3', inicial: false, primaria: false, secundaria: true },
    { codigo: '472698', nombre: 'JUAN DANIEL DEL AGUILA VELASQUEZ', ruralidad: 'RURAL 3', inicial: false, primaria: true, secundaria: false },
    { codigo: '474466', nombre: 'RAMON RODRIGUEZ RIOS', ruralidad: 'RURAL 3', inicial: true, primaria: false, secundaria: false },
    { codigo: '474471', nombre: 'OSCAR PANDURO DAVILA', ruralidad: 'RURAL 3', inicial: false, primaria: true, secundaria: false },
    { codigo: '474485', nombre: 'JULIO PIZARRO CARDENAS', ruralidad: 'RURAL 3', inicial: false, primaria: false, secundaria: true },
    { codigo: '520859', nombre: 'CORPUS CHRISTE', ruralidad: 'RURAL 3', inicial: true, primaria: true, secundaria: true },
    { codigo: '523650', nombre: 'VIRGITA ALVARADO CARDENAS', ruralidad: 'RURAL 3', inicial: false, primaria: true, secundaria: false },
    { codigo: '523669', nombre: 'ANGELITOS DEL SABER', ruralidad: 'RURAL 3', inicial: true, primaria: false, secundaria: false },
    { codigo: '533159', nombre: '0720', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: false },
    { codigo: '541381', nombre: '0721', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: true },
    { codigo: '541395', nombre: '0718', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: false },
    { codigo: '555274', nombre: '0080', ruralidad: 'RURAL 1', inicial: true, primaria: true, secundaria: false },
    { codigo: '555368', nombre: '0751 INICIAL', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '562156', nombre: 'SAN ANTONIO DE PADUA', ruralidad: 'RURAL 2', inicial: true, primaria: true, secundaria: false },
    { codigo: '562175', nombre: 'INTERCULTURAL BILINGUE', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: true },
    { codigo: '580443', nombre: '421', ruralidad: 'RURAL 3', inicial: true, primaria: false, secundaria: false },
    { codigo: '580457', nombre: '422', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '600931', nombre: '231', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '639250', nombre: '477', ruralidad: 'RURAL 1', inicial: true, primaria: true, secundaria: false },
    { codigo: '639269', nombre: '478', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '639274', nombre: '479', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '639288', nombre: '480', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '639325', nombre: '468', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '668389', nombre: '1121', ruralidad: 'URBANO', inicial: true, primaria: false, secundaria: false },
    { codigo: '668394', nombre: '1122', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '768647', nombre: '1164', ruralidad: 'RURAL 1', inicial: true, primaria: true, secundaria: false },
    { codigo: '768652', nombre: '1165', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '768666', nombre: '1166', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '768671', nombre: '1167', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '768685', nombre: '1168', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '775959', nombre: '1169', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '775964', nombre: '1170', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '792416', nombre: '1249', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '792421', nombre: '1250', ruralidad: 'RURAL 1', inicial: true, primaria: true, secundaria: false },
    { codigo: '792435', nombre: '1251', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '792440', nombre: '1252', ruralidad: 'RURAL 1', inicial: true, primaria: true, secundaria: false },
    { codigo: '792459', nombre: '1253', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '800497', nombre: '1309', ruralidad: 'RURAL 1', inicial: false, primaria: false, secundaria: true },
    { codigo: '800505', nombre: '1310', ruralidad: 'RURAL 1', inicial: false, primaria: false, secundaria: true },
    { codigo: '804339', nombre: '0086', ruralidad: 'RURAL 2', inicial: true, primaria: true, secundaria: false },
    { codigo: '804344', nombre: '0143', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: false },
    { codigo: '804358', nombre: '0605', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '804438', nombre: '0647', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: true },
    { codigo: '804508', nombre: '01360', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '804565', nombre: '0751 PRIMARIA', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: false },
    { codigo: '804631', nombre: '0779', ruralidad: 'RURAL 1', inicial: true, primaria: true, secundaria: true },
    { codigo: '804754', nombre: '0781', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: false },
    { codigo: '805447', nombre: '0007', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: false },
    { codigo: '805452', nombre: 'JULIO RAMON RIBEYRO', ruralidad: 'RURAL 1', inicial: true, primaria: true, secundaria: true },
    { codigo: '805541', nombre: 'JOSE DEL CARMEN MARIN ARISTA', ruralidad: 'RURAL 1', inicial: true, primaria: true, secundaria: true },
    { codigo: '806220', nombre: '0001 BASICA ESPECIAL', ruralidad: 'URBANO', inicial: false, primaria: false, secundaria: false, otros: 'Básica Especial' },
    { codigo: '806244', nombre: '0726', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: false },
    { codigo: '806258', nombre: 'MARIANO MELGAR Y VALDIVIESO', ruralidad: 'RURAL 2', inicial: true, primaria: true, secundaria: true },
    { codigo: '806282', nombre: 'PEDRO VILCA APAZA', ruralidad: 'RURAL 2', inicial: false, primaria: true, secundaria: false },
    { codigo: '806296', nombre: '0723', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: false },
    { codigo: '806300', nombre: 'CIRO ALEGRIA BAZAN', ruralidad: 'RURAL 1', inicial: true, primaria: true, secundaria: false },
    { codigo: '806319', nombre: '0689', ruralidad: 'RURAL 2', inicial: true, primaria: true, secundaria: true },
    { codigo: '806324', nombre: '0688', ruralidad: 'RURAL 1', inicial: true, primaria: true, secundaria: true },
    { codigo: '806338', nombre: 'MICAELA BASTIDAS 0716', ruralidad: 'RURAL 1', inicial: true, primaria: true, secundaria: false },
    { codigo: '806362', nombre: 'GILBERTO SATALAYA TUANAMA', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: false },
    { codigo: '806376', nombre: 'MI PEQUEÑO UNIVERSO', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '806395', nombre: '0725', ruralidad: 'RURAL 1', inicial: false, primaria: true, secundaria: false },
    { codigo: '806418', nombre: '01367', ruralidad: 'RURAL 1', inicial: true, primaria: true, secundaria: true },
    { codigo: '821763', nombre: '1319', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '821777', nombre: '1320', ruralidad: 'RURAL 1', inicial: true, primaria: true, secundaria: false },
    { codigo: '821782', nombre: '1321', ruralidad: 'RURAL 1', inicial: true, primaria: false, secundaria: false },
    { codigo: '821796', nombre: '1322', ruralidad: 'RURAL 1', inicial: true, primaria: true, secundaria: false },
    { codigo: '830418', nombre: 'SANTA MARIA GORETTI', ruralidad: 'URBANO', inicial: false, primaria: true, secundaria: true },
    { codigo: '851378', nombre: '01361', ruralidad: 'RURAL 1', inicial: true, primaria: true, secundaria: false },
    { codigo: '900703', nombre: 'HOGAR NAZARET DEL CORAZON INMACULADO DE MARIA', ruralidad: 'RURAL 3', inicial: false, primaria: false, secundaria: true },
    { codigo: '902108', nombre: 'NUESTRA SEÑORA DEL ROCIO', ruralidad: 'URBANO', inicial: false, primaria: false, secundaria: true },
    { codigo: '903773', nombre: 'EDGAR ANTONIO CHAVEZ GIL', ruralidad: 'RURAL 1', inicial: true, primaria: true, secundaria: false },
    { codigo: '911971', nombre: '467', ruralidad: 'RURAL 2', inicial: true, primaria: false, secundaria: false },
    { codigo: '999247', nombre: 'NUEVO AMANECER', ruralidad: 'RURAL 2', inicial: true, primaria: true, secundaria: false },
    { codigo: '867497', nombre: 'ODEC BELLAVISTA', ruralidad: 'URBANO', inicial: false, primaria: false, secundaria: false, otros: 'No aplica' },
    { codigo: '472047', nombre: 'AGROPECUARIO DOS UNIDOS PRIM', ruralidad: 'RURAL 3', inicial: false, primaria: true, secundaria: false },
    { codigo: '471910', nombre: 'AGROPECUARIO DOS UNIDOS INIC', ruralidad: 'RURAL 3', inicial: true, primaria: false, secundaria: false }
];

const supervisores = [
    { nombre: 'Poel Rufino Herrera Bendezú', dependencia: 'DIRECCION', puesto: 'Director' },
    { nombre: 'Margot Fonseca de Vera', dependencia: 'DIRECCION', puesto: 'Secretaria de Dirección' },
    { nombre: 'Mary Saavedra Taricuarima', dependencia: 'DIRECCION', puesto: 'Servicio Profesional Especializado en la Oficina de Dirección' },
    { nombre: 'Keyla Livany Vasquez Chuquilin', dependencia: 'ADMINISTRACION', puesto: 'Analista de la CPPADD' },
    { nombre: 'Gerges Gabriel Isuiza Chanchari', dependencia: 'ADMINISTRACION', puesto: 'Servicio Profesional Especializado en Imagen Institucional' },
    { nombre: 'Leydi Marín Quezada', dependencia: 'ADMINISTRACION', puesto: 'Jefe de la Oficina de Administración' },
    { nombre: 'Leidy Luz Cárdenas Vásquez', dependencia: 'ADMINISTRACION', puesto: 'Servicio Profesional Especializado en Planilla y AIRHSP' },
    { nombre: 'Beroccio Ramirez Ríos', dependencia: 'ADMINISTRACION', puesto: 'Especialista en Tesorería' },
    { nombre: 'Ketty Paola Alvarado Cárdenas', dependencia: 'ADMINISTRACION', puesto: 'Servicio Profesional Especializado en PAD' },
    { nombre: 'Yeny Judith Martínez Rafael', dependencia: 'AGI', puesto: 'Especialista en Planificación y Presupuesto' },
    { nombre: 'Karen Janeth Flores Lanares', dependencia: 'ADMINISTRACION', puesto: 'Especialista en Contabilidad' },
    { nombre: 'Veronica Salazar Castro', dependencia: 'ADMINISTRACION', puesto: 'Especialista en Abastecimiento' },
    { nombre: 'Violeta Salazar García', dependencia: 'ADMINISTRACION', puesto: 'Especialista en Bienestar' },
    { nombre: 'Fiorella Vela Vásquez', dependencia: 'ADMINISTRACION', puesto: 'Proyectista' },
    { nombre: 'Sutkey Milagritos Ramirez Cabanillas', dependencia: 'ADMINISTRACION', puesto: 'Especialista en Archivo' },
    { nombre: 'Jhoy Lider Gonzales Pinedo', dependencia: 'AGI', puesto: 'Servicio Profesional Especializado en Planificación y Presupuesto' },
    { nombre: 'Segundo Hipólito Saldaña Pérez', dependencia: 'ADMINISTRACION', puesto: 'Responsable de Gestión de Recursos Humanos' },
    { nombre: 'Yesenia Marisol Escobedo Vilchez', dependencia: 'ADMINISTRACION', puesto: 'Secretaria de RR.HH.' },
    { nombre: 'Carlos Bendezú Ushiñahua Fasabi', dependencia: 'ADMINISTRACION', puesto: 'Servicio Profesional Especializado en Archivo' },
    { nombre: 'Lleny Sangama Guerra', dependencia: 'ADMINISTRACION', puesto: 'Secretaria de Administración' },
    { nombre: 'Gianny Pezo Cumapa', dependencia: 'DIRECCION', puesto: 'Asesora Legal' },
    { nombre: 'Diego Torres Rengifo', dependencia: 'ADMINISTRACION', puesto: 'Analista en Nexus' },
    { nombre: 'Breidis Santiago Upiachihua Cárdenas', dependencia: 'ADMINISTRACION', puesto: 'Servicio Profesional Especializado en Tesorería' },
    { nombre: 'Juan Carlos Campos Viera', dependencia: 'ADMINISTRACION', puesto: 'Especialista en Planillas' },
    { nombre: 'Gianmarco Panduro Mego', dependencia: 'ADMINISTRACION', puesto: 'Especialista en Informática I' },
    { nombre: 'Dayxs Bravo Bustamante', dependencia: 'ADMINISTRACION', puesto: 'Especialista en Escalafón' },
    { nombre: 'Karen Tatiana Hidalgo Vásquez', dependencia: 'ADMINISTRACION', puesto: 'Servicio Profesional Especializado en RR.HH.' },
    { nombre: 'Herberth Rivera Cabrera', dependencia: 'ADMINISTRACION', puesto: 'Vigilante' },
    { nombre: 'Maryori Stephany Muñoz Gonzales', dependencia: 'ADMINISTRACION', puesto: 'Técnico Administrativo de Mesa de Partes' },
    { nombre: 'Ricardo Saldaña Guevara', dependencia: 'ADMINISTRACION', puesto: 'Servicio Profesional Especializado en Seguridad y Vigilancia' },
    { nombre: 'Rober Cachique Cachique', dependencia: 'ADMINISTRACION', puesto: 'Servicio Profesional Especializado en Seguridad y Vigilancia' },
    { nombre: 'Ruber Cárdenas Ramirez', dependencia: 'ADMINISTRACION', puesto: 'Servicio Profesional Especializado en Seguridad y Vigilancia' },
    { nombre: 'Ynes Paola Pérez Avila', dependencia: 'AGI', puesto: 'Especialista en Racionalización y Estadística' },
    { nombre: 'Tony Jhon Fernandez Díaz', dependencia: 'AGI', puesto: 'Jefe del Área de Gestión Institucional' },
    { nombre: 'Gisela Yudith Vásquez Gonzales', dependencia: 'AGI', puesto: 'Servicio Profesional Especializado en Gestión Institucional' },
    { nombre: 'Roxanita Carrasco Holguín', dependencia: 'AGI', puesto: 'Especialista de SIAGIE' },
    { nombre: 'Daniel Leonidas La Torre Rengifo', dependencia: 'AGI', puesto: 'Especialista en Infraestructura' },
    { nombre: 'Hugo Ushiñahua Trigoso', dependencia: 'ADMINISTRACION', puesto: 'Chofer' },
    { nombre: 'Gianfranco Nieto Cárdenas', dependencia: 'ADMINISTRACION', puesto: 'Servicio Profesional Especializado en Almacén' },
    { nombre: 'Yolby Tapullima Tapullima', dependencia: 'AGP', puesto: 'Servicio Profesional Especializado en Gestión Pedagógica' },
    { nombre: 'Karen Esther Vela Arirama', dependencia: 'AGP', puesto: 'Servicio Profesional Especializado en Gestión Pedagógica' },
    { nombre: 'Sheily Say Huansi Vásquez', dependencia: 'AGP', puesto: 'Especialista en Convivencia Escolar' },
    { nombre: 'Franklin Cárdenas Ruíz', dependencia: 'AGP', puesto: 'Especialista en Educación Nivel Primaria' },
    { nombre: 'Antonio Wilmer Rojas Miranda', dependencia: 'AGP', puesto: 'Especialista en Educación Nivel Secundaria' },
    { nombre: 'Antonio Angulo Ramírez', dependencia: 'AGP', puesto: 'Coordinador de PRONOEI' },
    { nombre: 'Sonia Angulo Cabrera', dependencia: 'AGP', puesto: 'Coordinador de PRONOEI' },
    { nombre: 'Pedro Antonio Rengifo Ramírez', dependencia: 'AGP', puesto: 'Coordinador de PRONOEI' },
    { nombre: 'Ayrunedi Lopez Putpaña', dependencia: 'AGP', puesto: 'Coordinador de PRONOEI' },
    { nombre: 'Oscar Enrique Ayay Sánchez', dependencia: 'AGP', puesto: 'Jefe del Área de Gestión Pedagógica' },
    { nombre: 'Ernesto Jimenez Chapoñan', dependencia: 'AGP', puesto: 'Especialista en Educación Nivel Secundaria CC.SS.' },
    { nombre: 'Zarita Isabel Mijahuanga Chumbe', dependencia: 'AGP', puesto: 'Especialista en Educación Nivel Inicial' },
    { nombre: 'Silvia Janet Heredia Romero', dependencia: 'AGP', puesto: 'Especialista en Educación Nivel Inicial' },
    { nombre: 'Salustiano Valdemar Salas Namay', dependencia: 'AGP', puesto: 'Especialista en Educación Nivel Secundaria Matemática' },
    { nombre: 'Manuel Ramírez Ruíz', dependencia: 'AGP', puesto: 'Especialista en Educación Nivel Secundaria Comunicación' },
    { nombre: 'Victor Vela Ramirez', dependencia: 'AGP', puesto: 'Especialista en Educación Nivel Primaria' },
    { nombre: 'Maria Leonor Revilla Guevara', dependencia: 'ADMINISTRACION', puesto: 'Servicio Profesional Especializado en Limpieza' },
    { nombre: 'Maria Margarita Cubas Sanchéz', dependencia: 'ADMINISTRACION', puesto: 'Especialista en Patrimonio y Almacén' },
    { nombre: 'Joel Gonza Peña', dependencia: 'ADMINISTRACION', puesto: 'Servicio Profesional Especializado en RR.HH.' },
    { nombre: 'Zack Kevin Alvarado Maldonado', dependencia: 'AGI', puesto: 'Servicio Profesional Especializado en Infraestructura' },
    { nombre: 'Kevin Hafid Rojas Cubas', dependencia: 'DIRECCION', puesto: 'Servicio Profesional Especializado en Asesoría Legal' },
    { nombre: 'Gilma Veronica Gutierrez Vasquez', dependencia: 'ADMINISTRACION', puesto: 'Servicio Profesional Especializado en Abastecimiento' },
    { nombre: 'Maria de los Angeles Nole Vargas de Merino', dependencia: 'AGP', puesto: 'PREVAED' },
    { nombre: 'Rolita Sangama Del Aguila', dependencia: 'AGP', puesto: 'Coordinador de PRONOEI' },
    { nombre: 'Hiber Miller Yalta Cubas', dependencia: 'AGP', puesto: 'Profesional III Equipo Itinerante Convivencia Escolar' },
    { nombre: 'Jhoel Villacorta Salazar', dependencia: 'AGP', puesto: 'Profesional III Equipo Itinerante Convivencia Escolar' },
    { nombre: 'Jheimmy Carmin Guevara Tafur', dependencia: 'AGI', puesto: 'Especialista en Finanzas' },
    { nombre: 'Alfredo Silva Pisco', dependencia: 'ADMINISTRACION', puesto: 'Servicio Profesional Especializado en Seguridad y Vigilancia' },
    { nombre: 'Lorena Diaz Diaz', dependencia: 'AGI', puesto: 'Practicante Pre profesional' }
];

async function seed() {
    console.log('Iniciando seed de datos...');

    let iesCreados = 0;
    for (const ie of ies) {
        try {
            await db.prepare(
                'INSERT INTO instituciones_educativas (codigo, nombre, ruralidad, tiene_inicial, tiene_primaria, tiene_secundaria, tiene_otros, tipo_otros) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (codigo) DO NOTHING'
            ).run(ie.codigo, ie.nombre, ie.ruralidad, ie.inicial, ie.primaria, ie.secundaria, ie.otros ? true : false, ie.otros || null);
            iesCreados++;
        } catch (err) {
            console.error(`Error IE ${ie.codigo}:`, err.message);
        }
    }
    console.log(`${iesCreados} Instituciones Educativas cargadas`);

    let supervisoresCreados = 0;
    for (const s of supervisores) {
        try {
            await db.prepare(
                "INSERT INTO usuarios (nombre_completo, rol, dependencia, puesto) VALUES (?, 'supervisor', ?, ?) ON CONFLICT (dni) DO NOTHING"
            ).run(s.nombre, s.dependencia, s.puesto);
            supervisoresCreados++;
        } catch (err) {
            console.error(`Error supervisor ${s.nombre}:`, err.message);
        }
    }
    console.log(`${supervisoresCreados} Supervisores UGEL cargados`);

    const tipos = await db.prepare('SELECT COUNT(*) as c FROM tipos_actividad').get();
    if (tipos.c == 0) {
        for (const t of ['Tarea', 'Documento', 'Reunión', 'Informe']) {
            await db.prepare('INSERT INTO tipos_actividad (nombre) VALUES (?)').run(t);
        }
        console.log('Tipos de actividad creados');
    }

    console.log('Seed completado exitosamente');
    process.exit(0);
}

seed().catch(err => {
    console.error('Error en seed:', err);
    process.exit(1);
});
