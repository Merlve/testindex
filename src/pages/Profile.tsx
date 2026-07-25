import { useEffect, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router';
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
  Flame
} from 'lucide-react';
import ItemCard from '../components/ItemCard';
import Loader from '../components/Loader';

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

  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [recentlyBrowsed, setRecentlyBrowsed] = useState<RecentlyBrowsedItem[]>([]);
  const [expirationDate, setExpirationDate] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'top_downloads' | 'watchlist' | 'history' | 'account'>('overview');
  const [inactivityTimeout, setInactivityTimeout] = useState<number>(0);
  const [topDownloads, setTopDownloads] = useState<any[]>([]);
  const [totalTracked, setTotalTracked] = useState<number>(0);

  // Load User Data
  const loadData = async () => {
    setRefreshing(true);
    try {
      // Parallel requests for all user metrics
      const [watchlistRes, recsRes, configRes, expirationsRes, meRes, topDownloadsRes] = await Promise.all([
        axios.get('/api/watchlist', { headers: { 'x-user': user || '', Authorization: token || '' } }).catch(() => ({ data: [] })),
        axios.get('/api/recommendations', { headers: { Authorization: token || '', 'x-user': user || '' } }).catch(() => ({ data: [] })),
        axios.get('/api/config').catch(() => ({ data: {} })),
        axios.get(`/api/users/expirations?t=${Date.now()}`, { headers: { Authorization: token || '' } }).catch(() => ({ data: {} })),
        axios.get('/api/auth/me', { headers: { Authorization: token || '' } }).catch(() => ({ data: null })),
        axios.get('/api/downloads/top').catch(() => ({ data: { topDownloads: [], totalTracked: 0 } }))
      ]);

      setWatchlist(watchlistRes.data || []);
      setRecommendations(recsRes.data?.results || []);
      setTopDownloads(topDownloadsRes.data?.topDownloads || []);
      setTotalTracked(topDownloadsRes.data?.totalTracked || 0);

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

  if (loading) return <Loader />;

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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3.5 pt-1">
                {watchlist.slice(0, 6).map((entry, idx) => (
                  <ItemCard 
                    key={idx}
                    item={entry.item || entry}
                    category={entry.category || entry._cat || ''}
                    parentPath={entry.parentPath || (entry.item && entry.item.parent) || entry.parent || entry._parent || ''}
                    viewMode="grid"
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-10 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5">
                <Bookmark size={32} className="mx-auto text-gray-400 mb-2 opacity-50" />
                <p className="text-sm font-bold text-black dark:text-white">Your watchlist is currently empty</p>
                <p className="text-xs text-gray-500 mt-1">Bookmark movies and shows while browsing to save them here.</p>
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3.5">
                {recentlyBrowsed.slice(0, 6).map((entry, idx) => (
                  <ItemCard 
                    key={idx}
                    item={entry.item}
                    category={entry.category}
                    parentPath={entry.parentPath}
                    viewMode="grid"
                  />
                ))}
              </div>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3.5">
              {watchlist.map((entry, idx) => (
                <ItemCard 
                  key={idx}
                  item={entry.item || entry}
                  category={entry.category || entry._cat || ''}
                  parentPath={entry.parentPath || (entry.item && entry.item.parent) || entry.parent || entry._parent || ''}
                  viewMode="grid"
                />
              ))}
            </div>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3.5">
              {recentlyBrowsed.map((entry, idx) => (
                <ItemCard 
                  key={idx}
                  item={entry.item}
                  category={entry.category}
                  parentPath={entry.parentPath}
                  viewMode="grid"
                />
              ))}
            </div>
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
