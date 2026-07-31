import 'dotenv/config';
import express from 'express';
import { getRecentlyAdded, getLocalItems, initJellyfinCache } from './jellyfin';
import { getOgMetadataForUrl, injectOgTags } from './og_meta';

import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { createRequire } from 'module';
import { readSQLiteJSON, writeSQLiteJSON, initSQLiteDB } from './sqlite_db';

const _require = typeof require !== 'undefined' ? require : createRequire(import.meta.url);
const _filename = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const _dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(_filename);





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
      if (res.statusCode >= 200 && res.statusCode < 300) {
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
const PORT = Number(process.env.SERVER_PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
let appConfig = {
  openlistUrl: process.env.OPENLIST_SERVER_URL || 'https://fox.oplist.org',
  basePath: '/home',
  inactivityTimeout: 0
};


// Ensure env variables take precedence over saved config if provided
const getOpenlistUrl = () => process.env.OPENLIST_SERVER_URL || appConfig.openlistUrl;
const getOpenlistApiKey = () => process.env.OPENLIST_API_KEY;

const adminRoleCache = new Map<string, { role: number, expiry: number }>();

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
    const response = await axios.get(url, { headers: { Authorization: token } });
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
let tmdbCache: Record<string, any> = {};
async function saveDb() {
  await writeSQLiteJSON('db', tmdbCache);
}


// Library Index Cache for fast genre searching
let libraryIndex: any[] = [];
let libraryIndexLastUpdated = 0;


async function saveLibraryIndex() {
  await writeSQLiteJSON('library_index', { items: libraryIndex, lastUpdated: libraryIndexLastUpdated });


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
            const res = await axios.post(`${openlistUrl}/api/fs/list`, { path: appConfig.basePath, password: "" }, { headers: { Authorization: token } });
            if (res.data.code !== 200) return libraryIndex;
            const dirs = (res.data.data?.content || []).filter((c: any) => c.is_dir).map((c: any) => c.name);
            
            const catData = await Promise.all(dirs.map(async (dir: string) => {
                try {
                    const subRes = await axios.post(`${openlistUrl}/api/fs/list`, { path: `${appConfig.basePath}/${dir}`, password: "" }, { headers: { Authorization: token } });
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
                    allItems.push({ ...item, category: c.name, cleanName, year });
                }
            }
            
            if (allItems.length > 0) {
                libraryIndex = allItems;
                libraryIndexLastUpdated = Date.now();
                saveLibraryIndex();
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

    await writeSQLiteJSON('download_tracker', downloadTracker);

    res.json({ success: true, item: downloadTracker[key] });
  } catch (err: any) {
    console.error('Error tracking download:', err);
    res.status(500).json({ error: 'Internal server error' });
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
    await writeSQLiteJSON('download_tracker', downloadTracker);
    res.json({ success: true, message: 'Download tracking history cleared' });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/watchlist', async (req, res) => {
  const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  res.json(await loadUserWatchlist(user));
});

app.post('/api/watchlist/toggle', async (req, res) => {
  const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  
  const { item, category, parentPath } = req.body;
  const list = await loadUserWatchlist(user);
  
  const existingIndex = list.findIndex(i => i.item.name === item.name && i.parentPath === parentPath);
  
  if (existingIndex >= 0) {
    list.splice(existingIndex, 1);
  } else {
    list.push({ item, category, parentPath });
  }
  
  await saveUserWatchlist(user, list);
  res.json({ success: true, watchlist: list, added: existingIndex < 0 });
});

app.get('/api/watchlist/check', async (req, res) => {
  const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
  const { name, parentPath } = req.query;
  if (!user || !name || !parentPath) return res.json({ inWatchlist: false });
  const list = await loadUserWatchlist(user);
  const exists = list.some(i => i.item.name === name && i.parentPath === parentPath);
  res.json({ inWatchlist: exists });
});

app.get('/api/watched', async (req, res) => {
  const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  res.json(await loadUserWatched(user));
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
      if (!tmdbId) {
          const { cleanName, year } = parseMediaName(w.item.name);
          const cacheKey = `${w.category}-${cleanName.toLowerCase()}${year ? `-${year}` : ''}`;
          const baseKey = `${w.category}-${cleanName.toLowerCase()}`;
          let cached = tmdbCache[cacheKey] || tmdbCache[baseKey];
          if (!cached) {
               const overriddenKey = Object.keys(tmdbCache).find(k => k.startsWith(baseKey) && tmdbCache[k]?._overridden);
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
      } catch (e) {
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
      } else {
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
});

// API: Config
app.get('/api/config', (req, res) => {
  res.json({
    openlistUrl: getOpenlistUrl(),
    basePath: appConfig.basePath,
    inactivityTimeout: appConfig.inactivityTimeout || 0
  });
});
app.post('/api/config', adminMiddleware, (req, res) => {
  if (req.body.openlistUrl !== undefined) appConfig.openlistUrl = req.body.openlistUrl;
  if (req.body.basePath !== undefined) appConfig.basePath = req.body.basePath;
  if (req.body.inactivityTimeout !== undefined) appConfig.inactivityTimeout = Number(req.body.inactivityTimeout) || 0;
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
  getRecentlyAdded(getOpenlistUrl, getOpenlistApiKey, appConfig.basePath, false).catch((err) => {
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
      
      const overriddenKey = Object.keys(tmdbCache).find(k => k.startsWith(baseKey) && tmdbCache[k]?._overridden);
      
      if (!overriddenKey && !tmdbCache[cacheKey] && !tmdbCache[baseKey] && tmdbCache[cacheKey] !== null) {
          let searchType = 'multi';
          const typeLower = type.toLowerCase();
          if (typeLower.includes('movie')) searchType = 'movie';
          else if (typeLower.includes('show') || typeLower.includes('series') || typeLower.includes('anime')) searchType = 'tv';
          
          let url = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(item.cleanName)}`;
          if (year && searchType === 'movie') url += `&primary_release_year=${year}`;
          else if (year && searchType === 'tv') url += `&first_air_date_year=${year}`;
          
          try {
             const response = await axios.get(url);
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
      await writeSQLiteJSON('db', tmdbCache);
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

app.get('/api/admin/logs', adminMiddleware, (req, res) => {
  res.json(activityLogs);
});

app.post('/api/admin/log', adminMiddleware, async (req, res) => {
  const { action, username, details } = req.body;
  addLog(action, username || 'System/Admin', details);
  res.json({ success: true });
});

app.get('/api/admin/diagnostic', adminMiddleware, async (req, res) => {
  const result: any = {
    sqliteFileAccessible: false,
    sqliteDbQueryable: false,
    dbPath: path.join(process.cwd(), 'data', 'shindex.db'),
    dbUrl: process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || ('file:' + path.join(process.cwd(), 'data', 'shindex.db')),
    env: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      TURSO_DATABASE_URL: !!process.env.TURSO_DATABASE_URL,
    }
  };

  try {
    if (!result.dbUrl.startsWith('libsql://') && !result.dbUrl.startsWith('https://')) {
        const actualPath = result.dbUrl.replace('file:', '');
        result.sqliteFileAccessible = fs.existsSync(actualPath);
        if (result.sqliteFileAccessible) {
          const stats = fs.statSync(actualPath);
          result.fileStats = { size: stats.size, mtime: stats.mtime };
        }
    } else {
        result.sqliteFileAccessible = true;
    }
  } catch (e: any) {
    result.sqliteFileAccessibleError = e.message;
  }

  try {
    const { sqliteDb } = require('./sqlite_db');
    const rs = await sqliteDb.execute('SELECT count(*) as count FROM kv_store');
    result.sqliteDbQueryable = true;
    result.kvStoreCount = rs.rows[0].count;
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
    const response = await axios.post(url, { username, password });
    
    if (response.data.code === 200) {
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
      { path: '/', password: '' },
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
    const response = await axios.get(url, {
      headers: { Authorization: token }
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Failed to verify auth' });
  }
});

// API: Openlist Proxy - FS List
app.post('/api/fs/list', cacheMiddleware(300, true), async (req, res) => {
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
    const payload: any = { path: reqPath, password: "" };
    if (refresh) payload.refresh = true;



    const response = await axios.post(url, payload, {
      headers: { Authorization: token }
    });
    


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
    const response = await axios.post(url, { path: reqPath, password: "" }, {
      headers: { Authorization: token }
    });
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
    const response = await axios.post(url, { names, dir }, {
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
          const seen = new Set(content.map((item: any) => item.path || item.name));
          for (const item of content2) {
             if (!seen.has(item.path || item.name)) {
                 content.push(item);
                 seen.add(item.path || item.name);
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
          const seen = new Set(content.map((item: any) => item.path || item.name));
          for (const item of content3) {
             if (!seen.has(item.path || item.name)) {
                 content.push(item);
                 seen.add(item.path || item.name);
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
          const keysByCategory: Record<string, Set<string>> = {};
          for (const key of matchingKeys) {
            const catMatch = key.match(/^([^-]+)-/);
            if (catMatch) {
               const cat = catMatch[1];
               if (!keysByCategory[cat]) keysByCategory[cat] = new Set();
               keysByCategory[cat].add(key);
            }
          }

          const listUrl = `${getOpenlistUrl().replace(/\/$/, '')}/api/fs/list`;
          for (const cat of Object.keys(keysByCategory)) {
             try {
                const listRes = await axios.post(listUrl, { path: `/home/${cat}`, password: "" }, { headers: { Authorization: token }});
                if (listRes.data && listRes.data.code === 200 && listRes.data.data && listRes.data.data.content) {
                   const items = listRes.data.data.content;
                   for (const item of items) {
                      const parsed = parseMediaName(item.name);
                      const itemCacheKey = `${cat}-${parsed.cleanName.toLowerCase()}${parsed.year ? `-${parsed.year}` : ''}`;
                      if (keysByCategory[cat].has(itemCacheKey)) {
                         const fullPath = `/home/${cat}`;
                         const exists = content.some((c: any) => c.name === item.name && c.parent === fullPath);
                         if (!exists) {
                            content.push({
                               name: item.name,
                               parent: fullPath,
                               is_dir: item.is_dir,
                               size: item.size
                            });
                         }
                      }
                   }
                }
             } catch (e) {
                // silently ignore list errors
             }
          }
        }
      }
    } catch (e) {
       console.error("TMDB Cache search error", e);
    }

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
    let searchType = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(typeStr) ? 'tv' : 'movie';
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
    const response = await axios.get(url);
    
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
    
    const overriddenKey = Object.keys(tmdbCache).find(k => k.startsWith(baseKey) && tmdbCache[k]?._overridden);
    if (overriddenKey) {
      results[originalName] = tmdbCache[overriddenKey];
    } else {
      const cacheKey = `${type}-${baseQuery}${year ? `-${year}` : ''}`;
      if (tmdbCache[cacheKey]) {
        results[originalName] = tmdbCache[cacheKey];
      } else if (year && tmdbCache[baseKey]) {
        results[originalName] = tmdbCache[baseKey];
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
        
        const response = await axios.get(url);
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
           tmdbCache[item.cacheKey] = data.results[0];
           results[item.originalName] = data.results[0];
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

app.get('/api/meta/search', cacheMiddleware(3600, true), async (req, res) => {
  const { query, type, year, tmdbId } = req.query; // type can be 'movie' or 'tv'
  if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Query required' });
  
  const baseQuery = query.toLowerCase().trim();
  const baseKey = `${type}-${baseQuery}`;
  
  // ALWAYS prioritize manually overridden items
  const overriddenKey = Object.keys(tmdbCache).find(k => k.startsWith(baseKey) && tmdbCache[k]?._overridden);
  if (overriddenKey) {
    return res.json(tmdbCache[overriddenKey]);
  }

  const cacheKey = `${type}-${baseQuery}${year ? `-${year}` : ''}`;
  
  if (tmdbCache[cacheKey]) {
    return res.json(tmdbCache[cacheKey]);
  }
  
  // If we searched with a year and it was null/undefined, try to find a cached entry WITHOUT the year
  if (year && tmdbCache[baseKey]) {
      return res.json(tmdbCache[baseKey]);
  }

  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) {
    return res.json(null);
  }

  try {
    const typeStr = (type as string || '').toUpperCase();
    const searchType = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(typeStr) ? 'tv' : 'movie';
    
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
            const response = await axios.get(url);
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
        }
      } catch(e) {}
    }
    
    if (data.results && data.results.length > 0) {
       tmdbCache[cacheKey] = data.results[0];
       saveDb();
       return res.json(data.results[0]);
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
    const response = await axios.get(`https://api.themoviedb.org/3/${searchType}/${id}/videos?api_key=${tmdbKey}`);
    res.json(response.data);
  } catch (err: any) {
    res.json(null);
  }
});

app.get('/api/meta/tv_details', cacheMiddleware(3600, true), async (req, res) => {
  const { tvId } = req.query;
  if (!tvId) return res.status(400).json({ error: 'tvId required' });
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) return res.json(null);

  try {
    const response = await axios.get(`https://api.themoviedb.org/3/tv/${tvId}?api_key=${tmdbKey}`);
    res.json(response.data);
  } catch (err: any) {
    res.json(null);
  }
});

app.get('/api/meta/tv_season', cacheMiddleware(3600, true), async (req, res) => {
  const { tvId, season } = req.query;
  if (!tvId || !season) return res.status(400).json({ error: 'tvId and season required' });
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) return res.json(null);

  try {
    const response = await axios.get(`https://api.themoviedb.org/3/tv/${tvId}/season/${season}?api_key=${tmdbKey}`);
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
     const overriddenKey = overriddenKeys.find(k => k.startsWith(baseKey));
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
  try {
     await writeSQLiteJSON('genre_backdrops_cache', genreBackdropsCache);
  } catch (e) {}

  res.json({ success: true, genres: genreBackdrops });
});

app.get('/api/meta/genre/:genreId', async (req, res) => {
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
     
     const overriddenKey = Object.keys(tmdbCache).find(k => k.startsWith(baseKey) && tmdbCache[k]?._overridden);
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
});

app.get('/api/meta/trending', cacheMiddleware(3600, true), async (req, res) => {
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) return res.json({ results: [] });
  
  try {
    const url = `https://api.themoviedb.org/3/trending/all/day?api_key=${tmdbKey}`;
    const response = await axios.get(url);
    res.json(response.data);
  } catch (error: any) {
    console.error('TMDB Trending Error', error.message);
    res.json({ results: [] });
  }
});

// Admin correction for TMDB
app.post('/api/meta/correct', adminMiddleware, (req, res) => {
  const { query, type, year, data } = req.body;
  if (!query || !data) return res.status(400).json({ error: 'Invalid data' });
  const cacheKey = `${type}-${query.toLowerCase().trim()}${year ? `-${year}` : ''}`;
  const baseKey = `${type}-${query.toLowerCase().trim()}`;
  data._overridden = true;
  tmdbCache[cacheKey] = data;
  tmdbCache[baseKey] = data;
  apiCache.clear();
  saveDb();
  addLog('TMDB Corrected', 'Admin', `Corrected TMDB data for query: ${query} (Type: ${type})`);
  res.json({ success: true, data });
});

// Admin override for TMDB by ID
app.post('/api/meta/override', adminMiddleware, async (req, res) => {
  const { query, type, year, tmdbId, customTitle } = req.body;
  if (!query || (!tmdbId && !customTitle)) return res.status(400).json({ error: 'Invalid data' });
  
  try {
    const cacheKey = `${type}-${query.toLowerCase().trim()}${year ? `-${year}` : ''}`;
    const baseKey = `${type}-${query.toLowerCase().trim()}`;

    // Clear server response cache so all GET queries get fresh data immediately
    apiCache.clear();

    if (customTitle && !tmdbId) {
      // Just override title in existing cache or create a mock
      let data = tmdbCache[cacheKey] || {};
      data.title = customTitle;
      data.name = customTitle; // tv uses name
      data._overridden = true;
      tmdbCache[cacheKey] = data;
      tmdbCache[baseKey] = data;
      for (const key of Object.keys(tmdbCache)) {
           if (key.startsWith(baseKey) || key.includes(query.toLowerCase().trim())) {
               tmdbCache[key] = data;
           }
      }
      saveDb();
      addLog('TMDB Overridden', 'Admin', `Overrode TMDB data for query: ${query} (Custom title: ${customTitle})`);
      return res.json({ success: true, data });
    }

    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) return res.status(500).json({ error: 'TMDB Key missing' });

    const typeStr = (type as string || '').toUpperCase();
    const primaryType = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(typeStr) ? 'tv' : 'movie';
    const secondaryType = primaryType === 'tv' ? 'movie' : 'tv';
    
    let data = null;
    try {
      const response = await axios.get(`https://api.themoviedb.org/3/${primaryType}/${tmdbId}?api_key=${tmdbKey}`);
      data = response.data;
    } catch (e) {
      try {
        const response = await axios.get(`https://api.themoviedb.org/3/${secondaryType}/${tmdbId}?api_key=${tmdbKey}`);
        data = response.data;
      } catch (e2) {
        return res.status(404).json({ error: 'Not found on TMDB' });
      }
    }
    
    if (data) {
       if (customTitle) {
         data.title = customTitle;
         data.name = customTitle;
       }
       data._overridden = true;
       tmdbCache[cacheKey] = data;
       tmdbCache[baseKey] = data;
       for (const key of Object.keys(tmdbCache)) {
           if (key.startsWith(baseKey) || key.includes(query.toLowerCase().trim())) {
               tmdbCache[key] = data;
           }
       }
       saveDb();
       addLog('TMDB Overridden', 'Admin', `Overrode TMDB data for query: ${query} with ID: ${tmdbId}`);
       return res.json({ success: true, data });
    }
    res.status(404).json({ error: 'Not found' });
  } catch (error: any) {
    console.error('TMDB Override Error', error.message);
    res.status(500).json({ error: 'TMDB fetch failed' });
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
  collectionScanJob.message = 'Starting collection scan...';
  collectionScanJob.count = 0;
  
  (async () => {
    try {
      const keys = Object.keys(tmdbCache).filter(k => k.startsWith('movie-') || (tmdbCache[k] && tmdbCache[k].title));
      collectionScanJob.total = keys.length;
      
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
      
      if (modified) saveDb();
      collectionScanJob.message = `Finished collection scan. Processed ${collectionScanJob.count} items.`;
    } catch(e) {
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
              const response = await axios.get(url);
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
                tmdbCache[cacheKey] = data.results[0];
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
      apiCache.clear();
    }
    let userToken = req.headers.authorization as string | undefined;
    if (userToken && userToken.startsWith('Bearer ')) userToken = userToken.substring(7);
    const getToken = () => process.env.OPENLIST_API_KEY || userToken;

    const items = await getRecentlyAdded(getOpenlistUrl, getToken, appConfig.basePath, force);
    
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
                    
                    const overriddenKey = Object.keys(tmdbCache).find(k => k.startsWith(baseKey) && tmdbCache[k]?._overridden);
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
                    
                    const response = await axios.get(url);
                    if (item._jf?.tmdbId && response.data) {
                        tmdbCache[cacheKey] = response.data.results ? response.data.results[0] || response.data : response.data;
                        modified = true;
                    } else if (response.data?.results?.length > 0) {
                        tmdbCache[cacheKey] = response.data.results[0];
                        modified = true;
                    } else if (searchYear) {
                        const noYearUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(cleanName)}`;
                        try {
                            const noYearRes = await axios.get(noYearUrl);
                            if (noYearRes.data?.results?.length > 0) {
                                tmdbCache[cacheKey] = noYearRes.data.results[0];
                                modified = true;
                            } else {
                                tmdbCache[cacheKey] = null;
                                modified = true;
                            }
                        } catch(e) {
                            tmdbCache[cacheKey] = null;
                            modified = true;
                        }
                    } else {
                        tmdbCache[cacheKey] = null;
                        modified = true;
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
  await initSQLiteDB();
  await initJellyfinCache();
  const loadedConfig = await readSQLiteJSON('config');
  if (loadedConfig) appConfig = { ...appConfig, ...loadedConfig };
  tmdbCache = (await readSQLiteJSON('db')) || {};
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
    
    apiCache.clear();
    res.json({ success: true, overrides: jfOverrides });
});

app.get('/api/jellyfin/overrides', adminMiddleware, (req, res) => {
    res.json(jfOverrides);
});

async function startServer() {
  await initSQLiteState();

  const isProd = process.env.NODE_ENV === "production" || _filename.endsWith('.cjs');
  if (!isProd) {
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
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

export { app };

const isWorkerEnv = typeof (globalThis as any).WebSocketPair !== 'undefined';
if (!isWorkerEnv && process.env.BUILDING_FOR_WORKER !== 'true') {
  startServer();
}
