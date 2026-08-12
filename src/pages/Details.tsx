import DetailsSkeleton from "../components/DetailsSkeleton";
import { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useLocation, useNavigate } from 'react-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { 
  Play, Download, Copy, ExternalLink, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, 
  X, Edit2, Bookmark, BookmarkCheck, RefreshCw, Check, Film, Tv, MonitorPlay, Sparkles, Loader2, Trash2, Youtube, Eye, EyeOff, User, HardDrive
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseMediaName, extractFileMetadata, formatBytes } from '../utils/nameParser';
import { getGenresWithIds } from '../utils/genres';
import { getLocalCache, setLocalCache } from '../services/localDB';
import { clearRecommendationsCache } from './Recommendations';
import { MediaItem, TMDBData } from '../types';
import VideoPlayer from '../components/VideoPlayer';
import { FastAverageColor } from "fast-average-color";

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

              {os !== 'ios' && os !== 'macos' && (
                <button
                  onClick={() => {
                    if (url) {
                      onPlayWeb(url);
                      onClose();
                    }
                  }}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-500/50 text-black dark:text-white transition text-left cursor-pointer"
                >
                  <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-500 font-bold text-xs shrink-0">
                    <Play size={14} fill="currentColor" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold">Play Here</div>
                    <div className="text-[10px] text-gray-500 truncate">play in browser</div>
                  </div>
                </button>
              )}
            </div>
            <div className="mt-3 text-[11px] text-gray-500 dark:text-gray-400 text-center italic">
              Streaming in browsers do not support embedded soft subtitles, use {os === 'android' ? 'mpv' : os === 'ios' ? 'VLC or Infuse' : os === 'macos' ? 'IINA' : os === 'windows' ? 'PotPlayer' : 'an external player'} for the best experience.
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
  const actualOpenlistPath = location.state?.item?.openlist_path || location.state?.item?.path || fullPath;

  const { token, user } = useAuth();
  const [config, setConfig] = useState<any>({});

  useEffect(() => {
    axios.get('/api/config').then(res => {
      if (res.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
        setConfig(res.data);
      }
    });
  }, []);

  // Directory items & state
  const [baseItems, setBaseItems] = useState<any[]>([]);
  const [seasonItems, setSeasonItems] = useState<any[]>([]);
  const [tmdb, setTmdb] = useState<any>(location.state?.tmdbData || null);
  const [loading, setLoading] = useState(!location.state?.tmdbData);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [toast, setToast] = useState('');
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
  
  const [showPathModal, setShowPathModal] = useState(false);
  const [manualPathInput, setManualPathInput] = useState(fullPath.replace(/^\//, ''));

  const handleUpdateDigitalPath = async () => {
    if (user !== 'admin' || !tmdb?.id) return;
    try {
      const res = await axios.post('/api/meta/digital-path', { tmdbId: tmdb.id, path: manualPathInput }, { headers: { Authorization: token } });
      if (res.data.success) {
        setToast('Digital Path Updated. Reloading...');
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (e) {
      console.error(e);
      setToast('Failed to update path');
    }
  };

  useEffect(() => {
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
      const fullTitle = `${mediaTitle}${releaseYear ? ` (${releaseYear})` : ''} - SHUTTER!`;
      document.title = fullTitle;

      const overview = tmdb.overview ? tmdb.overview.trim() : `Watch ${mediaTitle} on SHUTTER!`;
      const poster = tmdb.poster_path
        ? (tmdb.poster_path.startsWith('http') ? tmdb.poster_path : `https://image.tmdb.org/t/p/w780${tmdb.poster_path}`)
        : tmdb.backdrop_path
          ? (tmdb.backdrop_path.startsWith('http') ? tmdb.backdrop_path : `https://image.tmdb.org/t/p/w1280${tmdb.backdrop_path}`)
          : '';

      const setMetaTag = (attrName: string, attrVal: string, content: string) => {
        let meta = document.querySelector(`meta[${attrName}="${attrVal}"]`) as HTMLMetaElement;
        if (!meta) {
          meta = document.createElement('meta');
          meta.setAttribute(attrName, attrVal);
          document.head.appendChild(meta);
        }
        meta.content = content;
      };

      setMetaTag('property', 'og:title', fullTitle);
      setMetaTag('name', 'twitter:title', fullTitle);
      if (overview) {
        setMetaTag('name', 'description', overview);
        setMetaTag('property', 'og:description', overview);
        setMetaTag('name', 'twitter:description', overview);
      }
      if (poster) {
        setMetaTag('property', 'og:image', poster);
        setMetaTag('property', 'og:image:secure_url', poster);
        setMetaTag('name', 'twitter:image', poster);
      }
    } else if (cleanName) {
      document.title = `${cleanName}${parsedYear ? ` (${parsedYear})` : ''} - SHUTTER!`;
    }

    return () => {
      document.title = "SHUTTER! - Unlimited Movies, Series & Anime";
    };
  }, [tmdb, name]);
  
  // Active playing / modal state
  const [playingUrl, setPlayingUrl] = useState('');
  const [intentModalData, setIntentModalData] = useState<{ item: any; path: string } | null>(null);

  // Metadata correction modal
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [newTmdbId, setNewTmdbId] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customYear, setCustomYear] = useState('');
  const [searchTitle, setSearchTitle] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [forceType, setForceType] = useState<string>("");
  const searchTimeoutRef = useRef<any>(null);

  // TV Shows Season State
  const [activeSeasonIndex, setActiveSeasonIndex] = useState<number | null>(null);
  const clickedSeasonTab = useRef(false);
  const prefetchedFirstSeasonRef = useRef(false);
  const [seasonTmdb, setSeasonTmdb] = useState<any>(null);
  const [loadingSeasonTmdb, setLoadingSeasonTmdb] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [hasRefreshedRoot, setHasRefreshedRoot] = useState(false);

  useEffect(() => {
    setHasRefreshedRoot(false);
    prefetchedFirstSeasonRef.current = false;
    clickedSeasonTab.current = false;
    setActiveSeasonIndex(null);
  }, [fullPath, actualOpenlistPath]);

  // Watched state
  const [watchedItems, setWatchedItems] = useState<any[]>([]);

  useEffect(() => {
    if (user && user !== 'guest') {
      axios.get('/api/watched', { headers: { 'x-user': user } })
        .then(res => {
          if (Array.isArray(res.data)) {
            setWatchedItems(res.data);
          } else {
            setWatchedItems([]);
          }
        })
        .catch(console.error);
    }
  }, [user]);

  const toggleWatched = async (itemName: string, itemPath: string, currentStatus: boolean) => {
    if (user === 'guest') {
      setToast('Sign up for the website plan to use this feature');
      setTimeout(() => setToast(''), 3000);
      return;
    }
    
    // Optimistic UI update
    if (currentStatus) {
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

  const bulkToggleWatched = async (items: {name: string, parentPath: string}[], watched: boolean) => {
    if (user === 'guest') {
      setToast('Sign up for the website plan to use this feature');
      setTimeout(() => setToast(''), 3000);
      return;
    }
    
    // Optimistic
    if (watched) {
      setWatchedItems(prev => {
        const newItems = [...prev];
        for (const item of items) {
          if (!newItems.some(i => i.name === item.name && i.parentPath === item.parentPath)) {
            newItems.push({ name: item.name, parentPath: item.parentPath });
          }
        }
        return newItems;
      });
    } else {
      setWatchedItems(prev => prev.filter(i => !items.some(item => item.name === i.name && item.parentPath === i.parentPath)));
    }
    
    try {
      const payload = items.map(i => ({ ...i, watched }));
      await axios.post('/api/watched/bulk-toggle', { items: payload }, { headers: { 'x-user': user } });
    } catch(e) {
      console.error(e);
    }
  };

  // Trailer state
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null);
  const [loadingTrailer, setLoadingTrailer] = useState(false);

  // Cast & Crew state
  const [credits, setCredits] = useState<{ cast: any[]; crew: any[] }>(() => {
    const tmdbData = location.state?.tmdbData;
    if (tmdbData?.credits) {
      return {
        cast: Array.isArray(tmdbData.credits.cast) ? tmdbData.credits.cast : [],
        crew: Array.isArray(tmdbData.credits.crew) ? tmdbData.credits.crew : []
      };
    }
    return { cast: [], crew: [] };
  });
  const [loadingCredits, setLoadingCredits] = useState(false);

  useEffect(() => {
    if (tmdb?.credits) {
      setCredits({
        cast: Array.isArray(tmdb.credits.cast) ? tmdb.credits.cast : [],
        crew: Array.isArray(tmdb.credits.crew) ? tmdb.credits.crew : []
      });
      setLoadingCredits(false);
      return;
    }

    if (tmdb?.id) {
      setLoadingCredits(true);
      axios.get(`/api/meta/credits?id=${tmdb.id}&type=${category}`)
        .then(res => {
          if (res.data) {
            setCredits({
              cast: Array.isArray(res.data.cast) ? res.data.cast : [],
              crew: Array.isArray(res.data.crew) ? res.data.crew : []
            });
          }
        })
        .catch(() => {
          setCredits({ cast: [], crew: [] });
        })
        .finally(() => setLoadingCredits(false));
    } else {
      setCredits({ cast: [], crew: [] });
    }
  }, [tmdb?.id, tmdb?.credits, category]);

  const castAndCrewList = useMemo(() => {
    const list: Array<{ id: number | string; name: string; role: string; profile_path: string | null }> = [];
    const addedIds = new Set<number | string>();

    // 1. Extract Directors & Creators from crew
    if (credits.crew && credits.crew.length > 0) {
      const directors = credits.crew.filter(c => c.job === 'Director' || c.job === 'Creator');
      directors.forEach(d => {
        if (d.name && !addedIds.has(d.id || d.name)) {
          addedIds.add(d.id || d.name);
          list.push({
            id: d.id || `crew-${d.name}`,
            name: d.name,
            role: d.job || 'Director',
            profile_path: d.profile_path || null
          });
        }
      });
    }

    // Check tmdb.created_by for TV shows
    if (Array.isArray(tmdb?.created_by)) {
      tmdb.created_by.forEach((creator: any) => {
        if (creator.name && !addedIds.has(creator.id || creator.name)) {
          addedIds.add(creator.id || creator.name);
          list.push({
            id: creator.id || `creator-${creator.name}`,
            name: creator.name,
            role: 'Creator',
            profile_path: creator.profile_path || null
          });
        }
      });
    }

    // 2. Extract Cast
    if (credits.cast && credits.cast.length > 0) {
      const sortedCast = [...credits.cast].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      sortedCast.forEach(actor => {
        if (actor.name) {
          if (!addedIds.has(actor.id || actor.name)) {
            addedIds.add(actor.id || actor.name);
            list.push({
              id: actor.id || `cast-${actor.name}`,
              name: actor.name,
              role: actor.character || 'Actor',
              profile_path: actor.profile_path || null
            });
          }
        }
      });
    }

    return list;
  }, [credits, tmdb?.created_by]);

  const handleWatchTrailer = async () => {
    setShowTrailerModal(true);
    setTrailerUrl(null);
    if (!tmdb?.id) return;
    setLoadingTrailer(true);
    try {
      const type = category;
      const res = await axios.get(`/api/meta/videos?id=${tmdb.id}&type=${type}`);
      if (res.data && res.data.results) {
        const videos = res.data.results;
        // Find official trailer
        const trailer = videos.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube') || videos.find((v: any) => v.site === 'YouTube');
        if (trailer) {
          setTrailerUrl(`https://www.youtube.com/embed/${trailer.key}?autoplay=1`);
        }
      }
    } catch(e) {}
    setLoadingTrailer(false);
  };

  // Derived lists
  const isVideoFile = (filename: string) => /\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i.test(filename);
  const videoItems = (isMovieCategory ? baseItems : seasonItems)
    .filter(i => !i.is_dir && isVideoFile(i.name))
    .sort((a, b) => {
      const metaA = extractFileMetadata(a.name);
      const metaB = extractFileMetadata(b.name);
      if (metaA.episodeNum !== null && metaB.episodeNum !== null) {
        if (metaA.episodeNum !== metaB.episodeNum) {
          return metaA.episodeNum - metaB.episodeNum;
        }
      }
      const cleanA = a.name.replace(/^\[.*?\]\s*/, '').trim();
      const cleanB = b.name.replace(/^\[.*?\]\s*/, '').trim();
      return cleanA.localeCompare(cleanB, undefined, { numeric: true, sensitivity: 'base' });
    });
  const dirItems = baseItems.filter(i => i.is_dir).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

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

  const activeSeasonTab = activeSeasonIndex !== null ? seasonTabs[activeSeasonIndex] : null;
  const activeSeasonPath = activeSeasonTab?.folderName 
    ? `${actualOpenlistPath}/${activeSeasonTab.folderName}` 
    : (isVideoFile(name) ? actualOpenlistPath.split('/').slice(0, -1).join('/') : actualOpenlistPath);

  const showOverviewAndCast = isMovieCategory || activeSeasonIndex === null;

  const handleSelectSeason = (idx: number | null) => {
    clickedSeasonTab.current = true;
    if (idx !== activeSeasonIndex) {
      if (idx !== null) {
        setLoadingFiles(true);
        setSeasonItems([]);
        setSeasonTmdb(null);
        setLoadingSeasonTmdb(true);
      }
      setActiveSeasonIndex(idx);
      setSelectedItems([]);
    }
  };

  // Refresh folder directly bypassing cache
  const handleRefreshFolder = async (target: 'root' | 'subfolder' | 'auto' = 'auto') => {
    if (refreshing || !token) return;
    setRefreshing(true);
    setLoadingFiles(true);
    try {
      const isFile = isVideoFile(name);
      if (isFile) {
        const parentFolder = actualOpenlistPath.split('/').slice(0, -1).join('/');
        const reqPath = parentFolder.startsWith('/') ? parentFolder : `/${parentFolder}`;
        const res = await axios.post('/api/fs/list', { reqPath, refresh: true }, { headers: { Authorization: token } });
        if (res.data?.code === 200) {
          const content = res.data.data?.content || [];
          const matchedFile = content.find((c: any) => c.name === name);
          if (matchedFile) {
            setBaseItems([matchedFile]);
          } else {
            setBaseItems([{ name, is_dir: false }]);
          }
        } else {
          setBaseItems([{ name, is_dir: false }]);
        }
        setHasRefreshedRoot(true);
        setToast('Folder refreshed');
        setTimeout(() => setToast(''), 3000);
      } else {
        const isSubfolderActive = !isMovieCategory && activeSeasonPath && activeSeasonPath !== actualOpenlistPath;

        const shouldRefreshSubfolder = target === 'subfolder' || (target === 'auto' && isSubfolderActive && hasRefreshedRoot);

        if (shouldRefreshSubfolder && isSubfolderActive) {
          // Refresh active subfolder directory (e.g. S01, S02, etc.)
          const fetchSeasonPath = activeSeasonPath.startsWith('/') ? activeSeasonPath : `/${activeSeasonPath}`;
          const seasonRes = await axios.post(
            '/api/fs/list',
            { reqPath: fetchSeasonPath, refresh: true },
            { headers: { Authorization: token } }
          );
          if (seasonRes.data?.code === 200) {
            setSeasonItems(seasonRes.data.data?.content || []);
          }
          const subfolderLabel = activeSeasonTab?.label || 'Subfolder';
          setToast(`${subfolderLabel} folder refreshed`);
          setTimeout(() => setToast(''), 3000);
        } else if (target === 'root' || target === 'auto') {
          // Refresh parent/root directory list
          const fetchPath = actualOpenlistPath.startsWith('/') ? actualOpenlistPath : `/${actualOpenlistPath}`;
          
          let baseRes;
          let searchSuccess = false;
          try {
             baseRes = await axios.post('/api/fs/search', { parent: fetchPath, keywords: "" }, { headers: { Authorization: token } });
             if (baseRes.data?.code === 200 && baseRes.data?.data?.content && baseRes.data.data.content.length > 0) {
                searchSuccess = true;
             }
          } catch (e) {}

          if (!searchSuccess) {
             baseRes = await axios.post(
               '/api/fs/list',
               { reqPath: fetchPath, refresh: true },
               { headers: { Authorization: token } }
             );
          }

          if (baseRes.data?.code === 200) {
            const newBaseItems = baseRes.data.data?.content || [];
            setBaseItems(newBaseItems);
            if (!isMovieCategory && (!activeSeasonPath || activeSeasonPath === fullPath)) {
              setSeasonItems(newBaseItems);
            }
          }

          // Fetch active season directory list if present (if we're inside one)
          if (isSubfolderActive && activeSeasonIndex !== null) {
            const fetchSeasonPath = activeSeasonPath.startsWith('/') ? activeSeasonPath : `/${activeSeasonPath}`;
            const seasonRes = await axios.post(
              '/api/fs/list',
              { reqPath: fetchSeasonPath, refresh: true }, // We might want to force refresh it too if we just refreshed root, or maybe just standard fetch
              { headers: { Authorization: token } }
            );
            if (seasonRes.data?.code === 200) {
              setSeasonItems(seasonRes.data.data?.content || []);
            }
          }

          setHasRefreshedRoot(true);
          setToast('Root folder refreshed');
          setTimeout(() => setToast(''), 3000);
        }
      }
    } catch (err: any) {
      console.error("Error refreshing directory", err);
      setToast('Error refreshing folder');
      setTimeout(() => setToast(''), 3000);
    } finally {
      setRefreshing(false);
      setLoadingFiles(false);
    }
  };



  const handleDeleteFiles = async () => {
    if (!token || user !== 'admin' || selectedItems.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedItems.length} file(s)? This action cannot be undone.`)) return;
    
    try {
      const dir = isMovieCategory ? actualOpenlistPath : activeSeasonPath;
      const res = await axios.post('/api/fs/remove', {
        names: selectedItems,
        dir: dir.startsWith('/') ? dir : `/${dir}`
      }, { headers: { Authorization: token } });
      
      if (res.data.code === 200) {
        setToast('Files deleted successfully');
        setTimeout(() => setToast(''), 3000);
        setSelectedItems([]);
        handleRefreshFolder();
      } else {
        alert('Failed to delete files: ' + res.data.message);
      }
    } catch (e: any) {
      alert('Error deleting files: ' + (e.response?.data?.error || e.message));
    }
  };


  // Local Database Cache Layer to instantly eliminate skeletons
  const [preloaded, setPreloaded] = useState(false);
  useEffect(() => {
    let isMounted = true;
    
    // 1. Check local browser IndexedDB instantly
    getLocalCache(fullPath).then(cachedLocal => {
       if (isMounted && cachedLocal && !preloaded) {
         if (cachedLocal.tmdbData) setTmdb(cachedLocal.tmdbData);
         if (cachedLocal.baseItems && cachedLocal.baseItems.length > 0) setBaseItems(cachedLocal.baseItems);
         if (cachedLocal.seasonItems && cachedLocal.seasonItems.length > 0) setSeasonItems(cachedLocal.seasonItems);
         setLoading(false);
         setLoadingFiles(false);
         setPreloaded(true);
       }
    });

    // 2. Fetch from the unified backend SQLite Preload API
    if (token && !preloaded) {
      axios.post('/api/details/preload', { fullPath, name, category, activeSeasonPath }, { headers: { Authorization: token } })
        .then(res => {
          if (isMounted && res.data && res.data.source === 'sqlite_cache') {
             const data = res.data.data;
             if (data.tmdbData) setTmdb(data.tmdbData);
             if (data.baseItems && data.baseItems.length > 0) setBaseItems(data.baseItems);
             if (data.seasonItems && data.seasonItems.length > 0) setSeasonItems(data.seasonItems);
             
             // Save to local IndexedDB for future instant loads
             setLocalCache(fullPath, data).catch(console.error);
             
             setLoading(false);
             setLoadingFiles(false);
             setPreloaded(true);
          }
        })
        .catch(console.error);
    }
    return () => { isMounted = false; };
  }, [fullPath, name, category, activeSeasonPath, token, preloaded]);

  // Fetch Base Items
  useEffect(() => {
    if (preloaded) return;
    let isMounted = true;
    const fetchBaseList = async () => {
      setLoadingFiles(true);
      try {
        const isFile = isVideoFile(name);
        if (isFile) {
          if (token) {
            const parentFolder = actualOpenlistPath.split('/').slice(0, -1).join('/');
            const reqPath = parentFolder.startsWith('/') ? parentFolder : `/${parentFolder}`;
            const res = await axios.post('/api/fs/list', { reqPath }, { headers: { Authorization: token } });
            if (isMounted && res.data.code === 200) {
              const content = res.data.data?.content || [];
              const matchedFile = content.find((c: any) => c.name === name);
              if (matchedFile) {
                setBaseItems([matchedFile]);
              } else {
                setBaseItems([{ name, is_dir: false }]);
              }
            } else if (isMounted) {
              setBaseItems([{ name, is_dir: false }]);
            }
          } else if (isMounted) {
            setBaseItems([{ name, is_dir: false }]);
          }
        } else if (token) {
          const fetchPath = actualOpenlistPath.startsWith('/') ? actualOpenlistPath : `/${actualOpenlistPath}`;
          
          const res = await axios.post('/api/fs/list', { reqPath: fetchPath }, { headers: { Authorization: token } });
          if (isMounted && res.data.code === 200) {
            setBaseItems(res.data.data?.content || []);
          }
        }
      } catch (err: any) {
        if (isMounted && !axios.isCancel(err) && err.code !== 'ERR_CANCELED' && err.name !== 'CanceledError' && err.name !== 'AbortError' && !err.message?.toLowerCase().includes('aborted') && !err.message?.toLowerCase().includes('canceled')) {
          console.error("Error fetching file list", err);
        }
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
    
    // If it's preloaded, and we haven't manually clicked a season tab yet, don't overwrite
    if (preloaded && !clickedSeasonTab.current) return;

    let isMounted = true;
    const fetchSeasonList = async () => {
      setLoadingFiles(true);
      try {
        const isFile = isVideoFile(name);
        if (isFile) {
          if (isMounted) setSeasonItems([{ name, is_dir: false }]);
        } else if (token) {
          const fetchSeasonPath = activeSeasonPath.startsWith('/') ? activeSeasonPath : `/${activeSeasonPath}`;
          
          // If baseItems was populated via indexed search, it already contains the files for this season!
          const seasonFiles = baseItems.filter((item: any) => {
             if (item.is_dir) return false;
             if (item.parent === fetchSeasonPath || item.parent === fetchSeasonPath.replace(/\/$/, '')) return true;
             if (item.path && item.path.startsWith(fetchSeasonPath)) return true;
             return false;
          });
          
          if (seasonFiles.length > 0) {
             if (isMounted) setSeasonItems(seasonFiles);
          } else {
             // Fallback to list
             const res = await axios.post('/api/fs/list', { reqPath: fetchSeasonPath, refresh: false }, { headers: { Authorization: token } });
             if (isMounted && res.data.code === 200) {
               setSeasonItems(res.data.data?.content || []);
             }
          }
        }
      } catch (err: any) {
        if (isMounted && !axios.isCancel(err) && err.code !== 'ERR_CANCELED' && err.name !== 'CanceledError' && err.name !== 'AbortError' && !err.message?.toLowerCase().includes('aborted') && !err.message?.toLowerCase().includes('canceled')) {
          console.error("Error fetching season list", err);
        }
      } finally {
        if (isMounted) setLoadingFiles(false);
      }
    };
    
    if (baseItems.length > 0 || (seasonTabs.length === 1 && !seasonTabs[0].folderName)) {
      fetchSeasonList();
    }
    
    return () => { isMounted = false; };
  }, [activeSeasonPath, token, isMovieCategory, baseItems.length]);

  // Pre-fetch the first season's episode list in the background to eliminate network waterfall on click
  useEffect(() => {
    if (isMovieCategory || !token || seasonTabs.length === 0 || prefetchedFirstSeasonRef.current) return;
    
    prefetchedFirstSeasonRef.current = true;
    const firstSeasonFolder = seasonTabs[0].folderName;
    const fetchPath = firstSeasonFolder ? `${actualOpenlistPath}/${firstSeasonFolder}` : actualOpenlistPath;
    const normalizedFetchPath = fetchPath.startsWith('/') ? fetchPath : `/${fetchPath}`;
    
    // Silent background fetch to warm up backend SQLite cache
    axios.post('/api/fs/list', { reqPath: normalizedFetchPath, refresh: false }, { headers: { Authorization: token } }).catch(() => {});
  }, [isMovieCategory, token, seasonTabs, actualOpenlistPath]);

  // Save unified state to LocalDB and Backend SQLite
  useEffect(() => {
    if (tmdb && baseItems.length > 0 && !preloaded) {
      const data = { tmdbData: tmdb, baseItems, seasonItems };
      setLocalCache(fullPath, data).catch(() => {});
      
      if (token) {
        axios.post('/api/details/save', {
           fullPath,
           tmdbData: tmdb,
           baseItems,
           seasonItems
        }, { headers: { Authorization: token } }).catch(() => {});
      }
    }
  }, [tmdb, baseItems, seasonItems, fullPath, preloaded, token]);


  // Fetch TMDB Main Metadata
  useEffect(() => {
    if (preloaded) return;
    let isMounted = true;
    const fetchMetadata = async () => {
      if (!tmdb) {
        setLoading(true);
      }
      try {
        let searchName = name;
        if (/^(s\d+|season\s*\d+)$/i.test(name) && pathParts.length > 2) {
          searchName = pathParts[pathParts.length - 2];
        }
        const { cleanName, year } = parseMediaName(searchName);
        const itemPath = `/${fullPath}`;
        const tmdbRes = await axios.get(`/api/meta/search?query=${encodeURIComponent(cleanName)}&type=${encodeURIComponent(category)}${year ? `&year=${year}` : ''}&path=${encodeURIComponent(itemPath)}&full=true`);
        if (isMounted && tmdbRes.data) {
          setTmdb((prev: any) => ({ ...(prev || {}), ...tmdbRes.data }));
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
        } else if (isMounted && !tmdb) {
          setSearchTitle(cleanName);
        }
      } catch (err: any) {
        if (!isMounted || axios.isCancel(err) || err.code === 'ERR_CANCELED' || err.name === 'CanceledError' || err.name === 'AbortError' || err.message === 'canceled' || err.message?.toLowerCase().includes('aborted') || err.message?.toLowerCase().includes('canceled')) {
          return;
        }
        if (err.message !== 'Network Error') {
          console.error('Error fetching TMDB metadata', err);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    if (fullPath) fetchMetadata();
    return () => { isMounted = false; };
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
  const [unreleasedIds, setUnreleasedIds] = useState<number[]>(config.unreleasedTmdbIds || []);
  useEffect(() => {
    if (config.unreleasedTmdbIds) {
      setUnreleasedIds(config.unreleasedTmdbIds);
    }
  }, [config.unreleasedTmdbIds]);

  const isUnreleased = (tmdb?.id && unreleasedIds.some(id => Number(id) === Number(tmdb.id)));

  const handleToggleUnrelease = async () => {
    if (user !== 'admin' || !tmdb?.id) return;
    const isCurrentlyUnreleased = unreleasedIds.some(id => Number(id) === Number(tmdb.id));
    try {
      const res = await axios.post('/api/meta/unrelease', { tmdbId: Number(tmdb.id), unrelease: !isCurrentlyUnreleased }, { headers: { Authorization: token } });
      if (res.data.success) {
        setUnreleasedIds(res.data.unreleasedTmdbIds || []);
        setToast(isCurrentlyUnreleased ? 'Marked as Released' : 'Marked as Not Released');
        setTimeout(() => setToast(''), 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

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

    // Track download for analytics (For TV shows/episodes, only send the Show Title)
    try {
      let downloadTitle = '';
      if (!isMovieCategory) {
        // SHOW EPISODES -> Send Show Title
        downloadTitle = tmdb?.name || tmdb?.title || parseMediaName(name).cleanName || name;
      } else {
        // MOVIES
        downloadTitle = tmdb?.title || tmdb?.name || parseMediaName(item?.name || name).cleanName || item?.name || name;
      }

      if (downloadTitle) {
        axios.post('/api/downloads/track', {
          title: downloadTitle,
          category,
          isShow: !isMovieCategory,
          fileName: item?.name
        }, {
          headers: { Authorization: token || '', 'x-user': user || '' }
        }).catch(err => console.error('Failed to track download:', err));
      }
    } catch (e) {
      console.error('Download tracking error:', e);
    }

    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = item.name || 'download';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Single or Bulk Link Copy
  const getSignedUrl = async (fileName: string) => {
    const basePath = isMovieCategory ? (isVideoFile(name) ? fullPath.split('/').slice(0, -1).join('/') : fullPath) : activeSeasonPath;
    try {
      const cleanPath = basePath.replace(/\/+$/, '');
      const res = await axios.post('/api/fs/get', { reqPath: `${cleanPath}/${fileName}` }, { headers: { Authorization: token } });
      if (res.data?.data?.raw_url) return res.data.data.raw_url;
    } catch (e) {
      console.error(e);
    }
    return `${config.openlistUrl}/d/${basePath}/${fileName}`;
  };

  const handleCopySingleLink = async (item: any, itemPath: string) => {
    try {
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

      try {
        await navigator.clipboard.writeText(fileUrl);
      } catch (err) {
        const textArea = document.createElement("textarea");
        textArea.value = fileUrl;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      let downloadTitle = isMovieCategory
        ? (tmdb?.title || tmdb?.name || parseMediaName(item?.name || name).cleanName || item?.name || name)
        : (tmdb?.name || tmdb?.title || parseMediaName(name).cleanName || name);

      if (downloadTitle) {
        axios.post('/api/downloads/track', {
          title: downloadTitle,
          category,
          isShow: !isMovieCategory,
          fileName: item?.name
        }, {
          headers: { Authorization: token || '', 'x-user': user || '' }
        }).catch(() => {});
      }

      setToast('Link copied to clipboard!');
      setTimeout(() => setToast(''), 3000);
    } catch (e) {
      setToast('Failed to copy link');
      setTimeout(() => setToast(''), 3000);
    }
  };

  const handleCopyLinks = async () => {
    if (selectedItems.length === 0) return;
    try {
      // Track bulk download link copies
      let downloadTitle = '';
      if (!isMovieCategory) {
        downloadTitle = tmdb?.name || tmdb?.title || parseMediaName(name).cleanName || name;
      } else {
        downloadTitle = tmdb?.title || tmdb?.name || parseMediaName(name).cleanName || name;
      }
      if (downloadTitle) {
        axios.post('/api/downloads/track', {
          title: downloadTitle,
          category,
          isShow: !isMovieCategory,
          count: selectedItems.length
        }, {
          headers: { Authorization: token || '', 'x-user': user || '' }
        }).catch(() => {});
      }

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
      const itemPath = `/${fullPath}`;
      
      const res = await axios.post('/api/meta/override', { query: cleanName, type: category, year, tmdbId: String(result.id), customTitle: '', customYear: '', path: itemPath }, { headers: { Authorization: token } });
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
    if (!newTmdbId && !customTitle && !customYear) return;
    try {
      let searchName = name;
      if (/^(s\d+|season\s*\d+)$/i.test(name) && pathParts.length > 2) {
        searchName = pathParts[pathParts.length - 2];
      }
      const { cleanName, year } = parseMediaName(searchName);
      const itemPath = `/${fullPath}`;
      const res = await axios.post('/api/meta/override', { query: cleanName, type: category, year, tmdbId: newTmdbId, customTitle, customYear, path: itemPath }, { headers: { Authorization: token } });
      if (res.data.success && res.data.data) {
        setTmdb(res.data.data);
        setShowMetadataModal(false);
        setNewTmdbId('');
        setCustomTitle('');
        setCustomYear('');
        clearRecommendationsCache();
        queryClient.invalidateQueries();
        setToast('Metadata updated successfully!');
        setTimeout(() => setToast(''), 3000);
      }
    } catch (err) {
      alert('Failed to update metadata. Ensure TMDB ID is correct.');
    }
  };

  if (loading && loadingFiles && baseItems.length === 0) return <DetailsSkeleton onRefresh={() => {}} refreshingFolder={false} />;

  const backdrop = tmdb?.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}` : null;
  const displayGenres = tmdb?.genres 
    ? tmdb.genres.map((g: any) => ({ id: g.id, name: g.name })) 
    : getGenresWithIds(tmdb?.genre_ids);
  
  const releaseYear = tmdb?.release_date 
    ? new Date(tmdb.release_date).getFullYear() 
    : tmdb?.first_air_date 
      ? new Date(tmdb.first_air_date).getFullYear() 
      : null;

  const logoPath = tmdb?.images?.logos?.find((l: any) => l.iso_639_1 === 'en')?.file_path 
    || tmdb?.images?.logos?.[0]?.file_path;
  const logoUrl = logoPath ? `https://image.tmdb.org/t/p/w500${logoPath}` : null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="-mt-16 min-h-screen pb-24 relative overflow-x-hidden max-w-full z-0"
    >
      <div className="fixed inset-0 pointer-events-none z-[-2] bg-[#fffcf9] dark:bg-[#08080a]" />
      {(tmdb?.poster_path || tmdb?.backdrop_path) && (
        <div className="fixed inset-0 pointer-events-none z-[-1] opacity-30 dark:opacity-[0.15] overflow-hidden">
          <img 
            src={`https://image.tmdb.org/t/p/w92${tmdb.poster_path || tmdb.backdrop_path}`}
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[150%] h-[150%] object-cover blur-[120px] saturate-200"
            alt=""
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#fffcf9]/50 to-[#fffcf9] dark:via-[#08080a]/50 dark:to-[#08080a]" />
        </div>
      )}
      {/* Video Modal (Web Player) */}
      {playingUrl && (
        <div className="fixed inset-0 z-[130] bg-black/95 flex flex-col items-center justify-center backdrop-blur-md p-4 sm:p-6">
          <div className="relative w-full max-w-6xl aspect-video max-h-[85vh]" style={{ transform: 'translate3d(0,0,0)', willChange: 'transform' }}>
            <button 
              onClick={() => setPlayingUrl('')} 
              className="absolute -top-12 right-0 text-white/70 hover:text-white transition bg-white/10 hover:bg-white/20 p-1.5 rounded-full z-30 cursor-pointer flex items-center gap-1 text-xs font-bold px-3 py-1.5 backdrop-blur-sm"
              title="Close Player"
            >
              <X size={16} /> Close
            </button>
            <VideoPlayer
              src={playingUrl}
              title={tmdb?.title || tmdb?.name || name}
              poster={tmdb?.backdrop_path ? `https://image.tmdb.org/t/p/w1280${tmdb.backdrop_path}` : undefined}
              onClose={() => setPlayingUrl('')}
            />
          </div>
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

      {/* Trailer Modal */}
      {showTrailerModal && createPortal(
        <div 
          className="fixed inset-0 z-[120] bg-black/95 flex flex-col items-center justify-center backdrop-blur-md px-4"
          onClick={() => {
            setShowTrailerModal(false);
            setTrailerUrl(null);
          }}
        >
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setShowTrailerModal(false);
              setTrailerUrl(null);
            }} 
            className="absolute top-24 right-6 text-white/70 hover:text-white transition bg-white/10 p-2.5 rounded-full z-10 cursor-pointer"
          >
            <X size={24} />
          </button>
          
          <div 
            className="w-full max-w-5xl aspect-video bg-black rounded-2xl shadow-2xl overflow-hidden relative border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            {!trailerUrl ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70">
                {loadingTrailer ? (
                  <>
                    <Loader2 size={32} className="animate-spin mb-4" />
                    <p className="font-semibold text-lg">Loading Trailer...</p>
                  </>
                ) : (
                  <div className="text-center">
                    <p className="font-semibold text-lg mb-4">No official trailer found.</p>
                    <a 
                      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${tmdb?.title || tmdb?.name || name}${releaseYear ? ` ${releaseYear}` : ''} trailer`)}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl font-bold transition shadow-lg shadow-red-600/20"
                    >
                      <Youtube size={20} />
                      Search on YouTube
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <iframe 
                src={trailerUrl} 
                className="w-full h-full border-0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowFullScreen
              ></iframe>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Edit Path Modal */}
      {showPathModal && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center backdrop-blur-md px-4">
          <div className="bg-white/80 dark:bg-[#1a1a22]/80 backdrop-blur-2xl p-6 rounded-2xl border border-black/10 dark:border-white/10 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold text-black dark:text-white mb-2">Edit Digital Release Path</h3>
            <p className="text-xs font-mono text-gray-600 dark:text-gray-400 mb-4 break-words break-all">Update the exact OpenList path for this digital release. Enter without leading slash. E.g. home/MOVIES/Title.2024</p>
            <div className="mb-4">
              <label className="block text-gray-600 dark:text-gray-400 text-sm mb-2 font-bold">OpenList Path</label>
              <input
                 type="text"
                 value={manualPathInput}
                 onChange={(e) => setManualPathInput(e.target.value)}
                 className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 text-black dark:text-white rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setShowPathModal(false)}
                className="px-4 py-2 rounded-xl font-bold text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button 
                onClick={handleUpdateDigitalPath}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-bold shadow-lg shadow-blue-600/20 transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fix Metadata Modal */}
      {showMetadataModal && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center backdrop-blur-md px-4">
          <div className="bg-white/80 dark:bg-[#1a1a22]/80 backdrop-blur-2xl p-6 rounded-2xl border border-black/10 dark:border-white/10 w-full max-w-md shadow-2xl">
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
              <div className="grid grid-cols-1 gap-2">
                <input 
                  type="text" 
                  value={customYear} 
                  onChange={e => setCustomYear(e.target.value)} 
                  placeholder="Custom Display Year" 
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
                  setCustomYear('');
                }} className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition cursor-pointer">Cancel</button>
                <button 
                  type="submit" 
                  disabled={!newTmdbId && !customTitle && !customYear}
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
        <div 
           className="absolute top-0 left-0 right-0 h-[52vh] sm:h-[60vh] md:h-[68vh] pointer-events-none z-0"
           style={{ WebkitMaskImage: 'linear-gradient(to top, transparent 0%, black 80%)', maskImage: 'linear-gradient(to top, transparent 0%, black 80%)' }}
        >
          <img 
             src={backdrop} 
             className="w-full h-full object-cover opacity-100 md:opacity-80" 
             alt="Backdrop" 
          />
        </div>
      )}

      {/* Main Details Section */}
      <div className="px-4 sm:px-8 md:px-12 pt-[32vh] sm:pt-[38vh] md:pt-[45vh] relative z-20 flex flex-col items-center text-center gap-6 mb-8 max-w-4xl mx-auto">
        {/* Logo / Title */}
        <div className="flex flex-col items-center gap-4 w-full">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt={tmdb?.title || tmdb?.name || name} 
              className="w-48 sm:w-60 md:w-72 max-h-28 sm:max-h-32 object-contain drop-shadow-2xl select-none pointer-events-none" 
              draggable={false} 
              onContextMenu={(e) => e.preventDefault()} 
            />
          ) : (
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight drop-shadow-xl text-black dark:text-white break-words w-full text-balance">
              {tmdb?.title || tmdb?.name || name}
              {releaseYear ? <span className="font-normal ml-3 text-xl sm:text-2xl text-gray-500 dark:text-gray-300">({releaseYear})</span> : null}
            </h1>
          )}

          {!isMovieCategory && tmdb?.status && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${tmdb.status.toLowerCase() === 'ended' || tmdb.status.toLowerCase() === 'canceled' ? 'bg-red-500/20 text-red-600 dark:text-red-400' : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'}`}>{tmdb.status === 'Returning Series' ? 'Ongoing' : tmdb.status}</span>
          )}
        </div>

        {/* Action Row: Watchlist & Trailer & Admin Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button 
            onClick={handleToggleWatchlist}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition-all text-xs cursor-pointer ${
              inWatchlist 
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' 
                : 'bg-black/10 dark:bg-white/10 text-black dark:text-white hover:bg-black/20 dark:hover:bg-white/20'
            }`}
          >
            {inWatchlist ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
            {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
          </button>
          
          <button
            onClick={handleWatchTrailer}
            disabled={loadingTrailer}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition-all text-xs cursor-pointer bg-black/10 dark:bg-white/10 text-black dark:text-white hover:bg-black/20 dark:hover:bg-white/20 disabled:opacity-50"
          >
            {loadingTrailer ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Watch Trailer
          </button>

          <button onClick={() => {
            if (user === 'guest') {
              setToast('Sign up for the website plan to use this feature');
              setTimeout(() => setToast(''), 3000);
            } else {
              setShowMetadataModal(true);
            }
          }} className="flex items-center gap-1.5 bg-purple-500/10 dark:bg-white/10 border border-purple-500/20 dark:border-white/10 text-purple-700 dark:text-purple-300 hover:bg-purple-600 dark:hover:bg-white/20 hover:text-white p-2 rounded-lg transition cursor-pointer shadow-sm text-xs font-bold" title="Fix Metadata">
            <Edit2 size={16} />
          </button>
          
          {user === 'admin' && isMovieCategory && tmdb?.id && (
             <button onClick={handleToggleUnrelease} className={`flex items-center gap-1.5 p-2 rounded-lg transition cursor-pointer shadow-sm border text-xs font-bold ${unreleasedIds.some(id => Number(id) === Number(tmdb.id)) ? 'bg-red-500/20 border-red-500/30 text-red-600 dark:text-red-400' : 'bg-gray-500/10 dark:bg-white/10 border-gray-500/20 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/20'}`} title="Toggle Released Status">
                {unreleasedIds.some(id => Number(id) === Number(tmdb.id)) ? 'Not Released' : 'Released'}
             </button>
          )}
          
          {user === 'admin' && location.state?.item?._digital_release && (
             <button onClick={() => setShowPathModal(true)} className="flex items-center gap-1.5 p-2 rounded-lg transition cursor-pointer shadow-sm border text-xs font-bold bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300 hover:bg-blue-600 hover:text-white" title="Edit Path">
                Edit Path
             </button>
          )}
        </div>

        {/* Genres */}
        {displayGenres && displayGenres.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {displayGenres.map((g: any, i: number) => (
              <button 
                key={i} 
                onClick={() => navigate(`/genre/${g.id}?name=${encodeURIComponent(g.name)}`, { state: { from: location.pathname + location.search + location.hash } })}
                className="px-3 py-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-full text-xs font-semibold hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer text-gray-700 dark:text-gray-300"
              >
                {g.name}
              </button>
            ))}
          </div>
        )}

        {/* Overview */}
        <AnimatePresence mode="wait">
          {showOverviewAndCast && tmdb?.overview && (
            <motion.div 
              key="overview-section"
              initial={{ opacity: 0, height: 0, scale: 0.98 }}
              animate={{ opacity: 1, height: 'auto', scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.98 }}
              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1.0] }}
              className="max-w-3xl flex flex-col items-center overflow-hidden w-full"
            >
              <motion.p 
                layout="position"
                className={`leading-relaxed text-sm md:text-base text-center text-gray-700 dark:text-gray-300 break-words w-full ${isOverviewExpanded ? '' : 'line-clamp-4'}`}
              >
                {tmdb?.overview}
              </motion.p>
              {tmdb?.overview && tmdb.overview.length > 200 && (
                <motion.button 
                  layout="position"
                  onClick={() => setIsOverviewExpanded(!isOverviewExpanded)}
                  className="mt-2 text-xs font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors cursor-pointer"
                >
                  {isOverviewExpanded ? 'Read less' : 'Read more'}
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-4 sm:px-8 md:px-12 max-w-7xl mx-auto w-full">

          {/* CAST & CREW SECTION */}
          <AnimatePresence mode="wait">
            {showOverviewAndCast && (loadingCredits || castAndCrewList.length > 0) && (
              <motion.div
                key="cast-crew-section"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1.0] }}
                className="mb-6 overflow-hidden"
              >
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-3">
                  Cast & Crew
                </h3>

                {loadingCredits ? (
                  <div className="flex gap-3 overflow-x-auto pb-3 pt-1 scrollbar-none">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="w-20 sm:w-24 md:w-28 shrink-0 flex flex-col items-center animate-pulse">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-xl sm:rounded-2xl bg-black/10 dark:bg-white/10" />
                        <div className="w-16 h-2.5 bg-black/10 dark:bg-white/10 rounded mt-2" />
                        <div className="w-10 h-2 bg-black/10 dark:bg-white/10 rounded mt-1" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-start gap-3 sm:gap-4 overflow-x-auto pb-3 pt-1 scrollbar-none snap-x">
                    {castAndCrewList.map((person) => {
                      const profileUrl = person.profile_path
                        ? (person.profile_path.startsWith('http')
                            ? person.profile_path
                            : `https://image.tmdb.org/t/p/w185${person.profile_path}`)
                        : null;

                      return (
                        <div
                          key={person.id}
                          onClick={() => navigate(`/person/${person.id}?name=${encodeURIComponent(person.name)}`)}
                          className="w-20 sm:w-24 md:w-28 shrink-0 text-center flex flex-col items-center group cursor-pointer snap-start transition-transform duration-200 hover:scale-[1.03]"
                          title={`View ${person.name}`}
                        >
                          <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 relative rounded-xl sm:rounded-2xl overflow-hidden bg-black/10 dark:bg-white/10 border border-black/10 dark:border-white/10 shadow-sm group-hover:shadow-md transition-all duration-300">
                            {profileUrl ? (
                              <img
                                src={profileUrl}
                                alt={person.name}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                loading="lazy"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                  const parent = (e.target as HTMLElement).parentElement;
                                  if (parent) {
                                    const fallback = parent.querySelector('.avatar-fallback');
                                    if (fallback) (fallback as HTMLElement).style.display = 'flex';
                                  }
                                }}
                              />
                            ) : null}
                            <div
                              className="avatar-fallback w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-900/30 to-slate-800/50 text-gray-400 font-bold text-xs"
                              style={{ display: profileUrl ? 'none' : 'flex' }}
                            >
                              <User size={22} className="text-gray-400 mb-0.5 opacity-70" />
                              <span className="text-[10px] text-gray-400 font-medium px-1 text-center line-clamp-1">{person.name}</span>
                            </div>
                          </div>

                          <h4 className="text-[11px] sm:text-xs font-semibold text-gray-900 dark:text-white mt-1.5 line-clamp-2 px-0.5 leading-tight group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                            {person.name}
                          </h4>
                          <p className="text-[10px] sm:text-[11px] font-normal text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 px-0.5 leading-tight">
                            {person.role}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

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
              ) : (
                <div className="flex flex-col gap-3 max-w-2xl">
                  {/* Always visible header with Refresh button */}
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    <div className="flex items-center gap-2">
                      <Film size={15} /> Movie File{videoItems.length !== 1 ? 's' : ''} Available {videoItems.length > 1 ? `(${videoItems.length})` : ''}
                    </div>
                    <button
                      onClick={() => handleRefreshFolder()}
                      disabled={refreshing}
                      title="Refresh folder directory from OpenList"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-black dark:text-white text-xs font-bold transition cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      <RefreshCw size={13} className={refreshing ? "animate-spin text-purple-600 dark:text-purple-400" : ""} />
                      <span className="hidden sm:inline">{refreshing ? "Refreshing..." : "Refresh Folder"}</span>
                    </button>
                  </div>
                  
                  {loadingFiles ? (
                    <div className="p-6 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 animate-pulse flex items-center justify-center h-32">
                      <div className="h-6 w-1/3 bg-gray-300/30 dark:bg-gray-700/30 rounded"></div>
                    </div>
                  ) : (!isUnreleased && videoItems.length > 0) ? (
                    videoItems.length === 1 ? (
                      /* Single Movie File Layout */
                      (() => {
                        const singleMovie = videoItems[0];
                        const meta = extractFileMetadata(singleMovie.name, singleMovie.size);
                        const resolvedMoviePath = isVideoFile(name) ? fullPath.split('/').slice(0, -1).join('/') : fullPath;
                        return (
                          <div className="flex flex-col gap-3 max-w-xl">
                            {/* Large Play Button */}
                        <button
                          onClick={() => setIntentModalData({ item: singleMovie, path: resolvedMoviePath })}
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
                              <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-white/20 text-white backdrop-blur-sm">
                                {meta.formattedSize}
                              </span>
                            )}
                          </div>
                        </button>

                        {/* Action Buttons Below: Download Direct & Copy Link */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <button
                            onClick={() => handleDirectDownload(singleMovie, resolvedMoviePath)}
                            className="w-full flex items-center justify-between px-5 py-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-600/50 hover:bg-black/10 dark:hover:bg-white/10 text-black dark:text-white font-extrabold transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="p-2 rounded-xl bg-black/10 dark:bg-white/10 text-black dark:text-white">
                                <Download size={18} />
                              </div>
                              <div className="text-left">
                                <div className="text-sm font-bold">Download Direct</div>
                                <div className="text-[11px] text-gray-500 dark:text-gray-400 font-normal">Save file to device</div>
                              </div>
                            </div>

                            {meta.formattedSize && (
                              <span className="px-2 py-0.5 rounded-lg text-xs font-extrabold bg-black/10 dark:bg-white/10 text-black dark:text-white">
                                {meta.formattedSize}
                              </span>
                            )}
                          </button>

                          <button
                            onClick={() => handleCopySingleLink(singleMovie, resolvedMoviePath)}
                            className="w-full flex items-center justify-between px-5 py-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-600/50 hover:bg-black/10 dark:hover:bg-white/10 text-black dark:text-white font-extrabold transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="p-2 rounded-xl bg-black/10 dark:bg-white/10 text-black dark:text-white">
                                <Copy size={18} />
                              </div>
                              <div className="text-left">
                                <div className="text-sm font-bold">Copy Link</div>
                                <div className="text-[11px] text-gray-500 dark:text-gray-400 font-normal">Copy direct file link</div>
                              </div>
                            </div>
                          </button>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  /* Multiple Movie Variants Layout */
                  <div className="space-y-3 max-w-2xl">
                    {/* Bulk Select & Actions Bar */}
                    <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-3.5 py-2.5 rounded-2xl gap-2 min-w-0">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700 dark:text-gray-300 select-none shrink-0">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-purple-600 rounded disabled:opacity-40 cursor-pointer shrink-0"
                          disabled={videoItems.length === 0}
                          checked={videoItems.length > 0 && selectedItems.length === videoItems.length}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedItems(videoItems.map(v => v.name));
                            else setSelectedItems([]);
                          }}
                        />
                        <span className="whitespace-nowrap">{selectedItems.length > 0 ? `${selectedItems.length} Selected` : 'Select All'}</span>
                      </label>

                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        {selectedItems.length > 0 && (
                          <button
                            onClick={handleCopyLinks}
                            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-purple-600/15 hover:bg-purple-600/25 text-purple-700 dark:text-purple-300 border border-purple-500/20 text-xs font-bold transition cursor-pointer shrink-0"
                            title="Copy Selected Links"
                          >
                            <Copy size={14} /> <span className="hidden sm:inline">Copy Links</span>
                          </button>
                        )}
                        {selectedItems.length > 0 && user && user !== 'guest' && (
                          <>
                            <button
                              onClick={() => {
                                bulkToggleWatched(selectedItems.map(name => ({ name, parentPath: fullPath })), true);
                                setSelectedItems([]);
                              }}
                              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-xs font-bold transition cursor-pointer shrink-0"
                              title="Mark Selected as Watched"
                            >
                              <Check size={14} /> <span className="hidden sm:inline">Mark Watched</span>
                            </button>
                            <button
                              onClick={() => {
                                bulkToggleWatched(selectedItems.map(name => ({ name, parentPath: fullPath })), false);
                                setSelectedItems([]);
                              }}
                              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-black dark:text-white border border-black/10 dark:border-white/10 text-xs font-bold transition cursor-pointer shrink-0"
                              title="Mark Selected as Unwatched"
                            >
                              <X size={14} /> <span className="hidden sm:inline">Mark Unwatched</span>
                            </button>
                          </>
                        )}
                        {selectedItems.length > 0 && user === 'admin' && (
                          <button
                            onClick={handleDeleteFiles}
                            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition cursor-pointer shrink-0 shadow-sm"
                            title="Delete Selected Files"
                          >
                            <Trash2 size={14} /> <span className="hidden sm:inline">Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                    {videoItems.map((mItem, idx) => {
                      const meta = extractFileMetadata(mItem.name, mItem.size);
                      const isSelected = selectedItems.includes(mItem.name);
                      const isMovieWatched = user && user !== 'guest' && watchedItems.some(i => i.name === mItem.name && i.parentPath === fullPath);
                      return (
                        <div key={idx} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 border rounded-2xl gap-3 transition-all duration-300 w-full min-w-0 overflow-hidden ${
                          isSelected ? 'bg-purple-600/10 border-purple-600/50 dark:bg-purple-600/15' : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:border-purple-600/50'
                        } ${isMovieWatched ? 'opacity-40 grayscale saturate-0 hover:opacity-100 hover:grayscale-0 hover:saturate-100' : ''}`}>
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <input 
                              type="checkbox"
                              className="w-4 h-4 accent-purple-600 rounded shrink-0 cursor-pointer"
                              checked={isSelected}
                              onChange={() => {
                                if (isSelected) setSelectedItems(prev => prev.filter(n => n !== mItem.name));
                                else setSelectedItems(prev => [...prev, mItem.name]);
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div className="text-xs sm:text-sm font-bold text-black dark:text-white line-clamp-2 break-words break-all" title={mItem.name}>
                                  {mItem.name}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
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
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {user && user !== 'guest' && (() => {
                              const isWatched = watchedItems.some(i => i.name === mItem.name && i.parentPath === fullPath);
                              return (
                                <button
                                  onClick={() => toggleWatched(mItem.name, fullPath, isWatched)}
                                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border transition cursor-pointer text-xs font-semibold ${
                                    isWatched
                                      ? 'bg-purple-600/10 border-purple-600/50 text-purple-700 dark:text-purple-300' 
                                      : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:border-purple-600/50 text-gray-600 dark:text-gray-400'
                                  }`}
                                  title={isWatched ? "Mark as Unwatched" : "Mark as Watched"}
                                >
                                  {isWatched ? <Eye size={14} /> : <EyeOff size={14} />}
                                  <span className="hidden sm:inline">{isWatched ? 'Watched' : 'Unwatched'}</span>
                                </button>
                              );
                            })()}
                            
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
                            <button
                              onClick={() => handleCopySingleLink(mItem, fullPath)}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-600/50 text-black dark:text-white font-semibold text-xs transition cursor-pointer"
                              title="Copy direct file link"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
                  <div className="text-gray-500 text-sm font-medium">
                    {(isUnreleased || (location.state?.item?._digital_release && location.state.item.releaseDate)) ? (
                      `This movie releases on digital on ${new Date(location.state?.item?.releaseDate || tmdb?.release_date || new Date()).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}.`
                    ) : (
                      "No video files found in this movie folder."
                    )}
                  </div>
                </div>
              )}
                </div>
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
              ) : activeSeasonIndex === null ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-extrabold text-black dark:text-white">Seasons</h3>
                    <button
                      onClick={() => handleRefreshFolder('root')}
                      disabled={refreshing}
                      title="Force refresh root folder to detect new seasons"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-black dark:text-white text-xs font-bold transition cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      <RefreshCw size={13} className={refreshing ? "animate-spin text-purple-600 dark:text-purple-400" : ""} />
                      <span className="hidden sm:inline">{refreshing ? "Refreshing..." : "Refresh Root"}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-5">
                    {loadingFiles && baseItems.length === 0 ? (
                      [1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="flex flex-col gap-1 sm:gap-2 animate-pulse">
                          <div className="rounded-xl sm:rounded-2xl bg-black/10 dark:bg-white/10 border border-black/5 dark:border-white/5 aspect-[2/3] w-full" />
                          <div className="text-center px-1 flex flex-col items-center gap-1 mt-1">
                             <div className="h-3 sm:h-4 w-2/3 bg-black/10 dark:bg-white/10 rounded" />
                             <div className="h-2.5 sm:h-3 w-1/2 bg-black/10 dark:bg-white/10 rounded" />
                          </div>
                        </div>
                      ))
                    ) : seasonTabs.map((tab, idx) => {
                      const seasonMeta = tmdb?.seasons?.find((s: any) => s.season_number === tab.seasonNum);
                      const rawPosterUrl = seasonMeta?.poster_path 
                        ? `https://image.tmdb.org/t/p/w500${seasonMeta.poster_path}` 
                        : (tmdb?.poster_path ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}` : null);
                      const posterUrl = rawPosterUrl ? `/api/image-proxy?url=${encodeURIComponent(rawPosterUrl)}` : null;
                      
                      return (
                        <div key={idx} className="flex flex-col gap-1 sm:gap-2">
                          <div 
                            onClick={() => handleSelectSeason(idx)}
                            className="group relative rounded-xl sm:rounded-2xl overflow-hidden cursor-pointer bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 aspect-[2/3] transition-[transform,shadow] duration-300 sm:hover:-translate-y-2 sm:hover:scale-[1.02] sm:hover:shadow-[0_0_40px_rgba(168,85,247,0.4)] shadow-xl active:scale-[0.98]"
                          >
                            {posterUrl ? (
                              <img src={posterUrl} alt={tab.label} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
                                <MonitorPlay className="w-10 h-10 mb-2 opacity-30 text-black dark:text-white" />
                                <span className="font-bold text-xs opacity-50 text-black dark:text-white text-center break-words">{tab.label}</span>
                              </div>
                            )}
                            
                            {/* Number badge on top right like jellyfin */}
                            {tab.seasonNum !== undefined && tab.seasonNum !== 0 && (
                              <div className="absolute top-0 right-0 bg-purple-900/60 backdrop-blur-md text-white font-black text-sm sm:text-lg w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-bl-2xl sm:rounded-bl-3xl shadow-lg border-l border-b border-purple-400/20">
                                {tab.seasonNum}
                              </div>
                            )}
                            
                            {/* Play overlay button on bottom right */}
                            <div className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 w-8 h-8 sm:w-10 sm:h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-emerald-900/50 opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100 z-10 hover:bg-emerald-400">
                               <Play size={16} className="ml-0.5 sm:w-5 sm:h-5 sm:ml-1 fill-current" />
                            </div>
                            
                            {/* Subtle dark gradient at bottom for contrast */}
                            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent pointer-events-none"></div>
                          </div>
                          
                          <div className="text-center px-1">
                             <h4 className="text-black dark:text-white font-bold text-[11px] sm:text-sm truncate">{tab.label}</h4>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Season Horizontal Selector Tabs */}
                  {seasonTabs.length > 0 && (
                    <div className="flex items-center gap-2 pb-2 border-b border-black/10 dark:border-white/10">
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleSelectSeason(null)}
                          className="px-4 py-2.5 rounded-xl font-extrabold text-xs transition-all whitespace-nowrap cursor-pointer bg-black/10 dark:bg-white/10 text-black dark:text-white hover:bg-black/20 dark:hover:bg-white/20 border border-black/10 dark:border-white/10 flex items-center gap-1.5 shrink-0"
                        >
                          <ChevronLeft size={16} /> Seasons
                        </button>
                        <div className="w-px h-6 bg-black/10 dark:bg-white/10 mx-1 shrink-0"></div>
                      </div>
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1 min-w-0 py-2 -my-2">
                        {seasonTabs.map((tab, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSelectSeason(idx)}
                            className={`px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                              activeSeasonIndex === idx
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25 scale-105'
                                : 'bg-black/5 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bulk Select & Actions Bar */}
                  <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-3.5 py-2.5 rounded-2xl gap-2 min-w-0">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700 dark:text-gray-300 select-none shrink-0">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-purple-600 rounded disabled:opacity-40 cursor-pointer shrink-0"
                        disabled={videoItems.length === 0}
                        checked={videoItems.length > 0 && selectedItems.length === videoItems.length}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedItems(videoItems.map(v => v.name));
                          else setSelectedItems([]);
                        }}
                      />
                      <span className="whitespace-nowrap">{selectedItems.length > 0 ? `${selectedItems.length} Selected` : 'Select All'}</span>
                    </label>

                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      {selectedItems.length > 0 && (
                        <>
                          <button
                            onClick={handleCopyLinks}
                            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition cursor-pointer shrink-0 shadow-sm"
                            title="Copy Direct Links"
                          >
                            <Copy size={14} /> <span className="hidden sm:inline">Copy Links</span>
                          </button>
                          {user && user !== 'guest' && (
                            <>
                              <button
                                onClick={() => {
                                  bulkToggleWatched(selectedItems.map(name => ({ name, parentPath: activeSeasonPath })), true);
                                  setSelectedItems([]);
                                }}
                                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-xs font-bold transition cursor-pointer shrink-0"
                                title="Mark Selected as Watched"
                              >
                                <Check size={14} /> <span className="hidden sm:inline">Mark Watched</span>
                              </button>
                              <button
                                onClick={() => {
                                  bulkToggleWatched(selectedItems.map(name => ({ name, parentPath: activeSeasonPath })), false);
                                  setSelectedItems([]);
                                }}
                                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-black dark:text-white border border-black/10 dark:border-white/10 text-xs font-bold transition cursor-pointer shrink-0"
                                title="Mark Selected as Unwatched"
                              >
                                <X size={14} /> <span className="hidden sm:inline">Mark Unwatched</span>
                              </button>
                            </>
                          )}
                          {user === 'admin' && (
                            <button
                              onClick={handleDeleteFiles}
                              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition cursor-pointer shrink-0 shadow-sm"
                              title="Delete Selected Files"
                            >
                              <Trash2 size={14} /> <span className="hidden sm:inline">Delete</span>
                            </button>
                          )}
                        </>
                      )}

                      <button
                        onClick={() => handleRefreshFolder('subfolder')}
                        disabled={refreshing}
                        title={`Refresh ${activeSeasonTab?.label || 'Season'} subfolder`}
                        className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-black dark:text-white border border-black/10 dark:border-white/10 text-xs font-bold transition cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        <RefreshCw size={14} className={refreshing ? "animate-spin text-purple-600 dark:text-purple-400" : ""} />
                        <span className="hidden sm:inline">
                          {refreshing ? "Refreshing..." : `Refresh ${activeSeasonTab?.label || 'Folder'}`}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Episodes List */}
                  {loadingFiles ? (
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

                        const rawEpStill = epTmdb?.still_path ? `https://image.tmdb.org/t/p/w500${epTmdb.still_path}` : null;
                        const epStill = rawEpStill ? `/api/image-proxy?url=${encodeURIComponent(rawEpStill)}` : null;
                        const epOverview = epTmdb?.overview;
                        const isSelected = selectedItems.includes(epItem.name);
                        const isEpWatched = user && user !== 'guest' && watchedItems.some(i => i.name === epItem.name && i.parentPath === activeSeasonPath);

                        return (
                          <div 
                            key={epIdx}
                            className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 rounded-2xl border transition-all duration-300 gap-3.5 w-full min-w-0 overflow-hidden ${
                              isSelected 
                                ? 'bg-purple-600/10 border-purple-600/50 dark:bg-purple-600/15' 
                                : 'bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-600/40'
                            } ${isEpWatched ? 'opacity-40 grayscale saturate-0 hover:opacity-100 hover:grayscale-0 hover:saturate-100' : ''}`}
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

                              <div className="relative shrink-0">
                                {epStill ? (
                                  <img src={epStill} alt={epTitle} className="w-20 h-13 sm:w-28 sm:h-16 object-cover rounded-xl shadow border border-black/5 dark:border-white/5" />
                                ) : (
                                  <div className="w-20 h-13 sm:w-28 sm:h-16 bg-black/10 dark:bg-white/10 rounded-xl flex items-center justify-center text-gray-500">
                                    <Tv size={18} />
                                  </div>
                                )}
                              </div>

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

                            {/* Right Action Buttons: Play, Download, Watched */}
                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-black/5 dark:border-white/5">
                              
                              {user && user !== 'guest' && (() => {
                                const isWatched = watchedItems.some(i => i.name === epItem.name && i.parentPath === activeSeasonPath);
                                return (
                                  <button
                                    onClick={() => toggleWatched(epItem.name, activeSeasonPath, isWatched)}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border transition cursor-pointer text-xs font-semibold ${
                                      isWatched
                                        ? 'bg-purple-600/10 border-purple-600/50 text-purple-700 dark:text-purple-300' 
                                        : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:border-purple-600/50 text-gray-600 dark:text-gray-400'
                                    }`}
                                    title={isWatched ? "Mark as Unwatched" : "Mark as Watched"}
                                  >
                                    {isWatched ? <Eye size={13} /> : <EyeOff size={13} />}
                                    <span className="hidden sm:inline">{isWatched ? 'Watched' : 'Unwatched'}</span>
                                  </button>
                                );
                              })()}

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

                              <button
                                onClick={() => handleCopySingleLink(epItem, activeSeasonPath)}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-600/50 text-black dark:text-white font-semibold text-xs transition cursor-pointer"
                                title="Copy episode direct link"
                              >
                                <Copy size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-gray-500 text-sm py-6 text-center">
                      Loading Episodes...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
    </motion.div>
  );
}
