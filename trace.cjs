const fs = require('fs');
const code = fs.readFileSync('src/pages/kho/ProductionOrderTab.jsx', 'utf-8');
const startIndex = code.indexOf('<div id="print-area"');
const printArea = code.substring(startIndex, code.lastIndexOf(')}', code.indexOf('</main>')));

let depth = 0;
const lines = printArea.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const opens = (line.match(/<div/g) || []).length;
  const closes = (line.match(/<\/div>/g) || []).length;
  depth += opens - closes;
  if (opens > 0 || closes > 0) {
    console.log(`Line ${i + 1}: opens ${opens}, closes ${closes}, depth ${depth} -> ${line.trim()}`);
  }
}
console.log('Final depth:', depth);
