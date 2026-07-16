import { useEffect } from 'react';

const isTVDevice = () => {
  if (typeof window === 'undefined' || !window.navigator) return false;
  const ua = window.navigator.userAgent.toLowerCase();
  // Check common TV user agents
  return /(tizen|webos|smart-tv|smarttv|bravia|netcast|viera|vidaa|hisense|shield|aft|android tv|appletv|roku|firetv|mibox|chromecast|google tv)/i.test(ua);
};

export function useKeyboardNavigation() {
  useEffect(() => {
    if (!isTVDevice()) return;

    const makeNavigable = () => {
      const elements = document.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      elements.forEach(el => {
        if (!el.classList.contains('focus-navigable')) {
          el.classList.add('focus-navigable', 'focus:ring-4', 'focus:ring-purple-500/60', 'focus:outline-none', 'focus:shadow-[0_0_25px_rgba(168,85,247,0.7)]', 'focus:-translate-y-1', 'transition-all', 'duration-300');
        }
      });
    };
    
    makeNavigable();
    const observer = new MutationObserver(() => makeNavigable());
    observer.observe(document.body, { childList: true, subtree: true });
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input/textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      const active = document.activeElement as HTMLElement;
      
      // We only handle grid traversal if currently focused element is navigable
      if (active && active.classList.contains('focus-navigable')) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          const elements = Array.from(document.querySelectorAll('.focus-navigable')) as HTMLElement[];
          const currentIndex = elements.indexOf(active);
          if (currentIndex === -1) return;

          const activeRect = active.getBoundingClientRect();

          if (e.key === 'ArrowRight') {
            const right = elements.filter(el => el.getBoundingClientRect().left >= activeRect.right - 20);
            if (right.length > 0) {
              const minLeft = Math.min(...right.map(el => el.getBoundingClientRect().left));
              const nextCol = right.filter(el => el.getBoundingClientRect().left <= minLeft + 20);
              let closest = nextCol[0];
              let minDiff = Math.abs(closest.getBoundingClientRect().top - activeRect.top);
              for (const el of nextCol) {
                const diff = Math.abs(el.getBoundingClientRect().top - activeRect.top);
                if (diff < minDiff) { minDiff = diff; closest = el; }
              }
              closest.focus();
            }
          } else if (e.key === 'ArrowLeft') {
            const left = elements.filter(el => el.getBoundingClientRect().right <= activeRect.left + 20);
            if (left.length > 0) {
              const maxRight = Math.max(...left.map(el => el.getBoundingClientRect().right));
              const prevCol = left.filter(el => el.getBoundingClientRect().right >= maxRight - 20);
              let closest = prevCol[0];
              let minDiff = Math.abs(closest.getBoundingClientRect().top - activeRect.top);
              for (const el of prevCol) {
                const diff = Math.abs(el.getBoundingClientRect().top - activeRect.top);
                if (diff < minDiff) { minDiff = diff; closest = el; }
              }
              closest.focus();
            }
          } else if (e.key === 'ArrowDown') {
            // Find elements below
            const below = elements.filter(el => {
               const rect = el.getBoundingClientRect();
               return rect.top >= activeRect.bottom - 20; // 20px tolerance
            });
            if (below.length > 0) {
               // Next row's top
               const minTop = Math.min(...below.map(el => el.getBoundingClientRect().top));
               const nextRow = below.filter(el => el.getBoundingClientRect().top <= minTop + 20);
               
               // Closest left
               let closest = nextRow[0];
               let minDiff = Math.abs(closest.getBoundingClientRect().left - activeRect.left);
               for (const el of nextRow) {
                  const diff = Math.abs(el.getBoundingClientRect().left - activeRect.left);
                  if (diff < minDiff) {
                     minDiff = diff;
                     closest = el;
                  }
               }
               closest.focus();
            }
          } else if (e.key === 'ArrowUp') {
            // Find elements above
            const above = elements.filter(el => {
               const rect = el.getBoundingClientRect();
               return rect.bottom <= activeRect.top + 20;
            });
            if (above.length > 0) {
               // Previous row's bottom
               const maxBottom = Math.max(...above.map(el => el.getBoundingClientRect().bottom));
               const prevRow = above.filter(el => el.getBoundingClientRect().bottom >= maxBottom - 20);
               
               // Closest left
               let closest = prevRow[0];
               let minDiff = Math.abs(closest.getBoundingClientRect().left - activeRect.left);
               for (const el of prevRow) {
                  const diff = Math.abs(el.getBoundingClientRect().left - activeRect.left);
                  if (diff < minDiff) {
                     minDiff = diff;
                     closest = el;
                  }
               }
               closest.focus();
            }
          }
        }
      } else {
        // If nothing is focused (body) and user presses an arrow key, focus the first navigable element
        if (active === document.body || active === document.documentElement) {
          if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
             const elements = document.querySelectorAll('.focus-navigable') as NodeListOf<HTMLElement>;
             if (elements.length > 0) {
                if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                  e.preventDefault();
                  elements[0].focus();
                }
             }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      observer.disconnect();
    };
  }, []);
}
