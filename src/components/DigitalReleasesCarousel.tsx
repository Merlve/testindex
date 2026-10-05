import { useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Link } from 'react-router';
import ItemCard from './ItemCard';
import { MonitorPlay, Lock, Film } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function DigitalReleasesCarousel({ categories }: { categories: any[] }) {
  const { user } = useAuth();
  const isGuest = user === 'guest';
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchDigitalReleases = async () => {
    const now = new Date();
    // Get the first and last day of the current month
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const pad = (n: number) => n.toString().padStart(2, '0');
    const firstDayStr = `${firstDay.getFullYear()}-${pad(firstDay.getMonth() + 1)}-${pad(firstDay.getDate())}`;
    const lastDayStr = `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`;

    const params = new URLSearchParams({
      gte: firstDayStr,
      lte: lastDayStr
    });
    
    let results: any[] = [];
    try {
      const res = await axios.get(`/api/meta/digital-releases-strict?${params.toString()}`);
      results = res.data?.results || [];
    } catch (e) {}
    const configRes = await axios.get('/api/config').catch(() => null);
    const digitalReleasePaths = configRes?.data?.digitalReleasePaths || {};
    
    const displayItems = results.map((tmdbItem: any) => {
      const digitalDate = tmdbItem.digital_release_date;
      const releaseDate = digitalDate || tmdbItem.release_date || tmdbItem.first_air_date || '';
      const tmdbYear = releaseDate ? releaseDate.substring(0, 4) : '';

      const cleanTitleForPath = (tmdbItem.title || tmdbItem.name || '').replace(/'/g, '').replace(/[^a-zA-Z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
      const predictedName = `${cleanTitleForPath}.${tmdbYear || now.getFullYear()}`;
      const manualPath = digitalReleasePaths[tmdbItem.id];
      const finalName = manualPath ? manualPath.split('/').pop() : predictedName;
      const finalParent = manualPath ? '/' + manualPath.split('/').slice(0, -1).join('/').replace(/^\//, '') : `/home/MOVIES`;

      return {
        id: tmdbItem.id,
        name: finalName,
        is_dir: true,
        _rec: false,
        _digital_release: true,
        releaseDate: digitalDate || tmdbItem.release_date,
        digitalReleaseDate: digitalDate,
        digital_release_date: digitalDate,
        parentPath: finalParent,
        openlist_path: manualPath ? `/${manualPath.replace(/^\//, '')}` : undefined
      };
    });

    try {
      localStorage.setItem('digital_releases_cache_v3', JSON.stringify({ items: displayItems, tmdbData: results }));
    } catch (e) {}

    return { items: displayItems, tmdbData: results };
  };

  const { data = { items: [], tmdbData: [] }, isLoading: loading } = useQuery({
    queryKey: ['digitalReleasesMonth'],
    queryFn: fetchDigitalReleases,
    enabled: categories.length > 0,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
    
    placeholderData: () => {
      try {
        const cached = localStorage.getItem('digital_releases_cache_v3');
        if (cached) return JSON.parse(cached);
      } catch (e) {}
      return undefined;
    }
  });

  const currentMonthName = new Date().toLocaleString('default', { month: 'long' });

  const renderedItems = useMemo(() => {
    if (data.items && data.items.length > 0) {
      return data.items.map((item: any, i: number) => (
        <ItemCard 
          key={`${item.id || item.name}-${i}`} 
          item={item} 
          category={item.category || "MOVIES"} 
          parentPath={item.parentPath || `/home/MOVIES`} 
          tmdbData={data.tmdbData[i]} 
        />
      ));
    }
    if (isGuest) {
      return Array.from({ length: 8 }).map((_, i) => (
        <div 
          key={`placeholder-dr-${i}`} 
          className="w-[125px] sm:w-[155px] md:w-[170px] shrink-0 aspect-[2/3] rounded-xl bg-gradient-to-br from-neutral-200 via-neutral-300 to-purple-200/50 dark:from-neutral-800 dark:via-neutral-900 dark:to-purple-950/40 border border-black/5 dark:border-white/5 shadow-md flex flex-col items-center justify-center"
        >
          <Film className="w-8 h-8 text-black/10 dark:text-white/10 mb-2" />
          <div className="w-16 h-2 bg-black/10 dark:bg-white/10 rounded-full" />
        </div>
      ));
    }
    return [];
  }, [data.items, data.tmdbData, isGuest]);

  // Restore scroll position
  useEffect(() => {
    if (scrollRef.current) {
      const savedScroll = sessionStorage.getItem('digitalReleasesScroll');
      if (savedScroll) {
        scrollRef.current.scrollLeft = parseInt(savedScroll, 10);
      }
    }
  }, [data.items]); // Run when items load

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    sessionStorage.setItem('digitalReleasesScroll', e.currentTarget.scrollLeft.toString());
  };

  if (!isGuest && (loading || !data.items || data.items.length === 0)) {
    return null;
  }

  return (
    <div className="relative">
      <div className="flex justify-between items-end mb-2">
        <h3 className="text-lg font-bold text-black dark:text-white flex items-center gap-2">
           <MonitorPlay className="text-blue-500" size={20} />
           Digital Releases {currentMonthName}
        </h3>
        {isGuest ? (
          <Link 
            to="/login" 
            className="text-xs text-purple-400 hover:text-purple-300 font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors"
          >
            <Lock size={12} className="text-purple-400" />
            Sign In
          </Link>
        ) : (
          <div className="flex gap-2">
            <div onClick={(e) => (e.currentTarget.parentElement?.parentElement?.nextElementSibling as HTMLElement)?.scrollBy({ left: -400, behavior: 'smooth' })} className="w-8 h-8 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center hover:bg-black/5 dark:bg-white/5 cursor-pointer text-black dark:text-white">
              <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
            </div>
            <div onClick={(e) => (e.currentTarget.parentElement?.parentElement?.nextElementSibling as HTMLElement)?.scrollBy({ left: 400, behavior: 'smooth' })} className="w-8 h-8 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center hover:bg-black/5 dark:bg-white/5 cursor-pointer text-black dark:text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
            </div>
          </div>
        )}
      </div>

      {/* Carousel Track Container */}
      <div className="relative rounded-2xl overflow-hidden">
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className={`flex overflow-x-auto gap-4 snap-x snap-mandatory scroll-p-4 pb-2 scrollbar-hide ${
            isGuest ? 'filter blur-[7px] sm:blur-[9px] pointer-events-none select-none opacity-45 dark:opacity-35' : ''
          }`}
        >
          {renderedItems}
        </div>

        {/* Guest Lock Overlay */}
        {isGuest && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 bg-black/10 dark:bg-black/30 backdrop-blur-[2px] rounded-2xl">
            <div className="flex flex-col items-center text-center max-w-sm sm:max-w-md mx-auto p-5 sm:p-6 rounded-2xl bg-white/50 dark:bg-black/60 backdrop-blur-xl backdrop-saturate-[180%] border border-white/60 dark:border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.18),inset_0_1px_1px_0_rgba(255,255,255,0.7)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.5),inset_0_1px_1px_0_rgba(255,255,255,0.15)]">
              <div className="w-12 h-12 rounded-full bg-purple-600/15 dark:bg-purple-500/20 border border-purple-500/30 flex items-center justify-center mb-3 text-purple-600 dark:text-purple-400 shadow-inner">
                <Lock size={22} className="stroke-[2.5]" />
              </div>
              <h4 className="text-base sm:text-lg font-bold text-black dark:text-white mb-1.5 tracking-tight">
                Sign In to View Digital Releases
              </h4>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
                Please sign in with your account to see the digital release items and explore more.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-xs sm:text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 active:scale-[0.98] shadow-lg shadow-purple-600/30 hover:scale-[1.02] transition-all cursor-pointer"
              >
                Sign In
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
