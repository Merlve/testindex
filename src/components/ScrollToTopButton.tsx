import { useState, useEffect } from 'react';
import { useLocation } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp } from 'lucide-react';

export default function ScrollToTopButton({ scrollRef }: { scrollRef: React.RefObject<HTMLElement> }) {
  const [isVisible, setIsVisible] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      if (scrollRef.current) {
        setIsVisible(scrollRef.current.scrollTop > 500);
      }
    };
    
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', handleScroll, { passive: true });
      // Check immediately
      handleScroll();
    }
    
    return () => {
      if (el) {
        el.removeEventListener('scroll', handleScroll);
      }
    };
  }, [scrollRef, location.pathname]);

  const scrollToTop = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Check if current route is Dashboard, Genre, or Search results
  const isDashboard = location.pathname === '/';
  const isGenre = location.pathname.startsWith('/genre/');
  const isSearchResults = location.pathname.startsWith('/category/search');

  if (!isDashboard && !isGenre && !isSearchResults) {
    return null;
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.button
          initial={{ opacity: 0, y: 20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onClick={scrollToTop}
          className="fixed bottom-24 right-6 md:bottom-8 md:right-8 z-50 p-3 bg-purple-600 hover:bg-purple-500 text-white rounded-full shadow-lg hover:shadow-purple-500/25 transition-colors group"
          aria-label="Scroll to top"
        >
          <ArrowUp size={24} className="group-hover:-translate-y-1 transition-transform" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
