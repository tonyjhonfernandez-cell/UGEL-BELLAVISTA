// ==================== CAPACITACIONES & ASISTENCIA ====================

app.post('/api/capacitaciones', authSupervisor, async (req, res) => {
    try {
        const { titulo, descripcion, fecha, incluye_encuesta, alcance, nivelIds, ieIds, listaId } = req.body;
        const creador_id = req.session.usuarioId || req.session.userId;
        
        if (!titulo || !fecha || !alcance) {
            return res.status(400).json({ error: 'Faltan campos obligatorios' });
        }
        
        let nivelesStr = null;
        if (alcance === 'nivel' && Array.isArray(nivelIds)) {
            const levels = await pool.query('SELECT clave FROM niveles_educativos WHERE id = ANY($1::int[])', [nivelIds]);
            nivelesStr = levels.rows.map(l => l.clave).join(',');
        } else if (alcance === 'todas') {
            nivelesStr = 'todas';
        }
        
        const result = await pool.query(
            'INSERT INTO capacitaciones (titulo, descripcion, fecha, creador_id, incluye_encuesta, niveles_aplicados) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [titulo.toUpperCase(), descripcion, fecha, creador_id, incluye_encuesta || false, nivelesStr]
        );
        const capId = result.rows[0].id;
        
        let targetIes = [];
        if (alcance === 'todas') {
            const ies = await pool.query('SELECT id FROM instituciones_educativas WHERE activa = true');
            targetIes = ies.rows.map(ie => ie.id);
        } else if (alcance === 'nivel' && Array.isArray(nivelIds)) {
            const ies = await pool.query(
                'SELECT DISTINCT ie_id FROM ie_niveles WHERE nivel_id = ANY($1::int[])',
                [nivelIds]
            );
            targetIes = ies.rows.map(ie => ie.ie_id);
        } else if (alcance === 'manual' && Array.isArray(ieIds)) {
            targetIes = ieIds;
        } else if (alcance === 'lista' && listaId) {
            const ies = await pool.query('SELECT ie_id FROM listas_ie_det WHERE lista_id = $1', [listaId]);
            targetIes = ies.rows.map(ie => ie.ie_id);
        }
        
        for (const ieId of targetIes) {
            await pool.query(
                'INSERT INTO capacitaciones_asistencia (capacitacion_id, ie_id, asistio) VALUES ($1, $2, false) ON CONFLICT (capacitacion_id, ie_id) DO NOTHING',
                [capId, ieId]
            );
        }
        
        res.json({ ok: true, id: capId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/capacitaciones', authSupervisor, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*, u.nombre_completo as creador_nombre,
                   COUNT(ca.id) as total_invitadas,
                   COUNT(ca.id) FILTER (WHERE ca.asistio = true) as total_asistentes
            FROM capacitaciones c
            LEFT JOIN usuarios u ON c.creador_id = u.id
            LEFT JOIN capacitaciones_asistencia ca ON c.id = ca.capacitacion_id
            GROUP BY c.id, u.nombre_completo
            ORDER BY c.fecha DESC, c.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/capacitaciones/:id', authSupervisor, async (req, res) => {
    try {
        await pool.query('DELETE FROM capacitaciones WHERE id = $1', [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/capacitaciones/:id/asistencia', authSupervisor, async (req, res) => {
    try {
        const capId = req.params.id;
        const info = await pool.query('SELECT * FROM capacitaciones WHERE id = $1', [capId]);
        if (info.rows.length === 0) {
            return res.status(404).json({ error: 'Capacitación no encontrada' });
        }
        
        const list = await pool.query(`
            SELECT ca.*, ie.nombre as ie_nombre, ie.codigo as ie_codigo,
                   (SELECT string_agg(ne.nombre, ', ') FROM ie_niveles iln JOIN niveles_educativos ne ON iln.nivel_id = ne.id WHERE iln.ie_id = ie.id) as ie_niveles
            FROM capacitaciones_asistencia ca
            JOIN instituciones_educativas ie ON ca.ie_id = ie.id
            WHERE ca.capacitacion_id = $1
            ORDER BY ie.nombre ASC
        `, [capId]);
        
        res.json({
            capacitacion: info.rows[0],
            asistencia: list.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/capacitaciones/:id/export-excel', authSupervisor, async (req, res) => {
    try {
        const capId = req.params.id;
        const info = await pool.query('SELECT titulo, fecha FROM capacitaciones WHERE id = $1', [capId]);
        if (info.rows.length === 0) {
            return res.status(404).json({ error: 'Capacitación no encontrada' });
        }
        
        const list = await pool.query(`
            SELECT ca.*, ie.nombre as ie_nombre, ie.codigo as ie_codigo,
                   (SELECT string_agg(ne.nombre, ', ') FROM ie_niveles iln JOIN niveles_educativos ne ON iln.nivel_id = ne.id WHERE iln.ie_id = ie.id) as ie_niveles
            FROM capacitaciones_asistencia ca
            JOIN instituciones_educativas ie ON ca.ie_id = ie.id
            WHERE ca.capacitacion_id = $1
            ORDER BY ie.nombre ASC
        `, [capId]);
        
        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        wb.creator = 'UGEL Bellavista';
        wb.created = new Date();
        const ws = wb.addWorksheet('Asistencia');
        
        ws.columns = [
            { header: '#', key: 'num', width: 5 },
            { header: 'CÓDIGO IE', key: 'ie_codigo', width: 14 },
            { header: 'INSTITUCIÓN EDUCATIVA', key: 'ie_nombre', width: 42 },
            { header: 'NIVELES', key: 'ie_niveles', width: 24 },
            { header: 'ASISTENCIA', key: 'asistencia', width: 16 },
            { header: 'NOMBRES Y APELLIDOS', key: 'nombre_completo', width: 32 },
            { header: 'DNI', key: 'dni', width: 14 },
            { header: 'CARGO', key: 'cargo', width: 20 },
            { header: 'FECHA Y HORA REGISTRO', key: 'fecha_registro', width: 24 },
            { header: 'SATISFACCIÓN (1-5)', key: 'calificacion', width: 20 },
            { header: 'SUGERENCIAS / COMENTARIOS', key: 'sugerencias', width: 48 }
        ];
        
        const headerStyle = {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } },
            font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' },
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
            border: {
                top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
            }
        };
        
        const headerRow = ws.getRow(1);
        headerRow.height = 32;
        ws.columns.forEach((col, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = col.header;
            Object.assign(cell, headerStyle);
        });
        
        const assistStyles = {
            true: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }, font: { color: { argb: 'FF2E7D32' }, bold: true } },
            false: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } }, font: { color: { argb: 'FFC62828' }, bold: true } }
        };
        
        const dataStyle = {
            alignment: { vertical: 'middle', wrapText: true },
            border: {
                top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
            }
        };
        
        list.rows.forEach((r, i) => {
            const rowNum = i + 2;
            const row = ws.getRow(rowNum);
            row.height = 24;
            
            const localTimeStr = r.fecha_registro ? new Date(r.fecha_registro).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '';
            const vals = [
                i + 1,
                r.ie_codigo,
                r.ie_nombre,
                r.ie_niveles || '',
                r.asistio ? 'ASISTIÓ' : 'NO ASISTIÓ',
                r.nombre_completo || '',
                r.dni || '',
                r.cargo || '',
                localTimeStr,
                r.calificacion_satisfaccion || '',
                r.sugerencias || ''
            ];
            
            vals.forEach((v, ci) => {
                const cell = row.getCell(ci + 1);
                cell.value = v;
                Object.assign(cell, dataStyle);
            });
            
            const assistCell = row.getCell(5);
            const statusKey = r.asistio ? 'true' : 'false';
            if (assistStyles[statusKey]) {
                Object.assign(assistCell, assistStyles[statusKey]);
            }
        });
        
        ws.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: list.rows.length + 1, column: ws.columns.length }
        };
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        
        const filename = `Reporte_Asistencia_${info.rows[0].titulo.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        await wb.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Error exportando Excel asistencia:', err);
        res.status(500).json({ error: 'Error al exportar reporte de asistencia' });
    }
});

app.get('/api/public/capacitaciones/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, titulo, descripcion, fecha, incluye_encuesta FROM capacitaciones WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Capacitación no encontrada' });
        }
        
        const eligibleIes = await pool.query(`
            SELECT ie.id, ie.nombre, ie.codigo
            FROM capacitaciones_asistencia ca
            JOIN instituciones_educativas ie ON ca.ie_id = ie.id
            WHERE ca.capacitacion_id = $1
            ORDER BY ie.nombre ASC
        `, [req.params.id]);
        
        res.json({
            capacitacion: result.rows[0],
            ies: eligibleIes.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/public/capacitaciones/:id/registrar', async (req, res) => {
    try {
        const capId = req.params.id;
        const { ie_id, nombre_completo, DNI, dni, cargo, calificacion_satisfaccion, sugerencias } = req.body;
        const finalDni = dni || DNI;
        
        if (!ie_id || !nombre_completo || !finalDni || !cargo) {
            return res.status(400).json({ error: 'Faltan campos obligatorios' });
        }
        
        const check = await pool.query('SELECT id, asistio FROM capacitaciones_asistencia WHERE capacitacion_id = $1 AND ie_id = $2', [capId, ie_id]);
        if (check.rows.length === 0) {
            return res.status(400).json({ error: 'Esta institución educativa no está invitada a esta capacitación' });
        }
        
        if (check.rows[0].asistio) {
            return res.status(400).json({ error: 'La asistencia de esta institución educativa ya ha sido registrada previamente' });
        }
        
        await pool.query(`
            UPDATE capacitaciones_asistencia
            SET nombre_completo = $1,
                dni = $2,
                cargo = $3,
                asistio = true,
                fecha_registro = NOW(),
                calificacion_satisfaccion = $4,
                sugerencias = $5
            WHERE capacitacion_id = $6 AND ie_id = $7
        `, [
            nombre_completo.toUpperCase(),
            finalDni,
            cargo.toUpperCase(),
            calificacion_satisfaccion ? parseInt(calificacion_satisfaccion) : null,
            sugerencias || null,
            capId,
            ie_id
        ]);
        
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});