import DetailsSkeleton from "../components/DetailsSkeleton";
import { useEffect, useState, useRef } from 'react';
import { useParams, useLocation } from 'react-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Play, Download, Copy, ExternalLink, ChevronLeft, ChevronDown, ChevronUp, X, Edit2, Bookmark, BookmarkCheck, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { parseMediaName } from '../utils/nameParser';

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function FileRow({ item, fullPath, token, selected, onToggleSelect, onPlay }: { item: any, fullPath: string, token: string | null, selected: boolean, onToggleSelect: () => void, onPlay: (url: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [fileSize, setFileSize] = useState<number | undefined>(item.size);

  useEffect(() => {
    let isMounted = true;
    const fetchUrl = async () => {
      try {
        const cleanPath = fullPath.replace(/\/+$/, '');
        const res = await axios.post('/api/fs/get', { reqPath: `${cleanPath}/${item.name}` }, { headers: { Authorization: token } });
        if (isMounted && res.data?.data) {
          if (res.data.data.raw_url) setUrl(res.data.data.raw_url);
          if (res.data.data.size !== undefined && fileSize === undefined) setFileSize(res.data.data.size);
        }
      } catch (e) {
        console.error(e);
      }
    };
    if (token) fetchUrl();
    return () => { isMounted = false; };
  }, [item.name, fullPath, token]);

  return (
    <div className="flex flex-col px-4 py-3 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl hover:border-purple-600/50 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <input 
            type="checkbox" 
            className="w-4 h-4 shrink-0 accent-purple-600 rounded bg-[#fffcf9] dark:bg-[#08080a] border-black/10 dark:border-white/10" 
            checked={selected}
            onChange={onToggleSelect}
          />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 break-all leading-snug" title={item.name}>{item.name}</span>
            {fileSize !== undefined && (
              <span className="text-[10px] text-gray-500 font-mono mt-0.5">{formatBytes(fileSize)}</span>
            )}
          </div>
        </div>
        
        <div className="flex gap-2 items-center shrink-0">
          {url ? (
            <>
              <button onClick={() => onPlay(url)} className="flex items-center gap-1 bg-white text-black hover:bg-gray-200 px-3 py-1.5 rounded-lg text-xs font-bold transition">
                <Play size={14} fill="currentColor" /> Play
              </button>
              <a href={url} download target="_blank" rel="noreferrer" className="flex items-center gap-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-600/50 text-black dark:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition">
                <Download size={14} />
              </a>
            </>
          ) : (
            <span className="flex items-center gap-1 bg-gray-500/20 text-gray-600 dark:text-gray-400 px-3 py-1.5 rounded-lg text-xs font-bold">
              Loading...
            </span>
          )}
          <button 
            onClick={() => setExpanded(!expanded)} 
            className="flex items-center gap-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-600/50 text-black dark:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition"
          >
            More {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>
      
      {expanded && (
        <div className="flex gap-2 items-center mt-3 pt-3 border-t border-black/10 dark:border-white/10 flex-wrap">
          {url && (
            <>
              <a href={`vlc://${url}`} className="flex items-center gap-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-600/50 text-black dark:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition">
                <ExternalLink size={14} className="text-orange-500" /> VLC
              </a>
              <a href={`infuse://x-callback-url/play?url=${encodeURIComponent(url)}`} className="flex items-center gap-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-600/50 text-black dark:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition">
                <ExternalLink size={14} className="text-blue-500" /> Infuse
              </a>
              <a href={`intent://${url.replace(/^https?:\/\//, '')}#Intent;package=is.xyz.mpv;action=android.intent.action.VIEW;scheme=${url.startsWith('https') ? 'https' : 'http'};type=video/*;end;`} className="flex items-center gap-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-600/50 text-black dark:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition">
                <ExternalLink size={14} className="text-purple-500" /> MPV
              </a>
              <a href={`potplayer://${url}`} className="flex items-center gap-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-600/50 text-black dark:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition">
                <ExternalLink size={14} className="text-yellow-500" /> PotPlayer
              </a>
              <a href={`iina://weblink?url=${encodeURIComponent(url)}`} className="flex items-center gap-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-600/50 text-black dark:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition">
                <ExternalLink size={14} className="text-indigo-500" /> IINA
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Details() {
  const navigate = useNavigate();
  const { '*' : paramPath } = useParams();
  const fullPath = paramPath ? `home/${paramPath}` : 'home';
  const pathParts = fullPath ? fullPath.split('/') : [];
  const name = pathParts[pathParts.length - 1] || '';
  const category = pathParts[1] || '';
  const isCurrentFile = /\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i.test(name);
  const fileRowPath = isCurrentFile ? pathParts.slice(0, -1).join('/') : fullPath;


  const { token, user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tmdb, setTmdb] = useState<any>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [toast, setToast] = useState('');
  const [playingUrl, setPlayingUrl] = useState('');
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [newTmdbId, setNewTmdbId] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [searchTitle, setSearchTitle] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [forceType, setForceType] = useState<string>("");
  const searchTimeoutRef = useRef<any>(null);

  const [inWatchlist, setInWatchlist] = useState(false);
  const [refreshingFolder, setRefreshingFolder] = useState(false);

  const handleRefreshFolder = async () => {
    if (!token) return;
    setRefreshingFolder(true);
    try {
      const res = await axios.post('/api/fs/list', { reqPath: `/${fullPath}`, refresh: true }, { headers: { Authorization: token } });
      if (res.data.code === 200) {
        setItems(res.data.data.content || []);
        setToast('Folder refreshed');
        setTimeout(() => setToast(''), 3000);
      } else {
        setToast('Failed to refresh folder');
        setTimeout(() => setToast(''), 3000);
      }
    } catch (err) {
      console.error(err);
      setToast('Error refreshing folder');
      setTimeout(() => setToast(''), 3000);
    } finally {
      setRefreshingFolder(false);
    }
  };
  
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (playingUrl) {
          setPlayingUrl('');
        } else if (showMetadataModal) {
          setShowMetadataModal(false);
          setSearchTitle('');
          setSearchResults([]);
        } else {
          navigate(-1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playingUrl, showMetadataModal, navigate]);

  useEffect(() => {
    if (user && name && pathParts.length > 0) {
      const actualParentPath = pathParts.slice(0, -1).join('/');
      axios.get(`/api/watchlist/check?name=${encodeURIComponent(name)}&parentPath=${encodeURIComponent(actualParentPath)}`, { headers: { 'x-user': user } })
        .then(res => setInWatchlist(res.data.inWatchlist))
        .catch(console.error);
    }
  }, [user, name, fullPath]);

  const handleToggleWatchlist = async () => {
    if (user === 'guest') {
      setToast('Sign up for the website plan to use this feature');
      setTimeout(() => setToast(''), 3000);
      return;
    }
    try {
      const actualParentPath = pathParts.slice(0, -1).join('/');
      const res = await axios.post('/api/watchlist/toggle', {
        item: { name, is_dir: !isCurrentFile, parent: actualParentPath },
        category,
        parentPath: actualParentPath
      }, { headers: { 'x-user': user } });
      setInWatchlist(res.data.added);
      setToast(res.data.added ? 'Added to Watchlist' : 'Removed from Watchlist');
      setTimeout(() => setToast(''), 3000);
    } catch (e) {
      setToast('Failed to update watchlist');
      setTimeout(() => setToast(''), 3000);
    }
  };

  

  const location = useLocation();
  
  // Get raw URL for playing
  const [config, setConfig] = useState<any>({});

  useEffect(() => {
    axios.get('/api/config').then(res => setConfig(res.data));
  }, []);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        if (token) {
          const isFile = /\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i.test(name);
          if (isFile) {
            setItems([{ name, is_dir: false }]);
          } else {
            const res = await axios.post('/api/fs/list', { reqPath: `/${fullPath}` }, { headers: { Authorization: token } });
            if (res.data.code === 200) {
              setItems(res.data.data?.content || []);
            } else {
              if (res.data.message?.includes('not a folder') || res.data.message?.includes('object not found')) {
                setItems([{ name, is_dir: false }]);
              }
            }
          }
        }
      } catch (err: any) {
        const msg = err.response?.data?.message || '';
        if (err.response?.status === 500 && (msg.includes('not a folder') || msg.includes('object not found'))) {
          setItems([{ name, is_dir: false }]);
        } else {
          if (err.response) {
          }
        }
      }

      try {
        let searchName = name;
        if (/^(s\d+|season\s*\d+)$/i.test(name) && pathParts.length > 2) {
          searchName = pathParts[pathParts.length - 2];
        }
        const { cleanName, year } = parseMediaName(searchName);
        const tmdbRes = await axios.get(`/api/tmdb/search?query=${encodeURIComponent(cleanName)}&type=${category}${year ? `&year=${year}` : ''}`);
        if (tmdbRes.data) {
          setTmdb(tmdbRes.data);
          try {
            const actualParentPath = pathParts.slice(0, -1).join('/');
            const recentStr = localStorage.getItem('recently_browsed') || '[]';
            let recent = JSON.parse(recentStr);
            const newItem = {
              item: { name },
              category,
              parentPath: actualParentPath,
              tmdbData: tmdbRes.data,
              timestamp: Date.now()
            };
            recent = recent.filter((r: any) => r.item.name !== name || r.parentPath !== actualParentPath);
            recent.unshift(newItem);
            recent = recent.slice(0, 20); // Keep last 20
            localStorage.setItem('recently_browsed', JSON.stringify(recent));
          } catch(e) {}
        } else {
          setSearchTitle(cleanName);
        }
      } catch (err) {
        console.error('Error fetching TMDB metadata', err);
        try {
          const recentStr = localStorage.getItem('recently_browsed') || '[]';
          const recent = JSON.parse(recentStr);
          const cached = recent.find((r: any) => r.item.name === name);
          if (cached && cached.tmdbData) {
            setTmdb(cached.tmdbData);
          }
        } catch(e) {}
      } finally {
        setLoading(false);
      }
    };
    if (fullPath) fetchContent();
  }, [fullPath, token, name, category]);

  const getSignedUrl = async (fileName: string) => {
    try {
      const res = await axios.post('/api/fs/get', { reqPath: `${fileRowPath}/${fileName}` }, { headers: { Authorization: token } });
      if (res.data?.data?.raw_url) {
        return res.data.data.raw_url;
      }
    } catch (e) {
      console.error(e);
    }
    return `${config.openlistUrl}/d/${fileRowPath}/${fileName}`; // Fallback
  };

  const handleCopyLinks = async () => {
    if (selectedItems.length === 0) return;
    try {
      const links = await Promise.all(selectedItems.map(getSignedUrl));
      const textToCopy = links.join('\n');
      
      try {
        await navigator.clipboard.writeText(textToCopy);
      } catch (err) {
        // Fallback for iframe / non-focused document
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } catch (e) {
          console.error("Fallback copy failed", e);
        }
        document.body.removeChild(textArea);
      }
      setToast('Links copied to clipboard!');
      setTimeout(() => setToast(''), 3000);
    } catch (e) {
      alert('Failed to copy links');
    }
  };

  const handleSearchTMDB = (query: string, typeForce: string = forceType) => {
    setSearchTitle(query);
    if (!query) {
      setSearchResults([]);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
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

        const url = `/api/tmdb/search_all?query=${encodeURIComponent(finalQuery)}&type=${category}${typeForce ? `&forceType=${typeForce}` : ''}${isId ? `&tmdbId=${finalQuery}` : ''}`;
        const res = await axios.get(url);
        setSearchResults(res.data.results || []);
      } catch(e) {}
      setSearching(false);
    }, 500);
  };

  const handleSelectTMDBResult = async (result: any) => {
    try {
      let searchName = name;
      if (/^(s\d+|season\s*\d+)$/i.test(name) && pathParts.length > 2) {
        searchName = pathParts[pathParts.length - 2];
      }
      const { cleanName, year } = parseMediaName(searchName);
      
      const res = await axios.post('/api/tmdb/override', { query: cleanName, type: category, year, tmdbId: String(result.id), customTitle: '' });
      if (res.data.success) {
        setTmdb(res.data.data);
        setShowMetadataModal(false);
        setSearchTitle('');
        setSearchResults([]);
        setToast('Metadata updated successfully!');
        setTimeout(() => setToast(''), 3000);
      }
    } catch (err) {
      alert('Failed to update metadata.');
    }
  };

  const handleFixMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTmdbId && !customTitle) return;
    try {
      let searchName = name;
      if (/^(s\d+|season\s*\d+)$/i.test(name) && pathParts.length > 2) {
        searchName = pathParts[pathParts.length - 2];
      }
      const { cleanName, year } = parseMediaName(searchName);
      const res = await axios.post('/api/tmdb/override', { query: cleanName, type: category, year, tmdbId: newTmdbId, customTitle });
      if (res.data.success) {
        setTmdb(res.data.data);
        setShowMetadataModal(false);
        setNewTmdbId('');
        setCustomTitle('');
        setToast('Metadata updated successfully!');
        setTimeout(() => setToast(''), 3000);
      }
    } catch (err) {
      alert('Failed to update metadata. Ensure TMDB ID is correct.');
    }
  };

  if (loading) return <DetailsSkeleton />;

  const backdrop = tmdb?.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}` : null;
  const isVideo = (name: string) => /\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i.test(name);
  const videoItems = items.filter(i => !i.is_dir && isVideo(i.name));

  const dirItems = items.filter(i => i.is_dir);
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen bg-[#fffcf9] dark:bg-[#08080a] pb-20 relative"
    >
      {/* Video Modal */}
      {playingUrl && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center backdrop-blur-sm">
          <button onClick={() => setPlayingUrl('')} className="absolute top-6 right-6 text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition bg-black/5 dark:bg-white/5 p-2 rounded-full">
            <X size={24} />
          </button>
          <video src={playingUrl} controls autoPlay className="w-full max-w-6xl max-h-[80vh] rounded-2xl shadow-2xl outline-none bg-black" />
        </div>
      )}

      {/* Fix Metadata Modal */}
      {showMetadataModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm px-4">
          <div className="bg-[#fbf4eb] dark:bg-[#1a1a22] p-6 rounded-2xl border border-black/10 dark:border-white/10 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold text-black dark:text-white mb-2">Fix Metadata</h3>
            <p className="text-xs font-mono text-gray-600 dark:text-gray-400 mb-4 break-words break-all">{fullPath}</p>
            <div className="mb-4">
              <label className="block text-gray-600 dark:text-gray-400 text-sm mb-2 flex justify-between items-center">
                 <span>Search Title</span>
                 <select 
                    className="bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 text-black dark:text-white rounded p-1 text-xs"
                    value={forceType}
                    onChange={(e) => {
                       setForceType(e.target.value);
                       if (searchTitle) handleSearchTMDB(searchTitle, e.target.value);
                    }}
                 >
                    <option value="">Default for category</option>
                    <option value="movie">Force Movie</option>
                    <option value="tv">Force TV Show</option>
                 </select>
              </label>
              <input 
                type="text" 
                value={searchTitle} 
                onChange={e => handleSearchTMDB(e.target.value)} 
                className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:outline-none focus:border-purple-600/50" 
                placeholder="Type title, or TMDB ID (e.g. 12345)" 
              />
            </div>
            
            <div className="max-h-64 overflow-y-auto mb-4 space-y-2">
              {searching ? (
                <div className="text-gray-600 dark:text-gray-400 text-sm text-center py-4">Searching...</div>
              ) : searchResults.length > 0 ? (
                searchResults.map((result: any) => (
                  <div 
                    key={result.id} 
                    onClick={() => handleSelectTMDBResult(result)}
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
              ) : searchTitle ? (
                <div className="text-gray-600 dark:text-gray-400 text-sm text-center py-4">No results found</div>
              ) : (
                <div className="text-gray-600 dark:text-gray-400 text-sm text-center py-4">Type a title to search</div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-black/10 dark:border-white/10">
              <button type="button" onClick={() => {
                setShowMetadataModal(false);
                setSearchTitle('');
                setSearchResults([]);
              }} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white text-black px-6 py-3 rounded-full shadow-2xl font-bold text-sm transition-all animate-bounce">
          {toast}
        </div>
      )}

      <button onClick={() => navigate(-1)} className="absolute top-6 left-6 z-50 bg-black/50 border border-black/10 dark:border-white/10 text-black dark:text-white p-2 rounded-full hover:bg-black/10 dark:bg-white/10 transition backdrop-blur">
        <ChevronLeft size={24} />
      </button>

      {backdrop && (
        <div className="absolute top-0 left-0 w-full h-[60vh] md:h-[70vh] pointer-events-none z-0">
          <div className="absolute inset-0 bg-gradient-to-r from-[#fffcf9] dark:from-[#08080a] via-[#fffcf9]/80 dark:via-[#08080a]/80 to-transparent z-10"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#fffcf9] dark:from-[#08080a] via-[#fffcf9]/50 dark:via-[#08080a]/50 to-transparent z-10"></div>
          <img src={backdrop} className="w-full h-full object-cover opacity-40 md:opacity-30 mask-image:linear-gradient(to_bottom,black,transparent)" alt="Backdrop" />
        </div>
      )}
      
      <div className="px-4 sm:px-12 pt-20 sm:pt-28 md:pt-32 relative z-20 flex flex-col md:flex-row gap-6 md:gap-10 mb-8">
        <div className="flex flex-row md:flex-col gap-5 md:gap-6 items-start">
          {tmdb?.poster_path && (
            <img src={`https://image.tmdb.org/t/p/w500${tmdb.poster_path}`} className="w-32 sm:w-40 md:w-64 rounded-xl md:rounded-2xl shadow-2xl shrink-0 border border-black/5 dark:border-white/5" alt="Poster" />
          )}
          <div className="flex-1 min-w-0 md:hidden flex flex-col gap-2 pt-2">
            <h1 className="text-2xl font-bold text-black dark:text-white tracking-tight leading-tight line-clamp-3">{tmdb?.title || tmdb?.name || name}</h1>
            <p className="text-[10px] font-mono text-gray-600 dark:text-gray-400 break-words break-all line-clamp-2">{fullPath}</p>
            <button onClick={() => {
              if (user === 'guest') {
                setToast('Sign up for the website plan to use this feature');
                setTimeout(() => setToast(''), 3000);
              } else {
                setShowMetadataModal(true);
              }
            }} className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white p-2 rounded-xl transition self-start mt-2" title="Fix Metadata">
              <Edit2 size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-w-0 text-left">
          <div className="hidden md:flex flex-row items-center gap-4 mb-2">
            <h1 className="text-4xl lg:text-5xl font-extrabold text-black dark:text-white tracking-tight">{tmdb?.title || tmdb?.name || name}</h1>
            <button onClick={() => {
              if (user === 'guest') {
                setToast('Sign up for the website plan to use this feature');
                setTimeout(() => setToast(''), 3000);
              } else {
                setShowMetadataModal(true);
              }
            }} className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white p-2 rounded-xl transition shrink-0" title="Fix Metadata">
              <Edit2 size={16} />
            </button>
          </div>
          <p className="hidden md:block text-xs md:text-sm font-mono text-gray-600 dark:text-gray-400 mb-4 break-words break-all">{fullPath}</p>
          <p className="text-gray-700 dark:text-gray-300 max-w-3xl leading-relaxed text-sm md:text-base mb-6 line-clamp-4 md:line-clamp-none">{tmdb?.overview}</p>

          <div className="flex gap-4 mb-4">
            <button 
              onClick={handleToggleWatchlist}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all text-sm ${inWatchlist ? 'bg-purple-600 text-black dark:text-white shadow-lg shadow-purple-600/20' : 'bg-black/10 dark:bg-white/10 text-black dark:text-white hover:bg-black/20 dark:bg-white/20'}`}
            >
              {inWatchlist ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
              {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
            </button>
          </div>
          
          <div className="bg-[#fbf4eb]/95 dark:bg-[#1a1a22]/95 backdrop-blur-xl p-4 sm:p-6 rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl text-left mt-8 md:mt-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
              <h2 className="text-lg font-bold text-black dark:text-white">{category === 'MOVIES' ? 'Files' : 'Episodes / Files'}</h2>
              <div className="flex flex-wrap gap-3 items-center">
                {user !== 'guest' && videoItems.length > 0 && (
                  <>
                    <label className="flex items-center gap-2 cursor-pointer bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-3 py-2 rounded-xl hover:border-purple-600/50 transition">
                      <input 
                        type="checkbox"
                        className="w-4 h-4 accent-purple-600 rounded bg-[#fffcf9] dark:bg-[#08080a] border-black/10 dark:border-white/10"
                        checked={videoItems.length > 0 && selectedItems.length === videoItems.length}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedItems(videoItems.map(v => v.name));
                          else setSelectedItems([]);
                        }}
                      />
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">All</span>
                    </label>
                    {selectedItems.length > 0 && (
                      <button onClick={handleCopyLinks} className="flex items-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white px-4 py-2 rounded-xl transition text-xs font-bold">
                        <Copy size={14} /> Copy
                      </button>
                    )}
                  </>
                )}
                <button onClick={handleRefreshFolder} disabled={refreshingFolder} className="bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white p-2 rounded-xl transition" title="Refresh folder from openlist">
                  <RefreshCw size={18} className={refreshingFolder ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {(!user || user === 'guest') ? (
              <div className="text-center py-12 flex flex-col items-center gap-4">
                <p className="text-gray-700 dark:text-gray-300 font-medium text-lg">
                  Please log in to access episodes and files.
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
                  <button 
                    onClick={() => navigate('/login', { state: { from: `${location.pathname}${location.search}${location.hash}` } })} 
                    className="bg-purple-600 hover:bg-purple-500 text-black dark:text-white px-8 py-2.5 rounded-xl font-bold transition shadow-lg shadow-purple-600/20"
                  >
                    Log In
                  </button>
                  <a 
                    href="https://shutter.ng" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 text-black dark:text-white border border-black/10 dark:border-white/10 px-8 py-2.5 rounded-xl font-bold transition"
                  >
                    Sign Up
                  </a>
                </div>
              </div>
            ) : (
              <>
                {dirItems.length > 0 && (
                  <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {dirItems.map((dir, i) => (
                       <button key={i} onClick={() => navigate(`/${fullPath}/${dir.name}`.split('/').map(p => encodeURIComponent(p)).join('/'))} className="flex items-center justify-center p-4 bg-black/5 dark:bg-white/5 rounded-xl hover:border-purple-600/50 transition text-black dark:text-white text-sm font-semibold border border-black/10 dark:border-white/10 overflow-hidden">
                         <span className="break-all leading-snug">📁 {dir.name}</span>
                       </button>
                    ))}
                  </div>
                )}

                <div className="space-y-3">
                  {videoItems.length > 0 ? (
                    videoItems.map((item, i) => (
                      <FileRow 
                        key={i}
                        item={item}
                        fullPath={fileRowPath || ''}
                        token={token}
                        selected={selectedItems.includes(item.name)}
                        onPlay={(url) => setPlayingUrl(url)}
                        onToggleSelect={() => {
                          if (selectedItems.includes(item.name)) {
                            setSelectedItems(prev => prev.filter(n => n !== item.name));
                          } else {
                            setSelectedItems(prev => [...prev, item.name]);
                          }
                        }}
                      />
                    ))
                  ) : (
                    <div className="text-gray-600 dark:text-gray-400">No video files found in this folder.</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
