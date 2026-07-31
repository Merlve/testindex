import { AnimatePresence, motion } from "motion/react";
import { Outlet, NavLink, useNavigate, Link, useLocation, useNavigationType, useOutlet } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { Film, Tv, Folder, Clapperboard, Home, Compass, Settings, LogOut, Sun, Moon, Search, Menu, ChevronLeft, ChevronRight, X, Bookmark, Users, WifiOff, Activity, Sparkles, User, Monitor, Library } from 'lucide-react';
import { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import SearchModal from './SearchModal';
import NavbarSearch from './NavbarSearch';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import ScrollToTopButton from './ScrollToTopButton';
import ThemeToggle from './ThemeToggle';



function ScrollRestorer({ 
  scrollKey, 
  locationPathAndSearch, 
  mainRef, 
  navigationType 
}: { 
  scrollKey: string, 
  locationPathAndSearch: string, 
  mainRef: React.RefObject<HTMLElement>, 
  navigationType: string 
}) { 
  const isRestoredRef = useRef(false);
  const isProgrammaticRef = useRef(false);

  useLayoutEffect(() => {
    if (!mainRef.current) return;
    const el = mainRef.current;
    
    // Stop recording scroll events during navigation state change
    isRestoredRef.current = false;

    if (navigationType !== 'POP') {
      isProgrammaticRef.current = true;
      el.scrollTop = 0;
      isRestoredRef.current = true;
      const t = setTimeout(() => {
        isProgrammaticRef.current = false;
      }, 50);
      return () => clearTimeout(t);
    }

    const savedKeyStr = sessionStorage.getItem(`scroll-key-${scrollKey}`);
    const savedPathStr = sessionStorage.getItem(`scroll-path-${locationPathAndSearch}`);
    const savedScrollStr = savedKeyStr || savedPathStr;

    if (!savedScrollStr) {
      isProgrammaticRef.current = true;
      el.scrollTop = 0;
      isRestoredRef.current = true;
      const t = setTimeout(() => {
        isProgrammaticRef.current = false;
      }, 50);
      return () => clearTimeout(t);
    }

    const targetScroll = parseInt(savedScrollStr, 10);

    const attemptRestore = () => {
      if (!mainRef.current) return false;
      const currentEl = mainRef.current;
      if (targetScroll === 0 || currentEl.scrollHeight >= targetScroll + currentEl.clientHeight - 100) {
        isProgrammaticRef.current = true;
        currentEl.scrollTop = targetScroll;
        isRestoredRef.current = true;
        setTimeout(() => {
          isProgrammaticRef.current = false;
        }, 50);
        return true;
      }
      return false;
    };

    if (attemptRestore()) return;

    const observer = new MutationObserver(() => {
      if (attemptRestore()) {
        observer.disconnect();
      }
    });

    observer.observe(el, { childList: true, subtree: true, characterData: true });

    const timeout = setTimeout(() => {
      observer.disconnect();
      if (!isRestoredRef.current && mainRef.current) {
        isProgrammaticRef.current = true;
        mainRef.current.scrollTop = targetScroll;
        isRestoredRef.current = true;
        setTimeout(() => {
          isProgrammaticRef.current = false;
        }, 50);
      }
    }, 1500);

    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [scrollKey, locationPathAndSearch, mainRef, navigationType]);

  useEffect(() => {
    const handleScroll = () => {
      if (mainRef.current && isRestoredRef.current && !isProgrammaticRef.current) {
        const pos = mainRef.current.scrollTop.toString();
        sessionStorage.setItem(`scroll-key-${scrollKey}`, pos);
        sessionStorage.setItem(`scroll-path-${locationPathAndSearch}`, pos);
      }
    };

    const mainEl = mainRef.current;
    if (mainEl) {
      mainEl.addEventListener('scroll', handleScroll, { passive: true });
    }
    return () => {
      if (mainEl) {
        mainEl.removeEventListener('scroll', handleScroll);
      }
    };
  }, [scrollKey, locationPathAndSearch, mainRef]);

  return null;
}

const SiteLogo = ({ size = 'sm' }: { size?: 'sm' | 'md' }) => {
  const logoUrl = import.meta.env.VITE_SITE_LOGO;
  const isSmall = size === 'sm';
  
  if (logoUrl) {
    return (
      <div className={`${isSmall ? 'w-8 h-8' : 'w-10 h-10'} shrink-0`}>
        <img src={logoUrl} alt="Logo" className="w-full h-full object-contain rounded-xl" />
      </div>
    );
  }
  
  return (
    <div className={`${isSmall ? 'w-8 h-8' : 'w-10 h-10'} bg-gradient-to-tr from-purple-600 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-600/20 shrink-0`}>
      <span className={`font-bold text-black dark:text-white ${isSmall ? 'text-lg' : 'text-xl'}`}>S</span>
    </div>
  );
};

export default function Layout() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const navigationType = useNavigationType();
  const outlet = useOutlet();
  const mainRef = useRef<HTMLElement>(null);
  




  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [isUnderlyingDark, setIsUnderlyingDark] = useState(false);
  const [isNavExpanded, setIsNavExpanded] = useState(true);

  const checkLuminance = useCallback(() => {
    if (typeof window === 'undefined') return;
    const navElement = document.getElementById('bottom-nav-bar') || document.getElementById('floating-top-right-nav');
    if (!navElement) return;

    const rect = navElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const pointX = rect.left + rect.width / 2;
    const pointY = rect.top + rect.height / 2;

    const elements = document.elementsFromPoint(pointX, pointY);
    const underlyingElement = elements.find(el => !navElement.contains(el) && el !== navElement);

    if (!underlyingElement) {
      setIsUnderlyingDark(false);
      return;
    }

    let isDarkBg = false;
    let curr: HTMLElement | null = underlyingElement as HTMLElement;

    while (curr && curr !== document.body && curr !== document.documentElement) {
      const tagName = curr.tagName.toUpperCase();
      
      if (
        tagName === 'IMG' ||
        tagName === 'VIDEO' ||
        tagName === 'CANVAS' ||
        curr.classList.contains('bg-black') ||
        curr.classList.contains('bg-neutral-900') ||
        curr.classList.contains('bg-dark') ||
        curr.classList.contains('bg-purple-950')
      ) {
        isDarkBg = true;
        break;
      }

      const style = window.getComputedStyle(curr);
      const bg = style.backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (match) {
          const r = parseInt(match[1], 10);
          const g = parseInt(match[2], 10);
          const b = parseInt(match[3], 10);
          const a = match[4] !== undefined ? parseFloat(match[4]) : 1;

          if (a > 0.15) {
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            if (brightness < 140) {
              isDarkBg = true;
            }
            break;
          }
        }
      }
      curr = curr.parentElement;
    }

    setIsUnderlyingDark(isDarkBg);
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem('justLoggedIn') === 'true') {
      sessionStorage.removeItem('justLoggedIn');
    }
  }, []);

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const handleUserActivity = () => {
      setIsIdle(false);
      checkLuminance();
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        setIsIdle(true);
      }, 3500);
    };

    const events = [
      'mousemove',
      'mousedown',
      'mouseup',
      'touchstart',
      'touchmove',
      'touchend',
      'scroll',
      'keydown',
      'wheel',
      'pointermove',
      'pointerdown'
    ];

    events.forEach(eventName => {
      window.addEventListener(eventName, handleUserActivity, { capture: true, passive: true });
    });

    checkLuminance();

    timeout = setTimeout(() => {
      setIsIdle(true);
    }, 3500);

    return () => {
      events.forEach(eventName => {
        window.removeEventListener(eventName, handleUserActivity, { capture: true });
      });
      clearTimeout(timeout);
    };
  }, [checkLuminance]);

  useEffect(() => {
    setIsIdle(false);
    const timer = setTimeout(() => checkLuminance(), 100);
    return () => clearTimeout(timer);
  }, [location.pathname, location.search, checkLuminance]);

  useEffect(() => {
    const handleScroll = () => {
      if (mainRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = mainRef.current;
        const isTop = scrollTop < 50;
        const isBottom = scrollHeight - scrollTop - clientHeight < 50;
        setIsNavExpanded(isTop || isBottom);
      }
    };
    const mainEl = mainRef.current;
    if (mainEl) {
      mainEl.addEventListener('scroll', handleScroll, { passive: true });
      handleScroll();
    }
    return () => {
      if (mainEl) {
        mainEl.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  const { data: categories = [] } = useQuery({
    queryKey: ['layout-categories'],
    queryFn: async () => {
      const res = await axios.post('/api/fs/list', { reqPath: '/home' }, { headers: { Authorization: token } });
      if (res.data.code !== 200) return [];
      const content = res.data.data.content || [];
      return content.filter((c: any) => c.is_dir).map((c: any) => c.name);
    },
    enabled: !!token,
  });

  return (
    <div className="flex h-screen bg-[#fffcf9] dark:bg-[#08080a] text-gray-900 dark:text-gray-100 font-sans overflow-hidden">

      {/* Floating Top Left Brand Pill (Persistent) */}
      <div 
        id="floating-top-left-nav"
        className={`fixed top-4 left-4 md:left-6 z-40 flex items-center gap-2.5 px-3.5 py-2 rounded-full border backdrop-blur-xl backdrop-saturate-[180%] transition-all duration-300 ease-in-out ${
          isUnderlyingDark 
            ? 'bg-neutral-900/60 border-white/25 text-white shadow-[0_8px_32px_0_rgba(0,0,0,0.4),inset_0_1px_1px_0_rgba(255,255,255,0.3)] dark:bg-black/60 dark:border-white/20 dark:text-white' 
            : 'bg-white/50 border-white/60 text-gray-900 shadow-[0_8px_32px_0_rgba(31,38,135,0.18),inset_0_1px_1px_0_rgba(255,255,255,0.7)] dark:bg-black/60 dark:border-white/20 dark:text-white'
        }`}
      >
        <Link to="/" className="flex items-center gap-2.5">
          <SiteLogo size="sm" />
          <span className="font-bold tracking-tight text-sm">SHUTTER!</span>
        </Link>
      </div>


      {/* Floating Top Right Action Pill (Hides on idle) */}
      <div 
        id="floating-top-right-nav"
        className={`fixed top-4 right-4 md:right-6 z-40 flex items-center gap-3 px-3.5 py-2 rounded-full border backdrop-blur-xl backdrop-saturate-[180%] transition-all duration-300 ease-in-out ${
          isUnderlyingDark 
            ? 'bg-neutral-900/60 border-white/25 text-white shadow-[0_8px_32px_0_rgba(0,0,0,0.4),inset_0_1px_1px_0_rgba(255,255,255,0.3)] dark:bg-black/60 dark:border-white/20 dark:text-white' 
            : 'bg-white/50 border-white/60 text-gray-900 shadow-[0_8px_32px_0_rgba(31,38,135,0.18),inset_0_1px_1px_0_rgba(255,255,255,0.7)] dark:bg-black/60 dark:border-white/20 dark:text-white'
        } ${
          isIdle && !sidebarOpen ? '-translate-y-24 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
        }`}
      >
        <ThemeToggle isUnderlyingDark={isUnderlyingDark} align="right" />
        <button 
          onClick={() => setSearchOpen(true)} 
          className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition text-current flex items-center gap-1.5 cursor-pointer"
          title="Search"
        >
          <Search size={20} />
        </button>
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)} 
          className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition text-current cursor-pointer"
          title={sidebarOpen ? "Close menu" : "Open menu"}
        >
          {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Overlay Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Drawer */}
      <aside 
        className={`fixed top-0 left-0 h-full w-64 bg-[#f3efec] dark:bg-[#0d0d12] flex flex-col py-6 border-r border-black/5 dark:border-white/5 z-50 transition-all duration-300 ease-in-out px-4 ${
          sidebarOpen 
            ? 'translate-x-0 opacity-100 pointer-events-auto shadow-2xl' 
            : '-translate-x-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between px-2 mb-8 shrink-0">
          <Link to="/" onClick={() => setSidebarOpen(false)}>
            <h1 className="text-xl font-bold text-black dark:text-white flex items-center gap-3 tracking-tight">
              <SiteLogo size="md" />
              <span>SHUTTER!</span>
            </h1>
          </Link>
          <button 
            className="text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => setSidebarOpen(false)}
            title="Close sidebar"
          >
            <X size={24} />
          </button>
        </div>
          
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <nav className="space-y-1">
            <div className="text-gray-600 dark:text-gray-400 text-[10px] font-bold px-4 mb-2 mt-6 uppercase tracking-widest block">Menu</div>
            
            <NavLink to="/" end onClick={() => setSidebarOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all justify-start px-4 ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
              <Home size={20} className="shrink-0" /> <span>Home</span>
            </NavLink>
            <button onClick={() => { setSearchOpen(true); setSidebarOpen(false); }} className="w-full flex items-center gap-3 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent transition-all cursor-pointer justify-start px-4">
              <Search size={20} className="shrink-0" /> <span>Search</span>
            </button>
            <NavLink to="/collections" onClick={() => setSidebarOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all justify-start px-4 ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
              <Library size={20} className="shrink-0" /> <span>Collections</span>
            </NavLink>
            <NavLink to="/watchlist" onClick={() => setSidebarOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all justify-start px-4 ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
              <Bookmark size={20} className="shrink-0" /> <span>Watchlist</span>
            </NavLink>
            <NavLink to="/recommendations" onClick={() => setSidebarOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all justify-start px-4 ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
              <Sparkles size={20} className="shrink-0" /> <span>For You</span>
            </NavLink>
            <NavLink to="/profile" onClick={() => setSidebarOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all justify-start px-4 ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
              <User size={20} className="shrink-0" /> <span>Profile & Stats</span>
            </NavLink>
            
            <div className="text-gray-600 dark:text-gray-400 text-[10px] font-bold px-4 mb-2 mt-8 uppercase tracking-widest block">Categories</div>
            
            {categories.map((cat: string) => {
              let Icon = Folder;
              const lower = cat.toLowerCase();
              if (lower.includes('movie')) Icon = Film;
              else if (lower.includes('series') || lower.includes('tv')) Icon = Tv;
              else if (lower.includes('anime')) Icon = Clapperboard;
              else if (lower.includes('drama')) Icon = Compass;
              
              return (
                <NavLink key={cat} to={`/category/${cat}`} onClick={() => setSidebarOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all justify-start px-4 ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
                  <Icon size={20} className="shrink-0" /> <span className="capitalize">{lower}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="space-y-1 shrink-0 mt-4">
          {user === 'admin' && (
            <>
              <NavLink to="/users" onClick={() => setSidebarOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all justify-start px-4 ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
                <Users size={20} className="shrink-0" /> <span>Users</span>
              </NavLink>
              <NavLink to="/admin?tab=logs" onClick={() => setSidebarOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all justify-start px-4 ${location.search.includes('tab=logs') ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
                <Activity size={20} className="shrink-0" /> <span>Logs</span>
              </NavLink>
              <NavLink to="/admin" onClick={() => setSidebarOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all justify-start px-4 ${isActive && !location.search.includes('tab=logs') ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
                <Settings size={20} className="shrink-0" /> <span>Settings</span>
              </NavLink>
            </>
          )}
          <button onClick={() => { logout(); queryClient.clear(); navigate('/login'); }} className="w-full flex items-center gap-3 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent transition-all cursor-pointer justify-start px-4">
            <LogOut size={20} className="shrink-0" /> <span>Logout</span>
          </button>
          <NavLink 
            to="/profile" 
            onClick={() => setSidebarOpen(false)}
            className={({isActive}) => `mt-4 flex items-center gap-3 border-t border-black/5 dark:border-white/5 pt-4 justify-start px-3 py-2 rounded-2xl transition-all group hover:bg-black/5 dark:hover:bg-white/5 ${isActive ? 'bg-purple-600/10 border-purple-600/30' : ''}`}
            title="View User Profile & Stats"
          >
             <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 p-0.5 shadow-md shrink-0 group-hover:scale-105 transition-transform">
               <div className="w-full h-full bg-[#1e293b] rounded-full flex items-center justify-center text-[10px] text-purple-300 font-bold uppercase">
                 {user?.substring(0, 3).toUpperCase() || 'USR'}
               </div>
             </div>
             <div className="flex-1 min-w-0 text-left">
               <div className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate group-hover:text-purple-400 transition-colors">{user}</div>
               <div className="text-[10px] text-gray-500 dark:text-gray-400">View Profile & Stats</div>
             </div>
             <ChevronRight size={16} className="text-gray-400 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all shrink-0" />
          </NavLink>
        </div>
      </aside>

      {/* Main Content */}
      <main ref={mainRef} className="flex-1 overflow-y-auto relative bg-[#fffcf9] dark:bg-[#08080a] pt-16">
        <ScrollRestorer 
          scrollKey={location.key} 
          locationPathAndSearch={location.pathname + location.search} 
          mainRef={mainRef} 
          navigationType={navigationType} 
        />
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-full min-h-full"
          >
            {outlet}
          </motion.div>
        </AnimatePresence>

        <ScrollToTopButton scrollRef={mainRef} />
      </main>

        {/* Dynamic Bottom Navigation Bar (Home Page Only) */}
        {location.pathname === '/' && (
          <div id="bottom-nav-bar" className={`fixed bottom-6 left-6 md:bottom-8 md:left-8 z-50 flex items-center transition-all duration-300 ${sidebarOpen || isIdle ? 'opacity-0 pointer-events-none translate-y-4' : 'opacity-100 translate-y-0'}`}>
            <motion.div 
              layout
              className={`flex items-center gap-1 overflow-hidden transition-all duration-500 ease-in-out rounded-full border backdrop-blur-xl backdrop-saturate-[180%] ${
                 isUnderlyingDark
                   ? 'bg-neutral-900/60 border-white/25 text-white shadow-[0_8px_32px_0_rgba(0,0,0,0.4),inset_0_1px_1px_0_rgba(255,255,255,0.3)] dark:bg-black/60 dark:border-white/20 dark:text-white' 
                   : 'bg-white/50 border-white/60 text-gray-900 shadow-[0_8px_32px_0_rgba(31,38,135,0.18),inset_0_1px_1px_0_rgba(255,255,255,0.7)] dark:bg-black/60 dark:border-white/20 dark:text-white'
              }`}
              style={{
                padding: isNavExpanded ? '6px' : '4px',
              }}
            >
               <button 
                 onClick={() => { if(!isNavExpanded){ mainRef.current?.scrollTo({top:0, behavior:'smooth'}) } else { navigate('/'); } }} 
                 className={`flex items-center justify-center rounded-full transition-all hover:bg-black/10 dark:hover:bg-white/10 ${isNavExpanded ? 'w-10 h-10 md:w-12 md:h-12' : 'w-10 h-10 md:w-12 md:h-12'} shrink-0`} 
                 title="Home"
               >
                 <Home size={isNavExpanded ? 20 : 22} />
               </button>

               <AnimatePresence>
                 {isNavExpanded && (
                   <motion.div
                     initial={{ width: 0, opacity: 0 }}
                     animate={{ width: "auto", opacity: 1 }}
                     exit={{ width: 0, opacity: 0 }}
                     transition={{ duration: 0.3 }}
                     className="flex items-center gap-1 overflow-hidden"
                   >
                     <button onClick={() => navigate('/collections')} className="flex items-center justify-center h-10 px-3.5 md:h-12 md:px-4 rounded-full transition-all hover:bg-black/10 dark:hover:bg-white/10 shrink-0 gap-2 font-semibold text-sm" title="Collections">
                       <Library size={20} />
                       <span>Collections</span>
                     </button>
                     <button onClick={() => setSearchOpen(true)} className="flex items-center justify-center h-10 px-3.5 md:h-12 md:px-4 rounded-full transition-all hover:bg-black/10 dark:hover:bg-white/10 shrink-0 gap-2 font-semibold text-sm" title="Search">
                       <Search size={20} />
                       <span>Search</span>
                     </button>
                   </motion.div>
                 )}
               </AnimatePresence>
            </motion.div>
          </div>
        )}

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
