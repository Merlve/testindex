export function parseMediaName(rawName: string) {
  let cleanName = rawName.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm)$/i, "");
  
  // Remove text in brackets first (often contains year or resolution like [2024] or [1080p])
  cleanName = cleanName.replace(/[\(\[].*?[\)\]]/g, "");

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
  
  cleanName = cleanName.replace(/\./g, " ").trim();
  return { cleanName, year };
}
