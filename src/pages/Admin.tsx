import { clearAllLocalCaches } from '../utils/cacheManager';
import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Settings, Activity, Download, Trophy, Flame, Trash2, RefreshCw, Database, SearchX, UploadCloud, Megaphone, Folder, Copy, Check, Server, MonitorSmartphone } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import AnnouncementPill from '../components/AnnouncementPill';
import { UAParser } from 'ua-parser-js';

export default function Admin() {
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'settings';
  const setActiveTab = (tab: string) => setSearchParams({ tab });

  const [config, setConfig] = useState({ openlistUrl: '', basePath: '', inactivityTimeout: 0, announcement: '' });
  const [msg, setMsg] = useState('');
  
  // Auto Fetch
  const [autoFetchPath, setAutoFetchPath] = useState('');
  const [autoFetchMsg, setAutoFetchMsg] = useState('');
  const [autoFetchLoading, setAutoFetchLoading] = useState(false);
  const [autoFetchFailed, setAutoFetchFailed] = useState<{name: string, path: string}[]>([]);

  
  // Diagnostic
  const [dbDiagnostic, setDbDiagnostic] = useState<any>(null);
  const [isPingingDb, setIsPingingDb] = useState(false);
  const [dbDiagnosticError, setDbDiagnosticError] = useState<string | null>(null);

  const pingDatabase = async () => {
    setIsPingingDb(true);
    setDbDiagnosticError(null);
    try {
      const res = await axios.get('/api/admin/diagnostic', { headers: { Authorization: token } });
      setDbDiagnostic(res.data);
    } catch (e: any) {
      setDbDiagnosticError(e.response?.data?.error || e.message || 'Failed to ping database');
    } finally {
      setIsPingingDb(false);
    }
  };

  const downloadDb = async () => {
    try {
      const res = await axios.get('/api/admin/db/download', {
        headers: { Authorization: token },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `shindex_backup_${Date.now()}.db`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('Failed to download database');
    }
  };

  const [clearingDebugLogs, setClearingDebugLogs] = useState(false);


  const downloadDebugLogs = async () => {
    try {
      const res = await axios.get('/api/admin/logs/download', {
        headers: { Authorization: token },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'app-debug.log');
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err: any) {
      alert(`Failed to download logs: ${err.message}`);
    }
  };

  const handleClearDebugLogs = async () => {
    if (!window.confirm('Are you sure you want to permanently clear the server debug log file on the machine?')) return;
    setClearingDebugLogs(true);
    try {
      await axios.post('/api/admin/logs/clear-debug', {}, { headers: { Authorization: token } });
      alert('Debug logs cleared successfully.');
      const res = await axios.get('/api/admin/logs', { headers: { Authorization: token } });
      if (Array.isArray(res.data)) setLogs(res.data);
    } catch (err: any) {
      alert(`Failed to clear debug logs: ${err.response?.data?.error || err.message}`);
    } finally {
      setClearingDebugLogs(false);
    }
  };
  
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
      axios.get('/api/admin/logs', { headers: { Authorization: token } }).then(res => {
        if (Array.isArray(res.data)) {
          setLogs(res.data);
        } else {
          setLogs([]);
        }
      });

    } else if (activeTab === 'downloads') {
      fetchTopDownloads();
    } else if (activeTab === 'db-status') {
      pingDatabase();
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
    }, 5000);
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
          onClick={() => setActiveTab('db-status')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap min-h-[38px] ${activeTab === 'db-status' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'}`}
        >
          <Server size={16} />
          Database Status
        </button>

        <button 
          onClick={() => setActiveTab('sessions')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap min-h-[38px] ${activeTab === 'sessions' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'}`}
        >
          <Activity size={16} />
          Live Sessions
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
        <div className="flex items-center justify-between mb-2 sm:mb-4">
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-purple-500" />
            <h3 className="text-lg sm:text-xl font-bold text-black dark:text-white tracking-tight">Announcement Pill Banner</h3>
          </div>
          {config.announcement && (
            <button 
              onClick={() => setConfig({ ...config, announcement: '' })}
              className="text-xs text-red-500 hover:text-red-400 font-semibold px-2.5 py-1 rounded-lg border border-red-500/20 hover:bg-red-500/10 transition-all cursor-pointer"
            >
              Clear Message
            </button>
          )}
        </div>
        <p className="text-gray-600 dark:text-gray-400 mb-4 text-xs sm:text-sm">
          Set a message to display in the announcement pill on the home page beside the refresh button.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-600 dark:text-gray-400 mb-1.5 text-xs font-bold uppercase tracking-wider">Announcement Text</label>
            <input 
              type="text"
              className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm text-black dark:text-white focus:outline-none focus:border-purple-600/50 transition-colors"
              value={config.announcement || ''}
              onChange={e => setConfig({ ...config, announcement: e.target.value })}
              placeholder="e.g. 🎉 New 4K HDR movies and series have been added to the library today!"
            />
          </div>

          {config.announcement && (
            <div className="mt-4 pt-4 border-t border-black/10 dark:border-white/10">
              <label className="block text-gray-500 dark:text-gray-400 mb-2 text-[11px] font-bold uppercase tracking-wider">Live Banner Preview</label>
              <div className="bg-black/10 dark:bg-black/40 p-4 rounded-xl border border-black/10 dark:border-white/10 flex items-center justify-center">
                <AnnouncementPill message={config.announcement} className="w-full max-w-lg" />
              </div>
            </div>
          )}

          <button onClick={handleConfigSave} className="w-full sm:w-auto bg-purple-600 text-white px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold hover:bg-purple-500 shadow-lg shadow-purple-600/20 transition-all cursor-pointer">
            Save Announcement
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
        <div className="flex items-center gap-2 mb-2 sm:mb-4">
          <Database className="w-5 h-5 text-red-500" />
          <h3 className="text-lg sm:text-xl font-bold text-black dark:text-white tracking-tight">System Maintenance</h3>
        </div>
        <p className="text-gray-600 dark:text-gray-400 mb-4 text-xs sm:text-sm">Force a complete cache reset across all connected clients to resolve metadata inconsistencies.</p>
        <div className="space-y-4">
          <button 
            onClick={async () => {
              if (window.confirm('Are you sure you want to force all clients to clear their cache? This will cause a temporary spike in API requests.')) {
                try {
                  const res = await axios.post('/api/admin/clear-cache', {}, { headers: { Authorization: token } });
                  if (res.data.success) {
                    clearAllLocalCaches(queryClient);
                    localStorage.setItem('meta_version', String(res.data.version));
                    alert('Success! All local caches cleared and global meta version bumped.');
                  }
                } catch (e: any) {
                  alert('Failed to clear cache: ' + (e.response?.data?.error || e.message));
                }
              }
            }} 
            className="w-full sm:w-auto bg-red-500/20 text-red-500 border border-red-500/50 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold hover:bg-red-500/30 transition-all cursor-pointer flex items-center gap-2 justify-center"
          >
            <Trash2 size={16} /> Force Global Cache Reset
          </button>
        </div>
      </div>

      </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-[#fbf4eb]/80 dark:bg-[#1a1a22]/80 p-4 sm:p-6 md:p-8 rounded-2xl border border-black/10 dark:border-white/10 shadow-xl backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-2 sm:mb-4">
            <h3 className="text-lg sm:text-xl font-bold text-black dark:text-white tracking-tight">
              System Activity Logs
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button 
                onClick={downloadDebugLogs}
                className="text-xs bg-purple-600/10 hover:bg-purple-600/20 text-purple-600 dark:text-purple-400 px-3 py-1.5 rounded-lg border border-purple-600/20 font-bold cursor-pointer flex items-center gap-1.5 transition-colors"
              >
                <Download size={14} /> <span className="hidden sm:inline">Download</span> Debug Logs
              </button>
              <button 
                onClick={handleClearDebugLogs}
                disabled={clearingDebugLogs}
                className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg border border-red-500/20 font-bold cursor-pointer flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Trash2 size={14} /> <span className="hidden sm:inline">Clear</span> Debug Logs
              </button>
              <button 
                onClick={() => axios.get('/api/admin/logs', { headers: { Authorization: token } }).then(res => {
                  if (Array.isArray(res.data)) setLogs(res.data);
                  else setLogs([]);
                })}
                className="text-xs bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 px-3 py-1.5 rounded-lg border border-black/5 dark:border-white/5 font-semibold text-black dark:text-white cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
          </div>
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


      {activeTab === 'db-status' && (
        <div className="bg-[#fbf4eb]/80 dark:bg-[#1a1a22]/80 p-4 sm:p-6 md:p-8 rounded-2xl border border-black/10 dark:border-white/10 shadow-xl backdrop-blur-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/10 dark:border-white/10 pb-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-1">
                <Server size={16} /> Database Diagnostic
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-black dark:text-white flex items-center gap-2.5">
                Real-Time SQLite Status
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Monitor database connectivity and file system integrity.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <button 
                onClick={downloadDb}
                className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-all cursor-pointer"
              >
                <Download size={16} />
                Download DB
              </button>
              <button 
                onClick={pingDatabase}
                disabled={isPingingDb}
                className="flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-lg shadow-purple-600/20 hover:bg-purple-500 transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={16} className={isPingingDb ? "animate-spin" : ""} />
                Ping Database
              </button>
            </div>
          </div>

          {dbDiagnosticError && (
             <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-500 text-sm font-bold">
                {dbDiagnosticError}
             </div>
          )}

          {dbDiagnostic && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               {/* File Accessibility */}
               <div className="bg-white/50 dark:bg-black/20 p-4 sm:p-6 rounded-xl border border-black/5 dark:border-white/5">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">File Accessibility</h4>
                  <div className="flex items-center gap-2 mb-3">
                     <div className={`w-3 h-3 rounded-full ${dbDiagnostic.sqliteFileAccessible ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`}></div>
                     <span className="font-mono text-sm font-bold dark:text-white">
                        {dbDiagnostic.sqliteFileAccessible ? 'Accessible' : 'Inaccessible'}
                     </span>
                  </div>
                  {dbDiagnostic.sqliteFileAccessibleError && (
                    <p className="text-xs text-red-400 mt-2 font-mono break-all">{dbDiagnostic.sqliteFileAccessibleError}</p>
                  )}
                  {dbDiagnostic.fileStats && (
                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                      <div className="flex justify-between"><span>Size:</span> <span className="font-mono text-black dark:text-white">{(dbDiagnostic.fileStats.size / 1024 / 1024).toFixed(2)} MB</span></div>
                      <div className="flex justify-between"><span>Modified:</span> <span className="font-mono text-black dark:text-white">{new Date(dbDiagnostic.fileStats.mtime).toLocaleString()}</span></div>
                    </div>
                  )}
               </div>

               {/* Query Execution */}
               <div className="bg-white/50 dark:bg-black/20 p-4 sm:p-6 rounded-xl border border-black/5 dark:border-white/5">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Query Execution</h4>
                  <div className="flex items-center gap-2 mb-3">
                     <div className={`w-3 h-3 rounded-full ${dbDiagnostic.sqliteDbQueryable ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`}></div>
                     <span className="font-mono text-sm font-bold dark:text-white">
                        {dbDiagnostic.sqliteDbQueryable ? 'Responsive' : 'Failing'}
                     </span>
                  </div>
                  {dbDiagnostic.sqliteDbQueryableError && (
                    <p className="text-xs text-red-400 mt-2 font-mono break-all">{dbDiagnostic.sqliteDbQueryableError}</p>
                  )}
                  {dbDiagnostic.sqliteDbQueryable && (
                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                      <div className="flex justify-between"><span>KV Store Records:</span> <span className="font-mono text-black dark:text-white">{dbDiagnostic.kvStoreCount}</span></div>
                    </div>
                  )}
               </div>

               {/* Database Path */}
               <div className="sm:col-span-2 bg-white/50 dark:bg-black/20 p-4 sm:p-6 rounded-xl border border-black/5 dark:border-white/5">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Absolute Path</h4>
                  <p className="font-mono text-xs text-black dark:text-white break-all">{dbDiagnostic.dbPath}</p>
               </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'sessions' && (
        <SessionsWidget token={token} />
      )}

    </div>
  );
}

function SessionsWidget({ token }: { token: string | null }) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/admin/sessions', { headers: { Authorization: token } });
      setSessions(res.data);
      setError('');
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, [token]);

  const handleTerminate = async (sessionToken: string) => {
    try {
      await axios.post('/api/admin/sessions/terminate', { token: sessionToken }, { headers: { Authorization: token } });
      fetchSessions();
    } catch (e: any) {
      alert(e.response?.data?.error || e.message || 'Failed to terminate session');
    }
  };

  const filteredSessions = sessions.filter(session => 
    session.username?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    session.ip?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-[#fbf4eb]/80 dark:bg-[#1a1a22]/80 p-4 sm:p-6 md:p-8 rounded-2xl border border-black/10 dark:border-white/10 shadow-xl backdrop-blur-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/10 dark:border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-1">
            <Activity size={16} /> Live Active Sessions
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-black dark:text-white flex items-center gap-2.5">
            Real-time User Sessions
          </h3>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative">
            <SearchX size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search user or IP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 w-full sm:w-64 bg-white/50 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 dark:text-white"
            />
          </div>
          <button 
            onClick={fetchSessions}
            disabled={loading}
            className="flex items-center justify-center gap-2 bg-purple-600/10 text-purple-600 dark:text-purple-400 px-4 py-2 rounded-xl font-bold text-xs sm:text-sm hover:bg-purple-600/20 transition-all cursor-pointer"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-500 p-4 rounded-xl text-sm font-bold border border-red-500/20">
          {error}
        </div>
      )}

      {loading && sessions.length === 0 ? (
        <div className="flex items-center justify-center py-10">
          <RefreshCw size={24} className="animate-spin text-purple-500" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-10 text-gray-500 dark:text-gray-400 text-sm font-bold">
          No active sessions found.
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="text-center py-10 text-gray-500 dark:text-gray-400 text-sm font-bold">
          No sessions match your search query.
        </div>
      ) : (
        <>
          {/* Desktop/Tablet Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-black/10 dark:border-white/10 text-xs sm:text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="pb-3 px-2 font-bold">User</th>
                  <th className="pb-3 px-2 font-bold">IP Address</th>
                  <th className="pb-3 px-2 font-bold">Device & Browser</th>
                  <th className="pb-3 px-2 font-bold">Login Time</th>
                  <th className="pb-3 px-2 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {filteredSessions.sort((a, b) => b.loginTime - a.loginTime).map((session, i) => {
                  const ua = new UAParser(session.userAgent || '');
                  const browser = ua.getBrowser().name ? `${ua.getBrowser().name} ${ua.getBrowser().major || ''}`.trim() : 'Unknown Browser';
                  const os = ua.getOS().name ? `${ua.getOS().name} ${ua.getOS().version || ''}`.trim() : 'Unknown OS';
                  
                  return (
                  <tr key={i} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <td className="py-4 px-2">
                      <div className="font-bold text-black dark:text-white text-sm">
                        {session.username}
                      </div>
                    </td>
                    <td className="py-4 px-2">
                      <div className="font-mono text-xs text-gray-600 dark:text-gray-300">
                        {session.ip}
                      </div>
                    </td>
                    <td className="py-4 px-2">
                      <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                        <MonitorSmartphone size={14} className="text-gray-400" />
                        <div className="flex flex-col">
                          <span className="font-semibold">{browser}</span>
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">{os}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-2 text-xs text-gray-500 dark:text-gray-400">
                      {new Date(session.loginTime).toLocaleString()}
                    </td>
                    <td className="py-4 px-2 text-right">
                      <button
                        onClick={() => handleTerminate(session.token)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        <Trash2 size={14} /> Terminate
                      </button>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="sm:hidden space-y-3">
            {filteredSessions.sort((a, b) => b.loginTime - a.loginTime).map((session, i) => {
              const ua = new UAParser(session.userAgent || '');
              const browser = ua.getBrowser().name ? `${ua.getBrowser().name} ${ua.getBrowser().major || ''}`.trim() : 'Unknown Browser';
              const os = ua.getOS().name ? `${ua.getOS().name} ${ua.getOS().version || ''}`.trim() : 'Unknown OS';

              return (
              <div key={i} className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-black dark:text-white text-sm flex items-center gap-2">
                    {session.username}
                  </div>
                  <div className="font-mono text-xs px-2 py-1 bg-black/10 dark:bg-white/10 rounded-md text-gray-700 dark:text-gray-300">
                    {session.ip}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 bg-white/50 dark:bg-black/20 p-2 rounded-lg border border-black/5 dark:border-white/5">
                  <MonitorSmartphone size={14} />
                  <span>{browser} on {os}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/5">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(session.loginTime).toLocaleString()}
                  </div>
                  <button
                    onClick={() => handleTerminate(session.token)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Trash2 size={14} /> Terminate
                  </button>
                </div>
              </div>
            )})}
          </div>
        </>
      )}
    </div>
  );
}
