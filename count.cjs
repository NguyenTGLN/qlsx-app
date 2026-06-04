const fs = require('fs');
const code = fs.readFileSync('src/pages/kho/ProductionOrderTab.jsx', 'utf-8');
const startIndex = code.indexOf('<div id="print-area"');
const endIndex = code.indexOf(')}', startIndex);
const printArea = code.substring(startIndex, endIndex);

const getCount = (regex) => (printArea.match(regex) || []).length;

console.log('<div> opens:', getCount(/<div/g));
console.log('</div> closes:', getCount(/<\/div>/g));
console.log('<span> opens:', getCount(/<span/g));
console.log('</span> closes:', getCount(/<\/span>/g));
console.log('<table> opens:', getCount(/<table/g));
console.log('</table> closes:', getCount(/<\/table>/g));
