const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const newEndpoint = `
// ===================== IMPORT EXCEL =====================
app.post('/api/actividades/:id/import-excel', authSupervisor, async (req, res) => {
    try {
        const actividadId = req.params.id;
        const { file } = req.body;
        if (!file) {
            return res.status(400).json({ error: 'No se recibió ningún archivo' });
        }

        const buffer = Buffer.from(file, 'base64');
        const xlsx = require('xlsx');
        const wb = xlsx.read(buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });

        let codModularKey = '';
        let estadoKey = '';
        let observacionKey = '';

        if (rows.length > 0) {
            const keys = Object.keys(rows[0]);
            codModularKey = keys.find(k => k.toLowerCase().includes('cód') || k.toLowerCase().includes('cod') || k.toLowerCase().includes('modular')) || keys[0];
            estadoKey = keys.find(k => k.toLowerCase().includes('estado')) || keys[2];
            observacionKey = keys.find(k => k.toLowerCase().includes('observa') || k.toLowerCase().includes('nota') || k.toLowerCase().includes('comentario')) || keys[3];
        }

        if (!codModularKey || !estadoKey) {
            return res.status(400).json({ error: 'El archivo Excel no tiene el formato correcto. Debe tener columnas para "Cód. Modular" y "Estado".' });
        }

        let updatedCount = 0;
        let errors = [];

        // Fetch current assignments for this activity
        const assignmentsRes = await pool.query(\`
            SELECT ase.id, ie.codigo as ie_codigo, ase.estado, ase.director_id
            FROM asignaciones ase
            INNER JOIN instituciones_educativas ie ON ase.ie_id = ie.id
            WHERE ase.actividad_id = $1
        \`, [parseInt(actividadId)]);
        
        const assignments = assignmentsRes.rows;
        const assignmentMap = new Map();
        assignments.forEach(a => {
            assignmentMap.set(a.ie_codigo.trim(), a);
        });

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const ieCodigo = (row[codModularKey] || '').toString().trim();
            if (!ieCodigo) continue;

            const asig = assignmentMap.get(ieCodigo);
            if (!asig) {
                continue;
            }

            let rawEstado = (row[estadoKey] || '').toString().trim().toLowerCase();
            let newEstado = asig.estado;
            if (rawEstado.includes('complet')) {
                newEstado = 'completada';
            } else if (rawEstado.includes('inconcl') || rawEstado.includes('inconcluso')) {
                newEstado = 'inconclusa';
            } else if (rawEstado.includes('pendien')) {
                newEstado = 'pendiente';
            } else if (rawEstado.includes('no cumpl') || rawEstado.includes('no_cumpl')) {
                newEstado = 'no_cumplida';
            }

            let obs = (row[observacionKey] || '').toString().trim();

            if (newEstado === 'inconclusa' && !obs) {
                errors.push(\`Fila \${i + 2} (IE \${ieCodigo}): El estado es "inconclusa" pero no tiene observación.\`);
                continue;
            }

            const fecha = newEstado === 'completada' ? new Date().toISOString() : null;

            await pool.query(
                'UPDATE asignaciones SET estado = $1, notas_supervisor = $2, fecha_completado = $3 WHERE id = $4',
                [newEstado, obs || null, fecha, parseInt(asig.id)]
            );

            if (newEstado !== asig.estado && asig.director_id) {
                try {
                    const actRes = await pool.query('SELECT titulo FROM actividades WHERE id = $1', [parseInt(actividadId)]);
                    const act = actRes.rows[0];
                    const mensaje = newEstado === 'completada'
                        ? \`Tu actividad "\${act?.titulo}" fue marcada como completada\`
                        : \`Tu actividad "\${act?.titulo}" fue marcada como inconclusa / no cumplida\`;
                    await pool.query(
                        'INSERT INTO notificaciones (usuario_id, remitente_id, titulo, mensaje, tipo) VALUES ($1, $2, $3, $4, $5)',
                        [parseInt(asig.director_id), parseInt(req.session.user.id), \`Actividad \${newEstado}\`, mensaje, 'estado']
                    );
                } catch (e) {
                    console.error('Error enviando notificación en import excel:', e);
                }
            }

            updatedCount++;
        }

        res.json({
            ok: true,
            mensaje: \`Se actualizaron \${updatedCount} asignaciones con éxito.\`,
            updatedCount,
            errors
        });
    } catch (err) {
        console.error('Error import excel:', err);
        res.status(500).json({ error: err.message });
    }
});
`;

const targetAnchor = "// ===================== EXPORT CONSOLIDADO GLOBAL =====================";
content = content.replace(targetAnchor, newEndpoint + '\n' + targetAnchor);

fs.writeFileSync('server.js', content);
console.log('Server.js updated');
