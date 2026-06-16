const fs = require('fs');

const serverJsPath = 'server.js';
let content = fs.readFileSync(serverJsPath, 'utf8');

const startTag = "app.get('/api/export/consolidado/:actividadId', authDirector, async (req, res) => {";
const endTag = "// ===================== EXPORT CONSOLIDADO GLOBAL =====================";

const startIndex = content.indexOf(startTag);
const endIndex = content.indexOf(endTag, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
    const newEndpoint = `app.get('/api/export/consolidado/:actividadId', authDirector, async (req, res) => {
    try {
        const { actividadId } = req.params;
        // Get activity info
        const actRes = await pool.query('SELECT titulo, fecha_limite FROM actividades WHERE id = $1', [parseInt(actividadId)]);
        const act = actRes.rows[0] || { titulo: 'Actividad', fecha_limite: null };

        const rows = await pool.query(\`
            SELECT ase.estado, ase.fecha_completado, ase.notas_supervisor,
                   ie.nombre as ie_nombre, ie.codigo as ie_codigo,
                   u.nombre_completo as director_nombre, u.dependencia, u.puesto,
                   STRING_AGG(DISTINCT ne.nombre, ', ' ORDER BY ne.nombre) as nivel_nombre
            FROM asignaciones ase
            JOIN instituciones_educativas ie ON ase.ie_id = ie.id
            LEFT JOIN usuarios u ON ase.director_id = u.id
            LEFT JOIN ie_niveles iln ON iln.ie_id = ie.id
            LEFT JOIN niveles_educativos ne ON iln.nivel_id = ne.id
            WHERE ase.actividad_id = $1
            GROUP BY ase.estado, ase.fecha_completado, ase.notas_supervisor,
                     ie.nombre, ie.codigo, u.nombre_completo, u.dependencia, u.puesto
            ORDER BY u.dependencia, ie.nombre
        \`, [parseInt(actividadId)]);

        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        wb.creator = 'UGEL Bellavista';
        wb.created = new Date();

        const dataByArea = {};
        
        rows.rows.forEach(r => {
            const area = r.dependencia || 'Sin Área';
            if (!dataByArea[area]) dataByArea[area] = [];
            dataByArea[area].push(r);
        });

        if (Object.keys(dataByArea).length === 0) {
            wb.addWorksheet('Sin Datos');
        }

        const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
        const headerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };
        const thinBorder = { style: 'thin', color: { argb: 'FFDDDDDD' } };
        const cellBorder = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

        const estadoStyles = {
            completada: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }, font: { color: { argb: 'FF2E7D32' }, bold: true, name: 'Calibri', size: 10 } },
            pendiente:  { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } }, font: { color: { argb: 'FFE65100' }, bold: true, name: 'Calibri', size: 10 } },
            inconclusa: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0B2' } }, font: { color: { argb: 'FFF57C00' }, bold: true, name: 'Calibri', size: 10 } },
            no_cumplida:{ fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } }, font: { color: { argb: 'FFC62828' }, bold: true, name: 'Calibri', size: 10 } }
        };

        for (const area of Object.keys(dataByArea)) {
            // Clean sheet name (max 31 chars, no invalid chars)
            const safeSheetName = area.replace(/[*?\\]\\[/:\\\\]/g, '').substring(0, 31);
            const ws = wb.addWorksheet(safeSheetName);

            ws.columns = [
                { header: '#', key: 'num', width: 5 },
                { header: 'CÓDIGO LOCAL', key: 'codigo', width: 14 },
                { header: 'INSTITUCIÓN EDUCATIVA', key: 'nombre', width: 44 },
                { header: 'DIRECTOR', key: 'director', width: 28 },
                { header: 'PUESTO', key: 'puesto', width: 22 },
                { header: 'NIVEL(ES)', key: 'nivel', width: 24 },
                { header: 'ESTADO', key: 'estado', width: 16 },
                { header: 'FECHA COMPLETADO', key: 'fecha', width: 20 },
                { header: 'NOTAS', key: 'notas', width: 36 },
            ];

            const hRow = ws.getRow(1);
            hRow.height = 30;
            ws.columns.forEach((col, i) => {
                const cell = hRow.getCell(i + 1);
                cell.value = col.header;
                cell.fill = headerFill;
                cell.font = headerFont;
                cell.alignment = headerAlign;
                cell.border = cellBorder;
            });

            dataByArea[area].forEach((r, i) => {
                const rowNum = i + 2;
                const row = ws.getRow(rowNum);
                const bg = rowNum % 2 === 0 ? 'FFF8F9FF' : 'FFFFFFFF';
                row.values = [
                    i + 1, r.ie_codigo, r.ie_nombre, r.director_nombre || '',
                    r.puesto || '',
                    r.nivel_nombre || '', r.estado,
                    r.fecha_completado ? new Date(r.fecha_completado).toLocaleDateString('es-PE') : '',
                    r.notas_supervisor || ''
                ];
                row.height = 20;
                row.eachCell({ includeEmpty: true }, (cell, ci) => {
                    cell.border = cellBorder;
                    cell.alignment = { vertical: 'middle', wrapText: true };
                    if (ci === 7 && estadoStyles[r.estado]) { // estado is col 7
                        cell.fill = estadoStyles[r.estado].fill;
                        cell.font = estadoStyles[r.estado].font;
                    } else {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
                        cell.font = { name: 'Calibri', size: 10 };
                    }
                });
            });

            ws.views = [{ state: 'frozen', ySplit: 1 }];
        }

        const safeTitle = (act.titulo || 'consolidado').replace(/[^a-z0-9]/gi, '_').substring(0, 30);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', \`attachment; filename="consolidado_\${safeTitle}.xlsx"\`);
        await wb.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Error export consolidado:', err);
        res.status(500).json({ error: err.message });
    }
});

`;
    const newContent = content.substring(0, startIndex) + newEndpoint + content.substring(endIndex);
    fs.writeFileSync(serverJsPath, newContent);
    console.log("Replaced successfully");
} else {
    console.error("Could not find start/end tags");
}
