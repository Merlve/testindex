import { useEffect, useLayoutEffect, useState, useMemo, useRef } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../context/AuthContext';
import ItemCard from '../components/ItemCard';
import { MonitorPlay, Lock, ChevronDown, Calendar, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { fetchDigitalReleases, fetchDigitalReleasesForMonth, DigitalReleasesData } from '../services/digitalReleases';

const DigitalReleasesSkeleton = () => (
  <div className="animate-pulse p-4 sm:p-12 min-h-screen pb-20">
    <div className="flex flex-col mb-6 sm:mb-8 gap-4">
      <div className="flex justify-between items-center">
        <div className="w-48 sm:w-64 h-8 sm:h-10 bg-black/10 dark:bg-white/10 rounded-xl"></div>
      </div>
    </div>
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-5">
      {[...Array(18)].map((_, i) => (
        <div key={i} className="w-full aspect-[2/3] bg-black/5 dark:bg-white/5 rounded-2xl"></div>
      ))}
    </div>
  </div>
);

export default function DigitalReleasesPage() {
  const { user } = useAuth();
  const ITEMS_PER_PAGE = 50;
  const isRestoringRef = useRef(true);

  // Current Month calculations
  const now = useMemo(() => new Date(), []);
  const currentMonthName = now.toLocaleString('default', { month: 'long' });
  const currentYear = now.getFullYear();

  // Previous Month calculations (e.g., September when current is October)
  const prevDate = useMemo(() => {
    return new Date(now.getFullYear(), now.getMonth() - 1, 1);
  }, [now]);
  const prevMonthName = prevDate.toLocaleString('default', { month: 'long' });
  const prevYear = prevDate.getFullYear();
  const prevMonthIndex = prevDate.getMonth();
  const prevCacheKey = `digital_releases_cache_${prevYear}_${(prevMonthIndex + 1).toString().padStart(2, '0')}`;

  // Restore state: remember if previous month was expanded, pages, and scroll position
  const getInitialState = () => {
    const storageKey = 'digital_releases_state';
    const saved = sessionStorage.getItem(storageKey);
    const explicitlyOpen = sessionStorage.getItem('digital_releases_is_prev_open');
    let isPrevOpen = explicitlyOpen !== null ? explicitlyOpen === 'true' : false;
    let page = 1;
    let prevPage = 1;
    let scrollTop = 0;

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.page === 'number' && parsed.page > 0) page = parsed.page;
        if (typeof parsed.prevPage === 'number' && parsed.prevPage > 0) prevPage = parsed.prevPage;
        if (explicitlyOpen === null && typeof parsed.isPrevMonthOpen === 'boolean') {
          isPrevOpen = parsed.isPrevMonthOpen;
        }
        if (typeof parsed.scrollTop === 'number') scrollTop = parsed.scrollTop;
      } catch (e) {}
    }

    const legacyScroll = parseInt(sessionStorage.getItem('digital_releases_scroll_top') || '0', 10);
    if (legacyScroll > 0) scrollTop = legacyScroll;

    return { page, prevPage, isPrevMonthOpen: isPrevOpen, scrollTop };
  };

  const initialState = useMemo(getInitialState, []);
  const [page, setPage] = useState(initialState.page);
  const [prevPage, setPrevPage] = useState(initialState.prevPage);
  const [isPrevMonthOpen, setIsPrevMonthOpen] = useState(initialState.isPrevMonthOpen);

  // Persist state to session storage
  useEffect(() => {
    sessionStorage.setItem('digital_releases_is_prev_open', String(isPrevMonthOpen));
    const currentScroll = parseInt(sessionStorage.getItem('digital_releases_scroll_top') || '0', 10) || initialState.scrollTop;
    sessionStorage.setItem('digital_releases_state', JSON.stringify({
      page,
      prevPage,
      isPrevMonthOpen,
      scrollTop: currentScroll
    }));
    sessionStorage.setItem('digital_releases_page', page.toString());
  }, [page, prevPage, isPrevMonthOpen, initialState.scrollTop]);

  const togglePrevMonth = () => {
    setIsPrevMonthOpen(prev => {
      const next = !prev;
      sessionStorage.setItem('digital_releases_is_prev_open', String(next));
      return next;
    });
  };

  // Track scroll position continuously on container and window (only after initial restore is done)
  useEffect(() => {
    const mainEl = document.querySelector('main');
    const handleScroll = () => {
      if (isRestoringRef.current) return;
      const pos = window.scrollY || document.documentElement.scrollTop || (mainEl ? mainEl.scrollTop : 0);
      if (pos > 0) {
        sessionStorage.setItem('digital_releases_scroll_top', pos.toString());
      }
    };

    if (mainEl) {
      mainEl.addEventListener('scroll', handleScroll, { passive: true });
    }
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      if (mainEl) mainEl.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // When clicking an item, capture exact position and target
  const handleItemClick = (itemKey: string, isPrevious: boolean) => {
    const mainEl = document.querySelector('main');
    const pos = window.scrollY || document.documentElement.scrollTop || (mainEl ? mainEl.scrollTop : 0);
    sessionStorage.setItem('digital_releases_scroll_top', pos.toString());
    sessionStorage.setItem('digital_releases_last_clicked', `${isPrevious ? 'prev' : 'cur'}-${itemKey}`);
    if (isPrevious) {
      sessionStorage.setItem('digital_releases_is_prev_open', 'true');
    }
    sessionStorage.setItem('digital_releases_state', JSON.stringify({
      page,
      prevPage,
      isPrevMonthOpen: isPrevious ? true : isPrevMonthOpen,
      scrollTop: pos,
      lastClicked: `${isPrevious ? 'prev' : 'cur'}-${itemKey}`
    }));
  };

  // Restore exact scroll position / item location on return
  useLayoutEffect(() => {
    const savedPos = parseInt(sessionStorage.getItem('digital_releases_scroll_top') || '0', 10) || initialState.scrollTop;
    const savedLastClicked = sessionStorage.getItem('digital_releases_last_clicked');

    if (!savedPos && !savedLastClicked) {
      isRestoringRef.current = false;
      return;
    }

    let attempts = 0;
    const maxAttempts = 35; // up to ~1.4s

    const restore = () => {
      const mainEl = document.querySelector('main');

      if (savedLastClicked) {
        const el = document.getElementById(savedLastClicked);
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
          return true;
        }
      }

      if (savedPos > 0) {
        const docHeight = document.documentElement.scrollHeight;
        const canScrollFully = docHeight >= savedPos + window.innerHeight - 80 || (mainEl && mainEl.scrollHeight >= savedPos + mainEl.clientHeight - 80);
        if (canScrollFully || attempts >= maxAttempts) {
          window.scrollTo(0, savedPos);
          if (mainEl) mainEl.scrollTop = savedPos;
          return true;
        }
      }

      return false;
    };

    if (restore()) {
      setTimeout(() => {
        isRestoringRef.current = false;
      }, 150);
      return;
    }

    const interval = setInterval(() => {
      attempts++;
      if (restore() || attempts >= maxAttempts) {
        clearInterval(interval);
        setTimeout(() => {
          isRestoringRef.current = false;
        }, 150);
      }
    }, 40);

    return () => {
      clearInterval(interval);
      setTimeout(() => {
        isRestoringRef.current = false;
      }, 150);
    };
  }, [initialState.scrollTop, isPrevMonthOpen]);

  // Current month query
  const { 
    data = { items: [], tmdbData: [] }, 
    isLoading, 
    isError, 
    error, 
    refetch 
  } = useQuery<DigitalReleasesData>({
    queryKey: ['digitalReleasesMonth'],
    queryFn: fetchDigitalReleases,
    staleTime: 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    placeholderData: () => {
      try {
        const cached = localStorage.getItem('digital_releases_cache_v3');
        if (cached) return JSON.parse(cached);
      } catch (e) {}
      return undefined;
    }
  });

  // Previous month query
  const { 
    data: prevData = { items: [], tmdbData: [] }, 
    isLoading: isPrevLoading
  } = useQuery<DigitalReleasesData>({
    queryKey: ['digitalReleasesMonth', prevYear, prevMonthIndex],
    queryFn: () => fetchDigitalReleasesForMonth(prevYear, prevMonthIndex),
    staleTime: 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    placeholderData: () => {
      try {
        const cached = localStorage.getItem(prevCacheKey);
        if (cached) return JSON.parse(cached);
      } catch (e) {}
      return undefined;
    }
  });

  const items = data?.items || [];
  const displayedItems = items.slice(0, page * ITEMS_PER_PAGE);

  const prevItems = prevData?.items || [];
  const displayedPrevItems = prevItems.slice(0, prevPage * ITEMS_PER_PAGE);

  if (isLoading && items.length === 0) {
    return <DigitalReleasesSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center px-4">
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-6 py-4 rounded-xl mb-4 max-w-lg">
          <p className="font-bold mb-2">Error loading releases</p>
          <p className="text-sm opacity-80">{error instanceof Error ? error.message : 'Unknown error occurred'}</p>
        </div>
        <button 
          onClick={() => refetch()} 
          className="flex items-center gap-2 bg-white/10 dark:bg-black/10 hover:bg-white/20 dark:hover:bg-black/20 text-black dark:text-white px-5 py-2.5 rounded-full border border-white/20 dark:border-white/10 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] backdrop-blur-sm transition-all hover:scale-105 cursor-pointer"
        >
          <RefreshCw size={18} /> Retry
        </button>
      </div>
    );
  }

  return (
    <motion.div 
      initial={false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="p-4 sm:p-12 min-h-screen pb-20"
    >
      <div className="flex flex-col mb-6 sm:mb-8 gap-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl sm:text-3xl font-bold text-black dark:text-white flex items-center gap-2 tracking-tight">
              <MonitorPlay className="text-blue-500" size={28} />
              Releases in {currentMonthName}
            </h2>
            <span className="text-xs sm:text-sm font-semibold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-3 py-1 rounded-full">
              {currentYear}
            </span>
            {items.length > 0 && (
              <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                ({items.length} titles)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Section: Current Month Releases (e.g. October) */}
      <div className="relative rounded-2xl overflow-hidden min-h-[300px]">
        {items.length === 0 ? (
          <div className="text-gray-600 dark:text-gray-400 text-center py-20 text-sm">
            No releases found for {currentMonthName}.
          </div>
        ) : (
          <div className={user === 'guest' ? 'filter blur-[7px] sm:blur-[9px] pointer-events-none select-none opacity-45 dark:opacity-35' : ''}>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-5">
              {displayedItems.map((item: any, i: number) => {
                const itemKey = `${item.id || item.name}-${i}`;
                return (
                  <div 
                    key={itemKey}
                    id={`cur-${itemKey}`}
                    onClick={() => handleItemClick(itemKey, false)}
                    className="w-full"
                  >
                    <ItemCard 
                      item={item} 
                      category={item.category || "MOVIES"} 
                      parentPath={item.parentPath || `/home/MOVIES`} 
                      tmdbData={item.tmdbData}
                      className="w-full" 
                    />
                  </div>
                );
              })}
            </div>
            {user !== 'guest' && items.length > displayedItems.length && (
              <div className="flex justify-center mt-8">
                <button 
                  onClick={() => setPage(p => p + 1)} 
                  className="px-6 py-2 bg-purple-600 rounded-full text-black dark:text-white font-semibold hover:bg-purple-500 transition cursor-pointer"
                >
                  View More
                </button>
              </div>
            )}
          </div>
        )}

        {/* Guest Lock Overlay for Current Month */}
        {user === 'guest' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 bg-black/10 dark:bg-black/30 backdrop-blur-[2px] rounded-2xl">
            <div className="flex flex-col items-center text-center max-w-sm sm:max-w-md mx-auto p-6 sm:p-8 rounded-2xl bg-white/50 dark:bg-black/60 backdrop-blur-xl backdrop-saturate-[180%] border border-white/60 dark:border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.18),inset_0_1px_1px_0_rgba(255,255,255,0.7)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.5),inset_0_1px_1px_0_rgba(255,255,255,0.15)]">
              <div className="w-14 h-14 rounded-full bg-purple-600/15 dark:bg-purple-500/20 border border-purple-500/30 flex items-center justify-center mb-4 text-purple-600 dark:text-purple-400 shadow-inner">
                <Lock size={26} className="stroke-[2.5]" />
              </div>
              <h4 className="text-lg sm:text-xl font-bold text-black dark:text-white mb-2 tracking-tight">
                Sign In to View Releases in {currentMonthName}
              </h4>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
                Please sign in with your account to see the full list of release titles and explore more.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 active:scale-[0.98] shadow-lg shadow-purple-600/30 hover:scale-[1.02] transition-all cursor-pointer"
              >
                Sign In
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Previous Month Collapsible Section (e.g. September) */}
      <div className="mt-12 sm:mt-16 pt-8 border-t border-black/10 dark:border-white/10">
        <button
          type="button"
          onClick={togglePrevMonth}
          className="w-full flex items-center justify-between p-4 sm:p-5 rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 transition-all duration-200 cursor-pointer group text-left shadow-sm"
          aria-expanded={isPrevMonthOpen}
        >
          <div className="flex items-center gap-3.5 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-purple-600/15 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-500/30">
              <Calendar size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-bold text-black dark:text-white tracking-tight">
                  Releases in {prevMonthName}
                </h3>
                <span className="text-xs font-semibold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2.5 py-0.5 rounded-full">
                  {prevYear}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {isPrevLoading && prevItems.length === 0
                  ? 'Loading previous month releases...'
                  : `${prevItems.length} titles available`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-purple-600 dark:text-purple-400">
            <span className="hidden sm:inline">
              {isPrevMonthOpen ? 'Collapse' : 'Expand'}
            </span>
            <div className={`p-1.5 rounded-full bg-purple-500/10 group-hover:bg-purple-500/20 transition-transform duration-300 ${isPrevMonthOpen ? 'rotate-180' : ''}`}>
              <ChevronDown size={20} className="text-purple-500" />
            </div>
          </div>
        </button>

        {/* Collapsible Content */}
        <AnimatePresence initial={false}>
          {isPrevMonthOpen && (
            <motion.div
              initial={initialState.isPrevMonthOpen ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="overflow-hidden mt-6"
            >
              <div className="relative rounded-2xl overflow-hidden min-h-[300px]">
                {isPrevLoading && prevItems.length === 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-5 animate-pulse">
                    {[...Array(12)].map((_, i) => (
                      <div key={i} className="w-full aspect-[2/3] bg-black/5 dark:bg-white/5 rounded-2xl" />
                    ))}
                  </div>
                ) : prevItems.length === 0 ? (
                  <div className="text-gray-600 dark:text-gray-400 text-center py-16 text-sm">
                    No releases found for {prevMonthName}.
                  </div>
                ) : (
                  <div className={user === 'guest' ? 'filter blur-[7px] sm:blur-[9px] pointer-events-none select-none opacity-45 dark:opacity-35' : ''}>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-5">
                      {displayedPrevItems.map((item: any, i: number) => {
                        const itemKey = `${item.id || item.name}-${i}`;
                        return (
                          <div 
                            key={`prev-${itemKey}`}
                            id={`prev-${itemKey}`}
                            onClick={() => handleItemClick(itemKey, true)}
                            className="w-full"
                          >
                            <ItemCard 
                              item={item} 
                              category={item.category || "MOVIES"} 
                              parentPath={item.parentPath || `/home/MOVIES`} 
                              tmdbData={item.tmdbData}
                              className="w-full" 
                            />
                          </div>
                        );
                      })}
                    </div>
                    {user !== 'guest' && prevItems.length > displayedPrevItems.length && (
                      <div className="flex justify-center mt-8">
                        <button 
                          onClick={() => setPrevPage(p => p + 1)} 
                          className="px-6 py-2 bg-purple-600 rounded-full text-black dark:text-white font-semibold hover:bg-purple-500 transition cursor-pointer"
                        >
                          View More
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Guest Lock Overlay for Previous Month */}
                {user === 'guest' && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 bg-black/10 dark:bg-black/30 backdrop-blur-[2px] rounded-2xl">
                    <div className="flex flex-col items-center text-center max-w-sm sm:max-w-md mx-auto p-6 sm:p-8 rounded-2xl bg-white/50 dark:bg-black/60 backdrop-blur-xl backdrop-saturate-[180%] border border-white/60 dark:border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.18),inset_0_1px_1px_0_rgba(255,255,255,0.7)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.5),inset_0_1px_1px_0_rgba(255,255,255,0.15)]">
                      <div className="w-14 h-14 rounded-full bg-purple-600/15 dark:bg-purple-500/20 border border-purple-500/30 flex items-center justify-center mb-4 text-purple-600 dark:text-purple-400 shadow-inner">
                        <Lock size={26} className="stroke-[2.5]" />
                      </div>
                      <h4 className="text-lg sm:text-xl font-bold text-black dark:text-white mb-2 tracking-tight">
                        Sign In to View Releases in {prevMonthName}
                      </h4>
                      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
                        Please sign in with your account to explore previous releases.
                      </p>
                      <Link
                        to="/login"
                        className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 active:scale-[0.98] shadow-lg shadow-purple-600/30 hover:scale-[1.02] transition-all cursor-pointer"
                      >
                        Sign In
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
