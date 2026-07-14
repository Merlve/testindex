const fs = require('fs');
let serverTs = fs.readFileSync('server.ts', 'utf8');

serverTs = serverTs.replace(/const configPath = path\.join\(_dirname, 'config\.json'\);/g, "const configPath = path.join(process.cwd(), 'config.json');");
serverTs = serverTs.replace(/const dbPath = path\.join\(_dirname, 'db\.json'\);/g, "const dbPath = path.join(process.cwd(), 'db.json');");
serverTs = serverTs.replace(/const watchlistPath = path\.join\(_dirname, 'watchlist\.json'\);/g, "const watchlistPath = path.join(process.cwd(), 'watchlist.json');");

fs.writeFileSync('server.ts', serverTs);
console.log('patched successfully');
