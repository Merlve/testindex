import Loader from "../components/Loader";
import { useEffect, useState, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ItemCard from '../components/ItemCard';
import { RefreshCw, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';

const ALPHABET = ['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

export default function RecentlyAddedPage() {
  const { token } = useAuth();
  const ITEMS_PER_PAGE = 50;

  const getInitialState = () => {
    const storageKey = `recently_added_state`;
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          page: parsed.page || 1,
          filterLetter: parsed.filterLetter || null
        };
      } catch(e) { }
    }
    return { page: 1, filterLetter: null };
  };

  const initialState = useMemo(getInitialState, []);
  const [page, setPage] = useState(initialState.page);
  const [filterLetter, setFilterLetter] = useState<string | null>(initialState.filterLetter);
  const [scrollRestored, setScrollRestored] = useState(false);
  
  useEffect(() => {
    const storageKey = `recently_added_state`;
    sessionStorage.setItem(storageKey, JSON.stringify({ page, filterLetter }));
  }, [page, filterLetter]);

  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (!mainEl) return;
    const handleScroll = () => {
      sessionStorage.setItem(`scroll_recently_added`, mainEl.scrollTop.toString());
    };
    let timeoutId: any = null;
    const scrollListener = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(handleScroll, 100);
    };
    mainEl.addEventListener('scroll', scrollListener, { passive: true });
    return () => {
      mainEl.removeEventListener('scroll', scrollListener);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const fetchItems = async () => {
    try {
      const res = await axios.get('/api/jellyfin/recently-added');
      if (res.data?.success) {
        return res.data.data || [];
      }
      return [];
    } catch (err: any) {
      throw err;
    }
  };

  const { data: items = [], isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['recently-added'],
    queryFn: fetchItems,
    enabled: !!token,
    retry: 1,
  });

  const filteredItems = useMemo(() => {
    let result = [...items];
    if (filterLetter) {
      result = result.filter((item: any) => {
        const itemName = item.name.trim();
        const firstChar = itemName.charAt(0).toUpperCase();
        if (filterLetter === '#') {
          return /^[0-9]/.test(firstChar) || /^[^A-Z0-9]/.test(firstChar);
        }
        return firstChar === filterLetter;
      });
    }
    // Dont sort alphabetically by default, preserve recently added order!
    // But if filtered by letter, maybe sort? We'll just preserve order
    return result;
  }, [items, filterLetter]);

  const displayedItems = filteredItems.slice(0, page * ITEMS_PER_PAGE);

  useEffect(() => {
    if (!isLoading && !scrollRestored) {
      const scrollKey = `scroll_recently_added`;
      const savedScroll = sessionStorage.getItem(scrollKey);
      if (savedScroll) {
        requestAnimationFrame(() => {
          const mainEl = document.querySelector('main');
          if (mainEl) mainEl.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'instant' });
          setScrollRestored(true);
        });
      } else {
        setScrollRestored(true);
      }
    }
  }, [isLoading, displayedItems.length, scrollRestored]);

  if (isLoading) return <Loader />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center px-4">
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-6 py-4 rounded-xl mb-4 max-w-lg">
          <p className="font-bold mb-2">Error loading recently added</p>
          <p className="text-sm opacity-80">{error instanceof Error ? error.message : 'Unknown error occurred'}</p>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-5 py-2.5 rounded-xl border border-white/10 transition">
          <RefreshCw size={18} /> Retry
        </button>
      </div>
    );
  }

  return (
    <>
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: scrollRestored ? 1 : 0, y: scrollRestored ? 0 : 10 }}
      transition={{ duration: 0.3 }}
      className="p-4 sm:p-12 min-h-screen pb-20"
    >
      <div className="flex flex-col mb-6 sm:mb-8 gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2 tracking-tight">
            <Clock className="text-blue-500" size={28} />
            Recently Added
          </h2>
          <div className="flex gap-2">
            <button onClick={() => refetch()} disabled={isFetching} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors bg-white/5 px-3 py-2 sm:px-4 sm:py-2 rounded-xl border border-white/5 hover:border-white/10 shrink-0">
              <RefreshCw size={16} className={isFetching ? 'animate-spin text-purple-400' : ''} /> <span className="hidden sm:inline">{isFetching ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>
        {/* Alphabet Filter Bar */}
        <div className="flex overflow-x-auto pb-2 scrollbar-hide gap-1 sm:gap-2 w-full max-w-full">
          <button
            onClick={() => { setFilterLetter(null); setPage(1); }}
            className={`px-3 py-1.5 flex-shrink-0 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
              filterLetter === null
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/50'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/5'
            }`}
          >
            All
          </button>
          {ALPHABET.map(letter => (
            <button
              key={letter}
              onClick={() => {
                setFilterLetter(letter === filterLetter ? null : letter);
                setPage(1);
              }}
              className={`min-w-[36px] sm:min-w-[40px] px-2 py-1.5 flex-shrink-0 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                filterLetter === letter 
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/50' 
                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/5'
              }`}
            >
              {letter}
            </button>
          ))}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="text-gray-400 text-center py-20 text-sm">No items found.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-5">
            {displayedItems.map((item: any, i: number) => (
              <ItemCard key={i} item={item} category={item._cat || 'Unknown'} parentPath={item._parent || `/home/${item._cat || 'Unknown'}`} className="w-full" />
            ))}
          </div>
          {filteredItems.length > displayedItems.length && (
            <div className="flex justify-center mt-8">
              <button onClick={() => setPage(p => p + 1)} className="px-6 py-2 bg-purple-600 rounded-full text-white font-semibold hover:bg-purple-500 transition">View More</button>
            </div>
          )}
        </>
      )}
    </motion.div>
    </>
  );
}
