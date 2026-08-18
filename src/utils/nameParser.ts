export function parseMediaName(rawName: string) {
  const baseName = rawName.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i, "");
  let cleanName = baseName;

  // Strip common season/episode patterns so they don't break TMDB search
  // e.g. S01E01, S01, E01, Season 1
  const seMatch = cleanName.match(/(?:^|[._\-\s])([sS]\d{1,2}[eE]\d{1,3}|[sS]\d{1,2}[\s\-]*(?:[eE][pP]?)?\s*\d{1,3}|[eE]\d{1,3}(?:-[eE]?\d{1,3})?|[eE][pP]?(?:isode)?\s*\d{1,3}|[sS]eason\s*\d{1,2})(?:[._\-\s]|$)/i);
  
  if (seMatch && seMatch.index !== undefined && seMatch.index > 0) {
      cleanName = cleanName.substring(0, seMatch.index);
  } else {
      // If it starts with it, just replace it
      cleanName = cleanName.replace(/(?:^|[._\-\s])([sS]\d{1,2}[eE]\d{1,3}|[sS]\d{1,2}[\s\-]*(?:[eE][pP]?)?\s*\d{1,3}|[eE]\d{1,3}(?:-[eE]?\d{1,3})?|[eE][pP]?(?:isode)?\s*\d{1,3}|[sS]eason\s*\d{1,2})(?:[._\-\s]|$)/gi, " ");
  }

  // Extract year FIRST
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
  
  if (!cleanName) {
      cleanName = baseName.trim();
  }
  if (!cleanName) {
      cleanName = "Unknown";
  }
  
  return { cleanName, year };
}

export function formatBytes(bytes: number, decimals = 1) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i < 0) return '';
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function extractFileMetadata(filename: string, fileSize?: number) {
  const name = filename.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i, "");

  // Resolution
  let resolution = '';
  if (/(2160p|4k|8k)/i.test(name)) resolution = '4K';
  else if (/(1080p|1080i)/i.test(name)) resolution = '1080p';
  else if (/(720p)/i.test(name)) resolution = '720p';
  else if (/(480p|576p|360p)/i.test(name)) resolution = '480p';

  // Codec
  let codec = '';
  if (/(hevc|h\.?265|x265|10bit)/i.test(name)) codec = 'HEVC';
  else if (/(h\.?264|x264|avc)/i.test(name)) codec = 'H264';
  else if (/(av1)/i.test(name)) codec = 'AV1';

  // Season & Episode numbers
  let seasonNum: number | null = null;
  let episodeNum: number | null = null;
  let episodeNumEnd: number | null = null;

  let sEPattern = /[sS](\d{1,2})[eE](\d{1,3})(?:-[eE]?(\d{1,3}))?/i.exec(name);
  if (!sEPattern) {
    sEPattern = /[sS](\d{1,2})[\s\-]+(?:[eE][pP]?)?\s*(\d{1,3})(?!\d)/i.exec(name);
  }

  if (sEPattern) {
    seasonNum = parseInt(sEPattern[1], 10);
    episodeNum = parseInt(sEPattern[2], 10);
    if (sEPattern[3]) {
      episodeNumEnd = parseInt(sEPattern[3], 10);
    }
  } else {
    const ePattern = /\b[eE](\d{1,3})(?:-[eE]?(\d{1,3}))?\b/i.exec(name) || /\bep(?:isode)?\s*(\d{1,3})(?:-\s*(\d{1,3}))?\b/i.exec(name);
    if (ePattern) {
      episodeNum = parseInt(ePattern[1], 10);
      if (ePattern[2]) {
        episodeNumEnd = parseInt(ePattern[2], 10);
      }
    } else {
      // Fallback for standalone episode numbers: " - 02", "02 - Title"
      const regex = /(?<=^|\s-\s)0*(\d{1,4})(?=\s|v\d+|$|-)/g;
      let match;
      while ((match = regex.exec(name)) !== null) {
          const num = parseInt(match[1], 10);
          if (num < 1900 || num > 2100) {
              episodeNum = num;
          }
      }
    }
  }

  const formattedSize = fileSize ? formatBytes(fileSize) : '';

  return {
    resolution,
    codec,
    seasonNum,
    episodeNum,
    episodeNumEnd,
    formattedSize
  };
}

