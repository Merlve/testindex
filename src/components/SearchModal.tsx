import { useState, useEffect, useRef } from 'react';
import { X, Search as SearchIcon, Loader2, Film } from 'lucide-react';
import { useNavigate } from 'react-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function SearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { token } = useAuth();
  const navigate = useNavigate();

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
          setSuggestions(content.slice(0, 8));
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
      navigate(`/category/search?q=${encodeURIComponent(query)}`);
      onClose();
    }
  };

  const handleSelect = (item: any) => {
    const fullPath = `${item.parent}/${item.name}`;
    navigate(`${fullPath.startsWith('/') ? '' : '/'}${fullPath}`.split('/').map(p => encodeURIComponent(p)).join('/'));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#fbf4eb]/95 dark:bg-[#1a1a22]/95 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-black/10 dark:border-white/10 flex flex-col max-h-[80vh]">
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
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-black/50 rounded-lg flex items-center justify-center mr-4 shrink-0 group-hover:bg-purple-600/20 transition-colors">
                       <Film className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600 dark:text-gray-400 group-hover:text-purple-400 transition-colors" />
                    </div>
                    <div className="truncate flex-1">
                      <div className="text-base sm:text-lg text-black dark:text-white font-medium truncate mb-1">{item.name}</div>
                      <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">{item.parent}</div>
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
                No matches found in Openlist
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
