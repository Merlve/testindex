const fs = require('fs');

let serverTs = fs.readFileSync('server.ts', 'utf8');

const parseMediaNameFunc = `
function parseMediaName(rawName: string) {
  let cleanName = rawName.replace(/\\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i, "");
  cleanName = cleanName.replace(/[\\(\\[].*?[\\)\\]]/g, "");
  const yearRegex = /[._\\-\\s](19\\d{2}|20\\d{2})(?=[._\\-\\s]|$)/g;
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
  cleanName = cleanName.replace(/\\./g, " ").trim();
  return { cleanName, year };
}
`;

if (!serverTs.includes('function parseMediaName')) {
  serverTs = serverTs.replace('function saveConfig() {', parseMediaNameFunc + '\nfunction saveConfig() {');
}

const searchLogic = `
    // Filter results to avoid nuisance
`;

const newSearchLogic = `
    // NEW LOGIC: SEARCH TMDB CACHE for titles available on the app
    try {
      const q = (keywords || '').toLowerCase().trim();
      if (q.length >= 2) {
        const matchingKeys = Object.keys(tmdbCache).filter(key => {
          const entry = tmdbCache[key];
          if (!entry) return false;
          const title = (entry.title || '').toLowerCase();
          const name = (entry.name || '').toLowerCase();
          const orig = (entry.original_name || entry.original_title || '').toLowerCase();
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

          const listUrl = \`\${getOpenlistUrl().replace(/\\/$/, '')}/api/fs/list\`;
          for (const cat of Object.keys(keysByCategory)) {
             try {
                const listRes = await axios.post(listUrl, { path: \`/home/\${cat}\`, password: "" }, { headers: { Authorization: token }});
                if (listRes.data && listRes.data.code === 200 && listRes.data.data && listRes.data.data.content) {
                   const items = listRes.data.data.content;
                   for (const item of items) {
                      const parsed = parseMediaName(item.name);
                      const itemCacheKey = \`\${cat}-\${parsed.cleanName.toLowerCase()}\${parsed.year ? \`-\${parsed.year}\` : ''}\`;
                      if (keysByCategory[cat].has(itemCacheKey)) {
                         const fullPath = \`/home/\${cat}\`;
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
`;

if (!serverTs.includes('NEW LOGIC: SEARCH TMDB CACHE')) {
  serverTs = serverTs.replace(searchLogic, newSearchLogic);
}

fs.writeFileSync('server.ts', serverTs);
console.log('patched successfully');
