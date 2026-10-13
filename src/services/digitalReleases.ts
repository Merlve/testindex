import axios from 'axios';

export interface DigitalReleaseItem {
  id: number;
  name: string;
  is_dir: boolean;
  _rec: boolean;
  _digital_release: boolean;
  releaseDate: string;
  digitalReleaseDate?: string;
  digital_release_date?: string;
  parentPath: string;
  openlist_path?: string;
  category: string;
  tmdbData: any;
}

export interface DigitalReleasesData {
  items: DigitalReleaseItem[];
  tmdbData: any[];
}

export async function fetchDigitalReleasesForMonth(year: number, monthIndex: number): Promise<DigitalReleasesData> {
  // Get the first and last day of the requested month
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const firstDayStr = `${firstDay.getFullYear()}-${pad(firstDay.getMonth() + 1)}-${pad(firstDay.getDate())}`;
  const lastDayStr = `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`;

  const params = new URLSearchParams({
    gte: firstDayStr,
    lte: lastDayStr
  });
  
  let results: any[] = [];
  try {
    const res = await axios.get(`/api/meta/digital-releases-strict?${params.toString()}`);
    results = res.data?.results || [];
  } catch (e) {
    console.error(`Failed to fetch digital releases for ${year}-${monthIndex + 1}:`, e);
  }

  const configRes = await axios.get('/api/config').catch(() => null);
  const digitalReleasePaths = configRes?.data?.digitalReleasePaths || {};
  
  const displayItems: DigitalReleaseItem[] = results.map((tmdbItem: any) => {
    const digitalDate = tmdbItem.digital_release_date;
    const releaseDate = digitalDate || tmdbItem.release_date || tmdbItem.first_air_date || '';
    const tmdbYear = releaseDate ? releaseDate.substring(0, 4) : '';

    const cleanTitleForPath = (tmdbItem.title || tmdbItem.name || '').replace(/'/g, '').replace(/[^a-zA-Z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
    const predictedName = `${cleanTitleForPath}.${tmdbYear || year}`;
    const manualPath = digitalReleasePaths[tmdbItem.id];
    const finalName = manualPath ? manualPath.split('/').pop() : predictedName;
    const finalParent = manualPath ? '/' + manualPath.split('/').slice(0, -1).join('/').replace(/^\//, '') : `/home/MOVIES`;

    return {
      id: tmdbItem.id,
      name: finalName,
      is_dir: true,
      _rec: false,
      _digital_release: true,
      releaseDate: digitalDate || tmdbItem.release_date,
      digitalReleaseDate: digitalDate,
      digital_release_date: digitalDate,
      parentPath: finalParent,
      openlist_path: manualPath ? `/${manualPath.replace(/^\//, '')}` : undefined,
      category: 'MOVIES',
      tmdbData: tmdbItem
    };
  });

  const cacheKey = `digital_releases_cache_${year}_${pad(monthIndex + 1)}`;
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ items: displayItems, tmdbData: results }));
    const now = new Date();
    if (year === now.getFullYear() && monthIndex === now.getMonth()) {
      localStorage.setItem('digital_releases_cache_v3', JSON.stringify({ items: displayItems, tmdbData: results }));
    }
  } catch (e) {}

  return { items: displayItems, tmdbData: results };
}

export async function fetchDigitalReleases(): Promise<DigitalReleasesData> {
  const now = new Date();
  return fetchDigitalReleasesForMonth(now.getFullYear(), now.getMonth());
}
