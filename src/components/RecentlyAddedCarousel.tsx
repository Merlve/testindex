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
    refetchInterval: 3 * 60 * 1000,
    staleTime: 60 * 1000,
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
        <Link to="/recently-added" className="text-xs text-purple-400 hover:text-purple-300 font-bold uppercase tracking-wider">
          View All
        </Link>
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
