import * as cheerio from 'cheerio';
import type { IMDBItem } from './types.js';

/**
 * Fetches and parses an IMDB watchlist or list
 *
 * IMDB lists can be accessed via:
 * - Public watchlists: https://www.imdb.com/user/urXXXXXXXX/watchlist
 * - Custom lists: https://www.imdb.com/list/lsXXXXXXXXX/
 */

const IMDB_BASE_URL = 'https://www.imdb.com';

/**
 * Parse a watchlist ID from various input formats
 * Supports: ur12345678, ls12345678, full URLs
 */
export function parseListId(input: string): { type: 'user' | 'list'; id: string } | null {
  input = input.trim();

  // Handle full URLs
  if (input.includes('imdb.com')) {
    const userMatch = input.match(/\/user\/(ur\d+)/);
    if (userMatch) {
      return { type: 'user', id: userMatch[1] };
    }
    const listMatch = input.match(/\/list\/(ls\d+)/);
    if (listMatch) {
      return { type: 'list', id: listMatch[1] };
    }
  }

  // Handle direct IDs
  if (input.startsWith('ur') && /^ur\d+$/.test(input)) {
    return { type: 'user', id: input };
  }
  if (input.startsWith('ls') && /^ls\d+$/.test(input)) {
    return { type: 'list', id: input };
  }

  return null;
}

/**
 * Build the URL to fetch the watchlist/list data
 */
function buildListUrl(listInfo: { type: 'user' | 'list'; id: string }): string {
  if (listInfo.type === 'user') {
    // Use detail view to ensure full metadata is rendered server-side
    return `${IMDB_BASE_URL}/user/${listInfo.id}/watchlist?view=detail`;
  }
  return `${IMDB_BASE_URL}/list/${listInfo.id}?view=detail`;
}

/**
 * Determine the content type from IMDB's metadata
 */
function parseIMDBType(metadata: string): IMDBItem['type'] {
  const normalized = metadata.toLowerCase();

  if (normalized.includes('tv series')) return 'tvSeries';
  if (
    normalized.includes('tv mini series') ||
    normalized.includes('mini series') ||
    normalized.includes('mini-series')
  )
    return 'tvMiniSeries';
  if (normalized.includes('tv special')) return 'tvSpecial';
  if (normalized.includes('video')) return 'video';
  if (normalized.includes('short')) return 'short';
  // Check for episode count pattern like "6 eps" or "22 eps"
  if (/\d+\s*eps?/i.test(metadata)) return 'tvSeries';
  // Duration patterns like "1h 35m" or "2h" indicate movies
  if (/\d+h(\s*\d+m)?$/.test(metadata.trim()) || /^\d+m$/.test(metadata.trim())) return 'movie';

  return 'unknown';
}

/**
 * Fetch and parse items from an IMDB watchlist or list
 */
export async function fetchIMDBList(listIdOrUrl: string): Promise<IMDBItem[]> {
  const listInfo = parseListId(listIdOrUrl);

  if (!listInfo) {
    throw new Error(
      `Invalid IMDB list ID or URL: ${listIdOrUrl}. Expected format: ur12345678, ls12345678, or full IMDB URL`
    );
  }

  const baseUrl = buildListUrl(listInfo);
  console.log(`[IMDB] Fetching list from: ${baseUrl}`);

  const allItems: IMDBItem[] = [];
  const seen = new Set<string>();
  const maxPages = 10; // safety cap

  try {
    for (let page = 1; page <= maxPages; page++) {
      const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}page=${page}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Watchlist not found. Make sure the watchlist is public.`);
        }
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const pageItems = parseIMDBListPage(html);

      // Stop if page has no items (end of pagination)
      if (pageItems.length === 0) {
        break;
      }

      for (const it of pageItems) {
        if (!seen.has(it.imdbId)) {
          seen.add(it.imdbId);
          allItems.push(it);
        }
      }

      // Detect absence of pagination "Next" link to break early
      if (!/href="[^"]*page=\d+"[^>]*>\s*Next\s*</i.test(html) && page > 1) {
        break;
      }
    }

    console.log(`[IMDB] Aggregated ${allItems.length} items across pages`);
    return allItems;
  } catch (error) {
    console.error(`[IMDB] Failed to fetch list:`, error);
    throw error;
  }
}

/**
 * Parse IMDB list page HTML and extract items
 */
function parseIMDBListPage(html: string): IMDBItem[] {
  const $ = cheerio.load(html);
  const items: IMDBItem[] = [];
  const seenIds = new Set<string>();

  // Parse from the modern IMDB page structure
  // Look for links to titles and their metadata
  // New UI: target container items first
  $('[data-testid="list-page-mc-list-item"] a[href*="/title/tt"], a[href*="/title/tt"]').each(
    (_, element) => {
      const $el = $(element);
      const href = $el.attr('href') || '';
      const imdbIdMatch = href.match(/\/title\/(tt\d+)/);

      if (imdbIdMatch && !seenIds.has(imdbIdMatch[1])) {
        const imdbId = imdbIdMatch[1];
        seenIds.add(imdbId);

        // Try to get the title
        let title = $el.text().trim();

        // Skip if it's just a number (list index) or empty
        if (!title || /^\d+\.?$/.test(title)) {
          // Try to find title in parent container
          const $container = $el.closest('.ipc-metadata-list-summary-item, .lister-item');
          title = $container.find('.ipc-title__text, .lister-item-header a').first().text().trim();
        }

        // Clean up title (remove leading numbers like "1. ")
        title = title.replace(/^\d+\.\s*/, '');

        if (!title) title = 'Unknown';

        // Get metadata to determine type
        const $listItem = $el.closest(
          '.ipc-metadata-list-summary-item, .lister-item, [data-testid="list-page-mc-list-item"]'
        );
        const metadataText = $listItem.text();

        // Extract year
        const yearMatch = metadataText.match(/\b(19|20)\d{2}\b/);
        const year = yearMatch ? parseInt(yearMatch[0]) : undefined;

        // Determine type based on metadata
        const type = parseIMDBType(metadataText);

        items.push({ imdbId, title, type, year });
      }
    }
  );

  // If we didn't find items through links, try JSON-LD
  if (items.length === 0) {
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const data = JSON.parse($(element).text());
        if (data['@type'] === 'ItemList' && Array.isArray(data.itemListElement)) {
          for (const item of data.itemListElement) {
            const itemData = item.item;
            if (itemData?.url) {
              const imdbIdMatch = itemData.url.match(/\/title\/(tt\d+)/);
              if (imdbIdMatch && !seenIds.has(imdbIdMatch[1])) {
                seenIds.add(imdbIdMatch[1]);
                const atype = (itemData['@type'] || '').toString().toLowerCase();
                const type: IMDBItem['type'] = atype.includes('tvminiseries')
                  ? 'tvMiniSeries'
                  : atype.includes('tvseries')
                    ? 'tvSeries'
                    : 'unknown';
                items.push({
                  imdbId: imdbIdMatch[1],
                  title: itemData.name || 'Unknown',
                  type,
                  year: itemData.datePublished
                    ? parseInt(itemData.datePublished.substring(0, 4))
                    : undefined,
                });
              }
            }
          }
        }
      } catch {
        // Ignore JSON parse errors
      }
    });
  }

  console.log(`[IMDB] Parsed ${items.length} items from list`);
  return items;
}

/**
 * Filter IMDB items to only TV shows (series and mini-series)
 */
export function filterTVShows(items: IMDBItem[]): IMDBItem[] {
  return items.filter((item) => item.type === 'tvSeries' || item.type === 'tvMiniSeries');
}

/**
 * Get items that could potentially be TV shows (includes unknown)
 */
export function filterPotentialTVShows(items: IMDBItem[]): IMDBItem[] {
  return items.filter(
    (item) => item.type === 'tvSeries' || item.type === 'tvMiniSeries' || item.type === 'unknown'
  );
}

/**
 * Filter IMDB items to only Movies
 */
export function filterMovies(items: IMDBItem[]): IMDBItem[] {
  return items.filter((item) => item.type === 'movie');
}
