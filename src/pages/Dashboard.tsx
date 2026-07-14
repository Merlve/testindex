import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router';
import Loader from '../components/Loader';
import { Play, RefreshCw } from 'lucide-react';
import ItemCard from '../components/ItemCard';
import FeaturedSlide from '../components/FeaturedSlide';
import { motion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function Dashboard() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const fetchHome = async () => {
    // We assume /home has the categories
    const res = await axios.post('/api/fs/list', { reqPath: '/home' }, { headers: { Authorization: token } });
    if (res.data.code !== 200) {
      throw new Error('Failed to load categories');
    }
    const content = res.data.data.content || [];
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
  };

  const [slideIndex, setSlideIndex] = useState(0);

  const { data: categories = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchHome,
    enabled: !!token,
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

  if (isLoading) return <Loader />;

  const featured = featuredItems[slideIndex];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="pb-20"
    >
      <div className="px-4 sm:px-8 flex justify-end mt-4 md:mt-6 mb-2">
        <button onClick={() => refetch()} disabled={isFetching} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors bg-white/5 px-4 py-2 rounded-xl border border-white/5 hover:border-white/10">
          <RefreshCw size={16} className={isFetching ? 'animate-spin text-purple-400' : ''} /> {isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      {featured && (
        <FeaturedSlide 
        featured={featured} 
        slideIndex={slideIndex} 
        totalSlides={featuredItems.length} 
      />
      )}

      <div className="px-4 sm:px-8 flex-1 space-y-12 pb-12">
        {categories.map(cat => (
          <div key={cat.name}>
            <div className="flex justify-between items-end mb-4">
              <h3 className="text-lg font-bold text-white">{cat.name}</h3>
              <div className="flex gap-2 items-center">
                <Link to={`/category/${cat.name}`} className="text-xs text-purple-400 hover:text-purple-300 font-bold uppercase tracking-wider mr-2">View All</Link>
                <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 cursor-pointer text-white">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                </div>
                <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 cursor-pointer text-white">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                </div>
              </div>
            </div>
            <div className="flex overflow-x-auto gap-5 pb-4 scrollbar-hide">
               {cat.items.slice(0, 10).map((item, i) => (
                 <ItemCard key={i} item={item} category={cat.name} parentPath={`/home/${cat.name}`} />
               ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
