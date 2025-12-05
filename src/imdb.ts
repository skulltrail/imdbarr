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
export function parseListId(input: string): { type: 'user' | 'list' | 'url'; id: string } | null {
  input = input.trim();

  // Handle full URLs
  if (input.includes('imdb.com')) {
    // Preserve full URL (may include query like start=)
    return { type: 'url', id: input };
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
function buildListUrl(listInfo: { type: 'user' | 'list' | 'url'; id: string }): string {
  if (listInfo.type === 'url') {
    return listInfo.id;
  }
  if (listInfo.type === 'user') {
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
  if (/\b\d+\s*eps?\b/i.test(metadata)) return 'tvSeries';
  // Check for full word 'episode(s)'
  if (/\bepisodes?\b/i.test(metadata)) return 'tvSeries';
  // Check for 'season(s)'
  if (/\bseasons?\b/i.test(metadata)) return 'tvSeries';
  // Duration patterns like "1h 35m" or "2h" indicate movies
  if (/\b\d+h(\s*\d+m)?\b/.test(metadata) && !/\beps?|episodes?|seasons?\b/i.test(metadata))
    return 'movie';

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

  try {
    const response = await fetch(baseUrl, {
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
    const items = parseIMDBListPage(html);

    console.log(`[IMDB] Parsed ${items.length} items from watchlist`);
    return items;
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

  // 1) Prefer extracting from Next.js bootstrap data when available (often contains full list)
  try {
    const nextDataRaw =
      $('script#__NEXT_DATA__').first().text().trim() ||
      // fallback: inline assignment variant
      $('script')
        .toArray()
        .map((el) => $(el).text())
        .find((t) => /__NEXT_DATA__\s*=\s*\{/.test(t)) ||
      '';

    if (nextDataRaw) {
      const jsonText = nextDataRaw.startsWith('{')
        ? nextDataRaw
        : nextDataRaw.substring(nextDataRaw.indexOf('{'));

      try {
        const root = JSON.parse(jsonText);

        const pushItem = (node: any) => {
          const id: string | undefined =
            (typeof node?.id === 'string' && /^tt\d+$/.test(node.id) ? node.id : undefined) ||
            (typeof node?.const === 'string' && /^tt\d+$/.test(node.const)
              ? node.const
              : undefined) ||
            undefined;
          if (!id || seenIds.has(id)) return;

          const title: string | undefined =
            node?.titleText?.text ||
            node?.originalTitleText?.text ||
            node?.title ||
            node?.name ||
            undefined;

          let rawType: string | undefined =
            (typeof node?.titleType?.id === 'string' ? node.titleType.id : undefined) ||
            (typeof node?.titleType === 'string' ? node.titleType : undefined) ||
            (typeof node?.['@type'] === 'string' ? node['@type'] : undefined);

          let type: IMDBItem['type'] = 'unknown';
          if (rawType) {
            const t = String(rawType).toLowerCase();
            if (t.includes('tvmini')) type = 'tvMiniSeries';
            else if (t.includes('tvseries') || t === 'tvseries') type = 'tvSeries';
            else if (t.includes('movie') || t === 'feature') type = 'movie';
            else if (t.includes('special')) type = 'tvSpecial';
            else if (t.includes('video')) type = 'video';
            else if (t.includes('short')) type = 'short';
          }

          const year: number | undefined =
            (typeof node?.releaseYear?.year === 'number' ? node.releaseYear.year : undefined) ||
            (typeof node?.year === 'number' ? node.year : undefined) ||
            (typeof node?.releaseDate === 'string' && /^(\d{4})/.test(node.releaseDate)
              ? parseInt(node.releaseDate.substring(0, 4))
              : undefined);

          if (title) {
            items.push({ imdbId: id, title, type, year });
            seenIds.add(id);
          }
        };

        const walk = (node: any) => {
          if (!node) return;
          if (typeof node !== 'object') return;
          if (Array.isArray(node)) {
            for (const el of node) walk(el);
            return;
          }
          // Object
          try {
            pushItem(node);
          } catch {}
          for (const key of Object.keys(node)) {
            try {
              walk((node as any)[key]);
            } catch {}
          }
        };

        walk(root);
      } catch {}
    }
  } catch {}

  // 2) Parse from the modern IMDB page structure (anchors)
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

  // 3) Always parse JSON-LD to enrich type detection and fill any missing items
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const data = JSON.parse($(element).text());
      if (data['@type'] === 'ItemList' && Array.isArray(data.itemListElement)) {
        for (const entry of data.itemListElement) {
          const itemData = entry.item;
          if (itemData?.url) {
            const imdbIdMatch = itemData.url.match(/\/title\/(tt\d+)/);
            if (imdbIdMatch) {
              const imdbId = imdbIdMatch[1];
              const atype = (itemData['@type'] || '').toString().toLowerCase();
              const mappedType: IMDBItem['type'] = atype.includes('tvminiseries')
                ? 'tvMiniSeries'
                : atype.includes('tvseries')
                  ? 'tvSeries'
                  : atype.includes('movie')
                    ? 'movie'
                    : atype.includes('tvepisode')
                      ? 'unknown'
                      : 'unknown';

              const existing = items.find((it) => it.imdbId === imdbId);
              if (existing) {
                // Prefer JSON-LD type when provided (it is authoritative)
                if (mappedType !== 'unknown') {
                  existing.type = mappedType;
                }
                if (!existing.year && itemData.datePublished) {
                  existing.year = parseInt(itemData.datePublished.substring(0, 4));
                }
              } else if (!seenIds.has(imdbId)) {
                seenIds.add(imdbId);
                items.push({
                  imdbId,
                  title: itemData.name || 'Unknown',
                  type: mappedType,
                  year: itemData.datePublished
                    ? parseInt(itemData.datePublished.substring(0, 4))
                    : undefined,
                });
              }
            }
          }
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  });

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
