import { createClient } from "@libsql/client";
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { setGlobalDispatcher, Agent } from 'undici';

// Increase timeouts for Turso/LibSQL HTTP requests
setGlobalDispatcher(new Agent({
  connectTimeout: 60000,
  headersTimeout: 300000,
  bodyTimeout: 300000,
}));

const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const kvBackupDir = path.join(dbDir, 'kv_backup');
if (!fs.existsSync(kvBackupDir)) fs.mkdirSync(kvBackupDir, { recursive: true });

const memoryKV = new Map<string, any>();

function getLocalBackup(key: string): any | null {
  try {
    if (memoryKV.has(key)) return memoryKV.get(key);
    const safeKey = key.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filePath = path.join(kvBackupDir, `${safeKey}.json`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8').trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        memoryKV.set(key, parsed);
        return parsed;
      }
    }
  } catch (e) {}
  return null;
}

function setLocalBackup(key: string, value: any) {
  try {
    memoryKV.set(key, value);
    const safeKey = key.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filePath = path.join(kvBackupDir, `${safeKey}.json`);
    fs.writeFileSync(filePath, JSON.stringify(value), 'utf8');
  } catch (e) {}
}

const dbUrl = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || ('file:' + path.join(dbDir, 'shindex.db'));
const dbAuthToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

export const sqliteDb = createClient({ 
  url: dbUrl,
  ...(dbAuthToken ? { authToken: dbAuthToken } : {})
});

async function executeWithRetry(stmt: { sql: string; args?: any[] } | string, maxRetries = 3) {
  let lastError: any = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await sqliteDb.execute(stmt);
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || err?.cause?.message || err || '');
      const code = String(err?.code || err?.status || err?.cause?.status || '');
      const isTransient =
        msg.includes('502') ||
        msg.includes('fetch failed') ||
        msg.includes('SERVER_ERROR') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('ECONNRESET') ||
        msg.includes('EAI_AGAIN') ||
        code.includes('502') ||
        code.includes('503') ||
        code.includes('504');

      if (isTransient && attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export async function initSQLiteDB() {
  try {
    await executeWithRetry('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT)', 3);
  } catch (e) {
    console.warn('SQLite/Turso table init warning (using local fallback if remote unreachable):', String(e));
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
    const rs = await executeWithRetry({ sql: 'SELECT value FROM kv_store WHERE key = ?', args: [key] }, 3);
    if (rs && rs.rows && rs.rows.length > 0 && rs.rows[0].value) {
      let valStr = rs.rows[0].value as string;
      if (valStr.startsWith('gz:')) {
        const buffer = Buffer.from(valStr.slice(3), 'base64');
        valStr = zlib.inflateSync(buffer).toString('utf8');
      }
      const parsed = JSON.parse(valStr);
      setLocalBackup(key, parsed);
      return parsed;
    }
  } catch(e) {
    // If Turso/SQLite returns 502 or fetch failed, fallback gracefully to local backup
  }
  return getLocalBackup(key);
}

export async function writeSQLiteJSON(key: string, value: any) {
  // Always update local disk backup first
  setLocalBackup(key, value);

  try {
    const str = JSON.stringify(value);
    let valToStore = str;
    // Compress strings larger than ~30KB to reduce HTTP payload size for Turso/LibSQL
    if (str.length > 30000) {
      const buffer = zlib.deflateSync(str);
      valToStore = 'gz:' + buffer.toString('base64');
    }
    await executeWithRetry(
      { sql: 'INSERT INTO kv_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', args: [key, valToStore] },
      3
    );
  } catch(e) {
    // Local backup was saved, remote update will retry or use local
  }
}
