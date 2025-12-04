/**
 * Sonarr Custom List format
 * This is the format that Sonarr expects from custom import lists
 */
export interface SonarrSeries {
  TvdbId: number;
  Title?: string;
  TmdbId?: number;
  ImdbId?: string;
}

/**
 * IMDB item from watchlist
 */
export interface IMDBItem {
  imdbId: string;
  title: string;
  type: 'movie' | 'tvSeries' | 'tvMiniSeries' | 'tvSpecial' | 'video' | 'short' | 'unknown';
  year?: number;
}

/**
 * TMDB TV Show search result
 */
export interface TMDBSearchResult {
  id: number;
  name: string;
  first_air_date?: string;
  external_ids?: {
    imdb_id?: string;
    tvdb_id?: number;
  };
}

/**
 * TMDB TV Show external IDs response
 */
export interface TMDBExternalIds {
  id: number;
  imdb_id?: string;
  tvdb_id?: number;
  tvrage_id?: number | null;
}

/**
 * TMDB Find by IMDB ID response
 */
export interface TMDBFindResponse {
  tv_results: Array<{
    id: number;
    name: string;
    first_air_date?: string;
  }>;
  movie_results: Array<{
    id: number;
    title: string;
    release_date?: string;
  }>;
}

/**
 * Cache entry for resolved series
 */
export interface CachedSeries {
  tvdbId: number;
  tmdbId?: number;
  title: string;
  imdbId: string;
  resolvedAt: number;
}

/**
 * API Configuration
 */
export interface APIConfig {
  port: number;
  tmdbApiKey?: string;
  cacheTtlSeconds: number;
}
