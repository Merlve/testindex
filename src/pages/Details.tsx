import { clearAllLocalCaches } from '../utils/cacheManager';
import DetailsSkeleton from "../components/DetailsSkeleton";
import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { 
  Play, Download, Copy, ExternalLink, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, 
  X, Edit2, Bookmark, BookmarkCheck, RefreshCw, Check, Film, Tv, MonitorPlay, Sparkles, Loader2, Trash2, Youtube, Eye, EyeOff, User, HardDrive, Search, Folder, Square, CheckSquare, Lock, LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseMediaName, extractFileMetadata, formatBytes } from '../utils/nameParser';
import { getGenresWithIds } from '../utils/genres';
import VideoPlayer from '../components/VideoPlayer';
import { useQueryClient } from '@tanstack/react-query';

// Helper to identify video files
const isVideoFile = (filename: string) => {
  return /\.(mp4|mkv|avi|mov|webm|flv|wmv|m4v|ts|m2ts)$/i.test(filename);
};

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
  const [os, setOs] = useState<'unknown' | 'android' | 'ios' | 'macos' | 'windows'>('unknown');

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      if (/android/i.test(ua)) setOs('android');
      else if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) setOs('ios');
      else if (/Mac/i.test(ua)) setOs('macos');
      else if (/Win/i.test(ua)) setOs('windows');
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (!url && token) {
      setLoading(true);
      const cleanPath = itemPath.replace(/\/+$/, '');
      axios.post('/api/fs/get', { reqPath: `${cleanPath}/${item.name}` }, { headers: { Authorization: token } })
        .then(res => {
          if (isMounted) {
            if (res.data?.data?.raw_url) setUrl(res.data.data.raw_url);
            else setUrl(`${config.openlistUrl || ''}/d/${cleanPath}/${item.name}`);
          }
        })
        .catch(() => {
          if (isMounted) setUrl(`${config.openlistUrl || ''}/d/${cleanPath}/${item.name}`);
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else if (!token && !url) {
      setUrl(`${config.openlistUrl || ''}/d/${itemPath}/${item.name}`);
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
    <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <motion.div 
        onClick={(e) => e.stopPropagation()}
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
              {os === 'ios' && (
                <>
                  <a
                    href={`vlc://${url}`}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-orange-500/50 text-black dark:text-white transition text-left cursor-pointer"
                  >
                    <div className="p-1.5 rounded-lg bg-orange-500/20 text-orange-500 font-bold text-xs shrink-0">VLC</div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold">VLC</div>
                      <div className="text-[10px] text-gray-500 truncate">iOS</div>
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
                </>
              )}

              {os === 'android' && (
                <a
                  href={`intent://${url.replace(/^https?:\/\//, '')}#Intent;package=is.xyz.mpv;action=android.intent.action.VIEW;scheme=${url.startsWith('https') ? 'https' : 'http'};type=video/*;end;`}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-500/50 text-black dark:text-white transition text-left cursor-pointer"
                >
                  <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-500 font-bold text-xs shrink-0">MPV</div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold">MPV</div>
                    <div className="text-[10px] text-gray-500 truncate">Android</div>
                  </div>
                </a>
              )}

              {os === 'windows' && (
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
              )}

              {os === 'macos' && (
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
              )}

              <button
                onClick={() => {
                  if (url) {
                    onPlayWeb(url);
                    onClose();
                  }
                }}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/30 text-purple-600 dark:text-purple-300 transition text-left cursor-pointer col-span-2"
              >
                <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-500 font-bold text-xs shrink-0">
                  <Play size={14} fill="currentColor" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold">Play Here</div>
                  <div className="text-[10px] opacity-80 truncate">Play directly in browser</div>
                </div>
              </button>
            </div>

            <button
              onClick={copyToClipboard}
              className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-xs font-semibold text-gray-700 dark:text-gray-300 transition cursor-pointer"
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              <span>{copied ? 'Direct Link Copied!' : 'Copy Direct Stream URL'}</span>
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function FileRowItem({ 
  file, 
  itemPath, 
  meta, 
  isWatched, 
  toggleWatched, 
  setIntentModalData, 
  token, 
  config,
  isSelected,
  toggleSelection
}: {
  file: any;
  itemPath: string;
  meta: any;
  isWatched: boolean;
  toggleWatched: (name: string, path: string) => void;
  setIntentModalData: (data: any) => void;
  token: string | null;
  config: any;
  isSelected: boolean;
  toggleSelection: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState<'copy' | 'download' | null>(null);

  const getUrl = async () => {
    if (file.url) return file.url;
    if (!token) {
      return `${config.openlistUrl || ''}/d/${itemPath}/${file.name}`;
    }
    const cleanPath = itemPath.replace(/\/+$/, '');
    try {
      const res = await axios.post('/api/fs/get', { reqPath: `${cleanPath}/${file.name}` }, { headers: { Authorization: token } });
      if (res.data?.data?.raw_url) return res.data.data.raw_url;
    } catch (e) {
      // ignore
    }
    return `${config.openlistUrl || ''}/d/${cleanPath}/${file.name}`;
  };

  const handleCopy = async () => {
    setActionLoading('copy');
    const targetUrl = await getUrl();
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      const textArea = document.createElement("textarea");
      textArea.value = targetUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    setActionLoading(null);
  };

  const handleDownload = async () => {
    setActionLoading('download');
    const targetUrl = await getUrl();
    const a = document.createElement('a');
    a.href = targetUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setActionLoading(null);
  };

  return (
    <div 
      className={`p-3.5 sm:p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
        isWatched 
          ? 'bg-black/5 dark:bg-white/5 border-transparent opacity-60 hover:opacity-100' 
          : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:border-purple-500/40'
      } ${isSelected ? 'ring-2 ring-purple-500 bg-purple-500/5' : ''}`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button 
          onClick={toggleSelection}
          className={`shrink-0 p-1 rounded transition cursor-pointer flex items-center justify-center ${
            isSelected ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
          }`}
          title={isSelected ? "Deselect" : "Select"}
        >
          {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
        </button>
        <div className="min-w-0 flex-1">
          <h4 className={`text-sm font-semibold truncate transition ${isWatched ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-black dark:text-white'}`}>
            {file.name}
          </h4>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {meta.resolution && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${isWatched ? 'bg-gray-500/15 text-gray-500' : 'bg-purple-600/15 text-purple-600 dark:text-purple-300'}`}>
                {meta.resolution}
              </span>
            )}
            {meta.codec && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${isWatched ? 'bg-gray-500/15 text-gray-500' : 'bg-blue-600/15 text-blue-600 dark:text-blue-300'}`}>
                {meta.codec}
              </span>
            )}
            {meta.formattedSize && (
              <span className="text-[11px] text-gray-500 font-medium">
                {meta.formattedSize}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        <button 
          onClick={() => toggleWatched(file.name, itemPath)}
          className={`p-2 rounded-xl transition cursor-pointer shrink-0 ${
            isWatched ? 'bg-green-500/15 text-green-500 hover:bg-green-500/25' : 'bg-black/5 dark:bg-white/5 text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10'
          }`}
          title={isWatched ? 'Mark as unwatched' : 'Mark as watched'}
        >
          {isWatched ? <Check size={16} /> : <Eye size={16} />}
        </button>

        <button
          onClick={handleDownload}
          disabled={actionLoading === 'download'}
          className="p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition flex items-center justify-center cursor-pointer disabled:opacity-50"
          title="Download File"
        >
          {actionLoading === 'download' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        </button>

        <button
          onClick={handleCopy}
          disabled={actionLoading === 'copy'}
          className="p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition flex items-center justify-center cursor-pointer disabled:opacity-50"
          title="Copy Direct Link"
        >
          {actionLoading === 'copy' ? <Loader2 size={16} className="animate-spin" /> : copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
        </button>

        <button
          onClick={() => setIntentModalData({ item: file, path: itemPath })}
          className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-md shadow-purple-600/20 cursor-pointer"
        >
          <Play size={14} fill="currentColor" />
          <span>Play</span>
        </button>
      </div>
    </div>
  );
}

export default function Details() {
  const navigate = useNavigate();
  const location = useLocation();
  const { '*' : paramPath } = useParams();
  const fullPath = paramPath ? `home/${paramPath}` : 'home';
  const pathParts = fullPath ? fullPath.split('/') : [];
  const name = pathParts[pathParts.length - 1] || '';
  const category = (pathParts[1] || '').toUpperCase();
  const isMovieCategory = category === 'MOVIES';
  const [actualPathOverride, setActualPathOverride] = useState<string | null>(null);

  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<any>({});

  const [tmdb, setTmdb] = useState<any>(location.state?.tmdbData || null);
  const actualOpenlistPath = actualPathOverride || (tmdb?.id ? config?.digitalReleasePaths?.[tmdb.id] : null) || location.state?.item?.openlist_path || location.state?.item?.path || fullPath;

  useEffect(() => {
    axios.get('/api/config').then(res => {
      if (res.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
        setConfig(res.data);
      }
    });
  }, []);

  // Directory items & TMDB state
  const [baseItems, setBaseItems] = useState<any[]>([]);
  const [seasonItems, setSeasonItems] = useState<any[]>([]);

  const [loading, setLoading] = useState(!location.state?.tmdbData);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [toast, setToast] = useState('');
  
  const [activeSeasonIndex, setActiveSeasonIndex] = useState<number | null>(null);
  const [currentSeasonEpisodes, setCurrentSeasonEpisodes] = useState<any[]>([]);
  const [loadingSeasonFiles, setLoadingSeasonFiles] = useState(false);
  const [baseRefresh, setBaseRefresh] = useState(0);
  const [seasonRefresh, setSeasonRefresh] = useState(0);

  // Playing / Modal State
  const [playingUrl, setPlayingUrl] = useState('');
  const [intentModalData, setIntentModalData] = useState<{ item: any; path: string } | null>(null);

  // Trailer State
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null);
  const [loadingTrailer, setLoadingTrailer] = useState(false);

  // Metadata Correction Modal
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [searchTitle, setSearchTitle] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customYear, setCustomYear] = useState('');
  const [savingCustom, setSavingCustom] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualTmdbId, setManualTmdbId] = useState('');
  const [copiedModalPath, setCopiedModalPath] = useState(false);

  // Watched state
  const [watchedItems, setWatchedItems] = useState<any[]>([]);
  const [isPlotExpanded, setIsPlotExpanded] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  
  // Batch selection state
  const [selectedFiles, setSelectedFiles] = useState<{file: any, path: string}[]>([]);
  const [batchCopyLoading, setBatchCopyLoading] = useState(false);
  const [batchCopied, setBatchCopied] = useState(false);

  // Page title and metadata updates
  useEffect(() => {
    setLogoUrl(null); // Clear logo URL when navigating to a new title

    let cleanName = '';
    let parsedYear = '';
    if (name) {
      const parsed = parseMediaName(name);
      cleanName = parsed.cleanName;
      parsedYear = parsed.year;
    }

    if (tmdb) {
      const mediaTitle = tmdb.title || tmdb.name || cleanName;
      const releaseDate = tmdb.release_date || tmdb.first_air_date || '';
      const releaseYear = (releaseDate || parsedYear || '').substring(0, 4);
      document.title = `${mediaTitle}${releaseYear ? ` (${releaseYear})` : ''} - SHUTTER!`;
    } else if (cleanName) {
      document.title = `${cleanName}${parsedYear ? ` (${parsedYear})` : ''} - SHUTTER!`;
    }

    return () => {
      document.title = "SHUTTER! - Unlimited Movies, Series & Anime";
    };
  }, [tmdb, name]);

  // Fetch TMDB data if missing
  useEffect(() => {
    let isMounted = true;
    if (!tmdb) {
      setLoading(true);
      const parsed = parseMediaName(name);
      const cleanName = parsed.cleanName || name;
      const parsedYear = parsed.year || '';

      axios.get(`/api/meta/search_all?query=${encodeURIComponent(cleanName)}&type=${category}&year=${parsedYear}`)
        .then(res => {
          if (isMounted && res.data?.results?.[0]) {
            setTmdb(res.data.results[0]);
          }
        })
        .catch(console.error)
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      setLoading(false);
    }
    return () => { isMounted = false; };
  }, [fullPath, name, category, tmdb]);

  // Fetch logo if tmdb exists
  useEffect(() => {
    let isMounted = true;
    if (tmdb?.id) {
      if (tmdb.images?.logos?.length > 0) {
        const logo = tmdb.images.logos.find((l: any) => l.iso_639_1 === 'en') || tmdb.images.logos[0];
        if (logo) setLogoUrl(`https://image.tmdb.org/t/p/original${logo.file_path}`);
      } else {
        const searchType = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(category) ? 'tv' : 'movie';
        axios.get(`/api/meta/images?id=${tmdb.id}&type=${searchType}`)
          .then(res => {
            if (isMounted && res.data?.logos?.length > 0) {
              const logo = res.data.logos.find((l: any) => l.iso_639_1 === 'en') || res.data.logos[0];
              if (logo) setLogoUrl(`https://image.tmdb.org/t/p/original${logo.file_path}`);
            }
          })
          .catch(console.error);
      }
    }
    return () => { isMounted = false; };
  }, [tmdb, category]);

  // Check Watchlist status
  useEffect(() => {
    if (user && user !== 'guest' && actualOpenlistPath) {
      axios.get(`/api/watchlist/check?path=${encodeURIComponent(actualOpenlistPath)}`, { headers: { 'x-user': user } })
        .then(res => setInWatchlist(Boolean(res.data?.inWatchlist)))
        .catch(() => setInWatchlist(false));
    }
  }, [user, actualOpenlistPath]);

  // Fetch Watched items
  useEffect(() => {
    if (user && user !== 'guest') {
      axios.get('/api/watched', { headers: { 'x-user': user } })
        .then(res => {
          if (Array.isArray(res.data)) setWatchedItems(res.data);
        })
        .catch(console.error);
    }
  }, [user]);

  // Fetch Folder Files
  useEffect(() => {
    if (user === 'guest') {
      setBaseItems([]);
      setSeasonItems([]);
      setLoadingFiles(false);
      return;
    }
    let isMounted = true;
    setLoadingFiles(true);

    const cleanPath = actualOpenlistPath.replace(/^\/+/, '');
    // If it's a direct file path, we query its parent directory to get the file object
    const targetFilename = cleanPath.split('/').pop();
    const isDirectFile = targetFilename && isVideoFile(targetFilename);
    const reqPath = isDirectFile ? cleanPath.substring(0, cleanPath.lastIndexOf('/')) || '' : cleanPath;
    
    const payload: any = { reqPath: reqPath };
    if (baseRefresh > 0) payload.refresh = true;

    axios.post('/api/fs/list', payload, { headers: token ? { Authorization: token } : {} })
      .then(res => {
        if (!isMounted) return;
        const content = res.data?.data?.content || [];
        // If the path itself points to a file, just show the file directly
        if (!Array.isArray(content)) {
            // In case the API returns a single file object instead of an array when querying a file path directly
            const singleFile = res.data?.data;
            if (singleFile && !singleFile.is_dir && isVideoFile(singleFile.name)) {
                setBaseItems([singleFile]);
                setSeasonItems([]);
                return;
            }
        }
        
        // If content is somehow empty but we have an item passed in state that is a file
        if (content.length === 0 && location.state?.item && !location.state?.item?.is_dir && isVideoFile(location.state?.item?.name)) {
             setBaseItems([location.state.item]);
             setSeasonItems([]);
             return;
        }

        const dirFolders = content.filter((item: any) => item.is_dir);
        const dirFiles = content.filter((item: any) => !item.is_dir && isVideoFile(item.name));

        // If we are looking at a path that is actually a file, and Openlist returned its parent dir contents,
        // we should just isolate the file we care about.
        const targetFilename = cleanPath.split('/').pop();
        if (targetFilename && isVideoFile(targetFilename)) {
            const exactFileMatch = dirFiles.find((f: any) => f.name === targetFilename);
            if (exactFileMatch) {
                setBaseItems([exactFileMatch]);
                setSeasonItems([]);
                return;
            }
        }

        dirFiles.sort((a: any, b: any) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        setBaseItems(dirFiles);

        if (dirFolders.length > 0) {
          dirFolders.sort((a: any, b: any) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
          setSeasonItems(dirFolders);
          if (activeSeasonIndex === null) {
            setActiveSeasonIndex(0);
          }
        } else {
          setSeasonItems([]);
        }
      })
      .catch(err => {
        console.error('Error fetching folder files:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingFiles(false);
      });

    return () => { isMounted = false; };
  }, [actualOpenlistPath, token, baseRefresh, user]);

  // Fetch Season Episodes when active season changes
  useEffect(() => {
    if (user === 'guest' || activeSeasonIndex === null || !seasonItems[activeSeasonIndex]) {
      setCurrentSeasonEpisodes([]);
      setLoadingSeasonFiles(false);
      return;
    }
    let isMounted = true;
    setLoadingSeasonFiles(true);
    const selectedSeasonFolder = seasonItems[activeSeasonIndex];
    const seasonPath = `${actualOpenlistPath.replace(/^\/+/, '')}/${selectedSeasonFolder.name}`;

    const payload: any = { reqPath: seasonPath };
    if (seasonRefresh > 0) payload.refresh = true;

    axios.post('/api/fs/list', payload, { headers: token ? { Authorization: token } : {} })
      .then(res => {
        if (!isMounted) return;
        const content = res.data?.data?.content || [];
        const episodes = content.filter((item: any) => !item.is_dir && isVideoFile(item.name));
        episodes.sort((a: any, b: any) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        setCurrentSeasonEpisodes(episodes);
      })
      .catch(console.error)
      .finally(() => {
        if (isMounted) setLoadingSeasonFiles(false);
      });

    return () => { isMounted = false; };
  }, [activeSeasonIndex, seasonItems, actualOpenlistPath, token, seasonRefresh, user]);

  const handleRefresh = () => {
    setSeasonRefresh(r => r + 1);
    setBaseRefresh(r => r + 1);
    setToast('Refreshing folder files...');
    setTimeout(() => setToast(''), 2000);
  };

  const handleRefreshRoot = () => {
    setBaseRefresh(r => r + 1);
    setSeasonRefresh(r => r + 1);
    setToast('Refreshing root directory...');
    setTimeout(() => setToast(''), 2000);
  };

  // Toggle Watchlist
  const handleToggleWatchlist = async () => {
    if (!user || user === 'guest') {
      setToast('Sign up for the website plan to use this feature');
      setTimeout(() => setToast(''), 3000);
      return;
    }
    const nextState = !inWatchlist;
    setInWatchlist(nextState);
    try {
      await axios.post('/api/watchlist/toggle', {
        item: {
          path: actualOpenlistPath,
          name,
          tmdbData: tmdb,
          category
        }
      }, { headers: { 'x-user': user } });
      setToast(nextState ? 'Added to Watchlist' : 'Removed from Watchlist');
      setTimeout(() => setToast(''), 2500);
    } catch (e) {
      setInWatchlist(!nextState);
      console.error(e);
    }
  };

  // Watch Trailer Handler
  const handleWatchTrailer = async () => {
    if (!tmdb?.id) {
      setToast('Trailer unavailable');
      setTimeout(() => setToast(''), 2000);
      return;
    }
    setLoadingTrailer(true);
    try {
      const searchType = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(category) ? 'tv' : 'movie';
      const res = await axios.get(`/api/meta/videos?id=${tmdb.id}&type=${searchType}`);
      const videos = res.data?.results || [];
      const trailer = videos.find((v: any) => (v.type === 'Trailer' || v.type === 'Teaser') && v.site === 'YouTube') || videos[0];
      if (trailer?.key) {
        setTrailerUrl(`https://www.youtube.com/embed/${trailer.key}?autoplay=1&rel=0`);
        setShowTrailerModal(true);
      } else {
        setToast('No trailer found for this title');
        setTimeout(() => setToast(''), 2500);
      }
    } catch (e) {
      console.error(e);
      setToast('Failed to load trailer');
      setTimeout(() => setToast(''), 2500);
    } finally {
      setLoadingTrailer(false);
    }
  };

  // Toggle Watched Status for a File
  const toggleWatched = async (itemName: string, itemPath: string) => {
    if (user === 'guest') {
      setToast('Sign up for the website plan to use this feature');
      setTimeout(() => setToast(''), 3000);
      return;
    }
    
    const isWatched = watchedItems.some(i => i.name === itemName && i.parentPath === itemPath);
    if (isWatched) {
      setWatchedItems(prev => prev.filter(i => !(i.name === itemName && i.parentPath === itemPath)));
    } else {
      setWatchedItems(prev => [...prev, { name: itemName, parentPath: itemPath }]);
    }
    
    try {
      await axios.post('/api/watched/toggle', { name: itemName, parentPath: itemPath }, { headers: { 'x-user': user } });
    } catch (e) {
      console.error(e);
    }
  };

  // Search TMDB for Metadata Correction
  const handleSearchTMDB = async () => {
    if (!searchTitle.trim()) return;
    setSearching(true);
    try {
      const searchType = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(category) ? 'tv' : 'movie';
      const res = await axios.get(`/api/meta/search_all?query=${encodeURIComponent(searchTitle)}&type=${searchType}`);
      setSearchResults(res.data?.results || []);
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  };

  // Select TMDB Metadata Result
  const handleSelectTMDBResult = async (selected: any) => {
    try {
      const parsed = parseMediaName(name || '');
      await axios.post('/api/meta/override', {
        query: parsed.cleanName,
        type: category,
        year: parsed.year,
        tmdbId: selected.id,
        path: actualOpenlistPath
      }, { headers: { Authorization: token } });
      
      setTmdb(selected);
      setShowMetadataModal(false);
      setToast('Metadata updated globally');
      setTimeout(() => setToast(''), 2000);
      localStorage.setItem('meta_version', String(Date.now()));
      clearAllLocalCaches(queryClient);
    } catch (e: any) {
      console.error(e);
      setToast('Failed to save metadata globally');
      setTimeout(() => setToast(''), 2000);
    }
  };

  const handleSaveCustomMetadata = async () => {
    if (!customTitle.trim()) return;
    setSavingCustom(true);
    try {
      const parsed = parseMediaName(name || '');
      const res = await axios.post('/api/meta/override', {
        query: parsed.cleanName,
        type: category,
        year: parsed.year,
        customTitle: customTitle.trim(),
        customYear: customYear.trim() || undefined,
        path: actualOpenlistPath
      }, { headers: { Authorization: token } });
      
      if (res.data && res.data.data) {
        setTmdb(res.data.data);
      }
      setShowMetadataModal(false);
      setToast('Custom metadata saved');
      setTimeout(() => setToast(''), 2000);
      localStorage.setItem('meta_version', String(Date.now()));
      clearAllLocalCaches(queryClient);
    } catch (e: any) {
      console.error(e);
      setToast('Failed to save custom metadata');
      setTimeout(() => setToast(''), 2000);
    } finally {
      setSavingCustom(false);
    }
  };

  // Extract Genres
  const genreList = useMemo(() => {
    if (!tmdb) return [];
    if (Array.isArray(tmdb.genres) && tmdb.genres.length > 0) {
      return tmdb.genres.map((g: any) => typeof g === 'string' ? g : g.name).filter(Boolean);
    }
    if (Array.isArray(tmdb.genre_ids) && tmdb.genre_ids.length > 0) {
      return getGenresWithIds(tmdb.genre_ids).map(g => g.name);
    }
    return [];
  }, [tmdb]);

  // Extract Backdrop URL
  const backdropUrl = useMemo(() => {
    if (!tmdb) return '';
    if (tmdb.backdrop_path) {
      return tmdb.backdrop_path.startsWith('http')
        ? tmdb.backdrop_path
        : `https://image.tmdb.org/t/p/w1280${tmdb.backdrop_path}`;
    }
    if (tmdb.poster_path) {
      return tmdb.poster_path.startsWith('http')
        ? tmdb.poster_path
        : `https://image.tmdb.org/t/p/w780${tmdb.poster_path}`;
    }
    return '';
  }, [tmdb]);

  // Extract Status Text
  const statusText = useMemo(() => {
    if (tmdb?.status) return tmdb.status;
    if (tmdb?.release_date || tmdb?.first_air_date) return 'Released';
    return 'Available';
  }, [tmdb]);

  // Batch Selection Logic
  const toggleSelectAll = () => {
    const currentList = seasonItems.length > 0 ? currentSeasonEpisodes : baseItems;
    let currentPath = seasonItems.length > 0 && activeSeasonIndex !== null
      ? `${actualOpenlistPath.replace(/^\/+/, '')}/${seasonItems[activeSeasonIndex].name}`
      : actualOpenlistPath.replace(/^\/+/, '');
      
    // Fix currentPath if actualOpenlistPath is a direct file
    if (seasonItems.length === 0) {
        const targetFilename = currentPath.split('/').pop();
        if (targetFilename && isVideoFile(targetFilename)) {
            currentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '';
        }
    }

    const allSelected = currentList.length > 0 && currentList.every(file => 
      selectedFiles.some(s => s.file.name === file.name && s.path === currentPath)
    );

    if (allSelected) {
      setSelectedFiles(prev => prev.filter(s => s.path !== currentPath));
    } else {
      setSelectedFiles(prev => {
        const newSelection = [...prev];
        currentList.forEach(file => {
          if (!newSelection.some(s => s.file.name === file.name && s.path === currentPath)) {
            newSelection.push({ file, path: currentPath });
          }
        });
        return newSelection;
      });
    }
  };

  const toggleSelection = (file: any, path: string) => {
    setSelectedFiles(prev => {
      const exists = prev.find(item => item.file.name === file.name && item.path === path);
      if (exists) {
        return prev.filter(item => !(item.file.name === file.name && item.path === path));
      } else {
        return [...prev, { file, path }];
      }
    });
  };

  const handleBatchCopy = async () => {
    if (selectedFiles.length === 0) return;
    setBatchCopyLoading(true);
    
    try {
      const links = await Promise.all(selectedFiles.map(async ({ file, path }) => {
        if (file.url) return file.url;
        const cleanPath = path.replace(/\/+$/, '');
        if (!token) {
          return `${config.openlistUrl || ''}/d/${cleanPath}/${file.name}`;
        }
        try {
          const res = await axios.post('/api/fs/get', { reqPath: `${cleanPath}/${file.name}` }, { headers: { Authorization: token } });
          if (res.data?.data?.raw_url) return res.data.data.raw_url;
        } catch (e) {
          // ignore
        }
        return `${config.openlistUrl || ''}/d/${cleanPath}/${file.name}`;
      }));

      const targetText = links.join('\n');
      try {
        await navigator.clipboard.writeText(targetText);
      } catch (e) {
        const textArea = document.createElement("textarea");
        textArea.value = targetText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setBatchCopied(true);
      setTimeout(() => {
        setBatchCopied(false);
        setSelectedFiles([]); // clear selection after copy
      }, 2000);
    } catch (e) {
      console.error(e);
    }
    setBatchCopyLoading(false);
  };

  const formatTitleCase = (text: string) => {
    if (!text) return '';
    const isAllUpper = text === text.toUpperCase() && text !== text.toLowerCase();
    const normalized = isAllUpper ? text.toLowerCase() : text;
    return normalized.replace(/(?:^|\s|-|\/)\S/g, (c) => c.toUpperCase());
  };

  const releaseYear = (tmdb?.release_date || tmdb?.first_air_date)
    ? String(tmdb.release_date || tmdb.first_air_date).substring(0, 4)
    : (tmdb?.year || parseMediaName(name).year || '');

  if (loading) return <DetailsSkeleton />;

  return (
    <div className="-mt-16 min-h-screen bg-[#fffcf9] dark:bg-[#08080a] text-black dark:text-white pb-24 relative overflow-hidden">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] bg-black/90 dark:bg-white/90 text-white dark:text-black px-6 py-3 rounded-2xl shadow-2xl text-sm font-semibold backdrop-blur-md border border-white/20 dark:border-black/20"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Backdrop Banner */}
      <div className="relative w-full h-[50vh] sm:h-[60vh] md:h-[70vh]">
        {backdropUrl && (
          <img 
            src={backdropUrl} 
            alt={tmdb?.title || tmdb?.name || name} 
            className="w-full h-full object-cover object-center sm:object-top opacity-100 dark:opacity-85 pointer-events-none transition-opacity duration-700"
          />
        )}
        
        {/* Gradients to blend into the background seamlessly */}
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#fffcf9] dark:from-[#08080a] to-transparent pointer-events-none z-10" />
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/50 to-transparent pointer-events-none z-10" />
      </div>

      {/* Content Section positioned below the backdrop with slight overlap */}
      <div className="relative z-20 flex flex-col items-center max-w-4xl mx-auto space-y-5 px-4 sm:px-8 -mt-24 sm:-mt-32 text-center">
        {/* Title or Logo and Subtitle Year */}
        <div className="flex flex-col items-center">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt={tmdb?.title || tmdb?.name || parseMediaName(name).cleanName} 
              className="h-20 sm:h-24 md:h-32 object-contain drop-shadow-xl"
            />
          ) : (
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-black dark:text-white drop-shadow-xl leading-tight">
              {formatTitleCase(tmdb?.title || tmdb?.name || parseMediaName(name).cleanName)}
            </h1>
          )}

          {/* Release Year */}
          {releaseYear && (
            <span className="mt-2 text-sm sm:text-base font-semibold text-gray-500 dark:text-gray-400 tracking-wider">
              {releaseYear}
            </span>
          )}
        </div>

        {/* Genres Row */}
        {genreList.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {genreList.map((genre, idx) => (
              <span 
                key={idx} 
                className="px-3.5 py-1 rounded-full bg-transparent text-gray-700 dark:text-gray-300 border border-black/20 dark:border-white/20 text-xs font-semibold tracking-wide"
              >
                {genre}
              </span>
            ))}
          </div>
        )}

        {/* Action Buttons Row */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            onClick={handleToggleWatchlist}
            title={inWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
            className="p-3 sm:p-3.5 rounded-xl bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 active:scale-95 text-black dark:text-white backdrop-blur-md border border-black/10 dark:border-white/15 transition flex items-center justify-center shadow-lg cursor-pointer"
          >
            {inWatchlist ? (
              <BookmarkCheck size={20} className="text-purple-600 dark:text-purple-400" />
            ) : (
              <Bookmark size={20} />
            )}
          </button>

          <button
            onClick={handleWatchTrailer}
            disabled={loadingTrailer}
            title="Watch Trailer"
            className="p-3 sm:p-3.5 rounded-xl bg-black/80 dark:bg-white/10 hover:bg-black dark:hover:bg-white/20 active:scale-95 text-white font-medium transition flex items-center justify-center shadow-lg border border-transparent dark:border-white/15 cursor-pointer disabled:opacity-50"
          >
            {loadingTrailer ? (
              <Loader2 size={20} className="animate-spin text-white" />
            ) : (
              <Play size={20} fill="currentColor" className="text-white" />
            )}
          </button>

          {user && user !== 'guest' && (
            <button
              onClick={handleRefreshRoot}
              disabled={loadingFiles}
              title="Refresh Root Directory"
              className="p-3 sm:p-3.5 rounded-xl bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 active:scale-95 text-black dark:text-white backdrop-blur-md border border-black/10 dark:border-white/15 transition flex items-center justify-center shadow-lg cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={20} className={loadingFiles ? "animate-spin text-purple-600 dark:text-purple-400" : ""} />
            </button>
          )}

          <button
            onClick={() => {
              setSearchTitle(tmdb?.title || tmdb?.name || parseMediaName(name).cleanName);
              setShowMetadataModal(true);
            }}
            title="Fix Metadata"
            className="p-3 sm:p-3.5 rounded-xl bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 active:scale-95 text-black dark:text-white backdrop-blur-md border border-black/10 dark:border-white/15 transition flex items-center justify-center shadow-lg cursor-pointer"
          >
            <Edit2 size={20} />
          </button>
        </div>

        {/* Plot / Overview Text */}
        <div className="w-full max-w-2xl text-center pt-2 pb-4 flex flex-col items-center">
          <p className={`text-gray-800 dark:text-gray-200 text-sm md:text-base leading-relaxed font-medium transition-all ${
            isPlotExpanded ? '' : 'line-clamp-3'
          }`}>
            {tmdb?.overview || 'No overview available for this title.'}
          </p>
          {(tmdb?.overview?.length > 150) && (
            <button
              onClick={() => setIsPlotExpanded(!isPlotExpanded)}
              className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 mt-2 transition cursor-pointer"
            >
              {isPlotExpanded ? 'Show Less' : 'Read More'}
            </button>
          )}
        </div>
      </div>

      {/* Main Files / Playable Media Section (NO Cast & Crew) */}
      <div className="px-4 sm:px-8 md:px-12 max-w-7xl mx-auto py-6 relative z-20 space-y-6">
        {user === 'guest' ? (
          <div className="p-8 sm:p-12 rounded-3xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-center max-w-xl mx-auto shadow-xl backdrop-blur-md">
            <div className="w-16 h-16 rounded-2xl bg-purple-600/15 text-purple-600 dark:text-purple-400 mx-auto flex items-center justify-center mb-5 border border-purple-500/20 shadow-inner">
              <Lock size={30} />
            </div>
            <h3 className="text-xl font-extrabold text-black dark:text-white mb-2 tracking-tight">
              Sign in to view media files
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed max-w-md mx-auto">
              Guest preview mode is active. Please log in with your account to access episode listings, stream high-definition video, and download files.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/login"
                state={{ from: location.pathname }}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold text-sm shadow-lg shadow-purple-600/30 transition flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <LogIn size={18} />
                <span>Log In to View Files</span>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Season Selector Tabs (For TV Series) */}
            {seasonItems.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-black dark:text-white flex items-center gap-2">
              <Tv size={20} className="text-purple-600 dark:text-purple-400" />
              <span>Seasons</span>
            </h2>
            <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none">
              {seasonItems.map((season, idx) => {
                const isActive = activeSeasonIndex === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => setActiveSeasonIndex(idx)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-2 border ${
                      isActive 
                        ? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-600/20' 
                        : 'bg-black/5 dark:bg-white/5 text-gray-700 dark:text-gray-300 border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10'
                    }`}
                  >
                    <Folder size={14} />
                    <span>{season.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Media Files List Header */}
        <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-3">
          <h2 className="text-lg font-bold text-black dark:text-white flex items-center gap-2">
            <Film size={20} className="text-purple-600 dark:text-purple-400" />
            <span>Available Files & Playback</span>
          </h2>
          <div className="flex items-center gap-3">
            {selectedFiles.length > 0 && (
              <button
                onClick={handleBatchCopy}
                disabled={batchCopyLoading}
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {batchCopyLoading ? <Loader2 size={14} className="animate-spin" /> : batchCopied ? <Check size={14} /> : <Copy size={14} />}
                <span>Copy {selectedFiles.length} {selectedFiles.length === 1 ? 'Link' : 'Links'}</span>
              </button>
            )}
            {seasonItems.length === 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {baseItems.length} {baseItems.length === 1 ? 'file' : 'files'}
              </span>
            )}
          </div>
        </div>

        {/* Files Display */}
        {loadingFiles || loadingSeasonFiles ? (
          <div className="flex items-center justify-center py-12 text-gray-500 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
            <span className="text-sm font-medium">Loading media files...</span>
          </div>
        ) : (
          <div>
            {/* Select All & Refresh Toggle */}
            {((seasonItems.length > 0 && currentSeasonEpisodes.length > 0) || (seasonItems.length === 0 && baseItems.length > 0)) && (
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={toggleSelectAll} 
                    className={`shrink-0 p-1 rounded transition cursor-pointer flex items-center justify-center ${
                      (seasonItems.length > 0 ? currentSeasonEpisodes : baseItems).every(f => 
                        selectedFiles.some(s => s.file.name === f.name)
                      ) ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                    }`}
                    title="Select All"
                  >
                    {(seasonItems.length > 0 ? currentSeasonEpisodes : baseItems).every(f => 
                      selectedFiles.some(s => s.file.name === f.name)
                    ) ? <CheckSquare size={20} /> : <Square size={20} />}
                  </button>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer" onClick={toggleSelectAll}>Select All</span>
                </div>

                <button 
                  onClick={handleRefresh}
                  className="flex items-center gap-2 px-3 py-1.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition text-sm font-semibold cursor-pointer"
                  title="Refresh folder contents"
                >
                  <RefreshCw size={14} className={loadingFiles || loadingSeasonFiles ? "animate-spin text-purple-600" : "text-gray-600 dark:text-gray-300"} />
                  <span className="hidden sm:inline text-gray-700 dark:text-gray-300">Refresh</span>
                </button>
              </div>
            )}
            
            {/* Show Season Episodes if TV series, or Base Files if Movie / single folder */}
            {seasonItems.length > 0 ? (
              currentSeasonEpisodes.length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {currentSeasonEpisodes.map((file, idx) => {
                    const selectedSeasonFolder = seasonItems[activeSeasonIndex || 0];
                    const itemPath = `${actualOpenlistPath.replace(/^\/+/, '')}/${selectedSeasonFolder.name}`;
                    const meta = extractFileMetadata(file.name, file.size);
                    const isWatched = watchedItems.some(i => i.name === file.name && i.parentPath === itemPath);
                    const isSelected = selectedFiles.some(i => i.file.name === file.name && i.path === itemPath);

                    return (
                      <FileRowItem 
                        key={idx}
                        file={file}
                        itemPath={itemPath}
                        meta={meta}
                        isWatched={isWatched}
                        toggleWatched={toggleWatched}
                        setIntentModalData={setIntentModalData}
                        token={token}
                        config={config}
                        isSelected={isSelected}
                        toggleSelection={() => toggleSelection(file, itemPath)}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500 text-sm">
                  No playable media files found in this season.
                </div>
              )
            ) : baseItems.length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {baseItems.map((file, idx) => {
                  let itemPath = actualOpenlistPath.replace(/^\/+/, '');
                  const targetFilename = itemPath.split('/').pop();
                  if (targetFilename && isVideoFile(targetFilename)) {
                      itemPath = itemPath.substring(0, itemPath.lastIndexOf('/')) || '';
                  }
                  const meta = extractFileMetadata(file.name, file.size);
                  const isWatched = watchedItems.some(i => i.name === file.name && i.parentPath === itemPath);
                  const isSelected = selectedFiles.some(i => i.file.name === file.name && i.path === itemPath);

                  return (
                    <FileRowItem 
                      key={idx}
                      file={file}
                      itemPath={itemPath}
                      meta={meta}
                      isWatched={isWatched}
                      toggleWatched={toggleWatched}
                      setIntentModalData={setIntentModalData}
                      token={token}
                      config={config}
                      isSelected={isSelected}
                      toggleSelection={() => toggleSelection(file, itemPath)}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 flex flex-col items-center justify-center">
                <span className="text-gray-500 text-sm">
                  {tmdb?.release_date || tmdb?.first_air_date 
                    ? `Digital Release: ${new Date(tmdb.release_date || tmdb.first_air_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`
                    : 'No playable media files found in this folder.'}
                </span>
                {user === 'admin' && (
                  <button
                    onClick={() => {
                      const newPath = prompt('Enter the Openlist path for this title:', actualOpenlistPath);
                      if (newPath !== null && tmdb?.id) {
                        axios.post('/api/meta/digital-path', { tmdbId: tmdb.id, path: newPath }, { headers: { Authorization: token } })
                          .then(() => {
                            setActualPathOverride(newPath);
                          })
                          .catch(e => alert('Failed to update path: ' + e.message));
                      }
                    }}
                    className="mt-4 px-4 py-2 bg-black/10 dark:bg-white/10 rounded-xl hover:bg-black/20 dark:hover:bg-white/20 transition text-sm font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <Edit2 size={16} />
                    <span>Edit Openlist Path</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
          </>
        )}
      </div>

      {/* Trailer Modal */}
      <AnimatePresence>
        {showTrailerModal && trailerUrl && (
          <div className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-black rounded-2xl overflow-hidden max-w-4xl w-full aspect-video relative shadow-2xl border border-white/10"
            >
              <button 
                onClick={() => setShowTrailerModal(false)}
                className="absolute top-4 right-4 z-10 p-2 text-white bg-black/60 hover:bg-black rounded-full backdrop-blur-md transition cursor-pointer"
              >
                <X size={20} />
              </button>
              <iframe 
                src={trailerUrl} 
                title="Trailer" 
                className="w-full h-full border-0"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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

      {/* In-Browser Video Player Component */}
      {playingUrl && (
        <VideoPlayer 
          src={playingUrl} 
          title={name} 
          onClose={() => setPlayingUrl('')} 
        />
      )}

      {/* Metadata Correction Modal */}
      <AnimatePresence>
        {showMetadataModal && (
          <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto" onClick={() => setShowMetadataModal(false)}>
            <motion.div 
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#fffcf9] dark:bg-[#121218] border border-black/10 dark:border-white/10 rounded-2xl p-4 sm:p-6 max-w-md w-full shadow-2xl relative space-y-4 my-auto overflow-hidden box-border"
            >
              <button 
                onClick={() => setShowMetadataModal(false)} 
                className="absolute top-3.5 right-3.5 p-2 text-gray-500 hover:text-black dark:hover:text-white rounded-full bg-black/5 dark:bg-white/5 transition cursor-pointer z-10"
              >
                <X size={18} />
              </button>

              <div className="pr-8">
                <h3 className="text-base sm:text-lg font-bold text-black dark:text-white flex items-center gap-2 truncate">
                  <Edit2 size={18} className="text-purple-600 dark:text-purple-400 shrink-0" />
                  <span className="truncate">Fix Metadata</span>
                </h3>
              </div>

              {/* Openlist Path Display */}
              {actualOpenlistPath && (
                <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-3 flex items-center justify-between gap-3 min-w-0">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <Folder size={16} className="text-purple-600 dark:text-purple-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Openlist Path</div>
                      <div 
                        className="text-xs font-mono text-black dark:text-white truncate select-all" 
                        title={actualOpenlistPath.startsWith('/') ? actualOpenlistPath : `/${actualOpenlistPath}`}
                      >
                        {actualOpenlistPath.startsWith('/') ? actualOpenlistPath : `/${actualOpenlistPath}`}
                      </div>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => {
                      const p = actualOpenlistPath.startsWith('/') ? actualOpenlistPath : `/${actualOpenlistPath}`;
                      navigator.clipboard.writeText(p);
                      setCopiedModalPath(true);
                      setTimeout(() => setCopiedModalPath(false), 2000);
                    }}
                    title="Copy Openlist Path"
                    className="p-1.5 rounded-lg bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 transition shrink-0 cursor-pointer"
                  >
                    {copiedModalPath ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                  </button>
                </div>
              )}

              <div className="space-y-4 w-full min-w-0">
                <div className="w-full min-w-0">
                  <label className="block text-gray-600 dark:text-gray-400 mb-1.5 text-[10px] font-bold uppercase tracking-wider">Search TMDB</label>
                  <div className="flex items-center gap-2 w-full min-w-0">
                    <input 
                      type="text"
                      value={searchTitle}
                      onChange={(e) => setSearchTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchTMDB()}
                      placeholder="Search title..."
                      className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:border-purple-500 text-black dark:text-white"
                    />
                    <button 
                      onClick={handleSearchTMDB}
                      disabled={searching}
                      title="Search"
                      className="w-10 h-10 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    </button>
                  </div>
                </div>

                {searchResults.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar w-full min-w-0">
                    {searchResults.map((result, idx) => (
                      <div 
                        key={idx}
                        onClick={() => handleSelectTMDBResult(result)}
                        className="p-3 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-purple-600/10 border border-black/10 dark:border-white/10 hover:border-purple-500/40 cursor-pointer transition flex items-center gap-3 w-full min-w-0"
                      >
                        {result.poster_path && (
                          <img 
                            src={`https://image.tmdb.org/t/p/w92${result.poster_path}`} 
                            alt={result.title || result.name} 
                            className="w-10 h-14 object-cover rounded-lg shrink-0"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-black dark:text-white truncate">
                            {result.title || result.name}
                          </h4>
                          <p className="text-[11px] text-gray-500 truncate mt-0.5">
                            {result.release_date || result.first_air_date || 'N/A'} • {result.media_type || category}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="pt-2 border-t border-black/10 dark:border-white/10 w-full min-w-0">
                  <label className="block text-gray-600 dark:text-gray-400 mb-2 text-[10px] font-bold uppercase tracking-wider">Or Set Custom Metadata</label>
                  <div className="flex flex-col sm:flex-row gap-2 mb-2 w-full min-w-0">
                    <input 
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="Custom Title..."
                      className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:border-purple-500 text-black dark:text-white"
                    />
                    <input 
                      type="text"
                      value={customYear}
                      onChange={(e) => setCustomYear(e.target.value)}
                      placeholder="Year"
                      className="w-full sm:w-28 min-w-0 px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:border-purple-500 text-black dark:text-white"
                    />
                  </div>
                  <button 
                    onClick={handleSaveCustomMetadata}
                    disabled={savingCustom || !customTitle.trim()}
                    className="w-full px-4 py-2.5 rounded-xl bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 text-black dark:text-white font-semibold text-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {savingCustom ? <Loader2 size={16} className="animate-spin" /> : <Edit2 size={16} />}
                    Save Custom Metadata
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
