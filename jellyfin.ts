import axios from 'axios';
import { readSQLiteJSON, writeSQLiteJSON } from './sqlite_db';

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

export async function getRecentlyAdded(
  getOpenlistUrl: () => string,
  getOpenlistApiKey: () => string | undefined,
  basePath: string,
  force: boolean = false,
  jfOverrides: Record<string, any> = {}
) {
  const now = Date.now();
  if (force) {
    isFetching = false;
    openlistSearchCache.clear();
    await fetchAndMatchJellyfin(getOpenlistUrl, getOpenlistApiKey, basePath, jfOverrides);
  } else if ((now - lastFetchTime > 3 * 60 * 1000) && !isFetching) {
    fetchAndMatchJellyfin(getOpenlistUrl, getOpenlistApiKey, basePath, jfOverrides).catch(e => {
       const msg = e.response?.status || e.message;
       if (String(msg).includes('timeout')) {
           console.warn('[Jellyfin] Auto-fetch skipped due to timeout (server took too long to respond).');
       } else {
           console.error('[Jellyfin] Auto-fetch error:', msg);
       }
       lastFetchTime = Date.now();
    });
  }
  return recentlyAddedCache;
}

/**
 * Builds standard Jellyfin authentication headers compliant with Jellyfin 12.x
 * as well as backward-compatible with Jellyfin 10.x and 11.x.
 */
function getJellyfinHeaders(apiKey: string): Record<string, string> {
  const token = (apiKey || '').trim();
  return {
    'Accept': 'application/json',
    // Standard Jellyfin 12.x MediaBrowser Authorization header
    'Authorization': `MediaBrowser Client="OpenList", Device="Server", DeviceId="openlist-jellyfin-sync", Version="12.4.0", Token="${token}"`,
    // Backward compatibility tokens for 10.x / 11.x
    'X-Emby-Token': token,
    'X-MediaBrowser-Token': token,
  };
}

/**
 * Helper to fetch series details using modern Jellyfin 12.x routes (/Items/{id})
 * with fallbacks to (/Shows/{id}) and legacy (/Users/{userId}/Items/{id}).
 */
async function fetchSeriesDetails(
  cleanUrl: string,
  seriesId: string,
  userId: string | undefined,
  headers: Record<string, string>,
  apiKey: string
): Promise<any | null> {
  // Route 1 (Jellyfin 12.x standard): GET /Items/{seriesId}
  try {
    const res = await axios.get(`${cleanUrl}/Items/${seriesId}`, {
      params: {
        fields: "ProductionYear,PremiereDate,Name",
        ...(userId ? { userId } : {}),
        api_key: apiKey
      },
      headers,
      timeout: 25000
    });
    if (res.data) return res.data;
  } catch (err: any) {
    // Continue to next fallback
  }

  // Route 2: GET /Shows/{seriesId}
  try {
    const res = await axios.get(`${cleanUrl}/Shows/${seriesId}`, {
      params: {
        fields: "ProductionYear,PremiereDate,Name",
        ...(userId ? { userId } : {}),
        api_key: apiKey
      },
      headers,
      timeout: 25000
    });
    if (res.data) return res.data;
  } catch (err: any) {
    // Continue to legacy fallback
  }

  // Route 3 (Legacy Jellyfin 10.x/11.x fallback): GET /Users/{userId}/Items/{seriesId}
  if (userId) {
    try {
      const res = await axios.get(`${cleanUrl}/Users/${userId}/Items/${seriesId}`, {
        params: {
          fields: "ProductionYear,PremiereDate,Name",
          api_key: apiKey
        },
        headers,
        timeout: 25000
      });
      if (res.data) return res.data;
    } catch (err: any) {
      // Failed all series routes
    }
  }

  return null;
}

/**
 * Helper to fetch the latest episode added to a season on Jellyfin.
 * Identifies the latest added episode (e.g. S07E07) rather than generic 'Season 7'.
 */
async function fetchLatestEpisodeForSeason(
  cleanUrl: string,
  seriesId: string,
  seasonId: string,
  userId: string | undefined,
  headers: Record<string, string>,
  apiKey: string
): Promise<{ latestEp: any, addedText: string } | null> {
  try {
    const res = await axios.get(`${cleanUrl}/Shows/${seriesId}/Episodes`, {
      params: {
        userId,
        seasonId,
        fields: "IndexNumber,ParentIndexNumber,DateCreated,MediaSources,MediaStreams,Name",
        api_key: apiKey
      },
      headers,
      timeout: 25000
    });
    const eps: any[] = res.data?.Items || res.data?.items || (Array.isArray(res.data) ? res.data : []);
    if (eps.length === 0) return null;

    let maxTime = 0;
    for (const ep of eps) {
      const t = ep.DateCreated ? new Date(ep.DateCreated).getTime() : 0;
      if (t > maxTime) maxTime = t;
    }

    const recentBatch = eps.filter(ep => {
      const t = ep.DateCreated ? new Date(ep.DateCreated).getTime() : 0;
      return (maxTime - t) < 24 * 60 * 60 * 1000;
    });

    recentBatch.sort((a, b) => (b.IndexNumber ?? 0) - (a.IndexNumber ?? 0));
    const latestEp = recentBatch[0] || eps[eps.length - 1];

    const s = latestEp.ParentIndexNumber !== undefined && latestEp.ParentIndexNumber !== null ? String(latestEp.ParentIndexNumber).padStart(2, "0") : "";
    const e = latestEp.IndexNumber !== undefined && latestEp.IndexNumber !== null ? String(latestEp.IndexNumber).padStart(2, "0") : "";
    const addedText = s && e ? `S${s}E${e} added` : (e ? `Episode ${latestEp.IndexNumber} added` : "Episode added");

    return {
      latestEp,
      addedText
    };
  } catch (err) {
    return null;
  }
}

async function fetchAndMatchJellyfin(
  getOpenlistUrl: () => string,
  getOpenlistApiKey: () => string | undefined,
  basePath: string,
  jfOverrides: Record<string, any> = {}
) {
  isFetching = true;
  try {
    const rawUrl = process.env.JELLYFIN_URL?.replace(/^["']|["']$/g, '');
    const apiKey = process.env.JELLYFIN_API_KEY?.replace(/^["']|["']$/g, '');
    let userId = process.env.JELLYFIN_USER_ID?.replace(/^["']|["']$/g, '');

    if (!rawUrl || !apiKey) {
      throw new Error('Jellyfin server URL or API Key is not configured in environment variables.');
    }

    const cleanUrl = rawUrl.replace(/\/$/, '');
    const headers = getJellyfinHeaders(apiKey);

    // Discover User ID if not explicitly specified in environment:
    // In Jellyfin 12.x, /Users/Me is available for user tokens, and /Users is available for admin tokens.
    if (!userId) {
      // Try Jellyfin 12.x current user endpoint: /Users/Me
      try {
        const meRes = await axios.get(`${cleanUrl}/Users/Me`, {
          headers,
          params: { api_key: apiKey },
          timeout: 20000
        });
        if (meRes.data?.Id || meRes.data?.id) {
          userId = meRes.data.Id || meRes.data.id;
          console.log(`[Jellyfin] Resolved user ID from /Users/Me: ${userId}`);
        }
      } catch (e: any) {
        // Fall through to /Users or /Users/Query
      }
    }

    if (!userId) {
      // Try /Users
      try {
        const usersRes = await axios.get(`${cleanUrl}/Users`, {
          headers,
          params: { api_key: apiKey },
          timeout: 20000
        });
        const usersData = usersRes.data;
        const usersList: any[] = Array.isArray(usersData)
          ? usersData
          : (Array.isArray(usersData?.Items) ? usersData.Items : (Array.isArray(usersData?.items) ? usersData.items : []));

        if (usersList.length > 0) {
          const admins = usersList.filter((u: any) => u.Policy?.IsAdministrator || u.policy?.isAdministrator);
          if (admins.length > 0) {
            userId = admins[0].Id || admins[0].id;
          } else {
            userId = usersList[0].Id || usersList[0].id;
          }
          console.log(`[Jellyfin] Resolved user ID from /Users: ${userId}`);
        }
      } catch (e: any) {
        // In Jellyfin 12.x, user ID is not strictly required for /Items/Latest or /Items
        console.warn('[Jellyfin] Could not query /Users; proceeding with token-based query.');
      }
    }

    console.log('[Jellyfin] Fetching latest items using Jellyfin 12.x routes...');
    const itemFields = "ProviderIds,Overview,Genres,CommunityRating,ProductionYear,SeriesYear,RunTimeTicks,SeriesName,SeasonName,IndexNumber,ParentIndexNumber,OriginalLanguage,ProductionLocations,SeriesId,MediaSources,MediaStreams,DateCreated";
    
    let rawItems: any[] = [];
    let fetchSuccess = false;
    let lastError: any = null;

    // Route 1 (Jellyfin 12.x standard): GET /Items/Latest
    try {
      const res = await axios.get(`${cleanUrl}/Items/Latest`, {
        params: {
          ...(userId ? { userId } : {}),
          includeItemTypes: "Movie,Episode,Series",
          limit: 100,
          fields: itemFields,
          enableImages: true,
          api_key: apiKey
        },
        headers,
        timeout: 60000
      });
      if (Array.isArray(res.data) && res.data.length > 0) {
        rawItems = res.data;
        fetchSuccess = true;
      } else if (Array.isArray(res.data?.Items) && res.data.Items.length > 0) {
        rawItems = res.data.Items;
        fetchSuccess = true;
      } else if (Array.isArray(res.data?.items) && res.data.items.length > 0) {
        rawItems = res.data.items;
        fetchSuccess = true;
      } else if (Array.isArray(res.data)) {
        // Empty array, save but let Route 2 try
        rawItems = res.data;
      }
    } catch (e: any) {
      lastError = e;
      console.warn(`[Jellyfin] /Items/Latest returned ${e.response?.status || e.message}; trying /Items route...`);
    }

    // Route 2 (Universal Jellyfin 12.x items query): GET /Items with sort by DateCreated descending
    if (!fetchSuccess) {
      try {
        const res = await axios.get(`${cleanUrl}/Items`, {
          params: {
            ...(userId ? { userId } : {}),
            sortBy: "DateCreated",
            sortOrder: "Descending",
            recursive: true,
            includeItemTypes: "Movie,Episode,Series",
            limit: 100,
            fields: itemFields,
            api_key: apiKey
          },
          headers,
          timeout: 60000
        });
        if (Array.isArray(res.data) && res.data.length > 0) {
          rawItems = res.data;
          fetchSuccess = true;
        } else if (Array.isArray(res.data?.Items) && res.data.Items.length > 0) {
          rawItems = res.data.Items;
          fetchSuccess = true;
        } else if (Array.isArray(res.data?.items) && res.data.items.length > 0) {
          rawItems = res.data.items;
          fetchSuccess = true;
        }
      } catch (e: any) {
        lastError = e;
        console.warn(`[Jellyfin] /Items returned ${e.response?.status || e.message}; checking legacy /Users route...`);
      }
    }

    // Route 3 (Legacy Jellyfin 10.x/11.x fallback): GET /Users/{userId}/Items/Latest
    if (!fetchSuccess && userId) {
      try {
        const res = await axios.get(`${cleanUrl}/Users/${userId}/Items/Latest`, {
          params: {
            includeItemTypes: "Movie,Episode,Series",
            limit: 100,
            fields: itemFields,
            api_key: apiKey
          },
          headers,
          timeout: 60000
        });
        if (Array.isArray(res.data) && res.data.length > 0) {
          rawItems = res.data;
          fetchSuccess = true;
        } else if (Array.isArray(res.data?.Items) && res.data.Items.length > 0) {
          rawItems = res.data.Items;
          fetchSuccess = true;
        } else if (Array.isArray(res.data?.items) && res.data.items.length > 0) {
          rawItems = res.data.items;
          fetchSuccess = true;
        }
      } catch (e: any) {
        lastError = e;
      }
    }

    if (!fetchSuccess && rawItems.length === 0) {
      if (lastError) {
        throw new Error(`Jellyfin API error: ${lastError?.response?.data?.message || lastError?.response?.data || lastError?.message || 'Failed to connect to Jellyfin server'}`);
      }
    }

    const items = rawItems || [];
    const seenNames = new Set<string>();
    const toSearch: { name: string, year: number | null, isSeries: boolean, jfItem: any, addedText: string }[] = [];
    const seriesYearCache = new Map<string, number | null>();

    for (const item of items) {
      let name = item.Name || item.name || '';
      let isSeries = false;
      let targetYear = item.ProductionYear ?? item.productionYear ?? null;
      let addedText = 'Added';

      const itemType = (item.Type || item.type || '').toLowerCase();
      const seriesName = item.SeriesName || item.seriesName;
      const seriesYear = item.SeriesYear ?? item.seriesYear;
      const seriesId = item.SeriesId || item.seriesId;
      const parentIndexNumber = item.ParentIndexNumber ?? item.parentIndexNumber;
      const indexNumber = item.IndexNumber ?? item.indexNumber;

      if (itemType === 'episode') {
        name = seriesName || name;
        isSeries = true;
        targetYear = seriesYear ?? null;

        if (seriesId) {
          if (seriesYearCache.has(seriesId)) {
            const cachedYear = seriesYearCache.get(seriesId);
            if (cachedYear) targetYear = cachedYear;
          } else {
            const seriesData = await fetchSeriesDetails(cleanUrl, seriesId, userId, headers, apiKey);
            const sYear = seriesData?.ProductionYear || seriesData?.productionYear ||
              (seriesData?.PremiereDate ? new Date(seriesData.PremiereDate).getFullYear() : null) ||
              (seriesData?.premiereDate ? new Date(seriesData.premiereDate).getFullYear() : null);
            if (sYear) {
              targetYear = sYear;
              seriesYearCache.set(seriesId, sYear);
            } else {
              seriesYearCache.set(seriesId, targetYear);
            }
            if ((!name || /^(season\s*\d+|s\d+|episode\s*\d+|e\d+)$/i.test(name.trim())) && (seriesData?.Name || seriesData?.name)) {
              name = seriesData.Name || seriesData.name;
            }
          }
        }

        const s = parentIndexNumber !== undefined && parentIndexNumber !== null ? String(parentIndexNumber).padStart(2, '0') : '';
        const e = indexNumber !== undefined && indexNumber !== null ? String(indexNumber).padStart(2, '0') : '';
        if (s && e) {
           addedText = `S${s}E${e} added`;
        } else if (e) {
           addedText = `Episode ${indexNumber} added`;
        } else {
           addedText = 'Episode added';
        }
      } else if (itemType === 'season') {
        name = seriesName || name;
        isSeries = true;
        targetYear = seriesYear ?? null;

        if (seriesId) {
          if (seriesYearCache.has(seriesId)) {
            const cachedYear = seriesYearCache.get(seriesId);
            if (cachedYear) targetYear = cachedYear;
          } else {
            const seriesData = await fetchSeriesDetails(cleanUrl, seriesId, userId, headers, apiKey);
            const sYear = seriesData?.ProductionYear || seriesData?.productionYear ||
              (seriesData?.PremiereDate ? new Date(seriesData.PremiereDate).getFullYear() : null) ||
              (seriesData?.premiereDate ? new Date(seriesData.premiereDate).getFullYear() : null);
            if (sYear) {
              targetYear = sYear;
              seriesYearCache.set(seriesId, sYear);
            } else {
              seriesYearCache.set(seriesId, targetYear);
            }
            if ((!name || /^(season\s*\d+|s\d+)$/i.test(name.trim())) && (seriesData?.Name || seriesData?.name)) {
              name = seriesData.Name || seriesData.name;
            }
          }
        }

        if (seriesId && (item.Id || item.id)) {
          const epInfo = await fetchLatestEpisodeForSeason(cleanUrl, seriesId, item.Id || item.id, userId, headers, apiKey);
          if (epInfo?.addedText) {
            addedText = epInfo.addedText;
            if (epInfo.latestEp?.MediaSources) {
              item.MediaSources = epInfo.latestEp.MediaSources;
            }
          }
        }

        if (!addedText || addedText === 'Added') {
          const seasonNum = indexNumber ?? (item.Name ? item.Name.match(/\d+/)?.[0] : null);
          if (seasonNum) {
            addedText = `Season ${seasonNum} added`;
          } else {
            addedText = item.Name ? `${item.Name} added` : 'Season added';
          }
        }
      } else if (itemType === 'series') {
        isSeries = true;
      }

      // Universal guard against orphan/unresolved season or episode titles
      if (/^(season\s*\d+|s\d+|episode\s*\d+|e\d+)$/i.test(name.trim())) {
        if (seriesName) {
          name = seriesName;
          isSeries = true;
        } else if (seriesId) {
          const seriesData = await fetchSeriesDetails(cleanUrl, seriesId, userId, headers, apiKey);
          if (seriesData?.Name || seriesData?.name) {
            name = seriesData.Name || seriesData.name;
            isSeries = true;
          }
        }
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
        const providerIds = search.jfItem.ProviderIds || search.jfItem.providerIds || {};
        const tmdbId = providerIds.Tmdb || providerIds.tmdb || providerIds.TMDB || null;
        const overview = search.jfItem.Overview ?? search.jfItem.overview;
        const rating = search.jfItem.CommunityRating ?? search.jfItem.communityRating;
        const genres = search.jfItem.Genres || search.jfItem.genres || [];

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
                   tmdbId,
                   year: search.year,
                   overview,
                   rating,
                   resolution: null,
                   genres,
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
            let searchRes = await axios.post(`${openlistUrl}/api/fs/search`, {
              parent: base || '/',
              keywords: query,
              scope: 1, // folders only
              page: 1,
              per_page: 100,
              password: ""
            }, { headers: { Authorization: token } }).catch(() => null);
            if (searchRes?.data?.data?.content && searchRes.data.data.content.length > 0) {
                content.push(...searchRes.data.data.content);
                break;
            }
        }

        if (content.length === 0 && base && base !== '/') {
            for (const query of queriesToTry) {
                let searchRes = await axios.post(`${openlistUrl}/api/fs/search`, {
                  parent: '/',
                  keywords: query,
                  scope: 1,
                  page: 1,
                  per_page: 100,
                  password: ""
                }, { headers: { Authorization: token } }).catch(() => null);
                if (searchRes?.data?.data?.content && searchRes.data.data.content.length > 0) {
                    content.push(...searchRes.data.data.content);
                    break;
                }
            }
        }

        const cleanTitleNorm = normalizeStr(cleanSearchTitle);
        const rawTitleNorm = normalizeStr(search.name);
        const yearStr = search.year ? String(search.year) : null;

        let bestCandidate: any = null;
        let bestScore = -1;

        for (const c of content) {
          if (!c.is_dir) continue;
          if (/^(season\s*\d+|s\d+|specials)$/i.test(c.name.trim())) continue;

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
          let resolution = null;
          const sources = search.jfItem.MediaSources || search.jfItem.mediaSources || [];
          if (sources.length > 0) {
              const streams = sources[0].MediaStreams || sources[0].mediaStreams || [];
              const videoStreams = streams.filter((s: any) => {
                const streamType = (s.Type || s.type || '').toLowerCase();
                const codec = (s.Codec || s.codec || '').toLowerCase();
                return streamType === 'video' && !['mjpeg','png','jpeg','jpg','bmp','gif'].includes(codec);
              });
              if (videoStreams.length > 0) {
                  const bestStream = videoStreams.reduce((prev: any, current: any) => {
                    const prevH = prev.Height ?? prev.height ?? 0;
                    const currH = current.Height ?? current.height ?? 0;
                    return prevH > currH ? prev : current;
                  });
                  const displayTitle = bestStream.DisplayTitle || bestStream.displayTitle;
                  if (displayTitle) {
                      const m = displayTitle.match(/(\d{3,4}p|4k|8k)/i);
                      if (m) resolution = m[1].toUpperCase();
                  }
                  const streamHeight = bestStream.Height ?? bestStream.height;
                  if (!resolution && streamHeight) {
                      if (streamHeight >= 2160) resolution = '4K';
                      else if (streamHeight >= 1440) resolution = '2K';
                      else if (streamHeight >= 1080) resolution = '1080p';
                      else if (streamHeight >= 720) resolution = '720p';
                      else if (streamHeight >= 480) resolution = '480p';
                      else resolution = `${streamHeight}p`;
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
                 overview,
                 rating,
                 resolution,
                 genres,
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
