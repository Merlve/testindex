import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import ItemCard from './ItemCard';
import { Clock, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function RecentlyAddedCarousel() {
  const { user } = useAuth();
  
  const fetchRecentlyAdded = async () => {
    const res = await axios.get('/api/jellyfin/recently-added');
    if (res.data?.success) {
      return res.data.data || [];
    }
    return [];
  };

  const { data: items = [], isLoading: loading, isFetching, refetch } = useQuery({
    queryKey: ['recentlyAdded'],
    queryFn: fetchRecentlyAdded,
    staleTime: 10 * 60 * 1000,
    retry: 3,
    retryDelay: 2000,
  });

  if (loading && items.length === 0) {
    // We still show the header but with a loading state below
  }

  return (
    <div className="relative">
      <div className="flex justify-between items-end mb-2">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-black dark:text-white flex items-center gap-2"> 
             <Clock className="text-blue-500" size={20} /> 
             Recently Added
          </h3>
          <Link to="/recently-added" className="text-xs text-purple-400 hover:text-purple-300 font-bold uppercase tracking-wider">View All</Link>
        </div>
        {user === 'admin' && (
          <button 
            onClick={async () => { await axios.get('/api/jellyfin/recently-added?force=true'); refetch(); }}
            disabled={isFetching}
            className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 bg-white/10 dark:bg-black/10 hover:bg-white/20 dark:hover:bg-black/20 border border-white/20 dark:border-white/10 text-black dark:text-white rounded-full transition-all shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] backdrop-blur-sm hover:scale-105 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
            {isFetching ? "Fetching..." : "Fetch"}
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
