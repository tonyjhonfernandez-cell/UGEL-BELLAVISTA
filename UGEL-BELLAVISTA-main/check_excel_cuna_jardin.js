const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const downloadsDir = 'C:/Users/tonyj/Downloads';
const files = [
    'rptDatosInstitucionesEducativas_20250401091722.xlsx',
    'rptDatosInstitucionesEducativas_20260515092504.xlsx'
];

for (const file of files) {
    const p = path.join(downloadsDir, file);
    if (!fs.existsSync(p)) continue;
    console.log(`\n--- Searching ${file} ---`);
    const workbook = xlsx.readFile(p);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const rowStr = JSON.stringify(row).toLowerCase();
        if (rowStr.includes('teresa') || rowStr.includes('rosalia')) {
            console.log(`Row ${i}:`, row);
        }
    }
}
