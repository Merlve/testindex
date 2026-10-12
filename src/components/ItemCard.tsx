import { softRefreshMediaCaches } from '../utils/cacheManager';
import React, { useState, useEffect, useRef, memo } from 'react';
import { Link } from 'react-router';
import axios from 'axios';
import { Film, Edit3, Bookmark, BookmarkCheck, Eye, EyeOff, CheckCircle, Cloud, Star, Clock, ChevronRight } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parseMediaName } from '../utils/nameParser';
import { useAuth } from '../context/AuthContext';
import { isImageLoaded, markImageLoaded } from '../utils/imageCache';
import { prefetchItemDetails } from '../utils/detailsPrefetch';

function formatAddedDate(timestamp?: number | string): string {
  if (!timestamp) return '';
  const date = new Date(typeof timestamp === 'string' ? timestamp : Number(timestamp));
  if (isNaN(date.getTime())) return '';
  
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const MoviePoster = ({ src, lowResSrc, alt, className, fallbackText }: { src?: string | null, lowResSrc?: string | null, alt: string, className?: string, fallbackText?: string }) => {
  const getCacheBustUrl = (url?: string | null) => {
    if (!url) return null;
    if (url.includes('image.tmdb.org')) return url;
    const ver = localStorage.getItem('meta_version') || '1';
    return url.includes('?') ? `${url}&v=${ver}` : `${url}?v=${ver}`;
  };

  const finalSrc = getCacheBustUrl(src);
  const finalLowRes = getCacheBustUrl(lowResSrc);

  const isAlreadyLoaded = isImageLoaded(finalSrc);
  const [loaded, setLoaded] = useState<boolean>(isAlreadyLoaded);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (finalSrc && isImageLoaded(finalSrc)) {
      setLoaded(true);
    }
  }, [finalSrc]);

  return (
    <div className={`overflow-hidden bg-black/5 dark:bg-white/5 ${className || ''}`}>
      {(!loaded || !finalSrc) && !finalLowRes && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-0 animate-pulse text-gray-500 dark:text-gray-400">
           <Film size={32} className="opacity-20 mb-2" />
           {fallbackText && <span className="text-[10px] sm:text-xs text-center px-2 opacity-40 line-clamp-2">{fallbackText}</span>}
        </div>
      )}
      {finalLowRes && !loaded && (
        <img
          src={finalLowRes}
          alt=""
          className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-100"
          aria-hidden="true"
        />
      )}
      {finalSrc && (
        <img
          ref={(el) => {
            imgRef.current = el;
            if (el && el.complete && el.naturalWidth > 0 && !loaded) {
              markImageLoaded(finalSrc);
              setLoaded(true);
            }
          }}
          src={finalSrc}
          alt={alt}
          loading={isAlreadyLoaded ? 'eager' : 'lazy'}
          onLoad={() => {
            markImageLoaded(finalSrc);
            setLoaded(true);
          }}
          className={`absolute inset-0 w-full h-full object-cover ${
            loaded 
              ? 'opacity-100' 
              : 'opacity-0 transition-opacity duration-300'
          }`}
        />
      )}
    </div>
  );
};

const ItemCard = function ItemCard({ 
  item, 
  category, 
  parentPath, 
  className, 
  viewMode = 'grid', 
  tmdbData,
  addedAt 
}: { 
  item: any, 
  category: string, 
  parentPath: string, 
  className?: string, 
  viewMode?: 'grid' | 'list', 
  tmdbData?: any,
  addedAt?: number | string 
}) {
  const [tmdb, setTmdb] = useState<any>(tmdbData || null);
  const { user, token } = useAuth();
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overridePath, setOverridePath] = useState(`${parentPath}/${item.name}`);
  const [overrideCat, setOverrideCat] = useState(category);

  const queryClient = useQueryClient();
  
  const { data: watchlistData } = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      if (!user || user === 'guest') return [];
      const res = await axios.get('/api/watchlist', { headers: { 'x-user': user } });
      return res.data;
    },
    enabled: !!user && user !== 'guest',
  });


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
        parentPath: parentPath,
        showName: item.name || item.title || '',
        showPath: parentPath ? `${parentPath}/${item.name}` : item.name,
        tmdbData: tmdb,
        tmdbId: tmdb?.id
      }, { headers: { Authorization: token, 'x-user': user } });
      if (res.data?.success) {
        queryClient.setQueryData(['watched-list', user], res.data.watched || []);
        queryClient.invalidateQueries({ queryKey: ['watched-list', user] });
      }
    } catch (err) {
      console.error('Failed to toggle watched status', err);
    }
  };


  
  let searchName = item.name;
  if (/^(s\d+|season\s*\d+)$/i.test(item.name)) {
    const parentParts = parentPath.split('/').filter(Boolean);
    if (parentParts.length > 0) {
      searchName = parentParts[parentParts.length - 1];
    }
  }
  let jfYear = '';
  if (item._jf && item._jf.year) jfYear = item._jf.year;
  const { cleanName, year } = parseMediaName(searchName);
  const searchYear = jfYear || year;

  const existingTmdb = tmdbData || item.tmdbData || item.tmdb || tmdb;
  const hasValidTmdb = Boolean(existingTmdb && (existingTmdb.id || existingTmdb.poster_path || existingTmdb.title || existingTmdb.name));

  const { data: fetchedTmdb } = useQuery({
    queryKey: ['tmdb', item.name, category, parentPath, item._jf?.tmdbId],
    queryFn: async () => {
      try {
        const itemPath = item._jf_name ? item._jf_name : parentPath ? `${parentPath}/${item.name}` : item.name;
        let url = `/api/meta/search?query=${encodeURIComponent(cleanName)}&type=${category}${searchYear ? `&year=${searchYear}` : ''}&path=${encodeURIComponent(itemPath)}`;
        if (item._jf && item._jf.tmdbId) url += `&tmdbId=${item._jf.tmdbId}`;
        
        const res = await axios.get(url);
        if (res.data && (res.data.poster_path || res.data._overridden || res.data.title || res.data.name)) {
          return res.data;
        } else if (item._jf && item._jf.tmdbId) {
          const fallbackRes = await axios.get(`/api/meta/search_all?query=fallback&type=${category}&tmdbId=${item._jf.tmdbId}`);
          if (fallbackRes.data?.results?.[0]) return fallbackRes.data.results[0];
          if (fallbackRes.data && fallbackRes.data.poster_path) return fallbackRes.data;
        }
        return null;
      } catch (e) {
        return null;
      }
    },
    enabled: !hasValidTmdb,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
  });

  const displayTmdb = hasValidTmdb ? existingTmdb : (fetchedTmdb || existingTmdb);

  const inWatchlist = watchlistData?.some((i: any) => {
    // TMDb ID match
    const iTmdbId = i.tmdbData?.id || i.tmdb?.id || i.item?.tmdbData?.id || i.item?.tmdb?.id;
    const curTmdbId = displayTmdb?.id || tmdb?.id || item.tmdbData?.id || item.tmdb?.id;
    if (iTmdbId && curTmdbId && String(iTmdbId) === String(curTmdbId)) return true;

    const listName = i.item?.name || i.name || '';
    const listParent = i.parentPath || i.item?.parent || i.parent || '';
    const listPath = (i.item?.path || i.path || (listParent ? `${listParent}/${listName}` : listName) || '')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '')
      .replace(/^home\//i, '')
      .toLowerCase();
    const currentPath = (item.path || (parentPath ? `${parentPath}/${item.name}` : item.name) || '')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '')
      .replace(/^home\//i, '')
      .toLowerCase();

    if (listPath && currentPath && listPath === currentPath) return true;
    if (listPath && currentPath && (listPath.endsWith('/' + currentPath) || currentPath.endsWith('/' + listPath))) return true;

    if (listName && item.name) {
      const cleanListName = listName.replace(/\.(mp4|mkv|avi|mov|webm|flv|wmv|m4v|ts|m2ts)$/i, '').replace(/[._\-]+/g, ' ').toLowerCase().trim();
      const cleanItemName = item.name.replace(/\.(mp4|mkv|avi|mov|webm|flv|wmv|m4v|ts|m2ts)$/i, '').replace(/[._\-]+/g, ' ').toLowerCase().trim();
      if (cleanListName && cleanItemName && cleanListName === cleanItemName) {
        const normListParent = (listParent || '').replace(/^\/+|\/+$/g, '').replace(/^home\//i, '').toLowerCase();
        const normParent = (parentPath || '').replace(/^\/+|\/+$/g, '').replace(/^home\//i, '').toLowerCase();
        if (!normListParent || !normParent || normListParent === normParent) return true;
      }
    }
    return false;
  }) || false;

  const handleToggleWatchlist = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (user === 'guest') {
      alert('Sign up for the website plan to use this feature');
      return;
    }
    const tmdbToSave = displayTmdb || existingTmdb || tmdb || tmdbData;
    try {
      const res = await axios.post('/api/watchlist/toggle', {
        item: { 
          name: item.name, 
          is_dir: item.is_dir, 
          parent: parentPath, 
          path: item.path || (parentPath ? `${parentPath}/${item.name}` : item.name),
          tmdbData: tmdbToSave
        },
        category,
        parentPath,
        action: inWatchlist ? 'remove' : 'add',
        watchlisted: !inWatchlist,
        tmdbData: tmdbToSave
      }, { headers: { 'x-user': user } });
      if (res.data?.watchlist) {
        queryClient.setQueryData(['watchlist', user], res.data.watchlist);
      }
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    } catch (err) {
      console.error(err);
      alert('Failed to update watchlist');
    }
  };

  const currentMetaVer = localStorage.getItem('meta_version') || '1';


  const sanitizedPath = `${parentPath}/${item.name}`.replace(/\/\//g, '/').replace(/^\//, '');
  const fullPath = `/${sanitizedPath}`;

  const cleanMedia = parseMediaName(item.name);
  const displayTitle = item.customTitle || displayTmdb?.custom_title || displayTmdb?._customTitle || displayTmdb?.title || displayTmdb?.name || cleanMedia.cleanName || item.name;
  
  const releaseYear = displayTmdb?.release_date 
    ? displayTmdb.release_date.substring(0, 4) 
    : displayTmdb?.first_air_date 
    ? displayTmdb.first_air_date.substring(0, 4) 
    : (searchYear || (item.year ? String(item.year) : (cleanMedia.year || '')));

  const renderListContent = (
    <div className="flex items-center gap-3 sm:gap-4 w-full">
      {/* Poster Thumbnail */}
      <div className="w-16 sm:w-20 md:w-24 aspect-[2/3] rounded-xl sm:rounded-2xl bg-[#fbf4eb] dark:bg-[#1a1a22] border border-black/5 dark:border-white/5 overflow-hidden relative isolate shrink-0 shadow-md">
        <MoviePoster 
          src={displayTmdb?.poster_path ? `https://image.tmdb.org/t/p/w342${displayTmdb.poster_path}` : null}
          lowResSrc={displayTmdb?.poster_path ? `https://image.tmdb.org/t/p/w92${displayTmdb.poster_path}` : null}
          alt={item.name} 
          className="absolute inset-0 w-full h-full z-0" 
          fallbackText={item.name}
        />
        {item._digital_release && (item.digitalReleaseDate || displayTmdb?.digital_release_date || item.releaseDate) ? (
          <div className="absolute bottom-1 left-1 right-1 px-1 py-0.5 rounded bg-blue-600/95 text-white font-extrabold text-[8px] uppercase tracking-wider flex items-center justify-center gap-0.5 z-20 shadow-md truncate">
            <span className="truncate">{new Date((item.digitalReleaseDate || displayTmdb?.digital_release_date || item.releaseDate) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
        ) : isWatched ? (
          <div className="absolute bottom-1 left-1 right-1 px-1 py-0.5 rounded bg-purple-600 text-white font-extrabold text-[8px] uppercase tracking-wider flex items-center justify-center gap-0.5 z-20 shadow-md truncate">
            <CheckCircle size={8} className="fill-current text-white flex-shrink-0" />
            <span className="truncate">Watched</span>
          </div>
        ) : null}
      </div>

      {/* Middle Details Block */}
      <div className="flex-1 min-w-0 flex flex-col justify-center py-1">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-sm sm:text-base md:text-lg text-black dark:text-white truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
            {item._rec && <span className="inline-block bg-purple-500/20 text-purple-400 text-[9px] px-1.5 py-0.5 rounded mr-1.5 align-middle font-bold">REC</span>}
            {displayTitle}
          </h3>
        </div>

        {item._jf?.addedText && (
          <p className="font-bold text-yellow-500 truncate text-xs mb-1">
            {item._jf.addedText}
          </p>
        )}

        {/* Badges / metadata */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1">
          {category && (
            <span className="px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0">
              {category}
            </span>
          )}

          {releaseYear && (
            <span className="px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-medium bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300 border border-black/5 dark:border-white/5 shrink-0">
              {releaseYear}
            </span>
          )}

          {displayTmdb?.vote_average && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
              <Star size={11} className="fill-amber-400 text-amber-400" />
              {Number(displayTmdb.vote_average).toFixed(1)}
            </span>
          )}

          {addedAt && (
            <span className="hidden xs:inline-flex items-center gap-1 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium shrink-0">
              <Clock size={11} className="text-gray-400 shrink-0" />
              <span>Added {formatAddedDate(addedAt)}</span>
            </span>
          )}

          {user === 'admin' && displayTmdb?._synced && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-sky-500/15 text-sky-500 border border-sky-500/20" title="Metadata synced in database (Cached)">
              <Cloud size={10} className="fill-sky-400/20 text-sky-400" /> Cached
            </span>
          )}
        </div>

        {/* Synopsis Overview */}
        {displayTmdb?.overview ? (
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5 line-clamp-1 sm:line-clamp-2 leading-relaxed max-w-3xl">
            {displayTmdb.overview}
          </p>
        ) : (
          <p className="text-[11px] sm:text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">
            {item._rec ? 'Not in local library' : parentPath ? `${parentPath}` : ''}
          </p>
        )}
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 ml-1 sm:ml-3">
        {/* Watched Toggle */}
        <button
          type="button"
          onClick={handleToggleWatched}
          className={`p-2 sm:p-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
            isWatched 
              ? 'bg-purple-600/15 text-purple-600 dark:text-purple-400 border-purple-500/40 hover:bg-purple-600 hover:text-white' 
              : 'bg-black/5 dark:bg-white/5 text-gray-500 dark:text-gray-400 border-black/10 dark:border-white/10 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10'
          }`}
          title={isWatched ? "Mark as unwatched" : "Mark as watched"}
        >
          {isWatched ? <Eye size={16} className="text-purple-500 dark:text-purple-400 fill-purple-400/20" /> : <EyeOff size={16} />}
        </button>

        {/* Watchlist Toggle */}
        <button
          type="button"
          onClick={handleToggleWatchlist}
          className={`p-2 sm:p-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
            inWatchlist 
              ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30 hover:bg-purple-700' 
              : 'bg-black/5 dark:bg-white/5 text-gray-500 dark:text-gray-400 border-black/10 dark:border-white/10 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10'
          }`}
          title={inWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
        >
          {inWatchlist ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
        </button>

        {/* Admin Override */}
        {item._jf && user === 'admin' && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowOverrideModal(true); }}
            className="p-2 sm:p-2.5 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 hover:bg-purple-600 hover:text-white transition-all cursor-pointer"
            title="Fix Metadata Override"
          >
            <Edit3 size={15} />
          </button>
        )}

        <ChevronRight size={18} className="text-gray-400 dark:text-gray-500 group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all hidden md:block" />
      </div>
    </div>
  );

  const renderGridContent = (
    <>
      <div className="w-full aspect-[2/3] rounded-xl sm:rounded-2xl bg-[#fbf4eb] dark:bg-[#1a1a22] border border-black/5 dark:border-white/5 overflow-hidden relative isolate transform-gpu backface-hidden shadow-xl sm:shadow-2xl transition-[transform,shadow] duration-300 sm:group-hover:-translate-y-2 sm:group-hover:scale-[1.02] sm:group-hover:shadow-[0_0_40px_rgba(168,85,247,0.4)] active:scale-[0.98] flex-shrink-0">
        <MoviePoster 
          src={displayTmdb?.poster_path ? `https://image.tmdb.org/t/p/w342${displayTmdb.poster_path}` : null}
          lowResSrc={displayTmdb?.poster_path ? `https://image.tmdb.org/t/p/w92${displayTmdb.poster_path}` : null}
          alt={item.name} 
          className="absolute inset-0 w-full h-full z-0" 
          fallbackText={item.name}
        />
        
        {displayTmdb?.vote_average && (
          <div className="absolute top-1 right-1 sm:top-2 sm:right-2 px-1 sm:px-1.5 py-0.5 bg-black/85 rounded text-[9px] sm:text-[10px] font-bold text-yellow-500 z-20">
            {Number(displayTmdb.vote_average).toFixed(1)}
          </div>
        )}
        {user === 'admin' && displayTmdb?._synced && (
          <div 
            className={`absolute top-1 ${displayTmdb?.vote_average ? 'right-7 sm:right-10' : 'right-1 sm:right-2'} sm:top-2 ${displayTmdb?.vote_average ? 'sm:right-11' : 'sm:right-2'} p-1 rounded-md bg-black/85 text-sky-400 z-20 flex items-center justify-center border border-sky-400/30 shadow-md`}
            title="Metadata synced in database (Cached)"
          >
            <Cloud size={11} className="sm:w-3 sm:h-3 fill-sky-400/20 text-sky-400" />
          </div>
        )}
        <button
          onClick={handleToggleWatchlist}
          className={`absolute top-1 left-1 sm:top-2 sm:left-2 p-1 sm:p-1.5 rounded-full bg-black/85 z-30 transition-all hover:scale-110 ${inWatchlist ? 'text-purple-400 hover:bg-black/80' : 'text-white hover:bg-purple-600/80'} opacity-100 focus:opacity-100`}
          title={inWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
        >
          {inWatchlist ? <BookmarkCheck size={12} className="sm:w-3.5 sm:h-3.5" /> : <Bookmark size={12} className="sm:w-3.5 sm:h-3.5" />}
        </button>

        <button
          onClick={handleToggleWatched}
          className={`absolute top-1 left-7 sm:top-2 sm:left-9 p-1 sm:p-1.5 rounded-full bg-black/85 z-30 transition-all hover:scale-110 ${isWatched ? 'text-purple-400 bg-purple-950/80 border border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.4)]' : 'text-white/70 hover:text-white hover:bg-purple-600/80'} opacity-100 focus:opacity-100`}
          title={isWatched ? "Mark as unwatched" : "Mark as watched"}
        >
          {isWatched ? <Eye size={12} className="sm:w-3.5 sm:h-3.5 text-purple-400 fill-purple-400/20" /> : <EyeOff size={12} className="sm:w-3.5 sm:h-3.5" />}
        </button>

        {item._digital_release && (item.digitalReleaseDate || displayTmdb?.digital_release_date || item.releaseDate) ? (
          <div className="absolute bottom-1 left-1 right-1 sm:bottom-1.5 sm:left-1.5 sm:right-1.5 px-1 py-0.5 rounded bg-blue-600/90 text-white font-extrabold text-[8px] sm:text-[9px] uppercase tracking-wider flex items-center justify-center gap-0.5 z-20 shadow-md border border-blue-400/30 truncate">
            <span className="truncate">{new Date((item.digitalReleaseDate || displayTmdb?.digital_release_date || item.releaseDate) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
        ) : isWatched ? (
          <div className="absolute bottom-1 left-1 right-1 sm:bottom-1.5 sm:left-1.5 sm:right-1.5 px-1 py-0.5 rounded bg-purple-600 text-white font-extrabold text-[8px] sm:text-[9px] uppercase tracking-wider flex items-center justify-center gap-0.5 z-20 shadow-md border border-purple-400/30 truncate">
            <CheckCircle size={9} className="fill-current text-white flex-shrink-0" />
            <span className="truncate">Watched</span>
          </div>
        ) : null}
      </div>
      <div>
        <h3 className="font-semibold truncate text-black dark:text-white text-[11px] sm:text-xs">
          {item._rec && <span className="inline-block bg-purple-500/20 text-purple-400 text-[9px] px-1.5 py-0.5 rounded mr-2 align-middle font-bold">REC</span>}
          {displayTitle}
        </h3>
        {item._jf?.addedText && (
          <p className="font-bold text-yellow-500 truncate text-[10px] sm:text-xs">
            {item._jf.addedText}
          </p>
        )}
        <p className="truncate text-[10px] text-gray-600 dark:text-gray-400">
          {!item._jf?.addedText && releaseYear}
        </p>
      </div>
      {item._jf && user === 'admin' && (
        <button
          onClick={(e) => { e.preventDefault(); setShowOverrideModal(true); }}
          className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 p-1.5 rounded-xl bg-purple-500/15 dark:bg-purple-500/20 hover:bg-purple-600 dark:hover:bg-purple-600 text-purple-700 dark:text-purple-300 hover:text-white dark:hover:text-white border border-purple-500/30 hover:border-purple-600 shadow-sm z-30 transition-all hover:scale-110 cursor-pointer"
          title="Fix Metadata Override"
        >
          <Edit3 size={14} />
        </button>
      )}
    </>
  );

  const innerContent = viewMode === 'list' ? renderListContent : renderGridContent;

  const prefetchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handlePrefetch = () => {
    prefetchItemDetails(queryClient, {
      item,
      category,
      parentPath,
      tmdbData: displayTmdb,
      token,
    });
  };

  const handlePointerEnter = () => {
    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    prefetchTimerRef.current = setTimeout(handlePrefetch, 65);
  };

  const handlePointerLeave = () => {
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    };
  }, []);

  const cardClasses = viewMode === 'list' 
    ? 'group relative flex flex-row items-center bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 rounded-2xl p-2.5 sm:p-3.5 border border-black/5 dark:border-white/5 hover:border-purple-500/30 transition-all duration-200 w-full cursor-pointer shadow-sm hover:shadow-md'
    : `group relative transition-transform duration-300 transform-gpu backface-hidden flex flex-col gap-1 sm:gap-2 ${className || 'w-32 sm:w-40 md:w-48 flex-shrink-0'}`;

  return (
    <>
      {item._rec ? (
          <a href={`https://www.themoviedb.org/${displayTmdb?.media_type || (category === 'SERIES' || category === 'ANIME' ? 'tv' : 'movie')}/${displayTmdb?.id || item._jf?.tmdbId || item.id || ''}`} target="_blank" rel="noopener noreferrer" className={cardClasses}>
              {innerContent}
          </a>
      ) : (
          <Link 
            to={fullPath.split('/').map(p => encodeURIComponent(p)).join('/')} 
            className={cardClasses} 
            state={{ 
              item: { 
                ...item, 
                customTitle: item.customTitle || displayTmdb?.custom_title || displayTmdb?._customTitle,
                digitalReleaseDate: item.digitalReleaseDate || displayTmdb?.digital_release_date || (item._digital_release ? item.releaseDate : undefined),
                digital_release_date: item.digital_release_date || displayTmdb?.digital_release_date || (item._digital_release ? item.releaseDate : undefined)
              }, 
              tmdbData: displayTmdb ? {
                ...displayTmdb,
                digital_release_date: displayTmdb.digital_release_date || item.digitalReleaseDate || item.digital_release_date || (item._digital_release ? item.releaseDate : undefined)
              } : displayTmdb, 
              metaVer: currentMetaVer 
            }}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            onPointerDown={handlePrefetch}
            onTouchStart={handlePrefetch}
            onFocus={handlePrefetch}
          >
              {innerContent}
          </Link>
      )}

      {showOverrideModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 " onClick={() => setShowOverrideModal(false)}>
            <div className="bg-[#fbf4eb] dark:bg-[#1a1a22] border border-black/10 dark:border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-black dark:text-white mb-4">Override Jellyfin Link</h3>
                <div className="mb-4 text-xs text-gray-600 dark:text-gray-400">
                   Jellyfin Name: <span className="text-black dark:text-white">{item._jf_name || item.name}</span>
                </div>
                <div className="mb-4">
                    <label className="block text-gray-600 dark:text-gray-400 text-sm mb-2">Openlist Path (e.g. /home/SERIES/My Show)</label>
                    <input 
                        className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:outline-none focus:border-purple-600/50" 
                        value={overridePath}
                        onChange={e => setOverridePath(e.target.value)}
                    />
                </div>
                <div className="mb-6">
                    <label className="block text-gray-600 dark:text-gray-400 text-sm mb-2">Category</label>
                    <input 
                        className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:outline-none focus:border-purple-600/50" 
                        value={overrideCat}
                        onChange={e => setOverrideCat(e.target.value)}
                    />
                </div>
                <div className="flex gap-3 justify-end">
                    <button onClick={() => setShowOverrideModal(false)} className="px-4 py-2 text-black dark:text-white bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:bg-white/20 rounded-lg">Cancel</button>
                    <button
                        onClick={async () => {
                           try {
                               await axios.post('/api/jellyfin/override', {
                                   jfName: item._jf_name || item.name,
                                   openlistPath: overridePath,
                                   category: overrideCat
                               }, { headers: { Authorization: token } });
                               setShowOverrideModal(false);
                               try { await axios.get('/api/jellyfin/recently-added?force=true&refresh=true', { headers: { Authorization: token } }); } catch(e) {} localStorage.setItem('meta_version', String(Date.now())); softRefreshMediaCaches(queryClient);
                           } catch(e) {
                               alert('Failed to save override');
                           }
                       }}
                       className="px-4 py-2 text-black dark:text-white bg-purple-600 hover:bg-purple-700 rounded-lg">Save Override</button>
                </div>
            </div>
        </div>
      )}
    </>
  );
}
export default React.memo(ItemCard);
