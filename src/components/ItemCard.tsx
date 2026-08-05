import React, { useState, useEffect, memo } from 'react';
import { Link } from 'react-router';
import axios from 'axios';
import { Film, Edit3, Bookmark, BookmarkCheck, Eye, EyeOff, CheckCircle, Cloud } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parseMediaName } from '../utils/nameParser';
import { useAuth } from '../context/AuthContext';

const LazyImage = ({ src, alt, className }: { src: string, alt: string, className?: string }) => {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/10 dark:bg-white/10 z-0 animate-pulse">
           <Film size={32} className="opacity-20" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`${className || ''} transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </>
  );
};

const ItemCard = function ItemCard({ item, category, parentPath, className, viewMode = 'grid', tmdbData }: { item: any, category: string, parentPath: string, className?: string, viewMode?: 'grid' | 'list', tmdbData?: any }) {
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

  const inWatchlist = watchlistData?.some((i: any) => i.item.name === item.name && i.parentPath === parentPath) || false;

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
    enabled: !tmdbData,
    staleTime: 10 * 1000,
  });

  const displayTmdb = tmdbData || fetchedTmdb || tmdb;


  const sanitizedPath = `${parentPath}/${item.name}`.replace(/\/\//g, '/').replace(/^\//, '');
  const fullPath = `/${sanitizedPath}`;

    const innerContent = (
    <>
      <div className={`${viewMode === 'list' ? 'w-16 sm:w-24' : ''} aspect-[2/3] rounded-xl sm:rounded-2xl bg-[#fbf4eb] dark:bg-[#1a1a22] border border-black/5 dark:border-white/5 overflow-hidden relative isolate transform-gpu backface-hidden shadow-xl sm:shadow-2xl transition-[transform,shadow] duration-300 ${viewMode === 'grid' ? 'sm:group-hover:-translate-y-2 sm:group-hover:scale-[1.02] sm:group-hover:shadow-[0_0_40px_rgba(168,85,247,0.4)] active:scale-[0.98]' : ''} flex-shrink-0`}>
        {displayTmdb?.poster_path ? (
          <LazyImage src={`https://image.tmdb.org/t/p/w342${displayTmdb.poster_path}`} alt={item.name} className="absolute inset-0 w-full h-full object-cover z-0" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 bg-[#fbf4eb] dark:bg-[#1a1a22] z-0">
            <Film size={32} className="mb-2 opacity-50 sm:w-12 sm:h-12" />
            <span className="text-[10px] sm:text-xs text-center px-2 line-clamp-2">{item.name}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10"></div>
        {displayTmdb?.vote_average && (
          <div className={`absolute top-1 right-1 ${viewMode === 'grid' ? 'sm:top-2 sm:right-2' : ''} px-1 sm:px-1.5 py-0.5 bg-black/85  rounded text-[9px] sm:text-[10px] font-bold text-yellow-500 z-20`}>
            {Number(displayTmdb.vote_average).toFixed(1)}
          </div>
        )}
        {user === 'admin' && displayTmdb?._synced && (
          <div 
            className={`absolute top-1 ${displayTmdb?.vote_average ? 'right-7 sm:right-10' : 'right-1 sm:right-2'} ${viewMode === 'grid' ? (displayTmdb?.vote_average ? 'sm:top-2 sm:right-11' : 'sm:top-2 sm:right-2') : ''} p-1 rounded-md bg-black/85  text-sky-400 z-20 flex items-center justify-center border border-sky-400/30 shadow-md`}
            title="Metadata synced in database (Cached)"
          >
            <Cloud size={11} className="sm:w-3 sm:h-3 fill-sky-400/20 text-sky-400" />
          </div>
        )}
        <button
          onClick={handleToggleWatchlist}
          className={`absolute top-1 left-1 ${viewMode === 'grid' ? 'sm:top-2 sm:left-2' : ''} p-1 sm:p-1.5 rounded-full bg-black/85  z-30 transition-all hover:scale-110 ${inWatchlist ? 'text-purple-400 hover:bg-black/80' : 'text-white hover:bg-purple-600/80'} opacity-100 focus:opacity-100`}
          title={inWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
        >
          {inWatchlist ? <BookmarkCheck size={12} className="sm:w-3.5 sm:h-3.5" /> : <Bookmark size={12} className="sm:w-3.5 sm:h-3.5" />}
        </button>

        <button
          onClick={handleToggleWatched}
          className={`absolute top-1 left-7 ${viewMode === 'grid' ? 'sm:top-2 sm:left-9' : ''} p-1 sm:p-1.5 rounded-full bg-black/85  z-30 transition-all hover:scale-110 ${isWatched ? 'text-purple-400 bg-purple-950/80 border border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.4)]' : 'text-white/70 hover:text-white hover:bg-purple-600/80'} opacity-100 focus:opacity-100`}
          title={isWatched ? "Mark as unwatched" : "Mark as watched"}
        >
          {isWatched ? <Eye size={12} className="sm:w-3.5 sm:h-3.5 text-purple-400 fill-purple-400/20" /> : <EyeOff size={12} className="sm:w-3.5 sm:h-3.5" />}
        </button>

        {isWatched && (
          <div className="absolute bottom-1 left-1 right-1 sm:bottom-1.5 sm:left-1.5 sm:right-1.5 px-1 py-0.5 rounded bg-purple-600  text-white font-extrabold text-[8px] sm:text-[9px] uppercase tracking-wider flex items-center justify-center gap-0.5 z-20 shadow-md border border-purple-400/30 truncate">
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
            className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 p-1.5 rounded-xl bg-purple-500/15 dark:bg-purple-500/20 hover:bg-purple-600 dark:hover:bg-purple-600 text-purple-700 dark:text-purple-300 hover:text-white dark:hover:text-white border border-purple-500/30 hover:border-purple-600 shadow-sm  z-30 transition-all hover:scale-110 cursor-pointer"
            title="Fix Metadata Override"
         >
            <Edit3 size={14} />
         </button>
      )}
    </>
  );

  const cardClasses = `snap-start group relative transition-transform duration-300 transform-gpu backface-hidden ${viewMode === 'list' ? 'flex flex-row items-center gap-4 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 rounded-2xl p-3 sm:p-4 border border-black/5 dark:border-white/5 w-full' : `flex flex-col gap-1 sm:gap-2 ${className || 'w-32 sm:w-40 md:w-48 flex-shrink-0'}`}`;

  return (
    <>
      {item._rec ? (
          <a href={`https://www.themoviedb.org/${displayTmdb?.media_type || (category === 'SERIES' || category === 'ANIME' ? 'tv' : 'movie')}/${displayTmdb?.id || item._jf?.tmdbId || item.id || ''}`} target="_blank" rel="noopener noreferrer" className={cardClasses}>
              {innerContent}
          </a>
      ) : (
          <Link to={fullPath.split('/').map(p => encodeURIComponent(p)).join('/')} className={cardClasses} state={{ item, tmdbData: displayTmdb }}>
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
                               try { await axios.get('/api/jellyfin/recently-added?force=true&refresh=true', { headers: { Authorization: token } }); } catch(e) {} queryClient.invalidateQueries(); alert('Saved!');
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
