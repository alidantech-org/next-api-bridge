const fs = require('node:fs');
const path = require('node:path');

fs.mkdirSync(path.resolve('.test-dist'), { recursive: true });
fs.writeFileSync(path.resolve('.test-dist/package.json'), JSON.stringify({ type: 'commonjs' }));
