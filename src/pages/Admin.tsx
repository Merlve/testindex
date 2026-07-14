import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { parseMediaName } from '../utils/nameParser';

export default function Admin() {
  const { token } = useAuth();
  const [config, setConfig] = useState({ openlistUrl: '', basePath: '' });
  const [msg, setMsg] = useState('');
  
  // TMDB Correction State
  const [tmdbQuery, setTmdbQuery] = useState('');
  const [tmdbType, setTmdbType] = useState('movie');
  const [tmdbData, setTmdbData] = useState('');

  // Auto Fetch
  const [autoFetchPath, setAutoFetchPath] = useState('');
  const [autoFetchMsg, setAutoFetchMsg] = useState('');
  const [autoFetchLoading, setAutoFetchLoading] = useState(false);

  useEffect(() => {
    axios.get('/api/config').then(res => {
      setConfig(res.data);
      if (!autoFetchPath) setAutoFetchPath(res.data.basePath || '/home');
    });
  }, []);

  const handleConfigSave = async () => {
    try {
      await axios.post('/api/config', config);
      setMsg('Config saved!');
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      alert('Error saving config');
    }
  };

  const handleTmdbCorrection = async () => {
    try {
      const parsed = JSON.parse(tmdbData);
      const { cleanName, year } = parseMediaName(tmdbQuery);
      await axios.post('/api/tmdb/correct', { query: cleanName, type: tmdbType, year, data: parsed });
      alert('TMDB Metadata corrected!');
    } catch (e) {
      alert('Invalid JSON or server error');
    }
  };

  const handleAutoFetch = async () => {
    setAutoFetchLoading(true);
    setAutoFetchMsg('Starting auto-fetch...');
    try {
      const targetPath = autoFetchPath || config.basePath || '/home';
      let count = 0;

      const scanCategory = async (catPath: string, catName: string) => {
        setAutoFetchMsg(`Scanning category: ${catName} at ${catPath}...`);
        const catRes = await axios.post('/api/fs/list', { reqPath: catPath }, { headers: { Authorization: token } });
        const items = catRes.data.data.content || [];
        let c = 0;
        for (const item of items) {
          const { cleanName, year } = parseMediaName(item.name);
          setAutoFetchMsg(`Checking metadata for: ${cleanName}...`);
          try {
            await axios.get(`/api/tmdb/search?query=${encodeURIComponent(cleanName)}&type=${catName}${year ? `&year=${year}` : ''}`);
            c++;
            // Delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 400));
          } catch (e) {
            console.error(`Failed to fetch tmdb for ${cleanName}`);
          }
        }
        return c;
      };

      if (targetPath === config.basePath || targetPath === '/home') {
        const homeRes = await axios.post('/api/fs/list', { reqPath: targetPath }, { headers: { Authorization: token } });
        const categories = homeRes.data.data.content.filter((c: any) => c.is_dir).map((c: any) => c.name);
        for (const cat of categories) {
          count += await scanCategory(`${targetPath === '/' ? '' : targetPath}/${cat}`, cat);
        }
      } else {
        // Assume targetPath is a category folder itself
        const parts = targetPath.split('/').filter(Boolean);
        const catName = parts[parts.length - 1] || 'UNKNOWN';
        count += await scanCategory(targetPath, catName);
      }

      setAutoFetchMsg(`Finished auto-fetching metadata for ${count} items!`);
    } catch (e: any) {
      setAutoFetchMsg(`Error during auto-fetch: ${e.message}`);
    } finally {
      setAutoFetchLoading(false);
    }
  };

  return (
    <div className="p-12 max-w-4xl mx-auto space-y-12">
      <h2 className="text-3xl font-bold text-white mb-8">Admin Dashboard</h2>

      <div className="bg-[#1a1a22]/80 p-8 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-sm">
        <h3 className="text-xl font-bold text-white mb-4 tracking-tight">Openlist Configuration</h3>
        {msg && <div className="text-green-500 mb-4 text-sm font-bold">{msg}</div>}
        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 mb-2 text-xs font-bold uppercase tracking-wider">Openlist Server URL</label>
            <input 
              className="w-full bg-[#08080a]/50 border border-white/10 rounded-xl px-4 py-3 text-gray-400 cursor-not-allowed"
              value={config.openlistUrl || "Configured via environment variables"}
              disabled
            />
            <p className="text-[10px] text-gray-400 mt-2">Manage server URL and API keys in your environment variables.</p>
          </div>
          <div>
            <label className="block text-gray-400 mb-2 text-xs font-bold uppercase tracking-wider">Base Path</label>
            <input 
              className="w-full bg-[#08080a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-600/50 transition-colors"
              value={config.basePath}
              onChange={e => setConfig({ ...config, basePath: e.target.value })}
            />
          </div>
          <button onClick={handleConfigSave} className="bg-purple-600 text-black px-6 py-2 rounded-xl font-bold hover:bg-purple-400 shadow-lg shadow-purple-600/20 transition-all">Save Configuration</button>
        </div>
      </div>

      <div className="bg-[#1a1a22]/80 p-8 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-sm">
        <h3 className="text-xl font-bold text-white mb-4 tracking-tight">Auto-Fetch Missing Metadata</h3>
        <p className="text-gray-400 mb-4 text-sm">Automatically scans folders and queries TMDB for missing metadata.</p>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 mb-2 text-xs font-bold uppercase tracking-wider">Target Scan Path</label>
            <input 
              className="w-full bg-[#08080a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-600/50 transition-colors"
              value={autoFetchPath}
              onChange={e => setAutoFetchPath(e.target.value)}
              placeholder="/home or /home/ANIME"
            />
          </div>
          <button onClick={handleAutoFetch} disabled={autoFetchLoading} className="bg-blue-500/20 text-blue-400 border border-blue-500/50 px-6 py-2 rounded-xl font-bold hover:bg-blue-500/30 transition-all disabled:opacity-50">
            {autoFetchLoading ? 'Fetching...' : 'Start Auto-Fetch'}
          </button>
          {autoFetchMsg && (
            <p className="text-sm font-mono text-gray-400 bg-black/50 p-4 rounded-xl border border-white/5 whitespace-pre-wrap">{autoFetchMsg}</p>
          )}
        </div>
      </div>

      <div className="bg-[#1a1a22]/80 p-8 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-sm">
        <h3 className="text-xl font-bold text-white mb-4 tracking-tight">Manual TMDB Correction</h3>
        <p className="text-gray-400 mb-4 text-sm">Override TMDB metadata for specific folders.</p>
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-gray-400 mb-2 text-xs font-bold uppercase tracking-wider">Folder Name (Query)</label>
              <input 
                className="w-full bg-[#08080a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-600/50 transition-colors"
                value={tmdbQuery}
                onChange={e => setTmdbQuery(e.target.value)}
              />
            </div>
            <div className="w-48">
              <label className="block text-gray-400 mb-2 text-xs font-bold uppercase tracking-wider">Type (Category)</label>
              <select 
                className="w-full bg-[#08080a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-600/50 transition-colors"
                value={tmdbType}
                onChange={e => setTmdbType(e.target.value)}
              >
                <option value="MOVIES">Movies</option>
                <option value="SERIES">Series</option>
                <option value="ANIME">Anime</option>
                <option value="KDRAMA">ADrama</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-gray-400 mb-2 text-xs font-bold uppercase tracking-wider">JSON Data</label>
            <textarea 
              className="w-full bg-[#08080a] border border-white/10 rounded-xl px-4 py-3 text-white h-48 font-mono text-sm focus:outline-none focus:border-purple-600/50 transition-colors"
              value={tmdbData}
              onChange={e => setTmdbData(e.target.value)}
              placeholder={`{\n  "title": "Correct Title",\n  "overview": "...",\n  "poster_path": "/some_path.jpg",\n  "backdrop_path": "/some_path.jpg"\n}`}
            />
          </div>
          <button onClick={handleTmdbCorrection} className="bg-purple-500/20 text-purple-400 border border-purple-500/50 px-6 py-2 rounded-xl font-bold hover:bg-purple-500/30 transition-all">
            Apply Correction
          </button>
        </div>
      </div>
    </div>
  );
}
