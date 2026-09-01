import 'dotenv/config';

// Global error boundaries and process crash logging for startup & runtime diagnostics
process.on('uncaughtException', (err) => {
  console.error('[FATAL STARTUP/RUNTIME ERROR] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL STARTUP/RUNTIME ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('warning', (warning) => {
  console.warn('[Process Warning]:', warning.name, warning.message, warning.stack);
});

import express from 'express';
import { getRecentlyAdded, getLocalItems, initJellyfinCache } from './jellyfin';
import { getOgMetadataForUrl, injectOgTags } from './og_meta';

import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import Fuse from 'fuse.js';
import dns from 'dns';
import http from 'http';
import https from 'https';

dns.setDefaultResultOrder('ipv4first');

// Configure highly robust HTTP/HTTPS Keep-Alive agents to prevent stale socket hangs on VPS firewalls
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000, // Send TCP Keep-Alive every 10s
  timeout: 30000,       // Socket timeout
  scheduling: 'fifo'
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  timeout: 30000,
  scheduling: 'fifo'
});

axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;
axios.defaults.timeout = 30000; // 30s timeout instead of 60s


const logFile = path.join(process.cwd(), 'app-debug.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function formatLogMessage(level: string, ...args: any[]) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
        if (arg instanceof Error) {
            return `${arg.message}\n${arg.stack}`;
        }
        return typeof arg === 'object' ? JSON.stringify(arg) : arg;
    }).join(' ');
    return `[${timestamp}] [${level}] ${message}\n`;
}

console.log = function(...args) {
    try {
        originalLog.apply(console, args);
    } catch(e) {}
};

console.error = function(...args) {
    try {
        originalError.apply(console, args);
    } catch(e) {}
};

console.warn = function(...args) {
    try {
        originalWarn.apply(console, args);
    } catch(e) {}
};

const invalidatedTokens = new Set<string>();
let activeUserSessions: Record<string, { token: string, username: string, loginTime: number, ip: string, userAgent?: string }> = {};

function invalidateTokenStr(token: string) {
    if (token && token !== process.env.OPENLIST_API_KEY) {
        invalidatedTokens.add(token);
        let arr = Array.from(invalidatedTokens);
        if (arr.length > 5000) {
            arr = arr.slice(-5000);
            invalidatedTokens.clear();
            arr.forEach(t => invalidatedTokens.add(t));
        }
        writeSQLiteJSON('invalidated_tokens', arr).catch(()=>{});
        
        // Remove from activeUserSessions if present
        let changed = false;
        for (const [key, session] of Object.entries(activeUserSessions)) {
            if (session.token === token) {
                delete activeUserSessions[key];
                changed = true;
            }
        }
        if (changed) {
            writeSQLiteJSON('active_user_sessions', activeUserSessions).catch(()=>{});
        }
    }
}

function markTokenInvalidated(config: any) {
    if (config?.headers?.Authorization || config?.headers?.authorization) {
        const token = config.headers.Authorization || config.headers.authorization;
        invalidateTokenStr(token);
    }
}

// Auto-retry outgoing Axios requests on HTTP 429 (rate limits) with exponential backoff
axios.interceptors.response.use(
  response => {
      if (response.data && response.data.code === 401) {
          markTokenInvalidated(response.config);
      }
      return response;
  },
  async error => {
    const config = error?.config;
    if (error?.response?.status === 401) {
        markTokenInvalidated(config);
    }
    if (error?.response?.status === 429 && config && (config._retryCount || 0) < 3) {
      config._retryCount = (config._retryCount || 0) + 1;
      const delay = config._retryCount * 1200;
      console.warn(`[Server Axios] HTTP 429 Rate limited on ${config.url}. Retrying attempt ${config._retryCount}/3 in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return axios(config);
    }
    return Promise.reject(error);
  }
);
import crypto from 'crypto';
import { createRequire } from 'module';
import { readSQLiteJSON, writeSQLiteJSON, initSQLiteDB, getDB } from './sqlite_db';

const _filename = typeof __filename !== 'undefined' ? __filename : process.cwd();
const _dirname = typeof __dirname !== 'undefined' ? __dirname : process.cwd();





// --- In-Memory Cache Implementation ---
class MemoryCache {
  private cache = new Map<string, { data: any, expiry: number }>();
  private sweepInterval: NodeJS.Timeout;

  constructor() {
    this.sweepInterval = setInterval(() => this.sweep(), 60000);
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  clear() { this.cache.clear(); }

  set(key: string, data: any, ttlSeconds: number) {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlSeconds * 1000
    });
  }

  delete(key: string) {
    this.cache.delete(key);
  }

  private sweep() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

const apiCache = new MemoryCache();
let globalMetaVersion = Date.now();
function bumpMetaVersion() {
  globalMetaVersion = Date.now();
  apiCache.clear();
}

function cacheMiddleware(ttlSeconds: number, isPrivate: boolean = true) {
  return (req: any, res: any, next: any) => {
    if (req.method !== 'GET' && req.method !== 'POST') return next();

    // Do not cache if client explicitly asks for refresh
    const forceRefresh = req.body?.refresh === true || req.query?.refresh === 'true' || req.query?.force === 'true';

    const token = req.headers.authorization || '';

    // Create normal body without refresh flags for standard cache key matching
    const normalBody = req.body ? { ...req.body } : {};
    delete normalBody.refresh;
    delete normalBody.force;

    const normalKeyPayload = {
      path: req.originalUrl.replace(/([?&])(force|refresh)=[^&]*&?/g, (m, p1, p2) => p1 === '?' ? '?' : '').replace(/[?&]$/, ''),
      body: normalBody
    };

    let normalKey = `${req.method}_${JSON.stringify(normalKeyPayload)}`;
    if (isPrivate) {
      normalKey += `_${token}`;
    }

    const keyPayload = {
      path: req.originalUrl.replace(/([?&])(force|refresh)=[^&]*&?/g, (m, p1, p2) => p1 === '?' ? '?' : '').replace(/[?&]$/, ''),
      body: req.body
    };
    
    let key = `${req.method}_${JSON.stringify(keyPayload)}`;
    if (isPrivate) {
      key += `_${token}`;
    }

    if (forceRefresh) {
      apiCache.delete(normalKey);
      apiCache.delete(key);
    }

    const cachedData = forceRefresh ? null : apiCache.get(normalKey);
    if (cachedData) {
      res.setHeader('Cache-Control', 'no-store');
      return res.json(cachedData);
    }

    const originalJson = res.json.bind(res);
    res.json = ((body: any) => {
      if (res.statusCode >= 200 && res.statusCode < 300 && (!body || body.code !== 401)) {
        apiCache.set(key, body, ttlSeconds);
        apiCache.set(normalKey, body, ttlSeconds);
        res.setHeader('Cache-Control', 'no-store');
      }
      return originalJson(body);
    });

    next();
  };
}
// ----------------------------------------

const app = express();
const isAIStudio = !!process.env.APPLET_ID;
const PORT = isAIStudio ? 3000 : (Number(process.env.SERVER_PORT) || 3000);

const SERVER_BOOT_ID = Date.now().toString();

app.use(cors());
app.use((req, res, next) => {
  res.setHeader('x-server-boot-id', SERVER_BOOT_ID);
  res.setHeader('Access-Control-Expose-Headers', 'x-server-boot-id');
  next();
});
app.use(express.json({ limit: '50mb' })); app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (res.statusCode >= 400) { // Only log errors and warnings to prevent log spam
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms - IP: ${req.ip}`);
    }
  });
  next();
});

app.use((req, res, next) => {
  const token = req.headers.authorization;
  if (token && invalidatedTokens.has(token)) {
      return res.status(401).json({ code: 401, message: 'Session logged out because a new login occurred on another device.' });
  }
  next();
});

app.use('/api-docs', async (req, res, next) => {
  try {
    const swaggerUi = (await import('swagger-ui-express')).default;
    const YAML = (await import('yamljs')).default;
    const swaggerDocument = YAML.load(path.join(process.cwd(), 'openapi.yaml'));
    const handlers = ([] as any[]).concat(swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    let i = 0;
    const executeNext = (err?: any) => {
      if (err) return next(err);
      if (i < handlers.length) {
        handlers[i++](req, res, executeNext);
      } else {
        next();
      }
    };
    executeNext();
  } catch (e) {
    console.error('Failed to serve Swagger UI', e);
    res.status(500).send('API documentation unavailable');
  }
});

const rateLimitCache = new Map<string, { count: number, resetAt: number }>();
const rateLimitMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown') as string;
  const now = Date.now();
  let entry = rateLimitCache.get(ip);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + 60000 };
  }
  entry.count++;
  rateLimitCache.set(ip, entry);
  if (entry.count > 3000) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  next();
};

app.use('/api', rateLimitMiddleware);

// Simple file-based config storage
let appConfig: Record<string, any> = {
  openlistUrl: process.env.OPENLIST_SERVER_URL || 'https://fox.oplist.org',
  basePath: '/home',
  inactivityTimeout: 0,
  announcement: ''
};


// Ensure env variables take precedence over saved config if provided
const getOpenlistUrl = () => process.env.OPENLIST_SERVER_URL || appConfig.openlistUrl;
const getOpenlistApiKey = () => process.env.OPENLIST_API_KEY;

const adminRoleCache = new Map<string, { role: number, expiry: number }>();

const authenticatedMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.headers.authorization;
  if (!token || isValidGuest(token) || token === 'null' || token === 'undefined') {
    return res.status(401).json({ error: 'Unauthorized: User access required' });
  }
  
  const masterApiKey = getOpenlistApiKey();
  if (token === masterApiKey) {
    return next();
  }

  const cached = adminRoleCache.get(token);
  if (cached && Date.now() < cached.expiry) {
    return next();
  }

  try {
    const url = `${getOpenlistUrl().replace(/\/$/, '')}/api/me`;
    let response = await axios.get(url, { headers: { Authorization: token } });
    const role = response.data?.data?.role;
    if (response.data?.code === 200 && role !== undefined) {
      adminRoleCache.set(token, { role, expiry: Date.now() + 5 * 60 * 1000 });
      return next();
    }
  } catch (err) {}

  return res.status(403).json({ error: 'Forbidden: Valid account required' });
};

const adminMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.headers.authorization;
  if (!token || isValidGuest(token) || token === 'null' || token === 'undefined') {
    return res.status(401).json({ error: 'Unauthorized: Admin access required' });
  }
  
  const masterApiKey = getOpenlistApiKey();
  if (token === masterApiKey) {
    return next();
  }

  const cached = adminRoleCache.get(token);
  if (cached && Date.now() < cached.expiry) {
    if (cached.role === 2) return next();
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  try {
    const url = `${getOpenlistUrl().replace(/\/$/, '')}/api/me`;
    let response = await axios.get(url, { headers: { Authorization: token } });
    const role = response.data?.data?.role;
    if (response.data?.code === 200 && role !== undefined) {
      adminRoleCache.set(token, { role, expiry: Date.now() + 5 * 60 * 1000 });
      if (role === 2) return next();
    }
  } catch (err) {}

  return res.status(403).json({ error: 'Forbidden: Admin access required' });
};



function parseMediaName(rawName: string) {
  const baseName = rawName.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i, "");
  let cleanName = baseName;
  cleanName = cleanName.replace(/[\(\[].*?[\)\]]/g, " ");
  
  const yearRegex = /[._\-\s](19\d{2}|20\d{2})(?=[._\-\s]|$)/g;
  let match;
  let lastMatch = null;
  while ((match = yearRegex.exec(cleanName)) !== null) {
    lastMatch = match;
  }
  let year = '';
  if (lastMatch) {
    year = lastMatch[1];
    cleanName = cleanName.substring(0, lastMatch.index);
  }
  
  cleanName = cleanName.replace(/\b(720p|1080p|1080i|2160p|4k|8k|webdl|web-dl|webrip|hdrip|bluray|x264|x265|hevc|aac|dts|hdtv|remux)\b/gi, " ");
  cleanName = cleanName.replace(/[._\-\s]+/g, " ").trim();
  
  if (!cleanName) {
      cleanName = baseName.trim();
  }
  if (!cleanName) {
      cleanName = "Unknown";
  }
  
  return { cleanName, year };
}

async function saveConfig() {
  await writeSQLiteJSON('config', appConfig);
}

// Simple JSON DB for TMDB corrections
// Advanced debouncers to prevent massive CPU spikes and event loop blocking 
// when stringifying huge JSON objects repeatedly during library syncs.
const createDebouncer = (saveFn: () => Promise<void>, waitMs = 5000) => {
  let timeout: NodeJS.Timeout | null = null;
  let promiseResolve: ((value: void) => void) | null = null;
  return () => {
    if (!promiseResolve) {
      // First call in a new batch, start tracking
      promiseResolve = () => {}; 
    }
    if (timeout) clearTimeout(timeout);
    
    timeout = setTimeout(() => {
      timeout = null;
      promiseResolve = null;
      saveFn().catch(err => console.error("Debounced save error:", err));
    }, waitMs);
    
    return Promise.resolve(); // Return immediately, it saves in the background
  };
};

let tmdbCache: Record<string, any> = {};

async function saveDbImmediate() {
  // Purge massive TMDB API data, ONLY save metadata corrections
  const overridesOnly: Record<string, any> = {};
  for (const k of Object.keys(tmdbCache)) {
    if (tmdbCache[k] && tmdbCache[k]._overridden) {
      overridesOnly[k] = tmdbCache[k];
    }
  }
  await writeSQLiteJSON('db', overridesOnly);
}

const saveDb = createDebouncer(async () => {
  await saveDbImmediate();
});

// TV Seasons persistence cache
let tmdbSeasonCache: Record<string, any> = {};
const saveSeasonCache = createDebouncer(async () => {
  // Disabled to save DB space
});

// Actor filmography persistence cache
// Actor caching removed
async function preCacheActorFilmographyMetadata(matchedList: any[], tmdbKey: string) { return; }

// Re-sync saved actor filmographies when new library items are added to the app
async function syncAllActorsWithNewLibraryItems() { return; }

function isGenericCategoryRoot(p: string): boolean {
  if (!p) return true;
  const clean = p.replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
  const genericRoots = new Set([
    'home',
    'home/movies',
    'home/series',
    'home/anime',
    'home/kdrama',
    'home/adrama',
    'home/tv',
    'home/shows',
    'home/show',
    'home/korean_drama',
    'home/asian_drama',
    'home/cartoon',
    'home/animation',
    'movies',
    'series',
    'anime',
    'kdrama',
    'adrama',
    'tv',
    'shows',
    'show'
  ]);
  if (genericRoots.has(clean)) return true;
  const parts = clean.split('/').filter(Boolean);
  if (parts.length <= 1) return true;
  if (parts.length === 2 && parts[0] === 'home' && ['movies', 'series', 'anime', 'kdrama', 'adrama', 'tv', 'shows', 'show', 'cartoon', 'animation', 'korean_drama', 'asian_drama'].includes(parts[1])) {
    return true;
  }
  return false;
}

function findOverriddenKeyInCache(cache: Record<string, any>, type: string, cleanQuery: string, year?: string | number, itemPath?: string): string | null {
  if (!cleanQuery && !itemPath && !year) return null;
  const baseQuery = (cleanQuery || '').toLowerCase().trim();
  const rawType = (type || '').toUpperCase().trim();
  const isTvType = ['SERIES', 'TV', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(rawType);
  const typesToCheck = isTvType ? [rawType, 'TV', 'SERIES', 'ANIME', 'KDRAMA', 'ADRAMA'] : [rawType, 'MOVIE'];

  // 1. Exact base matches (type + query + year)
  for (const t of typesToCheck) {
    if (!t) continue;
    const cacheKey = baseQuery ? `${t}-${baseQuery}${year ? `-${year}` : ''}` : '';
    const baseKey = baseQuery ? `${t}-${baseQuery}` : '';
    if (cacheKey && cache[cacheKey]?._overridden) return cacheKey;
    if (baseKey && cache[baseKey]?._overridden) return baseKey;
  }

  // 2. Hierarchical Path Matching (if overridden by path)
  if (itemPath && !isGenericCategoryRoot(itemPath)) {
    const cleanP = itemPath.replace(/^\/+/, '');
    const parts = cleanP.split('/');
    // Check from full path down to item directory (never generic category roots)
    for (let i = parts.length; i > 0; i--) {
      const subPath = parts.slice(0, i).join('/');
      if (isGenericCategoryRoot(subPath)) continue;
      const p1 = `path-${subPath}`;
      const p2 = `path-/${subPath}`;
      if (cache[p1]?._overridden) return p1;
      if (cache[p2]?._overridden) return p2;
    }
  }

  // 3. Fallback: Search existing cache for baseKey prefix (only if we have a solid baseQuery)
  if (baseQuery && baseQuery.length > 2) {
    const found = Object.keys(cache).find(k => {
      const item = cache[k];
      if (!item?._overridden) return false;
      
      for (const t of typesToCheck) {
        if (!t) continue;
        const baseKey = `${t}-${baseQuery}`;
        if (k === baseKey) return true;
        
        // If year is not provided, allow falling back to a year-specific override
        if (!year && k.startsWith(`${baseKey}-`)) return true;
      }
      return false;
    });
    if (found) return found;
  }

  return null;
}


// Library Index Cache for fast genre searching
let libraryIndex: any[] = [];
let libraryIndexLastUpdated = 0;


async function saveLibraryIndex() {
  // disabled library_index DB save


}
let isFetchingLibrary = false;
let libraryFetchPromise = null;

async function getLibraryIndex(token: string, forceRefresh = false) {
   if (!forceRefresh && libraryIndex.length > 0 && (Date.now() - libraryIndexLastUpdated < 15 * 60 * 1000)) {
       return libraryIndex;
   }
   if (libraryFetchPromise && !forceRefresh) {
       return libraryFetchPromise;
   }

   libraryFetchPromise = (async () => {
       try {
            const openlistUrl = getOpenlistUrl().replace(/\/$/, '');
            const res = await axios.post(`${openlistUrl}/api/fs/list`, { path: appConfig.basePath, password: "", page: 1, per_page: 0 }, { headers: { Authorization: token } });
            if (res.data.code !== 200) return libraryIndex;
            const dirs = (res.data.data?.content || []).filter((c: any) => c.is_dir).map((c: any) => c.name);
            
            const catData = await Promise.all(dirs.map(async (dir: string) => {
                try {
                    const subRes = await axios.post(`${openlistUrl}/api/fs/list`, { path: `${appConfig.basePath}/${dir}`, password: "", page: 1, per_page: 0 }, { headers: { Authorization: token } });
                    return {
                        name: dir,
                        items: subRes.data?.data?.content || []
                    };
                } catch (e) {
                    return { name: dir, items: [] };
                }
            }));
            
            let allItems: any[] = [];
            for (const c of catData) {
                for (const item of c.items) {
                    const { cleanName, year } = parseMediaName(item.name);
                    const openlistPath = item.path || `${appConfig.basePath}/${c.name}/${item.name}`;
                    allItems.push({ ...item, category: c.name, cleanName, year, openlist_path: openlistPath });
                }
            }
            
            if (allItems.length > 0) {
                libraryIndex = allItems;
                libraryIndexLastUpdated = Date.now();
                saveLibraryIndex();
                syncAllActorsWithNewLibraryItems().catch(err => console.error('Error syncing actors on library update:', err));
            }
       } catch(e) {
           console.error("Failed to refresh library index", e);
       } finally {
           libraryFetchPromise = null;
       }
       return libraryIndex;
   })();
   return libraryFetchPromise;
}


// Recommendations storage

async function loadUserRecommendations(user: string) {
  const userKey = (user || 'guest').toLowerCase().trim();
  return (await readSQLiteJSON(`recommendations_${userKey}`)) || [];
}

async function saveUserRecommendations(user: string, list: any[]) {
  const userKey = (user || 'guest').toLowerCase().trim();
  await writeSQLiteJSON(`recommendations_${userKey}`, list);
}

// Watchlists storage
async function loadUserWatchlist(user: string) {
  const userKey = (user || 'guest').toLowerCase().trim();
  const dbData = await readSQLiteJSON(`watchlist_${userKey}`);
  if (dbData && Array.isArray(dbData)) return dbData;

  const filePaths = [
    path.join(process.cwd(), 'data', 'watchlists', `${userKey}.json`),
    path.join(process.cwd(), 'watchlists', `${userKey}.json`)
  ];
  for (const fp of filePaths) {
    if (fs.existsSync(fp)) {
      try {
        const raw = fs.readFileSync(fp, 'utf8').trim();
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            await writeSQLiteJSON(`watchlist_${userKey}`, list);
            return list;
          }
        }
      } catch(e) {}
    }
  }

  return [];
}

async function saveUserWatchlist(user: string, list: any[]) {
  const userKey = (user || 'guest').toLowerCase().trim();
  await writeSQLiteJSON(`watchlist_${userKey}`, list);

  try {
    const dataDir = path.join(process.cwd(), 'data', 'watchlists');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, `${userKey}.json`), JSON.stringify(list, null, 2), 'utf8');

    const legacyDir = path.join(process.cwd(), 'watchlists');
    if (!fs.existsSync(legacyDir)) fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, `${userKey}.json`), JSON.stringify(list, null, 2), 'utf8');
  } catch(e) {}
}

// Watched storage
async function loadUserWatched(user: string) {
  const userKey = (user || 'guest').toLowerCase().trim();
  const dbData = await readSQLiteJSON(`watched_${userKey}`);
  if (dbData && Array.isArray(dbData)) return dbData;

  const filePaths = [
    path.join(process.cwd(), 'data', 'watched', `${userKey}.json`),
    path.join(process.cwd(), 'watched', `${userKey}.json`)
  ];
  for (const fp of filePaths) {
    if (fs.existsSync(fp)) {
      try {
        const raw = fs.readFileSync(fp, 'utf8').trim();
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            await writeSQLiteJSON(`watched_${userKey}`, list);
            return list;
          }
        }
      } catch(e) {}
    }
  }

  return [];
}

async function saveUserWatched(user: string, list: any[]) {
  const userKey = (user || 'guest').toLowerCase().trim();
  await writeSQLiteJSON(`watched_${userKey}`, list);

  try {
    const dataDir = path.join(process.cwd(), 'data', 'watched');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, `${userKey}.json`), JSON.stringify(list, null, 2), 'utf8');

    const legacyDir = path.join(process.cwd(), 'watched');
    if (!fs.existsSync(legacyDir)) fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, `${userKey}.json`), JSON.stringify(list, null, 2), 'utf8');
  } catch(e) {}
}

// Downloads Tracking Storage
let downloadTracker: Record<string, {
  title: string;
  category?: string;
  count: number;
  lastDownloaded: number;
  lastUser?: string;
}> = {};

app.post('/api/downloads/track', async (req, res) => {
  try {
    const userHeader = req.headers['x-user'];
    const username = Array.isArray(userHeader) 
      ? userHeader[0] 
      : (typeof userHeader === 'string' && userHeader ? userHeader : 'Guest');

    let { title, category, isShow, fileName, count } = req.body;
    const addCount = typeof count === 'number' && count > 0 ? count : 1;

    let rawTitle = (title || fileName || '').trim();
    if (!rawTitle) {
      return res.status(400).json({ error: 'Title or fileName required' });
    }

    const catUpper = (category || '').toUpperCase();
    const isShowCategory = isShow || ['SERIES', 'TV', 'ANIME', 'KDRAMA', 'ADRAMA', 'SHOWS'].some(c => catUpper.includes(c));

    let cleanTitle = rawTitle;

    if (isShowCategory) {
      // Remove episode numbers / seasons / extensions to keep ONLY the Show Title
      cleanTitle = cleanTitle
        .replace(/\b(s\d+e\d+|s\d+|\d+x\d+|season\s*\d+|episode\s*\d+|ep\s*\d+).*/i, '')
        .replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i, '')
        .replace(/[._-]/g, ' ')
        .trim();
    } else {
      cleanTitle = cleanTitle
        .replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i, '')
        .replace(/[._-]/g, ' ')
        .trim();
    }

    if (!cleanTitle) {
      cleanTitle = rawTitle;
    }

    const key = cleanTitle.toLowerCase();

    if (!downloadTracker[key]) {
      downloadTracker[key] = {
        title: cleanTitle,
        category: category || (isShowCategory ? 'SHOW' : 'MOVIE'),
        count: addCount,
        lastDownloaded: Date.now(),
        lastUser: username
      };
    } else {
      downloadTracker[key].count += addCount;
      downloadTracker[key].lastDownloaded = Date.now();
      downloadTracker[key].lastUser = username;
      if (cleanTitle.length > 0 && cleanTitle.toLowerCase() === key && downloadTracker[key].title !== cleanTitle) {
        downloadTracker[key].title = cleanTitle;
      }
    }

    // disabled download tracker DB save

    res.json({ success: true, item: downloadTracker[key] });
  } catch (err: any) {
    console.error('Error tracking download:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/api/subtitles', async (req, res) => {
  try {
    const { tmdb_id, type, season, episode, language = 'en' } = req.query;
    if (!tmdb_id) return res.status(400).json({ error: 'tmdb_id is required' });

    // Check local cache first
    const subsDir = path.join(process.cwd(), 'data', 'subtitles');
    if (!fs.existsSync(subsDir)) {
      fs.mkdirSync(subsDir, { recursive: true });
    }
    const cacheKey = `${tmdb_id}_${type}_${season || 0}_${episode || 0}_${language}.vtt`;
    const cachePath = path.join(subsDir, cacheKey);

    if (fs.existsSync(cachePath)) {
      let cachedSub = fs.readFileSync(cachePath, 'utf8');
      
      // Clean up common ASS/SSA artifacts just in case they were cached
      cachedSub = cachedSub.replace(/\\h/g, ' ');
      cachedSub = cachedSub.replace(/\{[^}]+\}/g, '');

      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      return res.send(cachedSub);
    }

    const apiKey = process.env.OPENSUBTITLES_API_KEY;
    if (!apiKey) {
       res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
       return res.send('WEBVTT\n\nNOTE\nNo API key configured');
    }

    // OpenSubtitles API v1 Search
    let searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?tmdb_id=${tmdb_id}&languages=${language}`;
    if (type === 'episode' || type === 'tv') {
      if (season) searchUrl += `&season_number=${season}`;
      if (episode) searchUrl += `&episode_number=${episode}`;
    }

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      }
    });

    if (!searchResponse.ok) {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      return res.send('WEBVTT\n\nNOTE\nFailed to search subtitles');
    }

    const searchData = await searchResponse.json();
    if (!searchData.data || searchData.data.length === 0) {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      return res.send('WEBVTT\n\nNOTE\nNo subtitles found');
    }

    const fileId = searchData.data[0].attributes.files[0].file_id;

    const downloadResponse = await fetch('https://api.opensubtitles.com/api/v1/download', {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ file_id: fileId })
    });

    if (!downloadResponse.ok) {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      return res.send('WEBVTT\n\nNOTE\nFailed to get download link');
    }

    const downloadData = await downloadResponse.json();
    
    if (downloadData.link) {
      const subRes = await fetch(downloadData.link);
      let subText = await subRes.text();
      
      // Auto-convert SRT to VTT if necessary
      if (!subText.trim().startsWith('WEBVTT')) {
        subText = 'WEBVTT\n\n' + subText.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      }

      // Clean up common ASS/SSA artifacts often found in OpenSubtitles
      subText = subText.replace(/\\h/g, ' ');
      subText = subText.replace(/\{[^}]+\}/g, '');

      // Save to cache
      fs.writeFileSync(cachePath, subText, 'utf8');

      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      return res.send(subText);
    } else {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      return res.send('WEBVTT\n\nNOTE\nNo download link found');
    }
  } catch (error) {
    console.error('Subtitle API error:', error);
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    return res.send('WEBVTT\n\nNOTE\nInternal error');
  }
});

app.get('/api/image-proxy', async (req, res) => {
  try {
    const imageUrl = req.query.url as string;
    if (!imageUrl) {
      return res.status(400).json({ error: 'URL is required' });
    }

    let response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'arraybuffer'
    });

    const contentType = response.headers['content-type'] as string || 'image/jpeg';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(response.data);
  } catch (err: any) {
    console.error('[Image Proxy] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch image' });
  }
});

app.get('/api/downloads/top', async (req, res) => {
  try {
    const list = Object.values(downloadTracker || {});
    list.sort((a, b) => b.count - a.count || b.lastDownloaded - a.lastDownloaded);
    const top15 = list.slice(0, 15);
    res.json({ topDownloads: top15, totalTracked: list.length });
  } catch (err: any) {
    console.error('Error getting top downloads:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/downloads/clear', adminMiddleware, async (req, res) => {
  try {
    downloadTracker = {};
    // disabled download tracker DB save
    res.json({ success: true, message: 'Download tracking history cleared' });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/watchlist', async (req, res) => {
  try {
    const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    res.json(await loadUserWatchlist(user));
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/watchlist/toggle', async (req, res) => {
  try {
    const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    
    const { item, category, parentPath } = req.body;
    const list = await loadUserWatchlist(user);
    
    const existingIndex = list.findIndex(i => i.item?.name === item?.name && i.parentPath === parentPath);
    
    if (existingIndex >= 0) {
      list.splice(existingIndex, 1);
    } else {
      list.push({ item, category, parentPath });
    }
    
    await saveUserWatchlist(user, list);
    res.json({ success: true, watchlist: list, added: existingIndex < 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update watchlist' });
  }
});

app.get('/api/watchlist/check', async (req, res) => {
  try {
    const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
    const { name, parentPath, path: queryPath } = req.query as any;
    if (!user) return res.json({ inWatchlist: false });
    const list = await loadUserWatchlist(user);

    if (queryPath) {
      const cleanTarget = String(queryPath).replace(/^\/+/, '');
      const exists = list.some(i => {
        const itemFullPath = (i.parentPath ? `${i.parentPath}/${i.item?.name}` : i.item?.name || '').replace(/^\/+/, '');
        const cleanParent = (i.parentPath || '').replace(/^\/+/, '');
        return itemFullPath === cleanTarget || cleanParent === cleanTarget || (i.item?.name && i.item.name === cleanTarget);
      });
      return res.json({ inWatchlist: exists });
    }

    if (!name || !parentPath) return res.json({ inWatchlist: false });
    const exists = list.some(i => i.item?.name === name && i.parentPath === parentPath);
    res.json({ inWatchlist: exists });
  } catch (err) {
    res.json({ inWatchlist: false });
  }
});

app.get('/api/watched', async (req, res) => {
  try {
    const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    res.json(await loadUserWatched(user));
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/watched/toggle', async (req, res) => {
  const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  
  const { name, parentPath } = req.body;
  if (!name || !parentPath) return res.status(400).json({ error: 'Missing name or parentPath' });

  const list = await loadUserWatched(user);
  
  const existingIndex = list.findIndex(i => i.name === name && i.parentPath === parentPath);
  
  if (existingIndex >= 0) {
    list.splice(existingIndex, 1);
  } else {
    list.push({ name, parentPath, timestamp: Date.now() });
  }
  
  await saveUserWatched(user, list);
  res.json({ success: true, watched: list, added: existingIndex < 0 });
});

app.post('/api/watched/bulk-toggle', async (req, res) => {
  const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  
  const { items } = req.body; // Array of { name, parentPath }
  if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'Missing items array' });

  const list = await loadUserWatched(user);
  
  let changed = false;
  for (const item of items) {
    const existingIndex = list.findIndex(i => i.name === item.name && i.parentPath === item.parentPath);
    if (item.watched && existingIndex < 0) {
      list.push({ name: item.name, parentPath: item.parentPath, timestamp: Date.now() });
      changed = true;
    } else if (!item.watched && existingIndex >= 0) {
      list.splice(existingIndex, 1);
      changed = true;
    }
  }
  
  if (changed) {
    await saveUserWatched(user, list);
  }
  res.json({ success: true, watched: list });
});

app.get('/api/recommendations', async (req, res) => {
  try {
    const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    
    const refresh = req.query.refresh === 'true';
    const existingRecs = await loadUserRecommendations(user);
    
    if (!refresh && existingRecs && existingRecs.length > 0) {
        return res.json({ results: existingRecs });
    }
    
    const watchlist = await loadUserWatchlist(user);
    if (watchlist.length < 5) {
        return res.json({ results: [], message: 'ADD_MORE', count: watchlist.length });
    }
    
    const allRecs = [];
    for (const w of watchlist) {
        let tmdbId = w.tmdbData?.id;
        let type = w.category === 'SERIES' || w.category === 'ANIME' || w.category === 'KDRAMA' || w.category === 'ADRAMA' ? 'tv' : 'movie';
        if (!tmdbId && w.item?.name) {
            const { cleanName, year } = parseMediaName(w.item.name);
            const cacheKey = `${w.category}-${cleanName.toLowerCase()}${year ? `-${year}` : ''}`;
            const baseKey = `${w.category}-${cleanName.toLowerCase()}`;
            let cached = tmdbCache[cacheKey] || tmdbCache[baseKey];
            if (!cached) {
                 const overriddenKey = findOverriddenKeyInCache(tmdbCache, w.category, cleanName, year);
                 if (overriddenKey) cached = tmdbCache[overriddenKey];
            }
            if (cached && cached.id) {
                tmdbId = cached.id;
            }
        }
        if (!tmdbId) continue;
        try {
            const recsUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}/recommendations?api_key=${process.env.TMDB_API_KEY}`;
            const res = await axios.get(recsUrl);
            if (res.data && res.data.results) {
                allRecs.push(...res.data.results.slice(0, 5));
            }
        } catch (e: any) {
            console.error("Failed to get recs for", w.tmdbData?.id, e.message);
        }
    }
    
    const uniqueRecs = Array.from(new Map(allRecs.map(r => [r.id, r])).values());
    uniqueRecs.sort(() => Math.random() - 0.5);
    
    const openlistUrlTarget = getOpenlistUrl().replace(/\/$/, '');
    const adminToken = getOpenlistApiKey();
    const localItems = getLocalItems();
    
    const searchPromises = uniqueRecs.map(async (rec) => {
        let foundPath = null;
        let foundName = null;
        let foundCat = null;
        let foundIsDir = true;
        let hasLocal = false;
        
        const recTitle = rec.title || rec.name || rec.original_name || '';
        const title = (rec.title || rec.name || '').toLowerCase();
        const origTitle = (rec.original_title || rec.original_name || '').toLowerCase();
        const releaseDate = rec.release_date || rec.first_air_date || '';
        const tmdbYear = releaseDate ? releaseDate.substring(0, 4) : '';

        const existingLocalItem = localItems.find(i => {
            if (i._jf && String(i._jf.tmdbId) === String(rec.id)) return true;
            let searchName = i._jf_name || i.name;
            if (/^(s\d+|season\s*\d+)$/i.test(i.name)) {
                const parentParts = (i.parent || i._parent || "").split('/').filter(Boolean);
                if (parentParts.length > 0) searchName = parentParts[parentParts.length - 1];
            }
            
            const { cleanName, year: myYear } = parseMediaName(searchName);
            const myTitle = cleanName.toLowerCase();
            
            if (!title && !origTitle) return false;
            
            if (myTitle === title || myTitle === origTitle || myTitle.includes(title) || title.includes(myTitle)) {
               const finalYear = (i._jf && i._jf.year) ? String(i._jf.year) : myYear;
               if (tmdbYear && finalYear && tmdbYear !== finalYear) {
                   return false;
               }
               return true;
            }
            return false;
        });
        
        if (existingLocalItem) {
            foundName = existingLocalItem.name;
            foundPath = existingLocalItem.parent || existingLocalItem._parent;
            foundCat = existingLocalItem._cat || (rec.media_type === 'tv' ? 'SERIES' : 'MOVIES');
            foundIsDir = existingLocalItem.is_dir;
            hasLocal = true;
        } else if (adminToken) {
            try {
                const res = await axios.post(`${openlistUrlTarget}/api/fs/search`, {
                    parent: appConfig.basePath,
                    keywords: recTitle,
                    scope: 1, 
                    page: 1,
                    per_page: 5,
                    password: ""
                }, { headers: { Authorization: adminToken } });
                
                if (res.data?.data?.content?.length > 0) {
                    for (const item of res.data.data.content) {
                        const { cleanName: myTitleRaw, year: myYear } = parseMediaName(item.name);
                        const myTitle = myTitleRaw.toLowerCase();
                        
                        if (myTitle === title || myTitle === origTitle || myTitle.includes(title) || title.includes(myTitle)) {
                            if (tmdbYear && myYear && tmdbYear !== myYear) {
                                continue;
                            }
                            foundName = item.name;
                            foundPath = item.parent;
                            foundIsDir = item.is_dir;
                            foundCat = rec.media_type === 'tv' ? 'SERIES' : 'MOVIES';
                            if (foundPath.toUpperCase().includes('ANIME')) foundCat = 'ANIME';
                            else if (foundPath.toUpperCase().includes('KDRAMA')) foundCat = 'KDRAMA';
                            else if (foundPath.toUpperCase().includes('ADRAMA')) foundCat = 'ADRAMA';
                            
                            hasLocal = true;
                            break;
                        }
                    }
                }
            } catch(e) {}
        }
        
        return { rec, foundName, foundPath, foundCat, foundIsDir, hasLocal };
    });
    
    const searchResults = await Promise.all(searchPromises);
    
    const formattedRecs = searchResults.filter(result => result.hasLocal).map(result => {
        const { rec, foundName, foundPath, foundCat, foundIsDir, hasLocal } = result;
        
        let name = foundName || rec.title || rec.name || rec.original_name || 'Unknown';
        let parentPath = foundPath || `${appConfig.basePath === '/' ? '' : appConfig.basePath}/${rec.media_type === 'tv' ? 'SERIES' : 'MOVIES'}`;
        let category = foundCat || (rec.media_type === 'tv' ? 'SERIES' : 'MOVIES');
        let is_dir = hasLocal ? foundIsDir : true;
        
        return {
            item: { name, is_dir, _rec: !hasLocal },
            category,
            parentPath,
            tmdbData: rec
        };
    });
    
    await saveUserRecommendations(user, formattedRecs);
    
    res.json({ results: formattedRecs });
  } catch (err: any) {
    console.error('[API Recommendations Error]', err.message);
    res.json({ results: [] });
  }
});

// API: Config
app.get('/api/config', (req, res) => {
  res.json({
    openlistUrl: getOpenlistUrl(),
    basePath: appConfig.basePath,
    inactivityTimeout: appConfig.inactivityTimeout || 0,
    announcement: appConfig.announcement || '',
    unreleasedTmdbIds: appConfig.unreleasedTmdbIds || [],
    digitalReleasePaths: appConfig.digitalReleasePaths || {}
  });
});
app.post('/api/meta/unrelease', adminMiddleware, (req, res) => {
  const { tmdbId, unrelease } = req.body;
  if (!appConfig.unreleasedTmdbIds) appConfig.unreleasedTmdbIds = [];
  if (unrelease) {
    if (!appConfig.unreleasedTmdbIds.includes(Number(tmdbId))) {
      appConfig.unreleasedTmdbIds.push(Number(tmdbId));
    }
  } else {
    appConfig.unreleasedTmdbIds = appConfig.unreleasedTmdbIds.filter((id: any) => Number(id) !== Number(tmdbId));
  }
  saveConfig();
  res.json({ success: true, unreleasedTmdbIds: appConfig.unreleasedTmdbIds });
});
app.post('/api/meta/digital-path', adminMiddleware, (req, res) => {
  const { tmdbId, path: manualPath } = req.body;
  if (!appConfig.digitalReleasePaths) appConfig.digitalReleasePaths = {};
  if (manualPath) {
    appConfig.digitalReleasePaths[Number(tmdbId)] = manualPath;
  } else {
    delete appConfig.digitalReleasePaths[Number(tmdbId)];
  }
  bumpMetaVersion(); saveConfig();
  res.json({ success: true, digitalReleasePaths: appConfig.digitalReleasePaths });
});
app.post('/api/config', adminMiddleware, (req, res) => {
  if (req.body.openlistUrl !== undefined) appConfig.openlistUrl = req.body.openlistUrl;
  if (req.body.basePath !== undefined) appConfig.basePath = req.body.basePath;
  if (req.body.inactivityTimeout !== undefined) appConfig.inactivityTimeout = Number(req.body.inactivityTimeout) || 0;
  if (req.body.announcement !== undefined) appConfig.announcement = String(req.body.announcement);
  saveConfig();
  addLog('Config Updated', 'Admin', 'Updated application configuration settings.');
  res.json({ success: true, config: appConfig });
});


// --- User Expirations ---
let userExpirations: Record<string, string> = {};

async function checkAndEnforceExpirations() {
  try {
    const adminToken = getOpenlistApiKey();
    if (!adminToken) return;

    const targetUrl = `${getOpenlistUrl().replace(/\/$/, '')}/api/admin/user/list`;
    const listRes = await axios.get(targetUrl, { headers: { Authorization: adminToken } });
    const users = listRes.data?.data?.content || [];
    
    const now = Date.now();
    let updated = false;

    for (const user of users) {
      const expDateStr = userExpirations[user.id] || userExpirations[String(user.id)];
      if (expDateStr) {
        const expTime = new Date(expDateStr).getTime();
        if (!isNaN(expTime) && expTime <= now) {
          if (!user.disabled) {
            console.log(`[EXPIRATION] Disabling expired user ${user.username} (ID: ${user.id}). Expired at: ${expDateStr}`);
            const updateUrl = `${getOpenlistUrl().replace(/\/$/, '')}/api/admin/user/update`;
            await axios.post(updateUrl, {
              ...user,
              disabled: true
            }, { headers: { Authorization: adminToken } });
            addLog('cron_disable', 'System/Cron', `User ${user.username} was disabled automatically (expired at ${expDateStr}).`);
          }
          delete userExpirations[user.id];
          delete userExpirations[String(user.id)];
          updated = true;
        }
      }
    }
    if (updated) {
      await writeSQLiteJSON('users_expirations', userExpirations);
    }
  } catch (e: any) {
    console.error('[EXPIRATION CHECK ERROR]:', e.message);
  }
}

app.get('/api/users/expirations', adminMiddleware, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json(userExpirations);
});

app.post('/api/users/expirations', adminMiddleware, async (req, res) => {
  const { userId, expirationDate } = req.body;
  if (userId === undefined || userId === null) return res.status(400).json({ error: 'Missing userId' });
  
  if (expirationDate) {
    const d = new Date(expirationDate);
    const storedDate = !isNaN(d.getTime()) ? d.toISOString() : expirationDate;
    userExpirations[String(userId)] = storedDate;
  } else {
    delete userExpirations[String(userId)];
    delete userExpirations[userId];
  }
  await writeSQLiteJSON('users_expirations', userExpirations);
  addLog('User Expiration Set', 'Admin', `Set expiration for user ${userId} to ${expirationDate || 'none'}`);
  
  await checkAndEnforceExpirations();
  res.json({ success: true });
});

// Expiration checking job (runs every 30 seconds to disable expired users)
setInterval(() => {
  checkAndEnforceExpirations().catch(console.error);
}, 30 * 1000);

// Jellyfin auto-fetch job (runs every 3 minutes)
setInterval(() => {
  getRecentlyAdded(getOpenlistUrl, getOpenlistApiKey, appConfig.basePath, false, jfOverrides).catch((err) => {
    console.error('[Jellyfin Auto-Fetch Interval Error]', err.message || err);
  });
}, 3 * 60 * 1000);

let isSyncingLibrary = false;
async function syncLibraryToDatabase() {
  if (isSyncingLibrary) return;
  const tmdbKey = process.env.TMDB_API_KEY;
  const openlistKey = getOpenlistApiKey();
  if (!tmdbKey || !openlistKey) return;
  
  isSyncingLibrary = true;
  try {
    const items = await getLibraryIndex(openlistKey, true);
    let newItemsAdded = false;
    
    for (const item of items) {
      if (!item.cleanName || !item.category) continue;
      
      const type = item.category;
      const baseQuery = item.cleanName.toLowerCase().trim();
      const year = item.year;
      const baseKey = `${type}-${baseQuery}`;
      const cacheKey = `${type}-${baseQuery}${year ? `-${year}` : ''}`;
      
      const overriddenKey = findOverriddenKeyInCache(tmdbCache, type, baseQuery, year);
      
      if (!overriddenKey && !tmdbCache[cacheKey] && !tmdbCache[baseKey] && tmdbCache[cacheKey] !== null) {
          let searchType = 'multi';
          const typeLower = type.toLowerCase();
          if (typeLower.includes('movie')) searchType = 'movie';
          else if (typeLower.includes('show') || typeLower.includes('series') || typeLower.includes('anime')) searchType = 'tv';
          
          let url = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(item.cleanName)}`;
          if (year && searchType === 'movie') url += `&primary_release_year=${year}`;
          else if (year && searchType === 'tv') url += `&first_air_date_year=${year}`;
          
          try {
             let response = await axios.get(url);
             if (response.data && response.data.results && response.data.results.length > 0) {
                 tmdbCache[cacheKey] = response.data.results[0];
                 newItemsAdded = true;
             } else {
                 tmdbCache[cacheKey] = null;
                 newItemsAdded = true;
             }
             await new Promise(r => setTimeout(r, 200));
          } catch (e) {
             console.error(`Error syncing ${item.cleanName} to DB`, e);
          }
      }
    }
    
    if (newItemsAdded) {
      await saveDb();
      console.log('TMDB Database sync complete, new items added.');
    }
  } catch (e) {
    console.error('Error in library sync job', e);
  } finally {
    isSyncingLibrary = false;
  }
}

// Run initial sync after 30 seconds
setTimeout(() => {
  syncLibraryToDatabase().catch(console.error);
}, 30 * 1000);

// Run sync every 15 minutes
setInterval(() => {
  syncLibraryToDatabase().catch(console.error);
}, 15 * 60 * 1000);

// ------------------------

// --- Activity Logs ---
let activityLogs: any[] = [];

async function addLog(action: string, username: string, details: string) {
  const log = { id: Date.now().toString(), timestamp: new Date().toISOString(), action, username, details };
  activityLogs.unshift(log);
  if (activityLogs.length > 500) activityLogs = activityLogs.slice(0, 500);
  await writeSQLiteJSON('activity_logs', activityLogs);
}

app.get('/api/admin/sessions', adminMiddleware, (req, res) => {
  const sessionsList = Object.values(activeUserSessions).map(s => ({
    username: s.username,
    token: s.token,
    loginTime: s.loginTime,
    ip: s.ip,
    userAgent: s.userAgent
  }));
  res.json(sessionsList);
});

app.post('/api/admin/sessions/terminate', adminMiddleware, (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }
  const session = activeUserSessions[token];
  if (session) {
    invalidateTokenStr(token);
    addLog('Admin Action', session.username, `Admin manually terminated session from IP ${session.ip}`);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

app.get('/api/admin/logs', adminMiddleware, (req, res) => {
  res.json(activityLogs);
});

app.get('/api/admin/logs/download', adminMiddleware, (req, res) => {
  if (fs.existsSync(logFile)) {
    res.download(logFile, 'app-debug.log');
  } else {
    res.status(404).json({ error: 'Log file not found' });
  }
});

app.post('/api/admin/logs/clear-debug', adminMiddleware, async (req, res) => {
  try {
    if (fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, '');
    }
    await addLog('Clear Debug Logs', 'Admin', 'Cleared app-debug.log file on disk');
    res.json({ success: true, message: 'Debug logs cleared successfully' });
  } catch (e: any) {
    console.error('Failed to clear debug logs:', e);
    res.status(500).json({ error: e.message || 'Failed to clear debug logs' });
  }
});

app.post('/api/admin/log', adminMiddleware, async (req, res) => {
  const { action, username, details } = req.body;
  addLog(action, username || 'System/Admin', details);
  res.json({ success: true });
});

app.post('/api/admin/clear-cache', adminMiddleware, (req, res) => {
  bumpMetaVersion();
  addLog('Clear All Caches', 'Admin', 'Forced global cache reset for all clients');
  res.json({ success: true, version: globalMetaVersion });
});

app.get('/api/admin/db/download', adminMiddleware, async (req, res) => {
  const dbPath = path.join(process.cwd(), 'data', 'shindex.db');
  if (fs.existsSync(dbPath)) {
    addLog('Download Database', 'Admin', 'Downloaded shindex.db backup');
    res.download(dbPath, `shindex_backup_${Date.now()}.db`);
  } else {
    res.status(404).send('Database file not found');
  }
});

app.get('/api/admin/diagnostic', adminMiddleware, async (req, res) => {
  const result: any = {
    sqliteFileAccessible: false,
    sqliteDbQueryable: false,
    dbPath: path.join(process.cwd(), 'data', 'shindex.db')
  };

  try {
    const actualPath = result.dbPath;
    result.sqliteFileAccessible = fs.existsSync(actualPath);
    if (result.sqliteFileAccessible) {
      const stats = fs.statSync(actualPath);
      result.fileStats = { size: stats.size, mtime: stats.mtime };
    }
  } catch (e: any) {
    result.sqliteFileAccessibleError = e.message;
  }

  try {
    
    const database = await getDB();
    const rs = await database.get('SELECT count(*) as count FROM kv_store');
    result.sqliteDbQueryable = true;
    result.kvStoreCount = rs.count;
  } catch (e: any) {
    result.sqliteDbQueryableError = e.message;
  }

  res.json(result);
});



// API: Openlist Proxy - Admin
app.all('/api/admin/*', adminMiddleware, async (req, res) => {
  try {
    const targetUrl = `${getOpenlistUrl().replace(/\/$/, '')}${req.originalUrl}`;
    let token = req.headers.authorization;
    const masterApiKey = getOpenlistApiKey();
    if (!token || isValidGuest(token) || token === 'null' || token === 'undefined') {
      token = masterApiKey;
    }

    let response: any;
    try {
      response = await axios({
        method: req.method as any,
        url: targetUrl,
        data: req.body,
        headers: { Authorization: token || '' }
      });
    } catch (reqErr: any) {
      if (masterApiKey && token !== masterApiKey) {
        response = await axios({
          method: req.method as any,
          url: targetUrl,
          data: req.body,
          headers: { Authorization: masterApiKey }
        });
      } else {
        throw reqErr;
      }
    }

    // If Openlist returned non-200 code inside payload (e.g. 401 or 403 "You are not an admin"), retry with master admin key
    if (response.data?.code !== 200 && masterApiKey && token !== masterApiKey) {
      const fallbackResponse = await axios({
        method: req.method as any,
        url: targetUrl,
        data: req.body,
        headers: { Authorization: masterApiKey }
      });
      if (fallbackResponse.data?.code === 200) {
        response = fallbackResponse;
      }
    }

    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && response.data?.code === 200) {
      let action = 'Admin Action';
      let details = `Endpoint: ${req.originalUrl}`;
      if (req.originalUrl.includes('/user/update')) action = 'User Updated';
      else if (req.originalUrl.includes('/user/create')) action = 'User Created';
      else if (req.originalUrl.includes('/user/delete')) action = 'User Deleted';
      
      addLog(action, 'Admin', details);
    }

    if (req.originalUrl.includes('/user/')) {
      checkAndEnforceExpirations().catch(console.error);
    }

    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }

    res.json(response.data);
  } catch (error: any) {
    if (error.response?.data) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: 'Proxy error' });
  }
});

// API: Openlist Proxy - Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    await checkAndEnforceExpirations();

    const url = `${getOpenlistUrl().replace(/\/$/, '')}/api/auth/login`;
    console.log(`[LOGIN] Attempting to login via Openlist at: ${url}`);
    let response = await axios.post(url, { username, password });
    
    if (response.data.code === 200) {
      const token = response.data.data?.token;
      const masterApiKey = getOpenlistApiKey();
      if (masterApiKey) {
        try {
          const listRes = await axios.get(`${getOpenlistUrl().replace(/\/$/, '')}/api/admin/user/list`, {
            headers: { Authorization: masterApiKey }
          });
          const userObj = listRes.data?.data?.content?.find((u: any) => u.username === username);
          if (userObj && userObj.disabled) {
            addLog('Login Failed', username, 'Login blocked: Account is disabled or subscription expired.');
            return res.json({ code: 401, message: 'Subscription Expired / Account Disabled' });
          }
        } catch (e) {}
      }

      if (token) {
        const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown') as string;
        const userAgent = req.headers['user-agent'] || 'Unknown';
        try {
          const meRes = await axios.get(`${getOpenlistUrl().replace(/\/$/, '')}/api/me`, { headers: { Authorization: token } });
          const role = meRes.data?.data?.role;
          
          if (role !== 2) {
            const oldSession = Object.values(activeUserSessions).find(s => s.username === username);
            if (oldSession && oldSession.token !== token) {
              invalidateTokenStr(oldSession.token);
              addLog('Session Terminated', username, 'Previous session was terminated because a new login occurred.');
            }
          }
          activeUserSessions[token] = { token, username, loginTime: Date.now(), ip, userAgent };
          writeSQLiteJSON('active_user_sessions', activeUserSessions).catch(()=>{});
        } catch(e) {
          const oldSession = Object.values(activeUserSessions).find(s => s.username === username);
          if (oldSession && oldSession.token !== token) {
            invalidateTokenStr(oldSession.token);
          }
          activeUserSessions[token] = { token, username, loginTime: Date.now(), ip, userAgent };
          writeSQLiteJSON('active_user_sessions', activeUserSessions).catch(()=>{});
        }
      }

      addLog('Login Success', username, 'User logged in successfully.');
    } else {
      addLog('Login Failed', username, `Login failed: ${response.data.message || 'Invalid credentials'}`);
    }
    
    res.json(response.data);
  } catch (error: any) {
    const targetUrl = `${getOpenlistUrl().replace(/\/$/, '')}/api/auth/login`;
    console.error(`[LOGIN ERROR] Target URL: ${targetUrl} | Status: ${error.response?.status} | Message: ${error.message}`);
    
    addLog('Login Failed', username, `Error: ${error.message}`);
    
    // Pass through the original error response from Openlist if available
    if (error.response?.data) {
      return res.status(error.response.status).json(error.response.data);
    }
    
    res.status(error.response?.status || 500).json({ 
      message: `Error ${error.response?.status || 500}: Failed to reach Openlist at ${targetUrl}. Check your OPENLIST_SERVER_URL environment variable.`,
      details: error.message
    });
  }
});

const guestLoginCache = new Map<string, number>();
const guestSessions = new Map<string, { expiresAt: number, ip: string }>();

function isValidGuest(token: string) {
  if (!token || !token.startsWith('guest_')) return false;
  const session = guestSessions.get(token);
  if (session && session.expiresAt > Date.now()) {
    return true;
  }
  guestSessions.delete(token);
  return false;
}

app.post('/api/auth/guest_login', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown') as string;
  const lastLogin = guestLoginCache.get(ip);
  if (lastLogin) {
    const timePassed = Date.now() - lastLogin;
    const hoursPassed = timePassed / (1000 * 60 * 60);
    if (hoursPassed < 24) {
      const hoursLeft = Math.ceil(24 - hoursPassed);
      return res.status(429).json({ error: `Guest access is limited to once per 24 hours per IP. Please try again in ${hoursLeft} hours.` });
    }
  }

  try {
    const testRes = await axios.post(`${getOpenlistUrl().replace(/\/$/, '')}/api/fs/list`, 
      { path: '/', password: '', page: 1, per_page: 0 },
      { headers: { Authorization: getOpenlistApiKey() || '' } }
    );
    
    if (testRes.data.code === 200) {
      guestLoginCache.set(ip, Date.now());
      const guestToken = `guest_${crypto.randomBytes(16).toString('hex')}`;
      guestSessions.set(guestToken, { expiresAt: Date.now() + 24 * 60 * 60 * 1000, ip });
      return res.json({ success: true, token: guestToken });
    } else {
      return res.status(500).json({ error: 'Guest access is currently unavailable.' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Guest access is currently unavailable.' });
  }
});

// API: Openlist Proxy - Check Auth
app.get('/api/auth/me', async (req, res) => {
  try {
    let token = req.headers.authorization;
    if (isValidGuest(token || '')) {
       return res.json({
           code: 200,
           message: 'success',
           data: {
               id: 0,
               username: 'guest',
               role: 0,
               base_path: appConfig.basePath,
               permission: 0
           }
       });
    }
    const url = `${getOpenlistUrl().replace(/\/$/, '')}/api/me`;
    let response = await axios.get(url, {
      headers: { Authorization: token }
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Failed to verify auth' });
  }
});



// API: Save Details to SQLite Cache
app.post('/api/details/save', async (req, res) => {
  try {
    const { fullPath, tmdbData, baseItems, seasonItems } = req.body;
    if (!fullPath) return res.status(400).json({ error: 'Missing fullPath' });
    const cacheKey = `details_${fullPath}`;
    await writeSQLiteJSON(cacheKey, { tmdbData, baseItems, seasonItems });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save cache' });
  }
});

// API: Unified Details Preload with Local SQLite Cache (Deprecated)
app.post('/api/details/preload', async (req, res) => {
  try {
    // We no longer use details_cache to save disk space and reduce DB load
    res.json({ source: 'network', data: null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to preload details' });
  }
});

// API: Openlist Proxy - FS List
app.post('/api/fs/list', cacheMiddleware(30, true), async (req, res) => {
  try {
    let token = req.headers.authorization;
    const isGuest = isValidGuest(token || '');
    if (isGuest) token = getOpenlistApiKey();
    let { reqPath, refresh } = req.body;
    reqPath = reqPath || appConfig.basePath;
    if (!reqPath.startsWith('/')) reqPath = '/' + reqPath;
    
    const normalizedPath = path.posix.normalize(reqPath);
    const basePathNorm = path.posix.normalize(appConfig.basePath);
    if (isGuest && !normalizedPath.startsWith(basePathNorm)) {
       return res.status(403).json({ error: 'Forbidden' });
    }
    
    const url = `${getOpenlistUrl().replace(/\/$/, '')}/api/fs/list`;
    const payload: any = { path: reqPath, password: "", page: 1, per_page: 0 };
    if (refresh) payload.refresh = true;
    
    const cacheKey = `fs_list_shared_${normalizedPath}`;
    
    if (refresh) {
        apiCache.delete(cacheKey);
    } else {
        const cached = apiCache.get(cacheKey);
        if (cached) {
            const content = cached.data?.content;
            if (content && Array.isArray(content) && content.length > 0) {
                res.json(cached);
                
                // Background refresh (stale-while-revalidate) with Openlist refresh
                axios.post(url, { ...payload, refresh: true }, { headers: { Authorization: token } }).then(response => {
                    if (response.data?.code === 200 && response.data?.data) {
                        apiCache.set(cacheKey, response.data, 60);
                    }
                }).catch(() => {});
                return;
            }
        }
    }

    let response = await axios.post(url, payload, {
      headers: { Authorization: token }
    });

    if (response.data?.code === 200) {
        apiCache.set(cacheKey, response.data, 60); // 60 seconds short-lived memory cache
    }

    res.json(response.data);
  } catch (error: any) {

    if (error.response) {
  
  
    }
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Failed to list files' });
  }
});

// API: Openlist Proxy - FS Get (for signed URLs)
app.post('/api/fs/get', cacheMiddleware(600, true), async (req, res) => {
  try {
    let token = req.headers.authorization;
    const isGuest = isValidGuest(token || '');
    if (isGuest) token = getOpenlistApiKey();
    let { reqPath } = req.body;
    if (!reqPath) return res.status(400).json({ error: 'Path required' });
    if (!reqPath.startsWith('/')) reqPath = '/' + reqPath;

    const normalizedPath = path.posix.normalize(reqPath);
    const basePathNorm = path.posix.normalize(appConfig.basePath);
    if (isGuest && !normalizedPath.startsWith(basePathNorm)) {
       return res.status(403).json({ error: 'Forbidden' });
    }

    const url = `${getOpenlistUrl().replace(/\/$/, '')}/api/fs/get`;
    
    const cacheKey = `fs_get_${token}_${normalizedPath}`;
    
    let cached = apiCache.get(cacheKey);
    if (!cached) {
        const sqliteCached = await readSQLiteJSON(cacheKey);
        if (sqliteCached) {
            cached = sqliteCached;
            apiCache.set(cacheKey, sqliteCached, 7200);
        }
    }
    
    if (cached) {
        res.json(cached);
        
        // Background refresh
        axios.post(url, { path: reqPath, password: "" }, { headers: { Authorization: token } }).then(response => {
            if (response.data?.code === 200) {
                apiCache.set(cacheKey, response.data, 7200);
                // writeSQLiteJSON disabled
            }
        }).catch(() => {});
        return;
    }

    let response = await axios.post(url, { path: reqPath, password: "" }, {
      headers: { Authorization: token }
    });
    
    if (response.data?.code === 200) {
        apiCache.set(cacheKey, response.data, 7200);
        // writeSQLiteJSON disabled
    }

    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Failed to get file info' });
  }
});

// API: Openlist Proxy - FS Remove
app.post('/api/fs/remove', async (req, res) => {
  try {
    let token = req.headers.authorization;
    const isGuest = isValidGuest(token || '');
    if (isGuest) {
       return res.status(403).json({ error: 'Guests cannot remove files' });
    }
    const { names, dir } = req.body;
    if (!names || !dir) return res.status(400).json({ error: 'Names and dir required' });

    const url = `${getOpenlistUrl().replace(/\/$/, '')}/api/fs/remove`;
    let response = await axios.post(url, { names, dir }, {
      headers: { Authorization: token }
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Failed to remove files' });
  }
});

// API: Openlist Proxy - FS Search
app.post('/api/fs/search', cacheMiddleware(120, true), async (req, res) => {
  try {
    let token = req.headers.authorization;
    const isGuest = isValidGuest(token || '');
    if (isGuest) token = getOpenlistApiKey();
    const { keywords, parent } = req.body;

    const targetParent = parent || appConfig.basePath;
    const normalizedPath = path.posix.normalize(targetParent);
    const basePathNorm = path.posix.normalize(appConfig.basePath);
    if (isGuest && !normalizedPath.startsWith(basePathNorm)) {
       return res.status(403).json({ error: 'Forbidden' });
    }

    // Check if keywords might be a TMDB ID
    let tmdbTitleForId: string | null = null;
    const tmdbKey = process.env.TMDB_API_KEY;
    if (keywords && typeof keywords === 'string' && /^\d+$/.test(keywords.trim()) && tmdbKey) {
      try {
        let tmdbRes = await axios.get(`https://api.themoviedb.org/3/movie/${keywords.trim()}?api_key=${tmdbKey}`).catch(() => null);
        if (tmdbRes?.data?.title) {
          tmdbTitleForId = tmdbRes.data.title;
        } else {
          tmdbRes = await axios.get(`https://api.themoviedb.org/3/tv/${keywords.trim()}?api_key=${tmdbKey}`).catch(() => null);
          if (tmdbRes?.data?.name) {
            tmdbTitleForId = tmdbRes.data.name;
          }
        }
      } catch (e) {}
    }

    const url = `${getOpenlistUrl().replace(/\/$/, '')}/api/fs/search`;
    
    const reqBody1 = { 
      parent: targetParent, 
      keywords: keywords,
      scope: 0, // 0 = all, 1 = folder, 2 = file
      page: 1,
      per_page: 10000,
      password: "" 
    };
    
    const response1 = await axios.post(url, reqBody1, { headers: { Authorization: token } });
    let content = [];
    if (response1.data && response1.data.code === 200 && response1.data.data && response1.data.data.content) {
      content = response1.data.data.content;
    }
    
    let originalContentCount = content.length;

    // Fuzzy search using local libraryIndex
    if (keywords && typeof keywords === 'string' && keywords.length >= 2) {
       try {
           const libIndex = await getLibraryIndex(token).catch(() => []);
           if (libIndex && libIndex.length > 0) {
               const fuse = new Fuse(libIndex, {
                   keys: ['name', 'cleanName'],
                   threshold: 0.4,
                   distance: 100,
                   includeScore: true
               });
               const fuzzyResults = fuse.search(keywords);
               const getUniqId = (item: any) => '/' + (item.parent || '').replace(/^\/+/, '') + '/' + item.name;
               const seen = new Set(content.map(getUniqId));
               
               for (const res of fuzzyResults.slice(0, 30)) {
                   const item = res.item;
                   let itemParent = item.parent;
                   if (!itemParent && item.openlist_path) {
                       const parts = item.openlist_path.split('/');
                       parts.pop();
                       itemParent = parts.join('/');
                   } else if (!itemParent && item.category) {
                       itemParent = `${appConfig.basePath}/${item.category}`;
                   }
                   
                   const mappedItem = {
                       ...item,
                       parent: itemParent
                   };
                   const uid = getUniqId(mappedItem);
                   if (!seen.has(uid)) {
                       content.push(mappedItem);
                       seen.add(uid);
                   }
               }
           }
       } catch (e) {
           console.error("Fuzzy search error", e);
       }
    }
    
    // Handle 'and' vs '&' replacements
    let altKeywords = null;
    if (keywords && typeof keywords === 'string') {
      if (keywords.includes('&')) {
        altKeywords = keywords.replace(/&/g, 'and');
      } else if (keywords.match(/\band\b/i)) {
        altKeywords = keywords.replace(/\band\b/ig, '&');
      }
    }
    
    if (altKeywords) {
      const reqBody2 = { ...reqBody1, keywords: altKeywords };
      try {
        const response2 = await axios.post(url, reqBody2, { headers: { Authorization: token } });
        if (response2.data && response2.data.code === 200 && response2.data.data && response2.data.data.content) {
          const content2 = response2.data.data.content;
          // Merge results uniquely
          const getUniqId = (item: any) => '/' + (item.parent || '').replace(/^\/+/, '') + '/' + item.name;
          const seen = new Set(content.map(getUniqId));
          for (const item of content2) {
             const uid = getUniqId(item);
             if (!seen.has(uid)) {
                 content.push(item);
                 seen.add(uid);
             }
          }
        }
      } catch (err) {
        // silently ignore error on secondary search
      }
    }
    
    if (tmdbTitleForId) {
      const reqBody3 = { ...reqBody1, keywords: tmdbTitleForId };
      try {
        const response3 = await axios.post(url, reqBody3, { headers: { Authorization: token } });
        if (response3.data && response3.data.code === 200 && response3.data.data && response3.data.data.content) {
          const content3 = response3.data.data.content;
          const getUniqId = (item: any) => '/' + (item.parent || '').replace(/^\/+/, '') + '/' + item.name;
          const seen = new Set(content.map(getUniqId));
          for (const item of content3) {
             const uid = getUniqId(item);
             if (!seen.has(uid)) {
                 content.push(item);
                 seen.add(uid);
             }
          }
        }
      } catch (err) {}
    }
    
    // NEW LOGIC: SEARCH TMDB CACHE for titles available on the app
    try {
      const cleanStr = (s: any) => String(s || '').replace(/[^a-z0-9\s]/ig, '').replace(/\s+/g, ' ').trim().toLowerCase();
      const q = cleanStr(keywords || '');
      const qTitle = tmdbTitleForId ? cleanStr(tmdbTitleForId) : null;
      if (q.length >= 2 || qTitle) {
        const matchingKeys = Object.keys(tmdbCache).filter(key => {
          const entry = tmdbCache[key];
          if (!entry) return false;
          
          if (/^\d+$/.test(q) && String(entry.id) === q) return true;
          
          const title = cleanStr(entry.title || '');
          const name = cleanStr(entry.name || '');
          const orig = cleanStr(entry.original_name || entry.original_title || '');
          
          if (q.length >= 2 && (title.includes(q) || name.includes(q) || orig.includes(q))) return true;
          if (qTitle && (title.includes(qTitle) || name.includes(qTitle) || orig.includes(qTitle))) return true;
          
          return false;
        });

        if (matchingKeys.length > 0) {
          const extractedCleanNames = new Set<string>();
          for (const key of matchingKeys) {
            const catMatch = key.match(/^([^-]+)-/);
            if (catMatch) {
               let cleanName = key.substring(catMatch[1].length + 1);
               if (/\-\d{4}$/.test(cleanName)) {
                 cleanName = cleanName.substring(0, cleanName.length - 5);
               }
               if (cleanName.length >= 2) {
                 extractedCleanNames.add(cleanName);
               }
            }
          }

          if (keywords && typeof keywords === 'string' && keywords.length >= 3 && !/^\d+$/.test(keywords.trim()) && process.env.TMDB_API_KEY) {
             try {
                const multiRes = await axios.get(`https://api.themoviedb.org/3/search/multi?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(keywords.trim())}`);
                if (multiRes.data && multiRes.data.results) {
                   const topResults = multiRes.data.results.slice(0, 2);
                   for (const r of topResults) {
                       if (r.title && r.title.length >= 2) extractedCleanNames.add(r.title.toLowerCase());
                       if (r.name && r.name.length >= 2) extractedCleanNames.add(r.name.toLowerCase());
                       if (r.original_title && r.original_title.length >= 2) extractedCleanNames.add(r.original_title.toLowerCase());
                       if (r.original_name && r.original_name.length >= 2) extractedCleanNames.add(r.original_name.toLowerCase());
                   }
                }
             } catch(e) {}
          }

          for (const cleanName of extractedCleanNames) {
             const reqBodyClean = { ...reqBody1, keywords: cleanName };
             try {
                const responseClean = await axios.post(url, reqBodyClean, { headers: { Authorization: token } });
                if (responseClean.data && responseClean.data.code === 200 && responseClean.data.data && responseClean.data.data.content) {
                   const contentClean = responseClean.data.data.content;
                   const getUniqId = (item: any) => '/' + (item.parent || '').replace(/^\/+/, '') + '/' + item.name;
                   const seen = new Set(content.map(getUniqId));
                   for (const item of contentClean) {
                      const uid = getUniqId(item);
                      if (!seen.has(uid)) {
                          content.push(item);
                          seen.add(uid);
                      }
                   }
                }
             } catch (err) {}
          }
        }
      }
    } catch (e) {
       console.error("TMDB Cache search error", e);
    }

    // Clean parent paths to ensure strict standardization across sources
    content.forEach((item: any) => {
       if (item.parent) {
          // Normalize leading slashes
          item.parent = '/' + item.parent.replace(/^\/+/, '');
       }
    });

    // Final dedup to be absolutely sure no duplicates sneak in due to casing or slash differences
    const finalSeen = new Set();
    const dedupedContent = [];
    for (const item of content) {
       const uid = (item.parent + '/' + item.name).toLowerCase();
       if (!finalSeen.has(uid)) {
          finalSeen.add(uid);
          dedupedContent.push(item);
       }
    }
    content = dedupedContent;

    // Filter results to avoid nuisance
    const isVideo = (name: any) => /\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i.test(String(name));
    const filteredContent = content.filter((item: any) => {
      if (item.is_dir) return true; // Keep all folders
      if (!isVideo(item.name)) return false; // Ignore non-video files
      
      const parentParts = (item.parent || '').split('/').filter(Boolean);
      
      if (parentParts.length >= 2 && parentParts[0].toLowerCase() === 'home') {
          const cat = parentParts[1].toUpperCase();
          if (['KDRAMA', 'ANIME', 'SERIES'].includes(cat)) {
              return false; // No files for series/shows
          }
      }
      
      if (parentParts.length > 2) return false;
      
      return true;
    });
    
    if (response1.data && response1.data.data) {
      response1.data.data.content = filteredContent;
      if (originalContentCount === 0 && filteredContent.length > 0) {
        response1.data.data.isFuzzyFallback = true;
      }
    }

    res.json(response1.data);
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Failed to search files' });
  }
});

// API: TMDB Proxy with Cache
app.get('/api/meta/search_all', cacheMiddleware(3600, true), async (req, res) => {
  const { query, type, year, forceType } = req.query;
  if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Query required' });
  
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) {
    return res.json({ results: [] });
  }

  try {
    const typeStr = (type as string || '').toUpperCase();
    const isTvType = (t: string) => {
      if (!t) return false;
      const upper = t.toUpperCase();
      return ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME', 'TV', 'SHOW', 'TV_SHOW', 'EPISODE', 'DRAMA', 'ANIMES', 'SHOWS', 'CARTOON', 'ANIMATION', 'ASIAN_DRAMA', 'KOREAN_DRAMA', 'DOCUSERIES'].includes(upper) ||
        upper.includes('TV') || upper.includes('SHOW') || upper.includes('SERIES') || upper.includes('DRAMA') || upper.includes('ANIME') || upper.includes('CARTOON') || upper.includes('ANIMATION');
    };
    let searchType = isTvType(typeStr) ? 'tv' : 'movie';
    if (forceType && (forceType === 'movie' || forceType === 'tv')) {
       searchType = forceType;
    }
    
    let idResult = null;
    if (req.query.tmdbId) {
        try {
            const idRes = await axios.get(`https://api.themoviedb.org/3/${searchType}/${req.query.tmdbId}?api_key=${tmdbKey}`);
            idResult = idRes.data;
        } catch(e) {
            // fallback
        }
    }

    let url = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(query as string)}`;
    if (year && typeof year === 'string') {
      url += searchType === 'movie' ? `&primary_release_year=${year}` : `&first_air_date_year=${year}`;
    }
    let response = await axios.get(url);
    
    let results = response.data.results || [];
    
    if (results.length === 0) {
      let altQuery = null;
      if (query.includes('&')) {
        altQuery = query.replace(/&/g, 'and');
      } else if (query.match(/\band\b/i)) {
        altQuery = query.replace(/\band\b/ig, '&');
      }
      
      if (altQuery) {
        let altUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(altQuery)}`;
        if (year && typeof year === 'string') {
          altUrl += searchType === 'movie' ? `&primary_release_year=${year}` : `&first_air_date_year=${year}`;
        }
        try {
          const altResponse = await axios.get(altUrl);
          if (altResponse.data && altResponse.data.results && altResponse.data.results.length > 0) {
            results = altResponse.data.results;
          }
        } catch(e) {}
      }
    }

    if (idResult) {
       results = results.filter((r: any) => String(r.id) !== String(idResult.id));
       results.unshift(idResult);
    }

    res.json({ ...response.data, results });
  } catch (error: any) {
    console.error('TMDB Error', error.message);
    res.json({ results: [] });
  }
});


app.post('/api/meta/batch', adminMiddleware, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Array required' });

  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) return res.json({});

  const results = {};
  const toFetch = [];

  for (const item of items) {
    const { query, type, year, originalName } = item;
    if (!query) continue;
    const baseQuery = query.toLowerCase().trim();
    const baseKey = `${type}-${baseQuery}`;
    
    const overriddenKey = findOverriddenKeyInCache(tmdbCache, type, baseQuery, year);
    if (overriddenKey) {
      results[originalName] = { ...tmdbCache[overriddenKey], _synced: true };
    } else {
      const cacheKey = `${type}-${baseQuery}${year ? `-${year}` : ''}`;
      if (tmdbCache[cacheKey]) {
        results[originalName] = { ...tmdbCache[cacheKey], _synced: true };
      } else if (year && tmdbCache[baseKey]) {
        results[originalName] = { ...tmdbCache[baseKey], _synced: true };
      } else if (tmdbCache[cacheKey] === null) {
        results[originalName] = null;
      } else {
        toFetch.push({ ...item, cacheKey });
      }
    }
  }

  const chunk = 10;
  for (let i = 0; i < toFetch.length; i += chunk) {
    const batch = toFetch.slice(i, i + chunk);
    await Promise.all(batch.map(async (item) => {
      try {
        const typeStr = (item.type || '').toUpperCase();
        const searchType = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(typeStr) ? 'tv' : 'movie';
        let url = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(item.query)}`;
        if (item.year) {
          url += searchType === 'movie' ? `&primary_release_year=${item.year}` : `&first_air_date_year=${item.year}`;
        }
        
        let response = await axios.get(url);
        let data = response.data;
        
        if (data.results && data.results.length === 0) {
          let altQuery = null;
          if (item.query.includes('&')) {
            altQuery = item.query.replace(/&/g, 'and');
          } else if (item.query.match(/\band\b/i)) {
            altQuery = item.query.replace(/\band\b/ig, '&');
          }
          if (altQuery) {
            let altUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(altQuery)}`;
            if (item.year) {
              altUrl += searchType === 'movie' ? `&primary_release_year=${item.year}` : `&first_air_date_year=${item.year}`;
            }
            try {
              const altResponse = await axios.get(altUrl);
              if (altResponse.data && altResponse.data.results && altResponse.data.results.length > 0) {
                 data = altResponse.data;
              }
            } catch(e) {}
          }
        }
        
        if (data.results && data.results.length > 0) {
           let topResult = data.results[0];
           if (searchType === 'tv' && topResult.id && !topResult.status) {
               try {
                   const idRes = await axios.get(`https://api.themoviedb.org/3/tv/${topResult.id}?api_key=${tmdbKey}`);
                   if (idRes.data && idRes.data.status) {
                       topResult.status = idRes.data.status;
                       topResult.in_production = idRes.data.in_production;
                   }
               } catch(e) {}
           }
           tmdbCache[item.cacheKey] = topResult;
           results[item.originalName] = { ...topResult, _synced: false };
        } else {
           tmdbCache[item.cacheKey] = null;
           results[item.originalName] = null;
        }
      } catch (e) {
        tmdbCache[item.cacheKey] = null;
        results[item.originalName] = null;
      }
    }));
    saveDb();
  }

  res.json(results);
});

// Helper to attach status, credits, and images if missing in full mode
async function attachFullDataToItem(item: any, searchType: string, tmdbKey: string) {
   if (!item || !item.id || !tmdbKey) return false;
   let modified = false;
   const isTv = searchType === 'tv' || Boolean(item.first_air_date) || Boolean(item.name && !item.title) || Array.isArray(item.seasons) || item.media_type === 'tv' || item.number_of_seasons !== undefined;
   if (isTv && (!item.status || !item.seasons)) {
       try {
           const idRes = await axios.get(`https://api.themoviedb.org/3/tv/${item.id}?api_key=${tmdbKey}`);
           if (idRes.data) {
               if (idRes.data.status) {
                   item.status = idRes.data.status;
                   item.in_production = idRes.data.in_production;
               }
               if (idRes.data.seasons) {
                   item.seasons = idRes.data.seasons;
               }
               if (idRes.data.number_of_seasons) {
                   item.number_of_seasons = idRes.data.number_of_seasons;
               }
               if (idRes.data.number_of_episodes) {
                   item.number_of_episodes = idRes.data.number_of_episodes;
               }
               modified = true;
           }
       } catch(e) {}
   }
   
   if (!item.images || !item.images.logos || item.images.logos.length === 0) {
       try {
           const finalSearchType = isTv ? 'tv' : searchType;
           const imagesRes = await axios.get(`https://api.themoviedb.org/3/${finalSearchType}/${item.id}/images?api_key=${tmdbKey}&include_image_language=en,null`);
           if (imagesRes.data) {
               item.images = imagesRes.data;
               modified = true;
           }
       } catch(e) {}
   }
   return modified;
}

app.get('/api/meta/version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json({ version: globalMetaVersion });
});

app.get('/api/meta/search', cacheMiddleware(3600, true), async (req, res) => {
  const { query, type, year, tmdbId, full, path: itemPath } = req.query; // type can be 'movie' or 'tv'
  if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Query required' });
  
  const baseQuery = query.toLowerCase().trim();
  const baseKey = `${type}-${baseQuery}`;
  
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) {
    return res.json(null);
  }

  const typeStr = (type as string || '').toUpperCase();
  const isTvType = (t: string) => {
    if (!t) return false;
    const upper = t.toUpperCase();
    return ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME', 'TV', 'SHOW', 'TV_SHOW', 'EPISODE', 'DRAMA', 'ANIMES', 'SHOWS', 'CARTOON', 'ANIMATION', 'ASIAN_DRAMA', 'KOREAN_DRAMA', 'DOCUSERIES'].includes(upper) ||
      upper.includes('TV') || upper.includes('SHOW') || upper.includes('SERIES') || upper.includes('DRAMA') || upper.includes('ANIME') || upper.includes('CARTOON') || upper.includes('ANIMATION');
  };
  const searchType = isTvType(typeStr) ? 'tv' : 'movie';

  const rawPath = itemPath ? (itemPath as string).trim() : null;
  const isGeneric = rawPath ? isGenericCategoryRoot(rawPath) : true;
  const cleanPath = (rawPath && !isGeneric) ? rawPath.replace(/^\/+/, '') : null;
  const pathKey1 = cleanPath ? `path-${cleanPath}` : null;
  const pathKey2 = cleanPath ? `path-/${cleanPath}` : null;
  const pathKey = cleanPath ? `path-/${cleanPath}` : null;

  const attachFullData = async (item: any) => {
     return await attachFullDataToItem(item, searchType, tmdbKey);
  };

  // ALWAYS prioritize manually overridden items
  const overriddenKey = findOverriddenKeyInCache(tmdbCache, type as string, baseQuery, year as string, cleanPath || undefined);
  const cacheKey = `${type}-${baseQuery}${year ? `-${year}` : ''}`;
  
  let cachedItem = null;
  let cacheKeyToUpdate = null;
  if (overriddenKey && tmdbCache[overriddenKey]) {
    cachedItem = tmdbCache[overriddenKey];
    cacheKeyToUpdate = overriddenKey;
  } else if (pathKey1 && tmdbCache[pathKey1] !== undefined) {
    cachedItem = tmdbCache[pathKey1];
    cacheKeyToUpdate = pathKey1;
  } else if (pathKey2 && tmdbCache[pathKey2] !== undefined) {
    cachedItem = tmdbCache[pathKey2];
    cacheKeyToUpdate = pathKey2;
  } else {
    if (tmdbCache[cacheKey] !== undefined) {
      cachedItem = tmdbCache[cacheKey];
      cacheKeyToUpdate = cacheKey;
    } else if (tmdbCache[baseKey] !== undefined) {
      cachedItem = tmdbCache[baseKey];
      cacheKeyToUpdate = baseKey;
    } else {
      const prefix = `${type}-${baseQuery}`;
      const foundKey = Object.keys(tmdbCache).find(k => {
        if (k === baseKey) return true;
        // Only allow fallback to year-specific cache if we didn't specify a year
        if (!year && (k.startsWith(`${prefix}-`) || k.startsWith(`${prefix}_`))) return true;
        return false;
      });
      if (foundKey && tmdbCache[foundKey]) {
        cachedItem = tmdbCache[foundKey];
        cacheKeyToUpdate = foundKey;
      }
    }
  }

  if (cachedItem !== undefined && cachedItem !== null) {
      if (full === 'true') {
          try {
              const modified = await attachFullData(cachedItem);
              if (modified && cacheKeyToUpdate) {
                  tmdbCache[cacheKeyToUpdate] = cachedItem;
                  saveDb();
              }
          } catch (e) {}
      }
      return res.json({ ...cachedItem, _synced: true });
  } else if (cachedItem === null && cacheKeyToUpdate) {
      return res.json(null);
  }

  try {
    let data: any = { results: [] };
    if (tmdbId) {
        try {
            const idRes = await axios.get(`https://api.themoviedb.org/3/${searchType}/${tmdbId}?api_key=${tmdbKey}`);
            if (idRes.data) {
                data = { results: [idRes.data] };
            }
        } catch(e) {}
    }
    
    if (data.results.length === 0) {
        let url = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(query)}`;
        if (year && typeof year === 'string') {
          url += searchType === 'movie' ? `&primary_release_year=${year}` : `&first_air_date_year=${year}`;
        }
        try {
            let response = await axios.get(url);
            data = response.data;
        } catch(e) {}
    }
    
    if (data.results && data.results.length === 0) {
      let altQuery = null;
      if (query.includes('&')) {
        altQuery = query.replace(/&/g, 'and');
      } else if (query.match(/\band\b/i)) {
        altQuery = query.replace(/\band\b/ig, '&');
      }
      if (altQuery) {
        let altUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(altQuery)}`;
        if (year && typeof year === 'string') {
          altUrl += searchType === 'movie' ? `&primary_release_year=${year}` : `&first_air_date_year=${year}`;
        }
        try {
          const altResponse = await axios.get(altUrl);
          if (altResponse.data && altResponse.data.results && altResponse.data.results.length > 0) {
             data = altResponse.data;
          }
        } catch(e) {}
      }
    }
    
    if (data.results && data.results.length === 0 && year && typeof year === 'string') {
      const prevYear = (parseInt(year) - 1).toString();
      let urlPrevYear = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(query)}`;
      urlPrevYear += searchType === 'movie' ? `&primary_release_year=${prevYear}` : `&first_air_date_year=${prevYear}`;
      try {
        const prevRes = await axios.get(urlPrevYear);
        if (prevRes.data?.results?.length > 0) {
          data = prevRes.data;
        } else {
          // STILL failing, try entirely WITHOUT a year!
          let urlNoYear = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(query)}`;
          try {
            const noYearRes = await axios.get(urlNoYear);
            if (noYearRes.data?.results?.length > 0) {
               data = noYearRes.data;
            } else {
                let altQuery = null;
                if (query.includes('&')) altQuery = query.replace(/&/g, 'and');
                else if (query.match(/\band\b/i)) altQuery = query.replace(/\band\b/ig, '&');
                if (altQuery) {
                  let altUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(altQuery)}`;
                  const altPrevRes = await axios.get(altUrl);
                  if (altPrevRes.data?.results?.length > 0) data = altPrevRes.data;
                }
            }
          } catch(e) {}
        }
      } catch(e) {}
    }
    
    if (data.results && data.results.length > 0) {
       if (full === 'true') await attachFullData(data.results[0]);
       if (pathKey) {
           tmdbCache[pathKey] = data.results[0];
       } else {
           tmdbCache[cacheKey] = data.results[0];
       }
       saveDb();
       return res.json({ ...data.results[0], _synced: false });
    }
    res.json(null);
  } catch (error: any) {
    res.json(null);
  }
});

app.get('/api/meta/videos', cacheMiddleware(3600, true), async (req, res) => {
  const { id, type } = req.query;
  if (!id || !type) return res.status(400).json({ error: 'id and type required' });
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) return res.json(null);

  try {
    const searchType = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(String(type).toUpperCase()) ? 'tv' : 'movie';
    let response = await axios.get(`https://api.themoviedb.org/3/${searchType}/${id}/videos?api_key=${tmdbKey}`);
    res.json(response.data);
  } catch (err: any) {
    res.json(null);
  }
});

app.get('/api/meta/images', cacheMiddleware(3600, true), async (req, res) => {
  const { id, type, lang } = req.query;
  if (!id || !type) return res.status(400).json({ error: 'id and type required' });
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) return res.json(null);

  try {
    const typeStr = String(type).toUpperCase();
    const isTv = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME', 'TV', 'SHOW', 'TV_SHOW'].includes(typeStr) || String(type).toLowerCase() === 'tv';
    const searchType = isTv ? 'tv' : 'movie';
    const altType = searchType === 'tv' ? 'movie' : 'tv';
    const imageLangs = typeof lang === 'string' && lang.trim() ? lang.trim() : 'en,null,ja,ko,zh,es,fr,de,it,pt';
    
    let response: any = null;
    try {
      response = await axios.get(`https://api.themoviedb.org/3/${searchType}/${id}/images?api_key=${tmdbKey}&include_image_language=${imageLangs}`);
    } catch (e) {
      try {
        response = await axios.get(`https://api.themoviedb.org/3/${altType}/${id}/images?api_key=${tmdbKey}&include_image_language=${imageLangs}`);
      } catch (e2) {}
    }

    // Fallback: if no logos found with language filter, query without language filter
    if (!response?.data?.logos || response.data.logos.length === 0) {
      try {
        const fallbackRes = await axios.get(`https://api.themoviedb.org/3/${searchType}/${id}/images?api_key=${tmdbKey}`);
        if (fallbackRes.data?.logos && fallbackRes.data.logos.length > 0) {
          response = fallbackRes;
        } else {
          const fallbackAltRes = await axios.get(`https://api.themoviedb.org/3/${altType}/${id}/images?api_key=${tmdbKey}`);
          if (fallbackAltRes.data?.logos && fallbackAltRes.data.logos.length > 0) {
            response = fallbackAltRes;
          }
        }
      } catch (e3) {}
    }

    res.json(response?.data || { id, logos: [], backdrops: [], posters: [] });
  } catch (err: any) {
    res.json({ id, logos: [], backdrops: [], posters: [] });
  }
});

let filesScanJob = {
  isRunning: false,
  message: '',
  count: 0,
  total: 0,
  failedItems: [] as string[]
};

app.get('/api/meta/scan_files/status', (req, res) => {
  res.json(filesScanJob);
});

app.post('/api/meta/scan_files/start', adminMiddleware, async (req, res) => {
  if (filesScanJob.isRunning) {
    return res.json({ success: false, message: 'Already running' });
  }

  const token = getOpenlistApiKey();
  if (!token) return res.status(500).json({ error: 'Openlist API key missing' });

  filesScanJob = {
    isRunning: true,
    message: 'Starting files & folders scan...',
    count: 0,
    total: 0,
    failedItems: []
  };
  
  (async () => {
    try {
      const index = await getLibraryIndex(token, true); // true forces refresh of library root
      filesScanJob.total = index.length;
      
      const openlistUrl = getOpenlistUrl().replace(/\/$/, '');
      const listUrl = `${openlistUrl}/api/fs/list`;
      
      for (let i = 0; i < index.length; i++) {
        if (!filesScanJob.isRunning) break;
        
        const item = index[i];
        filesScanJob.message = `Scanning folder: ${item.name} (${i + 1}/${index.length})`;
        
        const reqPath = item.openlist_path || (item.path ? item.path : `${appConfig.basePath}/${item.category}/${item.name}`);
        const normalizedPath = path.posix.normalize(reqPath);
        
        try {
            const payload: any = { path: normalizedPath, password: "", refresh: true };
            let response = await axios.post(listUrl, payload, {
              headers: { Authorization: token }
            });
            
            if (response.data?.code === 200) {
                const cacheKey = `fs_list_shared_${normalizedPath}`;
                apiCache.set(cacheKey, response.data, 86400); // cache for 24 hours
                // writeSQLiteJSON disabled
                filesScanJob.count++;
                
                // If TV series, optionally scan seasons recursively
                const isTvCategory = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME', 'TV', 'SHOW', 'TV_SHOW', 'EPISODE'].includes((item.category || '').toUpperCase());
                if (isTvCategory && response.data.data?.content) {
                    const content = response.data.data.content;
                    
                    // Attempt to find TMDB ID for fetching episode metadata
                    let tvId = null;
                    const { cleanName, year } = parseMediaName(item.name);
                    const baseQuery = cleanName.toLowerCase().trim();
                    const searchType = 'tv';
                    const cacheKeyItem = `${searchType}-${baseQuery}${year ? `-${year}` : ''}`;
                    const baseKey = `${searchType}-${baseQuery}`;
                    
                    const cleanPathForOverride = normalizedPath.replace(/^\/+/, '');
                    const overriddenKey = findOverriddenKeyInCache(tmdbCache, searchType, baseQuery, year, cleanPathForOverride);
                    
                    let cachedTmdb = null;
                    if (overriddenKey && tmdbCache[overriddenKey]) {
                        cachedTmdb = tmdbCache[overriddenKey];
                    } else if (tmdbCache[cacheKeyItem]) {
                        cachedTmdb = tmdbCache[cacheKeyItem];
                    } else if (year && tmdbCache[baseKey]) {
                        cachedTmdb = tmdbCache[baseKey];
                    } else if (tmdbCache[`path-${cleanPathForOverride}`]) {
                        cachedTmdb = tmdbCache[`path-${cleanPathForOverride}`];
                    } else if (tmdbCache[`path-/${cleanPathForOverride}`]) {
                        cachedTmdb = tmdbCache[`path-/${cleanPathForOverride}`];
                    }
                    if (cachedTmdb) tvId = cachedTmdb.id;
                    const tmdbKey = process.env.TMDB_API_KEY;

                    for (const subItem of content) {
                        if (subItem.is_dir) {
                            const seasonPath = `${normalizedPath}/${subItem.name}`;
                            const seasonNormPath = path.posix.normalize(seasonPath);
                            
                            try {
                                const subPayload: any = { path: seasonNormPath, password: "", refresh: true, page: 1, per_page: 0 };
                                const subRes = await axios.post(listUrl, subPayload, { headers: { Authorization: token } });
                                if (subRes.data?.code === 200) {
                                    const subCacheKey = `fs_list_shared_${seasonNormPath}`;
                                    apiCache.set(subCacheKey, subRes.data, 86400);
                                    // writeSQLiteJSON disabled
                                }
                            } catch (e) {}

                            // --- Fetch Episode Metadata & Images ---
                            if (tvId && tmdbKey) {
                                const sMatch = subItem.name.match(/season\s*(\d+)/i) || subItem.name.match(/^s(\d+)/i);
                                let seasonNum = sMatch ? parseInt(sMatch[1], 10) : null;
                                if (seasonNum === null && subItem.name.toLowerCase().includes('specials')) {
                                   seasonNum = 0;
                                }
                                
                                if (seasonNum !== null) {
                                    try {
                                        const tmdbSeasonCacheKey = `${tvId}_${seasonNum}`;
                                        let seasonData = tmdbSeasonCache[tmdbSeasonCacheKey];
                                        
                                        if (!seasonData) {
                                            const seasonUrl = `https://api.themoviedb.org/3/tv/${tvId}/season/${seasonNum}?api_key=${tmdbKey}`;
                                            const tmdbRes = await axios.get(seasonUrl);
                                            if (tmdbRes.data) {
                                                tmdbSeasonCache[tmdbSeasonCacheKey] = tmdbRes.data;
                                                // tmdbSeasonCache save disabled
                                                seasonData = tmdbRes.data;
                                            }
                                        }

                                        // Background image pre-caching is disabled to save disk space and DB load.
                                        // The client will fetch directly from TMDB API.
                                    } catch (e) {
                                        console.error(`Failed to fetch TMDB episode metadata for TV ${tvId} Season ${seasonNum}`);
                                    }
                                }
                            }

                            await new Promise(resolve => setTimeout(resolve, 200));
                        }
                    }
                }
            }
        } catch (err) {
            filesScanJob.failedItems.push(item.name);
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      filesScanJob.isRunning = false;
      filesScanJob.message = `Finished files scan. Processed ${filesScanJob.count} folders.`;
    } catch (error: any) {
      filesScanJob.isRunning = false;
      filesScanJob.message = `Error during scan: ${error.message}`;
    }
  })();
  
  res.json({ success: true, message: 'Started' });
});

app.post('/api/meta/scan_files/stop', adminMiddleware, (req, res) => {
  filesScanJob.isRunning = false;
  filesScanJob.message = 'Scan stopped.';
  res.json({ success: true, message: 'Stopped' });
});

let creditsScanJob = {
  isRunning: false,
  message: '',
  count: 0,
  total: 0,
  failedItems: [] as string[]
};

// scan_credits status removed

// scan_credits start removed

// scan_credits stop removed

let imagesScanJob = {
  isRunning: false,
  message: '',
  count: 0,
  total: 0,
  failedItems: [] as string[]
};

app.get('/api/meta/scan_images/status', (req, res) => {
  res.json(imagesScanJob);
});

app.post('/api/meta/scan_images/start', adminMiddleware, (req, res) => {
  if (imagesScanJob.isRunning) {
    return res.json({ success: false, message: 'Already running' });
  }

  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) return res.status(500).json({ error: 'TMDB key missing' });

  imagesScanJob = {
    isRunning: true,
    message: 'Starting images/logos scan...',
    count: 0,
    total: 0,
    failedItems: []
  };
  
  (async () => {
    try {
      const keys = Object.keys(tmdbCache).filter(k => tmdbCache[k] && tmdbCache[k].id);
      
      const keysToScan = keys.filter(k => {
          const item = tmdbCache[k];
          return item && item.id && !item.images;
      });

      imagesScanJob.total = keysToScan.length;
      
      let modified = false;
      for (let i = 0; i < keysToScan.length; i++) {
        if (!imagesScanJob.isRunning) break;
        
        const key = keysToScan[i];
        const item = tmdbCache[key];
        
        if (item && item.id) {
          const category = key.split('-')[0];
          if (category) {
            imagesScanJob.message = `Scanning images for: ${item.title || item.name} (${i + 1}/${keysToScan.length})`;
            
            try {
              const isTvType = (t: string) => ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME', 'TV', 'SHOW', 'TV_SHOW', 'EPISODE'].includes(t.toUpperCase());
              const searchType = isTvType(category) ? 'tv' : 'movie';
              let response = await axios.get(`https://api.themoviedb.org/3/${searchType}/${item.id}/images?api_key=${tmdbKey}&include_image_language=en,null`);
              if (response.data) {
                tmdbCache[key].images = response.data;
                modified = true;
                imagesScanJob.count++;
              }
            } catch (err) {
               imagesScanJob.failedItems.push(item.title || item.name || String(item.id));
            }
            
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      }
      
      if (modified) {
        await saveDb();
      }
      
      imagesScanJob.isRunning = false;
      imagesScanJob.message = `Finished images scan. Processed ${imagesScanJob.count} items.`;
    } catch (error: any) {
      imagesScanJob.isRunning = false;
      imagesScanJob.message = `Error during scan: ${error.message}`;
    }
  })();
  
  res.json({ success: true, message: 'Started' });
});

app.post('/api/meta/scan_images/stop', adminMiddleware, (req, res) => {
  imagesScanJob.isRunning = false;
  imagesScanJob.message = 'Scan stopped.';
  res.json({ success: true, message: 'Stopped' });
});

// Credits endpoint removed

// Person endpoint removed

app.get('/api/meta/tv_details', cacheMiddleware(3600, true), async (req, res) => {
  const { tvId } = req.query;
  if (!tvId) return res.status(400).json({ error: 'tvId required' });
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) return res.json(null);

  try {
    let response = await axios.get(`https://api.themoviedb.org/3/tv/${tvId}?api_key=${tmdbKey}`);
    res.json(response.data);
  } catch (err: any) {
    res.json(null);
  }
});

app.get('/api/meta/tv_season', cacheMiddleware(3600, true), async (req, res) => {
  const { tvId, season } = req.query;
  if (!tvId || !season) return res.status(400).json({ error: 'tvId and season required' });
  
  const cacheKey = `${tvId}_${season}`;
  if (tmdbSeasonCache[cacheKey]) {
      return res.json(tmdbSeasonCache[cacheKey]);
  }

  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) return res.json(null);

  try {
    let response = await axios.get(`https://api.themoviedb.org/3/tv/${tvId}/season/${season}?api_key=${tmdbKey}`);
    if (response.data) {
        tmdbSeasonCache[cacheKey] = response.data;
        saveSeasonCache();
    }
    res.json(response.data);
  } catch (err: any) {
    res.json(null);
  }
});

app.get('/api/meta/collections', cacheMiddleware(3600, true), (req, res) => {
  const collections: Record<number, any> = {};
  for (const key in tmdbCache) {
    const item = tmdbCache[key];
    if (item && item.belongs_to_collection) {
      const cId = item.belongs_to_collection.id;
      if (!collections[cId]) {
        collections[cId] = {
           id: cId,
           name: item.belongs_to_collection.name,
           poster_path: item.belongs_to_collection.poster_path,
           backdrop_path: item.belongs_to_collection.backdrop_path,
           queries: new Set<string>()
        };
      }
      const match = key.match(/^[a-zA-Z]+-(.+?)(?:-\d{4})?$/);
      if (match) {
          collections[cId].queries.add(match[1]);
      } else {
          collections[cId].queries.add(key.replace(/^[a-zA-Z]+-/, ''));
      }
    }
  }
  
  const result = Object.values(collections).map(c => ({
    ...c,
    queries: Array.from(c.queries)
  }));
  
  res.json({ success: true, collections: result });
});

// User Custom Collections Persistence
async function loadUserCollections() {
  const cols = await readSQLiteJSON('user_collections');
  if (cols && Array.isArray(cols)) return cols;

  const initial = [
    {
      id: 'col_epic_historical',
      name: 'Epic Historical & Period Adventures',
      description: 'Sweeping stories from the great eras of war, royalty, exploration and honour, on the grandest scale.',
      authorName: 'PF-Admin',
      createdBy: 'admin',
      isPublic: true,
      categoryTag: 'Lists',
      upvotes: ['admin', 'guest', 'user1', 'cinema_fan'],
      createdAt: Date.now() - 30 * 86400000,
      updatedAt: Date.now() - 2 * 86400000,
      items: [
        {
          id: 'item_lawrence',
          name: 'Lawrence of Arabia (1962).mkv',
          title: 'Lawrence of Arabia',
          year: 1962,
          runtime: '3h 47m',
          mediaType: 'movie',
          overview: 'The story of T.E. Lawrence, the English officer who successfully united and led the diverse Arab tribes during World War I.',
          rating: 8.3,
          voteCount: 12500,
          contentRating: 'PG',
          genres: ['Adventure', 'Biography', 'Drama', 'History'],
          posterPath: '/a1DO7TstXj6V3D17d7bZlZc1eE4.jpg',
          backdropPath: '/a1DO7TstXj6V3D17d7bZlZc1eE4.jpg'
        },
        {
          id: 'item_braveheart',
          name: 'Braveheart (1995).mkv',
          title: 'Braveheart',
          year: 1995,
          runtime: '2h 58m',
          mediaType: 'movie',
          overview: 'Scottish warrior William Wallace leads his countrymen in a rebellion to free his homeland from the tyranny of King Edward I of England.',
          rating: 8.3,
          voteCount: 15400,
          contentRating: 'R',
          genres: ['Action', 'Biography', 'Drama', 'History', 'War'],
          posterPath: '/or1gYi8j31qch1GvY2P9ych09VI.jpg',
          backdropPath: '/or1gYi8j31qch1GvY2P9ych09VI.jpg'
        },
        {
          id: 'item_gladiator',
          name: 'Gladiator (2000).mkv',
          title: 'Gladiator',
          year: 2000,
          runtime: '2h 35m',
          mediaType: 'movie',
          overview: 'A former Roman General sets out to exact vengeance against the corrupt emperor who murdered his family and sent him into slavery.',
          rating: 8.5,
          voteCount: 19200,
          contentRating: 'R',
          genres: ['Action', 'Adventure', 'Drama'],
          posterPath: '/ty8TTH2rmRxc2wTVBxfs02UkF6E.jpg',
          backdropPath: '/ty8TTH2rmRxc2wTVBxfs02UkF6E.jpg'
        },
        {
          id: 'item_mohicans',
          name: 'The Last of the Mohicans (1992).mkv',
          title: 'The Last of the Mohicans',
          year: 1992,
          runtime: '1h 52m',
          mediaType: 'movie',
          overview: 'Three trappers protect the daughters of a British Colonel in the midst of the French and Indian War.',
          rating: 7.7,
          voteCount: 8900,
          contentRating: 'R',
          genres: ['Action', 'Adventure', 'Drama', 'History', 'Romance'],
          posterPath: '/e4u1xP38tL618C5Xj2e6F7m5f7a.jpg',
          backdropPath: '/e4u1xP38tL618C5Xj2e6F7m5f7a.jpg'
        },
        {
          id: 'item_kingdom_heaven',
          name: 'Kingdom of Heaven (2005).mkv',
          title: 'Kingdom of Heaven',
          year: 2005,
          runtime: '2h 24m',
          mediaType: 'movie',
          overview: 'Balian of Ibelin travels to Jerusalem during the Crusades of the 12th century, where he finds himself as the defender of the city.',
          rating: 7.3,
          voteCount: 11000,
          contentRating: 'R',
          genres: ['Action', 'Adventure', 'Drama', 'History', 'War'],
          posterPath: '/z6o6G1lF5p46hJ3b7R0Pq2vLg7j.jpg',
          backdropPath: '/z6o6G1lF5p46hJ3b7R0Pq2vLg7j.jpg'
        }
      ]
    },
    {
      id: 'col_scifi_cyberpunk',
      name: 'Mind-Bending Sci-Fi & Cyberpunk',
      description: 'Futuristic visionaries, dystopian realities, time paradoxes, and deep space philosophical journeys.',
      authorName: 'NeonRider',
      createdBy: 'admin',
      isPublic: true,
      categoryTag: 'Lists',
      upvotes: ['admin', 'guest', 'user2'],
      createdAt: Date.now() - 20 * 86400000,
      updatedAt: Date.now() - 1 * 86400000,
      items: [
        {
          id: 'item_blade_runner',
          name: 'Blade Runner 2049 (2017).mkv',
          title: 'Blade Runner 2049',
          year: 2017,
          runtime: '2h 44m',
          mediaType: 'movie',
          overview: 'Young Blade Runner K discovers a long-buried secret that leads him to track down former Blade Runner Rick Deckard.',
          rating: 8.0,
          voteCount: 14200,
          contentRating: 'R',
          genres: ['Sci-Fi', 'Drama', 'Mystery'],
          posterPath: '/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg'
        },
        {
          id: 'item_interstellar',
          name: 'Interstellar (2014).mkv',
          title: 'Interstellar',
          year: 2014,
          runtime: '2h 49m',
          mediaType: 'movie',
          overview: 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival.',
          rating: 8.7,
          voteCount: 35000,
          contentRating: 'PG-13',
          genres: ['Adventure', 'Drama', 'Sci-Fi'],
          posterPath: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg'
        },
        {
          id: 'item_matrix',
          name: 'The Matrix (1999).mkv',
          title: 'The Matrix',
          year: 1999,
          runtime: '2h 16m',
          mediaType: 'movie',
          overview: 'When a beautiful stranger leads computer hacker Neo to a forbidding underworld, he discovers the shocking truth.',
          rating: 8.7,
          voteCount: 26000,
          contentRating: 'R',
          genres: ['Action', 'Sci-Fi'],
          posterPath: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg'
        },
        {
          id: 'item_inception',
          name: 'Inception (2010).mkv',
          title: 'Inception',
          year: 2010,
          runtime: '2h 28m',
          mediaType: 'movie',
          overview: 'A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea.',
          rating: 8.8,
          voteCount: 38000,
          contentRating: 'PG-13',
          genres: ['Action', 'Sci-Fi', 'Adventure'],
          posterPath: '/ljs26ipKGh9u9sR4GFxWsgiojTe.jpg'
        }
      ]
    }
  ];
  await writeSQLiteJSON('user_collections', initial);
  return initial;
}

async function saveUserCollections(collections: any[]) {
  await writeSQLiteJSON('user_collections', collections);
}

// User Custom Collections API Routes
app.get('/api/user-collections', async (req, res) => {
  try {
    const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'] || '';
    const collections = await loadUserCollections();
    
    // Filter out private collections that don't belong to current user
    const filtered = collections.filter(col => {
      if (col.isPublic) return true;
      if (!user) return false;
      return col.createdBy === user || user === 'admin';
    });
    
    res.json({ success: true, collections: filtered });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user-collections', async (req, res) => {
  try {
    const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'] || 'guest';
    const { name, description, authorName, isPublic, categoryTag, items } = req.body;
    
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Collection name is required' });
    }
    if (!authorName || typeof authorName !== 'string' || !authorName.trim()) {
      return res.status(400).json({ error: 'Author name is required' });
    }

    const collections = await loadUserCollections();
    const newCol = {
      id: `col_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: name.trim(),
      description: (description || '').trim(),
      authorName: authorName.trim(),
      createdBy: user,
      isPublic: isPublic !== false, // default true unless false
      categoryTag: categoryTag || 'Lists',
      items: Array.isArray(items) ? items : [],
      upvotes: [user],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    collections.unshift(newCol);
    await saveUserCollections(collections);
    res.json({ success: true, collection: newCol });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/user-collections/:id', async (req, res) => {
  try {
    const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'] || '';
    const { id } = req.params;
    const collections = await loadUserCollections();
    const col = collections.find(c => c.id === id);
    
    if (!col) return res.status(404).json({ error: 'Collection not found' });
    if (!col.isPublic && col.createdBy !== user && user !== 'admin') {
      return res.status(403).json({ error: 'Private collection' });
    }

    res.json({ success: true, collection: col });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/user-collections/:id', async (req, res) => {
  try {
    const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'] || '';
    const { id } = req.params;
    const { name, description, authorName, isPublic, categoryTag, items } = req.body;

    const collections = await loadUserCollections();
    const index = collections.findIndex(c => c.id === id);
    if (index < 0) return res.status(404).json({ error: 'Collection not found' });

    const col = collections[index];
    if (col.createdBy !== user && user !== 'admin') {
      return res.status(403).json({ error: 'Only author can modify this collection' });
    }

    if (name !== undefined) col.name = name.trim();
    if (description !== undefined) col.description = description.trim();
    if (authorName !== undefined) col.authorName = authorName.trim();
    if (isPublic !== undefined) col.isPublic = !!isPublic;
    if (categoryTag !== undefined) col.categoryTag = categoryTag;
    if (items !== undefined && Array.isArray(items)) col.items = items;
    col.updatedAt = Date.now();

    collections[index] = col;
    await saveUserCollections(collections);
    res.json({ success: true, collection: col });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/user-collections/:id', async (req, res) => {
  try {
    const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'] || '';
    const { id } = req.params;

    let collections = await loadUserCollections();
    const col = collections.find(c => c.id === id);
    if (!col) return res.status(404).json({ error: 'Collection not found' });
    
    if (col.createdBy !== user && user !== 'admin') {
      return res.status(403).json({ error: 'Only author can delete this collection' });
    }

    collections = collections.filter(c => c.id !== id);
    await saveUserCollections(collections);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user-collections/:id/upvote', async (req, res) => {
  try {
    const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'] || 'guest';
    const { id } = req.params;

    const collections = await loadUserCollections();
    const col = collections.find(c => c.id === id);
    if (!col) return res.status(404).json({ error: 'Collection not found' });

    if (!Array.isArray(col.upvotes)) col.upvotes = [];
    const idx = col.upvotes.indexOf(user);
    if (idx >= 0) {
      col.upvotes.splice(idx, 1);
    } else {
      col.upvotes.push(user);
    }

    await saveUserCollections(collections);
    res.json({ success: true, upvotesCount: col.upvotes.length, isUpvoted: col.upvotes.includes(user) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Genre Backdrops Cache
let genreBackdropsCache: { time: number, data: any[] } | null = null;

app.get('/api/meta/genres/backdrops', cacheMiddleware(3600, true), async (req, res) => {
  try {
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    if (genreBackdropsCache && (Date.now() - genreBackdropsCache.time < SEVEN_DAYS)) {
        return res.json({ success: true, genres: genreBackdropsCache.data });
    }

    const genres: Record<number, string> = {
      28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
      99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
      27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
      10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western", 10759: "Action & Adventure",
      10762: "Kids", 10763: "News", 10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap",
      10767: "Talk", 10768: "War & Politics"
    };

    let token = req.headers.authorization;
    if (isValidGuest(token || '')) token = getOpenlistApiKey();
    
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const items = await getLibraryIndex(token);
    const genreBackdrops: any[] = [];
    
    const tmdbKeys = Object.keys(tmdbCache);
    const overriddenKeys = tmdbKeys.filter(k => tmdbCache[k]?._overridden);

    const itemsWithCache = items.map((item: any) => {
       const type = item.category;
       const baseQuery = (item.cleanName || '').toLowerCase().trim();
       const year = item.year;
       const baseKey = `${type}-${baseQuery}`;
       
       let cached = null;
       const overriddenKey = findOverriddenKeyInCache(tmdbCache, type, baseQuery, year);
       if (overriddenKey) {
          cached = tmdbCache[overriddenKey];
       } else {
          const cacheKey = `${type}-${baseQuery}${year ? `-${year}` : ''}`;
          if (tmdbCache[cacheKey]) {
             cached = tmdbCache[cacheKey];
          } else if (year && tmdbCache[baseKey]) {
             cached = tmdbCache[baseKey];
          }
       }
       return { ...item, _cached: cached };
    }).filter((item: any) => item._cached && item._cached.backdrop_path);
    
    Object.keys(genres).forEach(idStr => {
       const genreId = parseInt(idStr, 10);
       const matched = itemsWithCache.filter((item: any) => {
           const cached = item._cached;
           return (cached.genres && cached.genres.some((g: any) => g.id === genreId)) || 
                  (cached.genre_ids && cached.genre_ids.includes(genreId));
       });
       
       if (matched.length > 0) {
          const randomItem = matched[Math.floor(Math.random() * matched.length)];
          genreBackdrops.push({
              id: genreId,
              name: genres[genreId as keyof typeof genres],
              backdrop_path: randomItem._cached.backdrop_path
          });
       }
    });

    genreBackdropsCache = { time: Date.now(), data: genreBackdrops };
    res.json({ success: true, genres: genreBackdrops });
  } catch (err: any) {
    res.json({ success: false, genres: [] });
  }
});

app.get('/api/meta/genre/:genreId', async (req, res) => {
  try {
    const genreId = parseInt(req.params.genreId, 10);
    
    let token = req.headers.authorization;
    if (isValidGuest(token || '')) token = getOpenlistApiKey();
    
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const items = await getLibraryIndex(token);

    const matchedItems = items.filter((item: any) => {
       if (!item.cleanName || !item.category) return false;
       
       const type = item.category;
       const baseQuery = item.cleanName.toLowerCase().trim();
       const year = item.year;
       const baseKey = `${type}-${baseQuery}`;
       
       let cached = null;
       
       const overriddenKey = findOverriddenKeyInCache(tmdbCache, type, baseQuery, year);
       if (overriddenKey) {
          cached = tmdbCache[overriddenKey];
       } else {
          const cacheKey = `${type}-${baseQuery}${year ? `-${year}` : ''}`;
          if (tmdbCache[cacheKey]) {
             cached = tmdbCache[cacheKey];
          } else if (year && tmdbCache[baseKey]) {
             cached = tmdbCache[baseKey];
          }
       }
       
       if (cached) {
          const hasGenre = (cached.genres && cached.genres.some((g: any) => g.id === genreId)) ||
                           (cached.genre_ids && cached.genre_ids.includes(genreId));
          return hasGenre;
       }
       return false;
    });

    res.json({ success: true, genreId, items: matchedItems });
  } catch (err: any) {
    res.json({ success: false, genreId: req.params.genreId, items: [] });
  }
});

app.get('/api/meta/discover', cacheMiddleware(3600, true), async (req, res) => {
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) return res.json({ results: [] });
  
  try {
    const params = new URLSearchParams(req.query as any);
    params.set('api_key', tmdbKey);
    const url = `https://api.themoviedb.org/3/discover/movie?${params.toString()}`;
    let response = await axios.get(url);
    res.json(response.data);
  } catch (error: any) {
    console.error('TMDB Discover Error', error.message);
    res.json({ results: [] });
  }
});

app.get('/api/meta/trending', cacheMiddleware(3600, true), async (req, res) => {
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) return res.json({ results: [] });
  
  try {
    const url = `https://api.themoviedb.org/3/trending/all/day?api_key=${tmdbKey}`;
    let response = await axios.get(url);
    res.json(response.data);
  } catch (error: any) {
    console.error('TMDB Trending Error', error.message);
    res.json({ results: [] });
  }
});

// Admin correction for TMDB
app.post('/api/meta/correct', adminMiddleware, async (req, res) => {
  const { query, type, year, data } = req.body;
  if (!query || !data) return res.status(400).json({ error: 'Invalid data' });
  const cacheKey = `${type}-${query.toLowerCase().trim()}${year ? `-${year}` : ''}`;
  const baseKey = `${type}-${query.toLowerCase().trim()}`;
  data._overridden = true;
  data._synced = true;
  tmdbCache[cacheKey] = data;
  if (!year) {
    tmdbCache[baseKey] = data;
  }
  bumpMetaVersion();
  await saveDbImmediate();
  addLog('TMDB Corrected', 'Admin', `Corrected TMDB data for query: ${query} (Type: ${type})`);
  res.json({ success: true, data });
});

// Admin override for TMDB by ID
app.post('/api/meta/override', authenticatedMiddleware, async (req, res) => {
  const { query, type, year, tmdbId, customTitle, customYear, customLogo, path: itemPath, updateLogoOnly, currentData } = req.body;
  if (!query || (!tmdbId && !customTitle && !customYear && customLogo === undefined)) return res.status(400).json({ error: 'Invalid data' });

  try {
    const lowerQuery = query.toLowerCase().trim();
    const typeStr = (type as string || '').toUpperCase();
    const cacheKey = `${typeStr}-${lowerQuery}${year ? `-${year}` : ''}`;
    const baseKey = `${typeStr}-${lowerQuery}`;
    const rawPath = itemPath ? (itemPath as string).trim() : null;
    const isGeneric = rawPath ? isGenericCategoryRoot(rawPath) : true;
    const cleanPath = (rawPath && !isGeneric) ? rawPath.replace(/^\/+/, '') : null;
    const pathKey1 = cleanPath ? `path-${cleanPath}` : null;
    const pathKey2 = cleanPath ? `path-/${cleanPath}` : null;

    // Clear server response cache so all GET queries get fresh data immediately
    bumpMetaVersion();

    const applyLogoToData = (dataToUpdate: any, logoVal: any) => {
      if (typeof logoVal === 'string' && logoVal.trim()) {
        const cleanLogo = logoVal.trim();
        dataToUpdate.custom_logo = cleanLogo;
        dataToUpdate.logo_path = cleanLogo;
        dataToUpdate.no_logo = false;
        dataToUpdate.images = dataToUpdate.images || {};
        dataToUpdate.images.logos = dataToUpdate.images.logos || [];
        dataToUpdate.images.logos = dataToUpdate.images.logos.filter((l: any) => l.file_path !== cleanLogo);
        dataToUpdate.images.logos.unshift({ file_path: cleanLogo, iso_639_1: 'en' });
      } else if (logoVal === '' || logoVal === null) {
        dataToUpdate.custom_logo = '';
        dataToUpdate.logo_path = '';
        dataToUpdate.no_logo = true;
        if (dataToUpdate.images) {
          dataToUpdate.images.logos = [];
        }
      }
    };

    const setOverriddenDataInCache = (dataToStore: any) => {
      dataToStore._overridden = true;
      dataToStore._synced = true;
      tmdbCache[cacheKey] = dataToStore;
      
      if (!year) {
        tmdbCache[baseKey] = dataToStore;
      }
      
      if (pathKey1) tmdbCache[pathKey1] = dataToStore;
      if (pathKey2) tmdbCache[pathKey2] = dataToStore;

      // Update any other existing keys in tmdbCache that match cleanPath
      if (cleanPath) {
        for (const k of Object.keys(tmdbCache)) {
          if (!year && k === baseKey) {
            tmdbCache[k] = dataToStore;
          }
          if (k === `path-${cleanPath}` || k === `path-/${cleanPath}`) {
            tmdbCache[k] = dataToStore;
          }
        }
      }
    };

    const isMovieCategory = (type || '').toUpperCase() === 'MOVIES';

    if (updateLogoOnly || ((customTitle || customYear || customLogo !== undefined) && !tmdbId)) {
      // Just override title/year/logo in existing cache or create a mock
      let data = { ...(tmdbCache[cacheKey] || tmdbCache[baseKey] || (pathKey1 ? tmdbCache[pathKey1] : null) || currentData || {}) };
      
      if (customTitle) {
        data.title = customTitle;
        if (!isMovieCategory) {
          data.name = customTitle; // tv uses name
        }
      }
      if (customYear) {
        data.release_date = customYear + '-01-01'; // approximate for movie
        if (!isMovieCategory) {
          data.first_air_date = customYear + '-01-01'; // approximate for tv
        }
      }
      if (customLogo !== undefined) {
        applyLogoToData(data, customLogo);
      }
      
      try {
          setOverriddenDataInCache(data);
      } catch (err: any) {
          console.error("Error in setOverriddenDataInCache:", err.message);
      }
      
      try {
          await saveDbImmediate();
      } catch (err: any) {
          console.error("Error in saveDbImmediate:", err.message);
      }
      
      try {
          addLog('TMDB Overridden', 'Admin', `Overrode TMDB data for query: ${query} (Custom title: ${customTitle || 'N/A'}, Custom year: ${customYear || 'N/A'}, Logo: ${customLogo !== undefined ? (customLogo || 'Removed') : 'N/A'})`);
      } catch (err: any) {
          console.error("Error in addLog:", err.message);
      }
      
      try {
          return res.json({ success: true, data });
      } catch (err: any) {
          console.error("Error in res.json:", err.message);
          return res.status(500).json({ error: 'Failed to serialize JSON' });
      }
    }

    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) return res.status(500).json({ error: 'TMDB Key missing' });

    const primaryType = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(typeStr) ? 'tv' : 'movie';
    const secondaryType = primaryType === 'tv' ? 'movie' : 'tv';
    
    let data = null;
    try {
      let response = await axios.get(`https://api.themoviedb.org/3/${primaryType}/${tmdbId}?api_key=${tmdbKey}&append_to_response=images&include_image_language=en,null,ja,ko,zh,es,fr,de,it`);
      data = response.data;
    } catch (e) {
      try {
        let response = await axios.get(`https://api.themoviedb.org/3/${secondaryType}/${tmdbId}?api_key=${tmdbKey}&append_to_response=images&include_image_language=en,null,ja,ko,zh,es,fr,de,it`);
        data = response.data;
      } catch (e2) {
        return res.status(404).json({ error: 'Not found on TMDB' });
      }
    }
    
    if (data) {
       if (customTitle) {
         data.title = customTitle;
         if (!isMovieCategory) {
           data.name = customTitle;
         }
       }
       if (customYear) {
         data.release_date = customYear + '-01-01';
         if (!isMovieCategory) {
           data.first_air_date = customYear + '-01-01';
         }
       }
       if (customLogo !== undefined) {
         applyLogoToData(data, customLogo);
       }
       
       const tmdbKey = process.env.TMDB_API_KEY;
       if (tmdbKey) {
           try {
               await attachFullDataToItem(data, primaryType, tmdbKey);
           } catch(err: any) {
               console.error("Error in attachFullDataToItem:", err.message);
           }
       }
       
       try {
           setOverriddenDataInCache(data);
       } catch (err: any) {
           console.error("Error in setOverriddenDataInCache:", err.message);
       }
       
       try {
           await saveDbImmediate();
       } catch (err: any) {
           console.error("Error in saveDbImmediate:", err.message);
       }
       
       try {
           addLog('TMDB Overridden', 'Admin', `Overrode TMDB data for query: ${query} with ID: ${tmdbId}`);
       } catch (err: any) {
           console.error("Error in addLog:", err.message);
       }
       
       try {
           return res.json({ success: true, data });
       } catch (err: any) {
           console.error("Error in res.json:", err.message);
           return res.status(500).json({ error: 'Failed to serialize JSON' });
       }
    }
    res.status(404).json({ error: 'Not found' });
  } catch (error: any) {
    console.error('TMDB Override Error:', error && error.stack ? error.stack : error);
    res.status(500).json({ error: error.message || 'TMDB fetch failed' });
  }
});


let collectionScanJob = {
  isRunning: false,
  message: '',
  count: 0,
  total: 0
};

app.get('/api/meta/scan_collections/status', (req, res) => {
  res.json(collectionScanJob);
});

app.post('/api/meta/scan_collections/start', adminMiddleware, (req, res) => {
  if (collectionScanJob.isRunning) {
    return res.json({ success: false, message: 'Already running' });
  }

  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) return res.status(500).json({ error: 'TMDB key missing' });

  collectionScanJob.isRunning = true;
  collectionScanJob.message = 'Starting collection and actor filmography scan...';
  collectionScanJob.count = 0;
  
  (async () => {
    try {
      const keys = Object.keys(tmdbCache).filter(k => k.startsWith('movie-') || (tmdbCache[k] && tmdbCache[k].title));
      const actorIds: string[] = [];
      collectionScanJob.total = keys.length + actorIds.length;
      
      let modified = false;
      for (const key of keys) {
        if (!collectionScanJob.isRunning) break;
        
        const item = tmdbCache[key];
        if (item && item.id && item.belongs_to_collection === undefined && !item._collection_checked) {
          try {
            const movieRes = await axios.get(`https://api.themoviedb.org/3/movie/${item.id}?api_key=${tmdbKey}`);
            if (movieRes.data) {
              const fullMovie = movieRes.data;
              fullMovie._collection_checked = true;
              tmdbCache[key] = { ...item, ...fullMovie };
              modified = true;
            }
          } catch(e) {
            tmdbCache[key]._collection_checked = true;
            modified = true;
          }
          await new Promise(r => setTimeout(r, 100)); // 10 req/s, well within 50/s
        }
        collectionScanJob.count++;
        collectionScanJob.message = `Scanning collections... ${collectionScanJob.count} / ${collectionScanJob.total}`;
      }
      
      if (modified) await saveDb();

      collectionScanJob.message = `Finished scan. Processed ${collectionScanJob.count} items.`;
    } catch(e: any) {
      collectionScanJob.message = `Error: ${e.message}`;
    } finally {
      collectionScanJob.isRunning = false;
    }
  })();
  
  res.json({ success: true });
});

app.post('/api/meta/scan_collections/stop', adminMiddleware, (req, res) => {
  collectionScanJob.isRunning = false;
  collectionScanJob.message = 'Scan stopped.';
  res.json({ success: true, message: 'Stopped' });
});

let actorSyncJob = {
  isRunning: false,
  message: '',
  count: 0,
  total: 0
};

// scan_actors status removed

// scan_actors start removed

// scan_actors stop removed

let autoFetchJob = {
  isRunning: false,
  message: '',
  targetPath: '',
  count: 0,
  failedItems: [] as { name: string, path: string }[]
};

app.get('/api/meta/autofetch/status', (req, res) => {
  res.json(autoFetchJob);
});

app.post('/api/meta/autofetch/start', adminMiddleware, (req, res) => {
  if (autoFetchJob.isRunning) {
    return res.json({ success: false, message: 'Already running' });
  }

  let token = req.headers.authorization;
  addLog("Autofetch Started", "Admin", "Started TMDB autofetch");
  if (isValidGuest(token || '')) token = getOpenlistApiKey();

  let { targetPath } = req.body;
  targetPath = targetPath || appConfig.basePath || '/home';

  autoFetchJob = {
    isRunning: true,
    message: 'Starting auto-fetch...',
    targetPath,
    count: 0,
    failedItems: []
  };

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  const runAutoFetch = async () => {
    try {
      const openlistUrl = getOpenlistUrl().replace(/\/$/, '');
      const tmdbKey = process.env.TMDB_API_KEY;

      const scanCategory = async (catPath: string, catName: string) => {
        if (!autoFetchJob.isRunning) return;
        autoFetchJob.message = `Scanning category: ${catName} at ${catPath}...`;
        const listUrl = `${openlistUrl}/api/fs/list`;
        const catRes = await axios.post(listUrl, { path: catPath, password: "" }, { headers: { Authorization: token } });
        const items = catRes.data?.data?.content || [];
        
        for (const item of items) {
          if (!autoFetchJob.isRunning) break;
          const { cleanName, year } = parseMediaName(item.name);
          autoFetchJob.message = `Checking metadata for: ${cleanName}...`;
          
          try {
            // Check cache first
            const cacheKey = `${catName}-${cleanName.toLowerCase().trim()}${year ? `-${year}` : ''}`;
            if (!tmdbCache[cacheKey] && tmdbKey) {
              const searchType = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes((catName || '').toUpperCase()) ? 'tv' : 'movie';
              let url = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(cleanName)}`;
              if (year) {
                url += searchType === 'movie' ? `&primary_release_year=${year}` : `&first_air_date_year=${year}`;
              }
              let response = await axios.get(url);
              let data = response.data;

              if (data.results && data.results.length === 0) {
                let altQuery = null;
                if (cleanName.includes('&')) altQuery = cleanName.replace(/&/g, 'and');
                else if (cleanName.match(/\band\b/i)) altQuery = cleanName.replace(/\band\b/ig, '&');
                
                if (altQuery) {
                  let altUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(altQuery)}`;
                  if (year) altUrl += searchType === 'movie' ? `&primary_release_year=${year}` : `&first_air_date_year=${year}`;
                  try {
                    const altRes = await axios.get(altUrl);
                    if (altRes.data?.results?.length > 0) data = altRes.data;
                  } catch(e) {}
                }
              }

              if (data.results && data.results.length === 0 && year) {
                const prevYear = (parseInt(year) - 1).toString();
                let urlPrevYear = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(cleanName)}`;
                urlPrevYear += searchType === 'movie' ? `&primary_release_year=${prevYear}` : `&first_air_date_year=${prevYear}`;
                try {
                  const prevRes = await axios.get(urlPrevYear);
                  if (prevRes.data?.results?.length > 0) {
                    data = prevRes.data;
                  } else {
                    let altQuery = null;
                    if (cleanName.includes('&')) altQuery = cleanName.replace(/&/g, 'and');
                    else if (cleanName.match(/\band\b/i)) altQuery = cleanName.replace(/\band\b/ig, '&');
                    if (altQuery) {
                      let altUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(altQuery)}`;
                      altUrl += searchType === 'movie' ? `&primary_release_year=${prevYear}` : `&first_air_date_year=${prevYear}`;
                      const altPrevRes = await axios.get(altUrl);
                      if (altPrevRes.data?.results?.length > 0) data = altPrevRes.data;
                    }
                  }
                } catch(e) {}
              }

              if (data.results && data.results.length > 0) {
                let topResult = data.results[0];
                if (searchType === 'tv' && topResult.id && (!topResult.status || !topResult.seasons)) {
                    try {
                        const idRes = await axios.get(`https://api.themoviedb.org/3/tv/${topResult.id}?api_key=${tmdbKey}`);
                        if (idRes.data) {
                            if (idRes.data.status) {
                                topResult.status = idRes.data.status;
                                topResult.in_production = idRes.data.in_production;
                            }
                            if (idRes.data.seasons) {
                                topResult.seasons = idRes.data.seasons;
                            }
                        }
                    } catch(e) {}
                }
                tmdbCache[cacheKey] = topResult;
                saveDb();
              } else {
                autoFetchJob.failedItems.push({ name: item.name, path: catPath });
              }
              await delay(400); // Rate limit protection
            }
            autoFetchJob.count++;
          } catch (e) {
            console.error(`Failed to fetch tmdb for ${cleanName}`, e);
            autoFetchJob.failedItems.push({ name: item.name, path: catPath });
          }
        }
      };

      if (targetPath === appConfig.basePath || targetPath === '/home') {
        const listUrl = `${openlistUrl}/api/fs/list`;
        const homeRes = await axios.post(listUrl, { path: targetPath, password: "" }, { headers: { Authorization: token } });
        const categories = (homeRes.data?.data?.content || []).filter((c: any) => c.is_dir).map((c: any) => c.name);
        for (const cat of categories) {
          if (!autoFetchJob.isRunning) break;
          await scanCategory(`${targetPath === '/' ? '' : targetPath}/${cat}`, cat);
        }
      } else {
        const parts = targetPath.split('/').filter(Boolean);
        const catName = parts[parts.length - 1] || 'UNKNOWN';
        await scanCategory(targetPath, catName);
      }

      if (autoFetchJob.isRunning) {
        autoFetchJob.message = `Finished auto-fetching metadata for ${autoFetchJob.count} items!`;
      }
    } catch (e: any) {
      autoFetchJob.message = `Error during auto-fetch: ${e.message}`;
    } finally {
      autoFetchJob.isRunning = false;
    }
  };

  runAutoFetch();
  res.json({ success: true, message: 'Started' });
});

app.post('/api/meta/autofetch/stop', adminMiddleware, (req, res) => {
  autoFetchJob.isRunning = false;
  addLog("Autofetch Stopped", "Admin", "Stopped TMDB autofetch");
  autoFetchJob.message = 'Auto-fetch stopped.';
  res.json({ success: true, message: 'Stopped' });
});

// API: Gemini Chatbot

// API: Jellyfin Recently Added
app.get('/api/jellyfin/recently-added', cacheMiddleware(180, true), async (req, res) => {
  try {
    const force = req.query.force === 'true';
    if (force) {
      bumpMetaVersion();
    }
    let userToken = req.headers.authorization as string | undefined;
    if (userToken && userToken.startsWith('Bearer ')) userToken = userToken.substring(7);
    const getToken = () => process.env.OPENLIST_API_KEY || userToken;

    const items = await getRecentlyAdded(getOpenlistUrl, getToken, appConfig.basePath, force, jfOverrides);
    
    // Proactively fetch TMDB metadata for all recent items so they are instantly ready and cached
    const tmdbKey = process.env.TMDB_API_KEY;
    if (tmdbKey) {
        (async () => {
            let modified = false;
            for (const item of items) {
                try {
                    let searchName = item.name;
                    if (/^(s\d+|season\s*\d+)$/i.test(item.name)) {
                        const parentParts = item._parent.split('/').filter(Boolean);
                        if (parentParts.length > 0) {
                            searchName = parentParts[parentParts.length - 1];
                        }
                    }
                    
                    let cleanName = searchName.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i, "");
                    const yearRegex = /(?:^|[._\-\s\(])(19\d{2}|20\d{2})(?:[._\-\s\)]|$)/g;
                    let match;
                    let lastMatch = null;
                    while ((match = yearRegex.exec(cleanName)) !== null) {
                        lastMatch = match;
                    }
                    let year = '';
                    if (lastMatch) {
                        year = lastMatch[1];
                        cleanName = cleanName.substring(0, lastMatch.index);
                    }
                    cleanName = cleanName.replace(/[\(\[].*?[\)\]]/g, " ");
                    cleanName = cleanName.replace(/\b(720p|1080p|1080i|2160p|4k|8k|webdl|web-dl|webrip|hdrip|bluray|x264|x265|hevc|aac|dts|hdtv|remux)\b/gi, " ");
                    cleanName = cleanName.replace(/[._\-\s]+/g, " ").trim();
                    
                    const searchYear = item._jf?.year || year;
                    const type = item._cat || '';
                    
                    const baseQuery = cleanName.toLowerCase().trim();
                    const baseKey = `${type}-${baseQuery}`;
                    const cacheKey = `${type}-${baseQuery}${searchYear ? `-${searchYear}` : ''}`;
                    
                    const overriddenKey = findOverriddenKeyInCache(tmdbCache, type, baseQuery, searchYear);
                    if (overriddenKey || tmdbCache[cacheKey] !== undefined) {
                        continue; // Already cached or overridden
                    }
                    
                    // Fetch from TMDB
                    const typeStr = type.toUpperCase();
                    const searchType = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(typeStr) ? 'tv' : 'movie';
                    
                    let url = '';
                    if (item._jf?.tmdbId) {
                        url = `https://api.themoviedb.org/3/${searchType}/${item._jf.tmdbId}?api_key=${tmdbKey}`;
                    } else {
                        url = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(cleanName)}`;
                        if (searchYear) {
                            url += searchType === 'movie' ? `&primary_release_year=${searchYear}` : `&first_air_date_year=${searchYear}`;
                        }
                    }
                    
                    const itemPath = item.path || (item._parent ? `${item._parent}/${item.name}` : item.name);
                    const cleanItemPath = itemPath ? itemPath.replace(/^\/+/, '') : null;
                    const pKey1 = cleanItemPath ? `path-${cleanItemPath}` : null;
                    const pKey2 = cleanItemPath ? `path-/${cleanItemPath}` : null;

                    const setCacheKeys = async (dataObj: any) => {
                        if (dataObj && typeof dataObj === 'object') {
                            await attachFullDataToItem(dataObj, searchType, tmdbKey);
                            tmdbCache[cacheKey] = dataObj;
                            tmdbCache[baseKey] = dataObj;
                            if (pKey1) tmdbCache[pKey1] = dataObj;
                            if (pKey2) tmdbCache[pKey2] = dataObj;
                        } else {
                            tmdbCache[cacheKey] = dataObj;
                        }
                        modified = true;
                    };

                    let response = await axios.get(url);
                    if (item._jf?.tmdbId && response.data) {
                        const targetData = response.data.results ? response.data.results[0] || response.data : response.data;
                        await setCacheKeys(targetData);
                    } else if (response.data?.results?.length > 0) {
                        await setCacheKeys(response.data.results[0]);
                    } else if (searchYear) {
                        const noYearUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(cleanName)}`;
                        try {
                            const noYearRes = await axios.get(noYearUrl);
                            if (noYearRes.data?.results?.length > 0) {
                                await setCacheKeys(noYearRes.data.results[0]);
                            } else {
                                await setCacheKeys(null);
                            }
                        } catch(e) {
                            await setCacheKeys(null);
                        }
                    } else {
                        await setCacheKeys(null);
                    }
                } catch(e) {}
            }
            if (modified) saveDb();
        })();
    }
    
    res.json({ success: true, data: items });
  } catch (error: any) {
    console.error('[Jellyfin API Error]', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });
    const chat = ai.chats.create({
      model: 'gemini-3.5-flash',
      config: {
        systemInstruction: "You are SHUTTER!'s helpful assistant. You help users find movies, series, anime, and answer questions about the platform.",
      },
      history: history || [] // Format expected by GenAI? Actually history is passed to create() differently. We will just pass full content in generateContent if chat is hard to reconstruct.
    });
    
    const response = await chat.sendMessage({ message });
    res.json({ text: response.text });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Failed to chat' });
  }
});


let jfOverrides: Record<string, any> = {};

export async function initSQLiteState() {
  try {
    await initSQLiteDB();
    await initJellyfinCache().catch(e => console.error("Error init Jellyfin cache:", e));
    const loadedConfig = await readSQLiteJSON('config');
    if (loadedConfig) appConfig = { ...appConfig, ...loadedConfig };
    tmdbCache = (await readSQLiteJSON('db')) || {};
    if (!tmdbCache || Object.keys(tmdbCache).length === 0) {
      try {
        const dbJsonPath = path.join(process.cwd(), 'data', 'db.json');
        const altJsonPath = path.join(process.cwd(), 'db.json');
        const p = fs.existsSync(dbJsonPath) ? dbJsonPath : (fs.existsSync(altJsonPath) ? altJsonPath : null);
        if (p) {
          const raw = fs.readFileSync(p, 'utf8').trim();
          if (raw) {
            tmdbCache = JSON.parse(raw);
            await writeSQLiteJSON('db', tmdbCache);
          }
        }
      } catch (e) {
        console.error('Error fallback loading db.json:', e);
      }
    }
    if (tmdbCache && typeof tmdbCache === 'object') {
      let cleanedBadKeys = false;
      for (const k of Object.keys(tmdbCache)) {
        // --- CLEANUP OF OLD BAD OVERRIDES ---
        if (k.startsWith('path-')) {
          const p = k.replace('path-', '');
          if (isGenericCategoryRoot(p)) {
            console.log('Auto-cleaning bad broad path override at startup:', k);
            delete tmdbCache[k];
            cleanedBadKeys = true;
            continue;
          }
        }
        // ------------------------------------
        
        const item = tmdbCache[k];
        if (item && item._overridden) {
          item._synced = true;
          // If this key has a year suffix (e.g. MOVIE-title-2023), ensure baseKey (MOVIE-title) also exists
          const yearMatch = k.match(/^(.*)-(\d{4})$/);
          if (yearMatch) {
            const baseK = yearMatch[1];
            if (!tmdbCache[baseK]) {
              tmdbCache[baseK] = item;
            }
          }
        }
      }
      
      if (cleanedBadKeys) {
        await writeSQLiteJSON('db', tmdbCache);
      }
    }
    const loadedLibrary = await readSQLiteJSON('library_index');
    if (loadedLibrary) {
      libraryIndex = loadedLibrary.items || [];
      libraryIndexLastUpdated = loadedLibrary.lastUpdated || 0;
    }
    userExpirations = (await readSQLiteJSON('users_expirations')) || {};
    activityLogs = (await readSQLiteJSON('activity_logs')) || [];
    genreBackdropsCache = (await readSQLiteJSON('genre_backdrops_cache')) || null;
    jfOverrides = (await readSQLiteJSON('jf_override')) || {};
    downloadTracker = (await readSQLiteJSON('download_tracker')) || {};
    tmdbSeasonCache = (await readSQLiteJSON('tmdb_season_cache')) || {};
    activeUserSessions = (await readSQLiteJSON('active_user_sessions')) || {};
    const savedInvalidated = (await readSQLiteJSON('invalidated_tokens')) || [];
    savedInvalidated.forEach((t: string) => invalidatedTokens.add(t));
  } catch (err) {
    console.error("Error during initSQLiteState:", err);
  }
}

// Attach the routes that were in startServer to the app globally
app.post('/api/jellyfin/override', adminMiddleware, async (req, res) => {
    let token = req.headers.authorization;
    if (isValidGuest(token || '')) return res.status(401).json({ error: 'Unauthorized' });
    
    const { jfName, openlistPath, category, year } = req.body;
    if (!jfName) return res.status(400).json({ error: 'Missing name' });
    
    jfOverrides[jfName] = { openlistPath, category, year };
    await writeSQLiteJSON('jf_override', jfOverrides);
    addLog("Jellyfin Override", "Admin", `Set override for ${jfName} to ${openlistPath}`);
    
    bumpMetaVersion();
    res.json({ success: true, overrides: jfOverrides });
});

app.get('/api/jellyfin/overrides', adminMiddleware, (req, res) => {
    res.json(jfOverrides);
});

async function startServer() {
  console.log(`[Server Startup] Starting initialization in ${process.env.NODE_ENV || 'development'} mode...`);
  const memStart = process.memoryUsage();
  console.log(`[Server Memory] Initial RSS: ${(memStart.rss / 1024 / 1024).toFixed(2)} MB | Heap Used: ${(memStart.heapUsed / 1024 / 1024).toFixed(2)} MB`);

  try {
    const v8 = await import('v8');
    const stats = v8.getHeapStatistics();
    const maxHeapMB = stats.heap_size_limit / 1024 / 1024;
    const usedHeapMB = stats.used_heap_size / 1024 / 1024;
    const availableHeapMB = maxHeapMB - usedHeapMB;

    if (availableHeapMB < 100) {
      console.error(`[FATAL] Insufficient heap memory for safe database initialization. Available: ${availableHeapMB.toFixed(2)} MB, Required: 100 MB. Try increasing --max-old-space-size`);
      process.exit(1);
    }
    console.log(`[Server Memory] Safe to initialize DB. Available Heap: ${availableHeapMB.toFixed(2)} MB`);

    console.log('[Server Startup] Step 1/3: Initializing SQLite database and state...');
    await initSQLiteState();
    const memPostDb = process.memoryUsage();
    console.log(`[Server Startup] Step 1/3 Complete. Heap Used: ${(memPostDb.heapUsed / 1024 / 1024).toFixed(2)} MB`);

    const isProd = process.env.NODE_ENV === "production" || _filename.endsWith('.cjs');
    if (!isProd) {
      console.log('[Server Startup] Step 2/3: Mounting Vite development server middleware...');
      const viteModule = 'vite';
      const { createServer: createViteServer } = await import(viteModule);
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });

      app.use(async (req, res, next) => {
        const isHtmlRequest = req.method === 'GET' && 
          !req.path.startsWith('/api') && 
          !req.path.startsWith('/@') && 
          !req.path.startsWith('/src') && 
          !req.path.startsWith('/node_modules') &&
          !/\.[a-zA-Z0-9]+$/.test(req.path);

        if (isHtmlRequest) {
          try {
            let template = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
            template = await vite.transformIndexHtml(req.originalUrl, template);
            const hostUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
            const ogMeta = await getOgMetadataForUrl(req.originalUrl, hostUrl, tmdbCache);
            const finalHtml = injectOgTags(template, ogMeta);
            return res.status(200).set({ 'Content-Type': 'text/html' }).send(finalHtml);
          } catch (e: any) {
            vite.ssrFixStacktrace(e);
            next(e);
            return;
          }
        }
        next();
      });

      app.use(vite.middlewares);
    } else {
      console.log('[Server Startup] Step 2/3: Configuring static file routes for production...');
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath, { index: false }));
      app.get('*', async (req, res) => {
        try {
          const templatePath = path.join(distPath, 'index.html');
          if (fs.existsSync(templatePath)) {
            let template = fs.readFileSync(templatePath, 'utf-8');
            const hostUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
            const ogMeta = await getOgMetadataForUrl(req.originalUrl, hostUrl, tmdbCache);
            const finalHtml = injectOgTags(template, ogMeta);
            return res.status(200).set({ 'Content-Type': 'text/html' }).send(finalHtml);
          }
        } catch (e) {}
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    const isWorker = typeof (globalThis as any).WebSocketPair !== 'undefined';
    if (!isWorker && process.env.BUILDING_FOR_WORKER !== 'true') {
      console.log(`[Server Startup] Step 3/3: Binding HTTP listener to port ${PORT}...`);
      const serverInstance = app.listen(PORT, "0.0.0.0", () => {
        console.log(`[Server Ready] Express server successfully listening on http://0.0.0.0:${PORT}`);
      });
      serverInstance.on('error', (err) => {
        console.error('[Server Error] HTTP server encountered an error:', err);
      });
    }
  } catch (startupError) {
    console.error('[Server Startup Fatal Error] Failed to start server:', startupError);
    process.exit(1);
  }
}

export { app };

const isWorkerEnv = typeof (globalThis as any).WebSocketPair !== 'undefined';
if (!isWorkerEnv && process.env.BUILDING_FOR_WORKER !== 'true') {
  startServer();
}
