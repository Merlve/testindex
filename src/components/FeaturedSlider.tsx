import { useState, useEffect, memo, useMemo } from 'react';
import axios from 'axios';
import { getTmdbImage } from '../utils/tmdbImage';
import { Link, useNavigate } from 'react-router';
import { Play, Star, Cloud } from 'lucide-react';
import { parseMediaName } from '../utils/nameParser';
import { useAuth } from '../context/AuthContext';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCoverflow } from 'swiper/modules';
import { useQuery } from '@tanstack/react-query';
import 'swiper/css';
import 'swiper/css/effect-coverflow';

const COVERFLOW_EFFECT = {
  rotate: 30,
  stretch: 0,
  depth: 100,
  modifier: 1,
  scale: 0.92,
  slideShadows: false,
};

const BREAKPOINTS = {
  640: {
    slidesPerView: 1.25,
  },
  1024: {
    slidesPerView: 1.28,
  }
};

const MODULES = [EffectCoverflow];

export default function FeaturedSlider({ featuredItems }: { featuredItems: any[] }) {
  const navigate = useNavigate();

  const renderedSlides = useMemo(() => {
    if (!featuredItems || featuredItems.length === 0) return null;
    return featuredItems.map((item, idx) => (
      <SwiperSlide key={`${item.id || item.name}-${idx}`} className="h-full rounded-3xl overflow-hidden isolate transform-gpu backface-hidden shadow-xl relative group transition-opacity duration-300 [&:not(.swiper-slide-active)]:opacity-75">
         <div className="w-full h-full transform-gpu">
            <FeaturedSlideCard item={item} />
         </div>
      </SwiperSlide>
    ));
  }, [featuredItems]);

  if (!featuredItems || featuredItems.length === 0) return null;

  return (
    <section className="px-4 sm:px-8 pt-2 sm:pt-4 mb-2 mt-0 sm:mt-2">
       <Swiper
        effect={'coverflow'}
        grabCursor={true}
        centeredSlides={false}
        loop={false}
        slidesPerView={1.22}
        watchSlidesProgress={true}
        speed={400}
        threshold={10}
        preventClicks={false}
        preventClicksPropagation={false}
        touchStartPreventDefault={false}
        simulateTouch={true}
        coverflowEffect={COVERFLOW_EFFECT}
        breakpoints={BREAKPOINTS}
        modules={MODULES}
        className="w-full h-[240px] sm:h-[340px] md:h-[380px] transform-gpu"
      >
        {renderedSlides}
      </Swiper>
    </section>
  );
}

const FeaturedSlideCard = memo(function FeaturedSlideCard({ item }: { item: any }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: tmdb } = useQuery({
    queryKey: ['tmdb', item.name, item.category, item.parentPath],
    queryFn: async () => {
      let searchName = item.name;
      const { cleanName, year } = parseMediaName(searchName);
      const itemPath = item._jf_name ? item._jf_name : item.parentPath ? `${item.parentPath}/${item.name}` : item.name;
      const res = await axios.get(`/api/meta/search?query=${encodeURIComponent(cleanName)}&type=${item.category}${year ? `&year=${year}` : ''}&path=${encodeURIComponent(itemPath)}`);
      return res.data;
    },
    enabled: !!item,
    staleTime: 10 * 1000,
  });

  const backdrop = tmdb?.backdrop_path 
    ? getTmdbImage(tmdb.backdrop_path, 'backdrop') 
    : (tmdb?.poster_path ? getTmdbImage(tmdb.poster_path, 'poster') : null);
    
  const title = tmdb?.title || tmdb?.name || item.name;
  const rating = tmdb?.vote_average ? tmdb.vote_average.toFixed(1) : null;
  const year = tmdb?.release_date 
    ? tmdb.release_date.split('-')[0] 
    : (tmdb?.first_air_date ? tmdb.first_air_date.split('-')[0] : parseMediaName(item.name).year || '');
    
  const genre = tmdb?.genres?.[0]?.name 
    ? tmdb.genres[0].name 
    : (item.category ? item.category.charAt(0).toUpperCase() + item.category.slice(1) : 'Movie');

  const parentClean = (item.parentPath || item._parent || `/home/${item.category}`).replace(/^\/+/, '');
  const targetUrl = `/${parentClean}/${item.name}`.replace(/\/+/g, '/').split('/').map(p => encodeURIComponent(p)).join('/');

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(targetUrl, { state: { item, tmdbData: tmdb } });
  };

  return (
    <div 
      onClick={handleCardClick}
      className="relative w-full h-full bg-[#121216] select-none rounded-3xl overflow-hidden isolate transform-gpu backface-hidden shadow-lg border border-white/10 group cursor-pointer"
    >
       {backdrop ? (
         <img src={backdrop} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={title} loading="eager" />
       ) : (
         <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-gray-900 to-black flex items-center justify-center p-6 text-center">
            <span className="text-2xl font-bold text-white/40 italic">{title}</span>
         </div>
       )}

       {/* Gradient Overlay */}
       <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20 z-10"></div>
       <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-transparent z-10"></div>

       {/* Top Badges */}
       <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
          <span className="px-3.5 py-1.5 bg-black/70 text-white text-xs sm:text-sm font-semibold rounded-2xl border border-white/15 shadow-md">
            {genre}
          </span>
          <div className="flex items-center gap-2">
            {user === 'admin' && tmdb?._synced && (
              <span 
                className="px-2.5 py-1.5 bg-black/85  text-sky-400 text-xs sm:text-sm font-bold rounded-2xl border border-sky-400/30 shadow-md flex items-center gap-1.5"
                title="Metadata synced to database (Cached)"
              >
                <Cloud size={14} className="fill-sky-400/20 text-sky-400" />
                <span className="hidden sm:inline text-[11px] font-semibold text-sky-300">Synced</span>
              </span>
            )}
            {rating && (
              <span className="px-3 py-1.5 bg-black/70 text-white text-xs sm:text-sm font-bold rounded-2xl border border-white/15 shadow-md flex items-center gap-1">
                <Star size={14} className="fill-amber-400 text-amber-400" />
                {rating}
              </span>
            )}
          </div>
       </div>
       
       {/* Bottom Content */}
       <div className="absolute bottom-0 left-0 right-0 z-20 p-5 sm:p-8 flex flex-col justify-end">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-white line-clamp-1 group-hover:text-amber-300 transition-colors">{title}</h1>
          
          <div className="flex items-center gap-2 mt-1 sm:mt-2 text-xs sm:text-sm text-gray-300 font-medium">
             <span>{genre}</span>
             {year && (
               <>
                 <span>•</span>
                 <span>{year}</span>
               </>
             )}
          </div>

          <div className="flex items-center gap-4 mt-4">
            <button 
              type="button"
              onClick={handleCardClick}
              className="cursor-pointer relative z-30 px-5 py-2 sm:px-7 sm:py-3 bg-white text-black font-bold rounded-2xl flex items-center gap-2 hover:bg-gray-100 group-hover:bg-amber-400 transition-colors text-xs sm:text-sm shadow-xl active:scale-95"
            >
              <Play fill="currentColor" className="w-4 h-4 sm:w-5 sm:h-5" /> Watch Now
            </button>
          </div>
       </div>
    </div>
  );
});
