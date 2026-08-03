import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { User, Film, Tv, Star, ChevronDown, ChevronUp } from 'lucide-react';

interface PersonData {
  id: number;
  name: string;
  biography?: string;
  profile_path?: string | null;
  birthday?: string;
  place_of_birth?: string;
}

interface MediaItem {
  id: number | string;
  title: string;
  openlistName: string;
  category: string;
  path: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number | null;
  release_date: string;
  character: string;
  media_type: 'movie' | 'tv';
}

import { motion } from 'motion/react';

export default function PersonDetails() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const nameQuery = searchParams.get('name') || undefined;
  const navigate = useNavigate();
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [person, setPerson] = useState<PersonData | null>(null);
  const [movies, setMovies] = useState<MediaItem[]>([]);
  const [shows, setShows] = useState<MediaItem[]>([]);
  const [bioExpanded, setBioExpanded] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    const q = nameQuery ? `?name=${encodeURIComponent(nameQuery)}` : '';
    axios.get(`/api/meta/person/${id}${q}`, {
      headers: { Authorization: token || '' }
    })
      .then(res => {
        if (res.data) {
          setPerson(res.data.person || null);
          setMovies(Array.isArray(res.data.movies) ? res.data.movies : []);
          setShows(Array.isArray(res.data.shows) ? res.data.shows : []);
        }
      })
      .catch(err => {
        console.error('Failed to load person details:', err);
        setPerson(null);
        setMovies([]);
        setShows([]);
      })
      .finally(() => setLoading(false));
  }, [id, nameQuery, token]);

  const profileUrl = person?.profile_path
    ? (person.profile_path.startsWith('http')
        ? person.profile_path
        : `https://image.tmdb.org/t/p/w500${person.profile_path}`)
    : null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="min-h-screen bg-[#fffcf9] dark:bg-[#08080a] text-gray-900 dark:text-gray-100 px-4 sm:px-6 pt-1 pb-10 max-w-6xl mx-auto"
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center py-10 animate-pulse">
          <div className="w-52 h-72 sm:w-64 sm:h-80 rounded-3xl bg-black/10 dark:bg-white/10 mb-4" />
          <div className="w-48 h-8 rounded-lg bg-black/10 dark:bg-white/10 mb-3" />
          <div className="w-full max-w-xl h-16 rounded-xl bg-black/10 dark:bg-white/10" />
        </div>
      ) : person || nameQuery ? (
        <div>
          {/* ACTOR PORTRAIT */}
          <div className="flex flex-col items-center text-center mb-6 pt-1">
            <div className="w-48 h-64 sm:w-60 sm:h-80 md:w-64 md:h-88 relative rounded-3xl overflow-hidden bg-black/10 dark:bg-white/10 border border-black/10 dark:border-white/10 shadow-xl mb-4">
              {profileUrl ? (
                <img
                  src={profileUrl}
                  alt={person?.name || nameQuery || 'Actor'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-900/30 to-slate-800/50 text-gray-400">
                  <User size={64} className="opacity-50 mb-2" />
                  <span className="text-sm font-semibold">{person?.name || nameQuery}</span>
                </div>
              )}
            </div>

            {/* ACTOR NAME */}
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
              {person?.name || nameQuery}
            </h1>

            {/* BIOGRAPHY */}
            {person?.biography ? (
              <div className="max-w-2xl mt-3 px-2 text-center">
                <p
                  className={`text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line ${
                    !bioExpanded ? 'line-clamp-3' : ''
                  }`}
                >
                  {person.biography}
                </p>
                {person.biography.length > 150 && (
                  <button
                    onClick={() => setBioExpanded(!bioExpanded)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline mt-1 focus:outline-none"
                  >
                    {bioExpanded ? (
                      <>
                        Show Less <ChevronUp size={14} />
                      </>
                    ) : (
                      <>
                        Read More <ChevronDown size={14} />
                      </>
                    )}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-2 italic">
                No biography available.
              </p>
            )}
          </div>

          {/* MOVIES SECTION */}
          {movies.length > 0 && (
            <div className="mt-8 mb-8">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Movies
              </h2>
              <div className="flex gap-4 overflow-x-auto pb-4 pt-1 scrollbar-none snap-x">
                {movies.map((item) => {
                  const poster = item.poster_path
                    ? (item.poster_path.startsWith('http')
                        ? item.poster_path
                        : `https://image.tmdb.org/t/p/w500${item.poster_path}`)
                    : null;

                  return (
                    <div
                      key={item.path}
                      onClick={() => navigate(encodeURI(item.path))}
                      className="w-32 sm:w-40 md:w-44 shrink-0 cursor-pointer group snap-start"
                    >
                      <div className="aspect-[2/3] w-full relative rounded-2xl overflow-hidden bg-black/10 dark:bg-white/10 shadow-md group-hover:shadow-2xl group-hover:scale-105 transition-all duration-300 border border-black/5 dark:border-white/5">
                        {poster ? (
                          <img
                            src={poster}
                            alt={item.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-black/5 dark:bg-white/5 p-2 text-center">
                            <Film size={28} className="text-gray-400 mb-1" />
                            <span className="text-xs text-gray-500 font-medium line-clamp-2">{item.title}</span>
                          </div>
                        )}
                        {item.vote_average ? (
                          <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/70 backdrop-blur rounded text-[10px] font-bold text-yellow-500 flex items-center gap-0.5">
                            <Star size={10} className="fill-current" />
                            {Number(item.vote_average).toFixed(1)}
                          </div>
                        ) : null}
                      </div>

                      <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white mt-2 line-clamp-2 leading-snug group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                        {item.title}
                      </h3>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TV SHOWS SECTION */}
          {shows.length > 0 && (
            <div className="mt-8 mb-8">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-4">
                TV Shows
              </h2>
              <div className="flex gap-4 overflow-x-auto pb-4 pt-1 scrollbar-none snap-x">
                {shows.map((item) => {
                  const poster = item.poster_path
                    ? (item.poster_path.startsWith('http')
                        ? item.poster_path
                        : `https://image.tmdb.org/t/p/w500${item.poster_path}`)
                    : null;

                  return (
                    <div
                      key={item.path}
                      onClick={() => navigate(encodeURI(item.path))}
                      className="w-32 sm:w-40 md:w-44 shrink-0 cursor-pointer group snap-start"
                    >
                      <div className="aspect-[2/3] w-full relative rounded-2xl overflow-hidden bg-black/10 dark:bg-white/10 shadow-md group-hover:shadow-2xl group-hover:scale-105 transition-all duration-300 border border-black/5 dark:border-white/5">
                        {poster ? (
                          <img
                            src={poster}
                            alt={item.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-black/5 dark:bg-white/5 p-2 text-center">
                            <Tv size={28} className="text-gray-400 mb-1" />
                            <span className="text-xs text-gray-500 font-medium line-clamp-2">{item.title}</span>
                          </div>
                        )}
                        {item.vote_average ? (
                          <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/70 backdrop-blur rounded text-[10px] font-bold text-yellow-500 flex items-center gap-0.5">
                            <Star size={10} className="fill-current" />
                            {Number(item.vote_average).toFixed(1)}
                          </div>
                        ) : null}
                      </div>

                      <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white mt-2 line-clamp-2 leading-snug group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                        {item.title}
                      </h3>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* EMPTY STATE IF NO OPENLIST MOVIES OR SHOWS */}
          {movies.length === 0 && shows.length === 0 && (
            <div className="text-center py-12 px-4 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5 mt-8 max-w-lg mx-auto">
              <Film size={40} className="mx-auto text-gray-400 mb-3 opacity-60" />
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                No titles starring {person?.name || nameQuery} are currently available in your Openlist library.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-20 text-gray-500">
          Person not found.
        </div>
      )}
    </motion.div>
  );
}
