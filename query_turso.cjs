const { createClient } = require("@libsql/client");
const zlib = require("zlib");
const sqliteDb = createClient({ 
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN
});
async function query() {
  const result = await sqliteDb.execute("SELECT value FROM kv_store WHERE key = 'library_index'");
  if (result.rows.length > 0) {
      let dataStr = result.rows[0].value;
      if (dataStr.startsWith('gz:')) {
         const buffer = Buffer.from(dataStr.substring(3), 'base64');
         dataStr = zlib.unzipSync(buffer).toString('utf-8');
      }
      const data = JSON.parse(dataStr);
      if (data.items) {
         const show = data.items.find(i => i.name.toLowerCase().includes('butterflied'));
         console.log(JSON.stringify(show, null, 2));
      }
  } else {
      console.log("No library index");
  }
}
query().catch(console.error);
