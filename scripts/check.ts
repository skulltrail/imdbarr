import { parseListId } from '../src/imdb.js';
import { filterTVShows, filterMovies } from '../src/imdb.js';
import * as cheerio from 'cheerio';
import * as fs from 'fs/promises';

interface IMDBItem {
  imdbId: string;
  title: string;
  type: 'movie' | 'tvSeries' | 'tvMiniSeries' | 'tvSpecial' | 'video' | 'short' | 'unknown';
  year?: number;
}

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

  console.log(`[Parser] Parsed ${items.length} items from HTML`);
  return items;
}

async function main() {
  const id = process.argv[2] || 'ur12345678';

  // Try to load from saved HTML file first
  let html: string;
  try {
    html = await fs.readFile(`/tmp/watchlist_${id}.html`, 'utf-8');
    console.log(`[Debug] Using saved HTML from /tmp/watchlist_${id}.html`);
  } catch {
    console.log(`[Debug] Fetching fresh HTML from IMDB...`);
    console.log(`[Debug] To avoid 503 errors, you can save the HTML manually:`);
    console.log(
      `  curl -H "User-Agent: Mozilla/5.0" "https://www.imdb.com/user/${id}/watchlist?view=detail" > /tmp/watchlist_${id}.html`
    );
    console.log(`  Then run this script again.`);

    const base = `https://www.imdb.com/user/${id}/watchlist?view=detail`;
    const resp = await fetch(base, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!resp.ok) {
      throw new Error(`HTTP error ${resp.status}: ${resp.statusText}`);
    }

    html = await resp.text();
    // Save for future use
    await fs.writeFile(`/tmp/watchlist_${id}.html`, html);
    console.log(`[Debug] Saved HTML to /tmp/watchlist_${id}.html`);
  }

  const items = parseIMDBListPage(html);
  const tv = filterTVShows(items);
  const movies = filterMovies(items);
  const typeCounts = items.reduce<Record<string, number>>((acc, it) => {
    acc[it.type] = (acc[it.type] || 0) + 1;
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        id,
        totalItems: items.length,
        tvShowCount: tv.length,
        movieCount: movies.length,
        typeCounts,
        tvTitles: tv.map((t) => t.title),
        movieTitles: movies.map((t) => t.title).slice(0, 10),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
