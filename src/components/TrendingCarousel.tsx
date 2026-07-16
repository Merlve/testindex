import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'motion/react';
import ItemCard from './ItemCard';
import { parseMediaName } from '../utils/nameParser';
import { Flame } from 'lucide-react';

export default function TrendingCarousel({ categories }: { categories: any[] }) {
  const [trendingItems, setTrendingItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrending = async () => {
      try {
        setLoading(true);
        const res = await axios.get('/api/tmdb/trending');
        const results = res.data?.results || [];
        
        const allItems = categories.flatMap(c => (c.items || []).map((item: any) => ({ ...item, category: c.name })));
        
        // Find intersection
        const availableTrending = [];
        const seen = new Set();
        
        for (const tmdbItem of results) {
          const title = (tmdbItem.title || tmdbItem.name || '').toLowerCase();
          const origTitle = (tmdbItem.original_title || tmdbItem.original_name || '').toLowerCase();
          const releaseDate = tmdbItem.release_date || tmdbItem.first_air_date || '';
          const tmdbYear = releaseDate ? releaseDate.substring(0, 4) : '';
          
          if (!title && !origTitle) continue;

          for (const myItem of allItems) {
            const { cleanName, year: myYear } = parseMediaName(myItem.name);
            const myTitle = cleanName.toLowerCase();
            
            // Fuzzy match (very basic)
            if (myTitle === title || myTitle === origTitle || myTitle.includes(title) || title.includes(myTitle)) {
               // If both TMDB and our parsed file have years, ensure they match to avoid showing the wrong remake/version
               if (tmdbYear && myYear && tmdbYear !== myYear) {
                 continue; // Year mismatch, skip
               }

               if (!seen.has(myItem.name)) {
                 availableTrending.push({
                   ...myItem,
                   // Inject TMDB data so ItemCard doesn't have to refetch if we update ItemCard, 
                   // but for now ItemCard refetches based on name. It's fine.
                 });
                 seen.add(myItem.name);
               }
               break; // Found a match for this trending item
            }
          }
        }
        
        setTrendingItems(availableTrending);
      } catch (err) {
        console.error('Failed to fetch trending', err);
      } finally {
        setLoading(false);
      }
    };
    
    if (categories.length > 0) {
      fetchTrending();
    }
  }, [categories]);

  if (loading || trendingItems.length === 0) {
    return null; // Don't show anything if no trending matches or still loading
  }

  return (
    <div className="mb-12">
      <div className="flex justify-between items-end mb-4">
        <h3 className="text-lg font-bold text-black dark:text-white flex items-center gap-2">
           <Flame className="text-orange-500" size={20} />
           Trending Now
        </h3>
      </div>
      <div className="flex overflow-x-auto gap-5 pb-4 scrollbar-hide">
         {trendingItems.slice(0, 10).map((item, i) => (
           <ItemCard key={i} item={item} category={item.category} parentPath={`/home/${item.category}`} />
         ))}
      </div>
    </div>
  );
}
