import DetailsSkeleton from "../components/DetailsSkeleton";
import { useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useLocation, useNavigate } from 'react-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { 
  Play, Download, Copy, ExternalLink, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, 
  X, Edit2, Bookmark, BookmarkCheck, RefreshCw, Check, Film, Tv, MonitorPlay, Sparkles 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseMediaName, extractFileMetadata, formatBytes } from '../utils/nameParser';
import { getGenresWithIds } from '../utils/genres';
import { clearRecommendationsCache } from './Recommendations';

// Player Selection Intent Modal Component
function IntentPlayerModal({ 
  item, 
  itemPath, 
  token, 
  config, 
  onClose, 
  onPlayWeb 
}: { 
  item: any; 
  itemPath: string; 
  token: string | null; 
  config: any; 
  onClose: () => void; 
  onPlayWeb: (url: string) => void; 
}) {
  const [url, setUrl] = useState(item.url || '');
  const [loading, setLoading] = useState(!item.url);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!url && token) {
      setLoading(true);
      const cleanPath = itemPath.replace(/\/+$/, '');
      axios.post('/api/fs/get', { reqPath: `${cleanPath}/${item.name}` }, { headers: { Authorization: token } })
        .then(res => {
          if (isMounted) {
            if (res.data?.data?.raw_url) setUrl(res.data.data.raw_url);
            else setUrl(`${config.openlistUrl}/d/${cleanPath}/${item.name}`);
          }
        })
        .catch(() => {
          if (isMounted) setUrl(`${config.openlistUrl}/d/${cleanPath}/${item.name}`);
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else if (!token && !url) {
      setUrl(`${config.openlistUrl}/d/${itemPath}/${item.name}`);
      setLoading(false);
    }
    return () => { isMounted = false; };
  }, [item.name, itemPath, token, config.openlistUrl, url]);

  const meta = extractFileMetadata(item.name, item.size);

  const copyToClipboard = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      const textArea = document.createElement("textarea");
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#fbf4eb] dark:bg-[#121218] border border-black/10 dark:border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-gray-500 hover:text-black dark:hover:text-white rounded-full bg-black/5 dark:bg-white/5 transition">
          <X size={20} />
        </button>

        <div className="flex items-center gap-2 mb-2 text-purple-600 dark:text-purple-400 font-bold text-xs uppercase tracking-wider">
          <MonitorPlay size={16} /> Choose Player
        </div>

        <h3 className="text-base font-bold text-black dark:text-white pr-8 mb-2 leading-snug break-all line-clamp-2">
          {item.name}
        </h3>

        <div className="flex flex-wrap items-center gap-1.5 mb-6">
          {meta.resolution && (
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-purple-600/15 text-purple-700 dark:text-purple-300 border border-purple-500/20">
              {meta.resolution}
            </span>
          )}
          {meta.codec && (
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-blue-600/15 text-blue-700 dark:text-blue-300 border border-blue-500/20">
              {meta.codec}
            </span>
          )}
          {meta.formattedSize && (
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300">
              {meta.formattedSize}
            </span>
          )}
        </div>

        {loading ? (
          <div className="text-center py-10 text-gray-500 font-medium animate-pulse text-sm">
            Fetching playback URL...
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`vlc://${url}`}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-orange-500/50 text-black dark:text-white transition text-left cursor-pointer"
              >
                <div className="p-1.5 rounded-lg bg-orange-500/20 text-orange-500 font-bold text-xs shrink-0">VLC</div>
                <div className="min-w-0">
                  <div className="text-xs font-bold">VLC</div>
                  <div className="text-[10px] text-gray-500 truncate">VLC iOS</div>
                </div>
              </a>

              <a
                href={`infuse://x-callback-url/play?url=${encodeURIComponent(url)}`}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-blue-500/50 text-black dark:text-white transition text-left cursor-pointer"
              >
                <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-500 font-bold text-xs shrink-0">INF</div>
                <div className="min-w-0">
                  <div className="text-xs font-bold">Infuse</div>
                  <div className="text-[10px] text-gray-500 truncate">iOS / Apple TV</div>
                </div>
              </a>

              <a
                href={`intent://${url.replace(/^https?:\/\//, '')}#Intent;package=is.xyz.mpv;action=android.intent.action.VIEW;scheme=${url.startsWith('https') ? 'https' : 'http'};type=video/*;end;`}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-500/50 text-black dark:text-white transition text-left cursor-pointer"
              >
                <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-500 font-bold text-xs shrink-0">MPV</div>
                <div className="min-w-0">
                  <div className="text-xs font-bold">MPV</div>
                  <div className="text-[10px] text-gray-500 truncate">Android Intent</div>
                </div>
              </a>

              <a
                href={`potplayer://${url}`}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-yellow-500/50 text-black dark:text-white transition text-left cursor-pointer"
              >
                <div className="p-1.5 rounded-lg bg-yellow-500/20 text-yellow-500 font-bold text-xs shrink-0">POT</div>
                <div className="min-w-0">
                  <div className="text-xs font-bold">PotPlayer</div>
                  <div className="text-[10px] text-gray-500 truncate">Windows</div>
                </div>
              </a>

              <a
                href={`iina://weblink?url=${encodeURIComponent(url)}`}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-indigo-500/50 text-black dark:text-white transition text-left cursor-pointer"
              >
                <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-500 font-bold text-xs shrink-0">IINA</div>
                <div className="min-w-0">
                  <div className="text-xs font-bold">IINA</div>
                  <div className="text-[10px] text-gray-500 truncate">macOS</div>
                </div>
              </a>

              <button
                onClick={copyToClipboard}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-emerald-500/50 text-black dark:text-white transition text-left cursor-pointer"
              >
                <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-500 font-bold text-xs shrink-0">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold">{copied ? 'Copied!' : 'Copy Link'}</div>
                  <div className="text-[10px] text-gray-500 truncate">Stream URL</div>
                </div>
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function Details() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { '*' : paramPath } = useParams();
  const fullPath = paramPath ? `home/${paramPath}` : 'home';
  const pathParts = fullPath ? fullPath.split('/') : [];
  const name = pathParts[pathParts.length - 1] || '';
  const category = (pathParts[1] || '').toUpperCase();
  const isMovieCategory = category === 'MOVIES';

  const { token, user } = useAuth();
  const [config, setConfig] = useState<any>({});

  useEffect(() => {
    axios.get('/api/config').then(res => setConfig(res.data));
  }, []);

  // Directory items & state
  const [baseItems, setBaseItems] = useState<any[]>([]);
  const [seasonItems, setSeasonItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [tmdb, setTmdb] = useState<any>(null);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [toast, setToast] = useState('');
  
  // Active playing / modal state
  const [playingUrl, setPlayingUrl] = useState('');
  const [intentModalData, setIntentModalData] = useState<{ item: any; path: string } | null>(null);

  // Metadata correction modal
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [newTmdbId, setNewTmdbId] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [searchTitle, setSearchTitle] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [forceType, setForceType] = useState<string>("");
  const searchTimeoutRef = useRef<any>(null);

  // TV Shows Season State
  const [activeSeasonIndex, setActiveSeasonIndex] = useState(0);
  const [seasonTmdb, setSeasonTmdb] = useState<any>(null);
  const [loadingSeasonTmdb, setLoadingSeasonTmdb] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Derived lists
  const isVideoFile = (filename: string) => /\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i.test(filename);
  const videoItems = (isMovieCategory ? baseItems : seasonItems).filter(i => !i.is_dir && isVideoFile(i.name));
  const dirItems = baseItems.filter(i => i.is_dir);

  // Season Tabs parsing for Shows
  const seasonFolders = dirItems.filter(dir => {
    return /^(s\d+|season\s*\d+|specials)$/i.test(dir.name);
  }).sort((a, b) => {
    const numA = (a.name.match(/\d+/) || [0])[0];
    const numB = (b.name.match(/\d+/) || [0])[0];
    return Number(numA) - Number(numB);
  });

  const seasonTabs = seasonFolders.length > 0 
    ? seasonFolders.map(sf => {
        const numMatch = sf.name.match(/\d+/);
        const num = numMatch ? parseInt(numMatch[0], 10) : (sf.name.toLowerCase().includes('special') ? 0 : 1);
        return {
          label: sf.name.toLowerCase().includes('special') ? 'Specials' : (num === 0 ? 'Specials' : `Season ${num}`),
          seasonNum: num,
          folderName: sf.name
        };
      })
    : dirItems.length > 0 
      ? dirItems.map(d => {
          const numMatch = d.name.match(/\d+/);
          return { label: d.name, seasonNum: numMatch ? parseInt(numMatch[0], 10) : 1, folderName: d.name };
        })
      : [{ label: 'Season 1', seasonNum: 1, folderName: '' }];

  const activeSeasonTab = seasonTabs[activeSeasonIndex] || seasonTabs[0];
  const activeSeasonPath = activeSeasonTab?.folderName ? `${fullPath}/${activeSeasonTab.folderName}` : fullPath;

  // Refresh folder directly bypassing cache
  const handleRefreshFolder = async () => {
    if (refreshing || !token) return;
    setRefreshing(true);
    setLoadingFiles(true);
    try {
      const isFile = isVideoFile(name);
      if (isFile) {
        setBaseItems([{ name, is_dir: false }]);
      } else {
        // Refresh base directory list
        const baseRes = await axios.post(
          '/api/fs/list',
          { reqPath: `/${fullPath}`, refresh: true },
          { headers: { Authorization: token } }
        );
        if (baseRes.data?.code === 200) {
          setBaseItems(baseRes.data.data?.content || []);
        }

        // If TV Show, also refresh active season directory list
        if (!isMovieCategory && activeSeasonPath && activeSeasonPath !== fullPath) {
          const seasonRes = await axios.post(
            '/api/fs/list',
            { reqPath: `/${activeSeasonPath}`, refresh: true },
            { headers: { Authorization: token } }
          );
          if (seasonRes.data?.code === 200) {
            setSeasonItems(seasonRes.data.data?.content || []);
          }
        }
      }
    } catch (err: any) {
      console.error("Error refreshing directory", err);
    } finally {
      setRefreshing(false);
      setLoadingFiles(false);
    }
  };

  // Fetch Base Items
  useEffect(() => {
    let isMounted = true;
    const fetchBaseList = async () => {
      setLoadingFiles(true);
      try {
        const isFile = isVideoFile(name);
        if (isFile) {
          if (isMounted) setBaseItems([{ name, is_dir: false }]);
        } else if (token) {
          const res = await axios.post('/api/fs/list', { reqPath: `/${fullPath}` }, { headers: { Authorization: token } });
          if (isMounted && res.data.code === 200) {
            setBaseItems(res.data.data?.content || []);
          }
        }
      } catch (err: any) {
        if (isMounted) console.error("Error fetching file list", err);
      } finally {
        if (isMounted && isMovieCategory) setLoadingFiles(false);
      }
    };

    fetchBaseList();
    return () => { isMounted = false; };
  }, [fullPath, token, isMovieCategory, name]);

  // Fetch TV Show Season Items
  useEffect(() => {
    if (isMovieCategory) return;
    
    let isMounted = true;
    const fetchSeasonList = async () => {
      setLoadingFiles(true);
      try {
        if (token) {
          const res = await axios.post('/api/fs/list', { reqPath: `/${activeSeasonPath}` }, { headers: { Authorization: token } });
          if (isMounted && res.data.code === 200) {
            setSeasonItems(res.data.data?.content || []);
          }
        }
      } catch (err: any) {
        if (isMounted) console.error("Error fetching season list", err);
      } finally {
        if (isMounted) setLoadingFiles(false);
      }
    };
    
    if (baseItems.length > 0 || (seasonTabs.length === 1 && !seasonTabs[0].folderName)) {
      fetchSeasonList();
    }
    
    return () => { isMounted = false; };
  }, [activeSeasonPath, token, isMovieCategory, baseItems.length]);

  // Fetch TMDB Main Metadata
  useEffect(() => {
    const fetchMetadata = async () => {
      setLoading(true);
      try {
        let searchName = name;
        if (/^(s\d+|season\s*\d+)$/i.test(name) && pathParts.length > 2) {
          searchName = pathParts[pathParts.length - 2];
        }
        const { cleanName, year } = parseMediaName(searchName);
        const tmdbRes = await axios.get(`/api/meta/search?query=${encodeURIComponent(cleanName)}&type=${category}${year ? `&year=${year}` : ''}`);
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
            recent = recent.slice(0, 20);
            localStorage.setItem('recently_browsed', JSON.stringify(recent));
          } catch(e) {}
        } else {
          setSearchTitle(cleanName);
        }
      } catch (err) {
        console.error('Error fetching TMDB metadata', err);
      } finally {
        setLoading(false);
      }
    };
    if (fullPath) fetchMetadata();
  }, [fullPath, name, category]);

  // Fetch TMDB Season Episode Metadata for TV Shows
  useEffect(() => {
    if (!isMovieCategory && tmdb?.id && activeSeasonTab?.seasonNum !== undefined) {
      setLoadingSeasonTmdb(true);
      axios.get(`/api/meta/tv_season?tvId=${tmdb.id}&season=${activeSeasonTab.seasonNum}`)
        .then(res => setSeasonTmdb(res.data))
        .catch(() => setSeasonTmdb(null))
        .finally(() => setLoadingSeasonTmdb(false));
    } else {
      setSeasonTmdb(null);
    }
  }, [isMovieCategory, tmdb?.id, activeSeasonTab?.seasonNum]);

  // Check Watchlist Status
  useEffect(() => {
    if (user && name && pathParts.length > 0) {
      const actualParentPath = pathParts.slice(0, -1).join('/');
      axios.get(`/api/watchlist/check?name=${encodeURIComponent(name)}&parentPath=${encodeURIComponent(actualParentPath)}`, { headers: { 'x-user': user } })
        .then(res => setInWatchlist(res.data.inWatchlist))
        .catch(console.error);
    }
  }, [user, name, fullPath]);

  // Watchlist Toggle
  const handleToggleWatchlist = async () => {
    if (user === 'guest') {
      setToast('Sign up for the website plan to use this feature');
      setTimeout(() => setToast(''), 3000);
      return;
    }
    try {
      const actualParentPath = pathParts.slice(0, -1).join('/');
      const res = await axios.post('/api/watchlist/toggle', {
        item: { name, is_dir: !isVideoFile(name), parent: actualParentPath },
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

  // Direct Download File (without opening a new browser tab)
  const handleDirectDownload = async (item: any, itemPath: string) => {
    let fileUrl = item.url;
    if (!fileUrl && token) {
      try {
        const cleanPath = itemPath.replace(/\/+$/, '');
        const res = await axios.post('/api/fs/get', { reqPath: `${cleanPath}/${item.name}` }, { headers: { Authorization: token } });
        fileUrl = res.data?.data?.raw_url;
      } catch (e) {
        console.error(e);
      }
    }
    if (!fileUrl) {
      fileUrl = `${config.openlistUrl}/d/${itemPath}/${item.name}`;
    }

    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = item.name || 'download';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Bulk Link Copy
  const getSignedUrl = async (fileName: string) => {
    try {
      const res = await axios.post('/api/fs/get', { reqPath: `${activeSeasonPath}/${fileName}` }, { headers: { Authorization: token } });
      if (res.data?.data?.raw_url) return res.data.data.raw_url;
    } catch (e) {
      console.error(e);
    }
    return `${config.openlistUrl}/d/${activeSeasonPath}/${fileName}`;
  };

  const handleCopyLinks = async () => {
    if (selectedItems.length === 0) return;
    try {
      const links = await Promise.all(selectedItems.map(getSignedUrl));
      const textToCopy = links.join('\n');
      
      try {
        await navigator.clipboard.writeText(textToCopy);
      } catch (err) {
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setToast('Links copied to clipboard!');
      setTimeout(() => setToast(''), 3000);
    } catch (e) {
      alert('Failed to copy links');
    }
  };

  // Search TMDB overrides
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

        const url = `/api/meta/search_all?query=${encodeURIComponent(finalQuery)}&type=${category}${typeForce ? `&forceType=${typeForce}` : ''}${isId ? `&tmdbId=${finalQuery}` : ''}`;
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
      
      const res = await axios.post('/api/meta/override', { query: cleanName, type: category, year, tmdbId: String(result.id), customTitle: '' });
      if (res.data.success && res.data.data) {
        setTmdb(res.data.data);
        setShowMetadataModal(false);
        setSearchTitle('');
        setSearchResults([]);
        clearRecommendationsCache();
        queryClient.invalidateQueries();
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
      const res = await axios.post('/api/meta/override', { query: cleanName, type: category, year, tmdbId: newTmdbId, customTitle });
      if (res.data.success && res.data.data) {
        setTmdb(res.data.data);
        setShowMetadataModal(false);
        setNewTmdbId('');
        setCustomTitle('');
        clearRecommendationsCache();
        queryClient.invalidateQueries();
        setToast('Metadata updated successfully!');
        setTimeout(() => setToast(''), 3000);
      }
    } catch (err) {
      alert('Failed to update metadata. Ensure TMDB ID is correct.');
    }
  };

  if (loading) return <DetailsSkeleton onRefresh={() => {}} refreshingFolder={false} />;

  const backdrop = tmdb?.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}` : null;
  const displayGenres = tmdb?.genres 
    ? tmdb.genres.map((g: any) => ({ id: g.id, name: g.name })) 
    : getGenresWithIds(tmdb?.genre_ids);
  
  const releaseYear = tmdb?.release_date 
    ? new Date(tmdb.release_date).getFullYear() 
    : tmdb?.first_air_date 
      ? new Date(tmdb.first_air_date).getFullYear() 
      : null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="-mt-16 min-h-screen bg-[#fffcf9] dark:bg-[#08080a] pb-24 relative overflow-x-hidden max-w-full"
    >
      {/* Video Modal (Web Player) */}
      {playingUrl && (
        <div className="fixed inset-0 z-[120] bg-black/95 flex flex-col items-center justify-center backdrop-blur-md">
          <button onClick={() => setPlayingUrl('')} className="absolute top-6 right-6 text-white/70 hover:text-white transition bg-white/10 p-2.5 rounded-full z-10 cursor-pointer">
            <X size={24} />
          </button>
          <video src={playingUrl} controls autoPlay className="w-full max-w-6xl max-h-[85vh] rounded-2xl shadow-2xl outline-none bg-black" />
        </div>
      )}

      {/* Intent Player Selection Modal */}
      <AnimatePresence>
        {intentModalData && (
          <IntentPlayerModal
            item={intentModalData.item}
            itemPath={intentModalData.path}
            token={token}
            config={config}
            onClose={() => setIntentModalData(null)}
            onPlayWeb={(url) => setPlayingUrl(url)}
          />
        )}
      </AnimatePresence>

      {/* Fix Metadata Modal */}
      {showMetadataModal && (
        <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center backdrop-blur-sm px-4">
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
            
            <div className="max-h-52 overflow-y-auto mb-4 space-y-2">
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
                <div className="text-gray-600 dark:text-gray-400 text-sm text-center py-4">Type a title above to search online</div>
              )}
            </div>

            <form onSubmit={handleFixMetadata} className="pt-3 border-t border-black/10 dark:border-white/10 space-y-3">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Or Manual Override</div>
              <div className="grid grid-cols-2 gap-2">
                <input 
                  type="text" 
                  value={newTmdbId} 
                  onChange={e => setNewTmdbId(e.target.value)} 
                  placeholder="TMDB ID (e.g. 1234)" 
                  className="bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-black dark:text-white focus:outline-none focus:border-purple-600/50"
                />
                <input 
                  type="text" 
                  value={customTitle} 
                  onChange={e => setCustomTitle(e.target.value)} 
                  placeholder="Custom Display Title" 
                  className="bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-black dark:text-white focus:outline-none focus:border-purple-600/50"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => {
                  setShowMetadataModal(false);
                  setSearchTitle('');
                  setSearchResults([]);
                  setNewTmdbId('');
                  setCustomTitle('');
                }} className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition cursor-pointer">Cancel</button>
                <button 
                  type="submit" 
                  disabled={!newTmdbId && !customTitle}
                  className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg transition cursor-pointer"
                >
                  Apply Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-white text-black px-6 py-3 rounded-full shadow-2xl font-bold text-sm transition-all animate-bounce">
          {toast}
        </div>
      )}

      {/* Backdrop Image */}
      {backdrop && (
        <div className="absolute top-0 left-0 right-0 h-[65vh] md:h-[75vh] pointer-events-none z-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-[#fffcf9] dark:from-[#08080a] via-[#fffcf9]/80 dark:via-[#08080a]/80 to-transparent z-10"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#fffcf9] dark:from-[#08080a] via-[#fffcf9]/30 dark:via-[#08080a]/30 to-transparent z-10"></div>
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 dark:from-black/40 via-transparent to-transparent z-10"></div>
          <img src={backdrop} className="w-full h-full object-cover opacity-50 md:opacity-40" alt="Backdrop" />
        </div>
      )}

      {/* Main Details Section */}
      <div className="px-4 sm:px-8 md:px-12 pt-20 sm:pt-24 md:pt-28 relative z-20 flex flex-col md:flex-row gap-6 md:gap-10 mb-8">
        <div className="flex flex-row md:flex-col gap-5 md:gap-6 items-start">
          {tmdb?.poster_path && (
            <img src={`https://image.tmdb.org/t/p/w500${tmdb.poster_path}`} className="w-32 sm:w-40 md:w-64 rounded-xl md:rounded-2xl shadow-2xl shrink-0 border border-black/5 dark:border-white/5" alt="Poster" />
          )}
          <div className="flex-1 min-w-0 md:hidden flex flex-col gap-2 pt-2">
            <h1 className="text-2xl font-bold text-black dark:text-white tracking-tight leading-tight line-clamp-3">
              {tmdb?.title || tmdb?.name || name}
              {releaseYear ? <span className="text-gray-500 font-normal ml-2">({releaseYear})</span> : null}
            </h1>
            <p className="text-[10px] font-mono text-gray-600 dark:text-gray-400 break-words break-all line-clamp-2">{fullPath}</p>
            <button onClick={() => {
              if (user === 'guest') {
                setToast('Sign up for the website plan to use this feature');
                setTimeout(() => setToast(''), 3000);
              } else {
                setShowMetadataModal(true);
              }
            }} className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white p-2 rounded-xl transition self-start mt-2 cursor-pointer" title="Fix Metadata">
              <Edit2 size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-w-0 text-left">
          <div className="hidden md:flex flex-row items-center gap-4 mb-2">
            <h1 className="text-4xl lg:text-5xl font-extrabold text-black dark:text-white tracking-tight">
              {tmdb?.title || tmdb?.name || name}
              {releaseYear ? <span className="text-gray-500 font-normal ml-3">({releaseYear})</span> : null}
            </h1>
            <button onClick={() => {
              if (user === 'guest') {
                setToast('Sign up for the website plan to use this feature');
                setTimeout(() => setToast(''), 3000);
              } else {
                setShowMetadataModal(true);
              }
            }} className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white p-2 rounded-xl transition shrink-0 cursor-pointer" title="Fix Metadata">
              <Edit2 size={16} />
            </button>
          </div>

          <p className="hidden md:block text-xs md:text-sm font-mono text-gray-600 dark:text-gray-400 mb-4 break-words break-all">{fullPath}</p>

          {displayGenres && displayGenres.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {displayGenres.map((g: any, i: number) => (
                <button 
                  key={i} 
                  onClick={() => navigate(`/genre/${g.id}?name=${encodeURIComponent(g.name)}`, { state: { from: location.pathname + location.search + location.hash } })}
                  className="px-3 py-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-full text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}

          <p className="text-gray-700 dark:text-gray-300 max-w-3xl leading-relaxed text-sm md:text-base mb-6 line-clamp-4 md:line-clamp-none">{tmdb?.overview}</p>

          {/* Action Row: Watchlist */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <button 
              onClick={handleToggleWatchlist}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all text-sm cursor-pointer ${
                inWatchlist 
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' 
                  : 'bg-black/10 dark:bg-white/10 text-black dark:text-white hover:bg-black/20 dark:hover:bg-white/20'
              }`}
            >
              {inWatchlist ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
              {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
            </button>
          </div>

          {/* MOVIE PLAY / DOWNLOAD SECTION */}
          {isMovieCategory && (
            <div className="mt-6 pt-6 border-t border-black/10 dark:border-white/10">
              {(!user || user === 'guest') ? (
                <div className="p-6 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-center">
                  <p className="text-gray-700 dark:text-gray-300 font-medium mb-3">Please log in to stream or download this movie.</p>
                  <button onClick={() => navigate('/login')} className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-xl font-bold text-sm transition">
                    Log In
                  </button>
                </div>
              ) : loadingFiles ? (
                <div className="p-6 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 animate-pulse flex items-center justify-center">
                  <div className="h-6 w-1/3 bg-gray-300/30 dark:bg-gray-700/30 rounded"></div>
                </div>
              ) : videoItems.length > 0 ? (
                videoItems.length === 1 ? (
                  /* Single Movie File Layout */
                  (() => {
                    const singleMovie = videoItems[0];
                    const meta = extractFileMetadata(singleMovie.name, singleMovie.size);
                    return (
                      <div className="flex flex-col gap-3 max-w-xl">
                        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <Film size={15} /> Movie File Available
                        </div>

                        {/* Large Play Button */}
                        <button
                          onClick={() => setIntentModalData({ item: singleMovie, path: fullPath })}
                          className="w-full flex items-center justify-between px-6 py-4 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold shadow-xl shadow-purple-600/25 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-white/20">
                              <Play size={22} fill="currentColor" />
                            </div>
                            <div className="text-left">
                              <div className="text-base font-bold">Play Movie</div>
                              <div className="text-xs text-purple-200 font-normal">Choose player / stream</div>
                            </div>
                          </div>

                          {/* Subtle extracted metadata tags inside play button */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {meta.resolution && (
                              <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-white/20 text-white backdrop-blur-sm">
                                {meta.resolution}
                              </span>
                            )}
                            {meta.codec && (
                              <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-white/20 text-white backdrop-blur-sm">
                                {meta.codec}
                              </span>
                            )}
                            {meta.formattedSize && (
                              <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-white/20 text-white backdrop-blur-sm hidden sm:inline-block">
                                {meta.formattedSize}
                              </span>
                            )}
                          </div>
                        </button>

                        {/* Download Button Below */}
                        <button
                          onClick={() => handleDirectDownload(singleMovie, fullPath)}
                          className="w-full flex items-center justify-between px-6 py-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-600/50 hover:bg-black/10 dark:hover:bg-white/10 text-black dark:text-white font-extrabold transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-black/10 dark:bg-white/10 text-black dark:text-white">
                              <Download size={22} />
                            </div>
                            <div className="text-left">
                              <div className="text-base font-bold">Download Direct</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 font-normal">Save file to device</div>
                            </div>
                          </div>

                          {meta.formattedSize && (
                            <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-black/10 dark:bg-white/10 text-black dark:text-white">
                              {meta.formattedSize}
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })()
                ) : (
                  /* Multiple Movie Variants Layout */
                  <div className="space-y-3 max-w-2xl">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Available Movie Editions ({videoItems.length})
                      </div>
                      <button
                        onClick={handleRefreshFolder}
                        disabled={refreshing || loadingFiles}
                        title="Refresh folder directory from OpenList"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-black dark:text-white text-xs font-bold transition cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        <RefreshCw size={13} className={refreshing ? "animate-spin text-purple-600 dark:text-purple-400" : ""} />
                        <span>{refreshing ? "Refreshing..." : "Refresh Folder"}</span>
                      </button>
                    </div>
                    {videoItems.map((mItem, idx) => {
                      const meta = extractFileMetadata(mItem.name, mItem.size);
                      return (
                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl gap-3 hover:border-purple-600/50 transition w-full min-w-0 overflow-hidden">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs sm:text-sm font-bold text-black dark:text-white line-clamp-2 break-words break-all" title={mItem.name}>
                              {mItem.name}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              {meta.resolution && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-purple-600/15 text-purple-700 dark:text-purple-300">
                                  {meta.resolution}
                                </span>
                              )}
                              {meta.codec && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-600/15 text-blue-700 dark:text-blue-300">
                                  {meta.codec}
                                </span>
                              )}
                              {meta.formattedSize && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono text-gray-500 dark:text-gray-400">
                                  {meta.formattedSize}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => setIntentModalData({ item: mItem, path: fullPath })}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md transition cursor-pointer"
                            >
                              <Play size={14} fill="currentColor" /> Play
                            </button>
                            <button
                              onClick={() => handleDirectDownload(mItem, fullPath)}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-600/50 text-black dark:text-white font-semibold text-xs transition cursor-pointer"
                              title="Download file"
                            >
                              <Download size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="text-gray-500 text-sm font-medium">No video files found in this movie folder.</div>
              )}
            </div>
          )}

          {/* SHOWS / TV SERIES EPISODES SECTION */}
          {!isMovieCategory && (
            <div className="mt-8">
              {(!user || user === 'guest') ? (
                <div className="p-8 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-center">
                  <p className="text-gray-700 dark:text-gray-300 font-medium mb-4">Please log in to view and play episodes.</p>
                  <button onClick={() => navigate('/login')} className="bg-purple-600 hover:bg-purple-500 text-white px-8 py-2.5 rounded-xl font-bold transition shadow-lg shadow-purple-600/20">
                    Log In
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Season Horizontal Selector Tabs */}
                  {seasonTabs.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-black/10 dark:border-white/10 no-scrollbar">
                      {seasonTabs.map((tab, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setActiveSeasonIndex(idx);
                            setSelectedItems([]);
                          }}
                          className={`px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all whitespace-nowrap cursor-pointer ${
                            activeSeasonIndex === idx
                              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25 scale-105'
                              : 'bg-black/5 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Bulk Select & Actions Bar */}
                  <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-4 py-2.5 rounded-xl gap-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-purple-600 rounded disabled:opacity-40 cursor-pointer"
                        disabled={videoItems.length === 0}
                        checked={videoItems.length > 0 && selectedItems.length === videoItems.length}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedItems(videoItems.map(v => v.name));
                          else setSelectedItems([]);
                        }}
                      />
                      <span>{selectedItems.length > 0 ? `${selectedItems.length} Selected` : 'Select All'}</span>
                    </label>

                    <div className="flex items-center gap-2">
                      {selectedItems.length > 0 && (
                        <button
                          onClick={handleCopyLinks}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition cursor-pointer shrink-0"
                        >
                          <Copy size={13} /> <span className="hidden sm:inline">Copy Links</span>
                        </button>
                      )}

                      <button
                        onClick={handleRefreshFolder}
                        disabled={refreshing || loadingFiles}
                        title="Refresh folder directory from OpenList"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-black dark:text-white text-xs font-bold transition cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        <RefreshCw size={13} className={refreshing ? "animate-spin text-purple-600 dark:text-purple-400" : ""} />
                        <span>{refreshing ? "Refreshing..." : "Refresh Folder"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Episodes List */}
                  {loadingFiles || loadingSeasonTmdb ? (
                    <div className="space-y-3">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-24 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl animate-pulse"></div>
                      ))}
                    </div>
                  ) : videoItems.length > 0 ? (
                    <div className="space-y-3">
                      {videoItems.map((epItem, epIdx) => {
                        const meta = extractFileMetadata(epItem.name, epItem.size);
                        
                        // Try to match with TMDB season episode data
                        let epTmdb: any = null;
                        if (seasonTmdb?.episodes && Array.isArray(seasonTmdb.episodes)) {
                          if (meta.episodeNum) {
                            epTmdb = seasonTmdb.episodes.find((e: any) => e.episode_number === meta.episodeNum);
                          } else {
                            epTmdb = seasonTmdb.episodes[epIdx];
                          }
                        }

                        const epTitle = epTmdb?.name 
                          ? `${meta.episodeNum ? `E${meta.episodeNum < 10 ? '0' : ''}${meta.episodeNum}${meta.episodeNumEnd ? `-E${meta.episodeNumEnd < 10 ? '0' : ''}${meta.episodeNumEnd}` : ''}` : `Ep ${epIdx + 1}`} - ${epTmdb.name}`
                          : epItem.name.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i, "");

                        const epStill = epTmdb?.still_path ? `https://image.tmdb.org/t/p/w500${epTmdb.still_path}` : null;
                        const epOverview = epTmdb?.overview;

                        const isSelected = selectedItems.includes(epItem.name);

                        return (
                          <div 
                            key={epIdx}
                            className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 rounded-2xl border transition-all gap-3.5 w-full min-w-0 overflow-hidden ${
                              isSelected 
                                ? 'bg-purple-600/10 border-purple-600/50 dark:bg-purple-600/15' 
                                : 'bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-600/40'
                            }`}
                          >
                            {/* Left: Checkbox + Thumbnail + Episode Meta */}
                            <div className="flex items-start sm:items-center gap-2.5 sm:gap-3.5 min-w-0 w-full flex-1">
                              <input 
                                type="checkbox"
                                className="w-4 h-4 accent-purple-600 rounded mt-1 sm:mt-0 shrink-0 cursor-pointer"
                                checked={isSelected}
                                onChange={() => {
                                  if (isSelected) setSelectedItems(prev => prev.filter(n => n !== epItem.name));
                                  else setSelectedItems(prev => [...prev, epItem.name]);
                                }}
                              />

                              {epStill ? (
                                <img src={epStill} alt={epTitle} className="w-20 h-13 sm:w-28 sm:h-16 object-cover rounded-xl shadow shrink-0 border border-black/5 dark:border-white/5" />
                              ) : (
                                <div className="w-20 h-13 sm:w-28 sm:h-16 bg-black/10 dark:bg-white/10 rounded-xl flex items-center justify-center shrink-0 text-gray-500">
                                  <Tv size={18} />
                                </div>
                              )}

                              <div className="min-w-0 flex-1 overflow-hidden">
                                <h4 className="text-xs sm:text-sm font-bold text-black dark:text-white line-clamp-2 break-words break-all leading-snug" title={epTitle}>
                                  {epTitle}
                                </h4>
                                {epOverview && (
                                  <p className="text-[11px] sm:text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-0.5 leading-snug break-words">
                                    {epOverview}
                                  </p>
                                )}

                                {/* Subtle Resolution, Codec, Size tags */}
                                <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 mt-1.5">
                                  {meta.resolution && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-extrabold bg-purple-600/15 text-purple-700 dark:text-purple-300">
                                      {meta.resolution}
                                    </span>
                                  )}
                                  {meta.codec && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-extrabold bg-blue-600/15 text-blue-700 dark:text-blue-300">
                                      {meta.codec}
                                    </span>
                                  )}
                                  {meta.formattedSize && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-mono text-gray-500 dark:text-gray-400">
                                      {meta.formattedSize}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right Action Buttons: Play & Download */}
                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-black/5 dark:border-white/5">
                              <button
                                onClick={() => setIntentModalData({ item: epItem, path: activeSeasonPath })}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md transition cursor-pointer"
                              >
                                <Play size={13} fill="currentColor" /> Play
                              </button>

                              <button
                                onClick={() => handleDirectDownload(epItem, activeSeasonPath)}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-600/50 text-black dark:text-white font-semibold text-xs transition cursor-pointer"
                                title="Download episode"
                              >
                                <Download size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-gray-500 text-sm py-6 text-center">
                      No episodes found in this season folder.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
