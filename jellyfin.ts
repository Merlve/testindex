import axios from 'axios';
import { readSQLiteJSON, writeSQLiteJSON } from './sqlite_db';
import fs from 'fs';


let recentlyAddedCache: any[] = [];
let lastFetchTime = 0;
let isFetching = false;
const openlistSearchCache = new Map<string, any>();

async function saveJellyfinCache() {
  await writeSQLiteJSON('jellyfin_cache', { recentlyAddedCache, lastFetchTime });
}

readSQLiteJSON('jellyfin_cache').then(loadedCache => {
  if (loadedCache) {
    if (loadedCache.recentlyAddedCache) recentlyAddedCache = loadedCache.recentlyAddedCache;
    if (loadedCache.lastFetchTime) lastFetchTime = loadedCache.lastFetchTime;
  }
});


function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeStr(s: string): string {
  return stripAccents(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getSearchKeywords(s: string): string {
  let res = stripAccents(s);
  res = res.replace(/['’ʼ`]/g, '');
  res = res.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  return res.trim();
}


export function getLocalItems() { return recentlyAddedCache; }

export async function getRecentlyAdded(getOpenlistUrl: () => string, getOpenlistApiKey: () => string | undefined, basePath: string, force: boolean = false) {
  const now = Date.now();
  if ((force || now - lastFetchTime > 10 * 60 * 1000) && !isFetching) {
    if (force) {
      // Clear cache misses so we can retry searching openlist
      for (const [key, value] of openlistSearchCache.entries()) {
         if (value === null) {
            openlistSearchCache.delete(key);
         }
      }
      await fetchAndMatchJellyfin(getOpenlistUrl, getOpenlistApiKey, basePath).catch(e => {
         console.error('[Jellyfin] Error', e.response?.status, e.message);
         lastFetchTime = Date.now();
      });
    } else {
      // Fire and forget
      fetchAndMatchJellyfin(getOpenlistUrl, getOpenlistApiKey, basePath).catch(e => {
         console.error('[Jellyfin] Error', e.response?.status, e.message);
         lastFetchTime = Date.now();
      });
    }
  }
  return recentlyAddedCache;
}

async function fetchAndMatchJellyfin(getOpenlistUrl: () => string, getOpenlistApiKey: () => string | undefined, basePath: string) {
  isFetching = true;
  try {
    const url = process.env.JELLYFIN_URL?.replace(/^["']|["']$/g, '');
    const apiKey = process.env.JELLYFIN_API_KEY?.replace(/^["']|["']$/g, '');
    let userId = process.env.JELLYFIN_USER_ID?.replace(/^["']|["']$/g, '');
    
    if (!url || !apiKey) {
      isFetching = false;
      return;
    }
    
    try {
        const usersRes = await axios.get(`${url.replace(/\/$/, '')}/Users`, { headers: { 'X-Emby-Token': apiKey } });
        const users = usersRes.data;
        const userExists = users.some((u: any) => u.Id === userId);
        
        if (!userId || !userExists) {
            const admins = users.filter((u: any) => u.Policy?.IsAdministrator);
            if (admins.length > 0) {
                userId = admins[0].Id;
            } else if (users.length > 0) {
                userId = users[0].Id;
            }
        }
    } catch(e) {
        console.error("[Jellyfin] Failed to fetch users list to verify userId", e);
    }
    
    if (!userId) {
       isFetching = false;
       return;
    }

    console.log('[Jellyfin] Fetching Latest items...');
    const res = await axios.get(`${url.replace(/\/$/, '')}/Users/${userId}/Items/Latest`, {
      params: {
        IncludeItemTypes: "Movie,Episode,Series",
        Limit: 30,
        Fields: "ProviderIds,Overview,Genres,CommunityRating,ProductionYear,RunTimeTicks,SeriesName,SeasonName,IndexNumber,ParentIndexNumber,OriginalLanguage,ProductionLocations,SeriesId,MediaSources,MediaStreams"
      },
      headers: {
        'X-Emby-Token': apiKey
      }
    });

    const items = res.data || [];
    const seenNames = new Set<string>();
    const toSearch: { name: string, year: number | null, isSeries: boolean, jfItem: any }[] = [];

    for (const item of items) {
      let name = item.Name;
      let isSeries = false;
      if (item.Type === 'Episode') {
        name = item.SeriesName || item.Name;
        isSeries = true;
      } else if (item.Type === 'Series') {
        isSeries = true;
      }
      
      const lowerName = normalizeStr(name);
      if (!seenNames.has(lowerName) && name) {
        seenNames.add(lowerName);
        toSearch.push({ name, year: item.ProductionYear || null, isSeries, jfItem: item });
      }
    }


    const matchedItems: any[] = [];
    const openlistUrl = getOpenlistUrl().replace(/\/$/, '');
    const token = getOpenlistApiKey();
    
    if (!token) {
      console.log('[Jellyfin] No openlist token available for searching.');
      isFetching = false;
      return;
    }

    let jfOverrides: Record<string, any> = {};
    if (fs.existsSync('jf_override.json')) {
        try { jfOverrides = JSON.parse(fs.readFileSync('jf_override.json', 'utf-8')); } catch(e){}
    }

    for (const search of toSearch) {

      if (openlistSearchCache.has(search.name)) {
        const cachedMatch = openlistSearchCache.get(search.name);
        if (cachedMatch) {
            // Update cached match with latest jellyfin data if needed, but for now just push
            matchedItems.push(cachedMatch);
        }
        continue;
      }

      try {
        if (jfOverrides[search.name]) {
            const override = jfOverrides[search.name];
            const enrichedMatch = {
               name: override.openlistPath.split('/').pop() || search.name,
               parent: override.openlistPath.substring(0, override.openlistPath.lastIndexOf('/')),
               is_dir: true,
               size: 0,
               modified: new Date().toISOString(),
               _cat: override.category || 'Unknown',
               _parent: override.openlistPath.substring(0, override.openlistPath.lastIndexOf('/')),
               _jf_name: search.name,
               _jf: {
                   tmdbId: search.jfItem.ProviderIds?.Tmdb || search.jfItem.ProviderIds?.tmdb || null,
                   year: search.year,
                   overview: search.jfItem.Overview,
                   rating: search.jfItem.CommunityRating,
                   resolution: null,
                   genres: search.jfItem.Genres
               }
            };
            matchedItems.push(enrichedMatch);
            openlistSearchCache.set(search.name, enrichedMatch);
            continue;
        }

        const keywords = getSearchKeywords(search.name);
        const searchRes = await axios.post(`${openlistUrl}/api/fs/search`, {
          parent: basePath,
          keywords: keywords,
          scope: 1, // folders only
          page: 1,
          per_page: 100,
          password: ""
        }, { headers: { Authorization: token } });
        
        const content = searchRes.data?.data?.content || [];
        const titleKey = normalizeStr(search.name);
        const yearStr = search.year ? String(search.year) : null;
        
        const candidates = content.filter((c: any) => {
           if (!c.is_dir) return false;
           
           let parent = c.parent || '';
           if (!parent.endsWith('/')) parent += '/';
           const parentUpper = parent.toUpperCase();
           
           let isValidPath = false;
           if (search.isSeries) {
               if (parentUpper.includes('/ANIME/') || parentUpper.includes('/KDRAMA/') || parentUpper.includes('/SERIES/')) {
                   isValidPath = true;
               }
           } else {
               if (parentUpper.includes('/MOVIES/')) {
                   isValidPath = true;
               }
           }
           if (!isValidPath) return false;

           return normalizeStr(c.name).includes(titleKey);
        });
        
        let match = null;
        if (candidates.length > 0) {
           let bestScore = -1;
           for (const c of candidates) {
              let score = 0;
              const cNameNorm = normalizeStr(c.name);
              const nameWithYear = normalizeStr(`${search.name} ${search.year || ''}`);
              if (yearStr && c.name.includes(yearStr)) score += 3;
              if (cNameNorm === nameWithYear) score += 2;
              
              if (score > bestScore) {
                 bestScore = score;
                 match = c;
              }
           }
        }

        if (match) {
          const providerIds = search.jfItem.ProviderIds || {};
          const tmdbId = providerIds.Tmdb || providerIds.tmdb || null;
          
          let resolution = null;
          const sources = search.jfItem.MediaSources || [];
          if (sources.length > 0) {
              const streams = sources[0].MediaStreams || [];
              const videoStreams = streams.filter((s: any) => s.Type === 'Video' && !['mjpeg','png','jpeg','jpg','bmp','gif'].includes((s.Codec || '').toLowerCase()));
              if (videoStreams.length > 0) {
                 const bestStream = videoStreams.reduce((prev: any, current: any) => (prev.Height > current.Height) ? prev : current);
                 if (bestStream.DisplayTitle) {
                     const match = bestStream.DisplayTitle.match(/(\d{3,4}p|4k|8k)/i);
                     if (match) resolution = match[1].toUpperCase();
                 }
                 if (!resolution && bestStream.Height) {
                     if (bestStream.Height >= 2160) resolution = '4K';
                     else if (bestStream.Height >= 1440) resolution = '2K';
                     else if (bestStream.Height >= 1080) resolution = '1080p';
                     else if (bestStream.Height >= 720) resolution = '720p';
                     else if (bestStream.Height >= 480) resolution = '480p';
                     else resolution = `${bestStream.Height}p`;
                 }
              }
          }

          const enrichedMatch = {
             ...match, 
             _cat: match.parent.split('/').pop() || 'Unknown', 
             _parent: match.parent,
             _jf_name: search.name,
             _jf: {
                 tmdbId,
                 year: search.year,
                 overview: search.jfItem.Overview,
                 rating: search.jfItem.CommunityRating,
                 resolution,
                 genres: search.jfItem.Genres
             }
          };
          matchedItems.push(enrichedMatch);
          openlistSearchCache.set(search.name, enrichedMatch);
        } else {
          openlistSearchCache.set(search.name, null); // cache misses too so we don't retry endlessly
        }
      } catch (e: any) {
        console.error(`[Jellyfin] Error searching openlist for ${search.name}:`, e.response?.status, e.message);
      }
    }

    recentlyAddedCache = matchedItems;
    lastFetchTime = Date.now();
    await saveJellyfinCache();
    console.log(`[Jellyfin] Cached ${matchedItems.length} recently added items.`);
  } finally {
    isFetching = false;
  }
}
