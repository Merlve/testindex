import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { parseMediaName } from '../utils/nameParser';
import { Settings, Activity, Download, Trophy, Flame, Trash2, RefreshCw, Database, SearchX, UploadCloud } from 'lucide-react';
import { useSearchParams } from 'react-router';

export default function Admin() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'settings';
  const setActiveTab = (tab: string) => setSearchParams({ tab });

  const [config, setConfig] = useState({ openlistUrl: '', basePath: '', inactivityTimeout: 0 });
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
  
  // Scans
  const [creditsScanLoading, setCreditsScanLoading] = useState(false);
  const [creditsScanMsg, setCreditsScanMsg] = useState('');

  const [missingMetadata, setMissingMetadata] = useState<any[]>([]);
  const [loadingMissing, setLoadingMissing] = useState(false);
  const [refreshingMissing, setRefreshingMissing] = useState(false);
  const [fixModalItem, setFixModalItem] = useState<any>(null);
  const [fixModalInput, setFixModalInput] = useState('');
  const [fixModalLoading, setFixModalLoading] = useState(false);
  const [fixModalSearchResults, setFixModalSearchResults] = useState<any[]>([]);
  const [fixModalSearching, setFixModalSearching] = useState(false);
  const fixModalSearchTimeoutRef = useRef<any>(null);

  const fetchMissingMetadata = async () => {
    setLoadingMissing(true);
    try {
      const res = await axios.get('/api/admin/missing-metadata', { headers: { Authorization: token } });
      setMissingMetadata(res.data.missing || []);
    } catch(e) {
      console.error(e);
    }
    setLoadingMissing(false);
  };
  
  const handleFixMissing = (item: any) => {
    setFixModalItem(item);
    setFixModalInput(item.name || '');
    setFixModalSearchResults([]);
    handleSearchTMDBModal(item.name || '', item.category);
  };

  const handleSearchTMDBModal = (query: string, category: string) => {
    setFixModalInput(query);
    if (!query) {
      setFixModalSearchResults([]);
      return;
    }
    if (fixModalSearchTimeoutRef.current) clearTimeout(fixModalSearchTimeoutRef.current);
    fixModalSearchTimeoutRef.current = setTimeout(async () => {
      setFixModalSearching(true);
      try {
        let isId = /^\d+$/.test(query.trim());
        let finalQuery = query.trim();
        if (query.toLowerCase().startsWith('id:')) {
           isId = true;
           finalQuery = query.substring(3).trim();
        } else if (query.toLowerCase().startsWith('tmdb:')) {
           isId = true;
           finalQuery = query.substring(5).trim();
        }
        const url = `/api/meta/search_all?query=${encodeURIComponent(finalQuery)}&type=${category}${isId ? `&tmdbId=${finalQuery}` : ''}`;
        const res = await axios.get(url, { headers: { Authorization: localStorage.getItem('shindex_token') || '' } });
        setFixModalSearchResults(res.data.results || []);
      } catch(e) {}
      setFixModalSearching(false);
    }, 500);
  };

  const submitFixMetadataId = async (tmdbId: string) => {
    if (!fixModalItem) return;
    setFixModalLoading(true);
    try {
      await axios.post('/api/meta/override', {
        query: fixModalItem.cleanName || fixModalItem.name,
        type: fixModalItem.category,
        year: fixModalItem.year,
        tmdbId: tmdbId,
        path: fixModalItem.path
      }, { headers: { Authorization: token } });
      setFixModalItem(null);
      fetchMissingMetadata();
    } catch (e: any) {
      alert(`Failed to fix metadata: ${e.message}`);
    }
    setFixModalLoading(false);
  };

  const submitFixMetadata = async () => {
    if (!fixModalItem || !fixModalInput) return;
    setFixModalLoading(true);
    try {
      await axios.post('/api/meta/override', {
        query: fixModalItem.cleanName || fixModalItem.name,
        type: fixModalItem.category,
        year: fixModalItem.year,
        tmdbId: fixModalInput,
        path: fixModalItem.path
      }, { headers: { Authorization: token } });
      setFixModalItem(null);
      fetchMissingMetadata();
    } catch (e: any) {
      alert(`Failed to fix metadata: ${e.message}`);
    }
    setFixModalLoading(false);
  };

  const refreshMissingMetadata = async () => {
    if (missingMetadata.length === 0) return;
    setRefreshingMissing(true);
    try {
      const res = await axios.post('/api/admin/missing-metadata/refresh', { items: missingMetadata }, { headers: { Authorization: token } });
      setMsg(`Refreshed ${res.data.refreshedCount} items successfully!`);
      setTimeout(() => setMsg(''), 3000);
      fetchMissingMetadata();
    } catch(e) {
       console.error(e);
       setMsg('Failed to refresh missing metadata.');
       setTimeout(() => setMsg(''), 3000);
    }
    setRefreshingMissing(false);
  };

  const [collectionScanLoading, setCollectionScanLoading] = useState(false);
  const [collectionScanMsg, setCollectionScanMsg] = useState('');

  // Logs
  const [logs, setLogs] = useState<any[]>([]);

  // Downloads analytics
  const [topDownloads, setTopDownloads] = useState<any[]>([]);
  const [refreshingDownloads, setRefreshingDownloads] = useState(false);

  const fetchTopDownloads = async () => {
    setRefreshingDownloads(true);
    try {
      const res = await axios.get('/api/downloads/top');
      setTopDownloads(res.data?.topDownloads || []);
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshingDownloads(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'logs') {
      axios.get('/api/admin/logs', { headers: { Authorization: token } }).then(res => setLogs(res.data));

    } else if (activeTab === 'downloads') {
      fetchTopDownloads();
    } else if (activeTab === 'missing-metadata') {
      fetchMissingMetadata();
    }

  }, [activeTab, token]);

  useEffect(() => {
    axios.get('/api/config').then(res => {
      setConfig(res.data);
      if (!autoFetchPath) setAutoFetchPath(res.data.basePath || '/home');
    });

    const interval = setInterval(async () => {
      try {
        const res = await axios.get('/api/meta/autofetch/status');
        setAutoFetchLoading(res.data.isRunning);
        if (res.data.message) {
          setAutoFetchMsg(res.data.message);
        }
        if (res.data.failedItems) {
          setAutoFetchFailed(res.data.failedItems);
        }
      } catch(e) {}
      
      try {
        const res = await axios.get('/api/meta/scan_credits/status');
        setCreditsScanLoading(res.data.isRunning);
        if (res.data.message) {
          setCreditsScanMsg(res.data.message);
        }
      } catch(e) {}
      
      try {
        const res = await axios.get('/api/meta/scan_collections/status');
        setCollectionScanLoading(res.data.isRunning);
        if (res.data.message) {
          setCollectionScanMsg(res.data.message);
        }
      } catch(e) {}
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleConfigSave = async () => {
    try {
      await axios.post('/api/config', config, { headers: { Authorization: token } });
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
      await axios.post('/api/meta/correct', { query: cleanName, type: tmdbType, year, data: parsed }, { headers: { Authorization: token } });
      alert('TMDB Metadata corrected!');
    } catch (e) {
      alert('Invalid JSON or server error');
    }
  };

  const handleAutoFetch = async () => {
    if (autoFetchLoading) {
      // Stop it
      await axios.post('/api/meta/autofetch/stop', {}, { headers: { Authorization: token } });
      setAutoFetchLoading(false);
      return;
    }
    setAutoFetchLoading(true);
    setAutoFetchMsg('Starting auto-fetch...');
    try {
      const targetPath = autoFetchPath || config.basePath || '/home';
      await axios.post('/api/meta/autofetch/start', { targetPath }, { headers: { Authorization: token } });
    } catch (e: any) {
      setAutoFetchMsg(`Error during auto-fetch: ${e.message}`);
      setAutoFetchLoading(false);
    }
  };

  const handleCreditsScan = async () => {
    if (creditsScanLoading) {
      await axios.post('/api/meta/scan_credits/stop', {}, { headers: { Authorization: token } });
      setCreditsScanLoading(false);
      return;
    }
    setCreditsScanLoading(true);
    setCreditsScanMsg('Starting credits scan...');
    try {
      await axios.post('/api/meta/scan_credits/start', {}, { headers: { Authorization: token } });
    } catch (e: any) {
      setCreditsScanMsg(`Error: ${e.message}`);
      setCreditsScanLoading(false);
    }
  };

  const handleCollectionScan = async () => {
    if (collectionScanLoading) {
      await axios.post('/api/meta/scan_collections/stop', {}, { headers: { Authorization: token } });
      setCollectionScanLoading(false);
      return;
    }
    setCollectionScanLoading(true);
    setCollectionScanMsg('Starting collection scan...');
    try {
      await axios.post('/api/meta/scan_collections/start', {}, { headers: { Authorization: token } });
    } catch (e: any) {
      setCollectionScanMsg(`Error: ${e.message}`);
      setCollectionScanLoading(false);
    }
  };

  return (
    <div className="p-3 sm:p-6 md:p-10 max-w-4xl mx-auto space-y-6 sm:space-y-10 pb-28 min-w-0 w-full overflow-hidden">
      <div className="flex justify-between items-center mb-2 sm:mb-4">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-black dark:text-white tracking-tight">Admin Dashboard</h2>
      </div>

      {/* Tabs - Scrollable on mobile */}
      <div className="flex gap-2 border-b border-black/10 dark:border-white/10 pb-3 overflow-x-auto no-scrollbar -mx-1 px-1">
        <button 
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap min-h-[38px] ${activeTab === 'settings' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'}`}
        >
          <Settings size={16} /> Settings
        </button>
        <button 
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap min-h-[38px] ${activeTab === 'logs' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'}`}
        >
          <Activity size={16} /> Activity Logs
        </button>
        <button 
          onClick={() => setActiveTab('downloads')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap min-h-[38px] ${activeTab === 'downloads' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'}`}
        >
          <Download size={16} /> Top 15 Downloads
        </button>

        <button 
          onClick={() => setActiveTab('missing-metadata')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap min-h-[38px] ${activeTab === 'missing-metadata' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'}`}
        >
          <SearchX size={16} />
          Missing Metadata
        </button>
      </div>

      {activeTab === 'settings' && (
        <div className="space-y-6 sm:space-y-8">
          <div className="bg-[#fbf4eb]/80 dark:bg-[#1a1a22]/80 p-4 sm:p-6 md:p-8 rounded-2xl border border-black/10 dark:border-white/10 shadow-xl backdrop-blur-sm">
        <h3 className="text-lg sm:text-xl font-bold text-black dark:text-white mb-4 tracking-tight">Openlist Configuration</h3>
        {msg && <div className="text-green-500 mb-4 text-sm font-bold">{msg}</div>}
        <div className="space-y-4">
          <div>
            <label className="block text-gray-600 dark:text-gray-400 mb-1.5 text-xs font-bold uppercase tracking-wider">Openlist Server URL</label>
            <input 
              className="w-full bg-[#fffcf9]/50 dark:bg-[#08080a]/50 border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-gray-600 dark:text-gray-400 cursor-not-allowed truncate"
              value={config.openlistUrl || "Configured via environment variables"}
              disabled
            />
            <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-1.5">Manage server URL and API keys in your environment variables.</p>
          </div>
          <div>
            <label className="block text-gray-600 dark:text-gray-400 mb-1.5 text-xs font-bold uppercase tracking-wider">Base Path</label>
            <input 
              className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-black dark:text-white focus:outline-none focus:border-purple-600/50 transition-colors"
              value={config.basePath}
              onChange={e => setConfig({ ...config, basePath: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-gray-600 dark:text-gray-400 mb-1.5 text-xs font-bold uppercase tracking-wider">Inactivity Logout Timer (Minutes, 0 to disable)</label>
            <input 
              type="number"
              min="0"
              className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-black dark:text-white focus:outline-none focus:border-purple-600/50 transition-colors"
              value={config.inactivityTimeout}
              onChange={e => setConfig({ ...config, inactivityTimeout: parseInt(e.target.value) || 0 })}
            />
          </div>
          <button onClick={handleConfigSave} className="w-full sm:w-auto bg-purple-600 text-white px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold hover:bg-purple-500 shadow-lg shadow-purple-600/20 transition-all cursor-pointer">
            Save Configuration
          </button>
        </div>
      </div>

      <div className="bg-[#fbf4eb]/80 dark:bg-[#1a1a22]/80 p-4 sm:p-6 md:p-8 rounded-2xl border border-black/10 dark:border-white/10 shadow-xl backdrop-blur-sm">
        <h3 className="text-lg sm:text-xl font-bold text-black dark:text-white mb-2 sm:mb-4 tracking-tight">Auto-Fetch Missing Metadata</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4 text-xs sm:text-sm">Automatically scans folders and queries TMDB for missing metadata.</p>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-600 dark:text-gray-400 mb-1.5 text-xs font-bold uppercase tracking-wider">Target Scan Path</label>
            <input 
              className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-black dark:text-white focus:outline-none focus:border-blue-600/50 transition-colors"
              value={autoFetchPath}
              onChange={e => setAutoFetchPath(e.target.value)}
              placeholder="/home or /home/ANIME"
            />
          </div>
          <button onClick={handleAutoFetch} className={`w-full sm:w-auto border px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${autoFetchLoading ? 'bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/50 hover:bg-blue-500/30'}`}>
            {autoFetchLoading ? 'Stop Auto-Fetch' : 'Start Auto-Fetch'}
          </button>
          {autoFetchMsg && (
            <p className="text-xs sm:text-sm font-mono text-gray-600 dark:text-gray-400 bg-black/50 p-3.5 sm:p-4 rounded-xl border border-black/5 dark:border-white/5 whitespace-pre-wrap break-words">{autoFetchMsg}</p>
          )}
          {autoFetchFailed.length > 0 && (
            <div className="mt-4 bg-red-900/20 border border-red-500/30 p-3.5 sm:p-4 rounded-xl">
              <h4 className="text-red-400 font-bold mb-2 text-xs sm:text-sm">Failed to fetch metadata for {autoFetchFailed.length} items:</h4>
              <ul className="text-xs sm:text-sm text-red-200/70 max-h-48 overflow-y-auto space-y-1 font-mono break-all">
                {autoFetchFailed.map((item, idx) => (
                  <li key={idx}>• {item.name} <span className="opacity-50 text-[10px] sm:text-xs">({item.path})</span></li>
                ))}
              </ul>
              <p className="text-[10px] sm:text-xs text-red-400/50 mt-2">You can manually correct these below.</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-[#fbf4eb]/80 dark:bg-[#1a1a22]/80 p-4 sm:p-6 md:p-8 rounded-2xl border border-black/10 dark:border-white/10 shadow-xl backdrop-blur-sm">
        <h3 className="text-lg sm:text-xl font-bold text-black dark:text-white mb-2 sm:mb-4 tracking-tight">Metadata Scans</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4 text-xs sm:text-sm">Scan existing items to fetch additional metadata.</p>
        <div className="space-y-6">
          <div>
             <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="flex-1">
                   <h4 className="font-bold text-sm text-black dark:text-white">Credits Scan</h4>
                   <p className="text-xs text-gray-500">Fetch cast and crew for all library items.</p>
                </div>
                <button onClick={handleCreditsScan} className={`w-full sm:w-auto border px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${creditsScanLoading ? 'bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/50 hover:bg-blue-500/30'}`}>
                  {creditsScanLoading ? 'Stop Credits Scan' : 'Start Credits Scan'}
                </button>
             </div>
             {creditsScanMsg && (
                <p className="mt-3 text-xs sm:text-sm font-mono text-gray-600 dark:text-gray-400 bg-black/50 p-3.5 sm:p-4 rounded-xl border border-black/5 dark:border-white/5">{creditsScanMsg}</p>
             )}
          </div>
          
          <div className="h-px w-full bg-black/10 dark:bg-white/10"></div>
          
          <div>
             <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="flex-1">
                   <h4 className="font-bold text-sm text-black dark:text-white">Collections Scan</h4>
                   <p className="text-xs text-gray-500">Check movies for collections they belong to.</p>
                </div>
                <button onClick={handleCollectionScan} className={`w-full sm:w-auto border px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${collectionScanLoading ? 'bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/50 hover:bg-blue-500/30'}`}>
                  {collectionScanLoading ? 'Stop Collections Scan' : 'Start Collections Scan'}
                </button>
             </div>
             {collectionScanMsg && (
                <p className="mt-3 text-xs sm:text-sm font-mono text-gray-600 dark:text-gray-400 bg-black/50 p-3.5 sm:p-4 rounded-xl border border-black/5 dark:border-white/5">{collectionScanMsg}</p>
             )}
          </div>
        </div>
      </div>

      <div className="bg-[#fbf4eb]/80 dark:bg-[#1a1a22]/80 p-4 sm:p-6 md:p-8 rounded-2xl border border-black/10 dark:border-white/10 shadow-xl backdrop-blur-sm">
        <h3 className="text-lg sm:text-xl font-bold text-black dark:text-white mb-2 sm:mb-4 tracking-tight">Manual TMDB Correction</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4 text-xs sm:text-sm">Override TMDB metadata for specific folders.</p>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="flex-1 min-w-0">
              <label className="block text-gray-600 dark:text-gray-400 mb-1.5 text-xs font-bold uppercase tracking-wider">Folder Name (Query)</label>
              <input 
                className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-black dark:text-white focus:outline-none focus:border-purple-600/50 transition-colors"
                value={tmdbQuery}
                onChange={e => setTmdbQuery(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-48 shrink-0">
              <label className="block text-gray-600 dark:text-gray-400 mb-1.5 text-xs font-bold uppercase tracking-wider">Type (Category)</label>
              <select 
                className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-black dark:text-white focus:outline-none focus:border-purple-600/50 transition-colors"
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
            <label className="block text-gray-600 dark:text-gray-400 mb-1.5 text-xs font-bold uppercase tracking-wider">JSON Data</label>
            <textarea 
              className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-black dark:text-white h-40 sm:h-48 font-mono text-xs sm:text-sm focus:outline-none focus:border-purple-600/50 transition-colors"
              value={tmdbData}
              onChange={e => setTmdbData(e.target.value)}
              placeholder={`{\n  "title": "Correct Title",\n  "overview": "...",\n  "poster_path": "/some_path.jpg",\n  "backdrop_path": "/some_path.jpg"\n}`}
            />
          </div>
          <button onClick={handleTmdbCorrection} className="w-full sm:w-auto bg-purple-500/20 text-purple-400 border border-purple-500/50 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold hover:bg-purple-500/30 transition-all cursor-pointer">
            Apply Correction
          </button>
        </div>
      </div>
      </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-[#fbf4eb]/80 dark:bg-[#1a1a22]/80 p-4 sm:p-6 md:p-8 rounded-2xl border border-black/10 dark:border-white/10 shadow-xl backdrop-blur-sm">
          <h3 className="text-lg sm:text-xl font-bold text-black dark:text-white mb-2 sm:mb-4 tracking-tight flex justify-between items-center gap-2">
            <span>System Activity Logs</span>
            <button 
              onClick={() => axios.get('/api/admin/logs', { headers: { Authorization: token } }).then(res => setLogs(res.data))}
              className="text-xs bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 px-3 py-1.5 rounded-lg border border-black/5 dark:border-white/5 font-semibold text-black dark:text-white cursor-pointer shrink-0"
            >
              Refresh
            </button>
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6 text-xs sm:text-sm">Tracks logins, batch updates, and sensitive operations.</p>
          
          <div className="space-y-3">
            {!Array.isArray(logs) || logs.length === 0 ? (
              <p className="text-gray-500 text-sm">No activity logs found.</p>
            ) : (
              logs.map(log => (
                <div key={log.id} className="bg-[#fffcf9]/50 dark:bg-[#08080a]/50 border border-black/5 dark:border-white/5 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row gap-2 sm:gap-4 justify-between items-start sm:items-center min-w-0">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-md ${
                        log.action.includes('Success') ? 'bg-green-500/20 text-green-400' :
                        log.action.includes('Failed') ? 'bg-red-500/20 text-red-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {log.action}
                      </span>
                      <span className="text-xs sm:text-sm font-semibold text-black dark:text-white truncate">{log.username}</span>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 break-words">{log.details}</p>
                  </div>
                  <div className="text-[10px] sm:text-xs text-gray-500 whitespace-nowrap shrink-0">
                    {new Date(log.timestamp).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'downloads' && (
        <div className="bg-[#fbf4eb]/80 dark:bg-[#1a1a22]/80 p-4 sm:p-6 md:p-8 rounded-2xl border border-black/10 dark:border-white/10 shadow-xl backdrop-blur-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/10 dark:border-white/10 pb-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-1">
                <Trophy size={16} /> Downloads Analytics
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-black dark:text-white flex items-center gap-2.5">
                Top 15 Most Downloaded Titles
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Aggregates file downloads across movies and TV show titles. For TV shows, episode downloads roll up under the parent show title.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button 
                onClick={fetchTopDownloads}
                disabled={refreshingDownloads}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw size={14} className={refreshingDownloads ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
              <button 
                onClick={async () => {
                  if (confirm('Clear all download tracking statistics?')) {
                    await axios.post('/api/downloads/clear', {}, { headers: { Authorization: token } });
                    fetchTopDownloads();
                  }
                }}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 size={14} />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {topDownloads.length === 0 ? (
            <div className="text-center py-12 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5 space-y-2">
              <Download size={36} className="mx-auto text-gray-400 opacity-40" />
              <h4 className="text-sm font-bold text-black dark:text-white">No downloads tracked yet</h4>
              <p className="text-xs text-gray-500">Downloads triggered by users will appear here in real-time.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topDownloads.map((item, idx) => {
                const maxCount = topDownloads[0]?.count || 1;
                const percentage = Math.min(100, Math.round((item.count / maxCount) * 100));

                return (
                  <div 
                    key={idx} 
                    className={`rounded-2xl border p-3.5 sm:p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 ${
                      idx === 0 
                        ? 'bg-amber-500/10 border-amber-500/30' 
                        : idx === 1 
                        ? 'bg-slate-500/10 border-slate-400/30'
                        : idx === 2
                        ? 'bg-amber-700/10 border-amber-700/30'
                        : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center font-black text-xs sm:text-sm shrink-0 shadow-md ${
                        idx === 0 
                          ? 'bg-amber-500 text-black' 
                          : idx === 1 
                          ? 'bg-slate-300 text-black'
                          : idx === 2
                          ? 'bg-amber-700 text-white'
                          : 'bg-black/10 dark:bg-white/10 text-black dark:text-white'
                      }`}>
                        #{idx + 1}
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs sm:text-sm font-extrabold text-black dark:text-white truncate">
                            {item.title}
                          </h4>
                          <span className="px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider bg-purple-500/15 text-purple-400 border border-purple-500/20 shrink-0">
                            {item.category || 'MEDIA'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
                          {item.lastUser && <span>Downloaded by <strong className="text-purple-400">{item.lastUser}</strong></span>}
                          {item.lastDownloaded && <span>• {new Date(item.lastDownloaded).toLocaleString()}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center sm:flex-col sm:items-end justify-between gap-1.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-black/5 dark:border-white/5">
                      <div className="flex items-center gap-1.5">
                        <Flame size={15} className={idx < 3 ? 'text-amber-400' : 'text-purple-400'} />
                        <span className="text-sm sm:text-base font-black text-black dark:text-white">
                          {item.count} <span className="text-xs font-normal text-gray-500">downloads</span>
                        </span>
                      </div>
                      <div className="w-20 sm:w-24 h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-500 rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'missing-metadata' && (
        <div className="bg-[#fbf4eb]/80 dark:bg-[#1a1a22]/80 p-4 sm:p-6 md:p-8 rounded-2xl border border-black/10 dark:border-white/10 shadow-xl backdrop-blur-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/10 dark:border-white/10 pb-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-1">
                <Database size={16} /> Data Integrity
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-black dark:text-white flex items-center gap-2.5">
                Missing Metadata Items
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Files currently indexed from OpenList that could not be matched with TMDB data. 
                You can try bulk refreshing to fetch data again.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button 
                onClick={fetchMissingMetadata}
                disabled={loadingMissing}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw size={14} className={loadingMissing ? 'animate-spin' : ''} />
                <span>Reload List</span>
              </button>
              <button 
                onClick={refreshMissingMetadata}
                disabled={refreshingMissing || missingMetadata.length === 0}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-blue-600/20 disabled:opacity-50"
              >
                <UploadCloud size={14} className={refreshingMissing ? 'animate-bounce' : ''} />
                <span>Bulk Refresh Metadata</span>
              </button>
            </div>
          </div>
          
          {msg && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 p-3 rounded-xl text-sm font-bold flex items-center gap-2">
              <span>{msg}</span>
            </div>
          )}

          {loadingMissing ? (
            <div className="text-center py-12 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5">
              <RefreshCw size={36} className="mx-auto text-gray-400 opacity-40 animate-spin mb-3" />
              <p className="text-sm font-bold text-black dark:text-white">Scanning Library...</p>
            </div>
          ) : missingMetadata.length === 0 ? (
            <div className="text-center py-12 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5 space-y-2">
              <SearchX size={36} className="mx-auto text-green-500 opacity-60" />
              <h4 className="text-sm font-bold text-black dark:text-white">All Metadata Intact</h4>
              <p className="text-xs text-gray-500">No items are missing metadata!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {missingMetadata.map((item, idx) => (
                <div key={idx} className="bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                   <div className="min-w-0">
                      <h4 className="font-bold text-sm text-black dark:text-white truncate">{item.name}</h4>
                      <div className="text-xs text-gray-500 font-mono mt-0.5 truncate">
                        {item.path}
                      </div>
                   </div>
                   <div className="flex items-center gap-2 shrink-0">
                     <span className="text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-500 px-2 py-1 rounded border border-red-500/20 shrink-0">
                        No Data
                     </span>
                     <button 
                       onClick={() => handleFixMissing(item)}
                       className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-[10px] font-bold transition uppercase tracking-wider cursor-pointer relative z-10"
                     >
                       Fix
                     </button>
                   </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {fixModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#fbf4eb] dark:bg-[#1a1a22] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-black/10 dark:border-white/10 flex flex-col">
            <div className="p-4 sm:p-6 border-b border-black/5 dark:border-white/5">
              <h3 className="text-lg font-bold text-black dark:text-white">Fix Metadata</h3>
              <p className="text-xs text-gray-500 mt-1">Enter TMDB ID for <span className="font-bold text-purple-600 dark:text-purple-400">{fixModalItem.name}</span></p>
            </div>
            <div className="p-4 sm:p-6 flex-1 flex flex-col min-h-0">
              <label className="block text-gray-600 dark:text-gray-400 mb-1.5 text-xs font-bold uppercase tracking-wider">Search Title or TMDB ID</label>
              <input 
                autoFocus
                className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm text-black dark:text-white focus:outline-none focus:border-purple-600/50 transition-colors mb-4"
                value={fixModalInput}
                onChange={e => handleSearchTMDBModal(e.target.value, fixModalItem.category)}
                placeholder="Type title or ID..."
                onKeyDown={e => e.key === 'Enter' && submitFixMetadataId(fixModalInput)}
              />
              <div className="flex-1 overflow-y-auto max-h-52 space-y-2 pr-1 custom-scrollbar">
                {fixModalSearching ? (
                  <div className="text-gray-600 dark:text-gray-400 text-sm text-center py-4">Searching...</div>
                ) : fixModalSearchResults.length > 0 ? (
                  fixModalSearchResults.map((result: any) => (
                    <div 
                      key={result.id} 
                      onClick={() => submitFixMetadataId(String(result.id))}
                      className="flex items-center gap-3 p-2 hover:bg-black/5 dark:bg-white/5 rounded-xl cursor-pointer transition"
                    >
                      {result.poster_path ? (
                        <img src={`https://image.tmdb.org/t/p/w92${result.poster_path}`} alt={result.title || result.name} className="w-12 h-16 object-cover rounded shadow" />
                      ) : (
                        <div className="w-12 h-16 bg-black/5 dark:bg-white/5 rounded flex items-center justify-center shadow text-xs text-gray-600 dark:text-gray-400">No Img</div>
                      )}
                      <div>
                        <div className="text-black dark:text-white font-semibold text-sm">{result.title || result.name}</div>
                        <div className="text-gray-600 dark:text-gray-400 text-xs">{result.release_date || result.first_air_date}</div>
                      </div>
                    </div>
                  ))
                ) : fixModalInput ? (
                  <div className="text-gray-600 dark:text-gray-400 text-sm text-center py-4">No results found</div>
                ) : (
                  <div className="text-gray-600 dark:text-gray-400 text-sm text-center py-4">Type a title above to search</div>
                )}
              </div>
            </div>
            <div className="p-4 sm:p-6 bg-black/5 dark:bg-white/5 border-t border-black/5 dark:border-white/5 flex justify-end gap-3 shrink-0">
              <button 
                onClick={() => setFixModalItem(null)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button 
                onClick={() => submitFixMetadataId(fixModalInput)}
                disabled={!fixModalInput || fixModalLoading}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20 disabled:opacity-50 transition"
              >
                {fixModalLoading ? 'Saving...' : 'Save Manual ID'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}