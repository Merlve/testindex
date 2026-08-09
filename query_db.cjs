const { createClient } = require("@libsql/client");
const path = require("path");
const sqliteDb = createClient({ url: 'file:' + path.join(process.cwd(), 'data', 'shindex.db') });
async function query() {
  const result = await sqliteDb.execute("SELECT name FROM sqlite_master WHERE type='table'");
  console.log(result.rows);
}
query().catch(console.error);
