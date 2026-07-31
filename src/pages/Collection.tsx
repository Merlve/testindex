import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import { 
  ChevronLeft, Plus, ArrowUpDown, Search, Filter, Globe, Lock, ThumbsUp, Bookmark, 
  Trash2, Edit3, ChevronDown, ChevronUp, Play, Check, CheckCircle, Eye, EyeOff,
  Star, X, Grid, List, Calendar, Clock, Film, Tv, Download, Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ItemCard from '../components/ItemCard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parseMediaName } from '../utils/nameParser';

interface CollectionItem {
  id?: string;
  name: string;
  title?: string;
  posterPath?: string;
  poster_path?: string;
  backdropPath?: string;
  backdrop_path?: string;
  parentPath?: string;
  category?: string;
  mediaType?: 'movie' | 'tv';
  year?: string | number;
  rating?: number;
  voteCount?: number;
  runtime?: string;
  overview?: string;
  contentRating?: string;
  genres?: string[];
}

interface CustomCollection {
  id: string;
  name: string;
  description: string;
  authorName: string;
  createdBy: string;
  isPublic: boolean;
  categoryTag?: string;
  items: CollectionItem[];
  upvotes: string[];
  createdAt: number;
  updatedAt: number;
}

const ALL_GENRES = [
  'Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 
  'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror', 
  'Music', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'War', 'Western'
];

const ProviderResultItem = ({ res, handleAddItemToCollection, isAdded }: any) => {
  const { cleanName, year: searchYear } = parseMediaName(res.name);
  
  const { data: tmdbData } = useQuery({
    queryKey: ['tmdb', res.name, res.category],
    queryFn: async () => {
      try {
        let url = `/api/meta/search?query=${encodeURIComponent(cleanName)}&type=${res.category}${searchYear ? `&year=${searchYear}` : ''}`;
        const resp = await axios.get(url);
        return resp.data;
      } catch (e) {
        return null;
      }
    },
    staleTime: 1000 * 60 * 60 * 24,
  });

  const displayTmdb = tmdbData || res;
  const posterUrl = displayTmdb.poster_path
    ? (displayTmdb.poster_path.startsWith('http') ? displayTmdb.poster_path : `https://image.tmdb.org/t/p/w500${displayTmdb.poster_path}`)
    : (res.posterPath?.startsWith('http') ? res.posterPath : res.posterPath ? `https://image.tmdb.org/t/p/w500${res.posterPath}` : null);
  const title = displayTmdb.title || displayTmdb.name || res.title;
  const year = displayTmdb.release_date?.substring(0,4) || displayTmdb.first_air_date?.substring(0,4) || res.year;

  return (
    <div
      className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:border-purple-500/30 transition-all gap-4"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-12 h-16 rounded-lg bg-neutral-800 shrink-0 overflow-hidden">
          {posterUrl ? (
            <img src={posterUrl} alt={title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-500 p-1 text-center font-bold">
              {title}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="font-bold text-xs text-black dark:text-white truncate">
            {title}
          </div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400">
            {year ? `${year} • ` : ''}{res.mediaType?.toUpperCase() || 'MOVIE'}
          </div>
        </div>
      </div>

      <button
        onClick={() => {
          if (!isAdded) {
            handleAddItemToCollection({
              ...res,
              title: title,
              posterPath: displayTmdb.poster_path || res.posterPath,
              backdropPath: displayTmdb.backdrop_path || res.backdropPath,
              year: year,
              overview: displayTmdb.overview || res.overview,
              rating: displayTmdb.vote_average || res.rating,
            });
          }
        }}
        disabled={isAdded}
        className={`px-3 py-1.5 rounded-lg text-white font-bold text-xs shadow-sm transition-all shrink-0 flex items-center gap-1 ${
          isAdded ? 'bg-black/20 dark:bg-white/20 text-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500'
        }`}
      >
        {isAdded ? <><Check size={14} /> Added</> : <><Plus size={14} /> Add</>}
      </button>
    </div>
  );
};

export default function Collection() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch single collection via React Query with initialData from collections cache
  const { data: collection = null, isLoading: loading } = useQuery<CustomCollection | null>({
    queryKey: ['user-collection', id, user],
    queryFn: async () => {
      if (!id) return null;
      const res = await axios.get(`/api/user-collections/${id}`, {
        headers: { Authorization: token, 'x-user': user }
      });
      return res.data?.collection || null;
    },
    initialData: () => {
      const cols = queryClient.getQueryData<CustomCollection[]>(['user-collections', user]);
      return cols?.find(c => c.id === id);
    },
    enabled: !!id && !!token,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  // Fetch watched items via React Query
  const { data: watchedList = [] } = useQuery<any[]>({
    queryKey: ['watched-list', user],
    queryFn: async () => {
      try {
        const res = await axios.get('/api/watched', {
          headers: { Authorization: token, 'x-user': user }
        });
        return Array.isArray(res.data) ? res.data : (res.data?.watched || []);
      } catch {
        return [];
      }
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  // Filtering & Sorting State
  const [showFilterAccordion, setShowFilterAccordion] = useState(false);
  const [showSortAccordion, setShowSortAccordion] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedGenre, setSelectedGenre] = useState<string>('All');
  const [minYear, setMinYear] = useState<string>('Any');
  const [maxYear, setMaxYear] = useState<string>('Any');
  const [minRating, setMinRating] = useState<string>('Any');
  const [minVotes, setMinVotes] = useState<string>('Any');
  const [sortBy, setSortBy] = useState<'default' | 'rating' | 'title' | 'year' | 'runtime'>('default');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [dimWatched, setDimWatched] = useState(false);

  // Provider Search Modal State
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [providerQuery, setProviderQuery] = useState('');
  const [providerResults, setProviderResults] = useState<any[]>([]);
  const [searchingProvider, setSearchingProvider] = useState(false);

  // Edit Collection Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [updating, setUpdating] = useState(false);

  // Confirmation Modals State
  const [deleteCollectionConfirm, setDeleteCollectionConfirm] = useState(false);
  const [removeItemConfirm, setRemoveItemConfirm] = useState<number | null>(null);

  // Sync edit modal fields when collection is loaded or updated
  useEffect(() => {
    if (collection) {
      setEditName(collection.name || '');
      setEditDesc(collection.description || '');
      setEditAuthor(collection.authorName || '');
      setEditIsPublic(collection.isPublic ?? true);
    }
  }, [collection?.id, collection?.name, collection?.description, collection?.authorName, collection?.isPublic]);

  // Handle Upvote
  const handleUpvote = async () => {
    if (!collection) return;
    try {
      const res = await axios.post(`/api/user-collections/${collection.id}/upvote`, {}, {
        headers: { Authorization: token, 'x-user': user }
      });
      if (res.data?.success) {
        const hasUpvoted = collection.upvotes?.includes(user);
        const updatedUpvotes = hasUpvoted
          ? collection.upvotes.filter(u => u !== user)
          : [...(collection.upvotes || []), user];
        const updatedCol = { ...collection, upvotes: updatedUpvotes };

        queryClient.setQueryData(['user-collection', id, user], updatedCol);
        queryClient.setQueryData(['user-collections', user], (old: CustomCollection[] | undefined) =>
          old ? old.map(c => c.id === id ? updatedCol : c) : []
        );
      }
    } catch (err) {
      console.error('Failed to upvote', err);
    }
  };

  // Toggle Item Watched Status
  const handleToggleWatched = async (item: CollectionItem) => {
    try {
      const itemName = item.name || item.title || '';
      const itemPath = item.parentPath || `/home/${item.category || 'Movies'}`;
      const res = await axios.post('/api/watched/toggle', { name: itemName, parentPath: itemPath }, {
        headers: { Authorization: token, 'x-user': user }
      });
      if (res.data?.success) {
        queryClient.setQueryData(['watched-list', user], res.data.watched || []);
        queryClient.invalidateQueries({ queryKey: ['watched-list', user] });
      }
    } catch (err) {
      console.error('Failed to toggle watched status', err);
    }
  };

  // Add Item to Watchlist
  const handleAddToWatchlist = async (item: CollectionItem) => {
    try {
      await axios.post('/api/watchlist/toggle', {
        item: { name: item.name },
        category: item.category || 'Movies',
        parentPath: item.parentPath || `/home/${item.category || 'Movies'}`
      }, {
        headers: { Authorization: token, 'x-user': user }
      });
      alert(`Added "${item.title || item.name}" to your Watchlist!`);
    } catch (err) {
      console.error('Failed to update watchlist', err);
    }
  };

  // Remove Item from Collection
  const executeRemoveItem = async (itemIdx: number) => {
    if (!collection) return;

    const updatedItems = collection.items.filter((_, idx) => idx !== itemIdx);
    try {
      const res = await axios.put(`/api/user-collections/${collection.id}`, { items: updatedItems }, {
        headers: { Authorization: token, 'x-user': user }
      });
      if (res.data?.success) {
        const updatedCol = res.data.collection;
        queryClient.setQueryData(['user-collection', id, user], updatedCol);
        queryClient.setQueryData(['user-collections', user], (old: CustomCollection[] | undefined) =>
          old ? old.map(c => c.id === id ? updatedCol : c) : []
        );
        setRemoveItemConfirm(null);
      }
    } catch (err) {
      console.error('Failed to remove item', err);
    }
  };

  // Provider Search Execution
  const executeSearchProvider = async () => {
    if (!providerQuery.trim()) return;

    try {
      setSearchingProvider(true);
      const res = await axios.post('/api/fs/search', { keywords: providerQuery.trim(), parent: '/home' }, { headers: { Authorization: token } });
      if (res.data?.code === 200) {
        const content = res.data.data.content || [];
        const formattedLocals = content.slice(0, 15).map((loc: any, idx: number) => {
          const category = loc.parent?.split('/').pop() || 'Movies';
          return {
            id: `loc_${loc.name}_${idx}`,
            name: loc.name,
            title: loc.name.replace(/\.[^/.]+$/, ''),
            parentPath: loc.parent,
            category: category,
            mediaType: category.toLowerCase().includes('series') ? 'tv' : 'movie',
            overview: 'Available on local library'
          };
        });
        setProviderResults(formattedLocals);
      } else {
        setProviderResults([]);
      }
    } catch (err) {
      console.error('Provider search error', err);
    } finally {
      setSearchingProvider(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (providerQuery.trim()) {
        executeSearchProvider();
      } else {
        setProviderResults([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [providerQuery, token]);

  // Add Item to Collection from Provider Search
  const handleAddItemToCollection = async (newItem: CollectionItem) => {
    if (!collection) return;
    const existing = collection.items.some(i => i.name === newItem.name || (i.title && i.title === newItem.title));
    if (existing) {
      alert('This item is already in the collection!');
      return;
    }

    const updatedItems = [...collection.items, newItem];
    try {
      const res = await axios.put(`/api/user-collections/${collection.id}`, { items: updatedItems }, {
        headers: { Authorization: token, 'x-user': user }
      });
      if (res.data?.success) {
        const updatedCol = res.data.collection;
        queryClient.setQueryData(['user-collection', id, user], updatedCol);
        queryClient.setQueryData(['user-collections', user], (old: CustomCollection[] | undefined) =>
          old ? old.map(c => c.id === id ? updatedCol : c) : []
        );
        alert(`Added "${newItem.title || newItem.name}" to collection!`);
      }
    } catch (err) {
      console.error('Failed to add item', err);
    }
  };

  // Save Edited Collection
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collection) return;

    try {
      setUpdating(true);
      const res = await axios.put(`/api/user-collections/${collection.id}`, {
        name: editName.trim(),
        description: editDesc.trim(),
        authorName: editAuthor.trim(),
        isPublic: editIsPublic
      }, {
        headers: { Authorization: token, 'x-user': user }
      });

      if (res.data?.success) {
        const updatedCol = res.data.collection;
        queryClient.setQueryData(['user-collection', id, user], updatedCol);
        queryClient.setQueryData(['user-collections', user], (old: CustomCollection[] | undefined) =>
          old ? old.map(c => c.id === id ? updatedCol : c) : []
        );
        setShowEditModal(false);
      }
    } catch (err) {
      console.error('Failed to edit collection', err);
    } finally {
      setUpdating(false);
    }
  };

  // Delete Entire Collection
  const executeDeleteCollection = async () => {
    if (!collection) return;

    try {
      const res = await axios.delete(`/api/user-collections/${collection.id}`, {
        headers: { Authorization: token, 'x-user': user }
      });
      if (res.data?.success) {
        queryClient.setQueryData(['user-collections', user], (old: CustomCollection[] | undefined) =>
          old ? old.filter(c => c.id !== id) : []
        );
        queryClient.invalidateQueries({ queryKey: ['user-collections', user] });
        navigate('/collections');
      }
    } catch (err) {
      console.error('Failed to delete collection', err);
    }
  };

  // Filter & Sort Items
  const filteredItems = useMemo(() => {
    if (!collection || !collection.items) return [];

    return collection.items.filter(item => {
      // Type filter
      if (selectedType === 'Movie' && item.mediaType !== 'movie' && !item.name.toLowerCase().includes('.mkv')) return false;
      if (selectedType === 'TV Show' && item.mediaType !== 'tv' && !item.name.toLowerCase().includes('s01')) return false;

      // Genre filter
      if (selectedGenre !== 'All') {
        if (!item.genres || !item.genres.includes(selectedGenre)) return false;
      }

      // Year filter
      if (minYear !== 'Any' && item.year) {
        if (Number(item.year) < Number(minYear)) return false;
      }
      if (maxYear !== 'Any' && item.year) {
        if (Number(item.year) > Number(maxYear)) return false;
      }

      // Min Rating filter
      if (minRating !== 'Any') {
        const reqRating = parseFloat(minRating.replace('+', ''));
        if ((item.rating || 0) < reqRating) return false;
      }

      // Min Votes filter
      if (minVotes !== 'Any') {
        const voteVal = minVotes === '1K+' ? 1000 : minVotes === '10K+' ? 10000 : minVotes === '50K+' ? 50000 : 100000;
        if ((item.voteCount || 0) < voteVal) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
      if (sortBy === 'title') return (a.title || a.name).localeCompare(b.title || b.name);
      if (sortBy === 'year') return Number(b.year || 0) - Number(a.year || 0);
      if (sortBy === 'runtime') return (b.runtime || '').localeCompare(a.runtime || '');
      return 0;
    });
  }, [collection, selectedType, selectedGenre, minYear, maxYear, minRating, minVotes, sortBy]);

  // Check watched helper
  const isItemWatched = (item: CollectionItem) => {
    if (!Array.isArray(watchedList) || !item) return false;
    const name = (item.name || item.title || '').toLowerCase().trim();
    if (!name) return false;
    const cleanName = parseMediaName(name).cleanName.toLowerCase().trim();

    return watchedList.some(w => {
      const wName = (w.name || w.title || '').toLowerCase().trim();
      if (!wName) return false;
      if (wName === name || wName === cleanName) return true;
      const wClean = parseMediaName(wName).cleanName.toLowerCase().trim();
      return wClean && (wClean === name || wClean === cleanName);
    });
  };

  const isAuthorOrAdmin = collection && (collection.createdBy === user || user === 'admin');

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffcf9] dark:bg-[#08080a] text-black dark:text-white pb-24">
        {/* Skeleton Top Banner */}
        <div className="relative p-6 md:p-10 space-y-6 border-b border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10" />
            <div className="w-24 h-8 rounded-full bg-black/10 dark:bg-white/10" />
          </div>
          <div className="space-y-3">
            <div className="h-8 w-2/3 max-w-md bg-black/10 dark:bg-white/10 rounded-xl" />
            <div className="h-4 w-1/2 max-w-sm bg-black/5 dark:bg-white/5 rounded-lg" />
            <div className="flex gap-3 pt-2">
              <div className="h-6 w-20 bg-black/10 dark:bg-white/10 rounded-full" />
              <div className="h-6 w-24 bg-black/10 dark:bg-white/10 rounded-full" />
            </div>
          </div>
        </div>

        {/* Skeleton Controls Bar */}
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-black/5 dark:bg-white/5">
            <div className="h-9 w-48 bg-black/10 dark:bg-white/10 rounded-xl animate-pulse" />
            <div className="flex gap-2">
              <div className="h-9 w-24 bg-black/10 dark:bg-white/10 rounded-xl animate-pulse" />
              <div className="h-9 w-24 bg-black/10 dark:bg-white/10 rounded-xl animate-pulse" />
            </div>
          </div>

          {/* Skeleton Items Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div key={idx} className="space-y-2">
                <div className="aspect-[2/3] w-full rounded-2xl bg-black/10 dark:bg-white/5 animate-pulse" />
                <div className="h-4 w-3/4 bg-black/10 dark:bg-white/10 rounded-md animate-pulse" />
                <div className="h-3 w-1/2 bg-black/5 dark:bg-white/5 rounded-md animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="min-h-screen bg-[#fffcf9] dark:bg-[#08080a] flex flex-col items-center justify-center text-center p-6 space-y-4">
        <h2 className="text-2xl font-bold">Collection Not Found</h2>
        <p className="text-xs text-gray-400">The collection you are looking for does not exist or is private.</p>
        <button onClick={() => navigate('/collections')} className="px-5 py-2 rounded-full bg-purple-600 text-white text-xs font-bold">
          Back to Collections
        </button>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="-mt-16 min-h-screen bg-[#fffcf9] dark:bg-[#08080a] text-black dark:text-white pb-24 relative overflow-x-hidden max-w-full"
    >
      {/* Top Banner Header */}
      <div className="relative isolate border-b border-black/5 dark:border-white/5 pt-24 md:pt-28 pb-10 px-6 md:px-12 min-h-[45vh] flex flex-col justify-between overflow-hidden">
        {(() => {
          const validItems = collection.items?.filter((i) => i.backdropPath || i.backdrop_path || i.posterPath || i.poster_path) || [];
          const bgItem = validItems.length > 0 ? validItems[0] : null;
          const backdropPath = bgItem?.backdropPath || bgItem?.backdrop_path;
          const posterPath = bgItem?.posterPath || bgItem?.poster_path;
          
          const bgUrl = backdropPath 
            ? (backdropPath.startsWith('http') ? backdropPath : `https://image.tmdb.org/t/p/w1280${backdropPath.startsWith('/') ? backdropPath : `/${backdropPath}`}`)
            : posterPath
              ? (posterPath.startsWith('http') ? posterPath : `https://image.tmdb.org/t/p/w1280${posterPath.startsWith('/') ? posterPath : `/${posterPath}`}`)
              : null;
          return bgUrl ? (
            <>
              <div 
                className="absolute inset-0 bg-cover bg-top opacity-50 dark:opacity-40 pointer-events-none -z-20"
                style={{ backgroundImage: `url(${bgUrl})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#fffcf9] via-[#fffcf9]/80 to-[#fffcf9]/10 dark:from-[#08080a] dark:via-[#08080a]/80 dark:to-[#08080a]/10 pointer-events-none -z-10" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#fffcf9] via-[#fffcf9]/80 to-transparent dark:from-[#08080a] dark:via-[#08080a]/80 dark:to-transparent pointer-events-none -z-10" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-black/5 dark:via-white/5 to-[#fffcf9] dark:to-[#08080a] pointer-events-none -z-10" />
          );
        })()}

        <div className="relative z-10 w-full max-w-7xl mx-auto flex flex-col h-full justify-between gap-12">
          {/* Navigation Bar */}
          <div className="flex items-center justify-between w-full">
            <button 
              onClick={() => navigate('/collections')} 
              className="p-2.5 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-all backdrop-blur-sm"
            >
              <ChevronLeft size={22} />
            </button>
          </div>

          {/* Collection Info Title & Meta & Actions */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mt-auto">
            <div className="max-w-4xl space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight text-black dark:text-white drop-shadow-sm">
                  {collection.name}
                </h1>

                <span className={`px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 backdrop-blur-md ${
                  collection.isPublic ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                }`}>
                  {collection.isPublic ? <Globe size={13} /> : <Lock size={13} />}
                  <span>{collection.isPublic ? 'Public' : 'Private'}</span>
                </span>
              </div>

              <p className="text-sm md:text-base text-gray-700 dark:text-gray-300 leading-relaxed max-w-2xl font-medium drop-shadow-sm">
                {collection.description || 'No description provided.'}
              </p>

              <div className="flex items-center gap-4 text-xs md:text-sm text-gray-600 dark:text-gray-400 font-semibold pt-2">
                <span>By <strong className="text-black dark:text-white">{collection.authorName || 'Anonymous'}</strong></span>
                <span className="opacity-50">•</span>
                <span>{collection.items?.length || 0} Contents</span>
                <span className="opacity-50">•</span>
                <span>Updated {new Date(collection.updatedAt || collection.createdAt).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-2.5 flex-nowrap overflow-x-auto no-scrollbar py-0.5 max-w-full">
              {/* Upvote Button */}
              <button
                onClick={handleUpvote}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold transition-all whitespace-nowrap shrink-0 backdrop-blur-xl backdrop-saturate-[180%] ${
                  collection.upvotes?.includes(user)
                    ? 'bg-purple-600/80 hover:bg-purple-600 text-white border border-purple-400/50 shadow-[0_4px_20px_0_rgba(147,51,234,0.35),inset_0_1px_1px_0_rgba(255,255,255,0.4)]'
                    : 'bg-white/40 dark:bg-black/40 text-gray-900 dark:text-white hover:bg-white/60 dark:hover:bg-black/60 border border-white/60 dark:border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.12),inset_0_1px_1px_0_rgba(255,255,255,0.6)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.3),inset_0_1px_1px_0_rgba(255,255,255,0.2)]'
                }`}
              >
                <ThumbsUp size={14} className={collection.upvotes?.includes(user) ? 'fill-current' : ''} />
                <span>{collection.upvotes?.length || 0} Upvotes</span>
              </button>

              {/* Dim Watched Button */}
              <button
                onClick={() => setDimWatched(!dimWatched)}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold transition-all whitespace-nowrap shrink-0 backdrop-blur-xl backdrop-saturate-[180%] ${
                  dimWatched
                    ? 'bg-purple-600/80 hover:bg-purple-600 text-white border border-purple-400/50 shadow-[0_4px_20px_0_rgba(147,51,234,0.35),inset_0_1px_1px_0_rgba(255,255,255,0.4)]'
                    : 'bg-white/40 dark:bg-black/40 text-gray-900 dark:text-white hover:bg-white/60 dark:hover:bg-black/60 border border-white/60 dark:border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.12),inset_0_1px_1px_0_rgba(255,255,255,0.6)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.3),inset_0_1px_1px_0_rgba(255,255,255,0.2)]'
                }`}
              >
                {dimWatched ? <EyeOff size={14} /> : <Eye size={14} />}
                <span>Dim Watched</span>
              </button>

              {/* Author Edit & Delete options */}
              {isAuthorOrAdmin && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="p-1.5 sm:p-2 rounded-full bg-white/40 dark:bg-black/40 hover:bg-white/60 dark:hover:bg-black/60 text-gray-900 dark:text-white border border-white/60 dark:border-white/20 backdrop-blur-xl backdrop-saturate-[180%] shadow-[0_8px_32px_0_rgba(31,38,135,0.12),inset_0_1px_1px_0_rgba(255,255,255,0.6)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.3),inset_0_1px_1px_0_rgba(255,255,255,0.2)] transition-all"
                    title="Edit Collection"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    onClick={() => setDeleteCollectionConfirm(true)}
                    className="p-1.5 sm:p-2 rounded-full bg-red-500/20 dark:bg-red-500/20 hover:bg-red-500/30 dark:hover:bg-red-500/30 text-red-600 dark:text-red-400 border border-red-500/40 backdrop-blur-xl backdrop-saturate-[180%] shadow-[0_8px_32px_0_rgba(239,68,68,0.2),inset_0_1px_1px_0_rgba(255,255,255,0.4)] transition-all"
                    title="Delete Collection"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Accordion & Sort Controls */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-6 space-y-4">
        
        {/* Accordion Toggle Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-black/5 dark:bg-white/5 p-3 rounded-2xl border border-black/5 dark:border-white/5">
          
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setShowFilterAccordion(!showFilterAccordion);
                if (showSortAccordion) setShowSortAccordion(false);
              }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer border ${
                showFilterAccordion 
                  ? 'bg-purple-600/20 text-purple-400 border-purple-500/30' 
                  : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 border-transparent'
              }`}
            >
              <Filter size={15} />
              <span>Filters</span>
              {showFilterAccordion ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            <button
              onClick={() => {
                setShowSortAccordion(!showSortAccordion);
                if (showFilterAccordion) setShowFilterAccordion(false);
              }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer border ${
                showSortAccordion 
                  ? 'bg-purple-600/20 text-purple-400 border-purple-500/30' 
                  : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 border-transparent'
              }`}
            >
              <ArrowUpDown size={15} />
              <span>Sort</span>
              {showSortAccordion ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          {/* Right Controls: View Layout Toggle */}
          <div className="flex items-center gap-3">
            
            {/* Layout Toggle (List vs Grid) */}
            <div className="flex items-center bg-white dark:bg-neutral-900 rounded-xl p-1 border border-black/10 dark:border-white/10">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-black dark:hover:text-white'}`}
                title="List View"
              >
                <List size={16} />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-black dark:hover:text-white'}`}
                title="Grid View"
              >
                <Grid size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Collapsible Filter Panel */}
        <AnimatePresence>
          {showFilterAccordion && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-2xl p-5 space-y-5 text-xs shadow-lg"
            >
              {/* Filter Row 1: TYPE */}
              <div className="space-y-2">
                <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px]">Type</span>
                <div className="flex flex-wrap items-center gap-2">
                  {['All', 'Movie', 'TV Show'].map(t => (
                    <button
                      key={t}
                      onClick={() => setSelectedType(t)}
                      className={`px-3.5 py-1.5 rounded-full font-semibold transition-all ${
                        selectedType === t
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/10'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filter Row 2: GENRE */}
              <div className="space-y-2">
                <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px]">Genre</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setSelectedGenre('All')}
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      selectedGenre === 'All'
                        ? 'bg-purple-600 text-white'
                        : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    All Genres
                  </button>
                  {ALL_GENRES.map(g => (
                    <button
                      key={g}
                      onClick={() => setSelectedGenre(g)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        selectedGenre === g
                          ? 'bg-purple-600 text-white'
                          : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/10'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filter Row 3: Year Range & Min Rating */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-black/5 dark:border-white/5">
                {/* Min/Max Year */}
                <div>
                  <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px] block mb-1">Release Year</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={minYear}
                      onChange={(e) => setMinYear(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10"
                    >
                      <option value="Any">Min Year (Any)</option>
                      <option value="1960">1960</option>
                      <option value="1980">1980</option>
                      <option value="2000">2000</option>
                      <option value="2010">2010</option>
                      <option value="2020">2020</option>
                    </select>
                    <span>-</span>
                    <select
                      value={maxYear}
                      onChange={(e) => setMaxYear(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10"
                    >
                      <option value="Any">Max Year (Any)</option>
                      <option value="2026">2026</option>
                      <option value="2020">2020</option>
                      <option value="2010">2010</option>
                      <option value="2000">2000</option>
                    </select>
                  </div>
                </div>

                {/* Min Rating */}
                <div>
                  <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px] block mb-1">Min Rating</span>
                  <div className="flex items-center gap-1.5">
                    {['Any', '6+', '7+', '8+'].map(r => (
                      <button
                        key={r}
                        onClick={() => setMinRating(r)}
                        className={`px-3 py-1.5 rounded-xl font-semibold flex-1 ${
                          minRating === r ? 'bg-purple-600 text-white' : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reset Filters */}
                <div className="flex items-end justify-end">
                  <button
                    onClick={() => {
                      setSelectedType('All');
                      setSelectedGenre('All');
                      setMinYear('Any');
                      setMaxYear('Any');
                      setMinRating('Any');
                      setMinVotes('Any');
                    }}
                    className="px-4 py-1.5 rounded-xl text-xs font-bold text-purple-400 hover:bg-purple-500/10 transition-colors"
                  >
                    Reset Filters
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapsible Sort Panel */}
        <AnimatePresence>
          {showSortAccordion && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-2xl p-5 space-y-4 text-xs shadow-lg"
            >
              <div className="space-y-2">
                <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px]">Sort By</span>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { id: 'default', label: 'Position (Default)' },
                    { id: 'rating', label: 'Rating (High to Low)' },
                    { id: 'title', label: 'Title (A-Z)' },
                    { id: 'year', label: 'Release Date (Newest)' },
                    { id: 'runtime', label: 'Runtime' }
                  ].map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSortBy(s.id as any)}
                      className={`px-3.5 py-1.5 rounded-full font-semibold transition-all ${
                        sortBy === s.id
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/10'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collection Items List Display */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-black/10 dark:border-white/10 rounded-2xl bg-black/5 dark:bg-white/5 space-y-3">
            <Film size={40} className="mx-auto text-gray-400 opacity-60" />
            <h3 className="text-base font-bold">No Items Match Filters</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Try adjusting your filter parameters or search provider to add new movies/shows to this collection.
            </p>
            {isAuthorOrAdmin && (
              <button
                onClick={() => setShowProviderModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 dark:bg-black/60 backdrop-blur-xl border border-white/60 dark:border-white/20 shadow-[0_4px_12px_0_rgba(0,0,0,0.1),inset_0_1px_1px_0_rgba(255,255,255,0.7)] dark:shadow-[0_4px_12px_0_rgba(0,0,0,0.4),inset_0_1px_1px_0_rgba(255,255,255,0.3)] text-gray-900 dark:text-white font-bold text-xs hover:scale-105 transition-all"
              >
                <Plus size={16} /> Add
              </button>
            )}
          </div>
        ) : (
          /* Unified View Layout */
          <div className={viewMode === 'grid' ? "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-5" : "flex flex-col gap-3"}>
            {filteredItems.map((item, index) => {
              const watched = isItemWatched(item);
              const shouldDim = dimWatched && watched;
              
              return (
                <div 
                  key={item.id ? `${item.id}_${index}` : index} 
                  className={`relative group/col-item ${viewMode === 'list' ? 'w-full' : ''} ${shouldDim ? 'opacity-40 grayscale saturate-0' : ''} transition-all duration-300`}
                >
                  <ItemCard
                    item={{
                      name: item.name,
                      title: item.title,
                      poster_path: item.posterPath,
                      backdrop_path: item.backdropPath,
                      year: item.year
                    }}
                    category={item.category || 'Movies'}
                    parentPath={item.parentPath || `/home/${item.category || 'Movies'}`}
                    className={viewMode === 'grid' ? "w-full" : ""}
                    viewMode={viewMode}
                    tmdbData={item.posterPath ? {
                      poster_path: item.posterPath,
                      backdrop_path: item.backdropPath,
                      title: item.title,
                      name: item.name,
                      vote_average: item.rating,
                      overview: item.overview,
                      media_type: item.mediaType,
                      release_date: item.year ? `${item.year}-01-01` : undefined,
                      first_air_date: item.year ? `${item.year}-01-01` : undefined
                    } : undefined}
                  />
                  
                  {/* Remove from collection (Author/Admin) */}
                  {isAuthorOrAdmin && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRemoveItemConfirm(index); }}
                      className={`absolute z-30 p-1.5 rounded-full bg-red-500/80 text-white hover:bg-red-500 transition-all hover:scale-110 cursor-pointer opacity-0 group-hover/col-item:opacity-100 shadow-md ${viewMode === 'list' ? 'right-3 top-1/2 -translate-y-1/2' : 'top-2 right-2 sm:top-3 sm:right-3'}`}
                      title="Remove from collection"
                    >
                      <Trash2 size={14} className="sm:w-4 sm:h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Liquid Glass + Add Button */}
      {isAuthorOrAdmin && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowProviderModal(true)}
          className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/50 dark:bg-black/60 backdrop-blur-xl backdrop-saturate-[180%] border border-white/60 dark:border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.18),inset_0_1px_1px_0_rgba(255,255,255,0.7)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.4),inset_0_1px_1px_0_rgba(255,255,255,0.3)] text-gray-900 dark:text-white font-bold text-xs hover:border-purple-500/50 transition-all cursor-pointer"
          title="Add content to collection"
        >
          <Plus size={18} className="text-purple-500 dark:text-purple-400" />
          <span>Add</span>
        </motion.button>
      )}

      {/* Provider Search Modal */}
      <AnimatePresence>
        {showProviderModal && (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-12 sm:pt-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProviderModal(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl bg-white/80 dark:bg-[#1a1a22]/80 backdrop-blur-2xl border border-black/10 dark:border-white/10 rounded-3xl p-6 shadow-2xl z-10 space-y-5 max-h-[85vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-black/10 dark:border-white/10 shrink-0">
                <h3 className="text-xl font-bold flex items-center gap-2 min-w-0">
                  <Search className="text-purple-500 shrink-0" size={22} />
                  <span className="truncate">Search & Add Movies</span>
                </h3>
                <button
                  onClick={() => setShowProviderModal(false)}
                  className="p-1 rounded-full text-gray-400 hover:text-black dark:hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Provider Search Form */}
              <form onSubmit={(e) => { e.preventDefault(); executeSearchProvider(); }} className="flex gap-2 shrink-0">
                <input
                  type="text"
                  required
                  value={providerQuery}
                  onChange={(e) => setProviderQuery(e.target.value)}
                  placeholder="Search movies or TV shows to add..."
                  className="flex-1 min-w-0 px-4 py-2.5 text-xs rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  type="submit"
                  disabled={searchingProvider}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {searchingProvider ? 'Searching...' : <><Search size={16} className="shrink-0" /> Search</>}
                </button>
              </form>

              {/* Search Results */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {searchingProvider ? (
                  <div className="text-center py-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
                  </div>
                ) : providerResults.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-xs">
                    Search for movies and TV shows across the app or provider catalog.
                  </div>
                ) : (
                  providerResults.map((res, i) => {
                    const isAdded = collection?.items.some((item: any) => item.id === res.id || item.name === res.name);
                    return (
                      <ProviderResultItem 
                        key={res.id || i}
                        res={res}
                        isAdded={isAdded}
                        handleAddItemToCollection={handleAddItemToCollection}
                      />
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Collection Modal */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-12 sm:pt-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEditModal(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-white/80 dark:bg-[#1a1a22]/80 backdrop-blur-2xl border border-black/10 dark:border-white/10 rounded-3xl p-6 shadow-2xl z-10 space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-black/10 dark:border-white/10">
                <h3 className="text-xl font-bold flex items-center gap-2 min-w-0">
                  <Edit3 className="text-purple-500" size={20} />
                  <span>Edit Collection</span>
                </h3>
                <button onClick={() => setShowEditModal(false)} className="p-1 text-gray-400 hover:text-black dark:hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold mb-1">Collection Name</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-2 text-xs rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full px-4 py-2 text-xs rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Author Name</label>
                  <input
                    type="text"
                    required
                    value={editAuthor}
                    onChange={(e) => setEditAuthor(e.target.value)}
                    className="w-full px-4 py-2 text-xs rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white"
                  />
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 italic">
                    Note: Please do not use your real username for author name.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-2">Visibility</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setEditIsPublic(true)}
                      className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold ${
                        editIsPublic ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-500'
                      }`}
                    >
                      <Globe size={16} /> Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditIsPublic(false)}
                      className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold ${
                        !editIsPublic ? 'bg-amber-500/10 border-amber-500/40 text-amber-400' : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-500'
                      }`}
                    >
                      <Lock size={16} /> Private
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 text-xs font-bold text-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updating}
                    className="px-5 py-2 rounded-xl bg-purple-600 text-white font-bold text-xs"
                  >
                    {updating ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Collection Confirm Modal */}
      <AnimatePresence>
        {deleteCollectionConfirm && (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-12 sm:pt-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteCollectionConfirm(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white/80 dark:bg-[#1a1a22]/80 backdrop-blur-2xl border border-black/10 dark:border-white/10 rounded-3xl p-6 shadow-2xl z-10 text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center mx-auto mb-2">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-bold text-black dark:text-white">Delete Collection?</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Are you sure you want to delete this collection permanently? This action cannot be undone.
              </p>
              <div className="flex items-center gap-3 pt-2 mt-4">
                <button
                  onClick={() => setDeleteCollectionConfirm(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-gray-700 dark:text-gray-300 font-bold text-xs hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executeDeleteCollection}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white font-bold text-xs shadow-md hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Remove Item Confirm Modal */}
      <AnimatePresence>
        {removeItemConfirm !== null && (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-12 sm:pt-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRemoveItemConfirm(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white/80 dark:bg-[#1a1a22]/80 backdrop-blur-2xl border border-black/10 dark:border-white/10 rounded-3xl p-6 shadow-2xl z-10 text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center mx-auto mb-2">
                <X size={24} />
              </div>
              <h3 className="text-lg font-bold text-black dark:text-white">Remove Item?</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Are you sure you want to remove this item from the collection?
              </p>
              <div className="flex items-center gap-3 pt-2 mt-4">
                <button
                  onClick={() => setRemoveItemConfirm(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-gray-700 dark:text-gray-300 font-bold text-xs hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => executeRemoveItem(removeItemConfirm)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 text-white font-bold text-xs shadow-md hover:bg-amber-600 transition-colors"
                >
                  Remove
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
