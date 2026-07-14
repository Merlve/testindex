import express from 'express';
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
const configPath = path.join(_dirname, 'config.json');
let appConfig = {
  openlistUrl: process.env.OPENLIST_SERVER_URL || 'https://fox.oplist.org',
  basePath: '/home'
};
if (fs.existsSync(configPath)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    appConfig = { ...appConfig, ...loaded };
  } catch (e) {
    console.error('Error reading config', e);
  }
}

// Ensure env variables take precedence over saved config if provided
const getOpenlistUrl = () => process.env.OPENLIST_SERVER_URL || appConfig.openlistUrl;
const getOpenlistApiKey = () => process.env.OPENLIST_API_KEY;

function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2));
}

// Simple JSON DB for TMDB corrections
const dbPath = path.join(_dirname, 'db.json');
let tmdbCache: Record<string, any> = {};
if (fs.existsSync(dbPath)) {
  try {
    tmdbCache = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch (e) {
    console.error('Error reading DB', e);
  }
}
function saveDb() {
  try { fs.writeFileSync(dbPath, JSON.stringify(tmdbCache, null, 2)); } catch (e) { console.error("Db write error", e); }
}


// Watchlist DB
const watchlistPath = path.join(_dirname, 'watchlist.json');
let watchlistDb = {};
if (fs.existsSync(watchlistPath)) {
  try { watchlistDb = JSON.parse(fs.readFileSync(watchlistPath, 'utf8')); } catch (e) {}
}
function saveWatchlist() {
  try { fs.writeFileSync(watchlistPath, JSON.stringify(watchlistDb, null, 2)); } catch (e) {}
}

app.get('/api/watchlist', (req, res) => {
  const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  res.json(watchlistDb[user] || []);
});

app.post('/api/watchlist/toggle', (req, res) => {
  const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  
  const { item, category, parentPath } = req.body;
  if (!watchlistDb[user]) watchlistDb[user] = [];
  
  const list = watchlistDb[user];
  const existingIndex = list.findIndex(i => i.item.name === item.name && i.parentPath === parentPath);
  
  if (existingIndex >= 0) {
    list.splice(existingIndex, 1);
  } else {
    list.push({ item, category, parentPath });
  }
  
  saveWatchlist();
  res.json({ success: true, watchlist: list, added: existingIndex < 0 });
});

app.get('/api/watchlist/check', (req, res) => {
  const user = Array.isArray(req.headers['x-user']) ? req.headers['x-user'][0] : req.headers['x-user'];
  const { name, parentPath } = req.query;
  if (!user || !name || !parentPath) return res.json({ inWatchlist: false });
  const list = watchlistDb[user] || [];
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
  res.json({ success: true, config: appConfig });
});

// API: Openlist Proxy - Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const url = `${getOpenlistUrl().replace(/\/$/, '')}/api/auth/login`;
    console.log(`[LOGIN] Attempting to login via Openlist at: ${url}`);
    const response = await axios.post(url, { username, password });
    res.json(response.data);
  } catch (error: any) {
    const targetUrl = `${getOpenlistUrl().replace(/\/$/, '')}/api/auth/login`;
    console.error(`[LOGIN ERROR] Target URL: ${targetUrl} | Status: ${error.response?.status} | Message: ${error.message}`);
    
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

// API: Openlist Proxy - FS List
app.post('/api/fs/list', async (req, res) => {
  try {
    let token = req.headers.authorization;
    if (!token || token === 'guest-token') token = getOpenlistApiKey();
    let { reqPath } = req.body;
    reqPath = reqPath || appConfig.basePath;
    if (!reqPath.startsWith('/')) reqPath = '/' + reqPath;
    
    const url = `${getOpenlistUrl().replace(/\/$/, '')}/api/fs/list`;
    const response = await axios.post(url, { path: reqPath, password: "" }, {
      headers: { Authorization: token }
    });
    res.json(response.data);
  } catch (error: any) {
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
  const { query, type, year } = req.query; // type can be 'movie' or 'tv'
  if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Query required' });
  
  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) {
    return res.json({ results: [] });
  }

  try {
    const typeStr = (type as string || '').toUpperCase();
    const searchType = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(typeStr) ? 'tv' : 'movie';
    let url = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(query)}`;
    if (year && typeof year === 'string') {
      url += searchType === 'movie' ? `&primary_release_year=${year}` : `&first_air_date_year=${year}`;
    }
    const response = await axios.get(url);
    
    // If no results, try alternative 'and' vs '&'
    if (response.data && response.data.results && response.data.results.length === 0) {
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
            return res.json(altResponse.data);
          }
        } catch(e) {}
      }
    }
    
    res.json(response.data);
  } catch (error: any) {
    console.error('TMDB Error', error.message);
    res.status(500).json({ error: 'TMDB fetch failed' });
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
    const cacheKey = `${type}-${query.toLowerCase().trim()}${year ? `-${year}` : ''}`;
    if (tmdbCache[cacheKey] !== undefined) {
      results[originalName] = tmdbCache[cacheKey];
    } else {
      toFetch.push({ ...item, cacheKey });
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
  const { query, type, year } = req.query; // type can be 'movie' or 'tv'
  if (!query || typeof query !== 'string') return res.status(400).json({ error: 'Query required' });
  
  const cacheKey = `${type}-${query.toLowerCase().trim()}${year ? `-${year}` : ''}`;
  if (tmdbCache[cacheKey]) {
    return res.json(tmdbCache[cacheKey]);
  }

  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) {
    return res.json(null);
  }

  try {
    const typeStr = (type as string || '').toUpperCase();
    const searchType = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(typeStr) ? 'tv' : 'movie';
    let url = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(query)}`;
    if (year && typeof year === 'string') {
      url += searchType === 'movie' ? `&primary_release_year=${year}` : `&first_air_date_year=${year}`;
    }
    
    const response = await axios.get(url);
    let data = response.data;
    
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
    
    if (data.results && data.results.length > 0) {
       tmdbCache[cacheKey] = data.results[0];
       saveDb();
       return res.json(data.results[0]);
    }
    res.json(null);
  } catch (error: any) {
    res.status(500).json({ error: 'TMDB fetch failed' });
  }
});

// Admin correction for TMDB
app.post('/api/tmdb/correct', (req, res) => {
  const { query, type, year, data } = req.body;
  if (!query || !data) return res.status(400).json({ error: 'Invalid data' });
  const cacheKey = `${type}-${query.toLowerCase().trim()}${year ? `-${year}` : ''}`;
  tmdbCache[cacheKey] = data;
  saveDb();
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
      tmdbCache[cacheKey] = data;
      saveDb();
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
       tmdbCache[cacheKey] = data;
       saveDb();
       return res.json({ success: true, data });
    }
    res.status(404).json({ error: 'Not found' });
  } catch (error: any) {
    console.error('TMDB Override Error', error.message);
    res.status(500).json({ error: 'TMDB fetch failed' });
  }
});

// API: Gemini Chatbot
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
  if (process.env.NODE_ENV !== "production") {
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
