import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const dbPath = path.join(dbDir, 'shindex.db');

let db: Database | null = null;

// Initialize the database connection
export async function getDB() {
  if (db) return db;
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  return db;
}

export async function initSQLiteDB() {
  try {
    const database = await getDB();
    await database.exec('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT)');
  } catch (e) {
    console.error('Failed to initialize local SQLite database:', String(e));
  }

  try {
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

    const watchedDirs = [
      path.join(process.cwd(), 'watched'),
      path.join(process.cwd(), 'data', 'watched')
    ];

    for (const wDir of watchedDirs) {
      try {
        if (fs.existsSync(wDir) && fs.statSync(wDir).isDirectory()) {
          const files = fs.readdirSync(wDir);
          for (const f of files) {
            if (f.endsWith('.json')) {
              const userId = f.replace('.json', '').toLowerCase().trim();
              const p = path.join(wDir, f);
              if (fs.statSync(p).isFile()) {
                const data = JSON.parse(fs.readFileSync(p, 'utf8').trim() || '[]');
                if (Array.isArray(data)) {
                  await writeSQLiteJSON(`watched_${userId}`, data);
                }
              }
            }
          }
          console.log(`Migrated watched items from ${wDir} to SQLite`);
        }
      } catch(e) {
        console.error(`Failed to migrate watched items from ${wDir}:`, e);
      }
    }

    await writeSQLiteJSON('_migration_complete', true);
  } catch (err) {
    console.error("Error during SQLite DB migration check:", err);
  }
}

export async function readSQLiteJSON(key: string) {
  try {
    const database = await getDB();
    const row = await database.get('SELECT value FROM kv_store WHERE key = ?', key);
    if (row && row.value) {
      let valStr = row.value as string;
      if (valStr.startsWith('gz:')) {
        const buffer = Buffer.from(valStr.slice(3), 'base64');
        valStr = zlib.inflateSync(buffer).toString('utf8');
      }
      return JSON.parse(valStr);
    }
  } catch (e) {
    console.error(`Error reading ${key} from SQLite:`, e);
  }
  return null;
}

export async function writeSQLiteJSON(key: string, value: any) {
  try {
    const database = await getDB();
    const str = JSON.stringify(value);
    let valToStore = str;
    
    // We can keep compression to save disk space for huge objects,
    // and it maintains compatibility with existing data
    if (str.length > 30000) {
      const buffer = zlib.deflateSync(str);
      valToStore = 'gz:' + buffer.toString('base64');
    }
    
    await database.run(
      'INSERT INTO kv_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      [key, valToStore]
    );
  } catch (e) {
    console.error(`Error writing ${key} to SQLite:`, e);
  }
}
