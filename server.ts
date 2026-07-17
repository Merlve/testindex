import express from 'express';
import { getRecentlyAdded } from './jellyfin';

import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { createRequire } from 'module';

const _require = typeof require !== 'undefined' ? require : createRequire(import.meta.url);
const _filename = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const _dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(_filename);


const app = express();
const PORT = Number(process.env.SERVER_PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Simple file-based config storage
const configPath = path.join(process.cwd(), 'config.json');
let appConfig = {
  openlistUrl: process.env.OPENLIST_SERVER_URL || 'https://fox.oplist.org',
  basePath: '/home'
};
try {
  if (fs.existsSync(configPath)) {
    if (fs.statSync(configPath).isFile()) {
      const loaded = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      appConfig = { ...appConfig, ...loaded };
      console.log(`[STARTUP] Successfully loaded config from ${configPath}`);
    } else {
      console.warn(`[STARTUP] Warning: ${configPath} exists but is not a file.`);
    }
  } else {
    console.log(`[STARTUP] No config file found at ${configPath}, using defaults.`);
  }
} catch (e) {
  console.error(`[STARTUP ERROR] Failed to read or parse config from ${configPath}:`, e);
}

// Ensure env variables take precedence over saved config if provided
const getOpenlistUrl = () => process.env.OPENLIST_SERVER_URL || appConfig.openlistUrl;
const getOpenlistApiKey = () => process.env.OPENLIST_API_KEY;


function parseMediaName(rawName: string) {
  let cleanName = rawName.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i, "");
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
  return { cleanName, year };
}

function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2));
}

// Simple JSON DB for TMDB corrections
const dbPath = path.join(process.cwd(), 'db.json');
let tmdbCache: Record<string, any> = {};
try {
  if (fs.existsSync(dbPath)) {
    if (fs.statSync(dbPath).isFile()) {
      tmdbCache = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      console.log(`[STARTUP] Successfully loaded TMDB cache from ${dbPath}`);
    } else {
      console.warn(`[STARTUP] Warning: ${dbPath} exists but is not a file.`);
    }
  } else {
    console.log(`[STARTUP] No TMDB cache DB found at ${dbPath}, starting fresh.`);
  }
} catch (e) {
  console.error(`[STARTUP ERROR] Failed to read or parse DB from ${dbPath}:`, e);
}
function saveDb() {
  try { fs.writeFileSync(dbPath, JSON.stringify(tmdbCache, null, 2)); } catch (e) { console.error("Db write error", e); }
}


// Watchlists storage
const watchlistsDir = path.join(process.cwd(), 'watchlists');
if (!fs.existsSync(watchlistsDir)) {
  try {
    fs.mkdirSync(watchlistsDir, { recursive: true });
    console.log(`[STARTUP] Created watchlists directory at ${watchlistsDir}`);
  } catch (e) {
    console.error(`[STARTUP ERROR] Failed to create watchlists directory:`, e);
  }
}

function getUserWatchlistPath(user: string) {
  // Sanitize username to prevent path traversal
  const safeUser = user.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(watchlistsDir, `${safeUser}.json`);
}

function loadUserWatchlist(user: string): any[] {
  const filePath = getUserWatchlistPath(user);
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.error(`Error loading watchlist for user ${user}:`, e);
  }
  return [];
}

function saveUserWatchlist(user: string, list: any[]) {
  const filePath = getUserWatchlistPath(user);
  try {
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error(`Error saving watchlist for user ${user}:`, e);
  }
}

app.get('/api/watchlist', (req, res) => {
  const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  res.json(loadUserWatchlist(user));
});

app.post('/api/watchlist/toggle', (req, res) => {
  const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  
  const { item, category, parentPath } = req.body;
  const list = loadUserWatchlist(user);
  
  const existingIndex = list.findIndex(i => i.item.name === item.name && i.parentPath === parentPath);
  
  if (existingIndex >= 0) {
    list.splice(existingIndex, 1);
  } else {
    list.push({ item, category, parentPath });
  }
  
  saveUserWatchlist(user, list);
  res.json({ success: true, watchlist: list, added: existingIndex < 0 });
});

app.get('/api/watchlist/check', (req, res) => {
  const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
  const { name, parentPath } = req.query;
  if (!user || !name || !parentPath) return res.json({ inWatchlist: false });
  const list = loadUserWatchlist(user);
  const exists = list.some(i => i.item.name === name && i.parentPath === parentPath);
  res.json({ inWatchlist: exists });
});

// API: Config
app.get('/api/config', (req, res) => {
  res.json({
    openlistUrl: getOpenlistUrl(),
    basePath: appConfig.basePath
  });
});
app.post('/api/config', (req, res) => {
  if (req.body.openlistUrl) appConfig.openlistUrl = req.body.openlistUrl;
  if (req.body.basePath) appConfig.basePath = req.body.basePath;
  saveConfig();
  addLog('Config Updated', 'Admin', 'Updated application configuration settings.');
  res.json({ success: true, config: appConfig });
});


// --- User Expirations ---
const expirationsFile = path.join(process.cwd(), 'users_expirations.json');
let userExpirations: Record<string, string> = {};
if (fs.existsSync(expirationsFile)) {
  try {
    userExpirations = JSON.parse(fs.readFileSync(expirationsFile, 'utf-8'));
  } catch(e) {}
}

app.get('/api/users/expirations', (req, res) => {
  res.json(userExpirations);
});

app.post('/api/users/expirations', (req, res) => {
  const { userId, expirationDate } = req.body;
  if (userId === undefined || userId === null) return res.status(400).json({ error: 'Missing userId' });
  
  if (expirationDate) {
    userExpirations[userId] = expirationDate;
  } else {
    delete userExpirations[userId];
  }
  fs.writeFileSync(expirationsFile, JSON.stringify(userExpirations, null, 2));
  addLog('User Expiration Set', 'Admin', `Set expiration for user ${userId} to ${expirationDate || 'none'}`);
  res.json({ success: true });
});

// Expiration checking job (runs every minute to disable expired users)
setInterval(async () => {
  try {
    const adminToken = process.env.OPENLIST_API_KEY;
    if (!adminToken) return;

    const targetUrl = `${getOpenlistUrl().replace(/\/$/, '')}/api/admin/user/list`;
    const listRes = await axios.get(targetUrl, { headers: { Authorization: adminToken } });
    const users = listRes.data?.data?.content || [];
    
    const now = new Date();

    for (const user of users) {
      const expDateStr = userExpirations[user.id];
      if (expDateStr && !user.disabled) {
        const expDate = new Date(expDateStr);
        if (expDate <= now) {
          console.log(`[CRON] Disabling user ${user.username} as their expiration date ${expDateStr} has been reached.`);
          const updateUrl = `${getOpenlistUrl().replace(/\/$/, '')}/api/admin/user/update`;
          await axios.post(updateUrl, {
            ...user,
            disabled: true
          }, { headers: { Authorization: adminToken } });
          addLog('cron_disable', 'System/Cron', `User ${user.username} was disabled automatically. Expired: ${expDateStr}`);
          
          delete userExpirations[user.id];
          fs.writeFileSync(expirationsFile, JSON.stringify(userExpirations, null, 2));
        }
      }
    }
  } catch (e) {
    console.error('[CRON Error checking user expirations]:', e);
  }
}, 60 * 1000); // Check every minute
// ------------------------

// --- Activity Logs ---
const logsFile = path.join(process.cwd(), 'activity_logs.json');
let activityLogs: any[] = [];
if (fs.existsSync(logsFile)) {
  try {
    activityLogs = JSON.parse(fs.readFileSync(logsFile, 'utf-8'));
  } catch(e) {}
}

function addLog(action: string, username: string, details: string) {
  const log = { id: Date.now().toString(), timestamp: new Date().toISOString(), action, username, details };
  activityLogs.unshift(log); // newest first
  if (activityLogs.length > 500) activityLogs = activityLogs.slice(0, 500);
  fs.writeFileSync(logsFile, JSON.stringify(activityLogs, null, 2));
}

app.get('/api/admin/logs', (req, res) => {
  res.json(activityLogs);
});

app.post('/api/admin/log', (req, res) => {
  const { action, username, details } = req.body;
  addLog(action, username || 'System/Admin', details);
  res.json({ success: true });
});

// API: Openlist Proxy - Admin
app.all('/api/admin/*', async (req, res) => {
  try {
    const targetUrl = `${getOpenlistUrl().replace(/\/$/, '')}${req.originalUrl}`;
    const token = req.headers.authorization;
    const response = await axios({
      method: req.method as any,
      url: targetUrl,
      data: req.body,
      headers: { Authorization: token || '' }
    });
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && response.data?.code === 200) {
      let action = 'Admin Action';
      let details = `Endpoint: ${req.originalUrl}`;
      if (req.originalUrl.includes('/user/update')) action = 'User Updated';
      else if (req.originalUrl.includes('/user/create')) action = 'User Created';
      else if (req.originalUrl.includes('/user/delete')) action = 'User Deleted';
      
      addLog(action, 'Admin', details);
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
    const url = `${getOpenlistUrl().replace(/\/$/, '')}/api/auth/login`;
    console.log(`[LOGIN] Attempting to login via Openlist at: ${url}`);
    const response = await axios.post(url, { username, password });
    
    if (response.data.code === 200) {
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

// API: Openlist Proxy - Check Auth
app.get('/api/auth/me', async (req, res) => {
  try {
    let token = req.headers.authorization;
    if (!token || token === 'guest-token') token = getOpenlistApiKey();
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
app.post('/api/fs/list', async (req, res) => {
  try {
    let token = req.headers.authorization;
    if (!token || token === 'guest-token') token = getOpenlistApiKey();
    let { reqPath, refresh } = req.body;
    reqPath = reqPath || appConfig.basePath;
    if (!reqPath.startsWith('/')) reqPath = '/' + reqPath;
    
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
app.post('/api/fs/get', async (req, res) => {
  try {
    let token = req.headers.authorization;
    if (!token || token === 'guest-token') token = getOpenlistApiKey();
    let { reqPath } = req.body;
    if (!reqPath) return res.status(400).json({ error: 'Path required' });
    if (!reqPath.startsWith('/')) reqPath = '/' + reqPath;

    const url = `${getOpenlistUrl().replace(/\/$/, '')}/api/fs/get`;
    const response = await axios.post(url, { path: reqPath, password: "" }, {
      headers: { Authorization: token }
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Failed to get file info' });
  }
});

// API: Openlist Proxy - FS Search
app.post('/api/fs/search', async (req, res) => {
  try {
    let token = req.headers.authorization;
    if (!token || token === 'guest-token') token = getOpenlistApiKey();
    const { keywords, parent } = req.body;
    const url = `${getOpenlistUrl().replace(/\/$/, '')}/api/fs/search`;
    
    const reqBody1 = { 
      parent: parent || appConfig.basePath, 
      keywords: keywords,
      scope: 0, // 0 = all, 1 = folder, 2 = file
      page: 1,
      per_page: 100,
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
    
    // NEW LOGIC: SEARCH TMDB CACHE for titles available on the app
    try {
      const cleanStr = (s: any) => String(s || '').replace(/[^a-z0-9\s]/ig, '').replace(/\s+/g, ' ').trim().toLowerCase();
      const q = cleanStr(keywords || '');
      if (q.length >= 2) {
        const matchingKeys = Object.keys(tmdbCache).filter(key => {
          const entry = tmdbCache[key];
          if (!entry) return false;
          const title = cleanStr(entry.title || '');
          const name = cleanStr(entry.name || '');
          const orig = cleanStr(entry.original_name || entry.original_title || '');
          return title.includes(q) || name.includes(q) || orig.includes(q);
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
    const isVideo = (name) => /\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i.test(name);
    const filteredContent = content.filter((item) => {
      if (item.is_dir) return true; // Keep all folders
      if (!isVideo(item.name)) return false; // Ignore non-video files
      
      const parentParts = (item.parent || '').split('/').filter(Boolean);
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
app.get('/api/tmdb/search_all', async (req, res) => {
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


app.post('/api/tmdb/batch', async (req, res) => {
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

app.get('/api/tmdb/search', async (req, res) => {
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

app.get('/api/tmdb/trending', async (req, res) => {
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
app.post('/api/tmdb/correct', (req, res) => {
  const { query, type, year, data } = req.body;
  if (!query || !data) return res.status(400).json({ error: 'Invalid data' });
  const cacheKey = `${type}-${query.toLowerCase().trim()}${year ? `-${year}` : ''}`;
  tmdbCache[cacheKey] = data;
  saveDb();
  addLog('TMDB Corrected', 'Admin', `Corrected TMDB data for query: ${query} (Type: ${type})`);
  res.json({ success: true, data });
});

// Admin override for TMDB by ID
app.post('/api/tmdb/override', async (req, res) => {
  const { query, type, year, tmdbId, customTitle } = req.body;
  if (!query || (!tmdbId && !customTitle)) return res.status(400).json({ error: 'Invalid data' });
  
  try {
    const cacheKey = `${type}-${query.toLowerCase().trim()}${year ? `-${year}` : ''}`;

    if (customTitle && !tmdbId) {
      // Just override title in existing cache or create a mock
      let data = tmdbCache[cacheKey] || {};
      data.title = customTitle;
      data.name = customTitle; // tv uses name
      data._overridden = true;
      tmdbCache[cacheKey] = data;
      const baseKey = `${type}-${query.toLowerCase().trim()}`;
      for (const key of Object.keys(tmdbCache)) {
           if (key.startsWith(baseKey)) {
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
       const baseKey = `${type}-${query.toLowerCase().trim()}`;
       for (const key of Object.keys(tmdbCache)) {
           if (key.startsWith(baseKey)) {
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

let autoFetchJob = {
  isRunning: false,
  message: '',
  targetPath: '',
  count: 0,
  failedItems: [] as { name: string, path: string }[]
};

app.get('/api/tmdb/autofetch/status', (req, res) => {
  res.json(autoFetchJob);
});

app.post('/api/tmdb/autofetch/start', (req, res) => {
  if (autoFetchJob.isRunning) {
    return res.json({ success: false, message: 'Already running' });
  }

  let token = req.headers.authorization;
  addLog("Autofetch Started", "Admin", "Started TMDB autofetch");
  if (!token || token === 'guest-token') token = getOpenlistApiKey();

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

app.post('/api/tmdb/autofetch/stop', (req, res) => {
  autoFetchJob.isRunning = false;
  addLog("Autofetch Stopped", "Admin", "Stopped TMDB autofetch");
  autoFetchJob.message = 'Auto-fetch stopped.';
  res.json({ success: true, message: 'Stopped' });
});

// API: Gemini Chatbot

// API: Jellyfin Recently Added
app.get('/api/jellyfin/recently-added', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const items = await getRecentlyAdded(getOpenlistUrl, getOpenlistApiKey, appConfig.basePath, force);
    
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


async function startServer() {
  const isProd = process.env.NODE_ENV === "production" || _filename.endsWith('.cjs');
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  
// API: Jellyfin Override
const jfOverrideFile = 'jf_override.json';
let jfOverrides: Record<string, any> = {};
if (fs.existsSync(jfOverrideFile)) {
    try {
        jfOverrides = JSON.parse(fs.readFileSync(jfOverrideFile, 'utf-8'));
    } catch(e) {}
}

app.post('/api/jellyfin/override', (req, res) => {
    let token = req.headers.authorization;
    if (!token || token === 'guest-token') return res.status(401).json({ error: 'Unauthorized' });
    // basic admin check or rely on front-end for now
    
    const { jfName, openlistPath, category, year } = req.body;
    if (!jfName) return res.status(400).json({ error: 'Missing name' });
    
    jfOverrides[jfName] = { openlistPath, category, year };
    fs.writeFileSync(jfOverrideFile, JSON.stringify(jfOverrides, null, 2));
    addLog("Jellyfin Override", "Admin", `Set override for ${jfName} to ${openlistPath}`);
    
    res.json({ success: true, overrides: jfOverrides });
});

app.get('/api/jellyfin/overrides', (req, res) => {
    res.json(jfOverrides);
});
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
