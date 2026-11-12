import React, { useState, useEffect } from 'react';
import { X, Search as SearchIcon, Loader2, Film, Clock, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { getRecentSearches, saveRecentSearch, removeRecentSearch, clearRecentSearches } from '../utils/recentSearches';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parseMediaName } from '../utils/nameParser';
import { prefetchItemDetails } from '../utils/detailsPrefetch';
import { useIsDarkMode } from '../utils/colorExtractor';

function SearchItemImage({ item, metaVer }: { item: any; metaVer?: string }) {
  const directImage = item.custom_backdrop || item.poster_path || item.backdrop_path || item.backdropPath;

  const { data: tmdbData } = useQuery({
    queryKey: ['tmdb_search', item.name, item.parent, metaVer],
    queryFn: async () => {
      const parentParts = (item.parent || '').split('/').filter(Boolean);
      let category = parentParts.length > 1 ? parentParts[1].toUpperCase() : 'MOVIES';
      let searchName = item.name;
      if (/^(s\d+|season\s*\d+)$/i.test(item.name)) {
        searchName = parentParts[parentParts.length - 1];
      }
      const { cleanName, year } = parseMediaName(searchName);
      
      let url = `/api/meta/search?query=${encodeURIComponent(cleanName)}&type=${category}${year ? `&year=${year}` : ''}&path=${encodeURIComponent(item.parent + '/' + item.name)}`;
      if (metaVer) {
        url += `&v=${metaVer}`;
      }
      const res = await axios.get(url);
      return res.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const rawImage = 
    item.custom_backdrop || 
    tmdbData?.custom_backdrop || 
    item.poster_path || 
    tmdbData?.poster_path || 
    item.backdrop_path || 
    tmdbData?.backdrop_path || 
    directImage;

  const [imgSrc, setImgSrc] = useState<string | null>(() => {
    if (!rawImage) return null;
    if (rawImage.startsWith('http://') || rawImage.startsWith('https://')) return rawImage;
    const clean = rawImage.startsWith('/') ? rawImage : `/${rawImage}`;
    return `https://image.tmdb.org/t/p/w185${clean}`;
  });

  useEffect(() => {
    if (!rawImage) {
      setImgSrc(null);
      return;
    }
    if (rawImage.startsWith('http://') || rawImage.startsWith('https://')) {
      setImgSrc(rawImage);
    } else {
      const clean = rawImage.startsWith('/') ? rawImage : `/${rawImage}`;
      setImgSrc(`https://image.tmdb.org/t/p/w185${clean}`);
    }
  }, [rawImage]);

  if (imgSrc) {
    return (
      <div className="w-10 h-14 sm:w-12 sm:h-16 rounded-xl mr-3 sm:mr-4 shrink-0 overflow-hidden bg-black/10 dark:bg-black/60 border border-black/10 dark:border-white/10 shadow-md">
        <img 
          src={imgSrc} 
          alt="" 
          className="w-full h-full object-cover" 
          onError={() => {
            if (rawImage && (rawImage.startsWith('http://') || rawImage.startsWith('https://')) && !imgSrc.includes('/api/image-proxy')) {
              setImgSrc(`/api/image-proxy?url=${encodeURIComponent(rawImage)}`);
            } else {
              setImgSrc(null);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-10 h-14 sm:w-12 sm:h-16 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/15 rounded-xl flex items-center justify-center mr-3 sm:mr-4 shrink-0 group-hover:bg-purple-600/10 dark:group-hover:bg-purple-600/25 group-hover:border-purple-300 dark:group-hover:border-purple-400/40 transition-all">
      <Film className="w-5 h-5 text-gray-500 dark:text-gray-300 group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors" />
    </div>
  );
}

export default function SearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const { token } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentMetaVer = localStorage.getItem('meta_version') || '1';
  const isDark = useIsDarkMode();

  // Keyboard navigation & escape listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handlePrefetchItem = (item: any) => {
    const parentParts = (item.parent || '').split('/').filter(Boolean);
    const category = parentParts.length > 1 ? parentParts[1].toUpperCase() : 'MOVIES';
    prefetchItemDetails(queryClient, {
      item,
      category,
      parentPath: item.parent,
      token,
    });
  };

  useEffect(() => {
    // Purge any accidental season/subfolder items that might have been saved in recent searches
    const rawRecents = getRecentSearches();
    const cleanRecents = rawRecents.filter(
      term => !/^(s\d+|season\s*\d+|series\s*\d+|specials?|extras?|subs?)$/i.test(term.trim())
    );
    if (cleanRecents.length !== rawRecents.length) {
      localStorage.setItem('recent_searches', JSON.stringify(cleanRecents));
    }
    setRecentSearches(cleanRecents);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const fetchSuggestions = async () => {
      if (!query.trim()) {
        setSuggestions([]);
        return;
      }
      setLoading(true);
      try {
        const res = await axios.post(
          '/api/fs/search', 
          { keywords: query, parent: '/home' }, 
          { headers: { Authorization: token }, signal: controller.signal }
        );
        if (res.data.code === 200) {
          const content = res.data.data.content || [];
          // Ensure season subfolders or nested subdirectories are never shown in suggestions
          const validContent = content.filter((item: any) => {
            if (!item || !item.name) return false;
            if (/^(s\d+|season\s*\d+|series\s*\d+|specials?|extras?|featurettes?|bonus|trailers?|sample|subs?|subtitles?|cd\d+|disc\d+)$/i.test(item.name)) return false;
            const parts = (item.parent || '').split('/').filter(Boolean);
            if (parts.length > 2) return false;
            return true;
          });
          setSuggestions(validContent);
        }
      } catch (err) {
        if (axios.isCancel(err)) return;
        console.error("Search failed", err);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    const debounce = setTimeout(() => {
      fetchSuggestions();
    }, 300);

    return () => {
      clearTimeout(debounce);
      controller.abort();
    };
  }, [query, token]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      saveRecentSearch(query.trim());
      setRecentSearches(getRecentSearches());
      navigate(`/category/search?q=${encodeURIComponent(query)}`);
      onClose();
    }
  };

  const handleSelect = (item: any) => {
    saveRecentSearch(item.name || query.trim());
    setRecentSearches(getRecentSearches());
    handlePrefetchItem(item);
    const fullPath = `${item.parent}/${item.name}`;
    navigate(`${fullPath.startsWith('/') ? '' : '/'}${fullPath}`.split('/').map(p => encodeURIComponent(p)).join('/'), {
      state: { item, metaVer: currentMetaVer }
    });
    onClose();
  };

  const handleSelectRecent = (term: string) => {
    saveRecentSearch(term);
    setRecentSearches(getRecentSearches());
    setQuery(term);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-10 sm:pt-20 px-3 sm:px-4 bg-black/40 dark:bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-[#fffcf9]/90 dark:bg-[#0f111a]/85 text-gray-900 dark:text-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15),inset_0_1px_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_25px_70px_rgba(0,0,0,0.85),inset_0_1px_1px_0_rgba(255,255,255,0.18)] border border-black/10 dark:border-white/20 overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[80vh] backdrop-blur-2xl backdrop-saturate-[180%] transition-colors duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <form onSubmit={handleSearch} className="flex items-center px-4 sm:px-6 py-4 sm:py-4.5 shrink-0 border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] backdrop-blur-md gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600/10 dark:bg-purple-500/20 flex items-center justify-center shrink-0 border border-purple-600/20 dark:border-purple-400/30 backdrop-blur-sm">
            <SearchIcon className="text-purple-600 dark:text-purple-300 w-5 h-5 shrink-0" />
          </div>
          
          <input 
            type="text" 
            autoFocus
            className="flex-1 bg-transparent text-gray-950 dark:text-white text-base sm:text-xl font-medium outline-none placeholder:text-gray-400 dark:placeholder:text-gray-400 min-w-0" 
            placeholder="Search Movies, Series, TMDb..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {query && (
            <button 
              type="button" 
              onClick={() => setQuery('')} 
              className="p-1.5 text-gray-400 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition shrink-0 cursor-pointer"
              title="Clear input"
            >
              <X size={18} />
            </button>
          )}

          <button 
            type="button" 
            onClick={onClose} 
            className="w-9 h-9 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 border border-black/10 dark:border-white/15 text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white flex items-center justify-center transition shrink-0 cursor-pointer active:scale-95"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </form>
        
        {/* Recent Searches View (Empty query) */}
        {!query.trim() && recentSearches.length > 0 && (
          <div className="p-4 sm:p-6 overflow-y-auto flex-1">
            <div className="flex items-center justify-between mb-3 text-xs font-bold tracking-wider text-purple-600 dark:text-purple-400 uppercase">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>Recent Searches</span>
              </div>
              <button
                type="button"
                onClick={() => setRecentSearches(clearRecentSearches())}
                className="text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-semibold transition cursor-pointer"
              >
                Clear All
              </button>
            </div>

            <div className="space-y-1.5">
              {recentSearches.map((term) => {
                const parsed = parseMediaName(term);
                const displayName = parsed.cleanName && parsed.cleanName !== 'Unknown' ? parsed.cleanName : term;
                const displayYear = parsed.year;

                return (
                  <div
                    key={term}
                    className="group flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-black/[0.03] hover:bg-black/[0.06] dark:bg-white/[0.07] dark:hover:bg-white/[0.12] border border-black/[0.06] dark:border-white/10 hover:border-purple-600/30 dark:hover:border-purple-400/50 backdrop-blur-sm transition text-gray-900 dark:text-white"
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectRecent(term)}
                      className="flex-1 flex items-center text-left truncate mr-2 cursor-pointer gap-3 min-w-0"
                    >
                      <div className="w-7 h-7 rounded-lg bg-purple-600/10 dark:bg-purple-500/20 flex items-center justify-center shrink-0 text-purple-600 dark:text-purple-300 group-hover:scale-110 transition-transform">
                        <SearchIcon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors truncate">
                          {displayName}
                        </span>
                        {displayYear && (
                          <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-200 bg-purple-100 dark:bg-purple-500/20 border border-purple-200 dark:border-purple-400/30 px-1.5 py-0.5 rounded shrink-0">
                            {displayYear}
                          </span>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRecentSearches(removeRecentSearch(term));
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
                      title="Remove search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Live Search Suggestions & Results View */}
        {query.trim() && (
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="p-10 flex flex-col items-center justify-center text-gray-500 dark:text-gray-300">
                <Loader2 className="w-8 h-8 animate-spin mb-3 text-purple-600 dark:text-purple-400" />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-200">Searching files & metadata...</span>
              </div>
            ) : suggestions.length > 0 ? (
              <div className="py-2">
                {suggestions.map((item) => {
                  const parsed = parseMediaName(item.name);
                  const displayTitle = item.customTitle || parsed.cleanName || item.name;
                  const categoryName = (item.parent || '').replace(/^\/home\/?/i, '').split('/')[0] || 'Media';

                  return (
                    <button
                      key={`${item.parent}/${item.name}`}
                      onClick={() => handleSelect(item)}
                      onPointerEnter={() => handlePrefetchItem(item)}
                      onPointerDown={() => handlePrefetchItem(item)}
                      onTouchStart={() => handlePrefetchItem(item)}
                      onFocus={() => handlePrefetchItem(item)}
                      className="w-full text-left px-4 sm:px-6 py-3.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.10] flex items-center transition-colors group border-b border-black/[0.06] dark:border-white/[0.08] last:border-0 cursor-pointer"
                    >
                      <SearchItemImage item={item} metaVer={currentMetaVer} />
                      <div className="min-w-0 flex-1">
                        <div className="text-base sm:text-lg text-gray-950 dark:text-white font-bold mb-1 break-words line-clamp-1 group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors tracking-tight">
                          {displayTitle}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-2 line-clamp-1">
                          <span className="text-purple-700 dark:text-purple-200 font-bold uppercase tracking-wider text-[10px] bg-purple-100 dark:bg-purple-600/30 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-400/40">
                            {categoryName}
                          </span>
                          {parsed.year && (
                            <span className="text-gray-700 dark:text-white/90 font-semibold bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-[11px]">
                              {parsed.year}
                            </span>
                          )}
                          <span className="text-gray-400 dark:text-white/40">•</span>
                          <span className="text-gray-600 dark:text-gray-300 truncate text-xs">
                            {item.name}
                          </span>
                        </div>
                      </div>
                      <ChevronRight size={19} className="text-gray-400 dark:text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-300 group-hover:translate-x-1 transition-all shrink-0 ml-2" />
                    </button>
                  );
                })}

                <button 
                  onClick={handleSearch}
                  className="w-full text-center px-4 py-3.5 hover:bg-purple-100/70 dark:hover:bg-purple-600/30 flex items-center justify-center text-purple-700 dark:text-purple-200 font-bold text-sm sm:text-base transition-colors bg-purple-50 dark:bg-purple-950/60 border-t border-purple-200 dark:border-purple-500/30 backdrop-blur-md gap-2 cursor-pointer"
                >
                  <SearchIcon size={16} />
                  <span>See all results for "{query}"</span>
                </button>
              </div>
            ) : (
              <div className="p-12 text-center text-gray-500 dark:text-gray-300 space-y-2">
                <Film className="w-10 h-10 text-gray-400 mx-auto" />
                <div className="text-base font-semibold text-gray-900 dark:text-white">No matches found for "{query}"</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Check spelling or try searching for a different movie, show, or actor.</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
