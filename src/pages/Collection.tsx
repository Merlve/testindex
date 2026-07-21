import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import ItemCard from '../components/ItemCard';
import { ChevronLeft } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { parseMediaName } from '../utils/nameParser';

export default function Collection() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { token } = useAuth();
  
  const [collection, setCollection] = useState<any>(location.state?.collection || null);
  const [loading, setLoading] = useState(!location.state?.collection);

  useEffect(() => {
    if (collection) return;
    
    // Fallback if accessed directly without state
    const fetchCollection = async () => {
      try {
        setLoading(true);
        // Fetch categories
        const res = await axios.post('/api/fs/list', { reqPath: '/home' }, { headers: { Authorization: token } });
        if (res.data.code !== 200) throw new Error();
        const dirs = (res.data.data?.content || []).filter((c: any) => c.is_dir).map((c: any) => c.name);
        
        const catData = await Promise.all(
          dirs.map(async (dir: string) => {
            const subRes = await axios.post('/api/fs/list', { reqPath: `/home/${dir}` }, { headers: { Authorization: token } });
            return {
              name: dir,
              items: subRes.data.data?.content || []
            };
          })
        );
        const allItems = catData.flatMap(c => (c.items || []).map((item: any) => ({ ...item, category: c.name })));
        
        // Fetch collections
        const colRes = await axios.get('/api/meta/collections');
        const tmdbCollections = colRes.data?.collections || [];
        const targetCol = tmdbCollections.find((c: any) => c.id.toString() === id);
        
        if (targetCol) {
          const matchedItems = [];
          for (const myItem of allItems) {
            const { cleanName } = parseMediaName(myItem.name);
            const myTitle = cleanName.toLowerCase();
            const hasMatch = targetCol.queries.some((q: string) => myTitle === q);
            if (hasMatch) {
              matchedItems.push(myItem);
            }
          }
          const uniqueItems = Array.from(new Map(matchedItems.map((item: any) => [item.name, item])).values());
          setCollection({
            ...targetCol,
            items: uniqueItems
          });
        }
      } catch (err) {
        console.error('Failed to load collection data', err);
      } finally {
        setLoading(false);
      }
    };
    
    if (token) {
      fetchCollection();
    }
  }, [id, token, collection]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffcf9] dark:bg-[#08080a] flex items-center justify-center pb-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="min-h-screen bg-[#fffcf9] dark:bg-[#08080a] flex flex-col items-center justify-center pb-20 text-center px-4">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4">Collection Not Found</h2>
        <button onClick={() => navigate(-1)} className="px-6 py-2 bg-white/10 dark:bg-black/10 hover:bg-white/20 dark:hover:bg-black/20 text-black dark:text-white rounded-full border border-white/20 dark:border-white/10 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] backdrop-blur-sm transition-all hover:scale-105 font-bold">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-[#fffcf9] dark:bg-[#08080a] pb-20 relative"
    >
      <button 
        onClick={() => navigate(-1)} 
        className="absolute top-6 left-6 z-50 p-2 sm:p-3 rounded-full bg-white/10 dark:bg-black/10 backdrop-blur-sm border border-white/20 dark:border-white/10 text-black dark:text-white shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] hover:bg-white/20 dark:hover:bg-black/20 transition-all hover:scale-110"
      >
        <ChevronLeft size={24} />
      </button>
      
      <div className="h-48 md:h-64 relative shrink-0">
        {collection.backdrop_path && (
          <img src={`https://image.tmdb.org/t/p/original${collection.backdrop_path}`} className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#fffcf9] dark:from-[#08080a] to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-[#fffcf9] dark:from-[#08080a] via-[#fffcf9]/80 dark:via-[#08080a]/80 to-transparent z-10"></div>
        <div className="absolute bottom-6 left-6 md:left-10 z-20 flex items-end gap-6">
          {collection.poster_path && (
            <img src={`https://image.tmdb.org/t/p/w500${collection.poster_path}`} className="w-24 md:w-32 rounded-xl shadow-xl hidden sm:block border border-black/10 dark:border-white/10" />
          )}
          <div>
            <h2 className="text-3xl md:text-5xl font-bold text-black dark:text-white tracking-tight">{collection.name}</h2>
            <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 mt-2 font-medium">
              {collection.items?.length || 0} items available on SHUTTER
            </p>
          </div>
        </div>
      </div>
      
      <div className="p-6 md:p-10 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {collection.items?.map((item: any, i: number) => (
            <ItemCard 
              key={i} 
              item={item} 
              category={item.category} 
              parentPath={`/home/${item.category}`} 
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
