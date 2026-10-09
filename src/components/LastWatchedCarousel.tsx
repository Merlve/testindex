import { useState, useRef, useMemo, memo, useEffect } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { parseMediaName } from '../utils/nameParser';
import { isImageLoaded, markImageLoaded } from '../utils/imageCache';
import { prefetchItemDetails } from '../utils/detailsPrefetch';

const LastWatchedCard = memo(function LastWatchedCard({ item, onDismiss }: { item: any, onDismiss?: (key: string) => void }) {
  const { user, token } = useAuth();
  const queryClient = useQueryClient();
  const [logoError, setLogoError] = useState(false);

  const handleRemove = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    
    // Call onDismiss to immediately hide the entire series locally
    if (onDismiss && item._dedupeKey) {
        onDismiss(item._dedupeKey);
    }

    try {
      const res = await axios.post('/api/watched/toggle', {
        name: item.name,
        parentPath: item.parentPath
      }, {
        headers: { Authorization: token || '', 'x-user': user }
      });
      const updated = Array.isArray(res.data) ? res.data : (res.data?.watched || []);
      queryClient.setQueryData(['watched-list', user], updated);
      queryClient.invalidateQueries({ queryKey: ['watched-list', user] });
    } catch (err) {
      console.error('Failed to remove item:', err);
    }
  };

  const targetShowName = item._targetName || item.showName || item.name;
  const targetShowPath = item._targetPath || item.showPath || (item.parentPath ? `${item.parentPath}/${item.name}` : item.name);
  const preselectSeason = item._preselectSeason;

  const { data: tmdb } = useQuery({
    queryKey: ['tmdb-watched', targetShowName, targetShowPath, item.tmdbId || item.tmdbData?.id],
    queryFn: async () => {
      // If item already contains full tmdbData, use it directly
      if (item.tmdbData && (item.tmdbData.backdrop_path || item.tmdbData.poster_path || item.tmdbData.title || item.tmdbData.name)) {
        return item.tmdbData;
      }

      const { cleanName, year } = parseMediaName(targetShowName);
      const itemPath = targetShowPath;
      
      let type = 'movie'; // fallback
      const lower = (itemPath || '').toLowerCase();
      if (lower.includes('series') || lower.includes('tv') || lower.includes('anime') || lower.includes('kdrama') || lower.includes('show')) {
        type = 'tv';
      }
      
      const tmdbIdParam = (item.tmdbId || item.tmdbData?.id) ? `&tmdbId=${item.tmdbId || item.tmdbData?.id}` : '';
      const res = await axios.get(`/api/meta/search?query=${encodeURIComponent(cleanName)}&type=${type}${year ? `&year=${year}` : ''}&path=${encodeURIComponent(itemPath)}${tmdbIdParam}`);
      return res.data;
    },
    initialData: (item.tmdbData && (item.tmdbData.backdrop_path || item.tmdbData.poster_path || item.tmdbData.title || item.tmdbData.name)) ? item.tmdbData : undefined,
    enabled: !!item,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
  });

  const { data: imagesData } = useQuery({
    queryKey: ['tmdb-images', tmdb?.id],
    queryFn: async () => {
      if (!tmdb?.id) return null;
      const isTv = tmdb?.first_air_date ? true : false;
      const searchType = isTv ? 'tv' : 'movie';
      const res = await axios.get(`/api/meta/images?id=${tmdb.id}&type=${searchType}`);
      return res.data;
    },
    enabled: !!tmdb?.id && (!tmdb?.images?.logos || tmdb.images.logos.length === 0),
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
  });

  const logos = tmdb?.images?.logos || imagesData?.logos;
  const logo = logos && logos.length > 0 
    ? (logos.find((l: any) => l.iso_639_1 === 'en') || logos[0])
    : null;
  const logoUrl = logo?.file_path ? `https://image.tmdb.org/t/p/w300${logo.file_path}` : null;

  useEffect(() => {
    setLogoError(false);
  }, [logoUrl]);

  const backdrop = tmdb?.backdrop_path 
    ? `https://image.tmdb.org/t/p/w780${tmdb.backdrop_path}` 
    : tmdb?.poster_path
      ? `https://image.tmdb.org/t/p/w780${tmdb.poster_path}`
      : null;

  const isAlreadyLoaded = isImageLoaded(backdrop);
  const [imgLoaded, setImgLoaded] = useState<boolean>(isAlreadyLoaded);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (backdrop && isImageLoaded(backdrop)) {
      setImgLoaded(true);
    }
  }, [backdrop]);

  const title = tmdb?.custom_title || tmdb?.title || tmdb?.name || targetShowName || item.name;
  
  const formatTitleCase = (text: string) => {
    if (!text) return '';
    const isAllUpper = text === text.toUpperCase() && text !== text.toLowerCase();
    const normalized = isAllUpper ? text.toLowerCase() : text;
    return normalized.replace(/(?:^|\s|-|\/)\S/g, (c) => c.toUpperCase());
  };

  const parentClean = (targetShowPath || item.parentPath || '').replace(/^\/+/, '');
  const targetUrl = `/${parentClean}`.replace(/\/+/g, '/').split('/').map(p => encodeURIComponent(p)).join('/');
  const currentMetaVer = localStorage.getItem('meta_version') || '1';

  const handlePrefetch = () => {
    let type = 'MOVIES';
    const pLower = (targetShowPath || item.parentPath || '').toLowerCase();
    if (pLower.includes('series') || pLower.includes('tv') || pLower.includes('show')) type = 'SERIES';
    else if (pLower.includes('anime')) type = 'ANIME';
    else if (pLower.includes('kdrama')) type = 'KDRAMA';

    prefetchItemDetails(queryClient, {
      item: { ...item, name: targetShowName, openlist_path: targetShowPath },
      category: type,
      parentPath: targetShowPath,
      tmdbData: tmdb,
      token,
    });
  };

  if (!backdrop) return null; // Only show items with backdrops

  return (
    <Link 
      to={targetUrl}
      state={{ 
        item: { ...item, name: targetShowName, openlist_path: targetShowPath }, 
        tmdbData: tmdb, 
        metaVer: currentMetaVer, 
        preselectSeason 
      }}
      onPointerEnter={handlePrefetch}
      onPointerDown={handlePrefetch}
      onTouchStart={handlePrefetch}
      onFocus={handlePrefetch}
      className="flex-none w-64 md:w-80 aspect-video bg-black/5 dark:bg-white/5 rounded-2xl overflow-hidden isolate relative group block"
    >
        <div className="absolute inset-0 w-full h-full overflow-hidden">
          {!imgLoaded && (
            <img 
              src={tmdb?.backdrop_path ? `https://image.tmdb.org/t/p/w300${tmdb.backdrop_path}` : backdrop || ''} 
              className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-100" 
              alt="" 
              aria-hidden="true" 
            />
          )}
          <img 
            ref={(el) => {
              imgRef.current = el;
              if (el && el.complete && el.naturalWidth > 0 && !imgLoaded) {
                markImageLoaded(backdrop);
                setImgLoaded(true);
              }
            }}
            src={backdrop} 
            onLoad={() => {
              markImageLoaded(backdrop);
              setImgLoaded(true);
            }}
            className={`absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
              imgLoaded 
                ? 'opacity-100' 
                : 'opacity-0'
            }`} 
            alt={title} 
            loading="lazy" 
          />
        </div>

        {/* Gradient Overlay for Logo */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent z-10 transition-opacity duration-300"></div>

        {/* Bottom Content (Logo) */}
        <div className="absolute bottom-0 left-0 right-0 z-20 p-4 flex flex-col justify-end">
          {logoUrl && !logoError ? (
            <img 
              src={logoUrl} 
              alt={title} 
              onError={() => setLogoError(true)}
              className="h-8 md:h-12 max-w-[80%] object-contain object-left drop-shadow-lg filter brightness-105 group-hover:scale-105 transition-transform duration-300 origin-bottom-left"
            />
          ) : (
            <h3 className="text-sm md:text-base font-bold tracking-tight text-white line-clamp-1 shadow-black drop-shadow-md">
              {formatTitleCase(title)}
            </h3>
          )}
        </div>
        
        {/* Dismiss Button */}
        <button
          onClick={handleRemove}
          title="Remove from Last Watched"
          className="absolute top-2 right-2 z-30 p-1.5 rounded-full bg-black/40 text-white hover:text-white hover:bg-black/60 hover:scale-110 transition-all duration-200 shadow-sm"
        >
          <X size={16} strokeWidth={2.5} />
        </button>

    </Link>
  );
});

export default function LastWatchedCarousel() {
  const { user, token } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [dismissedSeries, setDismissedSeries] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('dismissed_series') || '{}');
    } catch {
      return {};
    }
  });

  const handleDismissSeries = (dedupeKey: string) => {
    setDismissedSeries(prev => {
      const next = { ...prev, [dedupeKey]: Date.now() };
      localStorage.setItem('dismissed_series', JSON.stringify(next));
      return next;
    });
  };
  
  const { data: watchedList = [] } = useQuery<any[]>({
    queryKey: ['watched-list', user],
    queryFn: async () => {
      const res = await axios.get('/api/watched', { headers: { Authorization: token || '', 'x-user': user || '' } });
      return Array.isArray(res.data) ? res.data : (res.data?.watched || []);
    },
    enabled: !!user && !!token,
    staleTime: 5 * 60 * 1000,
  });

  const recentWatched = useMemo(() => {
    const reversed = [...watchedList].reverse();
    const seen = new Set<string>();
    const uniqueList = [];

    for (const item of reversed) {
      const parentClean = (item.parentPath || '').replace(/^\/+/, '');
      const isVideo = /\.(mp4|mkv|avi|mov|webm|flv|wmv|m4v|ts|m2ts)$/i.test(item.name || '');
      
      let dedupeKey = parentClean ? `${parentClean}/${item.name}` : item.name;
      let targetName = item.name;
      let targetPath = parentClean ? `${parentClean}/${item.name}` : item.name;
      let preselectSeason: string | undefined = undefined;
      
      if (isVideo) {
          const seasonMatch = parentClean.match(/(?:\/|^)(season\s*\d+|s\d+|series\s*\d+|specials)\s*\/?$/i);
          if (seasonMatch) {
              // If it's an episode in a Season folder (e.g. Season 1, S01), go to the Show root
              targetPath = parentClean.replace(/(?:\/|^)(season\s*\d+|s\d+|series\s*\d+|specials)\s*\/?$/i, '');
              const parts = targetPath.split('/').filter(Boolean);
              targetName = parts.length > 0 ? parts[parts.length - 1] : item.name;
              dedupeKey = targetPath;
              preselectSeason = seasonMatch[1];
          } else if (parentClean.toLowerCase() === 'home/movies' || parentClean.toLowerCase() === 'home/shows' || parentClean === '') {
              // Direct video in category root
              targetPath = parentClean ? `${parentClean}/${item.name}` : item.name;
              targetName = item.name;
              dedupeKey = targetPath;
          } else {
              // Movie or series inside its own named folder
              targetPath = parentClean;
              const parts = targetPath.split('/').filter(Boolean);
              targetName = parts.length > 0 ? parts[parts.length - 1] : item.name;
              dedupeKey = targetPath;
          }
      } else {
          targetName = item.name;
          targetPath = parentClean ? `${parentClean}/${item.name}` : item.name;
          dedupeKey = targetPath;
      }
      
      dedupeKey = dedupeKey.replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase();

      // Skip if this series was dismissed and no newer episodes have been watched since
      if (dismissedSeries[dedupeKey] && (!item.timestamp || item.timestamp <= dismissedSeries[dedupeKey])) {
          continue;
      }

      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        uniqueList.push({ 
          ...item, 
          _dedupeKey: dedupeKey,
          _targetName: item.showName || (item.tmdbData?.title || item.tmdbData?.name) || targetName,
          _targetPath: item.showPath || targetPath,
          _preselectSeason: preselectSeason
        });
      }
    }

    return uniqueList;
  }, [watchedList, dismissedSeries]);

  if (!recentWatched || recentWatched.length === 0) return null;

  return (
    <div>
      <div className="flex justify-between items-end mb-2">
        <h3 className="text-lg font-bold text-black dark:text-white">Last Watched</h3>
        <div className="flex gap-2 items-center">
          <button 
            type="button"
            onClick={() => scrollRef.current?.scrollBy({ left: -400, behavior: 'smooth' })} 
            className="w-8 h-8 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center hover:bg-black/5 dark:bg-white/5 cursor-pointer text-black dark:text-white transition-colors"
            aria-label="Scroll left"
          >
            <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
          </button>
          <button 
            type="button"
            onClick={() => scrollRef.current?.scrollBy({ left: 400, behavior: 'smooth' })} 
            className="w-8 h-8 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center hover:bg-black/5 dark:bg-white/5 cursor-pointer text-black dark:text-white transition-colors"
            aria-label="Scroll right"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="flex overflow-x-auto gap-4 snap-x snap-mandatory scroll-p-4 pb-2 scrollbar-hide">
        {recentWatched.map((item, i) => (
          <LastWatchedCard key={item.name || i} item={item} onDismiss={handleDismissSeries} />
        ))}
      </div>
    </div>
  );
}
