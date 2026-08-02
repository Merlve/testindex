import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import axios from 'axios';
import { ChevronLeft, CheckCircle2, Film, Tv } from 'lucide-react';
import { motion } from 'framer-motion';

const ActorSkeleton = () => (
  <div className="-mt-16 min-h-[calc(100vh+4rem)] bg-[#fffcf9] dark:bg-[#08080a] pb-20 animate-pulse">
    {/* Hero Banner Skeleton */}
    <div className="w-full h-[50vh] md:h-[65vh] bg-black/5 dark:bg-zinc-900/60 relative flex items-center justify-center">
      <div className="w-36 h-36 md:w-52 md:h-52 rounded-full bg-black/10 dark:bg-white/10 shadow-inner"></div>
    </div>
    
    {/* Content Skeleton */}
    <div className="max-w-4xl mx-auto px-6 -mt-16 relative z-10 pb-12">
      {/* Name Skeleton */}
      <div className="w-56 md:w-80 h-9 md:h-12 bg-black/10 dark:bg-white/10 rounded-2xl mx-auto mb-6"></div>
      
      {/* Biography Skeleton */}
      <div className="space-y-2.5 mb-10 max-w-2xl mx-auto">
        <div className="w-full h-4 bg-black/5 dark:bg-white/5 rounded-md"></div>
        <div className="w-11/12 h-4 bg-black/5 dark:bg-white/5 rounded-md"></div>
        <div className="w-4/5 h-4 bg-black/5 dark:bg-white/5 rounded-md"></div>
      </div>

      {/* Movies Carousel Skeleton */}
      <div className="mb-10">
        <div className="w-32 h-7 bg-black/10 dark:bg-white/10 rounded-lg mb-4"></div>
        <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex-shrink-0 w-32 md:w-40">
              <div className="w-full aspect-[2/3] rounded-2xl bg-black/5 dark:bg-white/5 mb-2"></div>
              <div className="w-3/4 h-4 bg-black/10 dark:bg-white/10 rounded mb-1"></div>
              <div className="w-1/2 h-3 bg-black/5 dark:bg-white/5 rounded"></div>
            </div>
          ))}
        </div>
      </div>

      {/* TV Shows Carousel Skeleton */}
      <div>
        <div className="w-32 h-7 bg-black/10 dark:bg-white/10 rounded-lg mb-4"></div>
        <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex-shrink-0 w-32 md:w-40">
              <div className="w-full aspect-[2/3] rounded-2xl bg-black/5 dark:bg-white/5 mb-2"></div>
              <div className="w-3/4 h-4 bg-black/10 dark:bg-white/10 rounded mb-1"></div>
              <div className="w-1/2 h-3 bg-black/5 dark:bg-white/5 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default function Actor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [actor, setActor] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      setLoading(true);
      axios.get(`/api/meta/person?id=${id}`)
        .then(res => {
          setActor(res.data);
        })
        .catch(err => {
          console.error("Failed to load actor metadata", err);
        })
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) {
    return <ActorSkeleton />;
  }

  if (!actor) {
    return (
      <div className="min-h-screen bg-[#fffcf9] dark:bg-[#08080a] flex flex-col items-center justify-center p-6 text-center">
        <p className="text-gray-500 mb-4">Actor details not found.</p>
        <button 
          onClick={() => navigate(-1)} 
          className="px-4 py-2 bg-black/10 dark:bg-white/10 rounded-xl text-sm font-semibold hover:bg-black/20 dark:hover:bg-white/20 transition"
        >
          Go Back
        </button>
      </div>
    );
  }

  const handleMediaClick = (item: any) => {
    if (item._path) {
      const parts = item._path.split('/').map((p: string) => encodeURIComponent(p)).join('/');
      navigate(`/home/${parts}`);
    } else {
      const isTv = item.media_type === 'tv' || (!item.media_type && item.name && !item.title);
      const category = isTv ? 'SERIES' : 'MOVIES';
      const rawTitle = isTv ? (item.name || item.original_name) : (item.title || item.original_title || item.name);
      const dateStr = item.release_date || item.first_air_date || '';
      const year = dateStr.substring(0, 4);
      const folderName = year ? `${rawTitle} (${year})` : rawTitle;
      
      navigate(`/home/${category}/${encodeURIComponent(folderName)}`);
    }
  };

  const movies = (actor.available_credits || []).filter((c: any) => c.media_type === 'movie' && c._path);
  const shows = (actor.available_credits || []).filter((c: any) => c.media_type === 'tv' && c._path);

  const hasMedia = movies.length > 0 || shows.length > 0;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="-mt-16 min-h-[calc(100vh+4rem)] bg-[#fffcf9] dark:bg-[#08080a] pb-20 relative"
    >
      {/* Hero Header */}
      <div className="relative">
        <div className="w-full h-[60vh] md:h-[70vh] relative overflow-hidden flex justify-center bg-gray-200 dark:bg-zinc-900">
           {actor.profile_path ? (
              <img 
                src={`https://image.tmdb.org/t/p/original${actor.profile_path}`}
                alt={actor.name}
                className="w-full h-full object-cover md:object-contain"
                referrerPolicy="no-referrer"
              />
           ) : (
              <div className="w-full h-full flex items-center justify-center">
                  <span className="text-4xl text-gray-400 font-bold">{actor.name}</span>
              </div>
           )}
           <div className="absolute inset-0 bg-gradient-to-t from-[#fffcf9] dark:from-[#08080a] via-[#fffcf9]/20 dark:via-[#08080a]/50 to-transparent"></div>
           <div className="absolute inset-0 bg-gradient-to-b from-black/30 dark:from-black/50 via-transparent to-transparent"></div>
        </div>
      </div>

      {/* Main Profile Content */}
      <div className="max-w-4xl mx-auto px-6 -mt-16 relative z-10 pb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold text-black dark:text-white mb-4 text-center tracking-tight">
          {actor.name}
        </h1>
        
        {actor.biography && (
          <p className="text-gray-600 dark:text-gray-300 text-sm md:text-base leading-relaxed mb-10 line-clamp-4 hover:line-clamp-none transition-all duration-300 cursor-pointer text-center md:text-left">
            {actor.biography}
          </p>
        )}

        {/* Empty State */}
        {!hasMedia && (
          <div className="text-center py-12 px-4 rounded-3xl bg-black/5 dark:bg-white/5 backdrop-blur border border-black/5 dark:border-white/5">
            <p className="text-gray-600 dark:text-gray-400 font-medium text-base">
              No movies or TV shows featuring <span className="font-bold text-black dark:text-white">{actor.name}</span> were found in your Openlist library.
            </p>
          </div>
        )}

        {/* Movies Carousel */}
        {movies.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <Film size={20} className="text-purple-500" />
              <h2 className="text-xl font-bold text-black dark:text-white">Movies</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">
                {movies.length}
              </span>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
              {movies.map((item: any) => {
                const title = item.title || item.original_title || 'Untitled';
                return (
                  <div 
                    key={item.credit_id || `movie-${item.id}`} 
                    className="cursor-pointer group flex-shrink-0 w-32 md:w-40"
                    onClick={() => handleMediaClick(item)}
                  >
                    <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden bg-gray-200 dark:bg-zinc-800 shadow-md relative mb-2 group-hover:scale-105 group-hover:shadow-xl transition-all duration-300">
                      {item.poster_path ? (
                        <img 
                          src={`https://image.tmdb.org/t/p/w342${item.poster_path}`}
                          alt={title}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-4 text-center">
                          <span className="text-sm font-bold text-gray-500">{title}</span>
                        </div>
                      )}
                      {item._path && (
                        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-purple-600/90 backdrop-blur rounded-md text-[9px] font-bold text-white flex items-center gap-1 shadow">
                          <CheckCircle2 size={10} />
                          <span>Library</span>
                        </div>
                      )}
                      {item.vote_average > 0 && (
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/75 backdrop-blur rounded-md text-[9px] font-bold text-yellow-400">
                          {Number(item.vote_average).toFixed(1)}
                        </div>
                      )}
                    </div>
                    <h3 className="font-bold text-sm text-black dark:text-white leading-tight truncate group-hover:text-purple-500 transition-colors">
                      {title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {item.character || item.job || (item.release_date ? item.release_date.substring(0, 4) : '')}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TV Shows Carousel */}
        {shows.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <Tv size={20} className="text-purple-500" />
              <h2 className="text-xl font-bold text-black dark:text-white">TV Shows</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">
                {shows.length}
              </span>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
              {shows.map((item: any) => {
                const showName = item.name || item.original_name || 'Untitled Show';
                return (
                  <div 
                    key={item.credit_id || `show-${item.id}`} 
                    className="cursor-pointer group flex-shrink-0 w-32 md:w-40"
                    onClick={() => handleMediaClick(item)}
                  >
                    <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden bg-gray-200 dark:bg-zinc-800 shadow-md relative mb-2 group-hover:scale-105 group-hover:shadow-xl transition-all duration-300">
                      {item.poster_path ? (
                        <img 
                          src={`https://image.tmdb.org/t/p/w342${item.poster_path}`}
                          alt={showName}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-4 text-center">
                          <span className="text-sm font-bold text-gray-500">{showName}</span>
                        </div>
                      )}
                      {item._path && (
                        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-purple-600/90 backdrop-blur rounded-md text-[9px] font-bold text-white flex items-center gap-1 shadow">
                          <CheckCircle2 size={10} />
                          <span>Library</span>
                        </div>
                      )}
                      {item.vote_average > 0 && (
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/75 backdrop-blur rounded-md text-[9px] font-bold text-yellow-400">
                          {Number(item.vote_average).toFixed(1)}
                        </div>
                      )}
                    </div>
                    <h3 className="font-bold text-sm text-black dark:text-white leading-tight truncate group-hover:text-purple-500 transition-colors">
                      {showName}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {item.character || item.job || (item.first_air_date ? item.first_air_date.substring(0, 4) : '')}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
