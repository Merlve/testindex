import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { parseMediaName } from '../utils/nameParser';
import { Settings, Activity } from 'lucide-react';
import { useSearchParams } from 'react-router';

export default function Admin() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'settings';
  const setActiveTab = (tab: string) => setSearchParams({ tab });

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
  const [autoFetchFailed, setAutoFetchFailed] = useState<{name: string, path: string}[]>([]);

  // Logs
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (activeTab === 'logs') {
      axios.get('/api/admin/logs', { headers: { Authorization: token } }).then(res => setLogs(res.data));
    }
  }, [activeTab, token]);

  useEffect(() => {
    axios.get('/api/config').then(res => {
      setConfig(res.data);
      if (!autoFetchPath) setAutoFetchPath(res.data.basePath || '/home');
    });

    const interval = setInterval(async () => {
      try {
        const res = await axios.get('/api/tmdb/autofetch/status');
        setAutoFetchLoading(res.data.isRunning);
        if (res.data.message) {
          setAutoFetchMsg(res.data.message);
        }
        if (res.data.failedItems) {
          setAutoFetchFailed(res.data.failedItems);
        }
      } catch(e) {}
    }, 1000);
    return () => clearInterval(interval);
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
    if (autoFetchLoading) {
      // Stop it
      await axios.post('/api/tmdb/autofetch/stop');
      setAutoFetchLoading(false);
      return;
    }
    setAutoFetchLoading(true);
    setAutoFetchMsg('Starting auto-fetch...');
    try {
      const targetPath = autoFetchPath || config.basePath || '/home';
      await axios.post('/api/tmdb/autofetch/start', { targetPath }, { headers: { Authorization: token } });
    } catch (e: any) {
      setAutoFetchMsg(`Error during auto-fetch: ${e.message}`);
      setAutoFetchLoading(false);
    }
  };

  return (
    <div className="p-12 max-w-4xl mx-auto space-y-12">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-black dark:text-white">Admin Dashboard</h2>
      </div>

      <div className="flex gap-4 border-b border-black/10 dark:border-white/10 pb-4">
        <button 
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2 font-bold rounded-xl transition-all ${activeTab === 'settings' ? 'bg-purple-600/10 text-purple-400' : 'text-gray-500 hover:text-black dark:hover:text-white'}`}
        >
          <Settings size={18} /> Settings
        </button>
        <button 
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-4 py-2 font-bold rounded-xl transition-all ${activeTab === 'logs' ? 'bg-purple-600/10 text-purple-400' : 'text-gray-500 hover:text-black dark:hover:text-white'}`}
        >
          <Activity size={18} /> Activity Logs
        </button>
      </div>

      {activeTab === 'settings' && (
        <div className="space-y-12">
          <div className="bg-[#fbf4eb]/80 dark:bg-[#1a1a22]/80 p-8 rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl backdrop-blur-sm">
        <h3 className="text-xl font-bold text-black dark:text-white mb-4 tracking-tight">Openlist Configuration</h3>
        {msg && <div className="text-green-500 mb-4 text-sm font-bold">{msg}</div>}
        <div className="space-y-4">
          <div>
            <label className="block text-gray-600 dark:text-gray-400 mb-2 text-xs font-bold uppercase tracking-wider">Openlist Server URL</label>
            <input 
              className="w-full bg-[#fffcf9]/50 dark:bg-[#08080a]/50 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-600 dark:text-gray-400 cursor-not-allowed"
              value={config.openlistUrl || "Configured via environment variables"}
              disabled
            />
            <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-2">Manage server URL and API keys in your environment variables.</p>
          </div>
          <div>
            <label className="block text-gray-600 dark:text-gray-400 mb-2 text-xs font-bold uppercase tracking-wider">Base Path</label>
            <input 
              className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:outline-none focus:border-purple-600/50 transition-colors"
              value={config.basePath}
              onChange={e => setConfig({ ...config, basePath: e.target.value })}
            />
          </div>
          <button onClick={handleConfigSave} className="bg-purple-600 text-black px-6 py-2 rounded-xl font-bold hover:bg-purple-400 shadow-lg shadow-purple-600/20 transition-all">Save Configuration</button>
        </div>
      </div>

      <div className="bg-[#fbf4eb]/80 dark:bg-[#1a1a22]/80 p-8 rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl backdrop-blur-sm">
        <h3 className="text-xl font-bold text-black dark:text-white mb-4 tracking-tight">Auto-Fetch Missing Metadata</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">Automatically scans folders and queries TMDB for missing metadata.</p>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-600 dark:text-gray-400 mb-2 text-xs font-bold uppercase tracking-wider">Target Scan Path</label>
            <input 
              className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:outline-none focus:border-blue-600/50 transition-colors"
              value={autoFetchPath}
              onChange={e => setAutoFetchPath(e.target.value)}
              placeholder="/home or /home/ANIME"
            />
          </div>
          <button onClick={handleAutoFetch} className={`border px-6 py-2 rounded-xl font-bold transition-all ${autoFetchLoading ? 'bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/50 hover:bg-blue-500/30'}`}>
            {autoFetchLoading ? 'Stop Auto-Fetch' : 'Start Auto-Fetch'}
          </button>
          {autoFetchMsg && (
            <p className="text-sm font-mono text-gray-600 dark:text-gray-400 bg-black/50 p-4 rounded-xl border border-black/5 dark:border-white/5 whitespace-pre-wrap">{autoFetchMsg}</p>
          )}
          {autoFetchFailed.length > 0 && (
            <div className="mt-4 bg-red-900/20 border border-red-500/30 p-4 rounded-xl">
              <h4 className="text-red-400 font-bold mb-2 text-sm">Failed to fetch metadata for {autoFetchFailed.length} items:</h4>
              <ul className="text-sm text-red-200/70 max-h-48 overflow-y-auto space-y-1 font-mono">
                {autoFetchFailed.map((item, idx) => (
                  <li key={idx}>• {item.name} <span className="opacity-50 text-xs">({item.path})</span></li>
                ))}
              </ul>
              <p className="text-xs text-red-400/50 mt-2">You can manually correct these below.</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-[#fbf4eb]/80 dark:bg-[#1a1a22]/80 p-8 rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl backdrop-blur-sm">
        <h3 className="text-xl font-bold text-black dark:text-white mb-4 tracking-tight">Manual TMDB Correction</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">Override TMDB metadata for specific folders.</p>
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-gray-600 dark:text-gray-400 mb-2 text-xs font-bold uppercase tracking-wider">Folder Name (Query)</label>
              <input 
                className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:outline-none focus:border-purple-600/50 transition-colors"
                value={tmdbQuery}
                onChange={e => setTmdbQuery(e.target.value)}
              />
            </div>
            <div className="w-48">
              <label className="block text-gray-600 dark:text-gray-400 mb-2 text-xs font-bold uppercase tracking-wider">Type (Category)</label>
              <select 
                className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:outline-none focus:border-purple-600/50 transition-colors"
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
            <label className="block text-gray-600 dark:text-gray-400 mb-2 text-xs font-bold uppercase tracking-wider">JSON Data</label>
            <textarea 
              className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white h-48 font-mono text-sm focus:outline-none focus:border-purple-600/50 transition-colors"
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
      )}

      {activeTab === 'logs' && (
        <div className="bg-[#fbf4eb]/80 dark:bg-[#1a1a22]/80 p-8 rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl backdrop-blur-sm">
          <h3 className="text-xl font-bold text-black dark:text-white mb-4 tracking-tight flex justify-between items-center">
            System Activity Logs
            <button 
              onClick={() => axios.get('/api/admin/logs', { headers: { Authorization: token } }).then(res => setLogs(res.data))}
              className="text-xs bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 px-3 py-1.5 rounded-lg"
            >
              Refresh
            </button>
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">Tracks logins, batch updates, and sensitive operations.</p>
          
          <div className="space-y-4">
            {!Array.isArray(logs) || logs.length === 0 ? (
              <p className="text-gray-500 text-sm">No activity logs found.</p>
            ) : (
              logs.map(log => (
                <div key={log.id} className="bg-[#fffcf9]/50 dark:bg-[#08080a]/50 border border-black/5 dark:border-white/5 rounded-xl p-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                        log.action.includes('Success') ? 'bg-green-500/20 text-green-400' :
                        log.action.includes('Failed') ? 'bg-red-500/20 text-red-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {log.action}
                      </span>
                      <span className="text-sm font-semibold text-black dark:text-white">{log.username}</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{log.details}</p>
                  </div>
                  <div className="text-xs text-gray-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
