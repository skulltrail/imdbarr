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
export function parseIMDBType(metadata: string): IMDBItem['type'] {
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
 * Options for fetching IMDB lists
 */
export interface FetchIMDBListOptions {
  /**
   * Whether to fetch all pages of the list (default: true)
   * When true, automatically fetches all pages and merges the results
   * When false, fetches only the first page (up to 250 items)
   */
  fetchAll?: boolean;

  /**
   * Maximum number of items to fetch (only used when fetchAll is true)
   * If not specified, fetches all items
   */
  maxItems?: number;

  /**
   * Specific page to fetch (1-indexed, only used when fetchAll is false)
   * Each page contains up to 250 items
   */
  page?: number;
}

/**
 * Result from fetching an IMDB list with pagination info
 */
export interface FetchIMDBListResult {
  items: IMDBItem[];
  totalItems: number;
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
}

const ITEMS_PER_PAGE = 250;

/**
 * Extract total item count from IMDB list page HTML
 */
export function extractListMetadata(html: string): { totalItems: number; listTitle?: string } {
  const $ = cheerio.load(html);
  let totalItems = 0;
  let listTitle: string | undefined;

  try {
    const nextDataRaw = $('script#__NEXT_DATA__').first().text().trim();
    if (nextDataRaw) {
      const data = JSON.parse(nextDataRaw);

      // Try to get from the known path first: mainColumnData.list.titleListItemSearch.total
      const listData = data?.props?.pageProps?.mainColumnData?.list;
      if (listData?.titleListItemSearch?.total) {
        totalItems = listData.titleListItemSearch.total;
        listTitle = listData.name?.text || listData.name?.originalText;
      }

      // Fallback: search recursively for total/totalCount (but avoid episode counts)
      if (!totalItems) {
        const findListTotal = (obj: any, path = ''): number => {
          if (!obj || typeof obj !== 'object') return 0;
          // Skip episode data which also has 'total' fields
          if (path.includes('episodes')) return 0;
          // Look for titleListItemSearch.total specifically
          if (obj.titleListItemSearch?.total) return obj.titleListItemSearch.total;
          // Look for list-level totalCount
          if (path.includes('list') && typeof obj.totalCount === 'number') return obj.totalCount;
          for (const key of Object.keys(obj)) {
            if (typeof obj[key] === 'object') {
              const found = findListTotal(obj[key], path + '.' + key);
              if (found > 0) return found;
            }
          }
          return 0;
        };
        totalItems = findListTotal(data);
      }
    }
  } catch {}

  // Extract list title if not already set
  if (!listTitle) {
    listTitle =
      $('h1').first().text().trim() ||
      $('[data-testid="list-page-title"]').first().text().trim() ||
      undefined;
  }

  return { totalItems, listTitle };
}

/**
 * Fetch a single page of an IMDB list
 */
async function fetchIMDBListPage(
  baseUrl: string,
  page: number = 1
): Promise<{ html: string; items: IMDBItem[] }> {
  // Add page parameter for pagination (IMDB uses page=N, not start=N)
  const url = new URL(baseUrl);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  // Ensure we're in detail view for better parsing
  if (!url.searchParams.has('view')) {
    url.searchParams.set('view', 'detail');
  }

  const finalUrl = url.toString();
  console.log(`[IMDB] Fetching page from: ${finalUrl}`);

  const response = await fetch(finalUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      Referer: 'https://www.google.com/',
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

  return { html, items };
}

/**
 * Fetch and parse items from an IMDB watchlist or list with pagination support
 *
 * @param listIdOrUrl - IMDB list ID (ur12345678, ls12345678) or full URL
 * @param options - Pagination options (fetchAll, maxItems, page)
 * @returns Array of IMDB items (when using simple mode) or detailed result with pagination info
 */
export async function fetchIMDBList(
  listIdOrUrl: string,
  options?: FetchIMDBListOptions
): Promise<IMDBItem[]>;
export async function fetchIMDBList(
  listIdOrUrl: string,
  options: FetchIMDBListOptions & { detailed: true }
): Promise<FetchIMDBListResult>;
export async function fetchIMDBList(
  listIdOrUrl: string,
  options: FetchIMDBListOptions & { detailed?: boolean } = {}
): Promise<IMDBItem[] | FetchIMDBListResult> {
  const { fetchAll = true, maxItems, page, detailed = false } = options;

  const listInfo = parseListId(listIdOrUrl);

  if (!listInfo) {
    throw new Error(
      `Invalid IMDB list ID or URL: ${listIdOrUrl}. Expected format: ur12345678, ls12345678, or full IMDB URL`
    );
  }

  const baseUrl = buildListUrl(listInfo);
  console.log(`[IMDB] Fetching list from: ${baseUrl} (fetchAll: ${fetchAll})`);

  try {
    // Fetch the first page to get metadata
    const requestedPage = page || 1;
    const { html: firstHtml, items: firstPageItems } = await fetchIMDBListPage(
      baseUrl,
      requestedPage
    );
    const { totalItems } = extractListMetadata(firstHtml);

    // Calculate total pages
    const effectiveTotal = totalItems || firstPageItems.length;
    const totalPages = Math.ceil(effectiveTotal / ITEMS_PER_PAGE);

    console.log(`[IMDB] List metadata: totalItems=${effectiveTotal}, totalPages=${totalPages}`);

    // If not fetching all, or only one page exists, return first page
    if (!fetchAll || page !== undefined || totalPages <= 1) {
      console.log(`[IMDB] Returning single page with ${firstPageItems.length} items`);

      if (detailed) {
        return {
          items: firstPageItems,
          totalItems: effectiveTotal,
          currentPage: page || 1,
          totalPages,
          hasMore: (page || 1) < totalPages,
        };
      }
      return firstPageItems;
    }

    // Fetch all remaining pages
    const allItems = [...firstPageItems];
    const seenIds = new Set(allItems.map((item) => item.imdbId));
    let currentPage = 2;

    while (currentPage <= totalPages) {
      // Check if we've hit the maxItems limit
      if (maxItems && allItems.length >= maxItems) {
        console.log(`[IMDB] Reached maxItems limit (${maxItems}), stopping`);
        break;
      }

      console.log(`[IMDB] Fetching page ${currentPage}/${totalPages}`);

      try {
        const { items: pageItems } = await fetchIMDBListPage(baseUrl, currentPage);

        // Add only new items (avoid duplicates)
        let addedCount = 0;
        for (const item of pageItems) {
          if (!seenIds.has(item.imdbId)) {
            seenIds.add(item.imdbId);
            allItems.push(item);
            addedCount++;

            // Check maxItems limit
            if (maxItems && allItems.length >= maxItems) {
              break;
            }
          }
        }

        console.log(
          `[IMDB] Page ${currentPage}: added ${addedCount} new items (total: ${allItems.length})`
        );

        // If no new items were added, we've likely reached the end
        if (addedCount === 0) {
          console.log(`[IMDB] No new items found, stopping pagination`);
          break;
        }
      } catch (pageError) {
        console.error(`[IMDB] Failed to fetch page ${currentPage}:`, pageError);
        // Continue with what we have
        break;
      }

      currentPage++;

      // Small delay to be respectful to IMDB servers
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Apply maxItems limit if specified
    const finalItems = maxItems ? allItems.slice(0, maxItems) : allItems;

    console.log(`[IMDB] Fetched ${finalItems.length} total items from ${currentPage - 1} pages`);

    if (detailed) {
      return {
        items: finalItems,
        totalItems: effectiveTotal,
        currentPage: 1,
        totalPages,
        hasMore: false, // We fetched all
      };
    }
    return finalItems;
  } catch (error) {
    console.error(`[IMDB] Failed to fetch list:`, error);
    throw error;
  }
}

/**
 * Parse IMDB list page HTML and extract items
 */
export function parseIMDBListPage(html: string): IMDBItem[] {
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
