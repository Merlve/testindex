const fs = require('fs');
let code = fs.readFileSync('src/components/ItemCard.tsx', 'utf-8');
code = code.replace(
    "await axios.post('/api/jellyfin/override', {",
    "await axios.post('/api/jellyfin/override', {"
);
code = code.replace(
    /alert\('Saved! Please click Fetch on Recently Added to refresh.'\);/g,
    "try { await axios.get('/api/jellyfin/recently-added?force=true&refresh=true'); } catch(e) {} queryClient.invalidateQueries(); alert('Saved!');"
);
fs.writeFileSync('src/components/ItemCard.tsx', code);
