import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const dbPath = path.join(dbDir, 'shindex.db');

let db: Database | null = null;
let dbPromise: Promise<Database> | null = null;

// Initialize the database connection safely without concurrent race conditions
export async function getDB(): Promise<Database> {
  if (db) return db;
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const instance = await open({
          filename: dbPath,
          driver: sqlite3.Database
        });
        // Pragmas for stability and preventing database lock / memory corruption
        await instance.exec('PRAGMA journal_mode = WAL;');
        await instance.exec('PRAGMA busy_timeout = 5000;');
        await instance.exec('PRAGMA synchronous = NORMAL;');
        db = instance;
        return instance;
      } catch (err) {
        dbPromise = null; // Reset so next call can retry
        console.error('[SQLite] Connection error during open:', err);
        throw err;
      }
    })();
  }
  return dbPromise;
}

export async function initSQLiteDB() {
  try {
    const database = await getDB();
    await database.exec('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT)');
    await database.exec('CREATE TABLE IF NOT EXISTS details_cache (path TEXT PRIMARY KEY, tmdb_data TEXT, base_items TEXT, season_items TEXT, updated_at INTEGER)');
    await database.exec('CREATE TABLE IF NOT EXISTS image_cache (url TEXT PRIMARY KEY, mime_type TEXT, data BLOB)');
  } catch (e) {
    console.error('Failed to initialize local SQLite database:', String(e));
  }

  try {
    // Check if data/db.json or db.json exists on disk and import any saved corrections/metadata
    let dbJsonPath = path.join(dbDir, 'db.json');
    if (!fs.existsSync(dbJsonPath)) {
      dbJsonPath = path.join(process.cwd(), 'db.json');
    }
    if (fs.existsSync(dbJsonPath)) {
      try {
        const raw = fs.readFileSync(dbJsonPath, 'utf8').trim();
        if (raw) {
          const diskDb = JSON.parse(raw);
          const currentSqliteDb = await readSQLiteJSON('db') || {};
          const merged = { ...diskDb, ...currentSqliteDb };
          // Preserve overrides from diskDb
          for (const k of Object.keys(diskDb)) {
            if (diskDb[k]?._overridden) {
              merged[k] = diskDb[k];
            }
          }
          await writeSQLiteJSON('db', merged);
        }
      } catch (e) {
        console.error('Failed to sync db.json on startup:', e);
      }
    }

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

    if (key === 'db') {
      try {
        fs.writeFileSync(path.join(dbDir, 'db.json'), JSON.stringify(value, null, 2), 'utf8');
        fs.writeFileSync(path.join(process.cwd(), 'db.json'), JSON.stringify(value, null, 2), 'utf8');
      } catch (e) {
        console.error('Failed to sync db.json to disk:', e);
      }
    } else if (key === 'config') {
      try {
        fs.writeFileSync(path.join(dbDir, 'config.json'), JSON.stringify(value, null, 2), 'utf8');
        fs.writeFileSync(path.join(process.cwd(), 'config.json'), JSON.stringify(value, null, 2), 'utf8');
      } catch (e) {
        console.error('Failed to sync config.json to disk:', e);
      }
    }
  } catch (e) {
    console.error(`Error writing ${key} to SQLite:`, e);
  }
}


// Details Cache Service Layer
export async function getDetailsCache(path: string) {
  try {
    const database = await getDB();
    const row = await database.get('SELECT * FROM details_cache WHERE path = ?', path);
    if (row) {
      return {
        tmdbData: row.tmdb_data ? JSON.parse(row.tmdb_data) : null,
        baseItems: row.base_items ? JSON.parse(row.base_items) : [],
        seasonItems: row.season_items ? JSON.parse(row.season_items) : [],
        updatedAt: row.updated_at
      };
    }
  } catch (e) {
    console.error('Error reading details cache:', e);
  }
  return null;
}

export async function updateDetailsCache(path: string, tmdbData: any, baseItems: any[], seasonItems: any[]) {
  try {
    const database = await getDB();
    await database.run(
      'INSERT INTO details_cache (path, tmdb_data, base_items, season_items, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET tmdb_data=excluded.tmdb_data, base_items=excluded.base_items, season_items=excluded.season_items, updated_at=excluded.updated_at',
      [
        path,
        tmdbData ? JSON.stringify(tmdbData) : null,
        baseItems ? JSON.stringify(baseItems) : null,
        seasonItems ? JSON.stringify(seasonItems) : null,
        Date.now()
      ]
    );
  } catch (e) {
    console.error('Error updating details cache:', e);
  }
}

export async function getImageFromCache(url: string) {
  try {
    const database = await getDB();
    const row = await database.get('SELECT mime_type, data FROM image_cache WHERE url = ?', url);
    return row || null;
  } catch (e) {
    return null;
  }
}

export async function saveImageToCache(url: string, mimeType: string, data: Buffer) {
  try {
    const database = await getDB();
    await database.run(
      'INSERT INTO image_cache (url, mime_type, data) VALUES (?, ?, ?) ON CONFLICT(url) DO UPDATE SET mime_type=excluded.mime_type, data=excluded.data',
      [url, mimeType, data]
    );
  } catch (e) {
    console.error('Error saving image cache:', e);
  }
}
