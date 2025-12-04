import NodeCache from 'node-cache';
import type { IMDBItem, SonarrSeries, TMDBExternalIds, TMDBFindResponse } from './types.js';

/**
 * TMDB API client to resolve IMDB IDs to TVDB IDs
 * TMDB is used because it has a free API that can look up by IMDB ID
 * and provides TVDB IDs which Sonarr requires
 */

const TMDB_API_BASE = 'https://api.themoviedb.org/3';

// Cache resolved IDs for 24 hours to reduce API calls
const cache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });

/**
 * Get the TMDB API key from environment
 */
function getTMDBApiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    throw new Error(
      'TMDB_API_KEY environment variable is not set. Get a free API key at https://www.themoviedb.org/settings/api'
    );
  }
  return key;
}

/**
 * Find a TV show on TMDB by its IMDB ID
 */
async function findByIMDBId(imdbId: string): Promise<{ tmdbId: number; name: string } | null> {
  const apiKey = getTMDBApiKey();
  const url = `${TMDB_API_BASE}/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[TMDB] Find request failed for ${imdbId}: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as TMDBFindResponse;

    // Check TV results first
    if (data.tv_results && data.tv_results.length > 0) {
      const show = data.tv_results[0];
      return { tmdbId: show.id, name: show.name };
    }

    return null;
  } catch (error) {
    console.error(`[TMDB] Error finding ${imdbId}:`, error);
    return null;
  }
}

/**
 * Get external IDs (including TVDB) for a TMDB TV show
 */
async function getExternalIds(tmdbId: number): Promise<TMDBExternalIds | null> {
  const apiKey = getTMDBApiKey();
  const url = `${TMDB_API_BASE}/tv/${tmdbId}/external_ids?api_key=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[TMDB] External IDs request failed for TMDB ID ${tmdbId}: ${response.status}`);
      return null;
    }

    return (await response.json()) as TMDBExternalIds;
  } catch (error) {
    console.error(`[TMDB] Error getting external IDs for ${tmdbId}:`, error);
    return null;
  }
}

/**
 * Resolve an IMDB ID to TVDB ID via TMDB
 */
export async function resolveIMDBToTVDB(
  imdbId: string
): Promise<{ tvdbId: number; tmdbId?: number; title: string } | null> {
  // Check cache first
  const cached = cache.get<{ tvdbId: number; tmdbId?: number; title: string }>(imdbId);
  if (cached) {
    console.log(`[Cache] Hit for ${imdbId}: TVDB ${cached.tvdbId}`);
    return cached;
  }

  console.log(`[TMDB] Resolving ${imdbId} to TVDB ID...`);

  // Find the show on TMDB
  const findResult = await findByIMDBId(imdbId);
  if (!findResult) {
    console.log(`[TMDB] No TV show found for ${imdbId}`);
    return null;
  }

  // Get the TVDB ID
  const externalIds = await getExternalIds(findResult.tmdbId);
  if (!externalIds?.tvdb_id) {
    console.log(`[TMDB] No TVDB ID found for ${imdbId} (TMDB: ${findResult.tmdbId})`);
    return null;
  }

  const result = {
    tvdbId: externalIds.tvdb_id,
    tmdbId: findResult.tmdbId,
    title: findResult.name,
  };

  // Cache the result
  cache.set(imdbId, result);
  console.log(`[TMDB] Resolved ${imdbId} -> TVDB ${result.tvdbId}`);

  return result;
}

/**
 * Convert IMDB items to Sonarr-compatible format
 * This resolves IMDB IDs to TVDB IDs which Sonarr requires
 */
export async function convertToSonarrFormat(items: IMDBItem[]): Promise<SonarrSeries[]> {
  const results: SonarrSeries[] = [];

  // Process items with some concurrency but not too aggressive
  const batchSize = 5;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          const resolved = await resolveIMDBToTVDB(item.imdbId);
          if (resolved) {
            const series: SonarrSeries = {
              TvdbId: resolved.tvdbId,
              Title: resolved.title || item.title,
              ImdbId: item.imdbId,
            };
            if (resolved.tmdbId) {
              series.TmdbId = resolved.tmdbId;
            }
            return series;
          }
        } catch (error) {
          console.error(`[Convert] Error processing ${item.imdbId}:`, error);
        }
        return null;
      })
    );

    results.push(...batchResults.filter((r): r is SonarrSeries => r !== null));

    // Small delay between batches to be nice to the API
    if (i + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return results;
}

/**
 * Check if TMDB API key is configured
 */
export function isTMDBConfigured(): boolean {
  return !!process.env.TMDB_API_KEY;
}

/**
 * Clear the resolution cache
 */
export function clearCache(): void {
  cache.flushAll();
  console.log('[Cache] Cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { keys: number; hits: number; misses: number } {
  const stats = cache.getStats();
  return {
    keys: cache.keys().length,
    hits: stats.hits,
    misses: stats.misses,
  };
}
