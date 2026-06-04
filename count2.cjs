const fs = require('fs');
const code = fs.readFileSync('src/pages/kho/ProductionOrderTab.jsx', 'utf-8');
const startIndex = code.indexOf('<div id="print-area"');
// Find the last )} in the file, or close to 1328
const lines = code.split('\n');
let endIndex = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(')}')) {
    endIndex = code.indexOf(lines[i], endIndex + 1);
  }
}
const printArea = code.substring(startIndex, code.lastIndexOf(')}', code.indexOf('</main>')));

const getCount = (regex) => (printArea.match(regex) || []).length;

console.log('<div> opens:', getCount(/<div/g));
console.log('</div> closes:', getCount(/<\/div>/g));
console.log('<table> opens:', getCount(/<table/g));
console.log('</table> closes:', getCount(/<\/table>/g));
console.log('<span> opens:', getCount(/<span/g));
console.log('</span> closes:', getCount(/<\/span>/g));
console.log('<p> opens:', getCount(/<p\b/g));
console.log('</p> closes:', getCount(/<\/p>/g));
