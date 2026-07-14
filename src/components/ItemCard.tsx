import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import axios from 'axios';
import { Film } from 'lucide-react';
import { parseMediaName } from '../utils/nameParser';

export default function ItemCard({ item, category, parentPath, className }: { item: any, category: string, parentPath: string, className?: string }) {
  const [tmdb, setTmdb] = useState<any>(null);

  useEffect(() => {
    // Only fetch for directories (shows/movies) or large files
    const fetchTmdb = async () => {
      // Clean up the name a bit (remove extension if file, remove years etc)
      let searchName = item.name;
      if (/^(s\d+|season\s*\d+)$/i.test(item.name)) {
        const parentParts = parentPath.split('/').filter(Boolean);
        if (parentParts.length > 0) {
          searchName = parentParts[parentParts.length - 1];
        }
      }
      const { cleanName, year } = parseMediaName(searchName);
      try {
        const res = await axios.get(`/api/tmdb/search?query=${encodeURIComponent(cleanName)}&type=${category}${year ? `&year=${year}` : ''}`);
        if (res.data && res.data.poster_path) {
          setTmdb(res.data);
        }
      } catch (err: any) {
        if (err.message !== 'Network Error' && !err.response) {
            console.error("TMDB fetch error", err.message || err);
        }
      }
    };
    fetchTmdb();
  }, [item.name, category]);

  const sanitizedPath = `${parentPath}/${item.name}`.replace(/\/\//g, '/').replace(/^\//, '');
  const fullPath = `/${sanitizedPath}`;

  return (
    <Link to={`${fullPath}`} className={`group relative flex flex-col gap-2 sm:gap-3 transition ${className || 'w-32 sm:w-48 flex-shrink-0'}`}>
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
    </Link>
  );
}

function PlayIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
  );
}
