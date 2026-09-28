import { QueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { parseMediaName, extractFileMetadata } from './nameParser';
import { markImageLoaded } from './imageCache';
import { extractDominantColor } from './colorExtractor';

export const isVideoFile = (filename: string): boolean => {
  return /\.(mp4|mkv|avi|mov|webm|flv|wmv|m4v|ts|m2ts)$/i.test(filename);
};

export const getFolderSeasonNum = (pathStr: string): number | null => {
  if (!pathStr) return null;
  const clean = pathStr.trim();
  if (/(?:^|[^a-z])(specials|extras|special|sp)(?:$|[^a-z])/i.test(clean)) return 0;
  const match = clean.match(/(?:^|[^a-z])(?:season|series|staffel|temporada|s)[\s_.-]*(\d+)/i);
  if (match) return parseInt(match[1], 10);
  const pureNumMatch = clean.match(/^0*(\d{1,2})$/);
  if (pureNumMatch) return parseInt(pureNumMatch[1], 10);
  return null;
};

export interface ResolvedDetailsPaths {
  fullPath: string;
  cleanName: string;
  parsedYear: string;
  actualItemOpenlistPath: string;
  actualFolderOpenlistPath: string;
  isVideoTarget: boolean;
  targetFilename: string;
  isTvMedia: boolean;
}

export function resolveDetailsPaths({
  item,
  category,
  parentPath,
  tmdbData,
  config,
  actualPathOverride,
}: {
  item: any;
  category: string;
  parentPath?: string;
  tmdbData?: any;
  config?: any;
  actualPathOverride?: string | null;
}): ResolvedDetailsPaths {
  const itemName = item?.name || '';
  const sanitizedParent = (parentPath || item?.parent || `/home/${category}`).replace(/^\/+/, '').replace(/\/+$/, '');
  const computedFullPath = itemName ? `${sanitizedParent}/${itemName}` : sanitizedParent;

  const { cleanName, year: parsedYear } = parseMediaName(itemName);

  const rawOpenlistPath =
    actualPathOverride ||
    (tmdbData?.id ? config?.digitalReleasePaths?.[tmdbData.id] : null) ||
    item?.openlist_path ||
    item?.path ||
    computedFullPath;

  const actualItemOpenlistPath = rawOpenlistPath.startsWith('/') ? rawOpenlistPath : `/${rawOpenlistPath}`;
  const targetFilename = actualItemOpenlistPath.split('/').pop() || '';
  const isVideoTarget = Boolean(targetFilename && isVideoFile(targetFilename));
  const actualFolderOpenlistPath = isVideoTarget
    ? actualItemOpenlistPath.substring(0, actualItemOpenlistPath.lastIndexOf('/')) || '/home'
    : actualItemOpenlistPath;

  const catUpper = (category || '').toUpperCase();
  const isMovieCategory = catUpper === 'MOVIES';
  const isTvMedia =
    !isMovieCategory ||
    tmdbData?.media_type === 'tv' ||
    Boolean(tmdbData?.first_air_date) ||
    Boolean(tmdbData?.seasons) ||
    Boolean(tmdbData?.number_of_seasons) ||
    Boolean(tmdbData?.name && !tmdbData?.title) ||
    ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME', 'TV', 'SHOW', 'TV_SHOW', 'ANIMES', 'SHOWS', 'DRAMA', 'CARTOON', 'ANIMATION', 'ASIAN_DRAMA', 'KOREAN_DRAMA', 'DOCUSERIES'].includes(catUpper) ||
    /(series|show|tv|kdrama|adrama|anime|drama|animation|cartoon|serial|docuseries)/i.test(catUpper);

  return {
    fullPath: computedFullPath,
    cleanName,
    parsedYear,
    actualItemOpenlistPath,
    actualFolderOpenlistPath,
    isVideoTarget,
    targetFilename,
    isTvMedia,
  };
}

export interface FolderFilesResult {
  baseFiles: any[];
  seasonFolders: any[];
}

export async function fetchFolderFilesData({
  folderPath,
  token,
  isVideoTarget,
  targetFilename,
  refresh = false,
}: {
  folderPath: string;
  token?: string | null;
  isVideoTarget?: boolean;
  targetFilename?: string;
  refresh?: boolean;
}): Promise<FolderFilesResult> {
  const cleanPath = folderPath.replace(/^\/+/, '');
  const payload: any = { reqPath: cleanPath };
  if (refresh) payload.refresh = true;

  const res = await axios.post('/api/fs/list', payload, {
    headers: token ? { Authorization: token } : {},
  });

  const content = res.data?.data?.content || [];
  if (!Array.isArray(content)) {
    const singleFile = res.data?.data;
    if (singleFile && !singleFile.is_dir && isVideoFile(singleFile.name)) {
      return { baseFiles: [singleFile], seasonFolders: [] };
    }
    return { baseFiles: [], seasonFolders: [] };
  }

  const dirFolders = content.filter((item: any) => item.is_dir);
  let dirFiles = content.filter((item: any) => !item.is_dir && isVideoFile(item.name));

  if (isVideoTarget && targetFilename) {
    const parentLower = folderPath.toLowerCase().replace(/^\/+/, '');
    if (
      parentLower === 'home/movies' ||
      parentLower === 'home/shows' ||
      parentLower === 'home/anime' ||
      parentLower === 'home' ||
      parentLower === ''
    ) {
      dirFiles = dirFiles.filter((f: any) => f.name === targetFilename);
      dirFolders.length = 0;
    }
  }

  dirFiles.sort((a: any, b: any) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );
  dirFolders.sort((a: any, b: any) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );

  return { baseFiles: dirFiles, seasonFolders: dirFolders };
}

export async function fetchSeasonEpisodesData({
  seasonPath,
  token,
  refresh = false,
}: {
  seasonPath: string;
  token?: string | null;
  refresh?: boolean;
}): Promise<any[]> {
  const cleanPath = seasonPath.replace(/^\/+/, '');
  const payload: any = { reqPath: cleanPath };
  if (refresh) payload.refresh = true;

  const res = await axios.post('/api/fs/list', payload, {
    headers: token ? { Authorization: token } : {},
  });

  const content = res.data?.data?.content || [];
  const episodes = content.filter((item: any) => !item.is_dir && isVideoFile(item.name));
  episodes.sort((a: any, b: any) => {
    const metaA = extractFileMetadata(a.name, a.size);
    const metaB = extractFileMetadata(b.name, b.size);
    if (metaA.episodeNum !== null && metaB.episodeNum !== null) {
      return metaA.episodeNum - metaB.episodeNum;
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  return episodes;
}

export async function fetchDetailsMetadata({
  cleanName,
  category,
  parsedYear,
  actualOpenlistPath,
  tmdbId,
  isTvMedia = false,
}: {
  cleanName: string;
  category: string;
  parsedYear: string;
  actualOpenlistPath: string;
  tmdbId?: any;
  isTvMedia?: boolean;
}): Promise<any> {
  let url = `/api/meta/search?query=${encodeURIComponent(cleanName)}&type=${encodeURIComponent(
    category
  )}&year=${encodeURIComponent(parsedYear)}&path=${encodeURIComponent(actualOpenlistPath)}&full=true`;
  if (tmdbId) {
    url += `&tmdbId=${encodeURIComponent(tmdbId)}`;
  }

  let data: any = null;
  try {
    const res = await axios.get(url);
    if (res.data && (res.data.poster_path || res.data._overridden || res.data.title || res.data.name)) {
      data = res.data;
    }
  } catch (e) {}

  if (!data) {
    try {
      const fallbackUrl = `/api/meta/search_all?query=${encodeURIComponent(
        cleanName
      )}&type=${encodeURIComponent(category)}&year=${encodeURIComponent(parsedYear)}${
        tmdbId ? `&tmdbId=${encodeURIComponent(tmdbId)}` : ''
      }`;
      const fallbackRes = await axios.get(fallbackUrl);
      if (fallbackRes.data?.results?.[0]) {
        data = fallbackRes.data.results[0];
      }
    } catch (e) {}
  }

  // If TV media and status or seasons are missing, fetch full TV details
  if (data && isTvMedia && (!data.status || !data.seasons)) {
    const targetTvId = data.id || tmdbId;
    if (targetTvId) {
      try {
        const tvRes = await axios.get(`/api/meta/tv_details?tvId=${targetTvId}`);
        if (tvRes.data) {
          data = {
            ...data,
            ...tvRes.data,
            status: tvRes.data.status || data.status,
            in_production:
              tvRes.data.in_production !== undefined ? tvRes.data.in_production : data.in_production,
            seasons: tvRes.data.seasons || data.seasons,
            number_of_seasons: tvRes.data.number_of_seasons || data.number_of_seasons,
            number_of_episodes: tvRes.data.number_of_episodes || data.number_of_episodes,
            tagline: tvRes.data.tagline || data.tagline,
            genres: tvRes.data.genres && tvRes.data.genres.length > 0 ? tvRes.data.genres : data.genres,
            _synced: true,
          };
        }
      } catch (e) {}
    }
  }

  return data;
}

export async function fetchLogoData({
  cleanName,
  category,
  parsedYear,
  tmdbId,
  isTvMedia = false,
}: {
  cleanName?: string;
  category?: string;
  parsedYear?: string;
  tmdbId?: any;
  isTvMedia?: boolean;
}): Promise<string | null> {
  if (!tmdbId) return null;
  const isTv =
    isTvMedia ||
    ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME', 'TV', 'SHOW', 'TV_SHOW', 'ANIMES', 'SHOWS'].includes(
      (category || '').toUpperCase()
    );
  const searchType = isTv ? 'tv' : 'movie';
  try {
    const res = await axios.get(`/api/meta/images?id=${tmdbId}&type=${searchType}`);
    const logos = res.data?.logos || [];
    if (logos.length > 0) {
      const bestLogo =
        logos.find((l: any) => l.iso_639_1 === 'en') ||
        logos.find((l: any) => !l.iso_639_1) ||
        logos[0];
      if (bestLogo?.file_path) {
        const fullUrl = bestLogo.file_path.startsWith('http')
          ? bestLogo.file_path
          : `https://image.tmdb.org/t/p/original${bestLogo.file_path}`;
        if (typeof window !== 'undefined') {
          const img = new Image();
          img.src = fullUrl;
          img.onload = () => markImageLoaded(fullUrl);
        }
        return fullUrl;
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

// In-flight and recent prefetch registry to avoid redundant calls
const prefetchedPaths = new Map<string, number>();
const PREFETCH_TTL = 30000; // 30 seconds

export function prefetchItemDetails(
  queryClient: QueryClient,
  {
    item,
    category,
    parentPath,
    tmdbData,
    token,
    config,
  }: {
    item: any;
    category: string;
    parentPath?: string;
    tmdbData?: any;
    token?: string | null;
    config?: any;
  }
) {
  if (!item || !item.name) return;

  const {
    cleanName,
    parsedYear,
    actualItemOpenlistPath,
    actualFolderOpenlistPath,
    isVideoTarget,
    targetFilename,
    isTvMedia,
  } = resolveDetailsPaths({ item, category, parentPath, tmdbData, config });

  const now = Date.now();
  const lastPrefetch = prefetchedPaths.get(actualItemOpenlistPath) || 0;
  if (now - lastPrefetch < PREFETCH_TTL) {
    return; // Already prefetched recently
  }
  prefetchedPaths.set(actualItemOpenlistPath, now);

  const tmdbId = item?._jf?.tmdbId || item?.tmdbId || tmdbData?.id;

  // 1. Prefetch full metadata into QueryClient
  queryClient.prefetchQuery({
    queryKey: ['details-meta', actualItemOpenlistPath, cleanName, category, parsedYear, tmdbId],
    queryFn: async () => {
      const data = await fetchDetailsMetadata({
        cleanName,
        category,
        parsedYear,
        actualOpenlistPath: actualItemOpenlistPath,
        tmdbId,
        isTvMedia,
      });

      // Preload backdrop & poster images if discovered
      if (data?.backdrop_path && typeof window !== 'undefined') {
        const bgUrl = data.backdrop_path.startsWith('http')
          ? data.backdrop_path
          : `https://image.tmdb.org/t/p/w1280${data.backdrop_path}`;
        const img = new Image();
        img.src = bgUrl;
        img.onload = () => {
          markImageLoaded(bgUrl);
          extractDominantColor(bgUrl).catch(() => {});
        };
      }
      if (data?.poster_path && typeof window !== 'undefined') {
        const postUrl = data.poster_path.startsWith('http')
          ? data.poster_path
          : `https://image.tmdb.org/t/p/w500${data.poster_path}`;
        const pImg = new Image();
        pImg.src = postUrl;
        pImg.onload = () => markImageLoaded(postUrl);
      }

      // If TV show, also prefetch TMDB season 1 details
      if (isTvMedia && data?.id) {
        queryClient.prefetchQuery({
          queryKey: ['details-tmdb-season', data.id, 1],
          queryFn: async () => {
            const res = await axios.get(`/api/meta/tv_season?tvId=${data.id}&season=1`);
            return res.data;
          },
          staleTime: 24 * 60 * 60 * 1000,
        });
      }

      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // 2. Prefetch folder files into QueryClient
  if (token) {
    queryClient.prefetchQuery({
      queryKey: ['details-folder-files', actualFolderOpenlistPath, isVideoTarget, targetFilename, 0],
      queryFn: async () => {
        const res = await fetchFolderFilesData({
          folderPath: actualFolderOpenlistPath,
          token,
          isVideoTarget,
          targetFilename,
          refresh: false,
        });

        // 3. For TV series, if season folders exist, automatically prefetch the first season's episodes!
        if (res.seasonFolders && res.seasonFolders.length > 0) {
          const firstSeasonFolder = res.seasonFolders[0];
          const firstSeasonPath = `${actualFolderOpenlistPath.replace(/^\/+/, '')}/${firstSeasonFolder.name}`;
          queryClient.prefetchQuery({
            queryKey: ['details-season-episodes', firstSeasonPath, 0],
            queryFn: () =>
              fetchSeasonEpisodesData({
                seasonPath: firstSeasonPath,
                token,
                refresh: false,
              }),
            staleTime: 5 * 60 * 1000,
          });
        }

        return res;
      },
      staleTime: 5 * 60 * 1000,
    });

    // Also prefetch default "Season 1" path for TV media
    if (isTvMedia) {
      const season1Path = `${actualFolderOpenlistPath.replace(/^\/+/, '')}/Season 1`;
      queryClient.prefetchQuery({
        queryKey: ['details-season-episodes', season1Path, 0],
        queryFn: () =>
          fetchSeasonEpisodesData({
            seasonPath: season1Path,
            token,
            refresh: false,
          }),
        staleTime: 5 * 60 * 1000,
      });
    }
  }

  // 4. Prefetch logo
  if (!tmdbData?.custom_logo && !tmdbData?.logo_path) {
    queryClient.prefetchQuery({
      queryKey: ['details-logo', cleanName, category, parsedYear, tmdbId],
      queryFn: () => fetchLogoData({ cleanName, category, parsedYear, tmdbId, isTvMedia }),
      staleTime: 24 * 60 * 60 * 1000,
    });
  }

  // 5. Preload high-res backdrop image into browser cache & extract dominant color
  const backdrop = tmdbData?.backdrop_path;
  if (backdrop && typeof window !== 'undefined') {
    const backdropUrl = backdrop.startsWith('http')
      ? backdrop
      : `https://image.tmdb.org/t/p/w1280${backdrop}`;
    const img = new Image();
    img.src = backdropUrl;
    img.onload = () => {
      markImageLoaded(backdropUrl);
      extractDominantColor(backdropUrl).catch(() => {});
    };
  }
}
