const fs = require('fs');
const acorn = require('acorn');
const jsx = require('acorn-jsx');
const code = fs.readFileSync('src/pages/kho/ProductionOrderTab.jsx', 'utf-8');
try {
  acorn.Parser.extend(jsx()).parse(code, {sourceType: 'module'});
  console.log('Parsed successfully');
} catch(e) {
  console.log('Parse error at line ' + e.loc.line + ' col ' + e.loc.column);
  console.log(e.message);
}
