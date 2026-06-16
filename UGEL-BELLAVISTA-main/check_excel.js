const xlsx = require('xlsx');
const path = require('path');

function inspectExcel(filename) {
    const p = path.join(__dirname, filename);
    console.log(`\n--- Inspecting ${filename} ---`);
    const workbook = xlsx.readFile(p);
    workbook.SheetNames.forEach(sheetName => {
        console.log(`\nSheet: ${sheetName}`);
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        if (data.length > 0) {
            for (let i = 0; i < Math.min(5, data.length); i++) {
                console.log(`Row ${i}:`, data[i]);
            }
        }
    });
}

inspectExcel('codigos modulares.xlsx');
