import { createClient } from "@libsql/client";
import fs from 'fs';
import path from 'path';

const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

export const sqliteDb = createClient({ url: 'file:' + path.join(dbDir, 'shindex.db') });

export async function initSQLiteDB() {
  await sqliteDb.execute('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT)');

  const migrations = [
    { key: 'config', oldPath: 'config.json' },
    { key: 'db', oldPath: 'db.json' },
    { key: 'library_index', oldPath: 'library_index.json' },
    { key: 'genre_backdrops_cache', oldPath: 'genre_backdrops_cache.json' },
    { key: 'users_expirations', oldPath: 'users_expirations.json' },
    { key: 'activity_logs', oldPath: 'activity_logs.json' },
    { key: 'jf_override', oldPath: 'jf_override.json' },
    { key: 'jellyfin_cache', oldPath: 'jellyfin_cache.json' }
  ];

  for (const m of migrations) {
    const p = path.join(process.cwd(), m.oldPath);
    if (fs.existsSync(p) && !fs.existsSync(p + '.bak')) {
       try {
         const raw = fs.readFileSync(p, 'utf8').trim();
         if (raw) {
           const data = JSON.parse(raw);
           await writeSQLiteJSON(m.key, data);
         }
         fs.renameSync(p, p + '.bak');
         console.log(`Migrated ${m.oldPath} to SQLite`);
       } catch (e) {
         console.error(`Failed to migrate ${m.oldPath}:`, e);
       }
    }
  }

  const watchlistsDir = path.join(process.cwd(), 'watchlists');
  if (fs.existsSync(watchlistsDir) && !fs.existsSync(watchlistsDir + '.bak')) {
    try {
      const files = fs.readdirSync(watchlistsDir);
      for (const f of files) {
        if (f.endsWith('.json')) {
          const userId = f.replace('.json', '');
          const p = path.join(watchlistsDir, f);
          const data = JSON.parse(fs.readFileSync(p, 'utf8').trim() || '[]');
          await writeSQLiteJSON(`watchlist_${userId}`, data);
        }
      }
      fs.renameSync(watchlistsDir, watchlistsDir + '.bak');
      console.log(`Migrated watchlists to SQLite`);
    } catch(e) {
      console.error(`Failed to migrate watchlists:`, e);
    }
  }

  const recommendationsDir = path.join(process.cwd(), 'recommendations');
  if (fs.existsSync(recommendationsDir) && !fs.existsSync(recommendationsDir + '.bak')) {
    try {
      const files = fs.readdirSync(recommendationsDir);
      for (const f of files) {
        if (f.endsWith('.json')) {
          const userId = f.replace('.json', '');
          const p = path.join(recommendationsDir, f);
          const data = JSON.parse(fs.readFileSync(p, 'utf8').trim() || '[]');
          await writeSQLiteJSON(`recommendations_${userId}`, data);
        }
      }
      fs.renameSync(recommendationsDir, recommendationsDir + '.bak');
      console.log(`Migrated recommendations to SQLite`);
    } catch(e) {
      console.error(`Failed to migrate recommendations:`, e);
    }
  }
}

export async function readSQLiteJSON(key: string) {
  try {
    const rs = await sqliteDb.execute({ sql: 'SELECT value FROM kv_store WHERE key = ?', args: [key] });
    if (rs.rows.length > 0 && rs.rows[0].value) {
      return JSON.parse(rs.rows[0].value as string);
    }
  } catch(e) {
    console.error(`Error reading ${key} from SQLite:`, e);
  }
  return null;
}

export async function writeSQLiteJSON(key: string, value: any) {
  try {
    const str = JSON.stringify(value);
    await sqliteDb.execute({ sql: 'INSERT INTO kv_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', args: [key, str] });
  } catch(e) {
    console.error(`Error writing ${key} to SQLite:`, e);
  }
}
