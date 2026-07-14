const fs = require('fs');
let serverTs = fs.readFileSync('server.ts', 'utf8');

serverTs = serverTs.replace(/if \(fs\.existsSync\(configPath\)\) \{/g, 'if (fs.existsSync(configPath) && fs.statSync(configPath).isFile()) {');
serverTs = serverTs.replace(/if \(fs\.existsSync\(dbPath\)\) \{/g, 'if (fs.existsSync(dbPath) && fs.statSync(dbPath).isFile()) {');

serverTs = serverTs.replace(/fs\.writeFileSync\(configPath,/g, 'if (!fs.existsSync(configPath) || fs.statSync(configPath).isFile()) fs.writeFileSync(configPath,');
serverTs = serverTs.replace(/fs\.writeFileSync\(dbPath,/g, 'if (!fs.existsSync(dbPath) || fs.statSync(dbPath).isFile()) fs.writeFileSync(dbPath,');

fs.writeFileSync('server.ts', serverTs);
console.log('patched eisdir');
