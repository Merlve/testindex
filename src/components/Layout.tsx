import { AnimatePresence, motion } from "motion/react";
import { Outlet, NavLink, useNavigate, Link, useLocation, useNavigationType, useOutlet } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { Film, Tv, Folder, Clapperboard, Home, Compass, Settings, LogOut, Sun, Moon, Search, Menu, ChevronLeft, ChevronRight, X, Bookmark, Users, WifiOff, Activity, Sparkles } from 'lucide-react';
import { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import SearchModal from './SearchModal';
import NavbarSearch from './NavbarSearch';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import ScrollToTopButton from './ScrollToTopButton';



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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [isUnderlyingDark, setIsUnderlyingDark] = useState(false);

  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });

  const checkLuminance = useCallback(() => {
    if (typeof window === 'undefined') return;
    const navElement = document.getElementById('floating-search-btn') || document.getElementById('floating-top-right-nav');
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
      const timer = setTimeout(() => {
        setIsCollapsed(true);
      }, 3000);
      sessionStorage.removeItem('justLoggedIn');
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      if (themeMeta) themeMeta.setAttribute('content', '#08080a');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      if (themeMeta) themeMeta.setAttribute('content', '#fffcf9');
    }
  }, [isDark]);

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
          isIdle && !mobileOpen ? '-translate-y-24 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
        }`}
      >
        <button 
          onClick={() => setIsDark(!isDark)} 
          className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition text-current"
          title="Toggle theme"
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button 
          onClick={() => setSearchOpen(true)} 
          className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition text-current flex items-center gap-1.5"
          title="Search"
        >
          <Search size={20} />
        </button>
        <button 
          onClick={() => setMobileOpen(true)} 
          className="md:hidden p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition text-current"
          title="Open menu"
        >
          <Menu size={22} />
        </button>
      </div>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed md:relative top-0 left-0 h-full bg-[#f3efec] dark:bg-[#0d0d12] flex flex-col py-6 border-r border-black/5 dark:border-white/5 z-50 transition-all duration-500
          ${mobileOpen 
            ? 'w-64 px-4 translate-x-0 opacity-100 pointer-events-auto' 
            : 'w-64 px-4 -translate-x-full opacity-0 pointer-events-none'}
          ${!isIdle && !mobileOpen
            ? 'md:w-0 md:border-none md:overflow-hidden md:opacity-0 md:pointer-events-none md:px-0 md:translate-x-0' 
            : (isCollapsed ? 'md:w-20 md:px-2 md:opacity-100 md:pointer-events-auto md:translate-x-0' : 'md:w-64 md:px-4 md:opacity-100 md:pointer-events-auto md:translate-x-0')}
        `}
      >
        <div className={`flex items-center justify-between px-2 mb-8 shrink-0 ${isCollapsed ? 'md:flex-col md:items-center md:gap-6 md:px-0' : ''}`}>
            <Link to="/" onClick={() => setMobileOpen(false)}>
              <h1 className="text-xl font-bold text-black dark:text-white flex items-center gap-3 tracking-tight">
                <SiteLogo size="md" />
                <span className={isCollapsed ? 'inline md:hidden' : 'inline'}>SHUTTER!</span>
              </h1>
            </Link>
            <button 
              className="hidden md:flex text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
              onClick={() => setIsCollapsed(!isCollapsed)}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>
            <button 
              className="md:hidden text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
              onClick={() => setMobileOpen(false)}
              title="Close sidebar"
            >
              <X size={24} />
            </button>
          </div>
          
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <nav className="space-y-1">
            <div className={`text-gray-600 dark:text-gray-400 text-[10px] font-bold px-4 mb-2 mt-6 uppercase tracking-widest ${isCollapsed ? 'block md:hidden' : 'block'}`}>Menu</div>
            <div className={`mt-6 ${isCollapsed ? 'h-4 block md:block' : 'hidden'}`}></div>
            
            <NavLink to="/" end onClick={() => setMobileOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-start px-4 md:justify-center md:px-0' : 'justify-start px-4'} ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
              <Home size={20} className="shrink-0" /> <span className={isCollapsed ? 'inline md:hidden' : 'inline'}>Home</span>
            </NavLink>
            <button onClick={() => { setSearchOpen(true); setMobileOpen(false); }} className={`w-full flex items-center gap-3 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent transition-all cursor-pointer ${isCollapsed ? 'justify-start px-4 md:justify-center md:px-0' : 'justify-start px-4'}`}>
              <Search size={20} className="shrink-0" /> <span className={isCollapsed ? 'inline md:hidden' : 'inline'}>Search</span>
            </button>
            <NavLink to="/watchlist" onClick={() => setMobileOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-start px-4 md:justify-center md:px-0' : 'justify-start px-4'} ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
              <Bookmark size={20} className="shrink-0" /> <span className={isCollapsed ? 'inline md:hidden' : 'inline'}>Watchlist</span>
            </NavLink>
            <NavLink to="/recommendations" onClick={() => setMobileOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-start px-4 md:justify-center md:px-0' : 'justify-start px-4'} ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
              <Sparkles size={20} className="shrink-0" /> <span className={isCollapsed ? 'inline md:hidden' : 'inline'}>For You</span>
            </NavLink>
            
            <div className={`text-gray-600 dark:text-gray-400 text-[10px] font-bold px-4 mb-2 mt-8 uppercase tracking-widest ${isCollapsed ? 'block md:hidden' : 'block'}`}>Categories</div>
            <div className={`mt-8 ${isCollapsed ? 'h-4 block md:block' : 'hidden'}`}></div>
            
            {categories.map((cat: string) => {
              let Icon = Folder;
              const lower = cat.toLowerCase();
              if (lower.includes('movie')) Icon = Film;
              else if (lower.includes('series') || lower.includes('tv')) Icon = Tv;
              else if (lower.includes('anime')) Icon = Clapperboard;
              else if (lower.includes('drama')) Icon = Compass;
              
              return (
                <NavLink key={cat} to={`/category/${cat}`} onClick={() => setMobileOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-start px-4 md:justify-center md:px-0' : 'justify-start px-4'} ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
                  <Icon size={20} className="shrink-0" /> <span className={`capitalize ${isCollapsed ? 'inline md:hidden' : 'inline'}`}>{lower}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="space-y-1 shrink-0 mt-4">
          {user === 'admin' && (
            <>
              <NavLink to="/users" onClick={() => setMobileOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-start px-4 md:justify-center md:px-0' : 'justify-start px-4'} ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
                <Users size={20} className="shrink-0" /> <span className={isCollapsed ? 'inline md:hidden' : 'inline'}>Users</span>
              </NavLink>
              <NavLink to="/admin?tab=logs" onClick={() => setMobileOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-start px-4 md:justify-center md:px-0' : 'justify-start px-4'} ${location.search.includes('tab=logs') ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
                <Activity size={20} className="shrink-0" /> <span className={isCollapsed ? 'inline md:hidden' : 'inline'}>Logs</span>
              </NavLink>
              <NavLink to="/admin" onClick={() => setMobileOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-start px-4 md:justify-center md:px-0' : 'justify-start px-4'} ${isActive && !location.search.includes('tab=logs') ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
                <Settings size={20} className="shrink-0" /> <span className={isCollapsed ? 'inline md:hidden' : 'inline'}>Settings</span>
              </NavLink>
            </>
          )}
          <button onClick={() => { logout(); queryClient.clear(); navigate('/login'); }} className={`w-full flex items-center gap-3 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent transition-all cursor-pointer ${isCollapsed ? 'justify-start px-4 md:justify-center md:px-0' : 'justify-start px-4'}`}>
            <LogOut size={20} className="shrink-0" /> <span className={isCollapsed ? 'inline md:hidden' : 'inline'}>Logout</span>
          </button>
          <div className={`mt-4 flex items-center gap-3 border-t border-black/5 dark:border-white/5 pt-4 ${isCollapsed ? 'justify-start px-4 md:justify-center md:px-0' : 'justify-start px-4'}`}>
             <div className="w-8 h-8 rounded-full bg-purple-900 border border-purple-600/30 overflow-hidden shrink-0"><div className="w-full h-full bg-[#1e293b] flex items-center justify-center text-[10px] text-purple-400 font-bold">{user?.substring(0, 3).toUpperCase() || 'USR'}</div></div>
             <div className={`text-sm font-medium text-gray-700 dark:text-gray-300 truncate ${isCollapsed ? 'inline md:hidden' : 'inline'}`}>{user}</div>
          </div>
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

        {/* Floating Search Circle Button (All Devices) */}
        <button
          id="floating-search-btn"
          onClick={() => setSearchOpen(true)}
          title="Search"
          aria-label="Search"
          className={`fixed bottom-20 right-6 md:bottom-24 md:right-8 z-50 w-12 h-12 md:w-14 md:h-14 rounded-full border backdrop-blur-xl backdrop-saturate-[180%] transition-all duration-300 ease-in-out hover:scale-110 active:scale-95 flex items-center justify-center cursor-pointer ${
            isUnderlyingDark 
              ? 'bg-neutral-900/60 border-white/25 text-white shadow-[0_8px_32px_0_rgba(0,0,0,0.4),inset_0_1px_1px_0_rgba(255,255,255,0.3)] dark:bg-black/60 dark:border-white/20 dark:text-white' 
              : 'bg-white/50 border-white/60 text-gray-900 shadow-[0_8px_32px_0_rgba(31,38,135,0.18),inset_0_1px_1px_0_rgba(255,255,255,0.7)] dark:bg-black/60 dark:border-white/20 dark:text-white'
          } ${mobileOpen || isIdle ? 'opacity-0 pointer-events-none translate-y-4' : 'opacity-100 translate-y-0'}`}
        >
          <Search size={22} />
        </button>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
