const acorn = require('acorn');
const jsx = require('acorn-jsx');
acorn.Parser.extend(jsx()).parse(`
  const A = () => { 
    return ( 
      <main> 
        {allocations && ( 
          <div id="print-area">
          </div> 
        )} 
      </main> 
    ); 
  }
`, {sourceType: 'module', ecmaVersion: 2020});
console.log('Passed');
