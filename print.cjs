const fs = require('fs');
const code = fs.readFileSync('src/pages/kho/ProductionOrderTab.jsx', 'utf-8');
const startIndex = code.indexOf('<div id="print-area"');
const endIndex = code.indexOf(')}', startIndex);
console.log(code.substring(startIndex, endIndex + 2));
