const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  "let appConfig = {\n  openlistUrl: process.env.OPENLIST_SERVER_URL || 'https://fox.oplist.org',\n  basePath: '/home'\n};",
  "let appConfig = {\n  openlistUrl: process.env.OPENLIST_SERVER_URL || 'https://fox.oplist.org',\n  basePath: '/home',\n  inactivityTimeout: 0 // minutes, 0 means disabled\n};"
);

code = code.replace(
  "app.get('/api/config', (req, res) => {\n  res.json({\n    openlistUrl: getOpenlistUrl(),\n    basePath: appConfig.basePath\n  });\n});",
  "app.get('/api/config', (req, res) => {\n  res.json({\n    openlistUrl: getOpenlistUrl(),\n    basePath: appConfig.basePath,\n    inactivityTimeout: appConfig.inactivityTimeout || 0\n  });\n});"
);

code = code.replace(
  "app.post('/api/config', (req, res) => {\n  if (req.body.openlistUrl) appConfig.openlistUrl = req.body.openlistUrl;\n  if (req.body.basePath) appConfig.basePath = req.body.basePath;",
  "app.post('/api/config', (req, res) => {\n  if (req.body.openlistUrl !== undefined) appConfig.openlistUrl = req.body.openlistUrl;\n  if (req.body.basePath !== undefined) appConfig.basePath = req.body.basePath;\n  if (req.body.inactivityTimeout !== undefined) appConfig.inactivityTimeout = Number(req.body.inactivityTimeout) || 0;"
);

fs.writeFileSync('server.ts', code);
