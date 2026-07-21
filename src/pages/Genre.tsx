import { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router';
import { motion } from 'motion/react';
import ItemCard from '../components/ItemCard';
import { ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { parseMediaName } from '../utils/nameParser';
import { useQuery } from '@tanstack/react-query';

const CategorySkeleton = () => (
  <div className="animate-pulse p-4 sm:p-12 min-h-screen pb-20">
    <div className="flex flex-col mb-6 sm:mb-8 gap-4">
      <div className="flex justify-between items-center">
        <div className="w-48 sm:w-64 h-8 sm:h-10 bg-black/10 dark:bg-white/10 rounded-xl"></div>
        <div className="w-24 h-9 sm:h-10 bg-black/10 dark:bg-white/10 rounded-xl"></div>
      </div>
    </div>
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-5">
       {[...Array(18)].map((_, i) => (
          <div key={i} className="w-full aspect-[2/3] bg-black/5 dark:bg-white/5 rounded-2xl"></div>
       ))}
    </div>
  </div>
);

export default function Genre() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const genreName = searchParams.get('name') || 'Genre';
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  
  const getInitialState = () => {
    const storageKey = `genre_state_${id}`;
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          page: parsed.page || 1,
          viewMode: parsed.viewMode || 'grid',
          activeTab: parsed.activeTab || 'Movies'
        };
      } catch(e) { }
    }
    return { page: 1, viewMode: 'grid', activeTab: 'Movies' };
  };

  const initialState = useMemo(getInitialState, [id]);
  
  const [viewMode, setViewMode] = useState<'grid'|'list'>(initialState.viewMode);
  const [activeTab, setActiveTab] = useState<'Movies'|'Shows'>(initialState.activeTab);
  const [page, setPage] = useState(initialState.page);

  useEffect(() => {
    const initialState = getInitialState();
    setPage(initialState.page);
    setViewMode(initialState.viewMode);
    setActiveTab(initialState.activeTab);
  }, [id]);

  useEffect(() => {
    const storageKey = `genre_state_${id}`;
    sessionStorage.setItem(storageKey, JSON.stringify({ page, viewMode, activeTab }));
  }, [page, viewMode, activeTab, id]);

  const fetchGenreItems = async (): Promise<any[]> => {
    // Fetch genre matched items directly from the backend
    const genreRes = await axios.get(`/api/meta/genre/${id}`, { headers: { Authorization: token } });
    const matchedItems = genreRes.data?.items || [];
    
    const uniqueItems = Array.from(new Map(matchedItems.map((item: any) => [item.name, item])).values());
    return uniqueItems;
  };

  const { data: items = [], isLoading: loading } = useQuery({
    queryKey: ['genre', id],
    queryFn: fetchGenreItems,
    enabled: !!token && !!id,
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const filteredItems = useMemo(() => {
    return items.filter(item => {
       if (activeTab === 'Movies') return item.category.toLowerCase().includes('movie');
       if (activeTab === 'Shows') return !item.category.toLowerCase().includes('movie');
       return true;
    });
  }, [items, activeTab]);

  const ITEMS_PER_PAGE = 50;
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE) || 1;
  const displayedItems = filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  if (loading) return <CategorySkeleton />;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-[#fffcf9] dark:bg-[#08080a] p-4 sm:p-12 pb-20 pt-24"
    >
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => location.state?.from ? navigate(location.state.from) : navigate(-1)} className="p-2 sm:p-3 rounded-full bg-white/10 dark:bg-black/10 backdrop-blur-sm border border-white/20 dark:border-white/10 text-black dark:text-white shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] hover:bg-white/20 dark:hover:bg-black/20 transition-all hover:scale-110">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black dark:text-white tracking-tight">{genreName}</h1>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex bg-black/5 dark:bg-white/5 p-1 rounded-xl border border-black/5 dark:border-white/5">
            <button 
              onClick={() => { setActiveTab('Movies'); setPage(1); }}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'Movies' ? 'bg-white dark:bg-[#1a1a22] text-black dark:text-white shadow-sm' : 'text-gray-500 hover:text-black dark:hover:text-white'}`}
            >
              Movies
            </button>
            <button 
              onClick={() => { setActiveTab('Shows'); setPage(1); }}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'Shows' ? 'bg-white dark:bg-[#1a1a22] text-black dark:text-white shadow-sm' : 'text-gray-500 hover:text-black dark:hover:text-white'}`}
            >
              Shows
            </button>
          </div>

          <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 p-1 rounded-xl border border-black/5 dark:border-white/5">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition ${viewMode === 'grid' ? 'bg-white dark:bg-[#1a1a22] text-black dark:text-white shadow-sm' : 'text-gray-500 hover:text-black dark:hover:text-white'}`}
              title="Grid View"
            >
              <LayoutGrid size={18} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition ${viewMode === 'list' ? 'bg-white dark:bg-[#1a1a22] text-black dark:text-white shadow-sm' : 'text-gray-500 hover:text-black dark:hover:text-white'}`}
              title="List View"
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 text-lg">No {activeTab.toLowerCase()} found for this genre.</p>
        </div>
      ) : (
        <>
          <div className={viewMode === 'grid' 
            ? "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-5" 
            : "flex flex-col gap-3"
          }>
            {displayedItems.map((item, i) => (
              <ItemCard 
                key={i} 
                item={item} 
                category={item.category} 
                parentPath={`/home/${item.category}`}
                className={viewMode === 'grid' ? "w-full" : ""}
                viewMode={viewMode}
              />
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
  );
}
