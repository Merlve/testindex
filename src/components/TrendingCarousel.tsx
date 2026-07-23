import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { motion } from 'motion/react';
import ItemCard from './ItemCard';
import { parseMediaName } from '../utils/nameParser';
import { Flame } from 'lucide-react';

export default function TrendingCarousel({ categories }: { categories: any[] }) {
  const fetchTrending = async () => {
    const res = await axios.get('/api/meta/trending');
    const results = res.data?.results || [];
    
    const allItems = categories.flatMap(c => (c.items || []).map((item: any) => ({ ...item, category: c.name })));
    
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
        
        if (myTitle === title || myTitle === origTitle || myTitle.includes(title) || title.includes(myTitle)) {
           if (tmdbYear && myYear && tmdbYear !== myYear) {
             continue;
           }
           if (!seen.has(myItem.name)) {
             availableTrending.push({
               ...myItem,
             });
             seen.add(myItem.name);
           }
           break;
        }
      }
    }
    return availableTrending;
  };

  const { data: trendingItems = [], isLoading: loading } = useQuery({
    queryKey: ['trending', categories],
    queryFn: fetchTrending,
    enabled: categories.length > 0,
    staleTime: 10 * 60 * 1000,
  });



  if (loading || trendingItems.length === 0) {
    return null; // Don't show anything if no trending matches or still loading
  }

  return (
    <div className="relative">
      <div className="flex justify-between items-end mb-2">
        <h3 className="text-lg font-bold text-black dark:text-white flex items-center gap-2">
           <Flame className="text-orange-500" size={20} />
           Trending Now
        </h3>
      </div>
      <div className="flex overflow-x-auto gap-4 pb-2 scrollbar-hide">
         {trendingItems.slice(0, 10).map((item, i) => (
           <ItemCard key={i} item={item} category={item.category} parentPath={`/home/${item.category}`} />
         ))}
      </div>
    </div>
  );
}
