import { AnimatePresence, motion } from "motion/react";
import { Outlet, NavLink, useNavigate, Link, useLocation, useNavigationType, useOutlet } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { Film, Tv, Folder, Clapperboard, Home, Compass, Settings, LogOut, Sun, Moon, Search, Menu, ChevronLeft, ChevronRight, X, Bookmark, Users, WifiOff, Activity, Sparkles } from 'lucide-react';
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import SearchModal from './SearchModal';
import NavbarSearch from './NavbarSearch';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import ScrollToTopButton from './ScrollToTopButton';



function ScrollRestorer({ scrollKey, mainRef }: { scrollKey: string, mainRef: React.RefObject<HTMLElement> }) {
  const navigationType = useNavigationType();
  useLayoutEffect(() => {
    if (!mainRef.current) return;
    const el = mainRef.current;
    
    if (navigationType !== 'POP') {
      el.scrollTop = 0;
      return;
    }
    
    const savedScrollStr = sessionStorage.getItem(`scroll-${scrollKey}`);
    if (!savedScrollStr) {
      el.scrollTop = 0;
      return;
    }
    
    const targetScroll = parseInt(savedScrollStr, 10);
    
    const attemptRestore = () => {
      if (el.scrollHeight >= targetScroll + el.clientHeight || targetScroll === 0) {
        el.scrollTop = targetScroll;
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
      el.scrollTop = targetScroll;
    }, 2000);
    
    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [scrollKey, mainRef, navigationType]);
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
  const outlet = useOutlet();
  const mainRef = useRef<HTMLElement>(null);
  
  useEffect(() => {
    const handleScroll = () => {
      if (mainRef.current) {
        sessionStorage.setItem(`scroll-${location.pathname}`, mainRef.current.scrollTop.toString());
      }
    };
    
    const mainEl = mainRef.current;
    if (mainEl) {
      mainEl.addEventListener('scroll', handleScroll);
    }
    
    return () => {
      if (mainEl) {
        mainEl.removeEventListener('scroll', handleScroll);
      }
    };
  }, [location.pathname]);



  const navigationType = useNavigationType();
  const [searchOpen, setSearchOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });

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
    let timeout: any;
    const resetIdle = () => {
      if (isIdle) setIsIdle(false);
      clearTimeout(timeout);
      timeout = setTimeout(() => setIsIdle(true), 4000);
    };

    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('keydown', resetIdle);
    window.addEventListener('touchstart', resetIdle);
    window.addEventListener('scroll', resetIdle, true);
    
    resetIdle();
    
    return () => {
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('keydown', resetIdle);
      window.removeEventListener('touchstart', resetIdle);
      window.removeEventListener('scroll', resetIdle, true);
      clearTimeout(timeout);
    };
  }, [isIdle]);

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
      {/* Mobile Top Bar */}
      <div className={`md:hidden fixed top-0 left-0 right-0 h-16 bg-[#f3efec] dark:bg-[#0d0d12] border-b border-black/5 dark:border-white/5 flex items-center justify-between px-4 z-40 transition-transform duration-500 ${isIdle && !mobileOpen ? '-translate-y-full' : 'translate-y-0'}`}>
        <Link to="/" className="flex items-center gap-3">
          <SiteLogo size="sm" />
          <span className="font-bold text-black dark:text-white tracking-tight">SHUTTER!</span>
        </Link>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsDark(!isDark)} className="text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition">
            {isDark ? <Sun size={22} /> : <Moon size={22} />}
          </button>
          <button onClick={() => setSearchOpen(true)} className="text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition">
            <Search size={22} />
          </button>
          <button onClick={() => setMobileOpen(true)} className="text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition">
            <Menu size={24} />
          </button>
        </div>
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
          ${isIdle && !mobileOpen ? 'w-0 border-none overflow-hidden opacity-0 pointer-events-none' : (isCollapsed ? 'w-20' : 'w-64')}
          ${isIdle && !mobileOpen ? 'px-0' : (isCollapsed ? 'px-2' : 'px-4')}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className={`flex ${isCollapsed ? 'flex-col items-center gap-6 px-0' : 'items-center justify-between px-2'} mb-8 shrink-0`}>
            <Link to="/">
              {!isCollapsed && (
                <h1 className="text-xl font-bold text-black dark:text-white flex items-center gap-3 tracking-tight">
                  <SiteLogo size="md" />
                  SHUTTER!
                </h1>
              )}
              {isCollapsed && (
                <SiteLogo size="md" />
              )}
            </Link>
            <button 
              className={`${isCollapsed ? 'flex' : 'hidden md:flex'} text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors`}
              onClick={() => setIsCollapsed(!isCollapsed)}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>
            {!isCollapsed && (
              <button 
                className="md:hidden text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
                onClick={() => setMobileOpen(false)}
                title="Close sidebar"
              >
                <X size={24} />
              </button>
            )}
          </div>
          
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <nav className="space-y-1">
            {!isCollapsed && <div className="text-gray-600 dark:text-gray-400 text-[10px] font-bold px-4 mb-2 mt-6 uppercase tracking-widest">Menu</div>}
            {isCollapsed && <div className="h-4 mt-6"></div>}
            
            <NavLink to="/" end onClick={() => setMobileOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-center px-0' : 'px-4'} ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
              <Home size={20} /> {!isCollapsed && <span>Home</span>}
            </NavLink>
            <button onClick={() => { setSearchOpen(true); setMobileOpen(false); }} className={`w-full flex items-center gap-3 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent transition-all ${isCollapsed ? 'justify-center px-0' : 'px-4'}`}>
              <Search size={20} /> {!isCollapsed && <span>Search</span>}
            </button>
            <NavLink to="/watchlist" onClick={() => setMobileOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-center px-0' : 'px-4'} ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
              <Bookmark size={20} /> {!isCollapsed && <span>Watchlist</span>}
            </NavLink>
            <NavLink to="/recommendations" onClick={() => setMobileOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-center px-0' : 'px-4'} ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
              <Sparkles size={20} /> {!isCollapsed && <span>For You</span>}
            </NavLink>
            
            {!isCollapsed && <div className="text-gray-600 dark:text-gray-400 text-[10px] font-bold px-4 mb-2 mt-8 uppercase tracking-widest">Categories</div>}
            {isCollapsed && <div className="h-4 mt-8"></div>}
            
            {categories.map((cat: string) => {
              let Icon = Folder;
              const lower = cat.toLowerCase();
              if (lower.includes('movie')) Icon = Film;
              else if (lower.includes('series') || lower.includes('tv')) Icon = Tv;
              else if (lower.includes('anime')) Icon = Clapperboard;
              else if (lower.includes('drama')) Icon = Compass;
              
              return (
                <NavLink key={cat} to={`/category/${cat}`} onClick={() => setMobileOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-center px-0' : 'px-4'} ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
                  <Icon size={20} /> {!isCollapsed && <span className="capitalize">{lower}</span>}
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="space-y-1 shrink-0 mt-4">
          {user === 'admin' && (
            <>
              <NavLink to="/users" onClick={() => setMobileOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-center px-0' : 'px-4'} ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
                <Users size={20} /> {!isCollapsed && <span>Users</span>}
              </NavLink>
              <NavLink to="/admin?tab=logs" onClick={() => setMobileOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-center px-0' : 'px-4'} ${location.search.includes('tab=logs') ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
                <Activity size={20} /> {!isCollapsed && <span>Logs</span>}
              </NavLink>
              <NavLink to="/admin" onClick={() => setMobileOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-center px-0' : 'px-4'} ${isActive && !location.search.includes('tab=logs') ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent'}`}>
                <Settings size={20} /> {!isCollapsed && <span>Settings</span>}
              </NavLink>
            </>
          )}
          <button onClick={() => { logout(); navigate('/login'); }} className={`w-full flex items-center gap-3 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white border border-transparent transition-all ${isCollapsed ? 'justify-center px-0' : 'px-4'}`}>
            <LogOut size={20} /> {!isCollapsed && <span>Logout</span>}
          </button>
          <div className={`mt-4 flex items-center gap-3 border-t border-black/5 dark:border-white/5 pt-4 ${isCollapsed ? 'justify-center px-0' : 'px-4'}`}>
             <div className="w-8 h-8 rounded-full bg-purple-900 border border-purple-600/30 overflow-hidden shrink-0"><div className="w-full h-full bg-[#1e293b] flex items-center justify-center text-[10px] text-purple-400 font-bold">{user?.substring(0, 3).toUpperCase() || 'USR'}</div></div>
             {!isCollapsed && <div className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{user}</div>}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main ref={mainRef} className="flex-1 overflow-y-auto relative bg-[#fffcf9] dark:bg-[#08080a] pt-16 md:pt-0">
        {/* Desktop Top Navbar */}
        <div className={`hidden md:flex sticky top-0 left-0 right-0 z-40 bg-[#fffcf9]/80 dark:bg-[#08080a]/80 backdrop-blur-md border-b border-black/5 dark:border-white/5 px-8 py-4 items-center justify-end transition-transform duration-500 ${isIdle ? '-translate-y-full' : 'translate-y-0'}`}>
          <div className="flex items-center gap-6">
            <button onClick={() => setIsDark(!isDark)} className="text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition">
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <NavbarSearch />
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-full min-h-full"
          >
            <ScrollRestorer scrollKey={location.pathname} mainRef={mainRef} />
            {outlet}
          </motion.div>
        </AnimatePresence>
        
        <ScrollToTopButton scrollRef={mainRef} />
      </main>

      {/* Floating Bottom Nav for Mobile/Tablet */}
      <div className={`lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-2 py-2 rounded-full bg-white/10 dark:bg-black/10 backdrop-blur-sm border border-white/20 dark:border-white/10 text-black dark:text-white shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] transition-transform duration-500 ${isIdle && !mobileOpen ? 'translate-y-[200%]' : 'translate-y-0'}`}>
        <NavLink to="/" onClick={() => { setMobileOpen(false); setSearchOpen(false); }} className={({isActive}) => `flex items-center gap-2 transition-all duration-300 ${isActive && !searchOpen ? 'text-purple-600 dark:text-purple-400 bg-black/10 dark:bg-white/10 px-4 py-2 rounded-full' : 'hover:text-purple-600 dark:hover:text-purple-400 px-4 py-2'}`}>
          {({isActive}) => (
            <>
              <Home size={24} />
              <AnimatePresence>
                {isActive && !searchOpen && (
                  <motion.span initial={{ width: 0, opacity: 0 }} animate={{ width: 'auto', opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="font-semibold text-sm whitespace-nowrap overflow-hidden">
                    Home
                  </motion.span>
                )}
              </AnimatePresence>
            </>
          )}
        </NavLink>
        <button onClick={() => { setSearchOpen(!searchOpen); setMobileOpen(false); }} className={`flex items-center gap-2 transition-all duration-300 ${searchOpen ? 'text-purple-600 dark:text-purple-400 bg-black/10 dark:bg-white/10 px-4 py-2 rounded-full' : 'hover:text-purple-600 dark:hover:text-purple-400 px-4 py-2'}`}>
          <Search size={24} />
          <AnimatePresence>
            {searchOpen && (
              <motion.span initial={{ width: 0, opacity: 0 }} animate={{ width: 'auto', opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="font-semibold text-sm whitespace-nowrap overflow-hidden">
                Search
              </motion.span>
            )}
          </AnimatePresence>
        </button>
        <NavLink to="/watchlist" onClick={() => { setMobileOpen(false); setSearchOpen(false); }} className={({isActive}) => `flex items-center gap-2 transition-all duration-300 ${isActive && !searchOpen ? 'text-purple-600 dark:text-purple-400 bg-black/10 dark:bg-white/10 px-4 py-2 rounded-full' : 'hover:text-purple-600 dark:hover:text-purple-400 px-4 py-2'}`}>
          {({isActive}) => (
            <>
              <Bookmark size={24} />
              <AnimatePresence>
                {isActive && !searchOpen && (
                  <motion.span initial={{ width: 0, opacity: 0 }} animate={{ width: 'auto', opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="font-semibold text-sm whitespace-nowrap overflow-hidden">
                    Watchlist
                  </motion.span>
                )}
              </AnimatePresence>
            </>
          )}
        </NavLink>
        <NavLink to="/recommendations" onClick={() => { setMobileOpen(false); setSearchOpen(false); }} className={({isActive}) => `flex items-center gap-2 transition-all duration-300 ${isActive && !searchOpen ? 'text-purple-600 dark:text-purple-400 bg-black/10 dark:bg-white/10 px-4 py-2 rounded-full' : 'hover:text-purple-600 dark:hover:text-purple-400 px-4 py-2'}`}>
          {({isActive}) => (
            <>
              <Sparkles size={24} />
              <AnimatePresence>
                {isActive && !searchOpen && (
                  <motion.span initial={{ width: 0, opacity: 0 }} animate={{ width: 'auto', opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="font-semibold text-sm whitespace-nowrap overflow-hidden">
                    For You
                  </motion.span>
                )}
              </AnimatePresence>
            </>
          )}
        </NavLink>
      </div>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
