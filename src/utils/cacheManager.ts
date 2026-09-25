import { QueryClient } from '@tanstack/react-query';
import { clearImageCache } from './imageCache';

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
