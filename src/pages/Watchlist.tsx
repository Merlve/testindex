import Loader from "../components/Loader";
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ItemCard from '../components/ItemCard';
import { motion } from 'motion/react';
import { Bookmark } from 'lucide-react';

export default function Watchlist() {
  const { user } = useAuth();
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <Loader />;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-4 sm:p-12 min-h-screen pb-20"
    >
      <div className="flex flex-col mb-8 gap-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-white capitalize tracking-tight flex items-center gap-3">
          <Bookmark className="text-purple-400" /> My Watchlist
        </h2>
        <p className="text-gray-400 text-sm">Movies and shows you have saved for later.</p>
      </div>

      {watchlist.length === 0 ? (
        <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5">
          <Bookmark className="w-16 h-16 mx-auto text-gray-400 mb-4 opacity-50" />
          <h3 className="text-xl font-bold text-white mb-2">Your watchlist is empty</h3>
          <p className="text-gray-400 text-sm">Save items to your watchlist by clicking the bookmark button on any movie or show.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-4 sm:gap-6">
          {watchlist.map((entry, index) => (
            <ItemCard 
              key={index}
              item={entry.item || entry}
              category={entry.category || entry._cat || ''}
              parentPath={entry.parentPath || (entry.item && entry.item.parent) || entry.parent || entry._parent || ''}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
