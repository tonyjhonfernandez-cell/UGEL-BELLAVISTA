async function seedDatabase(db) {
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

    const existing = await db.prepare('SELECT COUNT(*) as c FROM instituciones_educativas').get();
    if (existing.c === 0) {
        const insertIE = db.prepare(
            'INSERT INTO instituciones_educativas (codigo, nombre, ruralidad, tiene_inicial, tiene_primaria, tiene_secundaria, tiene_otros, tipo_otros) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (codigo) DO NOTHING'
        );
        for (const ie of iesData) {
            await insertIE.run(...ie);
        }
    }

    const supervisores = [
            [
                    "Poel Rufino Herrera Bendezú",
                    "DIRECCION",
                    "Director",
                    "942057671",
                    "21876169"
            ],
            [
                    "Margot Fonseca de Vera",
                    "DIRECCION",
                    "Secretaria de Dirección",
                    "985166187",
                    "00874080"
            ],
            [
                    "Mary Saavedra Taricuarima",
                    "DIRECCION",
                    "Servicio profesional Especializado en la Oficina de Dirección de la UGEL Bellavista",
                    "931033476",
                    "71506096"
            ],
            [
                    "Keyla Livany Vasquez Chuquilin",
                    "ADMINISTACION",
                    "Analista de la CPPADD",
                    "918910957",
                    "71776200"
            ],
            [
                    "Gerges Gabriel Isuiza Chanchari",
                    "ADMINISTACION",
                    "Servicio Profesional Especializado en la Oficina de Imagen Institucional de la UGEL Bellavista",
                    "910284730",
                    "75913169"
            ],
            [
                    "Leydi Marín Quezada",
                    "ADMINISTACION",
                    "Jefe de la Oficina de Administración",
                    "980039344",
                    "42268073"
            ],
            [
                    "Leidy Luz Cárdenas Vásquez",
                    "ADMINISTACION",
                    "Servicio Profesional Especializado en la Oficina de Planilla y AIRHSP de la UGEL Bellavista",
                    "917087282",
                    "42773099"
            ],
            [
                    "Beroccio Ramirez Ríos",
                    "ADMINISTACION",
                    "Especialista en Tesorería",
                    "945729690",
                    "40666029"
            ],
            [
                    "Ketty Paola Alvarado Cárdenas",
                    "ADMINISTACION",
                    "Servicio Profesional Especializado en la Oficina de Procedimientos Administrativos Disciplinarios (PAD) de la UGEL Bellavista",
                    "950448715",
                    "41656645"
            ],
            [
                    "Yeny Judith Martínez Rafael",
                    "AGI",
                    "Especialista en Planificacion y Presupuesto",
                    "\"917925497/901759018\"",
                    "71848797"
            ],
            [
                    "Karen Janeth Flores Lanares",
                    "ADMINISTACION",
                    "Especialista en Contabilidad",
                    "965282597",
                    "71602492"
            ],
            [
                    "Veronica Salazar Castro",
                    "ADMINISTACION",
                    "Especialista en Abastecimiento",
                    "910745623",
                    "48024213"
            ],
            [
                    "Violeta Salazar García",
                    "ADMINISTACION",
                    "Especialista en Bienestar",
                    "915204867",
                    "71480435"
            ],
            [
                    "Fiorella Vela Vásquez",
                    "ADMINISTACION",
                    "Proyectista",
                    "982864855",
                    "73449707"
            ],
            [
                    "Sutkey Milagritos Ramirez Cabanillas",
                    "ADMINISTACION",
                    "Especialista en Archivo",
                    "959785950",
                    "74644880"
            ],
            [
                    "Jhoy Lider Gonzales Pinedo",
                    "AGI",
                    "Servicio Profesional Especializado en el Área de Planificación y Presupuesto de la UGEL Bellavista",
                    "939170499",
                    "77297263"
            ],
            [
                    "Segundo Hipólito Saldaña Pérez",
                    "ADMINISTACION",
                    "Responsable de la Oficina de Gestión de  Recursos Humanos",
                    "983363956",
                    "05373518"
            ],
            [
                    "Yesenia Marisol Escobedo Vilchez",
                    "ADMINISTACION",
                    "Secretaria de la Oficina de RR.HH.",
                    "969330029",
                    "47109452"
            ],
            [
                    "Carlos Bendezú Ushiñahua Fasabi",
                    "ADMINISTACION",
                    "Servicio Profesional Especializado en la Oficina de Archivo de la UGEL Bellavista",
                    "968662212",
                    "72199076"
            ],
            [
                    "Lleny Sangama Guerra",
                    "ADMINISTACION",
                    "Secretaria de la Oficina de Administracion",
                    "939891317",
                    "71928865"
            ],
            [
                    "Gianny Pezo Cumapa",
                    "DIRECCION",
                    "Asesora Legal",
                    "962103462",
                    "70076501"
            ],
            [
                    "Diego Torres Rengifo",
                    "ADMINISTACION",
                    "Analista en Nexus",
                    "942931183",
                    "72087286"
            ],
            [
                    "Breidis Santiago Upiachihua Cárdenas",
                    "ADMINISTACION",
                    "Servicio Profesional Especializado en la Oficina de Tesorería de la UGEL Bellavista",
                    "989416693",
                    "74765595"
            ],
            [
                    "Juan Carlos Campos Viera",
                    "ADMINISTACION",
                    "Especialista en Planillas",
                    "949874489",
                    "41048864"
            ],
            [
                    "Gianmarco Panduro Mego",
                    "ADMINISTACION",
                    "Especialista en Informática I",
                    "960984221",
                    "46864420"
            ],
            [
                    "Dayxs Bravo Bustamante",
                    "ADMINISTACION",
                    "Especialista en Escalafón",
                    "918215774",
                    "47059094"
            ],
            [
                    "Karen Tatiana Hidalgo Vásquez",
                    "ADMINISTACION",
                    "Servicio Profesional Especializado en la Oficina de Recursos Humanos de la UGEL Bellavista",
                    "925404681",
                    "74657614"
            ],
            [
                    "Herberth Rivera Cabrera",
                    "ADMINISTACION",
                    "Vigilante",
                    "955700174",
                    "27431208"
            ],
            [
                    "Maryori Stephany Muñoz Gonzales",
                    "ADMINISTACION",
                    "Tecnico Administrativo de Mesa de Partes",
                    "948281756",
                    "74657864"
            ],
            [
                    "Ricardo Saldaña Guevara",
                    "ADMINISTACION",
                    "Servicio Profesional Especializado en la Seguridad y Vigilancia de la UGEL Bellavista",
                    "974901812",
                    "00873189"
            ],
            [
                    "Rober Cachique Cachique",
                    "ADMINISTACION",
                    "Servicio Profesional Especializado en la Seguridad y Vigilancia  de la UGEL Bellavista",
                    "930415084",
                    "43463743"
            ],
            [
                    "Ruber Cárdenas Ramirez",
                    "ADMINISTACION",
                    "Servicio Profesional Especializado en la Seguridad y Vigilancia de la UGEL Bellavista",
                    "951232179",
                    "43296425"
            ],
            [
                    "Ynes Paola Pérez Avila",
                    "AGI",
                    "Especialista en Racionalizacion y Estadistica",
                    "931252534",
                    "44072546"
            ],
            [
                    "Tony Jhon Fernandez Díaz",
                    "AGI",
                    "Jefe del Area de Gestion Institucional",
                    "940798299",
                    "74223117"
            ],
            [
                    "Gisela Yudith Vásquez Gonzales",
                    "AGI",
                    "Servicio Profesional Especializado en el Área de Gestión Institucional de la UGEL Bellavista",
                    "942195403",
                    "60294586"
            ],
            [
                    "Roxanita Carrasco Holguín",
                    "AGI",
                    "Especialista de SIAGIE",
                    "971991326",
                    "76642285"
            ],
            [
                    "Daniel Leonidas La Torre Rengifo",
                    "AGI",
                    "Especialista en Infraestructura",
                    "947538971",
                    "45849880"
            ],
            [
                    "Hugo Ushiñahua Trigoso",
                    "ADMINISTACION",
                    "Chofer",
                    "944478823",
                    "00869906"
            ],
            [
                    "Gianfranco Nieto Cárdenas",
                    "ADMINISTACION",
                    "Servicio Profesional Especializado en la Oficina de Almacén de la UGEL Bellavista",
                    "966589720",
                    "74770324"
            ],
            [
                    "Yolby Tapullima Tapullima",
                    "AGP",
                    "Servicio profesional Especializado en el Área de Gestión Pedagógica de la UGEL Bellavista",
                    "990838961",
                    "72120699"
            ],
            [
                    "Karen Esther Vela Arirama",
                    "AGP",
                    "Servicio Profesional Especializado En El Área De Gestión Pedagógica De La UGEL Bellavista",
                    "917790752",
                    "74761394"
            ],
            [
                    "Sheily Say Huansi Vásquez",
                    "AGP",
                    "Especialista en Convivencia Escolar",
                    "943008206",
                    "46864559"
            ],
            [
                    "Franklin Cárdenas Ruíz",
                    "AGP",
                    "Especialista en Educacion Nivel Primaria",
                    "975235462",
                    "00885852"
            ],
            [
                    "Antonio Wilmer Rojas Miranda",
                    "AGP",
                    "Especialista en Educacion Nivel  Secundaria",
                    "942962839",
                    "18229933"
            ],
            [
                    "Antonio Angulo Ramírez",
                    "AGP",
                    "Coordinador de PRONOEI",
                    "994459215",
                    "00874983"
            ],
            [
                    "Sonia Angulo Cabrera",
                    "AGP",
                    "Coordinador de PRONOEI",
                    "972644125",
                    "00840196"
            ],
            [
                    "Pedro Antonio Rengifo Ramírez",
                    "AGP",
                    "Coordinador de PRONOEI",
                    "942890476",
                    "00874857"
            ],
            [
                    "Ayrunedi Lopez Putpaña",
                    "AGP",
                    "Coordinador de PRONOEI",
                    "968116742",
                    "00878980"
            ],
            [
                    "Oscar Enrique Ayay Sánchez",
                    "AGP",
                    "Jefe del Area de Gestión Pedagógica",
                    "981726278",
                    "19336148"
            ],
            [
                    "Ernesto Jimenez Chapoñan",
                    "AGP",
                    "Especialista en Educacion Nivel Secundaria CC.SS.",
                    "942980576",
                    "27434297"
            ],
            [
                    "Zarita Isabel Mijahuanga Chumbe",
                    "AGP",
                    "Especialista en Educacion Nivel Inicial",
                    "966559895",
                    "46429187"
            ],
            [
                    "Silvia Janet Heredia Romero",
                    "AGP",
                    "Especialista en Educacion Nivel Inicial",
                    "984607494",
                    "43113056"
            ],
            [
                    "Salustiano Valdemar Salas Namay",
                    "AGP",
                    "Especialista en Educacion Nivel Secundaria Matemática",
                    "950914571",
                    "19669881"
            ],
            [
                    "Manuel Ramírez Ruíz",
                    "AGP",
                    "Especialista en Educacion Nivel Secundaria Comunicación",
                    "943452869",
                    "41980001"
            ],
            [
                    "Victor Vela Ramirez",
                    "AGP",
                    "Especialista en Educacion Nivel Primaria",
                    "938579012",
                    "00868298"
            ],
            [
                    "Maria Leonor Revilla Guevara",
                    "ADMINISTACION",
                    "Servicio Profesional Especializado en la Limpieza de la UGEL Bellavista",
                    "952073717",
                    "00868004"
            ],
            [
                    "Maria Margarita Cubas Sanchéz",
                    "ADMINISTRACION",
                    "Especialista en el area de Patrimonio y Almacen",
                    "961172850",
                    "47843680"
            ],
            [
                    "Joel Gonza Peña",
                    "ADMINISTACION",
                    "Servicio Profesional Especializado en la Oficina de Recursos Humanos de la UGEL Bellavista",
                    "921147616",
                    "72024344"
            ],
            [
                    "Zack Kevin Alvarado Maldonado",
                    "AGI",
                    "Servicio Profesional Especializado en la Oficina de Infraestructura de la UGEL Bellavista",
                    "999474811",
                    "70780194"
            ],
            [
                    "Kevin Hafid Rojas Cubas",
                    "DIRECCION",
                    "Servicio Profesional Especializado en la Oficina de Asesoria Legal de la UGEL Bellavista",
                    "935259037",
                    "74148294"
            ],
            [
                    "Gilma Veronica Gutierrez Vasquez",
                    "ADMINISTACION",
                    "Servicio Profesional Especializado en la Oficina de Abastecimiento de la UGEL Bellavista",
                    "958688034",
                    "46942973"
            ],
            [
                    "Maria de los Angeles Noel Vargas de Merino",
                    "AGP",
                    "PREVAED",
                    "932361827",
                    "72160115"
            ],
            [
                    "Rolita Sangama Del Aguila",
                    "AGP",
                    "Coordinador de PRONOEI",
                    "943297382",
                    "44324084"
            ],
            [
                    "Hiber Miller Yalta Cubas",
                    "AGP",
                    "Profesional III para Equipo Itinerante de Convivencia Escolar",
                    "931828025",
                    "47953187"
            ],
            [
                    "Jhoel Villacorta Salazar",
                    "AGP",
                    "Profesional III para Equipo Itinerante de Convivencia Escolar",
                    "949683852",
                    "72927716"
            ],
            [
                    "Jheimmy Carmin Guevara Tafur",
                    "AGI",
                    "Especialista en Finanzas",
                    "996640502",
                    "45566260"
            ]
    ];

    const checkSupervisor = db.prepare(
        "SELECT id FROM usuarios WHERE nombre_completo = ? AND rol = 'supervisor'"
    );
    const insertSupervisor = db.prepare(
        "INSERT INTO usuarios (nombre_completo, rol, dependencia, puesto, telefono, dni) VALUES (?, 'supervisor', ?, ?, ?, ?)"
    );
    const checkSupervisorByDNI = db.prepare("SELECT id FROM usuarios WHERE dni = ?");
    const updateSupervisorCompleto = db.prepare(
        "UPDATE usuarios SET nombre_completo = ?, dependencia = ?, puesto = ?, telefono = ?, dni = ? WHERE id = ?"
    );

    for (const s of supervisores) {
        try {
            let existing = null;
            if (s[4]) existing = await checkSupervisorByDNI.get(s[4]);
            if (!existing) existing = await checkSupervisor.get(s[0]);

            if (!existing) {
                await insertSupervisor.run(...s);
            } else {
                await updateSupervisorCompleto.run(s[0], s[1], s[2], s[3], s[4], existing.id);
            }
        } catch (err) {
            console.error('Error insertando supervisor:', s[0], err.message);
        }
    }

    const tipoCount = await db.prepare('SELECT COUNT(*) as c FROM tipos_actividad').get();
    if (tipoCount.c == 0) {
        const insertTipo = db.prepare('INSERT INTO tipos_actividad (nombre) VALUES (?)');
        for (const t of ['Tarea', 'Documento', 'Reunión', 'Informe']) {
            await insertTipo.run(t);
        }
    }

    const total = await db.prepare('SELECT COUNT(*) as c FROM instituciones_educativas').get();
    return { seeded: true, ies: total.c };
}

module.exports = { seedDatabase };
