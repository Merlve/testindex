const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

function addHelper(code) {
    if (code.includes('function safeReadJSON')) return code;
    const helper = `
function safeReadJSON(filePath: string) {
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const raw = fs.readFileSync(filePath, 'utf8').trim();
      if (raw) return JSON.parse(raw);
    }
  } catch (e) {
    console.error(\`[STARTUP ERROR] Failed to read \${filePath}: \`, e.message);
  }
  return null;
}
`;
    // Add it after "const _dirname"
    return code.replace(/(const _dirname = .*?;)/, `$1\n${helper}`);
}

code = addHelper(code);
code = code.replace(/JSON\.parse\(fs\.readFileSync\(configPath, 'utf8'\)\)/g, "safeReadJSON(configPath)");
code = code.replace(/JSON\.parse\(fs\.readFileSync\(dbPath, 'utf8'\)\)/g, "(safeReadJSON(dbPath) || {})");
code = code.replace(/JSON\.parse\(fs\.readFileSync\(libraryIndexPath, 'utf8'\)\)/g, "(safeReadJSON(libraryIndexPath) || { items: [], lastUpdated: 0 })");
code = code.replace(/JSON\.parse\(fs\.readFileSync\(filePath, 'utf8'\)\)/g, "(safeReadJSON(filePath) || [])");
code = code.replace(/JSON\.parse\(fs\.readFileSync\(expirationsFile, 'utf-8'\)\)/g, "(safeReadJSON(expirationsFile) || {})");
code = code.replace(/JSON\.parse\(fs\.readFileSync\(logsFile, 'utf-8'\)\)/g, "(safeReadJSON(logsFile) || [])");
code = code.replace(/JSON\.parse\(fs\.readFileSync\(genreBackdropsCachePath, 'utf8'\)\)/g, "safeReadJSON(genreBackdropsCachePath)");
code = code.replace(/JSON\.parse\(fs\.readFileSync\(jfOverrideFile, 'utf-8'\)\)/g, "(safeReadJSON(jfOverrideFile) || {})");

fs.writeFileSync('server.ts', code);
