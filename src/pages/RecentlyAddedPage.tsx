import { useEffect, useState, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ItemCard from '../components/ItemCard';
import { RefreshCw, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';

const ALPHABET = ['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

const CategorySkeleton = () => (
  <div className="animate-pulse p-4 sm:p-12 min-h-screen pb-20">
    <div className="flex flex-col mb-6 sm:mb-8 gap-4">
      <div className="flex justify-between items-center">
        <div className="w-48 sm:w-64 h-8 sm:h-10 bg-black/10 dark:bg-white/10 rounded-xl"></div>
        <div className="w-24 h-9 sm:h-10 bg-black/10 dark:bg-white/10 rounded-xl"></div>
      </div>
      <div className="flex gap-2 overflow-hidden">
        {[1,2,3,4,5,6,7,8,9,10,11,12].map(i => <div key={i} className="min-w-[36px] sm:min-w-[40px] h-8 sm:h-9 bg-black/10 dark:bg-white/10 rounded-lg"></div>)}
      </div>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-5">
       {[...Array(18)].map((_, i) => (
          <div key={i} className="w-full aspect-[2/3] bg-black/5 dark:bg-white/5 rounded-2xl"></div>
       ))}
    </div>
  </div>
);

export default function RecentlyAddedPage() {
  const { token, user } = useAuth();
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
    
  useEffect(() => {
    const storageKey = `recently_added_state`;
    sessionStorage.setItem(storageKey, JSON.stringify({ page, filterLetter }));
  }, [page, filterLetter]);


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


  if (isLoading) return <CategorySkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center px-4">
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-6 py-4 rounded-xl mb-4 max-w-lg">
          <p className="font-bold mb-2">Error loading recently added</p>
          <p className="text-sm opacity-80">{error instanceof Error ? error.message : 'Unknown error occurred'}</p>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-2 bg-white/10 dark:bg-black/10 hover:bg-white/20 dark:hover:bg-black/20 text-black dark:text-white px-5 py-2.5 rounded-full border border-white/20 dark:border-white/10 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] backdrop-blur-sm transition-all hover:scale-105">
          <RefreshCw size={18} /> Retry
        </button>
      </div>
    );
  }

  return (
    <>
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-4 sm:p-12 min-h-screen pb-20"
    >
      <div className="flex flex-col mb-6 sm:mb-8 gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-black dark:text-white flex items-center gap-2 tracking-tight">
            <Clock className="text-blue-500" size={28} />
            Recently Added
          </h2>
          <div className="flex gap-2">
            {user === 'admin' && (
              <button onClick={() => refetch()} disabled={isFetching} className="flex items-center gap-2 text-sm text-black dark:text-white transition-all bg-white/10 dark:bg-black/10 px-3 py-2 sm:px-4 sm:py-2 rounded-full border border-white/20 dark:border-white/10 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] backdrop-blur-sm hover:bg-white/20 dark:hover:bg-black/20 hover:scale-105 shrink-0">
                <RefreshCw size={16} className={isFetching ? 'animate-spin text-purple-400' : ''} /> <span className="hidden sm:inline">{isFetching ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            )}
          </div>
        </div>
        {/* Alphabet Filter Bar */}
        <div className="flex overflow-x-auto pb-2 scrollbar-hide gap-1 sm:gap-2 w-full max-w-full">
          <button
            onClick={() => { setFilterLetter(null); setPage(1); }}
            className={`px-3 py-1.5 flex-shrink-0 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
              filterLetter === null
                ? 'bg-purple-600 text-black dark:text-white shadow-lg shadow-purple-500/50'
                : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/10 dark:bg-white/10 border border-black/5 dark:border-white/5'
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
                  ? 'bg-purple-600 text-black dark:text-white shadow-lg shadow-purple-500/50' 
                  : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/10 dark:bg-white/10 border border-black/5 dark:border-white/5'
              }`}
            >
              {letter}
            </button>
          ))}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="text-gray-600 dark:text-gray-400 text-center py-20 text-sm">No items found.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-5">
            {displayedItems.map((item: any, i: number) => (
              <ItemCard key={i} item={item} category={item._cat || 'Unknown'} parentPath={item._parent || `/home/${item._cat || 'Unknown'}`} className="w-full" />
            ))}
          </div>
          {filteredItems.length > displayedItems.length && (
            <div className="flex justify-center mt-8">
              <button onClick={() => setPage(p => p + 1)} className="px-6 py-2 bg-purple-600 rounded-full text-black dark:text-white font-semibold hover:bg-purple-500 transition">View More</button>
            </div>
          )}
        </>
      )}
    </motion.div>
    </>
  );
}
