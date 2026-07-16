import { useState, useEffect } from 'react';
import ItemCard from '../components/ItemCard';
import { motion } from 'motion/react';
import { WifiOff } from 'lucide-react';

export default function OfflinePage() {
  const [recentItems, setRecentItems] = useState<any[]>([]);

  useEffect(() => {
    try {
      const recentStr = localStorage.getItem('recently_browsed');
      if (recentStr) {
        setRecentItems(JSON.parse(recentStr));
      }
    } catch(e) {}
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="pb-20 px-4 sm:px-8"
    >
      <div className="flex flex-col sm:flex-row items-center justify-between mt-8 mb-8 gap-4">
        <h2 className="text-3xl font-bold text-black dark:text-white flex items-center gap-3">
          <WifiOff className="text-purple-500" size={32} />
          Offline (Recently Browsed)
        </h2>
      </div>

      {recentItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div className="w-24 h-24 bg-black/5 dark:bg-white/5 rounded-full flex items-center justify-center mb-6">
            <WifiOff size={48} className="text-gray-400" />
          </div>
          <h3 className="text-2xl font-bold text-black dark:text-white mb-2">No Offline Data</h3>
          <p className="text-gray-500 max-w-md">You haven't browsed any titles yet. Once you view details for a movie or show, they will appear here for offline viewing.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
          {recentItems.map((r, i) => (
            <ItemCard key={`offline-${i}`} item={r.item} category={r.category} parentPath={r.parentPath} tmdbData={r.tmdbData} className="w-full" />
          ))}
        </div>
      )}
    </motion.div>
  );
}
