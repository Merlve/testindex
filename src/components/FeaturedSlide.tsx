import { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router';
import { Play } from 'lucide-react';
import { parseMediaName } from '../utils/nameParser';

export default function FeaturedSlide({ featured, slideIndex, totalSlides }: { featured: any, slideIndex: number, totalSlides: number }) {
  const [tmdb, setTmdb] = useState<any>(null);

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
  const overview = tmdb?.overview || 'Explore the latest additions to your library. High quality streaming available instantly.';

  return (
    <section className="px-4 sm:px-8 pt-4 mb-8 mt-4">
      <div className="relative h-[250px] sm:h-[320px] rounded-3xl overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-r from-[#08080a]/90 via-[#08080a]/60 to-transparent z-10"></div>
        <div className="absolute inset-0 bg-[#121216] flex items-center justify-center text-white/5 text-7xl sm:text-9xl font-black italic select-none">
          {featured.name.toUpperCase()}
        </div>
        
        {backdrop && (
          <img src={backdrop} className="absolute inset-0 w-full h-full object-cover opacity-60 z-0" alt="Backdrop" />
        )}
        
        <div className="relative z-20 h-full flex flex-col justify-center px-6 sm:px-12">
          <span className="inline-block px-3 py-1 bg-purple-600 text-white text-[10px] font-bold rounded-full mb-4 w-fit tracking-wider">FEATURED</span>
          <h1 className="text-3xl sm:text-5xl font-bold mb-4 tracking-tight text-white line-clamp-1">{title}</h1>
          <p className="text-gray-300 max-w-xl text-xs sm:text-sm leading-relaxed mb-8 hidden sm:block line-clamp-3">
            {overview}
          </p>
          <div className="flex items-center gap-4">
            <Link to={`/home/${featured.category}/${featured.name}`} className="px-6 py-2 sm:px-8 sm:py-3 bg-white text-black font-bold rounded-xl flex items-center gap-2 hover:scale-105 transition-transform text-sm sm:text-base">
              <Play fill="currentColor" size={20} /> Watch Now
            </Link>
            <Link to={`/home/${featured.category}/${featured.name}`} className="px-6 py-2 sm:px-8 sm:py-3 bg-white/10 backdrop-blur-md text-white font-bold rounded-xl border border-white/20 flex items-center gap-2 hover:bg-white/20 transition-all hidden sm:flex text-sm sm:text-base">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              Download
            </Link>
          </div>
        </div>
        
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-30">
          {Array.from({ length: totalSlides }).map((_, idx) => (
            <div key={idx} className={`w-2 h-2 rounded-full transition-all ${idx === slideIndex ? 'bg-white scale-125' : 'bg-white/30'}`} />
          ))}
        </div>
      </div>
    </section>
  );
}
