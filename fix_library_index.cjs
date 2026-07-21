const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const newCode = `
let isFetchingLibrary = false;
let libraryFetchPromise = null;

async function getLibraryIndex(token: string, forceRefresh = false) {
   if (!forceRefresh && libraryIndex.length > 0 && (Date.now() - libraryIndexLastUpdated < 15 * 60 * 1000)) {
       return libraryIndex;
   }
   if (libraryFetchPromise && !forceRefresh) {
       return libraryFetchPromise;
   }

   libraryFetchPromise = (async () => {
       try {
            const openlistUrl = getOpenlistUrl().replace(/\\/$/, '');
            const res = await axios.post(\`\${openlistUrl}/api/fs/list\`, { path: appConfig.basePath, password: "" }, { headers: { Authorization: token } });
            if (res.data.code !== 200) return libraryIndex;
            const dirs = (res.data.data?.content || []).filter((c: any) => c.is_dir).map((c: any) => c.name);
            
            const catData = await Promise.all(dirs.map(async (dir: string) => {
                try {
                    const subRes = await axios.post(\`\${openlistUrl}/api/fs/list\`, { path: \`\${appConfig.basePath}/\${dir}\`, password: "" }, { headers: { Authorization: token } });
                    return {
                        name: dir,
                        items: subRes.data?.data?.content || []
                    };
                } catch (e) {
                    return { name: dir, items: [] };
                }
            }));
            
            let allItems: any[] = [];
            for (const c of catData) {
                for (const item of c.items) {
                    const { cleanName, year } = parseMediaName(item.name);
                    allItems.push({ ...item, category: c.name, cleanName, year });
                }
            }
            
            if (allItems.length > 0) {
                libraryIndex = allItems;
                libraryIndexLastUpdated = Date.now();
                saveLibraryIndex();
            }
       } catch(e) {
           console.error("Failed to refresh library index", e);
       } finally {
           libraryFetchPromise = null;
       }
       return libraryIndex;
   })();
   return libraryFetchPromise;
}
`;

code = code.replace(/async function getLibraryIndex\(token: string, forceRefresh = false\) \{[\s\S]*?\n\}\n/, newCode.trim() + '\n\n');
fs.writeFileSync('server.ts', code);
