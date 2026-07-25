import axios from 'axios';

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
  if (!cleanName) cleanName = baseName.trim() || "Unknown";
  return { cleanName, year };
}

export interface OgMeta {
  title: string;
  description: string;
  image: string;
  url: string;
  type: string;
}

export async function getOgMetadataForUrl(
  reqUrl: string,
  hostUrl: string,
  tmdbCache: Record<string, any> = {}
): Promise<OgMeta> {
  const defaultTitle = process.env.OG_TITLE || process.env.VITE_OG_TITLE || "SHUTTER! - Unlimited Movies, Series & Anime";
  const defaultDesc = process.env.OG_DESCRIPTION || process.env.VITE_OG_DESCRIPTION || process.env.VITE_SITE_DESCRIPTION || "Stream and explore unlimited movies, TV series, and anime with rich metadata, posters, and high-speed streaming.";
  const defaultImage = process.env.OG_IMAGE || process.env.VITE_OG_IMAGE || process.env.VITE_SITE_LOGO || "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1200&h=630&fit=crop";

  const cleanHost = (hostUrl || process.env.APP_URL || '').replace(/\/$/, '');
  const canonicalUrl = `${cleanHost}${reqUrl}`;

  if (!reqUrl.startsWith('/home/')) {
    return {
      title: defaultTitle,
      description: defaultDesc,
      image: defaultImage,
      url: canonicalUrl,
      type: 'website'
    };
  }

  try {
    const relativePath = decodeURIComponent(reqUrl.replace(/^\/home\//, '')).replace(/\/+$/, '');
    const parts = relativePath.split('/').filter(Boolean);
    if (parts.length === 0) {
      return { title: defaultTitle, description: defaultDesc, image: defaultImage, url: canonicalUrl, type: 'website' };
    }

    const category = (parts[0] || '').toUpperCase();
    let searchName = parts[parts.length - 1];

    // Handle Season / Special subfolders
    if (/^(s\d+|season\s*\d+|specials)$/i.test(searchName) && parts.length > 1) {
      searchName = parts[parts.length - 2];
    }

    const { cleanName, year } = parseMediaName(searchName);
    const baseQuery = cleanName.toLowerCase().trim();
    const baseKey = `${category}-${baseQuery}`;
    const cacheKey = `${category}-${baseQuery}${year ? `-${year}` : ''}`;

    let tmdbData: any = null;

    // 1. Check overridden or cached in tmdbCache
    const overriddenKey = Object.keys(tmdbCache).find(k => k.startsWith(baseKey) && tmdbCache[k]?._overridden);
    if (overriddenKey) {
      tmdbData = tmdbCache[overriddenKey];
    } else if (tmdbCache[cacheKey]) {
      tmdbData = tmdbCache[cacheKey];
    } else if (tmdbCache[baseKey]) {
      tmdbData = tmdbCache[baseKey];
    }

    // 2. Fetch from TMDB if missing and TMDB key is available
    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbData && tmdbKey) {
      const searchType = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(category) ? 'tv' : 'movie';
      let apiUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(cleanName)}`;
      if (year) {
        apiUrl += searchType === 'movie' ? `&primary_release_year=${year}` : `&first_air_date_year=${year}`;
      }

      try {
        const res = await axios.get(apiUrl, { timeout: 3000 });
        if (res.data?.results?.length > 0) {
          tmdbData = res.data.results[0];
          tmdbCache[cacheKey] = tmdbData;
        } else if (year) {
          // Retry without year
          const noYearUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(cleanName)}`;
          const noYearRes = await axios.get(noYearUrl, { timeout: 3000 });
          if (noYearRes.data?.results?.length > 0) {
            tmdbData = noYearRes.data.results[0];
            tmdbCache[cacheKey] = tmdbData;
          }
        }
      } catch (e) {
        // Silently handle timeout/error
      }
    }

    if (tmdbData) {
      const mediaTitle = tmdbData.title || tmdbData.name || cleanName;
      const releaseDate = tmdbData.release_date || tmdbData.first_air_date || '';
      const releaseYear = (releaseDate || year || '').substring(0, 4);
      const titleStr = `${mediaTitle}${releaseYear ? ` (${releaseYear})` : ''} - SHUTTER!`;

      let overviewStr = tmdbData.overview ? tmdbData.overview.trim() : `Watch and stream ${mediaTitle} on SHUTTER!`;
      if (overviewStr.length > 280) {
        overviewStr = overviewStr.substring(0, 277) + '...';
      }

      let imageStr = defaultImage;
      if (tmdbData.poster_path) {
        imageStr = tmdbData.poster_path.startsWith('http') 
          ? tmdbData.poster_path 
          : `https://image.tmdb.org/t/p/w780${tmdbData.poster_path}`;
      } else if (tmdbData.backdrop_path) {
        imageStr = tmdbData.backdrop_path.startsWith('http')
          ? tmdbData.backdrop_path
          : `https://image.tmdb.org/t/p/w1280${tmdbData.backdrop_path}`;
      }

      const isTv = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(category);

      return {
        title: titleStr,
        description: overviewStr,
        image: imageStr,
        url: canonicalUrl,
        type: isTv ? 'video.tv_show' : 'video.movie'
      };
    }

    // Fallback if TMDB lookup yielded no data
    const formattedCleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    const titleStr = `${formattedCleanName}${year ? ` (${year})` : ''} - SHUTTER!`;
    return {
      title: titleStr,
      description: `Watch ${formattedCleanName} on SHUTTER!`,
      image: defaultImage,
      url: canonicalUrl,
      type: 'video.other'
    };
  } catch (err) {
    return { title: defaultTitle, description: defaultDesc, image: defaultImage, url: canonicalUrl, type: 'website' };
  }
}

export function injectOgTags(html: string, meta: OgMeta): string {
  const escapeHtml = (str: string) =>
    str.replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')
       .replace(/'/g, '&#039;');

  const titleEsc = escapeHtml(meta.title);
  const descEsc = escapeHtml(meta.description);
  const imageEsc = escapeHtml(meta.image);
  const urlEsc = escapeHtml(meta.url);

  let result = html;
  if (/<title>.*?<\/title>/i.test(result)) {
    result = result.replace(/<title>.*?<\/title>/i, `<title>${titleEsc}</title>`);
  } else {
    result = result.replace(/<head>/i, `<head>\n    <title>${titleEsc}</title>`);
  }

  // Remove existing og/twitter/description tags to prevent duplicates
  result = result
    .replace(/<meta\s+property=["']og:[^"']+["']\s+content=["'][^"']*["']\s*\/?>/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["']\s+content=["'][^"']*["']\s*\/?>/gi, '')
    .replace(/<meta\s+name=["']description["']\s+content=["'][^"']*["']\s*\/?>/gi, '');

  const metaTags = `
    <meta name="description" content="${descEsc}" />
    <meta property="og:site_name" content="SHUTTER!" />
    <meta property="og:type" content="${meta.type}" />
    <meta property="og:title" content="${titleEsc}" />
    <meta property="og:description" content="${descEsc}" />
    <meta property="og:image" content="${imageEsc}" />
    <meta property="og:image:secure_url" content="${imageEsc}" />
    <meta property="og:url" content="${urlEsc}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${titleEsc}" />
    <meta name="twitter:description" content="${descEsc}" />
    <meta name="twitter:image" content="${imageEsc}" />`;

  return result.replace(/<\/head>/i, `${metaTags}\n  </head>`);
}
