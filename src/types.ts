export interface MediaItem {
  id: string | number;
  name: string;
  cleanName: string;
  year?: string;
  type: 'folder' | 'file';
  category: string;
  path?: string; // from openlist
  openlist_path?: string; // added explicitly
  _cached?: any;
  _parent?: string;
  credits?: {
    cast: any[];
    crew: any[];
  };
  releaseDate?: string;
  _digital_release?: boolean;
}

export interface TMDBData {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  first_air_date?: string;
  status?: string;
  genres?: { id: number; name: string }[];
  genre_ids?: number[];
  credits?: {
    cast: any[];
    crew: any[];
  };
}
