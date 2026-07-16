const fs = require('fs');
let text = fs.readFileSync('telegram.ts', 'utf-8');
text = text.replace(/\\`/g, '`');
text = text.replace(/\\\$/g, '$');
fs.writeFileSync('telegram.ts', text);
