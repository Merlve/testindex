import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import { getTmdbImage } from '../utils/tmdbImage';
import { 
  Library, ChevronLeft, Plus, Search, Filter, Globe, Lock, 
  ThumbsUp, Bookmark, Sparkles, X, Check, Eye, SlidersHorizontal, User, Trash2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';

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

export default function CollectionsPage() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch collections via React Query (caches data across navigations)
  const { data: collections = [], isLoading: loading } = useQuery<CustomCollection[]>({
    queryKey: ['user-collections', user],
    queryFn: async () => {
      const res = await axios.get('/api/user-collections', {
        headers: { Authorization: token, 'x-user': user }
      });
      return res.data?.collections || [];
    },
    enabled: !!token,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  // Fetch watched items via React Query
  const { data: watchedList = [] } = useQuery<any[]>({
    queryKey: ['watched-list', user],
    queryFn: async () => {
      const res = await axios.get('/api/watched', {
        headers: { Authorization: token, 'x-user': user }
      }).catch(() => ({ data: { watched: [] } }));
      return res.data?.watched || [];
    },
    enabled: !!token,
    staleTime: 1000 * 60 * 5,
  });

  // Filter & Search states
  const [activeTab, setActiveTab] = useState<'all' | 'Lists' | 'Franchises'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [authorFilter, setAuthorFilter] = useState<'all' | 'admin' | 'users'>('all');
  const [sortBy, setSortBy] = useState<'top_voted' | 'most_recent' | 'alphabetical' | 'most_items'>('top_voted');

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColDesc, setNewColDesc] = useState('');
  const [newColAuthor, setNewColAuthor] = useState('');
  const [newColIsPublic, setNewColIsPublic] = useState(true);
  const [newColTag, setNewColTag] = useState<'Lists' | 'Franchises'>('Lists');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const isAdmin = user === 'admin';

  // Handle Collection Selection
  const toggleSelect = (e: React.MouseEvent, colId: string) => {
    e.stopPropagation();
    setSelectedCollections(prev => 
      prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]
    );
  };

  const executeBatchDelete = async () => {
    try {
      await Promise.all(selectedCollections.map(id => 
        axios.delete(`/api/user-collections/${id}`, { headers: { Authorization: token, 'x-user': user } })
      ));
      queryClient.setQueryData(['user-collections', user], (old: CustomCollection[] | undefined) =>
        old ? old.filter(c => !selectedCollections.includes(c.id)) : []
      );
      queryClient.invalidateQueries({ queryKey: ['user-collections', user] });
      setSelectedCollections([]);
      setShowBatchDeleteConfirm(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Upvote / Save
  const handleUpvote = async (e: React.MouseEvent, colId: string) => {
    e.stopPropagation();
    try {
      const res = await axios.post(`/api/user-collections/${colId}/upvote`, {}, {
        headers: { Authorization: token, 'x-user': user }
      });
      if (res.data?.success) {
        queryClient.setQueryData(['user-collections', user], (old: CustomCollection[] | undefined) => {
          if (!old) return [];
          return old.map(c => {
            if (c.id === colId) {
              const hasUpvoted = c.upvotes?.includes(user);
              const updatedUpvotes = hasUpvoted
                ? c.upvotes.filter(u => u !== user)
                : [...(c.upvotes || []), user];
              return { ...c, upvotes: updatedUpvotes };
            }
            return c;
          });
        });
        queryClient.invalidateQueries({ queryKey: ['user-collection', colId, user] });
      }
    } catch (err) {
      console.error('Failed to upvote collection', err);
    }
  };

  // Handle Collection Creation
  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (!newColName.trim()) {
      setModalError('Please enter a collection name.');
      return;
    }
    if (!newColAuthor.trim()) {
      setModalError('Please enter an author name.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await axios.post('/api/user-collections', {
        name: newColName.trim(),
        description: newColDesc.trim(),
        authorName: newColAuthor.trim(),
        isPublic: newColIsPublic,
        categoryTag: newColTag,
        items: []
      }, {
        headers: { Authorization: token, 'x-user': user }
      });

      if (res.data?.success) {
        const newCol = res.data.collection;
        queryClient.setQueryData(['user-collections', user], (old: CustomCollection[] | undefined) =>
          old ? [newCol, ...old] : [newCol]
        );
        queryClient.setQueryData(['user-collection', newCol.id, user], newCol);
        setShowCreateModal(false);
        // Reset fields
        setNewColName('');
        setNewColDesc('');
        setNewColAuthor('');
        setNewColIsPublic(true);
        // Navigate to newly created collection detail
        navigate(`/collection/${newCol.id}`);
      }
    } catch (err: any) {
      setModalError(err.response?.data?.error || 'Failed to create collection');
    } finally {
      setSubmitting(false);
    }
  };

  // Helper to compute watched percentage for a collection
  const getWatchedStats = (items: CollectionItem[]) => {
    if (!items || items.length === 0) return { watchedCount: 0, total: 0, percentage: 0 };
    const watchedNames = new Set(watchedList.map(w => w.name.toLowerCase()));
    let count = 0;
    items.forEach(item => {
      const nameMatch = item.name ? watchedNames.has(item.name.toLowerCase()) : false;
      const titleMatch = item.title ? watchedNames.has(item.title.toLowerCase()) : false;
      if (nameMatch || titleMatch) count++;
    });
    const percentage = Math.round((count / items.length) * 100);
    return { watchedCount: count, total: items.length, percentage };
  };

  // Filter & Sort collections
  const filteredCollections = useMemo(() => {
    return collections.filter(col => {
      // Tab filter
      if (activeTab !== 'all' && col.categoryTag !== activeTab) return false;

      // Text Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = col.name.toLowerCase().includes(q);
        const descMatch = col.description.toLowerCase().includes(q);
        const authorMatch = col.authorName.toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !authorMatch) return false;
      }

      // Author filter
      if (authorFilter === 'admin') {
        if (col.createdBy !== 'admin') return false;
      } else if (authorFilter === 'users') {
        if (col.createdBy === 'admin') return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'top_voted') {
        return (b.upvotes?.length || 0) - (a.upvotes?.length || 0);
      } else if (sortBy === 'most_recent') {
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      } else if (sortBy === 'alphabetical') {
        return a.name.localeCompare(b.name);
      } else if (sortBy === 'most_items') {
        return (b.items?.length || 0) - (a.items?.length || 0);
      }
      return 0;
    });
  }, [collections, activeTab, searchQuery, authorFilter, sortBy]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffcf9] dark:bg-[#08080a] text-black dark:text-white pb-24">
        <div className="max-w-7xl mx-auto px-4 md:px-8 pt-6 space-y-6">
          {/* Top Header Skeleton */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 animate-pulse" />
              <div className="space-y-2">
                <div className="h-7 w-48 bg-black/10 dark:bg-white/10 rounded-xl animate-pulse" />
                <div className="h-3 w-64 bg-black/5 dark:bg-white/5 rounded-lg animate-pulse" />
              </div>
            </div>
            <div className="h-10 w-36 bg-purple-600/30 rounded-full animate-pulse" />
          </div>

          {/* Filter Bar Skeleton */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
            <div className="flex items-center gap-2">
              <div className="h-8 w-16 bg-black/10 dark:bg-white/10 rounded-xl animate-pulse" />
              <div className="h-8 w-16 bg-black/10 dark:bg-white/10 rounded-xl animate-pulse" />
              <div className="h-8 w-20 bg-black/10 dark:bg-white/10 rounded-xl animate-pulse" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-48 bg-black/10 dark:bg-white/10 rounded-xl animate-pulse" />
              <div className="h-8 w-28 bg-black/10 dark:bg-white/10 rounded-xl animate-pulse" />
            </div>
          </div>

          {/* Collection Grid Skeletons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div 
                key={idx}
                className="bg-white/40 dark:bg-white/5 border border-white/20 dark:border-white/10 rounded-3xl overflow-hidden shadow-md flex flex-col justify-between"
              >
                {/* Banner Skeleton */}
                <div className="h-44 bg-neutral-900/60 dark:bg-neutral-900/80 relative overflow-hidden flex items-center justify-center p-4">
                  <div className="relative w-full h-full flex items-center justify-center">
                    {[-40, -15, 10, 35].map((offX, pIdx) => (
                      <div
                        key={pIdx}
                        style={{ transform: `translateX(${offX}px) rotate(${[-10, -3, 3, 10][pIdx]}deg)` }}
                        className="absolute w-20 h-32 rounded-lg bg-white/10 dark:bg-white/10 border border-white/10 animate-pulse"
                      />
                    ))}
                  </div>
                </div>

                {/* Body Details Skeleton */}
                <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="h-5 w-3/4 bg-black/10 dark:bg-white/10 rounded-lg animate-pulse" />
                    <div className="h-3 w-full bg-black/5 dark:bg-white/5 rounded-md animate-pulse" />
                    <div className="h-3 w-2/3 bg-black/5 dark:bg-white/5 rounded-md animate-pulse" />
                  </div>
                  <div className="space-y-3 pt-2">
                    <div className="h-2 w-full bg-black/10 dark:bg-white/10 rounded-full animate-pulse" />
                    <div className="flex items-center justify-between">
                      <div className="h-4 w-20 bg-black/10 dark:bg-white/10 rounded-full animate-pulse" />
                      <div className="h-4 w-12 bg-black/10 dark:bg-white/10 rounded-full animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-[#fffcf9] dark:bg-[#08080a] text-black dark:text-white pb-24"
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-6 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)} 
              className="p-2 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-all text-current"
            >
              <ChevronLeft size={22} />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                  <Library className="text-purple-500" size={24} />
                  <span>Collections</span>
                </h1>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="p-2 rounded-full bg-white/80 dark:bg-black/50 hover:bg-white dark:hover:bg-black text-gray-800 dark:text-gray-200 backdrop-blur-md border border-black/10 dark:border-white/10 transition-all shadow-sm flex-shrink-0"
                  title="Create Collection"
                >
                  <Plus size={18} />
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {filteredCollections.length} {filteredCollections.length === 1 ? 'collection' : 'collections'} available
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            {isAdmin && selectedCollections.length > 0 && (
              <button
                onClick={() => setShowBatchDeleteConfirm(true)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white font-semibold text-sm shadow-sm transition-all cursor-pointer"
              >
                <Trash2 size={18} />
                <span>Delete ({selectedCollections.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Filters & Control Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-black/5 dark:bg-white/5 p-3 rounded-2xl border border-black/5 dark:border-white/5">
          
          {/* Category Tabs: Lists / Franchises / All */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab('Lists')}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'Lists'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              Lists
            </button>
            <button
              onClick={() => setActiveTab('Franchises')}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'Franchises'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              Franchises
            </button>
          </div>

          {/* Search & Select Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search collections..."
                className="w-full pl-9 pr-4 py-1.5 text-xs rounded-xl bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black dark:hover:text-white">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Content Type Filter */}
            <select
              value={authorFilter}
              onChange={(e: any) => setAuthorFilter(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
            >
              <option value="all">All Content</option>
              <option value="admin">Admin</option>
              <option value="users">Users</option>
            </select>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
            >
              <option value="top_voted">Top Voted</option>
              <option value="most_recent">Most Recent</option>
              <option value="alphabetical">Alphabetical</option>
              <option value="most_items">Most Items</option>
            </select>
          </div>
        </div>

        {/* Collection Grid Cards */}
        {filteredCollections.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-black/10 dark:border-white/10 rounded-3xl bg-black/5 dark:bg-white/5 space-y-3">
            <Library size={48} className="mx-auto text-gray-400 opacity-60" />
            <h3 className="text-lg font-bold">No Collections Found</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Create your first custom collection or adjust your search filters to find existing collections.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-600 text-white font-medium text-xs hover:bg-purple-500 transition-all"
            >
              <Plus size={16} /> Create Collection
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredCollections.map((col) => {
              const { watchedCount, total, percentage } = getWatchedStats(col.items);
              const isUpvoted = col.upvotes?.includes(user);
              const upvoteCount = col.upvotes?.length || 0;

              return (
                <motion.div
                  key={col.id}
                  whileHover={{ y: -4 }}
                  onClick={() => navigate(`/collection/${col.id}`)}
                  className="group relative cursor-pointer bg-white/40 dark:bg-white/5 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 flex flex-col justify-between"
                >
                  {/* Admin Selection Checkbox */}
                  {isAdmin && (
                    <div 
                      className="absolute top-3 left-3 z-20"
                      onClick={(e) => toggleSelect(e, col.id)}
                    >
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center border-2 transition-colors cursor-pointer ${
                        selectedCollections.includes(col.id) 
                          ? 'bg-purple-600 border-purple-600' 
                          : 'bg-black/40 border-white/40 hover:border-white/80 backdrop-blur-sm'
                      }`}>
                        {selectedCollections.includes(col.id) && <Check size={14} className="text-white" />}
                      </div>
                    </div>
                  )}

                  {/* Poster Stack Fan Banner */}
                  <div className="h-44 bg-neutral-900 relative isolate overflow-hidden flex items-center justify-center p-4">
                    {(() => {
                      const validItems = col.items?.filter((i) => i.backdropPath || i.backdrop_path || i.posterPath || i.poster_path) || [];
                      const bgItem = validItems.length > 0 ? validItems[0] : null;
                      const backdropPath = bgItem?.backdropPath || bgItem?.backdrop_path;
                      const posterPath = bgItem?.posterPath || bgItem?.poster_path;
                      
                      const bgUrl = backdropPath 
                        ? (backdropPath.startsWith('http') ? backdropPath : getTmdbImage(backdropPath, 'backdrop'))
                        : posterPath
                          ? (posterPath.startsWith('http') ? posterPath : getTmdbImage(posterPath, 'backdrop'))
                          : null;
                      return bgUrl ? (
                        <div 
                          className="absolute inset-0 bg-cover bg-center opacity-70 dark:opacity-60 blur-md scale-110 transition-transform duration-500 group-hover:scale-125 -z-20"
                          style={{ backgroundImage: `url(${bgUrl})` }}
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-neutral-900 to-neutral-950 -z-20" />
                      );
                    })()}
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-900/60 to-transparent pointer-events-none -z-10" />
                    
                    {col.items && col.items.length > 0 ? (
                      <div className="relative z-10 w-full h-full flex items-center justify-center">
                        {col.items.slice(0, 4).map((item, idx) => {
                          const itemPosterPath = item.posterPath || item.poster_path;
                          const posterUrl = itemPosterPath 
                            ? (itemPosterPath.startsWith('http') ? itemPosterPath : getTmdbImage(itemPosterPath, 'poster'))
                            : null;
                          const rotateDegs = [-12, -4, 4, 12];
                          const offsetX = [-50, -20, 10, 40];

                          return (
                            <div
                              key={idx}
                              style={{
                                transform: `translateX(${offsetX[idx] || 0}px) rotate(${rotateDegs[idx] || 0}deg)`,
                                zIndex: idx + 1
                              }}
                              className="absolute w-20 h-32 rounded-lg overflow-hidden border border-white/20 shadow-2xl transition-transform group-hover:scale-105"
                            >
                              {posterUrl ? (
                                <img src={posterUrl} alt={item.title || item.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-neutral-800 flex items-center justify-center text-[10px] text-gray-400 p-1 text-center font-bold leading-tight">
                                  {item.title || item.name}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-gray-400 gap-2 relative z-10">
                        <Library size={36} className="opacity-40" />
                        <span className="text-xs font-semibold">Empty Collection</span>
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-transparent pointer-events-none" />

                    {/* Visibility Tag */}
                    <div className={`absolute top-3 ${isAdmin ? 'left-12' : 'left-3'} z-10 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-bold text-white flex items-center gap-1.5`}>
                      {col.isPublic ? (
                        <>
                          <Globe size={12} className="text-emerald-400" />
                          <span>Public</span>
                        </>
                      ) : (
                        <>
                          <Lock size={12} className="text-amber-400" />
                          <span>Private</span>
                        </>
                      )}
                    </div>

                    {/* Category Tag badge if any */}
                    {col.categoryTag && (
                      <div className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full bg-purple-900/80 backdrop-blur-md border border-purple-400/30 text-[10px] font-bold text-purple-200">
                        {col.categoryTag}
                      </div>
                    )}
                  </div>

                  {/* Body Details */}
                  <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-base text-black dark:text-white line-clamp-1 group-hover:text-purple-500 transition-colors">
                        {col.name}
                      </h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-1 leading-relaxed">
                        {col.description || 'No description provided.'}
                      </p>
                    </div>

                    {/* Progress & Item Meta */}
                    <div className="space-y-2 pt-2 border-t border-black/5 dark:border-white/5">
                      <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                        <span>{col.items?.length || 0} Contents</span>
                        <span>{watchedCount}/{total} watched ({percentage}%)</span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card Footer: Author & Upvotes */}
                  <div className="px-5 py-3.5 bg-black/5 dark:bg-white/5 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-purple-600/20 text-purple-400 flex items-center justify-center font-bold text-[10px] border border-purple-500/30 shrink-0">
                        {col.authorName ? col.authorName.charAt(0).toUpperCase() : 'A'}
                      </div>
                      <span className="truncate font-semibold">{col.authorName || 'Anonymous'}</span>
                    </div>

                    <button
                      onClick={(e) => handleUpvote(e, col.id)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                        isUpvoted
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/20'
                      }`}
                    >
                      <ThumbsUp size={13} className={isUpvoted ? 'fill-current' : ''} />
                      <span>{upvoteCount}</span>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Batch Delete Confirm Modal */}
      <AnimatePresence>
        {showBatchDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-12 sm:pt-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBatchDeleteConfirm(false)}
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
              <h3 className="text-lg font-bold text-black dark:text-white">Delete Collections?</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Are you sure you want to delete {selectedCollections.length} collection(s)? This will not delete the actual files.
              </p>
              <div className="flex items-center gap-3 pt-2 mt-4">
                <button
                  onClick={() => setShowBatchDeleteConfirm(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-gray-700 dark:text-gray-300 font-bold text-xs hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executeBatchDelete}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white font-bold text-xs shadow-md hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Liquid Glass + Create Collection Button */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setShowCreateModal(true)}
        className="fixed bottom-[88px] right-6 md:bottom-[112px] md:right-8 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/50 dark:bg-black/60 backdrop-blur-xl backdrop-saturate-[180%] border border-white/60 dark:border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.18),inset_0_1px_1px_0_rgba(255,255,255,0.7)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.4),inset_0_1px_1px_0_rgba(255,255,255,0.3)] text-gray-900 dark:text-white font-bold text-xs hover:border-purple-500/50 transition-all cursor-pointer"
        title="Create New Collection"
      >
        <Plus size={18} className="text-purple-500 dark:text-purple-400" />
        <span>Create Collection</span>
      </motion.button>

      {/* Create Collection Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-12 sm:pt-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateModal(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-lg bg-white/80 dark:bg-[#1a1a22]/80 backdrop-blur-2xl border border-black/10 dark:border-white/10 rounded-3xl p-6 shadow-2xl z-10 space-y-5"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-black/10 dark:border-white/10">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Library className="text-purple-500" size={22} />
                  <span>Create New Collection</span>
                </h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 rounded-full text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Error Alert */}
              {modalError && (
                <div className="p-3 text-xs bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl font-medium">
                  {modalError}
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleCreateCollection} className="space-y-4">
                {/* Collection Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Collection Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value)}
                    placeholder="e.g. Epic Historical & Period Adventures"
                    className="w-full px-4 py-2.5 text-xs rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={newColDesc}
                    onChange={(e) => setNewColDesc(e.target.value)}
                    placeholder="Describe what movies/shows belong in this collection..."
                    className="w-full px-4 py-2 text-xs rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  />
                </div>

                {/* Author Name with Subtle Note */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Author Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newColAuthor}
                    onChange={(e) => setNewColAuthor(e.target.value)}
                    placeholder="e.g. CinemaFan99"
                    className="w-full px-4 py-2.5 text-xs rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  {/* Subtle Text Notice */}
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 font-medium italic">
                    Note: Please do not use your real username for author name.
                  </p>
                </div>

                {/* Category Tag (Lists vs Franchises) */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Collection Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewColTag('Lists')}
                      className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                        newColTag === 'Lists'
                          ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                          : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 border-black/10 dark:border-white/10'
                      }`}
                    >
                      Lists
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewColTag('Franchises')}
                      className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                        newColTag === 'Franchises'
                          ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                          : 'bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-400 border-black/10 dark:border-white/10'
                      }`}
                    >
                      Franchises
                    </button>
                  </div>
                </div>

                {/* Visibility Toggle Switch */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                    Visibility Mode
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setNewColIsPublic(true)}
                      className={`p-3 rounded-2xl border flex items-center gap-3 transition-all ${
                        newColIsPublic
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 ring-2 ring-emerald-500/30'
                          : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-500'
                      }`}
                    >
                      <Globe size={20} className="shrink-0" />
                      <div className="text-left">
                        <div className="text-xs font-bold">Public</div>
                        <div className="text-[10px] opacity-75">All users can discover</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewColIsPublic(false)}
                      className={`p-3 rounded-2xl border flex items-center gap-3 transition-all ${
                        !newColIsPublic
                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 ring-2 ring-amber-500/30'
                          : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-500'
                      }`}
                    >
                      <Lock size={20} className="shrink-0" />
                      <div className="text-left">
                        <div className="text-xs font-bold">Private</div>
                        <div className="text-[10px] opacity-75">Only author can view</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Submit Action */}
                <div className="pt-3 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50"
                  >
                    {submitting ? 'Creating...' : 'Create & Add Media'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
