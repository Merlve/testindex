import { useState, useEffect } from 'react';
import { X, Search as SearchIcon, Loader2, Film, Clock } from 'lucide-react';
import { useNavigate } from 'react-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { getRecentSearches, saveRecentSearch, removeRecentSearch, clearRecentSearches } from '../utils/recentSearches';
import { useQuery } from '@tanstack/react-query';
import { parseMediaName } from '../utils/nameParser';

function SearchItemImage({ item }: { item: any }) {
  const { data: tmdbData } = useQuery({
    queryKey: ['tmdb_search', item.name, item.parent],
    queryFn: async () => {
      const parentParts = (item.parent || '').split('/').filter(Boolean);
      let category = parentParts.length > 1 ? parentParts[1].toUpperCase() : 'MOVIES';
      let searchName = item.name;
      if (/^(s\d+|season\s*\d+)$/i.test(item.name)) {
        searchName = parentParts[parentParts.length - 1];
      }
      const { cleanName, year } = parseMediaName(searchName);
      
      let url = `/api/meta/search?query=${encodeURIComponent(cleanName)}&type=${category}${year ? `&year=${year}` : ''}&path=${encodeURIComponent(item.parent + '/' + item.name)}`;
      const res = await axios.get(url);
      return res.data;
    },
    staleTime: 1000 * 60 * 60 * 24,
  });

  const posterPath = tmdbData?.poster_path;
  
  if (posterPath) {
    return (
      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg mr-4 shrink-0 overflow-hidden bg-black/50">
        <img src={`https://image.tmdb.org/t/p/w92${posterPath}`} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }

  return (
    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-black/50 rounded-lg flex items-center justify-center mr-4 shrink-0 group-hover:bg-purple-600/20 transition-colors">
      <Film className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600 dark:text-gray-400 group-hover:text-purple-400 transition-colors" />
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

  useEffect(() => {
    setRecentSearches(getRecentSearches());
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
          setSuggestions(content);
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
    const fullPath = `${item.parent}/${item.name}`;
    navigate(`${fullPath.startsWith('/') ? '' : '/'}${fullPath}`.split('/').map(p => encodeURIComponent(p)).join('/'));
    onClose();
  };

  const handleSelectRecent = (term: string) => {
    saveRecentSearch(term);
    setRecentSearches(getRecentSearches());
    setQuery(term);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div 
        className="bg-[#fffcf9]/95 dark:bg-[#1a1a22]/95 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-black/10 dark:border-white/10 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSearch} className="flex items-center px-4 sm:px-6 py-4 sm:py-5 shrink-0 border-b border-black/5 dark:border-white/5">
          <SearchIcon className="text-purple-400 mr-3 sm:mr-4 w-6 h-6 sm:w-7 sm:h-7 shrink-0" />
          <input 
            type="text" 
            autoFocus
            className="flex-1 bg-transparent text-black dark:text-white text-xl sm:text-2xl outline-none placeholder-gray-500 font-medium min-w-0" 
            placeholder="Search Movies, Series, Anime..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" onClick={onClose} className="p-2 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white rounded-full hover:bg-black/10 dark:bg-white/10 transition shrink-0 ml-2">
            <X size={24} />
          </button>
        </form>
        
        {!query.trim() && recentSearches.length > 0 && (
          <div className="p-4 sm:p-6 overflow-y-auto flex-1">
            <div className="flex items-center justify-between mb-3 text-xs sm:text-sm font-semibold tracking-wider text-gray-500 dark:text-gray-400 uppercase">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-500 dark:text-purple-400" />
                <span>Recent Searches</span>
              </div>
              <button
                type="button"
                onClick={() => setRecentSearches(clearRecentSearches())}
                className="text-xs text-red-500 hover:text-red-400 font-medium transition cursor-pointer"
              >
                Clear All
              </button>
            </div>
            <div className="space-y-1">
              {recentSearches.map((term) => (
                <div
                  key={term}
                  className="group flex items-center justify-between px-3.5 py-3 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition text-black dark:text-white"
                >
                  <button
                    type="button"
                    onClick={() => handleSelectRecent(term)}
                    className="flex-1 flex items-center text-left truncate mr-2 cursor-pointer"
                  >
                    <SearchIcon className="w-4 h-4 text-gray-400 mr-3 shrink-0 group-hover:text-purple-500 dark:group-hover:text-purple-400 transition" />
                    <span className="text-sm sm:text-base font-medium truncate">{term}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRecentSearches(removeRecentSearch(term));
                    }}
                    className="p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition cursor-pointer"
                    title="Remove search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {query.trim() && (
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="p-8 flex flex-col items-center justify-center text-gray-600 dark:text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-purple-400" />
                <span className="text-sm">Searching Openlist...</span>
              </div>
            ) : suggestions.length > 0 ? (
              <div className="py-2">
                {suggestions.map((item) => (
                  <button
                    key={`${item.parent}/${item.name}`}
                    onClick={() => handleSelect(item)}
                    className="w-full text-left px-4 sm:px-6 py-3 sm:py-4 hover:bg-black/5 dark:bg-white/5 flex items-center transition-colors group border-b border-black/5 dark:border-white/5 last:border-0"
                  >
                    <SearchItemImage item={item} />
                    <div className="min-w-0 flex-1">
                      <div className="text-base sm:text-lg text-black dark:text-white font-medium mb-1 break-words whitespace-normal leading-tight">{item.name}</div>
                      <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 break-words whitespace-normal leading-tight">{item.parent}</div>
                    </div>
                  </button>
                ))}
                <button 
                  onClick={handleSearch}
                  className="w-full text-center px-4 py-4 hover:bg-black/5 dark:bg-white/5 flex items-center justify-center text-purple-400 font-bold text-sm sm:text-base transition-colors bg-purple-900/10"
                >
                  See all results for "{query}"
                </button>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-600 dark:text-gray-400">
                No Matches Found
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
