import { useState, useEffect, useRef } from 'react';
import { Search as SearchIcon, X, Loader2, Film, Clock } from 'lucide-react';
import { useNavigate } from 'react-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { getRecentSearches, saveRecentSearch, removeRecentSearch, clearRecentSearches } from '../utils/recentSearches';

export default function NavbarSearch() {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const { token } = useAuth();
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!query.trim()) {
        setSuggestions([]);
        return;
      }
      setLoading(true);
      try {
        const res = await axios.post('/api/fs/search', { keywords: query, parent: '/home' }, { headers: { Authorization: token } });
        if (res.data.code === 200) {
          const content = res.data.data.content || [];
          setSuggestions(content); // Top 8 suggestions
        }
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(() => {
      fetchSuggestions();
    }, 300);

    return () => clearTimeout(debounce);
  }, [query, token]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      saveRecentSearch(query.trim());
      setRecentSearches(getRecentSearches());
      navigate(`/category/search?q=${encodeURIComponent(query)}`);
      setIsFocused(false);
    }
  };

  const handleSelect = (item: any) => {
    saveRecentSearch(item.name || query.trim());
    setRecentSearches(getRecentSearches());
    navigate(`${item.parent.startsWith('/') ? '' : '/'}${item.parent}/${item.name}`.split('/').map(p => encodeURIComponent(p)).join('/'));
    setIsFocused(false);
    setQuery('');
  };

  const handleSelectRecent = (term: string) => {
    saveRecentSearch(term);
    setRecentSearches(getRecentSearches());
    setQuery(term);
  };

  return (
    <div ref={wrapperRef} className="relative w-96 hidden md:block">
      <form onSubmit={handleSearch} className="relative flex items-center">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <SearchIcon className="text-gray-600 dark:text-gray-400 w-4 h-4" />
        </div>
        <input 
          type="text" 
          className="w-full bg-[#fffcf9] dark:bg-[#1a1a22] border border-black/10 dark:border-white/10 rounded-xl pl-10 pr-10 py-2 text-sm text-black dark:text-white focus:outline-none focus:border-purple-600/50 dark:focus:bg-[#23232d] transition-colors"
          placeholder="Search matches..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </form>

      {isFocused && !query.trim() && recentSearches.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[#fffcf9] dark:bg-[#1a1a22] border border-black/10 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 p-3">
          <div className="flex items-center justify-between mb-2 px-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-purple-400" />
              <span>Recent Searches</span>
            </div>
            <button
              type="button"
              onClick={() => setRecentSearches(clearRecentSearches())}
              className="text-[10px] text-red-500 hover:text-red-400 font-medium transition cursor-pointer"
            >
              Clear All
            </button>
          </div>
          <div className="space-y-1">
            {recentSearches.map((term) => (
              <div
                key={term}
                className="group flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition text-black dark:text-white"
              >
                <button
                  type="button"
                  onClick={() => handleSelectRecent(term)}
                  className="flex-1 flex items-center text-left truncate mr-2 cursor-pointer"
                >
                  <SearchIcon className="w-3.5 h-3.5 text-gray-400 mr-2 shrink-0 group-hover:text-purple-400 transition" />
                  <span className="text-xs font-medium truncate">{term}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRecentSearches(removeRecentSearch(term));
                  }}
                  className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-black/10 dark:hover:bg-white/10 transition cursor-pointer"
                  title="Remove search"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isFocused && query.trim() && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[#fffcf9] dark:bg-[#1a1a22] border border-black/10 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 max-h-96 flex flex-col">
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="p-4 flex items-center justify-center text-gray-600 dark:text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Searching...</span>
              </div>
            ) : suggestions.length > 0 ? (
              <div className="py-2">
                {suggestions.map((item) => (
                  <button
                    key={`${item.parent}/${item.name}`}
                    onClick={() => handleSelect(item)}
                    className="w-full text-left px-4 py-2 hover:bg-black/5 dark:bg-white/5 flex items-center transition-colors group"
                  >
                    <Film className="w-4 h-4 text-gray-600 dark:text-gray-400 mr-3 shrink-0 group-hover:text-purple-400 transition-colors" />
                    <div className="truncate flex-1">
                      <div className="text-sm text-black dark:text-white truncate">{item.name}</div>
                      <div className="text-[10px] text-gray-600 dark:text-gray-400 truncate">{item.parent}</div>
                    </div>
                  </button>
                ))}
                <button 
                  onClick={handleSearch}
                  className="w-full text-left px-4 py-3 hover:bg-black/5 dark:bg-white/5 border-t border-black/5 dark:border-white/5 flex items-center text-purple-400 font-medium text-sm transition-colors mt-1 bg-purple-900/10 justify-center"
                >
                  See all results
                </button>
              </div>
            ) : (
              <div className="p-4 text-center text-gray-600 dark:text-gray-400 text-sm">
                No results found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
