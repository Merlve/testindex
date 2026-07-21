import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import axios from 'axios';
import { Library, ChevronLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { parseMediaName } from '../utils/nameParser';

export default function CollectionsPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCollections = async () => {
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
        
        const availableCollections = [];
        for (const col of tmdbCollections) {
          const matchedItems = [];
          for (const myItem of allItems) {
            const { cleanName } = parseMediaName(myItem.name);
            const myTitle = cleanName.toLowerCase();
            const hasMatch = col.queries.some((q: string) => myTitle === q);
            if (hasMatch) {
              matchedItems.push(myItem);
            }
          }
          if (matchedItems.length >= 1) {
            const uniqueItems = Array.from(new Map(matchedItems.map((item: any) => [item.name, item])).values());
            availableCollections.push({
              ...col,
              items: uniqueItems
            });
          }
        }
        setCollections(availableCollections);
      } catch (err) {
        console.error('Failed to load collections', err);
      } finally {
        setLoading(false);
      }
    };
    
    if (token) {
      fetchCollections();
    }
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffcf9] dark:bg-[#08080a] flex items-center justify-center pb-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-[#fffcf9] dark:bg-[#08080a] pb-20"
    >
      <div className="px-4 md:px-8 py-6 sticky top-0 bg-[#fffcf9]/90 dark:bg-[#08080a]/90 backdrop-blur z-40 border-b border-black/5 dark:border-white/5 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full bg-white/10 dark:bg-black/10 backdrop-blur-sm border border-white/20 dark:border-white/10 text-black dark:text-white shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] hover:bg-white/20 dark:hover:bg-black/20 transition-all hover:scale-110">
          <ChevronLeft size={24} />
        </button>
        <h2 className="text-2xl font-bold text-black dark:text-white flex items-center gap-2">
          <Library className="text-blue-500" />
          All Movie Collections
        </h2>
      </div>
      
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        {collections.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            No movie collections found in your library.
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-6">
            {collections.map((col, i) => (
              <div 
                key={i}
                onClick={() => navigate(`/collection/${col.id}`, { state: { collection: col } })}
                className="group relative cursor-pointer flex flex-col gap-3 transition-transform hover:scale-105"
              >
                <div className="aspect-[2/3] rounded-2xl bg-[#fbf4eb] dark:bg-[#1a1a22] border border-black/5 dark:border-white/5 overflow-hidden relative shadow-xl">
                  {col.poster_path ? (
                    <img src={`https://image.tmdb.org/t/p/w500${col.poster_path}`} alt={col.name} className="absolute inset-0 w-full h-full object-cover z-0" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 bg-[#fbf4eb] dark:bg-[#1a1a22] z-0">
                      <Library size={32} className="mb-2 opacity-50" />
                      <span className="text-xs text-center px-2 line-clamp-2">{col.name}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10"></div>
                  <div className="absolute bottom-2 left-2 z-20 bg-black/60 px-2 py-0.5 rounded text-xs font-bold text-white backdrop-blur">
                    {col.items.length} Movies
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold truncate text-black dark:text-white text-sm">{col.name}</h3>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
