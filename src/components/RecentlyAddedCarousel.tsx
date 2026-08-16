import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Link } from 'react-router';
import ItemCard from './ItemCard';
import { Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function RecentlyAddedCarousel() {
  const { token } = useAuth();
  
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
    refetchOnMount: false,
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

  const renderedItems = useMemo(() => {
    return items.slice(0, 15).map((item, i) => (
      <ItemCard key={`${item.id || item.name}-${i}`} item={item} category={item._cat} parentPath={item._parent} />
    ));
  }, [items]);

  return (
    <div className="relative">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-bold text-black dark:text-white flex items-center gap-2"> 
           <Clock className="text-blue-500" size={20} /> 
           Recently Added
        </h3>
        <div className="flex items-center gap-4">
          <Link to="/recently-added" className="text-xs text-purple-400 hover:text-purple-300 font-bold uppercase tracking-wider">
            View All
          </Link>
          <div className="flex gap-2">
            <div onClick={(e) => {
              let sibling = e.currentTarget.parentElement?.parentElement?.parentElement?.nextElementSibling as HTMLElement;
              while (sibling && !sibling.classList.contains('flex')) { sibling = sibling.nextElementSibling as HTMLElement; }
              sibling?.scrollBy({ left: -400, behavior: 'smooth' });
            }} className="w-8 h-8 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center hover:bg-black/5 dark:bg-white/5 cursor-pointer text-black dark:text-white">
              <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
            </div>
            <div onClick={(e) => {
              let sibling = e.currentTarget.parentElement?.parentElement?.parentElement?.nextElementSibling as HTMLElement;
              while (sibling && !sibling.classList.contains('flex')) { sibling = sibling.nextElementSibling as HTMLElement; }
              sibling?.scrollBy({ left: 400, behavior: 'smooth' });
            }} className="w-8 h-8 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center hover:bg-black/5 dark:bg-white/5 cursor-pointer text-black dark:text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
            </div>
          </div>
        </div>
      </div>
      {items.length === 0 && !loading && !isFetching && (
        <div className="text-gray-500 text-sm italic">No recently added items found.</div>
      )}
      {(loading || isFetching) && items.length === 0 && (
        <div className="text-gray-500 text-sm italic">Fetching recent items...</div>
      )}
      <div className="flex overflow-x-auto gap-4 snap-x snap-mandatory scroll-p-4 pb-2 scrollbar-hide">
         {renderedItems}
      </div>
    </div>
  );
}
