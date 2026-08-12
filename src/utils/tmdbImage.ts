export type ImageQuality = 'low' | 'medium' | 'high' | 'original';

export function getTmdbImage(path: string | null | undefined, type: 'poster' | 'backdrop' | 'profile' | 'still'): string | null {
    if (!path) return null;
    if (path.startsWith('http')) return path;

    const quality = (localStorage.getItem('shutter_image_quality') as ImageQuality) || 'high';

    let size = 'original';

    if (type === 'poster') {
        if (quality === 'low') size = 'w342';
        else if (quality === 'medium') size = 'w500';
        else if (quality === 'high') size = 'w780';
        else size = 'original';
    } else if (type === 'backdrop') {
        if (quality === 'low') size = 'w780';
        else if (quality === 'medium') size = 'w1280';
        else if (quality === 'high') size = 'w1280';
        else size = 'original'; 
    } else if (type === 'profile') {
        if (quality === 'low') size = 'w185';
        else if (quality === 'medium') size = 'w500';
        else if (quality === 'high') size = 'h632';
        else size = 'original';
    } else if (type === 'still') {
        if (quality === 'low') size = 'w300';
        else if (quality === 'medium') size = 'w500';
        else if (quality === 'high') size = 'w780';
        else size = 'original';
    }

    const safePath = path.startsWith('/') ? path : `/${path}`;
    const tmdbUrl = `https://image.tmdb.org/t/p/${size}${safePath}`;
    return `/api/image-proxy?url=${encodeURIComponent(tmdbUrl)}`;
}
