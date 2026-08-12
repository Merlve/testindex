const { readSQLiteJSON } = require('./dist/server.cjs'); // Can't easily use sqlite_db because it's ESM, wait I'll just use a direct sqlite3 query.
