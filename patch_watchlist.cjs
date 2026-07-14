const fs = require('fs');
let serverTs = fs.readFileSync('server.ts', 'utf8');

const oldWatchlistLogic = `
// Watchlist DB
const watchlistPath = path.join(process.cwd(), 'watchlist.json');
let watchlistDb = {};
if (fs.existsSync(watchlistPath)) {
  try { watchlistDb = JSON.parse(fs.readFileSync(watchlistPath, 'utf8')); } catch (e) {}
}
function saveWatchlist() {
  try { fs.writeFileSync(watchlistPath, JSON.stringify(watchlistDb, null, 2)); } catch (e) {}
}

app.get('/api/watchlist', (req, res) => {
  const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  res.json(watchlistDb[user] || []);
});

app.post('/api/watchlist/toggle', (req, res) => {
  const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  
  const { item, category, parentPath } = req.body;
  if (!watchlistDb[user]) watchlistDb[user] = [];
  
  const list = watchlistDb[user];
  const existingIndex = list.findIndex(i => i.item.name === item.name && i.parentPath === parentPath);
  
  if (existingIndex >= 0) {
    list.splice(existingIndex, 1);
  } else {
    list.push({ item, category, parentPath });
  }
  
  saveWatchlist();
  res.json({ success: true, watchlist: list, added: existingIndex < 0 });
});

app.get('/api/watchlist/check', (req, res) => {
  const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
  const { name, parentPath } = req.query;
  if (!user || !name || !parentPath) return res.json({ inWatchlist: false });

  const list = watchlistDb[user] || [];
  const exists = list.some(i => i.item.name === name && i.parentPath === parentPath);
  res.json({ inWatchlist: exists });
});
`;

const newWatchlistLogic = `
// Watchlist DB per user
const watchlistsDir = path.join(process.cwd(), 'watchlists');
if (!fs.existsSync(watchlistsDir)) {
  try { fs.mkdirSync(watchlistsDir, { recursive: true }); } catch (e) {}
}

// Migrate old data if exists
const oldWatchlistPath = path.join(process.cwd(), 'watchlist.json');
if (fs.existsSync(oldWatchlistPath)) {
  try {
    const oldDb = JSON.parse(fs.readFileSync(oldWatchlistPath, 'utf8'));
    for (const [usr, list] of Object.entries(oldDb)) {
       const userFile = path.join(watchlistsDir, \`\${usr}.json\`);
       if (!fs.existsSync(userFile)) {
         fs.writeFileSync(userFile, JSON.stringify(list, null, 2));
       }
    }
  } catch (e) {}
}

function getUserWatchlist(user: string) {
  const userFile = path.join(watchlistsDir, \`\${user}.json\`);
  if (fs.existsSync(userFile)) {
     try { return JSON.parse(fs.readFileSync(userFile, 'utf8')); } catch (e) { return []; }
  }
  return [];
}

function saveUserWatchlist(user: string, list: any[]) {
  const userFile = path.join(watchlistsDir, \`\${user}.json\`);
  try { fs.writeFileSync(userFile, JSON.stringify(list, null, 2)); } catch (e) { console.error("Failed to save watchlist for", user, e); }
}

app.get('/api/watchlist', (req, res) => {
  const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
  if (!user || typeof user !== 'string') return res.status(401).json({ error: 'Unauthorized' });
  const safeUser = user.replace(/[^a-zA-Z0-9_-]/g, '_');
  res.json(getUserWatchlist(safeUser));
});

app.post('/api/watchlist/toggle', (req, res) => {
  const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
  if (!user || typeof user !== 'string') return res.status(401).json({ error: 'Unauthorized' });
  const safeUser = user.replace(/[^a-zA-Z0-9_-]/g, '_');
  
  const { item, category, parentPath } = req.body;
  const list = getUserWatchlist(safeUser);
  const existingIndex = list.findIndex((i: any) => i.item.name === item.name && i.parentPath === parentPath);
  
  if (existingIndex >= 0) {
    list.splice(existingIndex, 1);
  } else {
    list.push({ item, category, parentPath });
  }
  
  saveUserWatchlist(safeUser, list);
  res.json({ success: true, watchlist: list, added: existingIndex < 0 });
});

app.get('/api/watchlist/check', (req, res) => {
  const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
  const { name, parentPath } = req.query;
  if (!user || typeof user !== 'string' || !name || !parentPath) return res.json({ inWatchlist: false });

  const safeUser = user.replace(/[^a-zA-Z0-9_-]/g, '_');
  const list = getUserWatchlist(safeUser);
  const exists = list.some((i: any) => i.item.name === name && i.parentPath === parentPath);
  res.json({ inWatchlist: exists });
});
`;

// we need to locate the old logic dynamically in case spacing differs.
let replaced = false;

// Just use regex to replace from "// Watchlist DB" to "app.get('/api/config'"
const startStr = "// Watchlist DB";
const endStr = "// API: Config";
const startIndex = serverTs.indexOf(startStr);
const endIndex = serverTs.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
   const before = serverTs.substring(0, startIndex);
   const after = serverTs.substring(endIndex);
   serverTs = before + newWatchlistLogic + '\n' + after;
   replaced = true;
}

if (replaced) {
  fs.writeFileSync('server.ts', serverTs);
  console.log('patched successfully');
} else {
  console.log('failed to patch');
}
