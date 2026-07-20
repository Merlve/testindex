import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ItemCard from '../components/ItemCard';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, LayoutGrid, List, ChevronLeft, ChevronRight, ArrowUp, Film, Tv, RefreshCw } from 'lucide-react';
import Loader from '../components/Loader';

const recommendationsCache: Record<string, { recs: any[], message: string, fetched: boolean }> = {};

export default function RecommendationsPage() {
  const { user } = useAuth();
  const [recommendations, setRecommendations] = useState<any[]>(() => {
    return (user && recommendationsCache[user]?.recs) || [];
  });
  const [loading, setLoading] = useState(() => {
    return !(user && recommendationsCache[user]);
  });
  const [message, setMessage] = useState(() => {
    return (user && recommendationsCache[user]?.message) || '';
  });
  
  const getInitialState = () => {
    const storageKey = 'recs_state';
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          page: parsed.page || 1,
          typeFilter: parsed.typeFilter || 'all',
          viewMode: parsed.viewMode || localStorage.getItem('qs_recs_view') || 'grid'
        };
      } catch (e) {}
    }
    return {
      page: 1,
      typeFilter: 'all',
      viewMode: localStorage.getItem('qs_recs_view') || 'grid'
    };
  };

  const initialState = getInitialState();

  const [page, setPage] = useState(initialState.page);
  const ITEMS_PER_PAGE = 50;
  
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(initialState.viewMode as 'grid' | 'list');
  const [typeFilter, setTypeFilter] = useState<'all' | 'movie' | 'tv'>(initialState.typeFilter as 'all' | 'movie' | 'tv');

  useEffect(() => {
    sessionStorage.setItem('recs_state', JSON.stringify({ page, typeFilter, viewMode }));
  }, [page, typeFilter, viewMode]);
  const [showTopBtn, setShowTopBtn] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 400) {
        setShowTopBtn(true);
      } else {
        setShowTopBtn(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('qs_recs_view', mode);
  };

  const [fetched, setFetched] = useState(() => {
    return (user && recommendationsCache[user]?.fetched) || false;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (user) {
      recommendationsCache[user] = { recs: recommendations, message, fetched };
    }
  }, [recommendations, message, fetched, user]);

  useEffect(() => {
    const fetchInitial = async () => {
      if (user && recommendationsCache[user]) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const res = await axios.get('/api/recommendations', { headers: { 'x-user': user } });
        if (res.data.message === 'ADD_MORE') {
          setMessage(`Add more movies or shows to your watchlist to get better recommendations. You currently have ${res.data.count || 0} items.`);
        } else if (res.data.message === 'NEEDS_FETCH') {
          setFetched(false);
        } else {
          setRecommendations(res.data.results || []);
          setFetched(true);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (user) fetchInitial();
  }, [user]);

  const fetchRecs = async () => {
    if (!user) return;
    setIsRefreshing(true);
    setMessage('');
    try {
      const res = await axios.get('/api/recommendations?refresh=true', { headers: { 'x-user': user } });
      if (res.data.message === 'ADD_MORE') {
        setMessage(`Add more movies or shows to your watchlist to get better recommendations. You currently have ${res.data.count || 0} items.`);
      }
      setRecommendations(res.data.results || []);
    } catch (err) {
      console.error(err);
      setMessage('An error occurred while fetching recommendations. Please try again later.');
    } finally {
      setIsRefreshing(false);
      setFetched(true);
    }
  };

  const filteredRecs = recommendations.filter(r => {
    if (typeFilter === 'all') return true;
    const cat = (r.category || '').toUpperCase();
    const isTv = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(cat);
    if (typeFilter === 'movie') return !isTv;
    if (typeFilter === 'tv') return isTv;
    return true;
  });

  const totalPages = Math.ceil(filteredRecs.length / ITEMS_PER_PAGE);
  const paginatedRecs = filteredRecs.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="pb-20 px-4 sm:px-12 min-h-screen"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between mt-8 mb-8 gap-4">
        <div className="flex-1 w-full flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-bold text-black dark:text-white flex items-center gap-3 tracking-tight mb-2">
              <Sparkles className="text-purple-500" size={32} />
              For You
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Personalized recommendations based on your watchlist.</p>
          </div>
          {fetched && recommendations.length > 0 && (
            <button 
              onClick={fetchRecs}
              disabled={isRefreshing}
              className="p-3 bg-black/5 dark:bg-white/5 hover:bg-purple-600 hover:text-white border border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-400 rounded-full flex items-center justify-center transition disabled:opacity-50"
              title="Refresh Recommendations"
            >
              <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
        
        {fetched && recommendations.length > 0 && (
          <div className="flex flex-row items-center gap-2 sm:gap-4 self-start sm:self-auto shrink-0 flex-wrap w-full mt-4 sm:mt-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <button 
                onClick={() => { setTypeFilter('all'); setPage(1); }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${typeFilter === 'all' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-black/10 dark:border-white/10'}`}
              >
                All
              </button>
              <button 
                onClick={() => { setTypeFilter('movie'); setPage(1); }}
                className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 transition ${typeFilter === 'movie' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-black/10 dark:border-white/10'}`}
              >
                <Film size={16} /> Movies
              </button>
              <button 
                onClick={() => { setTypeFilter('tv'); setPage(1); }}
                className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 transition ${typeFilter === 'tv' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-black/10 dark:border-white/10'}`}
              >
                <Tv size={16} /> Shows
              </button>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3 ml-auto">
              <button 
                onClick={() => handleViewMode('grid')}
                className={`p-2.5 rounded-xl flex items-center justify-center transition ${viewMode === 'grid' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-black/10 dark:border-white/10'}`}
                title="Grid View"
              >
                <LayoutGrid size={18} />
              </button>
              <button 
                onClick={() => handleViewMode('list')}
                className={`p-2.5 rounded-xl flex items-center justify-center transition ${viewMode === 'list' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-black/10 dark:border-white/10'}`}
                title="List View"
              >
                <List size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
      
      {message && (
        <div className="bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-300 px-4 py-3 rounded-xl mb-6 text-sm font-medium">
          {message}
        </div>
      )}

      {loading ? (
        <div className="py-20"><Loader /></div>
      ) : isRefreshing ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-black/5 dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/5">
          <Loader />
          <h3 className="text-xl font-bold text-black dark:text-white mt-6 mb-2">Generating Recommendations...</h3>
          <p className="text-gray-500 max-w-md text-sm">We are fetching recommendations based on your watchlist. This might take a minute.</p>
          <p className="text-purple-500 max-w-md text-sm font-medium mt-2">Feel free to explore other pages and check back later!</p>
        </div>
      ) : !fetched ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-black/5 dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/5">
          <Sparkles size={48} className="text-purple-500 mb-4 opacity-80" />
          <h3 className="text-xl font-bold text-black dark:text-white mb-2">Ready for Recommendations?</h3>
          <p className="text-gray-500 max-w-md text-sm mb-6">Please click the fetch button below to populate this page with personalized movie and show recommendations based on your watchlist.</p>
          <button 
            onClick={fetchRecs}
            disabled={isRefreshing}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition shadow-lg shadow-purple-500/30 disabled:opacity-50"
          >
            Fetch Recommendations
          </button>
        </div>
      ) : filteredRecs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-black/5 dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/5">
          <Sparkles size={48} className="text-gray-400 mb-4 opacity-50" />
          <h3 className="text-xl font-bold text-black dark:text-white mb-2">{recommendations.length === 0 ? 'Not enough data' : 'No items found'}</h3>
          <p className="text-gray-500 max-w-md text-sm">{recommendations.length === 0 ? 'Add more items to your watchlist so we can generate personalized recommendations for you.' : 'Try changing your filter to see more recommendations.'}</p>
        </div>
      ) : (
        <>
          <div className={`${viewMode === 'list' ? 'flex flex-col gap-3' : 'grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-5'}`}>
            {paginatedRecs.map((r, i) => (
              <ItemCard key={`rec-${i}`} item={r.item} category={r.category} parentPath={r.parentPath} tmdbData={r.tmdbData} className={viewMode === 'grid' ? 'w-full' : ''} viewMode={viewMode} />
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
      <AnimatePresence>
        {showTopBtn && (
          <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={scrollToTop}
          className="fixed bottom-24 right-6 sm:bottom-8 sm:right-8 p-3 rounded-full bg-purple-600 text-white shadow-xl shadow-purple-600/30 z-50 flex items-center justify-center"
          title="Scroll to top"
        >
          <ArrowUp size={24} />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
