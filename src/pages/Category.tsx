import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ItemCard from '../components/ItemCard';
import { RefreshCw, LayoutGrid, List, ChevronLeft, ChevronRight } from 'lucide-react';
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
          filterLetter: parsed.filterLetter || null,
          viewMode: parsed.viewMode || 'grid',
          searchType: parsed.searchType || 'ALL'
        };
      } catch(e) { }
    }
    return { page: 1, filterLetter: null, viewMode: 'grid', searchType: 'ALL' };
  };

  const initialState = useMemo(getInitialState, [name, query]);
  const [page, setPage] = useState(initialState.page);
  const [filterLetter, setFilterLetter] = useState<string | null>(initialState.filterLetter);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(initialState.viewMode);
  const [searchType, setSearchType] = useState<'ALL' | 'MOVIES' | 'SHOWS'>(initialState.searchType);
    
  const ITEMS_PER_PAGE = 50;

  useEffect(() => {
    const initialState = getInitialState();
    setPage(initialState.page);
    setFilterLetter(initialState.filterLetter);
    setViewMode(initialState.viewMode);
    setSearchType(initialState.searchType);
  }, [name, query]);

  useEffect(() => {
    const storageKey = `category_state_${name}_${query || ''}`;
    sessionStorage.setItem(storageKey, JSON.stringify({ page, filterLetter, viewMode, searchType }));
  }, [page, filterLetter, viewMode, searchType, name, query]);


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
    if (query && searchType !== 'ALL') {
      result = result.filter((item: any) => {
        const cat = item._cat?.toUpperCase();
        if (searchType === 'MOVIES') return cat === 'MOVIES';
        if (searchType === 'SHOWS') return ['KDRAMA', 'ANIME', 'SERIES'].includes(cat);
        return true;
      });
    }
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
  }, [items, filterLetter, query, searchType]);

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const displayedItems = filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);


  if (isLoading) return <CategorySkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center px-4">
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-6 py-4 rounded-xl mb-4 max-w-lg">
          <p className="font-bold mb-2">Error loading category</p>
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="p-4 sm:p-12 min-h-screen pb-20"
    >
      <div className="flex flex-col mb-6 sm:mb-8 gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-black dark:text-white capitalize tracking-tight">
            {query ? `Search Results: ${query}` : name}
          </h2>
          <div className="flex gap-2">
            <div className="flex bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5 p-1 shrink-0">
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-1.5 sm:p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-black shadow-sm text-black dark:text-white' : 'text-gray-500 hover:text-black dark:hover:text-white'}`}
                title="Grid View"
              >
                <LayoutGrid size={16} />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-1.5 sm:p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-black shadow-sm text-black dark:text-white' : 'text-gray-500 hover:text-black dark:hover:text-white'}`}
                title="List View"
              >
                <List size={16} />
              </button>
            </div>
            
            {!query && (
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

        {query && (
          <div className="flex gap-2 mt-4 overflow-x-auto pb-2 scrollbar-hide w-full max-w-full">
            <button 
              onClick={() => { setSearchType('ALL'); setPage(1); }} 
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition shrink-0 ${searchType === 'ALL' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/50' : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-black/10 dark:hover:bg-white/10 border border-black/5 dark:border-white/5'}`}
            >
              All Results
            </button>
            <button 
              onClick={() => { setSearchType('MOVIES'); setPage(1); }} 
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition shrink-0 ${searchType === 'MOVIES' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/50' : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-black/10 dark:hover:bg-white/10 border border-black/5 dark:border-white/5'}`}
            >
              Movies
            </button>
            <button 
              onClick={() => { setSearchType('SHOWS'); setPage(1); }} 
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition shrink-0 ${searchType === 'SHOWS' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/50' : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-black/10 dark:hover:bg-white/10 border border-black/5 dark:border-white/5'}`}
            >
              Shows
            </button>
          </div>
        )}
      </div>

      {filteredItems.length === 0 ? (
        <div className="text-gray-600 dark:text-gray-400 text-center py-20 text-sm">No items found.</div>
      ) : (
        <>
          <div className={viewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-5" : "flex flex-col gap-3"}>
            {displayedItems.map((item: any, i: number) => (
              <ItemCard key={i} item={item} category={item._cat || name} parentPath={item._parent || `/home/${item._cat || name}`} className={viewMode === 'grid' ? "w-full" : ""} viewMode={viewMode} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8 pb-4">
              <button
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={page === 1}
                className="p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
          
        </>
      )}
    </motion.div>

      </>
  );
}
