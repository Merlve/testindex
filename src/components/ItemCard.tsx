import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import axios from 'axios';
import { Film, Edit3 } from 'lucide-react';
import { parseMediaName } from '../utils/nameParser';
import { useAuth } from '../context/AuthContext';

export default function ItemCard({ item, category, parentPath, className }: { item: any, category: string, parentPath: string, className?: string }) {
  const [tmdb, setTmdb] = useState<any>(null);
  const { user, token } = useAuth();
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overridePath, setOverridePath] = useState(`${parentPath}/${item.name}`);
  const [overrideCat, setOverrideCat] = useState(category);

  useEffect(() => {
    // Only fetch for directories (shows/movies) or large files
    const fetchTmdb = async () => {
      let searchName = item.name;
      if (/^(s\d+|season\s*\d+)$/i.test(item.name)) {
        const parentParts = parentPath.split('/').filter(Boolean);
        if (parentParts.length > 0) {
          searchName = parentParts[parentParts.length - 1];
        }
      }
      
      let jfYear = '';
      if (item._jf && item._jf.year) {
         jfYear = item._jf.year;
      }
      
      const { cleanName, year } = parseMediaName(searchName);
      const searchYear = jfYear || year;
      
      try {
        let url = `/api/tmdb/search?query=${encodeURIComponent(cleanName)}&type=${category}${searchYear ? `&year=${searchYear}` : ''}`;
        if (item._jf && item._jf.tmdbId) {
            url += `&tmdbId=${item._jf.tmdbId}`;
        }
        
        // If we have a tmdbId from Jellyfin, we could use a specific endpoint, 
        // but for now let's just do search, as that caches well locally.
        const res = await axios.get(url);
        if (res.data && res.data.poster_path) {
          setTmdb(res.data);
        } else if (item._jf && item._jf.tmdbId) {
          // Fallback to fetch by ID if search failed
          const fallbackRes = await axios.get(`/api/tmdb/search_all?query=fallback&type=${category}&tmdbId=${item._jf.tmdbId}`);
          if (fallbackRes.data?.results?.[0]) {
             setTmdb(fallbackRes.data.results[0]);
          } else if (fallbackRes.data && fallbackRes.data.poster_path) {
             setTmdb(fallbackRes.data);
          }
        }
      } catch (err: any) {
        if (err.message !== 'Network Error' && !err.response) {
            console.error("TMDB fetch error", err.message || err);
        }
      }
    };
    fetchTmdb();
  }, [item.name, category, item._jf]);

  const sanitizedPath = `${parentPath}/${item.name}`.replace(/\/\//g, '/').replace(/^\//, '');
  const fullPath = `/${sanitizedPath}`;

  return (
    <>
    <Link to={fullPath.split('/').map(p => encodeURIComponent(p)).join('/')} className={`group relative flex flex-col gap-2 sm:gap-3 transition ${className || 'w-32 sm:w-48 flex-shrink-0'}`}>
      <div className="aspect-[2/3] rounded-xl sm:rounded-2xl bg-[#1a1a22] border border-white/5 overflow-hidden relative shadow-xl sm:shadow-2xl transition-all group-hover:scale-105">
        {tmdb?.poster_path ? (
          <img src={`https://image.tmdb.org/t/p/w500${tmdb.poster_path}`} alt={item.name} className="absolute inset-0 w-full h-full object-cover z-0" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 bg-[#1a1a22] z-0">
            <Film size={32} className="mb-2 opacity-50 sm:w-12 sm:h-12" />
            <span className="text-[10px] sm:text-xs text-center px-2 line-clamp-2">{item.name}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10"></div>
        {tmdb?.vote_average && (
          <div className="absolute top-2 right-2 sm:top-3 sm:right-3 px-1.5 py-0.5 bg-black/60 backdrop-blur rounded text-[10px] font-bold text-yellow-500 z-20">
            {Number(tmdb.vote_average).toFixed(1)}
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
           <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-600 rounded-full flex items-center justify-center shadow-lg shadow-purple-600/40">
             <PlayIcon />
           </div>
        </div>
      </div>
      <div>
        <h3 className="text-xs sm:text-sm font-semibold truncate text-white">{tmdb?.title || tmdb?.name || item.name}</h3>
        <p className="text-[9px] sm:text-[11px] text-gray-400 uppercase tracking-wider font-bold mb-1">{category}</p>
        <p className="text-[9px] sm:text-[10px] text-gray-600 truncate">{fullPath}</p>
      </div>
      {item._jf && user === 'admin' && (
         <button 
            onClick={(e) => { e.preventDefault(); setShowOverrideModal(true); }}
            className="absolute top-2 left-2 bg-black/60 p-1 rounded hover:bg-black/80 text-gray-400 hover:text-white z-30 transition opacity-0 group-hover:opacity-100"
            title="Fix Jellyfin Link"
         >
            <Edit3 size={14} />
         </button>
      )}
    </Link>
    {showOverrideModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowOverrideModal(false)}>
            <div className="bg-[#1a1a22] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-white mb-4">Override Jellyfin Link</h3>
                <div className="mb-4 text-xs text-gray-400">
                   Jellyfin Name: <span className="text-white">{item._jf_name || item.name}</span>
                </div>
                <div className="mb-4">
                    <label className="block text-gray-400 text-sm mb-2">Openlist Path (e.g. /home/SERIES/My Show)</label>
                    <input 
                        className="w-full bg-[#08080a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-600/50" 
                        value={overridePath}
                        onChange={e => setOverridePath(e.target.value)}
                    />
                </div>
                <div className="mb-6">
                    <label className="block text-gray-400 text-sm mb-2">Category</label>
                    <input 
                        className="w-full bg-[#08080a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-600/50" 
                        value={overrideCat}
                        onChange={e => setOverrideCat(e.target.value)}
                    />
                </div>
                <div className="flex gap-3 justify-end">
                    <button onClick={() => setShowOverrideModal(false)} className="px-4 py-2 text-white bg-white/10 hover:bg-white/20 rounded-lg">Cancel</button>
                    <button 
                       onClick={async () => {
                           try {
                               await axios.post('/api/jellyfin/override', {
                                   jfName: item._jf_name || item.name,
                                   openlistPath: overridePath,
                                   category: overrideCat
                               }, { headers: { Authorization: token } });
                               setShowOverrideModal(false);
                               alert('Saved! Please click Fetch on Recently Added to refresh.');
                           } catch(e) {
                               alert('Failed to save override');
                           }
                       }}
                       className="px-4 py-2 text-white bg-purple-600 hover:bg-purple-700 rounded-lg">Save Override</button>
                </div>
            </div>
        </div>
    )}
    </>
  );
}

function PlayIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
  );
}
