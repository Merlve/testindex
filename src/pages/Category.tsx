import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ItemCard from '../components/ItemCard';
import { RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';


const ALPHABET = ['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

const CategorySkeleton = () => (
  <div className="animate-pulse p-4 sm:p-12 min-h-screen pb-20">
    <div className="flex flex-col mb-6 sm:mb-8 gap-4">
      <div className="flex justify-between items-center">
        <div className="w-48 sm:w-64 h-8 sm:h-10 bg-white/10 rounded-xl"></div>
        <div className="w-24 h-9 sm:h-10 bg-white/10 rounded-xl"></div>
      </div>
      <div className="flex gap-2 overflow-hidden">
        {[1,2,3,4,5,6,7,8,9,10,11,12].map(i => <div key={i} className="min-w-[36px] sm:min-w-[40px] h-8 sm:h-9 bg-white/10 rounded-lg"></div>)}
      </div>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-5">
       {[...Array(18)].map((_, i) => (
          <div key={i} className="w-full aspect-[2/3] bg-white/5 rounded-2xl"></div>
       ))}
    </div>
  </div>
);

export default function Category() {
  const { name } = useParams();
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q');
  
  const { token } = useAuth();

  const getInitialState = () => {
    const storageKey = `category_state_${name}_${query || ''}`;
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

  const initialState = useMemo(getInitialState, [name, query]);
  const [page, setPage] = useState(initialState.page);
  const [filterLetter, setFilterLetter] = useState<string | null>(initialState.filterLetter);
  const [scrollRestored, setScrollRestored] = useState(false);
  
  const ITEMS_PER_PAGE = 50;

  useEffect(() => {
    const initialState = getInitialState();
    setPage(initialState.page);
    setFilterLetter(initialState.filterLetter);
    setScrollRestored(false);
  }, [name, query]);

  useEffect(() => {
    const storageKey = `category_state_${name}_${query || ''}`;
    sessionStorage.setItem(storageKey, JSON.stringify({ page, filterLetter }));
  }, [page, filterLetter, name, query]);

  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (!mainEl) return;
    const handleScroll = () => {
      sessionStorage.setItem(`scroll_${name}_${query || ''}`, mainEl.scrollTop.toString());
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
  }, [name, query]);

  const fetchItems = async () => {
    try {
      if (query) {
        const res = await axios.post('/api/fs/search', { keywords: query, parent: '/home' }, { headers: { Authorization: token } });
        
        if (res.data.code !== 200) throw new Error(`Failed to search items: ${res.data.message || 'Unknown error'}`);
        
        return (res.data.data?.content || []).map((i: any) => {
           const parentParts = (i.parent || '').split('/');
           const cat = parentParts[parentParts.length - 1] || 'UNKNOWN';
           return { ...i, _cat: cat, _parent: i.parent };
        });
      } else {
        const res = await axios.post('/api/fs/list', { reqPath: `/home/${name}` }, { headers: { Authorization: token } });
        
        if (res.data.code !== 200) throw new Error(`Failed to load items: ${res.data.message || 'Unknown error'}`);
        
        const content = res.data.data?.content || [];
        const isVideo = (n: string) => /\.(mkv|mp4|avi|mov|wmv|flv|webm|ts|m2ts|iso)$/i.test(n);
        return content.filter((item: any) => item.is_dir || isVideo(item.name));
      }
    } catch (err: any) {
      if (err.response) {
      }
      throw err;
    }
  };

  const { data: items = [], isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['category', name, query],
    queryFn: fetchItems,
    enabled: !!token && (!!name || !!query),
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
    result.sort((a: any, b: any) => {
      return a.name.localeCompare(b.name);
    });
    return result;
  }, [items, filterLetter]);

  const displayedItems = filteredItems.slice(0, page * ITEMS_PER_PAGE);

  useEffect(() => {
    if (!isLoading && !scrollRestored) {
      const scrollKey = `scroll_${name}_${query || ''}`;
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
  }, [isLoading, displayedItems.length, name, query, scrollRestored]);

  if (isLoading) return <CategorySkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center px-4">
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-6 py-4 rounded-xl mb-4 max-w-lg">
          <p className="font-bold mb-2">Error loading category</p>
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
          <h2 className="text-2xl sm:text-3xl font-bold text-white capitalize tracking-tight">
            {query ? `Search Results: ${query}` : name}
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
              <ItemCard key={i} item={item} category={item._cat || name} parentPath={item._parent || `/home/${item._cat || name}`} className="w-full" />
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
