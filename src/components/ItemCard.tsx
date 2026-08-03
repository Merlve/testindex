import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import axios from 'axios';
import { Film, Edit3, Bookmark, BookmarkCheck, Eye, EyeOff, CheckCircle, Search, Sparkles, Loader2, Link2, X, Check, Tv } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parseMediaName } from '../utils/nameParser';
import { useAuth } from '../context/AuthContext';

export default function ItemCard({ item, category, parentPath, className, viewMode = 'grid', tmdbData }: { item: any, category: string, parentPath: string, className?: string, viewMode?: 'grid' | 'list', tmdbData?: any }) {
  const [tmdb, setTmdb] = useState<any>(tmdbData || null);
  const { user, token } = useAuth();
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [modalTab, setModalTab] = useState<'tmdb' | 'link'>('tmdb');
  const [overridePath, setOverridePath] = useState(`${parentPath}/${item.name}`);
  const [overrideCat, setOverrideCat] = useState(category);

  // TMDB Metadata Search & Fix state
  const initialSearchQuery = parseMediaName(item._jf_name || item.name).cleanName || item._jf_name || item.name || '';
  const [tmdbSearchQuery, setTmdbSearchQuery] = useState(initialSearchQuery);
  const [searchForceType, setSearchForceType] = useState<'auto' | 'movie' | 'tv'>('auto');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [manualTmdbId, setManualTmdbId] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  const queryClient = useQueryClient();

  useEffect(() => {
    if (showOverrideModal) {
      const q = tmdbSearchQuery || initialSearchQuery;
      if (q && searchResults.length === 0) {
        handleSearchTMDB(q, searchForceType);
      }
    }
  }, [showOverrideModal]);

  const handleSearchTMDB = async (queryToSearch: string, forceTypeToUse = searchForceType) => {
    const q = queryToSearch.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    setSaveSuccessMsg('');
    try {
      let isId = /^\d+$/.test(q);
      let finalQuery = q;
      if (q.toLowerCase().startsWith('id:')) {
        isId = true;
        finalQuery = q.substring(3).trim();
      } else if (q.toLowerCase().startsWith('tmdb:')) {
        isId = true;
        finalQuery = q.substring(5).trim();
      }

      const forceParam = forceTypeToUse === 'auto' ? '' : forceTypeToUse;
      const url = `/api/meta/search_all?query=${encodeURIComponent(finalQuery)}&type=${overrideCat || category}${forceParam ? `&forceType=${forceParam}` : ''}${isId ? `&tmdbId=${finalQuery}` : ''}`;
      const res = await axios.get(url);
      setSearchResults(res.data?.results || []);
    } catch (err) {
      console.error('TMDB search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleApplyTmdbResult = async (result?: any) => {
    try {
      const targetTmdbId = result ? String(result.id) : manualTmdbId.trim();
      if (!targetTmdbId && !customTitle.trim()) {
        alert('Please select a result or enter a valid TMDB ID or Custom Title.');
        return;
      }
      setIsSearching(true);
      const cleanName = parseMediaName(item._jf_name || item.name).cleanName || item.name;
      const releaseYear = result?.release_date?.substring(0, 4) || result?.first_air_date?.substring(0, 4) || item.year || '';

      const res = await axios.post('/api/meta/override', {
        query: cleanName,
        rawName: item.name,
        jfName: item._jf_name,
        type: overrideCat || category,
        year: releaseYear,
        tmdbId: targetTmdbId,
        customTitle: customTitle.trim(),
        parentPath: parentPath
      }, { headers: { Authorization: token } });

      if (res.data?.success) {
        const updatedMetadata = result || res.data.data;
        if (updatedMetadata) {
          setTmdb(updatedMetadata);
          item._tmdbData = updatedMetadata;
          if (!item._jf) item._jf = {};
          if (targetTmdbId) item._jf.tmdbId = targetTmdbId;
        }
        setSaveSuccessMsg('TMDB metadata updated successfully!');
        try {
          await axios.get('/api/jellyfin/recently-added?force=true&refresh=true', { headers: { Authorization: token } });
        } catch (e) {}
        queryClient.invalidateQueries({ queryKey: ['tmdb'] });
        queryClient.invalidateQueries({ queryKey: ['recentlyAdded'] });
        queryClient.resetQueries({ queryKey: ['tmdb'] });
        queryClient.resetQueries({ queryKey: ['recentlyAdded'] });
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      }
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to apply metadata override');
    } finally {
      setIsSearching(false);
    }
  };
  
  const { data: watchlistData = [] } = useQuery({
    queryKey: ['watchlist', user],
    queryFn: async () => {
      if (!user || user === 'guest') return [];
      try {
        const res = await axios.get('/api/watchlist', { headers: { 'x-user': user } });
        if (Array.isArray(res.data)) return res.data;
        if (Array.isArray(res.data?.watchlist)) return res.data.watchlist;
        return [];
      } catch {
        return [];
      }
    },
    enabled: !!user && user !== 'guest',
  });

  const inWatchlist = Array.isArray(watchlistData) && watchlistData.some((i: any) => i?.item?.name === item.name && i?.parentPath === parentPath);

  const handleToggleWatchlist = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (user === 'guest') {
      alert('Sign up for the website plan to use this feature');
      return;
    }
    try {
      await axios.post('/api/watchlist/toggle', {
        item: { name: item.name, is_dir: item.is_dir, parent: parentPath },
        category,
        parentPath,
        tmdbData: tmdb
      }, { headers: { 'x-user': user } });
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    } catch (err) {
      console.error(err);
      alert('Failed to update watchlist');
    }
  };

  const { data: watchedList = [] } = useQuery<any[]>({
    queryKey: ['watched-list', user],
    queryFn: async () => {
      if (!user || user === 'guest') return [];
      try {
        const res = await axios.get('/api/watched', { headers: { Authorization: token, 'x-user': user } });
        return Array.isArray(res.data) ? res.data : (res.data?.watched || []);
      } catch {
        return [];
      }
    },
    enabled: !!user && user !== 'guest',
    staleTime: 1000 * 60 * 5,
  });

  const isWatched = Array.isArray(watchedList) && watchedList.some((w: any) => {
    const wRaw = w.name || w.title || '';
    const itemRaw = item.name || item.title || '';
    if (!wRaw || !itemRaw) return false;
    const wLower = wRaw.toLowerCase().trim();
    const itemLower = itemRaw.toLowerCase().trim();
    if (wLower === itemLower) return true;
    const wClean = parseMediaName(wRaw).cleanName.toLowerCase().trim();
    const itemClean = parseMediaName(itemRaw).cleanName.toLowerCase().trim();
    return wClean && itemClean && wClean === itemClean;
  });

  const handleToggleWatched = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (user === 'guest') {
      alert('Sign up for the website plan to use this feature');
      return;
    }
    try {
      const res = await axios.post('/api/watched/toggle', {
        name: item.name || item.title || '',
        parentPath: parentPath
      }, { headers: { Authorization: token, 'x-user': user } });
      if (res.data?.success) {
        queryClient.setQueryData(['watched-list', user], res.data.watched || []);
        queryClient.invalidateQueries({ queryKey: ['watched-list', user] });
      }
    } catch (err) {
      console.error('Failed to toggle watched status', err);
    }
  };

  let searchName = item._jf_name || item.name;
  if (/^(s\d+|season\s*\d+)$/i.test(searchName)) {
    const parentParts = parentPath.split('/').filter(Boolean);
    if (parentParts.length > 0) {
      searchName = parentParts[parentParts.length - 1];
    }
  }
  let jfYear = '';
  if (item._jf && item._jf.year) jfYear = item._jf.year;
  const { cleanName, year } = parseMediaName(searchName);
  const searchYear = jfYear || year;

  const { data: fetchedTmdb } = useQuery({
    queryKey: ['tmdb', item.name, category, parentPath, item._jf?.tmdbId],
    queryFn: async () => {
      try {
        let url = `/api/meta/search?query=${encodeURIComponent(cleanName)}&type=${category}${searchYear ? `&year=${searchYear}` : ''}&parentPath=${encodeURIComponent(parentPath)}&rawName=${encodeURIComponent(item.name)}`;
        if (item._jf && item._jf.tmdbId) url += `&tmdbId=${item._jf.tmdbId}`;
        
        const res = await axios.get(url);
        if (res.data && (res.data.poster_path || res.data.title || res.data.name || res.data.id || res.data._overridden)) {
          return res.data;
        } else if (item._jf && item._jf.tmdbId) {
          const fallbackRes = await axios.get(`/api/meta/search_all?query=fallback&type=${category}&tmdbId=${item._jf.tmdbId}`);
          if (fallbackRes.data?.results?.[0]) return fallbackRes.data.results[0];
          if (fallbackRes.data && (fallbackRes.data.poster_path || fallbackRes.data.title || fallbackRes.data.id)) return fallbackRes.data;
        }
        return null;
      } catch (e) {
        return null;
      }
    },
    enabled: !tmdbData,
    staleTime: 60 * 1000,
  });

  // Local component override state `tmdb` or attached `_tmdbData` takes priority over stale `fetchedTmdb`
  const displayTmdb = tmdb || item._tmdbData || tmdbData || fetchedTmdb;

  const sanitizedPath = `${parentPath}/${item.name}`.replace(/\/\//g, '/').replace(/^\//, '');
  const fullPath = `/${sanitizedPath}`;

  const innerContent = (
    <>
      <div className={`${viewMode === 'list' ? 'w-16 sm:w-24' : ''} aspect-[2/3] rounded-xl sm:rounded-2xl bg-[#fbf4eb] dark:bg-[#1a1a22] border border-black/5 dark:border-white/5 overflow-hidden relative shadow-xl sm:shadow-2xl transition-all duration-300 ${viewMode === 'grid' ? 'group-hover:-translate-y-2 group-hover:scale-[1.02] group-hover:shadow-[0_0_40px_rgba(168,85,247,0.4)]' : ''} flex-shrink-0`}>
        {displayTmdb?.poster_path ? (
          <img src={`https://image.tmdb.org/t/p/w500${displayTmdb.poster_path}`} alt={item.name} className="absolute inset-0 w-full h-full object-cover z-0" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 bg-[#fbf4eb] dark:bg-[#1a1a22] z-0">
            <Film size={32} className="mb-2 opacity-50 sm:w-12 sm:h-12" />
            <span className="text-[10px] sm:text-xs text-center px-2 line-clamp-2">{item.name}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10"></div>
        {displayTmdb?.vote_average && (
          <div className={`absolute top-1 right-1 ${viewMode === 'grid' ? 'sm:top-2 sm:right-2' : ''} px-1 sm:px-1.5 py-0.5 bg-black/70 backdrop-blur rounded text-[9px] sm:text-[10px] font-bold text-yellow-500 z-20`}>
            {Number(displayTmdb.vote_average).toFixed(1)}
          </div>
        )}
        <button
          onClick={handleToggleWatchlist}
          className={`absolute top-1 left-1 ${viewMode === 'grid' ? 'sm:top-2 sm:left-2' : ''} p-1 sm:p-1.5 rounded-full bg-black/60 backdrop-blur z-30 transition-all hover:scale-110 ${inWatchlist ? 'text-purple-400 hover:bg-black/80' : 'text-white hover:bg-purple-600/80'} opacity-100 focus:opacity-100`}
          title={inWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
        >
          {inWatchlist ? <BookmarkCheck size={12} className="sm:w-3.5 sm:h-3.5" /> : <Bookmark size={12} className="sm:w-3.5 sm:h-3.5" />}
        </button>

        <button
          onClick={handleToggleWatched}
          className={`absolute top-1 left-7 ${viewMode === 'grid' ? 'sm:top-2 sm:left-9' : ''} p-1 sm:p-1.5 rounded-full bg-black/60 backdrop-blur z-30 transition-all hover:scale-110 ${isWatched ? 'text-purple-400 bg-purple-950/80 border border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.4)]' : 'text-white/70 hover:text-white hover:bg-purple-600/80'} opacity-100 focus:opacity-100`}
          title={isWatched ? "Mark as unwatched" : "Mark as watched"}
        >
          {isWatched ? <Eye size={12} className="sm:w-3.5 sm:h-3.5 text-purple-400 fill-purple-400/20" /> : <EyeOff size={12} className="sm:w-3.5 sm:h-3.5" />}
        </button>

        {isWatched && (
          <div className="absolute bottom-1 left-1 right-1 sm:bottom-1.5 sm:left-1.5 sm:right-1.5 px-1 py-0.5 rounded bg-purple-600/95 backdrop-blur text-white font-extrabold text-[8px] sm:text-[9px] uppercase tracking-wider flex items-center justify-center gap-0.5 z-20 shadow-md border border-purple-400/30 truncate">
            <CheckCircle size={9} className="fill-current text-white flex-shrink-0" />
            <span className="truncate">Watched</span>
          </div>
        )}

      </div>
      <div className={viewMode === 'list' ? 'flex flex-col justify-center overflow-hidden pr-2 flex-1' : ''}>
        <h3 className={`font-semibold truncate text-black dark:text-white ${viewMode === 'list' ? 'text-sm sm:text-base mb-1' : 'text-[11px] sm:text-xs'}`}>
            {item._rec && <span className="inline-block bg-purple-500/20 text-purple-400 text-[9px] px-1.5 py-0.5 rounded mr-2 align-middle">REC</span>}
            {displayTmdb?.title || displayTmdb?.name || item.name}
        </h3>
        {item._jf?.addedText && (
            <p className={`font-bold text-yellow-500 truncate ${viewMode === 'list' ? 'text-xs mb-1' : 'text-[10px] sm:text-xs'}`}>
                {item._jf.addedText}
            </p>
        )}
        {viewMode === 'list' ? (
          <>
            <p className="uppercase tracking-wider font-bold mb-0.5 text-[10px] sm:text-xs text-purple-400">{category}</p>
            <p className="truncate text-[10px] sm:text-xs text-gray-500">{item._rec ? 'Not in library' : fullPath}</p>
            {displayTmdb?.overview && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 line-clamp-2 hidden sm:-webkit-box sm:block" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{displayTmdb.overview}</p>
            )}
          </>
        ) : (
          <p className="truncate text-[10px] text-gray-600 dark:text-gray-400">
             {!item._jf?.addedText && (displayTmdb?.release_date ? displayTmdb.release_date.substring(0, 4) : displayTmdb?.first_air_date ? displayTmdb.first_air_date.substring(0, 4) : '')}
          </p>
        )}
      </div>
      {item._jf && user === 'admin' && (
         <button
            onClick={(e) => { e.preventDefault(); setShowOverrideModal(true); }}
            className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 p-1.5 rounded-xl bg-purple-500/15 dark:bg-purple-500/20 hover:bg-purple-600 dark:hover:bg-purple-600 text-purple-700 dark:text-purple-300 hover:text-white dark:hover:text-white border border-purple-500/30 hover:border-purple-600 shadow-sm backdrop-blur-sm z-30 transition-all hover:scale-110 cursor-pointer"
            title="Fix Metadata Override"
         >
            <Edit3 size={14} />
         </button>
      )}
    </>
  );

  const cardClasses = `group relative transition ${viewMode === 'list' ? 'flex flex-row items-center gap-4 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 rounded-2xl p-3 sm:p-4 border border-black/5 dark:border-white/5 w-full' : `flex flex-col gap-1 sm:gap-2 ${className || 'w-32 sm:w-40 md:w-48 flex-shrink-0'}`}`;

  return (
    <>
      {item._rec ? (
          <a href={`https://www.themoviedb.org/${displayTmdb?.media_type || (category === 'SERIES' || category === 'ANIME' ? 'tv' : 'movie')}/${displayTmdb?.id || item._jf?.tmdbId || item.id || ''}`} target="_blank" rel="noopener noreferrer" className={cardClasses}>
              {innerContent}
          </a>
      ) : (
          <Link to={fullPath.split('/').map(p => encodeURIComponent(p)).join('/')} className={cardClasses}>
              {innerContent}
          </Link>
      )}

      {showOverrideModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm overflow-y-auto" onClick={() => setShowOverrideModal(false)}>
          <div className="bg-[#fbf4eb] dark:bg-[#1a1a22] border border-black/10 dark:border-white/10 rounded-2xl p-4 sm:p-6 w-full max-w-[96vw] sm:max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto" onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-black/10 dark:border-white/10 mb-3">
              <div>
                <h3 className="text-base sm:text-xl font-bold text-black dark:text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                  <span>Fix Metadata & Link Override</span>
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 truncate max-w-[200px] sm:max-w-md">
                  Item: <span className="font-semibold text-black dark:text-white">{item._jf_name || item.name}</span>
                </p>
              </div>
              <button 
                onClick={() => setShowOverrideModal(false)}
                className="p-2 rounded-lg text-gray-500 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Success Feedback Banner */}
            {saveSuccessMsg && (
              <div className="mb-3 p-3 rounded-xl bg-green-500/15 border border-green-500/30 text-green-700 dark:text-green-300 text-xs sm:text-sm flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            {/* Navigation Tabs - Mobile Optimized */}
            <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-2 mb-3 bg-black/5 dark:bg-white/5 p-1 rounded-xl">
              <button
                onClick={() => setModalTab('tmdb')}
                className={`w-full sm:flex-1 py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${modalTab === 'tmdb' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'}`}
              >
                <Search size={14} />
                TMDB Metadata Search
              </button>
              <button
                onClick={() => setModalTab('link')}
                className={`w-full sm:flex-1 py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${modalTab === 'link' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'}`}
              >
                <Link2 size={14} />
                Jellyfin Link Path
              </button>
            </div>

            {/* Tab 1: TMDB Metadata Search */}
            {modalTab === 'tmdb' && (
              <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-3 pr-1 overflow-x-hidden">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    Search TMDB (Title or TMDB ID)
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      className="w-full sm:flex-1 bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-black dark:text-white focus:outline-none focus:border-purple-600"
                      placeholder="Enter Movie/Show Name or TMDB ID..."
                      value={tmdbSearchQuery}
                      onChange={e => setTmdbSearchQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSearchTMDB(tmdbSearchQuery); }}
                    />
                    <button
                      onClick={() => handleSearchTMDB(tmdbSearchQuery)}
                      disabled={isSearching}
                      className="w-full sm:w-auto px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                      Search
                    </button>
                  </div>
                </div>

                {/* Force Type Selector - Mobile Wrap */}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium mr-1">Type:</span>
                  {(['auto', 'movie', 'tv'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => {
                        setSearchForceType(t);
                        handleSearchTMDB(tmdbSearchQuery, t);
                      }}
                      className={`px-2.5 py-1 text-xs rounded-lg border transition cursor-pointer ${searchForceType === t ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/40 font-semibold' : 'bg-black/5 dark:bg-white/5 border-transparent text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'}`}
                    >
                      {t === 'auto' ? `Auto (${category})` : t === 'movie' ? 'Movie' : 'TV Show'}
                    </button>
                  ))}
                </div>

                {/* Search Results List - Responsive Mobile Cards */}
                <div className="flex-1 overflow-y-auto max-h-[220px] sm:max-h-[260px] space-y-2.5 pr-1 border-t border-black/5 dark:border-white/5 pt-3 overflow-x-hidden">
                  {isSearching ? (
                    <div className="py-8 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin text-purple-600" />
                      Searching TMDB database...
                    </div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map((res: any) => {
                      const resTitle = res.title || res.name;
                      const resYear = (res.release_date || res.first_air_date || '').substring(0, 4);
                      const isTv = res.first_air_date || res.name;
                      const posterUrl = res.poster_path ? `https://image.tmdb.org/t/p/w185${res.poster_path}` : null;

                      return (
                        <div
                          key={res.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-purple-500/10 border border-black/5 dark:border-white/5 transition gap-2.5"
                        >
                          <div className="flex items-center gap-3 overflow-hidden min-w-0 flex-1">
                            {posterUrl ? (
                              <img src={posterUrl} alt={resTitle} className="w-12 h-16 sm:w-14 sm:h-20 object-cover rounded-md flex-shrink-0 shadow-sm" />
                            ) : (
                              <div className="w-12 h-16 sm:w-14 sm:h-20 bg-black/10 dark:bg-white/10 rounded-md flex items-center justify-center text-gray-400 flex-shrink-0">
                                {isTv ? <Tv size={18} /> : <Film size={18} />}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs sm:text-sm font-bold text-black dark:text-white truncate">
                                {resTitle} {resYear ? `(${resYear})` : ''}
                              </h4>
                              <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                                <span className="uppercase px-1.5 py-0.5 bg-black/10 dark:bg-white/10 rounded font-mono font-semibold">
                                  {isTv ? 'TV' : 'MOVIE'}
                                </span>
                                <span className="font-mono">ID: {res.id}</span>
                              </div>
                              {res.overview && (
                                <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 line-clamp-1 mt-1">
                                  {res.overview}
                                </p>
                              )}
                            </div>
                          </div>

                          <button
                            onClick={() => handleApplyTmdbResult(res)}
                            className="w-full sm:w-auto px-4 py-2 sm:py-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex-shrink-0 transition flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                          >
                            <Check size={14} />
                            Apply
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-6 text-center text-xs text-gray-500">
                      No TMDB results found. Try searching with movie/show name or direct TMDB ID.
                    </div>
                  )}
                </div>

                {/* Direct Manual TMDB ID / Custom Title Fallback */}
                <div className="border-t border-black/10 dark:border-white/10 pt-3">
                  <span className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Direct Manual TMDB ID or Custom Title Override
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                    <input
                      type="text"
                      className="bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-black dark:text-white focus:outline-none focus:border-purple-600"
                      placeholder="TMDB ID (e.g. 1396)"
                      value={manualTmdbId}
                      onChange={e => setManualTmdbId(e.target.value)}
                    />
                    <input
                      type="text"
                      className="bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-black dark:text-white focus:outline-none focus:border-purple-600"
                      placeholder="Custom Display Title (optional)"
                      value={customTitle}
                      onChange={e => setCustomTitle(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={() => handleApplyTmdbResult()}
                    disabled={!manualTmdbId.trim() && !customTitle.trim()}
                    className="w-full py-2.5 bg-purple-600/20 hover:bg-purple-600 text-purple-700 dark:text-purple-300 hover:text-white border border-purple-500/30 rounded-xl text-xs font-semibold transition disabled:opacity-40 cursor-pointer"
                  >
                    Apply Manual TMDB ID / Title Override
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Jellyfin Link Path */}
            {modalTab === 'link' && (
              <div className="space-y-3.5 py-2">
                <div>
                  <label className="block text-gray-600 dark:text-gray-400 text-xs sm:text-sm mb-1.5 font-medium">
                    Openlist Path (e.g. /home/SERIES/My Show)
                  </label>
                  <input 
                    className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-black dark:text-white focus:outline-none focus:border-purple-600" 
                    value={overridePath}
                    onChange={e => setOverridePath(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-gray-600 dark:text-gray-400 text-xs sm:text-sm mb-1.5 font-medium">
                    Category (SERIES, MOVIES, KDRAMA, ANIME)
                  </label>
                  <input 
                    className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-black dark:text-white focus:outline-none focus:border-purple-600" 
                    value={overrideCat}
                    onChange={e => setOverrideCat(e.target.value)}
                  />
                </div>
                <div className="pt-2 flex justify-end gap-3">
                  <button
                    onClick={async () => {
                      try {
                        await axios.post('/api/jellyfin/override', {
                          jfName: item._jf_name || item.name,
                          openlistPath: overridePath,
                          category: overrideCat
                        }, { headers: { Authorization: token } });
                        setSaveSuccessMsg('Jellyfin link override saved successfully!');
                        try {
                          await axios.get('/api/jellyfin/recently-added?force=true&refresh=true', { headers: { Authorization: token } });
                        } catch(e) {}
                        queryClient.invalidateQueries();
                        queryClient.resetQueries();
                        setTimeout(() => setSaveSuccessMsg(''), 4000);
                      } catch(e) {
                        alert('Failed to save override');
                      }
                    }}
                    className="w-full py-2.5 text-white bg-purple-600 hover:bg-purple-700 rounded-xl text-sm font-semibold transition cursor-pointer"
                  >
                    Save Jellyfin Path Override
                  </button>
                </div>
              </div>
            )}

            {/* Footer Close Button */}
            <div className="border-t border-black/10 dark:border-white/10 pt-3 mt-3 flex justify-end">
              <button 
                onClick={() => setShowOverrideModal(false)}
                className="w-full sm:w-auto px-5 py-2 text-xs sm:text-sm font-semibold text-black dark:text-white bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 rounded-xl transition cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
