import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Film, ChevronLeft } from 'lucide-react';

interface GenreBackdrop {
  id: number;
  name: string;
  backdrop_path: string;
}

export default function GenresList() {
  const [genres, setGenres] = useState<GenreBackdrop[]>([]);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchGenres = async () => {
      try {
        const res = await axios.get('/api/meta/genres/backdrops', {
          headers: { Authorization: token }
        });
        if (res.data.success && res.data.genres) {
          setGenres(res.data.genres);
        }
      } catch (error) {
        console.error('Failed to fetch genres backdrops', error);
      } finally {
        setLoading(false);
      }
    };
    if (token) fetchGenres();
  }, [token]);

  if (loading) {
    return (
      <div className="animate-pulse p-4 sm:p-12 min-h-screen pb-20 pt-24 bg-[#fffcf9] dark:bg-[#08080a]">
        <div className="w-48 sm:w-64 h-10 bg-black/10 dark:bg-white/10 rounded-xl mb-8"></div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-6">
           {[...Array(18)].map((_, i) => (
              <div key={i} className="w-full aspect-video bg-black/5 dark:bg-white/5 rounded-2xl"></div>
           ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-[#fffcf9] dark:bg-[#08080a] p-4 sm:p-12 pb-20 pt-24"
    >
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 sm:p-3 rounded-full bg-white/10 dark:bg-black/10 backdrop-blur-sm border border-white/20 dark:border-white/10 text-black dark:text-white shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] hover:bg-white/20 dark:hover:bg-black/20 transition-all hover:scale-110">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black dark:text-white tracking-tight flex items-center gap-3">
             <Film className="text-blue-500" size={32} />
             All Genres
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-6">
        {genres.map(genre => (
          <button
            key={genre.id}
            onClick={() => navigate(`/genre/${genre.id}?name=${encodeURIComponent(genre.name)}`)}
            className="relative w-full aspect-video rounded-2xl overflow-hidden group hover:scale-105 transition-all shadow-md cursor-pointer border border-black/10 dark:border-white/10"
          >
            <img 
              src={`https://image.tmdb.org/t/p/w500${genre.backdrop_path}`} 
              alt={genre.name}
              className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center p-2">
              <span className="text-white font-extrabold text-lg sm:text-xl md:text-2xl tracking-tight drop-shadow-lg text-center z-10">
                {genre.name}
              </span>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
