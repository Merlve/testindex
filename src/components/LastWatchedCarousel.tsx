import { useState, useRef, useMemo, memo, useEffect } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { parseMediaName } from '../utils/nameParser';
import { isImageLoaded, markImageLoaded } from '../utils/imageCache';

const LastWatchedCard = memo(function LastWatchedCard({ item }: { item: any }) {
  const { user, token } = useAuth();
  const queryClient = useQueryClient();
  const [logoError, setLogoError] = useState(false);

  const handleRemove = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
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

  const { data: tmdb } = useQuery({
    queryKey: ['tmdb', item.name, item.parentPath],
    queryFn: async () => {
      let searchName = item.name;
      const { cleanName, year } = parseMediaName(searchName);
      const itemPath = item._jf_name ? item._jf_name : item.parentPath ? `${item.parentPath}/${item.name}` : item.name;
      
      let type = 'movie'; // fallback
      if (itemPath.toLowerCase().includes('series') || itemPath.toLowerCase().includes('tv') || itemPath.toLowerCase().includes('anime')) {
        type = 'tv';
      }
      
      const res = await axios.get(`/api/meta/search?query=${encodeURIComponent(cleanName)}&type=${type}${year ? `&year=${year}` : ''}&path=${encodeURIComponent(itemPath)}`);
      return res.data;
    },
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
    : null;

  const isAlreadyLoaded = isImageLoaded(backdrop);
  const [imgLoaded, setImgLoaded] = useState<boolean>(isAlreadyLoaded);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (backdrop && isImageLoaded(backdrop)) {
      setImgLoaded(true);
    }
  }, [backdrop]);

  const title = tmdb?.title || tmdb?.name || item.name;
  
  const formatTitleCase = (text: string) => {
    if (!text) return '';
    const isAllUpper = text === text.toUpperCase() && text !== text.toLowerCase();
    const normalized = isAllUpper ? text.toLowerCase() : text;
    return normalized.replace(/(?:^|\s|-|\/)\S/g, (c) => c.toUpperCase());
  };

  const parentClean = (item.parentPath || '').replace(/^\/+/, '');
  const isVideo = /\.(mp4|mkv|avi|mov|webm|flv|wmv|m4v|ts|m2ts)$/i.test(item.name);
  
  let linkPath = parentClean ? `${parentClean}/${item.name}` : item.name;
  let preselectSeason: string | undefined = undefined;
  
  if (isVideo) {
      const seasonMatch = parentClean.match(/(?:\/|^)(season\s*\d+|s\d+|series\s*\d+|specials)\s*\/?$/i);
      if (seasonMatch) {
          // If it's an episode in a Season folder (e.g. Season 1, S01), go to the Show root
          linkPath = parentClean.replace(/(?:\/|^)(season\s*\d+|s\d+|series\s*\d+|specials)\s*\/?$/i, '');
          preselectSeason = seasonMatch[1];
      } else if (parentClean.toLowerCase() === 'home/movies' || parentClean.toLowerCase() === 'home/shows' || parentClean === '') {
          // If parent is just the root category, we must link to the file itself since there's no folder
          linkPath = parentClean ? `${parentClean}/${item.name}` : item.name;
      } else {
          // If it's a movie in its own folder, go to the folder
          linkPath = parentClean;
      }
  }

  const targetUrl = `/${linkPath}`.replace(/\/+/g, '/').split('/').map(p => encodeURIComponent(p)).join('/');
  const currentMetaVer = localStorage.getItem('meta_version') || '1';

  if (!backdrop) return null; // Only show items with backdrops

  return (
    <Link 
      to={targetUrl}
      state={{ item, tmdbData: tmdb, metaVer: currentMetaVer, preselectSeason }}
      className="flex-none w-64 md:w-80 aspect-video bg-black/5 dark:bg-white/5 rounded-2xl overflow-hidden isolate relative group block"
    >
        <div className="absolute inset-0 w-full h-full overflow-hidden">
          {!imgLoaded && (
            <img 
              src={`https://image.tmdb.org/t/p/w300${tmdb.backdrop_path}`} 
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
    // Reverse the list so the most recently watched comes first
    return [...watchedList].reverse().slice(0, 10);
  }, [watchedList]);

  if (!recentWatched || recentWatched.length === 0) return null;

  return (
    <div>
      <div className="flex justify-between items-end mb-2">
        <h3 className="text-lg font-bold text-black dark:text-white">Last Watched</h3>
        <div className="flex gap-2 items-center">
          <div onClick={(e) => (e.currentTarget.parentElement?.parentElement?.nextElementSibling as HTMLElement)?.scrollBy({ left: -400, behavior: 'smooth' })} className="w-8 h-8 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center hover:bg-black/5 dark:bg-white/5 cursor-pointer text-black dark:text-white">
            <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
          </div>
          <div onClick={(e) => (e.currentTarget.parentElement?.parentElement?.nextElementSibling as HTMLElement)?.scrollBy({ left: 400, behavior: 'smooth' })} className="w-8 h-8 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center hover:bg-black/5 dark:bg-white/5 cursor-pointer text-black dark:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
          </div>
        </div>
      </div>
      <div className="flex overflow-x-auto gap-4 snap-x snap-mandatory scroll-p-4 pb-2 scrollbar-hide">
        {recentWatched.map((item, i) => (
          <LastWatchedCard key={item.name || i} item={item} />
        ))}
      </div>
    </div>
  );
}
