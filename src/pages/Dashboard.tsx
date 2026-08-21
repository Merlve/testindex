import { useEffect, useState, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router';
import { Play, RefreshCw } from 'lucide-react';
import ItemCard from '../components/ItemCard';
import FeaturedSlider from '../components/FeaturedSlider';
import LastWatchedCarousel from '../components/LastWatchedCarousel';
import RecentlyAddedCarousel from '../components/RecentlyAddedCarousel';
import TrendingCarousel from '../components/TrendingCarousel';
import DigitalReleasesCarousel from '../components/DigitalReleasesCarousel';
import GenresCarousel from '../components/GenresCarousel';
import AnnouncementPill from '../components/AnnouncementPill';
import { motion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const DashboardSkeleton = () => (
  <div className="animate-pulse pb-20">
    <section className="px-4 sm:px-8 pt-2 sm:pt-4 mb-2 mt-0 sm:mt-2">
      <div className="relative h-[260px] sm:h-[360px] bg-black/5 dark:bg-white/5 rounded-3xl overflow-hidden shadow-2xl">
         <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent flex flex-col justify-center px-6 sm:px-12">
            <div className="w-24 h-5 bg-black/10 dark:bg-white/10 rounded-full mb-4 mt-8"></div>
            <div className="w-2/3 sm:w-1/2 h-10 bg-black/10 dark:bg-white/10 rounded-xl mb-2"></div>
            <div className="flex gap-4 mt-8">
              <div className="w-32 h-10 sm:h-12 bg-black/10 dark:bg-white/10 rounded-xl"></div>
              <div className="w-32 h-10 sm:h-12 bg-black/10 dark:bg-white/10 rounded-xl hidden sm:block"></div>
            </div>
         </div>
      </div>
    </section>
    <div className="px-4 sm:px-8 flex-1 flex flex-col gap-6 sm:gap-8 pb-12 mt-4">
      {[1, 2, 3].map((i) => (
        <div key={i}>
          <div className="flex justify-between items-end mb-2">
            <div className="w-48 h-6 bg-black/10 dark:bg-white/10 rounded-lg"></div>
            <div className="w-24 h-4 bg-black/10 dark:bg-white/10 rounded-lg"></div>
          </div>
          <div className="flex overflow-hidden gap-4 pb-2">
             {[1, 2, 3, 4, 5, 6].map((j) => (
               <div key={j} className="flex-none w-32 sm:w-40 md:w-48 aspect-[2/3] bg-black/5 dark:bg-white/5 rounded-2xl"></div>
             ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default function Dashboard() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  




  const [dashboardRefreshCounter, setDashboardRefreshCounter] = useState(0);

  const fetchHome = async () => {
    // We assume /home has the categories
    try {
      const payload: any = { reqPath: '/home' };
      if (dashboardRefreshCounter > 0) payload.refresh = true;
      const res = await axios.post('/api/fs/list', payload, { headers: { Authorization: token } });
      
      if (res.data.code !== 200) {
        throw new Error(`Failed to load categories: ${res.data.message || 'Unknown error'}`);
      }
      const content = res.data.data?.content || [];
      const dirs = content.filter((c: any) => c.is_dir).map((c: any) => c.name);
      
      const catData = await Promise.all(
        dirs.map(async (dir: string) => {
          const subPayload: any = { reqPath: `/home/${dir}` };
          if (dashboardRefreshCounter > 0) subPayload.refresh = true;
          const subRes = await axios.post('/api/fs/list', subPayload, { headers: { Authorization: token } });
          return {
            name: dir,
            items: subRes.data.data?.content || []
          };
        })
      );
      try {
        localStorage.setItem('dashboard_cache', JSON.stringify(catData));
      } catch (e) {}
      return catData;
    } catch (err: any) {
      if (err.response) {
      }
      throw err;
    }
  };

  
  const { data: categories = [], isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['dashboard', dashboardRefreshCounter],
    queryFn: fetchHome,
    enabled: !!token,
    retry: 1,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
    
    refetchOnWindowFocus: false,
    placeholderData: () => {
      if (dashboardRefreshCounter > 0) return undefined;
      try {
        const cached = localStorage.getItem('dashboard_cache');
        if (cached) return JSON.parse(cached);
      } catch (e) {}
      return undefined;
    }
  });

  const { data: configData } = useQuery({
    queryKey: ['site-config'],
    queryFn: async () => {
      const res = await axios.get('/api/config');
      return res.data;
    },
    staleTime: Infinity,
    
  });

  const featuredItems = useMemo(() => {
    if (!categories || categories.length === 0) return [];
    
    const allItems = categories.flatMap(c => (c.items || []).map((item: any) => ({ ...item, category: c.name, parentPath: item._parent || `/home/${c.name}`, openlist_path: item.path || `/home/${c.name}/${item.name}` })));
    if (allItems.length === 0) return [];
    
    const sessionKey = 'shindex-featured-items-session';
    const cachedStr = sessionStorage.getItem(sessionKey);
    let cachedIds: string[] = [];
    if (cachedStr) {
      try { cachedIds = JSON.parse(cachedStr); } catch (e) {}
    }
    
    if (cachedIds.length > 0) {
      const matched = cachedIds.map(id => allItems.find(item => (item.id && item.id.toString() === id) || item.name === id)).filter(Boolean);
      if (matched.length > 0) {
        return matched;
      }
    }

    // Shuffle and pick up to 5
    const shuffled = [...allItems].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 5);
    
    sessionStorage.setItem(sessionKey, JSON.stringify(selected.map(item => (item.id ? item.id.toString() : item.name))));
    return selected;
  }, [categories]);



  const renderedCategories = useMemo(() => {
    return categories.map(cat => (
      <div key={cat.name}>
        <div className="flex justify-between items-end mb-2">
          <h3 className="text-lg font-bold text-black dark:text-white">{cat.name}</h3>
          <div className="flex gap-2 items-center">
            <Link to={`/category/${cat.name}`} className="text-xs text-purple-400 hover:text-purple-300 font-bold uppercase tracking-wider mr-2">View All</Link>
            <div onClick={(e) => (e.currentTarget.parentElement?.parentElement?.nextElementSibling as HTMLElement)?.scrollBy({ left: -400, behavior: 'smooth' })} className="w-8 h-8 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center hover:bg-black/5 dark:bg-white/5 cursor-pointer text-black dark:text-white">
              <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
            </div>
            <div onClick={(e) => (e.currentTarget.parentElement?.parentElement?.nextElementSibling as HTMLElement)?.scrollBy({ left: 400, behavior: 'smooth' })} className="w-8 h-8 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center hover:bg-black/5 dark:bg-white/5 cursor-pointer text-black dark:text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
            </div>
          </div>
        </div>
        <div id={`carousel-${cat.name}`} className="flex overflow-x-auto gap-4 snap-x snap-mandatory scroll-p-4 pb-2 scrollbar-hide">
           {cat.items.slice(0, 10).map((item, i) => (
             <ItemCard key={item.id || i} item={item} category={cat.name} parentPath={`/home/${cat.name}`} />
           ))}
        </div>
      </div>
    ));
  }, [categories]);

  if (isLoading) return <DashboardSkeleton />;

  if (isError) {
    return (
      <div className="pb-20">
        <div className="flex flex-col items-center justify-center py-12 text-center px-4">
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-6 py-4 rounded-xl mb-4 max-w-lg">
            <p className="font-bold mb-2">Error loading dashboard</p>
            <p className="text-sm opacity-80">{error instanceof Error ? error.message : 'Unknown error occurred'}</p>
          </div>
          <button onClick={() => refetch()} className="flex items-center gap-2 bg-white/10 dark:bg-black/10 hover:bg-white/20 dark:hover:bg-black/20 text-black dark:text-white px-5 py-2.5 rounded-full border border-white/20 dark:border-white/10 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] backdrop-blur-sm transition-all hover:scale-105">
            <RefreshCw size={18} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="pb-20"
    >
      <div className="px-4 sm:px-8 mt-4 md:mt-6 mb-2">
        <AnnouncementPill message={configData?.announcement} className="w-full" />
      </div>

      {featuredItems && featuredItems.length > 0 && (
        <FeaturedSlider featuredItems={featuredItems} />
      )}

      <div className="px-4 sm:px-8 flex-1 flex flex-col gap-6 sm:gap-8 pb-12 mt-4">
        <LastWatchedCarousel />
        <RecentlyAddedCarousel />
        <TrendingCarousel categories={categories} />
        <DigitalReleasesCarousel categories={categories} />
        {renderedCategories}
        <GenresCarousel />
      </div>
    </motion.div>
  );
}
