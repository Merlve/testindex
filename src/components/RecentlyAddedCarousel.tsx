import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import ItemCard from './ItemCard';
import { Clock, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function RecentlyAddedCarousel() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const { user } = useAuth();

  const fetchRecentlyAdded = async (force: boolean = false) => {
    try {
      if (force) setIsFetching(true);
      else setLoading(true);
      
      const res = await axios.get(`/api/jellyfin/recently-added${force ? '?force=true' : ''}`);
      if (res.data?.success) {
        setItems(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch recently added', err);
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchRecentlyAdded();
    // Refresh every 10 mins
    const interval = setInterval(() => fetchRecentlyAdded(false), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading && items.length === 0) {
    // We still show the header but with a loading state below
  }

  return (
    <div className="mb-12">
      <div className="flex justify-between items-end mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-white flex items-center gap-2"> 
             <Clock className="text-blue-500" size={20} /> 
             Recently Added
          </h3>
          <Link to="/recently-added" className="text-xs text-purple-400 hover:text-purple-300 font-bold uppercase tracking-wider">View All</Link>
        </div>
        <button 
          onClick={() => fetchRecentlyAdded(true)}
          disabled={isFetching}
          className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition disabled:opacity-50"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          {isFetching ? "Fetching..." : "Fetch"}
        </button>
      </div>
      {items.length === 0 && !loading && !isFetching && (
        <div className="text-gray-500 text-sm italic">No recently added items found.</div>
      )}
      {(loading || isFetching) && items.length === 0 && (
        <div className="text-gray-500 text-sm italic">Fetching recent items...</div>
      )}
      <div className="flex overflow-x-auto gap-5 pb-4 scrollbar-hide">
         {items.slice(0, 15).map((item, i) => (
           <ItemCard key={i} item={item} category={item._cat} parentPath={item._parent} />
         ))}
      </div>
    </div>
  );
}
