import { QueryClient } from '@tanstack/react-query';
import { clearImageCache } from './imageCache';
import { clearPaletteCache } from './colorExtractor';

// Hard global reset: explicitly clears everything (only for admin "Force Global Cache Reset")
export function clearAllLocalCaches(queryClient?: QueryClient) {
  try {
    localStorage.removeItem('recently_added_cache');
    localStorage.removeItem('dashboard_cache');
    localStorage.removeItem('trending_cache');
    localStorage.removeItem('genres_cache');
    localStorage.removeItem('digital_releases_cache');
  } catch (e) {
    console.error('Failed to clear localStorage caches', e);
  }

  clearImageCache();
  clearPaletteCache();

  if (queryClient) {
    try {
      queryClient.clear();
      queryClient.invalidateQueries();
    } catch (e) {
      console.error('Failed to invalidate queryClient queries', e);
    }
  }

  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key && (key.startsWith('category_state_') || key.includes('shindex-featured'))) {
        sessionStorage.removeItem(key);
      }
    }
  } catch (e) {}
}

// Gentle, seamless refresh: updates background queries without unmounting UI or wiping cache
export function softRefreshMediaCaches(queryClient?: QueryClient) {
  if (queryClient) {
    try {
      // Invalidate relevant queries so React Query fetches in the background
      // WITHOUT clearing current data (no loading spinners or blank screens)
      queryClient.invalidateQueries({ queryKey: ['recentlyAdded'] });
      queryClient.invalidateQueries({ queryKey: ['trending'] });
      queryClient.invalidateQueries({ queryKey: ['digitalReleasesMonth'] });
      queryClient.invalidateQueries({ queryKey: ['featured'] });
      queryClient.invalidateQueries({ queryKey: ['tmdb'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['details'] });
    } catch (e) {
      console.error('Failed to soft refresh queries', e);
    }
  }
}
