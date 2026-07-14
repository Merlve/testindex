import { Outlet, NavLink, useNavigate, Link } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { Film, Tv, Folder, Clapperboard, Home, Compass, Settings, LogOut, Search, Menu, ChevronLeft, ChevronRight, X, Bookmark } from 'lucide-react';
import { useState, useEffect } from 'react';
import SearchModal from './SearchModal';
import NavbarSearch from './NavbarSearch';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

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
      <span className={`font-bold text-white ${isSmall ? 'text-lg' : 'text-xl'}`}>S</span>
    </div>
  );
};

export default function Layout() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isIdle, setIsIdle] = useState(false);

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
    <div className="flex h-screen bg-[#08080a] text-gray-100 font-sans overflow-hidden">
      {/* Mobile Top Bar */}
      <div className={`md:hidden fixed top-0 left-0 right-0 h-16 bg-[#0d0d12] border-b border-white/5 flex items-center justify-between px-4 z-40 transition-transform duration-500 ${isIdle && !mobileOpen ? '-translate-y-full' : 'translate-y-0'}`}>
        <Link to="/" className="flex items-center gap-3">
          <SiteLogo size="sm" />
          <span className="font-bold text-white tracking-tight">SHUTTER!</span>
        </Link>
        <div className="flex items-center gap-4">
          <button onClick={() => setSearchOpen(true)} className="text-gray-400 hover:text-white transition">
            <Search size={22} />
          </button>
          <button onClick={() => setMobileOpen(true)} className="text-gray-400 hover:text-white transition">
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
        className={`fixed md:relative top-0 left-0 h-full bg-[#0d0d12] flex flex-col py-6 border-r border-white/5 z-50 transition-all duration-500
          ${isIdle && !mobileOpen ? 'w-0 border-none overflow-hidden opacity-0 pointer-events-none' : (isCollapsed ? 'w-20' : 'w-64')}
          ${isIdle && !mobileOpen ? 'px-0' : (isCollapsed ? 'px-2' : 'px-4')}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className={`flex items-center mb-8 px-2 shrink-0 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            <Link to="/">
              {!isCollapsed && (
                <h1 className="text-xl font-bold text-white flex items-center gap-3 tracking-tight">
                  <SiteLogo size="md" />
                  SHUTTER!
                </h1>
              )}
              {isCollapsed && (
                <SiteLogo size="md" />
              )}
            </Link>
            <button 
              className="hidden md:flex text-gray-400 hover:text-white transition-colors"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>
            <button 
              className="md:hidden text-gray-400 hover:text-white transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              <X size={24} />
            </button>
          </div>
          
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <nav className="space-y-1">
            {!isCollapsed && <div className="text-gray-400 text-[10px] font-bold px-4 mb-2 mt-6 uppercase tracking-widest">Menu</div>}
            {isCollapsed && <div className="h-4 mt-6"></div>}
            
            <NavLink to="/" end onClick={() => setMobileOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-center px-0' : 'px-4'} ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-400 hover:text-white border border-transparent'}`}>
              <Home size={20} /> {!isCollapsed && <span>Home</span>}
            </NavLink>
            <button onClick={() => { setSearchOpen(true); setMobileOpen(false); }} className={`w-full flex items-center gap-3 py-3 rounded-xl text-gray-400 hover:text-white border border-transparent transition-all ${isCollapsed ? 'justify-center px-0' : 'px-4'}`}>
              <Search size={20} /> {!isCollapsed && <span>Search</span>}
            </button>
            <NavLink to="/watchlist" onClick={() => setMobileOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-center px-0' : 'px-4'} ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-400 hover:text-white border border-transparent'}`}>
              <Bookmark size={20} /> {!isCollapsed && <span>Watchlist</span>}
            </NavLink>
            
            {!isCollapsed && <div className="text-gray-400 text-[10px] font-bold px-4 mb-2 mt-8 uppercase tracking-widest">Categories</div>}
            {isCollapsed && <div className="h-4 mt-8"></div>}
            
            {categories.map((cat: string) => {
              let Icon = Folder;
              const lower = cat.toLowerCase();
              if (lower.includes('movie')) Icon = Film;
              else if (lower.includes('series') || lower.includes('tv')) Icon = Tv;
              else if (lower.includes('anime')) Icon = Clapperboard;
              else if (lower.includes('drama')) Icon = Compass;
              
              return (
                <NavLink key={cat} to={`/category/${cat}`} onClick={() => setMobileOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-center px-0' : 'px-4'} ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-400 hover:text-white border border-transparent'}`}>
                  <Icon size={20} /> {!isCollapsed && <span className="capitalize">{lower}</span>}
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="space-y-1 shrink-0 mt-4">
          {user === 'admin' && (
            <NavLink to="/admin" onClick={() => setMobileOpen(false)} className={({isActive}) => `flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'justify-center px-0' : 'px-4'} ${isActive ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20' : 'text-gray-400 hover:text-white border border-transparent'}`}>
              <Settings size={20} /> {!isCollapsed && <span>Settings</span>}
            </NavLink>
          )}
          <button onClick={() => { logout(); navigate('/login'); }} className={`w-full flex items-center gap-3 py-3 rounded-xl text-gray-400 hover:text-white border border-transparent transition-all ${isCollapsed ? 'justify-center px-0' : 'px-4'}`}>
            <LogOut size={20} /> {!isCollapsed && <span>Logout</span>}
          </button>
          <div className={`mt-4 flex items-center gap-3 border-t border-white/5 pt-4 ${isCollapsed ? 'justify-center px-0' : 'px-4'}`}>
             <div className="w-8 h-8 rounded-full bg-purple-900 border border-purple-600/30 overflow-hidden shrink-0"><div className="w-full h-full bg-[#1e293b] flex items-center justify-center text-[10px] text-purple-400 font-bold">{user?.substring(0, 3).toUpperCase() || 'USR'}</div></div>
             {!isCollapsed && <div className="text-sm font-medium text-gray-300 truncate">{user}</div>}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative bg-[#08080a] pt-16 md:pt-0">
        {/* Desktop Top Navbar */}
        <div className={`hidden md:flex sticky top-0 left-0 right-0 z-40 bg-[#08080a]/80 backdrop-blur-md border-b border-white/5 px-8 py-4 items-center justify-end transition-transform duration-500 ${isIdle ? '-translate-y-full' : 'translate-y-0'}`}>
          <NavbarSearch />
        </div>
        <Outlet />
      </main>

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
