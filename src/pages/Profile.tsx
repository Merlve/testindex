import { useEffect, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { 
  User, 
  Bookmark, 
  History, 
  Sparkles, 
  Film, 
  Tv, 
  ShieldCheck, 
  Clock, 
  Settings, 
  LogOut, 
  ArrowRight, 
  Trash2, 
  Clapperboard, 
  PieChart, 
  Tag, 
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  Activity,
  Calendar,
  AlertTriangle,
  Clock3,
  Download,
  Trophy,
  Flame,
  Search,
  X,
  Check,
  Eye
} from 'lucide-react';
import ItemCard from '../components/ItemCard';
import Loader from '../components/Loader';
import { parseMediaName, extractFileMetadata } from '../utils/nameParser';

interface RecentlyBrowsedItem {
  item: { name: string };
  category: string;
  parentPath: string;
  tmdbData?: any;
  timestamp?: number;
}

export default function Profile() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [watchedList, setWatchedList] = useState<any[]>([]);
  const [recentlyBrowsed, setRecentlyBrowsed] = useState<RecentlyBrowsedItem[]>([]);
  const [expirationDate, setExpirationDate] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'top_downloads' | 'watchlist' | 'watched' | 'history' | 'account'>('overview');
  const [watchedFilter, setWatchedFilter] = useState<'all' | 'movie' | 'show' | 'episode'>('all');
  const [watchedSearchQuery, setWatchedSearchQuery] = useState('');
  const [inactivityTimeout, setInactivityTimeout] = useState<number>(0);
  const [topDownloads, setTopDownloads] = useState<any[]>([]);
  const [totalTracked, setTotalTracked] = useState<number>(0);

  // Load User Data
  const loadData = async () => {
    setRefreshing(true);
    try {
      // Parallel requests for all user metrics
      const [watchlistRes, recsRes, configRes, expirationsRes, meRes, topDownloadsRes, watchedRes] = await Promise.all([
        axios.get('/api/watchlist', { headers: { 'x-user': user || '', Authorization: token || '' } }).catch(() => ({ data: [] })),
        axios.get('/api/recommendations', { headers: { Authorization: token || '', 'x-user': user || '' } }).catch(() => ({ data: [] })),
        axios.get('/api/config').catch(() => ({ data: {} })),
        axios.get(`/api/users/expirations?t=${Date.now()}`, { headers: { Authorization: token || '' } }).catch(() => ({ data: {} })),
        axios.get('/api/auth/me', { headers: { Authorization: token || '' } }).catch(() => ({ data: null })),
        axios.get('/api/downloads/top').catch(() => ({ data: { topDownloads: [], totalTracked: 0 } })),
        axios.get('/api/watched', { headers: { 'x-user': user || '', Authorization: token || '' } }).catch(() => ({ data: [] }))
      ]);

      setWatchlist(watchlistRes.data || []);
      setRecommendations(recsRes.data?.results || []);
      setTopDownloads(topDownloadsRes.data?.topDownloads || []);
      setTotalTracked(topDownloadsRes.data?.totalTracked || 0);

      const rawWatched = Array.isArray(watchedRes.data) ? watchedRes.data : (watchedRes.data?.watched || []);
      setWatchedList(rawWatched);

      if (configRes.data && configRes.data.inactivityTimeout) {
        setInactivityTimeout(configRes.data.inactivityTimeout);
      }

      const exps = expirationsRes.data || {};
      const meData = meRes.data?.data || meRes.data || {};
      setUserInfo(meData);

      // Match user expiration date by ID or username
      let matchedExp: string | null = null;
      if (meData?.id && exps[meData.id]) {
        matchedExp = exps[meData.id];
      } else if (meData?.id && exps[String(meData.id)]) {
        matchedExp = exps[String(meData.id)];
      } else if (user && exps[user]) {
        matchedExp = exps[user];
      } else if (user && exps[user.toLowerCase()]) {
        matchedExp = exps[user.toLowerCase()];
      } else if (exps && typeof exps === 'object') {
        const foundKey = Object.keys(exps).find(k => 
          String(k) === String(meData?.id) || 
          String(k).toLowerCase() === String(user).toLowerCase()
        );
        if (foundKey) matchedExp = exps[foundKey];
      }

      setExpirationDate(matchedExp || null);

      // Load Recently Browsed from localStorage
      const recentStr = localStorage.getItem('recently_browsed') || '[]';
      try {
        setRecentlyBrowsed(JSON.parse(recentStr));
      } catch (e) {
        setRecentlyBrowsed([]);
      }
    } catch (err) {
      console.error('Failed to load profile details', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const clearHistory = () => {
    if (confirm('Are you sure you want to clear your recently viewed history?')) {
      localStorage.removeItem('recently_browsed');
      setRecentlyBrowsed([]);
    }
  };

  // Expiration Status Details
  const expirationStatus = useMemo(() => {
    if (!expirationDate) return null;
    const expTime = new Date(expirationDate).getTime();
    if (isNaN(expTime)) return null;

    const now = Date.now();
    const diffMs = expTime - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    const formattedDate = new Date(expirationDate).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const formattedShortDate = new Date(expirationDate).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    if (diffDays <= 0) {
      return { 
        isExpired: true, 
        text: `Expired on ${formattedShortDate}`, 
        diffDays: 0, 
        formattedDate,
        formattedShortDate
      };
    } else if (diffDays === 1) {
      return { 
        isExpired: false, 
        text: `Expires tomorrow`, 
        diffDays: 1, 
        formattedDate,
        formattedShortDate
      };
    } else {
      return { 
        isExpired: false, 
        text: `Expires in ${diffDays} days`, 
        diffDays, 
        formattedDate,
        formattedShortDate
      };
    }
  }, [expirationDate]);

  // Calculate Stats
  const movieCount = useMemo(() => {
    return watchlist.filter(item => {
      const cat = (item.category || item._cat || '').toLowerCase();
      return cat.includes('movie');
    }).length;
  }, [watchlist]);

  const tvSeriesCount = useMemo(() => {
    return watchlist.filter(item => {
      const cat = (item.category || item._cat || '').toLowerCase();
      return cat.includes('series') || cat.includes('tv');
    }).length;
  }, [watchlist]);

  const animeCount = useMemo(() => {
    return watchlist.filter(item => {
      const cat = (item.category || item._cat || '').toLowerCase();
      return cat.includes('anime');
    }).length;
  }, [watchlist]);

  // Aggregate Genre Distribution
  const genreStats = useMemo(() => {
    const genreMap: Record<string, number> = {};
    
    const extractGenres = (item: any) => {
      const tmdb = item.tmdbData || item.item?.tmdbData || item;
      if (tmdb?.genres && Array.isArray(tmdb.genres)) {
        tmdb.genres.forEach((g: any) => {
          const gName = typeof g === 'string' ? g : g.name;
          if (gName) {
            genreMap[gName] = (genreMap[gName] || 0) + 1;
          }
        });
      } else if (tmdb?.genre_ids) {
        genreMap['Popular Choices'] = (genreMap['Popular Choices'] || 0) + 1;
      }
    };

    watchlist.forEach(extractGenres);
    recentlyBrowsed.forEach(extractGenres);

    const sorted = Object.entries(genreMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const total = sorted.reduce((sum, [, count]) => sum + count, 0) || 1;

    return sorted.map(([name, count]) => ({
      name,
      count,
      percentage: Math.round((count / total) * 100)
    }));
  }, [watchlist, recentlyBrowsed]);

  const guestLoginTime = useMemo(() => {
    if (user === 'guest') {
      const loginTime = localStorage.getItem('qs_guest_login_time');
      if (loginTime) {
        return new Date(parseInt(loginTime, 10)).toLocaleTimeString();
      }
    }
    return null;
  }, [user]);

  const handleRemoveWatched = async (item: { rawName: string; parentPath: string }) => {
    try {
      const res = await axios.post('/api/watched/toggle', {
        name: item.rawName,
        parentPath: item.parentPath
      }, {
        headers: { Authorization: token || '', 'x-user': user || '' }
      });
      const updated = Array.isArray(res.data) ? res.data : (res.data?.watched || []);
      setWatchedList(updated);
      queryClient.setQueryData(['watched-list', user], updated);
      queryClient.invalidateQueries({ queryKey: ['watched-list', user] });
    } catch (err) {
      console.error('Failed to toggle watched item:', err);
    }
  };

  const [episodeTmdbMap, setEpisodeTmdbMap] = useState<Record<string, { episodes: any[]; poster_path?: string }>>({});

  const classifiedWatchedList = useMemo(() => {
    if (!Array.isArray(watchedList)) return [];

    return watchedList.map((entry) => {
      const rawName = entry.name || '';
      const parentPath = entry.parentPath || '';
      const fullPathLower = `${parentPath}/${rawName}`.toLowerCase();

      const isEpisodePattern = /s\d+e\d+|\be\d+\b|\bep\d+|episode/i.test(rawName) || /season\s*\d+/i.test(parentPath);
      const isShowFolder = fullPathLower.includes('series') || fullPathLower.includes('tv') || fullPathLower.includes('show') || fullPathLower.includes('anime');

      let type: 'movie' | 'show' | 'episode' = 'movie';
      if (isEpisodePattern) {
        type = 'episode';
      } else if (isShowFolder) {
        type = 'show';
      } else {
        type = 'movie';
      }

      const parentParts = parentPath.split('/').filter(Boolean);
      let subtitle = '';
      if (type === 'episode') {
        if (parentParts.length >= 2) {
          subtitle = parentParts.slice(-2).join(' • ');
        } else if (parentParts.length === 1) {
          subtitle = parentParts[0];
        }
      } else if (parentParts.length > 0 && parentParts[parentParts.length - 1] !== 'Movies') {
        subtitle = parentParts[parentParts.length - 1];
      }

      const { cleanName, year: parsedYear } = parseMediaName(rawName);
      const title = cleanName || rawName;

      // Extract detailed episode info for TMDB matching
      let episodeInfo: { showTitle: string; seasonNum: number; episodeNum: number | null } | null = null;
      if (type === 'episode') {
        const fileMeta = extractFileMetadata(rawName);
        let seasonNum = fileMeta.seasonNum;
        let episodeNum = fileMeta.episodeNum;

        // 1. Try extracting show title directly from filename before SxxExx pattern
        let extractedShowTitle = '';
        const sEPattern = /[sS](\d{1,2})[eE](\d{1,3})/i.exec(rawName) || /[sS](\d{1,2})[\s\-]+[eE]?\s*(\d{1,3})/i.exec(rawName) || /\b(\d{1,2})x(\d{1,3})\b/i.exec(rawName);
        if (sEPattern) {
          if (seasonNum === null) seasonNum = parseInt(sEPattern[1], 10);
          if (episodeNum === null) episodeNum = parseInt(sEPattern[2], 10);
          const prefix = rawName.substring(0, sEPattern.index).trim();
          if (prefix.length >= 2) {
            const { cleanName } = parseMediaName(prefix);
            if (cleanName && cleanName !== 'Unknown') {
              extractedShowTitle = cleanName;
            }
          }
        }

        // 2. If not found in filename prefix, check parent directory structure
        if (!extractedShowTitle) {
          let seasonFolderIdx = -1;
          for (let i = parentParts.length - 1; i >= 0; i--) {
            const part = parentParts[i];
            const match = /^(season\s*(\d+)|s(\d+)|specials?)$/i.exec(part);
            if (match) {
              seasonFolderIdx = i;
              if (seasonNum === null) {
                if (match[2]) seasonNum = parseInt(match[2], 10);
                else if (match[3]) seasonNum = parseInt(match[3], 10);
                else if (/special/i.test(part)) seasonNum = 0;
              }
              break;
            }
          }

          let rawShowName = '';
          if (seasonFolderIdx > 0) {
            rawShowName = parentParts[seasonFolderIdx - 1];
          } else if (parentParts.length > 0) {
            const lastPart = parentParts[parentParts.length - 1];
            if (!['movies', 'downloads', 'tv shows', 'shows'].includes(lastPart.toLowerCase())) {
              rawShowName = lastPart;
            }
          }

          if (rawShowName) {
            const { cleanName } = parseMediaName(rawShowName);
            extractedShowTitle = cleanName;
          }
        }

        if (seasonNum === null) seasonNum = 1;

        if (!extractedShowTitle) {
          const { cleanName } = parseMediaName(rawName);
          extractedShowTitle = cleanName;
        }

        episodeInfo = {
          showTitle: extractedShowTitle || 'TV Show',
          seasonNum,
          episodeNum
        };
      }

      const sanitizedPath = `${parentPath}/${rawName}`.replace(/\/\//g, '/').replace(/^\//, '');
      const linkUrl = `/${sanitizedPath.split('/').map(p => encodeURIComponent(p)).join('/')}`;

      return {
        rawName,
        parentPath,
        title,
        subtitle,
        year: parsedYear,
        type,
        episodeInfo,
        timestamp: entry.timestamp,
        linkUrl
      };
    });
  }, [watchedList]);

  // Async effect to fetch TMDB episode metadata for watched episodes
  useEffect(() => {
    if (!classifiedWatchedList || classifiedWatchedList.length === 0) return;

    const episodeItems = classifiedWatchedList.filter(
      (i) => i.type === 'episode' && i.episodeInfo?.showTitle && i.episodeInfo?.seasonNum !== null
    );

    if (episodeItems.length === 0) return;

    const neededKeys = Array.from(
      new Set(episodeItems.map((i) => `${i.episodeInfo!.showTitle.toLowerCase()}::${i.episodeInfo!.seasonNum}`))
    );

    neededKeys.forEach(async (key) => {
      if (episodeTmdbMap[key]) return;

      const [showTitleLower, seasonStr] = key.split('::');
      const seasonNum = parseInt(seasonStr, 10);
      const matchItem = episodeItems.find(
        (i) => i.episodeInfo!.showTitle.toLowerCase() === showTitleLower && i.episodeInfo!.seasonNum === seasonNum
      );
      if (!matchItem) return;

      try {
        const itemPath = matchItem.parentPath ? `${matchItem.parentPath}/${matchItem.rawName}` : matchItem.rawName;
        const searchRes = await axios.get(`/api/meta/search?query=${encodeURIComponent(matchItem.episodeInfo!.showTitle)}&type=tv&path=${encodeURIComponent(itemPath)}`);
        const showObj = searchRes.data?.results ? searchRes.data.results[0] : searchRes.data;
        if (showObj?.id) {
          const tvId = showObj.id;
          const seasonRes = await axios.get(`/api/meta/tv_season?tvId=${tvId}&season=${seasonNum}`);
          if (seasonRes.data && Array.isArray(seasonRes.data.episodes)) {
            setEpisodeTmdbMap((prev) => ({
              ...prev,
              [key]: {
                episodes: seasonRes.data.episodes,
                poster_path: seasonRes.data.poster_path || showObj.poster_path
              }
            }));
          }
        }
      } catch (err) {
        console.error(`Failed to fetch TMDB season metadata for ${key}`, err);
      }
    });
  }, [classifiedWatchedList]);

  // Helper to resolve TMDB metadata with filename fallback for a watched item
  const getWatchedDisplayItem = (item: any) => {
    if (item.type === 'episode' && item.episodeInfo) {
      const key = `${item.episodeInfo.showTitle.toLowerCase()}::${item.episodeInfo.seasonNum}`;
      const seasonTmdb = episodeTmdbMap[key];
      let epTmdb = seasonTmdb?.episodes?.find((e: any) => e.episode_number === item.episodeInfo.episodeNum);
      if (!epTmdb && item.episodeInfo.episodeNum && seasonTmdb?.episodes && seasonTmdb.episodes[item.episodeInfo.episodeNum - 1]) {
        epTmdb = seasonTmdb.episodes[item.episodeInfo.episodeNum - 1];
      }

      if (epTmdb) {
        const epNumStr = item.episodeInfo.episodeNum ? `E${item.episodeInfo.episodeNum < 10 ? '0' : ''}${item.episodeInfo.episodeNum}` : '';
        const seasonNumStr = item.episodeInfo.seasonNum !== null ? `S${item.episodeInfo.seasonNum < 10 ? '0' : ''}${item.episodeInfo.seasonNum}` : '';
        const codePrefix = seasonNumStr && epNumStr ? `${seasonNumStr}${epNumStr}` : (epNumStr || seasonNumStr);

        const episodeTitle = epTmdb.name ? (codePrefix ? `${codePrefix} - ${epTmdb.name}` : epTmdb.name) : item.title;

        return {
          ...item,
          displayTitle: episodeTitle,
          displaySubtitle: `${item.episodeInfo.showTitle}${item.episodeInfo.seasonNum !== null ? ` • Season ${item.episodeInfo.seasonNum}` : ''}`,
          stillUrl: epTmdb.still_path ? `https://image.tmdb.org/t/p/w500${epTmdb.still_path}` : (seasonTmdb?.poster_path ? `https://image.tmdb.org/t/p/w500${seasonTmdb.poster_path}` : null),
          overview: epTmdb.overview || null,
          airDate: epTmdb.air_date || null,
          hasTmdbMeta: true
        };
      }
    }

    // Fallback if no TMDB metadata or for non-episodes
    return {
      ...item,
      displayTitle: item.type === 'episode' ? item.rawName.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i, "") : item.title,
      displaySubtitle: item.subtitle,
      stillUrl: null,
      overview: null,
      airDate: null,
      hasTmdbMeta: false
    };
  };

  const watchedStats = useMemo(() => {
    const total = classifiedWatchedList.length;
    const movies = classifiedWatchedList.filter(i => i.type === 'movie').length;
    const shows = classifiedWatchedList.filter(i => i.type === 'show').length;
    const episodes = classifiedWatchedList.filter(i => i.type === 'episode').length;
    return { total, movies, shows, episodes };
  }, [classifiedWatchedList]);

  const filteredWatchedList = useMemo(() => {
    return classifiedWatchedList.filter((item) => {
      const displayItem = getWatchedDisplayItem(item);
      const matchesFilter = watchedFilter === 'all' || item.type === watchedFilter;
      const q = watchedSearchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        displayItem.displayTitle.toLowerCase().includes(q) || 
        displayItem.displaySubtitle.toLowerCase().includes(q) || 
        item.rawName.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [classifiedWatchedList, watchedFilter, watchedSearchQuery, episodeTmdbMap]);

  const renderTextMediaList = (items: any[], limit?: number) => {
    const displayItems = limit ? items.slice(0, limit) : items;

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
        {displayItems.map((entry, idx) => {
          const item = entry.item || entry;
          const rawName = item.name || entry.name || '';
          const parentPath = entry.parentPath || (item && item.parent) || entry.parent || entry._parent || '';
          const category = entry.category || entry._cat || '';
          const tmdb = entry.tmdbData;

          let searchName = rawName;
          if (/^(s\d+|season\s*\d+)$/i.test(rawName)) {
            const parentParts = parentPath.split('/').filter(Boolean);
            if (parentParts.length > 0) {
              searchName = parentParts[parentParts.length - 1];
            }
          }

          const { cleanName, year: parsedYear } = parseMediaName(searchName);
          let jfYear = '';
          if (item._jf && item._jf.year) jfYear = String(item._jf.year);

          const title = tmdb?.title || tmdb?.name || cleanName || rawName;
          const year = tmdb?.release_date?.substring(0, 4) || tmdb?.first_air_date?.substring(0, 4) || jfYear || parsedYear || '';

          const sanitizedPath = `${parentPath}/${rawName}`.replace(/\/\//g, '/').replace(/^\//, '');
          const fullPath = `/${sanitizedPath}`;
          const linkUrl = fullPath.split('/').map(p => encodeURIComponent(p)).join('/');

          const catLower = category.toLowerCase();
          const IconComponent = catLower.includes('series') || catLower.includes('tv') ? Tv : catLower.includes('anime') ? Clapperboard : Film;

          return (
            <Link 
              key={idx}
              to={linkUrl}
              className="flex items-center justify-between gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-purple-500/10 dark:hover:bg-purple-500/20 border border-black/5 dark:border-white/5 hover:border-purple-500/30 transition-all group cursor-pointer shadow-sm"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <IconComponent size={15} className="text-purple-500 dark:text-purple-400 shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-black dark:text-white truncate group-hover:text-purple-600 dark:group-hover:text-purple-300 transition">
                  {title}
                </span>
                {year && (
                  <span className="text-[11px] font-extrabold text-purple-700 dark:text-purple-300 bg-purple-500/15 dark:bg-purple-500/25 px-1.5 py-0.5 rounded-md shrink-0 border border-purple-500/20">
                    {`{${year}}`}
                  </span>
                )}
              </div>
              <ChevronRight size={14} className="text-gray-400 group-hover:translate-x-0.5 group-hover:text-purple-500 transition shrink-0" />
            </Link>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-6 md:p-10 max-w-7xl mx-auto space-y-6 sm:space-y-8 pb-28 animate-pulse">
        {/* Top Banner Skeleton */}
        <div className="rounded-2xl sm:rounded-3xl border bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 p-4 sm:p-7 md:p-9 h-32 sm:h-40" />

        {/* Tabs Skeleton */}
        <div className="flex gap-2 py-1 border-b border-black/5 dark:border-white/10 mb-6 overflow-x-auto no-scrollbar">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-9 w-24 bg-black/10 dark:bg-white/10 rounded-xl shrink-0" />
          ))}
        </div>

        {/* Content Skeleton */}
        <div className="space-y-6">
          <div className="h-64 rounded-2xl sm:rounded-3xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div className="h-48 rounded-2xl sm:rounded-3xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10" />
            <div className="h-48 rounded-2xl sm:rounded-3xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="p-3 sm:p-6 md:p-10 max-w-7xl mx-auto space-y-6 sm:space-y-8 pb-28"
    >
      {/* Top Banner / User Identity Header Card */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border backdrop-blur-xl backdrop-saturate-[180%] bg-white/50 border-white/60 text-gray-900 shadow-[0_8px_32px_0_rgba(31,38,135,0.18),inset_0_1px_1px_0_rgba(255,255,255,0.7)] dark:bg-black/60 dark:border-white/20 dark:text-white p-4 sm:p-7 md:p-9 transition-all duration-300">
        <div className="absolute -right-12 -top-12 w-64 h-64 bg-purple-500/10 dark:bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-12 -bottom-12 w-64 h-64 bg-blue-500/10 dark:bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6">
          {/* User Info Left Side */}
          <div className="flex items-center gap-3.5 sm:gap-5">
            <div className="relative shrink-0">
              <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-600 p-0.5 shadow-xl shadow-purple-600/20">
                <div className="w-full h-full bg-[#111118] rounded-[14px] flex items-center justify-center text-lg sm:text-2xl font-black text-purple-400">
                  {user?.substring(0, 3).toUpperCase() || 'USR'}
                </div>
              </div>
              <span className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-emerald-500 border-2 border-[#111118] rounded-full" title="Active Session" />
            </div>

            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-3xl font-extrabold text-black dark:text-white capitalize tracking-tight truncate">
                  {user}
                </h1>
                <span className={`px-2.5 py-0.5 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider rounded-full border shrink-0 ${
                  user === 'admin' 
                    ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30' 
                    : user === 'guest'
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30'
                    : 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30'
                }`}>
                  {user === 'admin' ? 'Administrator' : user === 'guest' ? 'Guest Pass' : 'Member'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-700 dark:text-gray-300 font-medium">
                <p className="flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                  <span>Authenticated Member</span>
                </p>

                {/* Expiration Date Tag if Set */}
                {expirationStatus && (
                  <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                    expirationStatus.isExpired 
                      ? 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30'
                      : expirationStatus.diffDays <= 7
                      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                  }`}>
                    <Calendar size={13} className="shrink-0" />
                    <span>{expirationStatus.text}</span>
                  </div>
                )}

                {guestLoginTime && (
                  <span className="text-amber-600 dark:text-amber-400 text-[11px] font-mono">
                    (Session started: {guestLoginTime})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons Right Side */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-black/10 dark:border-white/10">
            <button 
              onClick={loadData} 
              disabled={refreshing}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/15 hover:bg-black/10 dark:hover:bg-white/20 text-black dark:text-white flex items-center gap-1.5 transition cursor-pointer min-h-[40px]"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
            {user === 'admin' && (
              <button 
                onClick={() => navigate('/admin')} 
                className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-purple-600/20 border border-purple-600/30 hover:bg-purple-600/30 text-purple-700 dark:text-purple-300 flex items-center gap-1.5 transition cursor-pointer min-h-[40px]"
              >
                <Settings size={14} />
                <span>Admin</span>
              </button>
            )}
            <button 
              onClick={() => { logout(); navigate('/login'); }} 
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-600 dark:text-red-400 flex items-center gap-1.5 transition cursor-pointer min-h-[40px]"
            >
              <LogOut size={14} />
              <span>Log Out</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs - Horizontal Scrollable on Mobile */}
        <div className="mt-6 pt-5 border-t border-black/10 dark:border-white/10 flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth pb-1 -mx-1 px-1">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 whitespace-nowrap min-h-[38px] ${
              activeTab === 'overview' 
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' 
                : 'bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/20'
            }`}
          >
            <Activity size={15} /> Overview & Analytics
          </button>

          {user === 'admin' && (
            <button 
              onClick={() => setActiveTab('top_downloads')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 whitespace-nowrap min-h-[38px] ${
                activeTab === 'top_downloads' 
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' 
                  : 'bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/20'
              }`}
            >
              <Download size={15} /> Top 15 Downloads ({topDownloads.length})
            </button>
          )}
          <button 
            onClick={() => setActiveTab('watched')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 whitespace-nowrap min-h-[38px] ${
              activeTab === 'watched' 
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' 
                : 'bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/20'
            }`}
          >
            <CheckCircle2 size={15} /> Watched ({classifiedWatchedList.length})
          </button>
          <button 
            onClick={() => setActiveTab('watchlist')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 whitespace-nowrap min-h-[38px] ${
              activeTab === 'watchlist' 
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' 
                : 'bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/20'
            }`}
          >
            <Bookmark size={15} /> Watchlist ({watchlist.length})
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 whitespace-nowrap min-h-[38px] ${
              activeTab === 'history' 
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' 
                : 'bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/20'
            }`}
          >
            <History size={15} /> History ({recentlyBrowsed.length})
          </button>
          <button 
            onClick={() => setActiveTab('account')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 whitespace-nowrap min-h-[38px] ${
              activeTab === 'account' 
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' 
                : 'bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/20'
            }`}
          >
            <User size={15} /> Account Details
          </button>
        </div>
      </div>



      {/* TAB CONTENT: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6 sm:space-y-8">
          {/* Watchlist Breakdown & Quick Preview */}
          <section className="bg-white/80 dark:bg-[#12121a]/80 border border-black/5 dark:border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-7 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-black dark:text-white flex items-center gap-2">
                  <Bookmark className="text-purple-400 shrink-0" size={20} />
                  <span>My Watchlist Overview</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  You have <span className="font-bold text-purple-400">{watchlist.length} titles</span> saved in your personal library.
                </p>
              </div>
              <Link 
                to="/watchlist" 
                className="px-3.5 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-500 transition shadow-lg shadow-purple-600/20 flex items-center gap-1.5 self-start sm:self-auto min-h-[36px]"
              >
                <span>View Full Watchlist</span>
                <ArrowRight size={14} />
              </Link>
            </div>

            {/* Media Type Distribution Pill Bar */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="bg-black/5 dark:bg-white/5 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-black/5 dark:border-white/5">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-gray-500 font-semibold mb-0.5">
                  <Film size={14} className="text-purple-400 shrink-0" /> Movies
                </div>
                <div className="text-xl sm:text-2xl font-bold text-black dark:text-white">{movieCount}</div>
              </div>
              <div className="bg-black/5 dark:bg-white/5 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-black/5 dark:border-white/5">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-gray-500 font-semibold mb-0.5">
                  <Tv size={14} className="text-blue-400 shrink-0" /> TV Shows
                </div>
                <div className="text-xl sm:text-2xl font-bold text-black dark:text-white">{tvSeriesCount}</div>
              </div>
              <div className="bg-black/5 dark:bg-white/5 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-black/5 dark:border-white/5">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-gray-500 font-semibold mb-0.5 truncate">
                  <Clapperboard size={14} className="text-amber-400 shrink-0" /> Anime / Other
                </div>
                <div className="text-xl sm:text-2xl font-bold text-black dark:text-white">{animeCount}</div>
              </div>
            </div>

            {/* Watchlist Items Preview Strip */}
            {watchlist.length > 0 ? (
              renderTextMediaList(watchlist, 12)
            ) : (
              <div className="text-center py-10 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5">
                <Bookmark size={32} className="mx-auto text-gray-400 mb-2 opacity-50" />
                <p className="text-sm font-bold text-black dark:text-white">Your watchlist is currently empty</p>
                <p className="text-xs text-gray-500 mt-1">Bookmark movies and shows while browsing to save them here.</p>
              </div>
            )}
          </section>

          {/* Watched Media Overview */}
          <section className="bg-white/80 dark:bg-[#12121a]/80 border border-black/5 dark:border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-7 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-black dark:text-white flex items-center gap-2">
                  <CheckCircle2 className="text-emerald-500 dark:text-emerald-400 shrink-0" size={20} />
                  <span>My Watched Media</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  You have marked <span className="font-bold text-emerald-500 dark:text-emerald-400">{watchedStats.total} items</span> as watched.
                </p>
              </div>
              <button 
                onClick={() => setActiveTab('watched')} 
                className="px-3.5 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-500 transition shadow-lg shadow-purple-600/20 flex items-center gap-1.5 self-start sm:self-auto min-h-[36px] cursor-pointer"
              >
                <span>View All Watched</span>
                <ArrowRight size={14} />
              </button>
            </div>

            {/* Watched Breakdown Pills */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="bg-black/5 dark:bg-white/5 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-black/5 dark:border-white/5">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-gray-500 font-semibold mb-0.5">
                  <Film size={14} className="text-purple-400 shrink-0" /> Movies
                </div>
                <div className="text-xl sm:text-2xl font-bold text-black dark:text-white">{watchedStats.movies}</div>
              </div>
              <div className="bg-black/5 dark:bg-white/5 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-black/5 dark:border-white/5">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-gray-500 font-semibold mb-0.5">
                  <Tv size={14} className="text-blue-400 shrink-0" /> TV Shows
                </div>
                <div className="text-xl sm:text-2xl font-bold text-black dark:text-white">{watchedStats.shows}</div>
              </div>
              <div className="bg-black/5 dark:bg-white/5 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-black/5 dark:border-white/5">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-gray-500 font-semibold mb-0.5">
                  <Clapperboard size={14} className="text-emerald-400 shrink-0" /> Episodes
                </div>
                <div className="text-xl sm:text-2xl font-bold text-black dark:text-white">{watchedStats.episodes}</div>
              </div>
            </div>

            {/* Watched Items Preview Strip */}
            {classifiedWatchedList.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
                {classifiedWatchedList.slice(0, 6).map((rawItem, idx) => {
                  const item = getWatchedDisplayItem(rawItem);
                  return (
                    <div key={idx} className="flex items-center justify-between gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:border-purple-500/30 transition">
                      <Link to={item.linkUrl} className="flex items-center gap-2.5 min-w-0 flex-1 group">
                        {item.stillUrl ? (
                          <img src={item.stillUrl} alt={item.displayTitle} className="w-12 h-8 rounded-lg object-cover shrink-0 border border-black/10 dark:border-white/10" />
                        ) : item.type === 'movie' ? (
                          <Film size={15} className="text-purple-500 dark:text-purple-400 shrink-0" />
                        ) : item.type === 'show' ? (
                          <Tv size={15} className="text-blue-500 dark:text-blue-400 shrink-0" />
                        ) : (
                          <Clapperboard size={15} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs sm:text-sm font-bold text-black dark:text-white truncate group-hover:text-purple-600 dark:group-hover:text-purple-300 transition">
                            {item.displayTitle}
                          </div>
                          {item.displaySubtitle && (
                            <div className="text-[10px] text-gray-500 truncate">{item.displaySubtitle}</div>
                          )}
                        </div>
                      </Link>
                      <button
                        onClick={() => handleRemoveWatched(item)}
                        title="Mark as unwatched"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition shrink-0 cursor-pointer"
                      >
                        <CheckCircle2 size={16} className="text-emerald-500 hover:opacity-75" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5">
                <CheckCircle2 size={32} className="mx-auto text-gray-400 mb-2 opacity-50" />
                <p className="text-sm font-bold text-black dark:text-white">No watched items yet</p>
                <p className="text-xs text-gray-500 mt-1">Mark items as watched while browsing to track your progress here.</p>
              </div>
            )}
          </section>

          {/* Genre Preferences Breakdown */}
          {genreStats.length > 0 && (
            <section className="bg-white/80 dark:bg-[#12121a]/80 border border-black/5 dark:border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-7 space-y-4 sm:space-y-5">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-black dark:text-white flex items-center gap-2">
                  <Tag className="text-emerald-400 shrink-0" size={20} />
                  <span>Genre & Taste Analysis</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Based on your saved watchlist and viewing activity patterns.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {genreStats.map((g, idx) => (
                  <div key={idx} className="bg-black/5 dark:bg-white/5 p-3.5 rounded-xl border border-black/5 dark:border-white/5 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-black dark:text-white">
                      <span className="truncate mr-2">{g.name}</span>
                      <span className="text-emerald-400 shrink-0">{g.count} titles</span>
                    </div>
                    <div className="w-full h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500" 
                        style={{ width: `${Math.min(100, Math.max(15, g.percentage * 2))}%` }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Recently Browsed Quick Strip */}
          <section className="bg-white/80 dark:bg-[#12121a]/80 border border-black/5 dark:border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-7 space-y-4 sm:space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-black dark:text-white flex items-center gap-2">
                  <History className="text-blue-400 shrink-0" size={20} />
                  <span>Recent Browsing Activity</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Titles you recently opened or interacted with.
                </p>
              </div>
              {recentlyBrowsed.length > 0 && (
                <button 
                  onClick={clearHistory}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-red-400 hover:bg-red-500/10 transition flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 size={13} /> Clear
                </button>
              )}
            </div>

            {recentlyBrowsed.length > 0 ? (
              renderTextMediaList(recentlyBrowsed, 12)
            ) : (
              <div className="text-center py-8 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5">
                <History size={28} className="mx-auto text-gray-400 mb-2 opacity-50" />
                <p className="text-xs text-gray-500">No recently browsed items found.</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB CONTENT: TOP 15 DOWNLOADS (ADMIN) */}
      {activeTab === 'top_downloads' && user === 'admin' && (
        <section className="bg-white/80 dark:bg-[#12121a]/80 border border-black/5 dark:border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-7 space-y-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/5 dark:border-white/10 pb-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-1">
                <Trophy size={16} /> Admin Intelligence & Analytics
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-black dark:text-white flex items-center gap-2.5">
                <span>Top 15 Downloads</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/15 text-purple-400 border border-purple-500/20">
                  {topDownloads.length} Titles Tracked
                </span>
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Monitors user download activity. TV show episode downloads automatically rollup under the parent Show Title.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={loadData}
                disabled={refreshing}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white flex items-center gap-1.5 transition cursor-pointer min-h-[38px]"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                <span>Refresh Stats</span>
              </button>
              <button 
                onClick={async () => {
                  if (confirm('Are you sure you want to clear all download tracking analytics?')) {
                    await axios.post('/api/downloads/clear');
                    loadData();
                  }
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 flex items-center gap-1.5 transition cursor-pointer min-h-[38px]"
              >
                <Trash2 size={14} />
                <span>Reset Stats</span>
              </button>
            </div>
          </div>

          {topDownloads.length === 0 ? (
            <div className="text-center py-16 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5 space-y-3">
              <Download size={44} className="mx-auto text-gray-400 opacity-40" />
              <h4 className="text-base font-bold text-black dark:text-white">No downloads recorded yet</h4>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                When users download movies or TV show episodes, top downloaded titles will automatically aggregate here in real time.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {topDownloads.map((item, idx) => {
                const maxCount = topDownloads[0]?.count || 1;
                const percentage = Math.min(100, Math.round((item.count / maxCount) * 100));

                return (
                  <div 
                    key={idx} 
                    className={`group relative overflow-hidden rounded-2xl border p-4 transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      idx === 0 
                        ? 'bg-amber-500/10 border-amber-500/30' 
                        : idx === 1 
                        ? 'bg-slate-500/10 border-slate-400/30'
                        : idx === 2
                        ? 'bg-amber-700/10 border-amber-700/30'
                        : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 hover:border-purple-500/30'
                    }`}
                  >
                    {/* Rank & Information */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 shadow-md ${
                        idx === 0 
                          ? 'bg-gradient-to-br from-amber-400 to-yellow-600 text-black' 
                          : idx === 1 
                          ? 'bg-gradient-to-br from-slate-300 to-slate-500 text-black'
                          : idx === 2
                          ? 'bg-gradient-to-br from-amber-600 to-amber-800 text-white'
                          : 'bg-black/10 dark:bg-white/10 text-black dark:text-white'
                      }`}>
                        #{idx + 1}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-extrabold text-black dark:text-white truncate">
                            {item.title}
                          </h4>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-purple-500/15 text-purple-400 border border-purple-500/20">
                            {item.category || 'MEDIA'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400 font-medium">
                          {item.lastUser && (
                            <span>Last user: <strong className="text-purple-400">{item.lastUser}</strong></span>
                          )}
                          {item.lastDownloaded && (
                            <span>• {new Date(item.lastDownloaded).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Stats & Bar */}
                    <div className="flex items-center sm:flex-col sm:items-end justify-between gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-black/5 dark:border-white/5">
                      <div className="flex items-center gap-2">
                        <Flame size={16} className={idx < 3 ? 'text-amber-400 animate-pulse' : 'text-purple-400'} />
                        <span className="text-lg font-black text-black dark:text-white">
                          {item.count} <span className="text-xs font-semibold text-gray-500">download{item.count !== 1 ? 's' : ''}</span>
                        </span>
                      </div>

                      <div className="w-28 h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            idx === 0 
                              ? 'bg-gradient-to-r from-amber-400 to-yellow-500' 
                              : 'bg-gradient-to-r from-purple-500 to-indigo-500'
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB CONTENT: WATCHED TAB */}
      {activeTab === 'watched' && (
        <section className="bg-white/80 dark:bg-[#12121a]/80 border border-black/5 dark:border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-7 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-black dark:text-white flex items-center gap-2">
                <CheckCircle2 className="text-emerald-500 dark:text-emerald-400 shrink-0" size={22} />
                <span>Watched Library ({classifiedWatchedList.length})</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Movies, TV shows, and episodes you have marked as watched.
              </p>
            </div>

            {/* Summary Chips */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-bold">
                {watchedStats.movies} Movies
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-bold">
                {watchedStats.shows} Shows
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold">
                {watchedStats.episodes} Episodes
              </span>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-black/5 dark:border-white/5">
            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
              <button
                onClick={() => setWatchedFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  watchedFilter === 'all'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                    : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'
                }`}
              >
                All ({watchedStats.total})
              </button>
              <button
                onClick={() => setWatchedFilter('movie')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  watchedFilter === 'movie'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                    : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'
                }`}
              >
                <Film size={13} /> Movies ({watchedStats.movies})
              </button>
              <button
                onClick={() => setWatchedFilter('show')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  watchedFilter === 'show'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                    : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'
                }`}
              >
                <Tv size={13} /> Shows ({watchedStats.shows})
              </button>
              <button
                onClick={() => setWatchedFilter('episode')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  watchedFilter === 'episode'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                    : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'
                }`}
              >
                <Clapperboard size={13} /> Episodes ({watchedStats.episodes})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={watchedSearchQuery}
                onChange={(e) => setWatchedSearchQuery(e.target.value)}
                placeholder="Search watched media..."
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-black dark:text-white focus:outline-none focus:border-purple-500/50 transition"
              />
              {watchedSearchQuery && (
                <button
                  onClick={() => setWatchedSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black dark:hover:text-white p-0.5 rounded-full"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Items List Grid */}
          {filteredWatchedList.length === 0 ? (
            <div className="text-center py-16 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5 space-y-2">
              <CheckCircle2 size={36} className="mx-auto text-gray-400 opacity-50" />
              <h4 className="text-sm font-bold text-black dark:text-white">
                {watchedSearchQuery ? 'No matching watched items found' : 'No watched items in this category'}
              </h4>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                {watchedSearchQuery
                  ? 'Try adjusting your search query or clear filters.'
                  : 'Mark items as watched while browsing movies, TV shows, and episodes.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredWatchedList.map((rawItem, idx) => {
                const item = getWatchedDisplayItem(rawItem);
                return (
                  <div
                    key={idx}
                    className="flex items-start justify-between gap-3 p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:border-purple-500/30 hover:bg-purple-500/5 transition-all group shadow-sm"
                  >
                    <Link to={item.linkUrl} className="flex items-start gap-3 min-w-0 flex-1">
                      {item.stillUrl ? (
                        <div className="relative shrink-0 w-20 h-14 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-black/20">
                          <img src={item.stillUrl} alt={item.displayTitle} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition" />
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5">
                          {item.type === 'movie' ? (
                            <Film size={18} />
                          ) : item.type === 'show' ? (
                            <Tv size={18} />
                          ) : (
                            <Clapperboard size={18} />
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs sm:text-sm font-bold text-black dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition line-clamp-1">
                            {item.displayTitle}
                          </span>
                          {item.year && !item.hasTmdbMeta && (
                            <span className="text-[10px] font-extrabold text-purple-700 dark:text-purple-300 bg-purple-500/15 px-1.5 py-0.2 rounded shrink-0">
                              {`{${item.year}}`}
                            </span>
                          )}
                          {item.hasTmdbMeta && (
                            <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-1.5 py-0.2 rounded shrink-0">
                              TMDB
                            </span>
                          )}
                        </div>
                        {item.displaySubtitle && (
                          <div className="text-[11px] text-gray-500 truncate mt-0.5">
                            {item.displaySubtitle}
                          </div>
                        )}
                        {item.overview && (
                          <p className="text-[11px] text-gray-400 line-clamp-2 mt-1 leading-relaxed">
                            {item.overview}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                            item.type === 'movie'
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                              : item.type === 'show'
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          }`}>
                            {item.type}
                          </span>
                          {item.airDate && (
                            <span className="text-[10px] text-gray-400">
                              Aired {new Date(item.airDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          {item.timestamp && (
                            <span className="text-[10px] text-gray-400 font-mono">
                              Watched {new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>

                    <button
                      onClick={() => handleRemoveWatched(item)}
                      title="Mark as unwatched"
                      className="p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-red-500/10 text-emerald-500 hover:text-red-500 transition shrink-0 cursor-pointer border border-transparent hover:border-red-500/20"
                    >
                      <CheckCircle2 size={18} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB CONTENT: WATCHLIST TAB */}
      {activeTab === 'watchlist' && (
        <section className="bg-white/80 dark:bg-[#12121a]/80 border border-black/5 dark:border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-black dark:text-white flex items-center gap-2">
                <Bookmark className="text-purple-400 shrink-0" size={20} />
                <span>Watchlist ({watchlist.length})</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">All saved titles in your library.</p>
            </div>
            <Link 
              to="/watchlist" 
              className="px-3.5 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-500 transition shadow-lg shadow-purple-600/20 flex items-center gap-1.5 self-start sm:self-auto"
            >
              <span>Manage Watchlist Page</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {watchlist.length === 0 ? (
            <div className="text-center py-14 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5">
              <Bookmark size={36} className="mx-auto text-gray-400 mb-2 opacity-50" />
              <h4 className="text-sm font-bold text-black dark:text-white">Your watchlist is empty</h4>
              <p className="text-xs text-gray-500 mt-1">Click the bookmark icon on any item card to add it to your saved list.</p>
            </div>
          ) : (
            renderTextMediaList(watchlist)
          )}
        </section>
      )}

      {/* TAB CONTENT: VIEWING HISTORY */}
      {activeTab === 'history' && (
        <section className="bg-white/80 dark:bg-[#12121a]/80 border border-black/5 dark:border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-7 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-black dark:text-white flex items-center gap-2">
                <History className="text-blue-400 shrink-0" size={20} />
                <span>Viewing History ({recentlyBrowsed.length})</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">Recently viewed media sessions on this device.</p>
            </div>
            {recentlyBrowsed.length > 0 && (
              <button 
                onClick={clearHistory}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 size={13} /> Clear History
              </button>
            )}
          </div>

          {recentlyBrowsed.length === 0 ? (
            <div className="text-center py-14 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5">
              <History size={36} className="mx-auto text-gray-400 mb-2 opacity-50" />
              <h4 className="text-sm font-bold text-black dark:text-white">No viewing history found</h4>
              <p className="text-xs text-gray-500 mt-1">Start browsing movies or series to see your viewing log here.</p>
            </div>
          ) : (
            renderTextMediaList(recentlyBrowsed)
          )}
        </section>
      )}

      {/* TAB CONTENT: ACCOUNT DETAILS */}
      {activeTab === 'account' && (
        <section className="bg-white/80 dark:bg-[#12121a]/80 border border-black/5 dark:border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-7 space-y-5">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-black dark:text-white flex items-center gap-2">
              <User className="text-purple-400 shrink-0" size={20} />
              <span>Account & Security Details</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Detailed overview of your profile and access settings.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* Username tile */}
            <div className="p-4 rounded-xl sm:rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-1.5">
              <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Username / ID</div>
              <div className="text-base sm:text-lg font-bold text-black dark:text-white font-mono truncate">{user}</div>
            </div>

            {/* Role tile */}
            <div className="p-4 rounded-xl sm:rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-1.5">
              <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Account Access Role</div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span className="text-base sm:text-lg font-bold text-black dark:text-white capitalize">
                  {user === 'admin' ? 'System Administrator' : 'Standard Member'}
                </span>
              </div>
            </div>

            {/* Expiration Date tile */}
            <div className="p-4 rounded-xl sm:rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-1.5">
              <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Account Expiration Date</div>
              {expirationStatus ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className={expirationStatus.isExpired ? 'text-red-400 shrink-0' : 'text-emerald-400 shrink-0'} />
                    <span className="text-base sm:text-lg font-bold text-black dark:text-white">
                      {expirationStatus.formattedDate}
                    </span>
                  </div>
                  <div className={`text-xs font-semibold ${expirationStatus.isExpired ? 'text-red-400' : 'text-emerald-400'}`}>
                    {expirationStatus.text}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-emerald-400 shrink-0" />
                  <span className="text-base sm:text-lg font-bold text-black dark:text-white">
                    Managed by Admin
                  </span>
                </div>
              )}
            </div>

            {/* Auto Logout / Inactivity tile */}
            <div className="p-4 rounded-xl sm:rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-1.5">
              <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Inactivity Timeout</div>
              <div className="text-base sm:text-lg font-bold text-black dark:text-white flex items-center gap-2">
                <Clock3 size={16} className="text-amber-400 shrink-0" />
                <span>{inactivityTimeout > 0 ? `${inactivityTimeout} minutes auto-logout` : 'Disabled'}</span>
              </div>
            </div>
          </div>

          {user === 'admin' && (
            <div className="pt-2 flex justify-start">
              <Link 
                to="/users"
                className="px-4 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-500 transition shadow-lg shadow-purple-600/20 flex items-center gap-2"
              >
                <User size={15} />
                <span>Manage Users & Permissions</span>
              </Link>
            </div>
          )}
        </section>
      )}
    </motion.div>
  );
}
