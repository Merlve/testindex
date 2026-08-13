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

export async function initJellyfinCache() {
  const loadedCache = await readSQLiteJSON('jellyfin_cache');
  if (loadedCache) {
    if (loadedCache.recentlyAddedCache) recentlyAddedCache = loadedCache.recentlyAddedCache;
    if (loadedCache.lastFetchTime) lastFetchTime = loadedCache.lastFetchTime;
  }
}

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

function getCleanTitle(name: string): string {
  let clean = name.replace(/[\(\[\{].*?[\)\]\}]/g, ' ');
  clean = clean.replace(/\b(19\d{2}|20\d{2})\b/g, ' ');
  clean = clean.replace(/\b(s\d+|season\s*\d+|e\d+|episode\s*\d+)\b/gi, ' ');
  clean = clean.replace(/\b(720p|1080p|2160p|4k|hdr|web-dl|webdl|bluray|x264|x265|hevc)\b/gi, ' ');
  clean = clean.replace(/['’ʼ`]/g, '');
  clean = clean.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  return clean || name;
}

export function getLocalItems() { return recentlyAddedCache; }

export async function getRecentlyAdded(getOpenlistUrl: () => string, getOpenlistApiKey: () => string | undefined, basePath: string, force: boolean = false, jfOverrides: Record<string, any> = {}) {
  const now = Date.now();
  if (force) {
    isFetching = false;
    openlistSearchCache.clear();
    await fetchAndMatchJellyfin(getOpenlistUrl, getOpenlistApiKey, basePath, jfOverrides);
  } else if ((now - lastFetchTime > 3 * 60 * 1000) && !isFetching) {
    fetchAndMatchJellyfin(getOpenlistUrl, getOpenlistApiKey, basePath, jfOverrides).catch(e => {
       console.error('[Jellyfin] Auto-fetch error:', e.response?.status || e.message);
       lastFetchTime = Date.now();
    });
  }
  return recentlyAddedCache;
}

async function fetchAndMatchJellyfin(getOpenlistUrl: () => string, getOpenlistApiKey: () => string | undefined, basePath: string, jfOverrides: Record<string, any> = {}) {
  isFetching = true;
  try {
    const url = process.env.JELLYFIN_URL?.replace(/^["']|["']$/g, '');
    const apiKey = process.env.JELLYFIN_API_KEY?.replace(/^["']|["']$/g, '');
    let userId = process.env.JELLYFIN_USER_ID?.replace(/^["']|["']$/g, '');
    
    if (!url || !apiKey) {
      throw new Error('Jellyfin server URL or API Key is not configured in environment variables.');
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
    } catch(e: any) {
        // Silently ignore timeout errors for background user validation
    }
    
    if (!userId) {
       throw new Error('Could not determine Jellyfin User ID. Please check JELLYFIN_URL and JELLYFIN_API_KEY.');
    }

    console.log('[Jellyfin] Fetching Latest items...');
    let res;
    try {
      res = await axios.get(`${url.replace(/\/$/, '')}/Users/${userId}/Items/Latest`, {
        params: {
          IncludeItemTypes: "Movie,Episode,Series",
          Limit: 30,
          Fields: "ProviderIds,Overview,Genres,CommunityRating,ProductionYear,SeriesYear,RunTimeTicks,SeriesName,SeasonName,IndexNumber,ParentIndexNumber,OriginalLanguage,ProductionLocations,SeriesId,MediaSources,MediaStreams,DateCreated"
        },
        headers: {
          'X-Emby-Token': apiKey
        }
      });
    } catch (e: any) {
      throw new Error(`Jellyfin API error: ${e.response?.data?.message || e.response?.data || e.message || 'Failed to connect to Jellyfin'}`);
    }

    const items = res.data || [];
    const seenNames = new Set<string>();
    const toSearch: { name: string, year: number | null, isSeries: boolean, jfItem: any, addedText: string }[] = [];
    const seriesYearCache = new Map<string, number | null>();

    for (const item of items) {
      let name = item.Name;
      let isSeries = false;
      let targetYear = item.ProductionYear || null;
      let addedText = 'Added';
      
      if (item.Type === 'Episode') {
        name = item.SeriesName || item.Name;
        isSeries = true;
        targetYear = item.SeriesYear || null;
        
        if (item.SeriesId) {
          if (seriesYearCache.has(item.SeriesId)) {
            const cachedYear = seriesYearCache.get(item.SeriesId);
            if (cachedYear) targetYear = cachedYear;
          } else {
            try {
              const seriesRes = await axios.get(`${url.replace(/\/$/, '')}/Users/${userId}/Items/${item.SeriesId}`, {
                params: { Fields: "ProductionYear,PremiereDate" },
                headers: { 'X-Emby-Token': apiKey }
              });
              const sYear = seriesRes.data?.ProductionYear || (seriesRes.data?.PremiereDate ? new Date(seriesRes.data.PremiereDate).getFullYear() : null);
              if (sYear) {
                targetYear = sYear;
                seriesYearCache.set(item.SeriesId, sYear);
              } else {
                seriesYearCache.set(item.SeriesId, targetYear);
              }
            } catch (err) {
              seriesYearCache.set(item.SeriesId, targetYear);
            }
          }
        }
        
        const s = item.ParentIndexNumber !== undefined ? String(item.ParentIndexNumber).padStart(2, '0') : '';
        const e = item.IndexNumber !== undefined ? String(item.IndexNumber).padStart(2, '0') : '';
        if (s && e) {
           addedText = `S${s}E${e} added`;
        } else if (e) {
           addedText = `Episode ${item.IndexNumber} added`;
        } else {
           addedText = 'Episode added';
        }
      } else if (item.Type === 'Series') {
        isSeries = true;
      }
      
      if (targetYear && !name.includes(String(targetYear))) {
        name = `${name} ${targetYear}`;
      }
      
      const lowerName = normalizeStr(name);
      if (!seenNames.has(lowerName) && name) {
        seenNames.add(lowerName);
        toSearch.push({ name, year: targetYear, isSeries, jfItem: item, addedText });
      }
    }

    const matchedItems: any[] = [];
    const openlistUrl = getOpenlistUrl().replace(/\/$/, '');
    const token = getOpenlistApiKey();
    
    if (!token) {
      console.log('[Jellyfin] No openlist token available for searching.');
      throw new Error('No OpenList API key or authorization token available for matching directories.');
    }


    for (const search of toSearch) {

      if (openlistSearchCache.has(search.name)) {
        const cachedMatch = openlistSearchCache.get(search.name);
        if (cachedMatch) {
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
               openlist_path: override.openlistPath,
               _jf_name: search.name,
               _jf: {
                   tmdbId: search.jfItem.ProviderIds?.Tmdb || search.jfItem.ProviderIds?.tmdb || null,
                   year: search.year,
                   overview: search.jfItem.Overview,
                   rating: search.jfItem.CommunityRating,
                   resolution: null,
                   genres: search.jfItem.Genres,
                   addedText: search.addedText
               }
            };
            matchedItems.push(enrichedMatch);
            openlistSearchCache.set(search.name, enrichedMatch);
            continue;
        }

        const cleanSearchTitle = getCleanTitle(search.name);
        let searchKeywords = cleanSearchTitle || getSearchKeywords(search.name);
        
        const base = basePath.replace(/\/$/, '');
        const targetPaths = search.isSeries 
            ? [`${base}/ANIME`, `${base}/SERIES`, `${base}/KDRAMA`]
            : [`${base}/MOVIES`];
        
        let queriesToTry = [];
        if (search.year && !searchKeywords.includes(String(search.year))) {
            queriesToTry.push(`${searchKeywords} ${search.year}`);
        }
        queriesToTry.push(searchKeywords);

        // Fallback to first word if necessary
        if (searchKeywords.includes(' ')) {
            const firstWord = searchKeywords.split(' ')[0];
            if (firstWord.length >= 3) {
                queriesToTry.push(firstWord);
            }
        }

        let content: any[] = [];
        for (const query of queriesToTry) {
            for (const targetPath of targetPaths) {
                let searchRes = await axios.post(`${openlistUrl}/api/fs/search`, {
                  parent: targetPath,
                  keywords: query,
                  scope: 1, // folders only
                  page: 1,
                  per_page: 100,
                  password: ""
                }, { headers: { Authorization: token } }).catch(() => null);
                if (searchRes?.data?.data?.content) {
                    content.push(...searchRes.data.data.content);
                }
            }
            if (content.length > 0) break; // Stop if we found results for this query level
        }

        const cleanTitleNorm = normalizeStr(cleanSearchTitle);
        const rawTitleNorm = normalizeStr(search.name);
        const yearStr = search.year ? String(search.year) : null;
        
        let bestCandidate: any = null;
        let bestScore = -1;

        for (const c of content) {
          if (!c.is_dir) continue;
          
          const candNorm = normalizeStr(c.name);
          let score = 0;

          const expectedNormWithYear = yearStr ? cleanTitleNorm + yearStr : cleanTitleNorm;
          if (candNorm === cleanTitleNorm || candNorm === rawTitleNorm || candNorm === expectedNormWithYear) {
            score += 10;
          } else if (candNorm.includes(cleanTitleNorm) || cleanTitleNorm.includes(candNorm)) {
            score += 5;
          } else if (rawTitleNorm && candNorm.includes(rawTitleNorm)) {
            score += 3;
          }

          if (yearStr && c.name.includes(yearStr)) {
            score += 4;
          }

          const parentUpper = (c.parent || '').toUpperCase();
          if (search.isSeries) {
            if (/ANIME|KDRAMA|SERIES|SHOWS|TV|DRAMA/i.test(parentUpper)) score += 2;
          } else {
            if (/MOVIES|MOVIE|FILM|FILMS|CINEMA/i.test(parentUpper)) score += 2;
          }

          if (score > bestScore && score >= 2) {
            bestScore = score;
            bestCandidate = c;
          }
        }

        if (bestCandidate) {
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
                      const m = bestStream.DisplayTitle.match(/(\d{3,4}p|4k|8k)/i);
                      if (m) resolution = m[1].toUpperCase();
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
             ...bestCandidate, 
             _cat: bestCandidate.parent.split('/').filter(Boolean).pop() || (search.isSeries ? 'SERIES' : 'MOVIES'), 
             _parent: bestCandidate.parent,
             openlist_path: `${bestCandidate.parent}/${bestCandidate.name}`,
             _jf_name: search.name,
             _jf: {
                 tmdbId,
                 year: search.year,
                 overview: search.jfItem.Overview,
                 rating: search.jfItem.CommunityRating,
                 resolution,
                 genres: search.jfItem.Genres,
                 addedText: search.addedText
             }
          };
          matchedItems.push(enrichedMatch);
          openlistSearchCache.set(search.name, enrichedMatch);
        } else {
          console.log(`[Jellyfin] No openlist match found for: ${search.name}`);
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
