import { useState, useEffect, useMemo } from 'react';
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
    
    const allItems = categories.flatMap(c => (c.items || []).map((item: any) => ({ 
      ...item, 
      category: c.name, 
      parentPath: item._parent || `/home/${c.name}`, 
      openlist_path: item.path || `/home/${c.name}/${item.name}` 
    })));
    
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
    try {
      localStorage.setItem('trending_cache', JSON.stringify(availableTrending));
    } catch (e) {}
    return availableTrending;
  };

  const { data: trendingItems = [], isLoading: loading } = useQuery({
    queryKey: ['trending'],
    queryFn: fetchTrending,
    enabled: categories.length > 0,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
    
    placeholderData: () => {
      try {
        const cached = localStorage.getItem('trending_cache');
        if (cached) return JSON.parse(cached);
      } catch (e) {}
      return undefined;
    }
  });



  const renderedItems = useMemo(() => {
    return trendingItems.slice(0, 10).map((item, i) => (
      <ItemCard key={`${item.id || item.name}-${i}`} item={item} category={item.category} parentPath={`/home/${item.category}`} />
    ));
  }, [trendingItems]);

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
        <div className="flex gap-2">
          <div onClick={(e) => (e.currentTarget.parentElement?.parentElement?.nextElementSibling as HTMLElement)?.scrollBy({ left: -400, behavior: 'smooth' })} className="w-8 h-8 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center hover:bg-black/5 dark:bg-white/5 cursor-pointer text-black dark:text-white">
            <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
          </div>
          <div onClick={(e) => (e.currentTarget.parentElement?.parentElement?.nextElementSibling as HTMLElement)?.scrollBy({ left: 400, behavior: 'smooth' })} className="w-8 h-8 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center hover:bg-black/5 dark:bg-white/5 cursor-pointer text-black dark:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
          </div>
        </div>
      </div>
      <div className="flex overflow-x-auto gap-4 snap-x snap-mandatory scroll-p-4 pb-2 scrollbar-hide">
         {renderedItems}
      </div>
    </div>
  );
}
