import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Film } from 'lucide-react';

interface GenreBackdrop {
  id: number;
  name: string;
  backdrop_path: string;
}

export default function GenresCarousel() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const fetchGenres = async () => {
    const res = await axios.get('/api/meta/genres/backdrops', {
      headers: { Authorization: token }
    });
    if (res.data.success && res.data.genres) {
      return res.data.genres;
    }
    return [];
  };

  const { data: genres = [], isLoading: loading } = useQuery({
    queryKey: ['genresCarousel', token],
    queryFn: fetchGenres,
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  });

  if (loading || genres.length === 0) return null;

  return (
    <div className="relative">
      <div className="flex justify-between items-end mb-2">
        <h3 className="text-lg font-bold text-black dark:text-white flex items-center gap-2">
          <Film className="text-blue-500" size={20} />
          Genres
        </h3>
        <div className="flex gap-2 items-center">
          <Link to="/genres" className="text-xs text-purple-400 hover:text-purple-300 font-bold uppercase tracking-wider mr-2">View All</Link>
          <div onClick={(e) => (e.currentTarget.parentElement?.parentElement?.nextElementSibling as HTMLElement)?.scrollBy({ left: -400, behavior: 'smooth' })} className="w-8 h-8 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center hover:bg-black/5 dark:bg-white/5 cursor-pointer text-black dark:text-white transition">
            <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
          </div>
          <div onClick={(e) => (e.currentTarget.parentElement?.parentElement?.nextElementSibling as HTMLElement)?.scrollBy({ left: 400, behavior: 'smooth' })} className="w-8 h-8 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center hover:bg-black/5 dark:bg-white/5 cursor-pointer text-black dark:text-white transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
          </div>
        </div>
      </div>
      <div className="flex overflow-x-auto gap-4 pb-2 scrollbar-hide">
        {genres.map(genre => (
          <button
            key={genre.id}
            onClick={() => navigate(`/genre/${genre.id}?name=${encodeURIComponent(genre.name)}`)}
            className="relative w-32 h-20 sm:w-56 sm:h-32 flex-shrink-0 rounded-2xl overflow-hidden group hover:scale-105 transition-all shadow-md cursor-pointer border border-black/10 dark:border-white/10"
          >
            <img 
              src={`https://image.tmdb.org/t/p/w500${genre.backdrop_path}`} 
              alt={genre.name}
              className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <span className="text-white font-extrabold text-lg sm:text-xl tracking-tight drop-shadow-lg text-center px-2 z-10">
                {genre.name}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
