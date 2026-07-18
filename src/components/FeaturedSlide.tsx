import { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router';
import { Play } from 'lucide-react';
import { parseMediaName } from '../utils/nameParser';
import { motion, AnimatePresence } from 'motion/react';

export default function FeaturedSlide({ featured, slideIndex, totalSlides, onNext, onPrev, onSetSlide }: { featured: any, slideIndex: number, totalSlides: number, onNext?: () => void, onPrev?: () => void, onSetSlide?: (idx: number) => void }) {
  const [tmdb, setTmdb] = useState<any>(null);
  
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;

  useEffect(() => {
    const fetchTmdb = async () => {
      let searchName = featured.name;
      const { cleanName, year } = parseMediaName(searchName);
      try {
        const res = await axios.get(`/api/tmdb/search?query=${encodeURIComponent(cleanName)}&type=${featured.category}${year ? `&year=${year}` : ''}`);
        if (res.data) {
          setTmdb(res.data);
        }
      } catch (err) {
        console.error("TMDB fetch error for featured", err);
      }
    };
    if (featured) {
      fetchTmdb();
    }
  }, [featured]);

  if (!featured) return null;

  const backdrop = tmdb?.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}` : null;
  const title = tmdb?.title || tmdb?.name || featured.name;

  const onTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    setTouchEnd(null);
    if ('targetTouches' in e) {
      setTouchStart(e.targetTouches[0].clientX);
    } else {
      setTouchStart((e as React.MouseEvent).clientX);
    }
  };

  const onTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if ('targetTouches' in e) {
      setTouchEnd(e.targetTouches[0].clientX);
    } else {
      if (touchStart !== null) {
        setTouchEnd((e as React.MouseEvent).clientX);
      }
    }
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe && onNext) {
      onNext();
    } else if (isRightSwipe && onPrev) {
      onPrev();
    }
    setTouchStart(null);
    setTouchEnd(null);
  };

  const onMouseLeave = () => {
    if (touchStart !== null) {
        setTouchStart(null);
        setTouchEnd(null);
    }
  };

  return (
    <section className="px-4 sm:px-8 pt-4 mb-8 mt-4">
      <div 
        className="relative h-[250px] sm:h-[320px] rounded-3xl overflow-hidden group cursor-grab active:cursor-grabbing"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onTouchStart}
        onMouseMove={onTouchMove}
        onMouseUp={onTouchEnd}
        onMouseLeave={onMouseLeave}
      >
        <div className="absolute inset-0 bg-[#f0e6da] dark:bg-[#121216] flex items-center justify-center text-black/5 dark:text-white/5 text-7xl sm:text-9xl font-black italic select-none pointer-events-none">
          {featured.name.toUpperCase()}
        </div>
        <AnimatePresence mode="popLayout">
          <motion.div 
            key={slideIndex}
            initial={{ opacity: 0.5, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0.5, scale: 1.02 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 pointer-events-none"
          >
            {backdrop && (
              <img src={backdrop} className="absolute inset-0 w-full h-full object-cover opacity-60 z-0" alt="Backdrop" />
            )}
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-r from-[#fffcf9] dark:from-[#08080a]/90 via-[#fffcf9]/60 dark:via-[#08080a]/60 to-transparent z-10 pointer-events-none"></div>
        
        <div className="relative z-20 h-full flex flex-col justify-center px-6 sm:px-12">
          <span className="inline-block px-3 py-1 bg-purple-300 dark:bg-purple-600 text-black dark:text-white text-[10px] font-bold rounded-full mb-4 w-fit tracking-wider pointer-events-none">FEATURED</span>
          <h1 className="text-3xl sm:text-5xl font-bold mb-4 tracking-tight text-black dark:text-white line-clamp-1 pointer-events-none">{title}</h1>
          
          <div className="flex items-center gap-4 mt-8 pointer-events-auto">
            <Link to={`/home/${encodeURIComponent(featured.category)}/${encodeURIComponent(featured.name)}`} className="px-6 py-2 sm:px-8 sm:py-3 bg-white text-black font-bold rounded-xl flex items-center gap-2 hover:scale-105 transition-transform text-sm sm:text-base">
              <Play fill="currentColor" size={20} /> Watch Now
            </Link>
            <Link to={`/home/${encodeURIComponent(featured.category)}/${encodeURIComponent(featured.name)}`} className="px-6 py-2 sm:px-8 sm:py-3 bg-black/10 dark:bg-white/10 backdrop-blur-md text-black dark:text-white font-bold rounded-xl border border-black/20 dark:border-white/20 flex items-center gap-2 hover:bg-black/20 dark:bg-white/20 transition-all hidden sm:flex text-sm sm:text-base">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              Download
            </Link>
          </div>
        </div>
        
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-30 pointer-events-auto">
          {Array.from({ length: totalSlides }).map((_, idx) => (
            <div key={idx} onClick={() => onSetSlide && onSetSlide(idx)} className={`w-2 h-2 rounded-full transition-all cursor-pointer ${idx === slideIndex ? 'bg-white scale-125' : 'bg-white/30 hover:bg-white/50'}`} />
          ))}
        </div>
      </div>
    </section>
  );
}
