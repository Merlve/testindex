import { useState, useEffect } from 'react';
import { useLocation } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowUp } from 'lucide-react';

export default function ScrollToTopButton({ scrollRef }: { scrollRef?: React.RefObject<HTMLElement | null> }) {
  const [isVisible, setIsVisible] = useState(false);
  const location = useLocation();
  const [dominantStyles, setDominantStyles] = useState<{
    accent: string;
    glow: string;
    border: string;
    text: string;
  } | null>(null);

  // Monitor scroll position
  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY || document.documentElement.scrollTop || (scrollRef?.current ? scrollRef.current.scrollTop : 0);
      setIsVisible(scrollPos > 500);
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    const el = scrollRef?.current;
    if (el) {
      el.addEventListener('scroll', handleScroll, { passive: true });
    }
    // Check immediately
    handleScroll();
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (el) {
        el.removeEventListener('scroll', handleScroll);
      }
    };
  }, [scrollRef, location.pathname]);

  // Synchronize dominant palette from active details page
  useEffect(() => {
    const updateDominantStyles = () => {
      const root = document.documentElement;
      const detailsRoot = document.querySelector<HTMLElement>('.details-page-root');
      
      const accent = root.style.getPropertyValue('--details-accent') 
        || detailsRoot?.style.getPropertyValue('--details-accent')
        || (detailsRoot ? getComputedStyle(detailsRoot).getPropertyValue('--details-accent') : '');
      
      const glow = root.style.getPropertyValue('--details-glow')
        || detailsRoot?.style.getPropertyValue('--details-glow')
        || (detailsRoot ? getComputedStyle(detailsRoot).getPropertyValue('--details-glow') : '');

      const border = root.style.getPropertyValue('--details-border')
        || detailsRoot?.style.getPropertyValue('--details-border')
        || (detailsRoot ? getComputedStyle(detailsRoot).getPropertyValue('--details-border') : '');

      const text = root.style.getPropertyValue('--details-text-primary')
        || detailsRoot?.style.getPropertyValue('--details-text-primary')
        || (detailsRoot ? getComputedStyle(detailsRoot).getPropertyValue('--details-text-primary') : '');

      if (accent && accent.trim()) {
        setDominantStyles({
          accent: accent.trim(),
          glow: glow?.trim() || 'rgba(0, 0, 0, 0.25)',
          border: border?.trim() || 'rgba(255, 255, 255, 0.2)',
          text: text?.trim() || '#ffffff',
        });
      } else {
        setDominantStyles(null);
      }
    };

    updateDominantStyles();

    // Observe documentElement style changes (when Details.tsx syncs its extracted palette)
    const observer = new MutationObserver(updateDominantStyles);
    observer.observe(document.documentElement, { 
      attributes: true, 
      attributeFilter: ['style', 'data-details-active', 'class'] 
    });

    const detailsEl = document.querySelector('.details-page-root');
    if (detailsEl) {
      observer.observe(detailsEl, { attributes: true, attributeFilter: ['style'] });
    }

    return () => {
      observer.disconnect();
    };
  }, [location.pathname]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (scrollRef?.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.button
          initial={{ opacity: 0, y: 20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.8 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onClick={scrollToTop}
          style={dominantStyles ? {
            backgroundColor: dominantStyles.accent,
            color: dominantStyles.text,
            borderColor: dominantStyles.border,
            boxShadow: `0 10px 25px -5px ${dominantStyles.glow}, 0 8px 10px -6px rgba(0, 0, 0, 0.35)`,
          } : undefined}
          className={`fixed bottom-6 right-6 md:bottom-8 md:right-8 z-50 w-12 h-12 md:w-14 md:h-14 rounded-full border shadow-lg transition-all duration-300 flex items-center justify-center group cursor-pointer backdrop-blur-sm ${
            !dominantStyles ? 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400/20 hover:shadow-purple-500/25' : 'hover:brightness-110'
          }`}
          aria-label="Scroll to top"
        >
          <ArrowUp size={24} className="group-hover:-translate-y-1 transition-transform" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
