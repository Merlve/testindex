import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import ItemCard from './ItemCard';
import { Clock, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function RecentlyAddedCarousel() {
  const { user, token } = useAuth();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const fetchRecentlyAdded = async () => {
    const res = await axios.get('/api/jellyfin/recently-added', { headers: { Authorization: token } });
    if (res.data?.success) {
      return res.data.data || [];
    }
    return [];
  };

  const { data: items = [], isLoading: loading, isFetching, refetch } = useQuery({
    queryKey: ['recentlyAdded'],
    queryFn: fetchRecentlyAdded,
    refetchInterval: 3 * 60 * 1000,
    staleTime: 60 * 1000,
    retry: 3,
    retryDelay: 2000,
  });

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const handleFetchJellyfin = async () => {
    setIsRefreshing(true);
    setToastMsg(null);
    try {
      const res = await axios.get('/api/jellyfin/recently-added?force=true&refresh=true', { headers: { Authorization: token } });
      if (res.data?.success) {
        const fetchedItems = res.data.data || [];
        queryClient.setQueryData(['recentlyAdded'], fetchedItems);
        await refetch();
        queryClient.invalidateQueries();
        if (fetchedItems.length === 0) {
          setToastMsg('Jellyfin fetch completed, but 0 items were matched on OpenList.');
        } else {
          setToastMsg(`Successfully fetched ${fetchedItems.length} items from Jellyfin!`);
        }
      } else {
        setToastMsg(`Jellyfin fetch failed: ${res.data?.error || res.data?.message || 'Unknown error'}`);
      }
    } catch (e: any) {
      console.error('[Jellyfin] Refresh error:', e);
      const errMsg = e.response?.data?.error || e.response?.data?.message || e.message || 'Failed to fetch from Jellyfin';
      setToastMsg(`Jellyfin fetch failed: ${errMsg}`);
    } finally {
      setIsRefreshing(false);
      setTimeout(() => setToastMsg(null), 6000);
    }
  };

  return (
    <div className="relative">
      {toastMsg && (
        <div className="mb-3 px-4 py-2 bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs rounded-xl backdrop-blur-md transition-all">
          {toastMsg}
        </div>
      )}
      <div className="flex justify-between items-end mb-2">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-black dark:text-white flex items-center gap-2"> 
             <Clock className="text-blue-500" size={20} /> 
             Recently Added
          </h3>
          <Link to="/recently-added" className="text-xs text-purple-400 hover:text-purple-300 font-bold uppercase tracking-wider">View All</Link>
        </div>
        {user && user !== 'guest' && (
          <button 
            onClick={handleFetchJellyfin}
            disabled={isFetching || isRefreshing}
            className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 bg-white/10 dark:bg-black/10 hover:bg-white/20 dark:hover:bg-black/20 border border-white/20 dark:border-white/10 text-black dark:text-white rounded-full transition-all shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] backdrop-blur-sm hover:scale-105 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} className={(isFetching || isRefreshing) ? "animate-spin text-purple-400" : ""} />
            {(isFetching || isRefreshing) ? "Fetching..." : "Fetch"}
          </button>
        )}
      </div>
      {items.length === 0 && !loading && !isFetching && (
        <div className="text-gray-500 text-sm italic">No recently added items found.</div>
      )}
      {(loading || isFetching) && items.length === 0 && (
        <div className="text-gray-500 text-sm italic">Fetching recent items...</div>
      )}
      <div className="flex overflow-x-auto gap-4 pb-2 scrollbar-hide">
         {items.slice(0, 15).map((item, i) => (
           <ItemCard key={i} item={item} category={item._cat} parentPath={item._parent} />
         ))}
      </div>
    </div>
  );
}
