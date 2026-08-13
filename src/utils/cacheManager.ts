import { QueryClient } from '@tanstack/react-query';

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

  if (queryClient) {
    try {
      queryClient.invalidateQueries();
    } catch (e) {
      console.error('Failed to invalidate queryClient queries', e);
    }
  }
}
