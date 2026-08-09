const RECENT_SEARCHES_KEY = 'shindex_recent_searches';

export function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .slice(0, 5);
      }
    }
  } catch (e) {
    console.error('Failed to read recent searches', e);
  }
  return [];
}

export function saveRecentSearch(term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) return getRecentSearches();
  try {
    const existing = getRecentSearches();
    const filtered = existing.filter(item => item.toLowerCase() !== trimmed.toLowerCase());
    const updated = [trimmed, ...filtered].slice(0, 5);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Failed to save recent search', e);
  }
  return getRecentSearches();
}

export function removeRecentSearch(term: string): string[] {
  try {
    const existing = getRecentSearches();
    const updated = existing.filter(item => item.toLowerCase() !== term.toLowerCase());
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Failed to remove recent search', e);
  }
  return getRecentSearches();
}

export function clearRecentSearches(): string[] {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch (e) {
    console.error('Failed to clear recent searches', e);
  }
  return [];
}
