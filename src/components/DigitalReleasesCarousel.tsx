import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import ItemCard from './ItemCard';
import { MonitorPlay } from 'lucide-react';
import { parseMediaName } from '../utils/nameParser';

export default function DigitalReleasesCarousel({ categories }: { categories: any[] }) {
  const fetchDigitalReleases = async () => {
    const now = new Date();
    // Get the first and last day of the current month
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const pad = (n: number) => n.toString().padStart(2, '0');
    const firstDayStr = `${firstDay.getFullYear()}-${pad(firstDay.getMonth() + 1)}-${pad(firstDay.getDate())}`;
    const lastDayStr = `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`;

    const params = new URLSearchParams({
      with_release_type: '4', // Digital
      region: 'US', // Specific to US
      'release_date.gte': firstDayStr,
      'release_date.lte': lastDayStr,
      primary_release_year: now.getFullYear().toString(),
      sort_by: 'popularity.desc',
      include_adult: 'false'
    });

    const res = await axios.get(`/api/meta/discover?${params.toString()}`);
    const results = res.data?.results || [];
    const configRes = await axios.get('/api/config').catch(() => null);
    const digitalReleasePaths = configRes?.data?.digitalReleasePaths || {};
    
    const displayItems = results.map((tmdbItem: any) => {
      const releaseDate = tmdbItem.release_date || tmdbItem.first_air_date || '';
      const tmdbYear = releaseDate ? releaseDate.substring(0, 4) : '';

      const cleanTitleForPath = (tmdbItem.title || tmdbItem.name || '').replace(/'/g, '').replace(/[^a-zA-Z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
      const predictedName = `${cleanTitleForPath}.${tmdbYear || now.getFullYear()}`;
      const manualPath = digitalReleasePaths[tmdbItem.id];
      const finalName = manualPath ? manualPath.split('/').pop() : predictedName;
      const finalParent = manualPath ? '/' + manualPath.split('/').slice(0, -1).join('/').replace(/^\//, '') : `/home/MOVIES`;

      return {
        id: tmdbItem.id,
        name: finalName,
        is_dir: true,
        _rec: false,
        _digital_release: true,
        releaseDate: tmdbItem.release_date,
        parentPath: finalParent
      };
    });

    try {
      localStorage.setItem('digital_releases_cache', JSON.stringify({ items: displayItems, tmdbData: results }));
    } catch (e) {}

    return { items: displayItems, tmdbData: results };
  };

  const { data = { items: [], tmdbData: [] }, isLoading: loading } = useQuery({
    queryKey: ['digitalReleasesMonth', categories],
    queryFn: fetchDigitalReleases,
    enabled: categories.length > 0,
    staleTime: 60 * 60 * 1000,
    placeholderData: () => {
      try {
        const cached = localStorage.getItem('digital_releases_cache');
        if (cached) return JSON.parse(cached);
      } catch (e) {}
      return undefined;
    }
  });

  if (loading || !data.items || data.items.length === 0) {
    return null;
  }
  
  const currentMonthName = new Date().toLocaleString('default', { month: 'long' });

  return (
    <div className="relative">
      <div className="flex justify-between items-end mb-2">
        <h3 className="text-lg font-bold text-black dark:text-white flex items-center gap-2">
           <MonitorPlay className="text-blue-500" size={20} />
           Digital Releases {currentMonthName}
        </h3>
      </div>
      <div className="flex overflow-x-auto gap-4 pb-2 scrollbar-hide">
         {data.items.slice(0, 15).map((item: any, i: number) => (
           <ItemCard 
             key={i} 
             item={item} 
             category={item.category || "MOVIES"} 
             parentPath={item.parentPath || `/home/MOVIES`} 
             tmdbData={data.tmdbData[i]} 
           />
         ))}
      </div>
    </div>
  );
}
