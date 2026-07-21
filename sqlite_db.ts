import { createClient } from "@libsql/client";
import fs from 'fs';
import path from 'path';

const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

export const sqliteDb = createClient({ url: 'file:' + path.join(dbDir, 'shindex.db') });

export async function initSQLiteDB() {
  await sqliteDb.execute('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT)');

  const migrationFlag = await readSQLiteJSON('_migration_complete');
  if (migrationFlag) {
    return; // Already migrated
  }

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
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
         const raw = fs.readFileSync(p, 'utf8').trim();
         if (raw) {
           const data = JSON.parse(raw);
           await writeSQLiteJSON(m.key, data);
           console.log(`Migrated ${m.oldPath} to SQLite`);
         }
      }
    } catch (e) {
      console.error(`Failed to migrate ${m.oldPath}:`, e);
    }
  }

  const watchlistsDir = path.join(process.cwd(), 'watchlists');
  try {
    if (fs.existsSync(watchlistsDir) && fs.statSync(watchlistsDir).isDirectory()) {
      const files = fs.readdirSync(watchlistsDir);
      for (const f of files) {
        if (f.endsWith('.json')) {
          const userId = f.replace('.json', '');
          const p = path.join(watchlistsDir, f);
          if (fs.statSync(p).isFile()) {
            const data = JSON.parse(fs.readFileSync(p, 'utf8').trim() || '[]');
            await writeSQLiteJSON(`watchlist_${userId}`, data);
          }
        }
      }
      console.log(`Migrated watchlists to SQLite`);
    }
  } catch(e) {
    console.error(`Failed to migrate watchlists:`, e);
  }

  const recommendationsDir = path.join(process.cwd(), 'recommendations');
  try {
    if (fs.existsSync(recommendationsDir) && fs.statSync(recommendationsDir).isDirectory()) {
      const files = fs.readdirSync(recommendationsDir);
      for (const f of files) {
        if (f.endsWith('.json')) {
          const userId = f.replace('.json', '');
          const p = path.join(recommendationsDir, f);
          if (fs.statSync(p).isFile()) {
             const data = JSON.parse(fs.readFileSync(p, 'utf8').trim() || '[]');
             await writeSQLiteJSON(`recommendations_${userId}`, data);
          }
        }
      }
      console.log(`Migrated recommendations to SQLite`);
    }
  } catch(e) {
    console.error(`Failed to migrate recommendations:`, e);
  }

  await writeSQLiteJSON('_migration_complete', true);
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
