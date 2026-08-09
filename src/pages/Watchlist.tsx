import Loader from "../components/Loader";
import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ItemCard from '../components/ItemCard';
import { motion } from 'motion/react';
import { Bookmark, LayoutGrid, List, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import { parseMediaName } from '../utils/nameParser';

type SortOption = 'recently_added' | 'oldest_added' | 'title_asc' | 'title_desc' | 'year_desc' | 'year_asc';

export default function Watchlist() {
  const { user } = useAuth();
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 50;
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('qs_watchlist_view') as 'grid' | 'list') || 'grid';
  });
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    return (localStorage.getItem('qs_watchlist_sort') as SortOption) || 'recently_added';
  });

  const handleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('qs_watchlist_view', mode);
  };

  const handleSortChange = (newSort: SortOption) => {
    setSortBy(newSort);
    localStorage.setItem('qs_watchlist_sort', newSort);
    setPage(1);
  };

  useEffect(() => {
    const fetchWatchlist = async () => {
      try {
        const res = await axios.get('/api/watchlist', { headers: { 'x-user': user } });
        setWatchlist(res.data || []);
      } catch (err) {
        console.error('Failed to load watchlist', err);
      } finally {
        setLoading(false);
      }
    };
    if (user) fetchWatchlist();
  }, [user]);

  const sortedWatchlist = useMemo(() => {
    const items = watchlist.map((item, idx) => ({ ...item, _origIndex: idx }));

    return items.sort((a, b) => {
      const itemA = a.item || a;
      const itemB = b.item || b;

      const nameA = itemA.name || a.name || '';
      const nameB = itemB.name || b.name || '';

      const parsedA = parseMediaName(nameA);
      const parsedB = parseMediaName(nameB);

      const titleA = (itemA.title || parsedA.cleanName || '').toLowerCase();
      const titleB = (itemB.title || parsedB.cleanName || '').toLowerCase();

      const yearA = Number(itemA.year || parsedA.year) || 0;
      const yearB = Number(itemB.year || parsedB.year) || 0;

      const timeA = a.addedAt || a.timestamp || 0;
      const timeB = b.addedAt || b.timestamp || 0;

      switch (sortBy) {
        case 'recently_added':
          if (timeA && timeB && timeA !== timeB) return timeB - timeA;
          return a._origIndex - b._origIndex;
        case 'oldest_added':
          if (timeA && timeB && timeA !== timeB) return timeA - timeB;
          return b._origIndex - a._origIndex;
        case 'title_asc':
          return titleA.localeCompare(titleB);
        case 'title_desc':
          return titleB.localeCompare(titleA);
        case 'year_desc':
          if (yearA !== yearB) return yearB - yearA;
          return titleA.localeCompare(titleB);
        case 'year_asc':
          if (yearA === 0) return 1;
          if (yearB === 0) return -1;
          if (yearA !== yearB) return yearA - yearB;
          return titleA.localeCompare(titleB);
        default:
          return 0;
      }
    });
  }, [watchlist, sortBy]);

  if (loading) return <Loader />;
  const totalPages = Math.ceil(sortedWatchlist.length / ITEMS_PER_PAGE);
  const paginatedWatchlist = sortedWatchlist.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="p-4 sm:p-12 min-h-screen pb-20"
    >
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-8 gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-black dark:text-white capitalize tracking-tight flex items-center gap-3 mb-2">
            <Bookmark className="text-purple-400" /> My Watchlist
            {watchlist.length > 0 && (
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                ({watchlist.length})
              </span>
            )}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">Movies and shows you have saved for later.</p>
        </div>
        
        {watchlist.length > 0 && (
          <div className="flex items-center gap-3 self-start sm:self-auto shrink-0 flex-wrap">
            <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-medium text-black dark:text-white">
              <ArrowUpDown size={15} className="text-purple-500 dark:text-purple-400 shrink-0" />
              <span className="text-gray-500 dark:text-gray-400 hidden xs:inline">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value as SortOption)}
                className="bg-transparent text-black dark:text-white font-medium focus:outline-none cursor-pointer py-0.5 pr-1"
              >
                <option value="recently_added" className="bg-[#fffcf9] dark:bg-[#1a1a22] text-black dark:text-white">Recently Added</option>
                <option value="oldest_added" className="bg-[#fffcf9] dark:bg-[#1a1a22] text-black dark:text-white">Oldest Added</option>
                <option value="title_asc" className="bg-[#fffcf9] dark:bg-[#1a1a22] text-black dark:text-white">Title (A - Z)</option>
                <option value="title_desc" className="bg-[#fffcf9] dark:bg-[#1a1a22] text-black dark:text-white">Title (Z - A)</option>
                <option value="year_desc" className="bg-[#fffcf9] dark:bg-[#1a1a22] text-black dark:text-white">Release Year (Newest)</option>
                <option value="year_asc" className="bg-[#fffcf9] dark:bg-[#1a1a22] text-black dark:text-white">Release Year (Oldest)</option>
              </select>
            </div>

            <div className="flex bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl overflow-hidden">
              <button 
                onClick={() => handleViewMode('grid')}
                className={`px-3 py-2 flex items-center justify-center transition-colors ${viewMode === 'grid' ? 'bg-purple-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'}`}
                title="Grid View"
              >
                <LayoutGrid size={18} />
              </button>
              <button 
                onClick={() => handleViewMode('list')}
                className={`px-3 py-2 flex items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-purple-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'}`}
                title="List View"
              >
                <List size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {watchlist.length === 0 ? (
        <div className="text-center py-20 bg-black/5 dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/5">
          <Bookmark className="w-16 h-16 mx-auto text-gray-600 dark:text-gray-400 mb-4 opacity-50" />
          <h3 className="text-xl font-bold text-black dark:text-white mb-2">Your watchlist is empty</h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm">Save items to your watchlist by clicking the bookmark button on any movie or show.</p>
        </div>
      ) : (
        <>
          <div className={`${viewMode === 'list' ? 'flex flex-col gap-3' : 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-5'}`}>
            {paginatedWatchlist.map((entry, index) => (
              <ItemCard 
                key={entry.item?.name || entry.name || index}
                item={entry.item || entry}
                category={entry.category || entry._cat || ''}
                parentPath={entry.parentPath || (entry.item && entry.item.parent) || entry.parent || entry._parent || ''}
                viewMode={viewMode}
                className={viewMode === 'grid' ? 'w-full' : ''}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8 pb-4">
              <button
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={page === 1}
                className="p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
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

