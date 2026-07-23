import { useEffect, useState, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router';
import { Play, RefreshCw } from 'lucide-react';
import ItemCard from '../components/ItemCard';
import FeaturedSlide from '../components/FeaturedSlide';
import RecentlyAddedCarousel from '../components/RecentlyAddedCarousel';
import TrendingCarousel from '../components/TrendingCarousel';
import GenresCarousel from '../components/GenresCarousel';
import { motion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const DashboardSkeleton = () => (
  <div className="animate-pulse pb-20">
    <div className="px-4 sm:px-8 flex justify-end mt-4 md:mt-6 mb-2">
       <div className="w-244 h-9 bg-black/5 dark:bg-white/5 rounded-xl"></div>
    </div>
    <section className="px-4 sm:px-8 pt-2 sm:pt-4 mb-2 mt-0 sm:mt-2">
      <div className="relative h-[200px] sm:h-[320px] bg-black/5 dark:bg-white/5 rounded-3xl overflow-hidden shadow-24xl">
         <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent flex flex-col justify-center px-6 sm:px-12">
            <div className="w-240 h-5 bg-black/10 dark:bg-white/10 rounded-full mb-4 mt-8"></div>
            <div className="w-24/3 h-10 bg-black/10 dark:bg-white/10 rounded-xl mb-2"></div>
            <div className="flex gap-4 mt-8">
              <div className="w-32 h-10 sm:h-12 bg-black/10 dark:bg-white/10 rounded-xl"></div>
              <div className="w-32 h-10 sm:h-12 bg-black/10 dark:bg-white/10 rounded-xl hidden sm:block"></div>
            </div>
         </div>
      </div>
    </section>
    <div className="px-4 sm:px-8 flex-1 flex flex-col gap-0 sm:gap-4 pb-12">
      {[1, 2, 3].map((i) => (
        <div key={i}>
          <div className="flex justify-between items-end mb-2">
            <div className="w-48 h-6 bg-black/10 dark:bg-white/10 rounded-lg"></div>
            <div className="w-244 h-4 bg-black/10 dark:bg-white/10 rounded-lg"></div>
          </div>
          <div className="flex overflow-hidden gap-4 pb-2">
             {[1, 2, 3, 4, 5, 6].map((j) => (
               <div key={j} className="flex-none w-[140px] sm:w-[160px] md:w-[180px] lg:w-[200px] h-[210px] sm:h-[240px] md:h-[270px] lg:h-[300px] bg-black/5 dark:bg-white/5 rounded-2xl"></div>
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
  




  const fetchHome = async () => {
    // We assume /home has the categories
    try {
      const res = await axios.post('/api/fs/list', { reqPath: '/home' }, { headers: { Authorization: token } });
      
      if (res.data.code !== 200) {
        throw new Error(`Failed to load categories: ${res.data.message || 'Unknown error'}`);
      }
      const content = res.data.data?.content || [];
      const dirs = content.filter((c: any) => c.is_dir).map((c: any) => c.name);
      
      const catData = await Promise.all(
        dirs.map(async (dir: string) => {
          const subRes = await axios.post('/api/fs/list', { reqPath: `/home/${dir}` }, { headers: { Authorization: token } });
          return {
            name: dir,
            items: subRes.data.data?.content || []
          };
        })
      );
      return catData;
    } catch (err: any) {
      if (err.response) {
      }
      throw err;
    }
  };

  const [slideIndex, setSlideIndex] = useState(0);

  const { data: categories = [], isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchHome,
    enabled: !!token,
    retry: 1, // Reduce retries so it doesn't spin too long on timeout
  });

  const featuredItems = useMemo(() => {
    const allItems = categories.flatMap(c => (c.items || []).map((item: any) => ({ ...item, category: c.name })));
    // Shuffle and pick up to 5
    const shuffled = [...allItems].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 5);
  }, [categories]);

  useEffect(() => {
    if (featuredItems.length === 0) return;
    const interval = setInterval(() => {
      setSlideIndex(prev => (prev + 1) % featuredItems.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [featuredItems]);


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

  const actualSlideIndex = Math.min(slideIndex, Math.max(0, featuredItems.length - 1));
  const featured = featuredItems[actualSlideIndex];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="pb-20"
    >
      <div className="px-4 sm:px-8 flex justify-end mt-4 md:mt-6 mb-2">
        <button onClick={() => refetch()} disabled={isFetching} className="flex items-center gap-2 text-sm text-black dark:text-white transition-all bg-white/10 dark:bg-black/10 px-4 py-2 rounded-full border border-white/20 dark:border-white/10 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] backdrop-blur-sm hover:bg-white/20 dark:hover:bg-black/20 hover:scale-105">
          <RefreshCw size={16} className={isFetching ? 'animate-spin text-purple-400' : ''} /> {isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      {featured && (
        <FeaturedSlide 
         featured={featured} 
         slideIndex={actualSlideIndex} 
         totalSlides={featuredItems.length} 
         onNext={() => setSlideIndex(prev => (prev + 1) % featuredItems.length)}
         onPrev={() => setSlideIndex(prev => (prev - 1 + featuredItems.length) % featuredItems.length)}
         onSetSlide={(idx) => setSlideIndex(idx)}
       />
      )}

      <div className="px-4 sm:px-8 flex-1 flex flex-col gap-0 sm:gap-4 pb-12">
        <TrendingCarousel categories={categories} />
        <RecentlyAddedCarousel />
        {categories.map(cat => (
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
            <div id={`carousel-${cat.name}`} className="flex overflow-24-auto gap-4 pb-2 scrollbar-hide">
               {cat.items.slice(0, 10).map((item, i) => (
                 <ItemCard key={i} item={item} category={cat.name} parentPath={`/home/${cat.name}`} />
               ))}
            </div>
          </div>
        ))}
        <GenresCarousel />
      </div>
    </motion.div>
  );
}
