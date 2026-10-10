import { useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Link } from 'react-router';
import ItemCard from './ItemCard';
import { Clock, Lock, Film } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function RecentlyAddedCarousel() {
  const { user, token } = useAuth();
  const isGuest = user === 'guest';
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchRecentlyAdded = async () => {
    const res = await axios.get('/api/jellyfin/recently-added', { headers: { Authorization: token } });
    if (res.data?.success) {
      const data = res.data.data || [];
      try {
        localStorage.setItem('recently_added_cache', JSON.stringify(data));
      } catch (e) {}
      return data;
    }
    return [];
  };

  const { data: items = [], isLoading: loading, isFetching } = useQuery({
    queryKey: ['recentlyAdded'],
    queryFn: fetchRecentlyAdded,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
    
    retry: 3,
    retryDelay: 2000,
    placeholderData: () => {
      try {
        const cached = localStorage.getItem('recently_added_cache');
        if (cached) return JSON.parse(cached);
      } catch (e) {}
      return undefined;
    }
  });

  // Restore scroll position
  useEffect(() => {
    if (scrollRef.current) {
      const savedScroll = sessionStorage.getItem('recentlyAddedScroll');
      if (savedScroll) {
        const val = parseInt(savedScroll, 10);
        scrollRef.current.scrollLeft = val;
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollLeft = val;
        });
      }
    }
  }, [items]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    sessionStorage.setItem('recentlyAddedScroll', e.currentTarget.scrollLeft.toString());
  };

  const renderedItems = useMemo(() => {
    if (items.length > 0) {
      return items.slice(0, 15).map((item, i) => (
        <ItemCard key={`${item.id || item.name}-${i}`} item={item} category={item._cat} parentPath={item._parent} />
      ));
    }
    if (isGuest) {
      return Array.from({ length: 8 }).map((_, i) => (
        <div 
          key={`placeholder-${i}`} 
          className="w-[125px] sm:w-[155px] md:w-[170px] shrink-0 aspect-[2/3] rounded-xl bg-gradient-to-br from-neutral-200 via-neutral-300 to-purple-200/50 dark:from-neutral-800 dark:via-neutral-900 dark:to-purple-950/40 border border-black/5 dark:border-white/5 shadow-md flex flex-col items-center justify-center"
        >
          <Film className="w-8 h-8 text-black/10 dark:text-white/10 mb-2" />
          <div className="w-16 h-2 bg-black/10 dark:bg-white/10 rounded-full" />
        </div>
      ));
    }
    return [];
  }, [items, isGuest]);

  return (
    <div className="relative">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-bold text-black dark:text-white flex items-center gap-2"> 
           <Clock className="text-blue-500" size={20} /> 
           Recently Added
        </h3>
        <div className="flex items-center gap-4">
          <Link 
            to={isGuest ? "/login" : "/recently-added"} 
            className="text-xs text-purple-400 hover:text-purple-300 font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors"
          >
            {isGuest ? (
              <>
                <Lock size={12} className="text-purple-400" />
                Sign In
              </>
            ) : (
              'View All'
            )}
          </Link>
          {!isGuest && (
            <div className="flex gap-2">
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
                <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {!isGuest && items.length === 0 && !loading && !isFetching && (
        <div className="text-gray-500 text-sm italic">No recently added items found.</div>
      )}
      {!isGuest && (loading || isFetching) && items.length === 0 && (
        <div className="text-gray-500 text-sm italic">Fetching recent items...</div>
      )}

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
                Sign In to View Recently Added
              </h4>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
                Please sign in with your account to see the recently added items and explore the library.
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
