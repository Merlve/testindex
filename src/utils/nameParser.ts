export function parseMediaName(rawName: string) {
  let cleanName = rawName.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i, "");
  
  // Remove text in brackets first
  cleanName = cleanName.replace(/[\(\[].*?[\)\]]/g, " ");

  // Find the last year-like pattern in the string
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
