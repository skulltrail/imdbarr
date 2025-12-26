import { describe, expect, test, mock, beforeAll, afterAll } from 'bun:test';
import { parseListId, parseIMDBType, parseIMDBListPage, filterTVShows, filterPotentialTVShows, extractListMetadata, fetchIMDBList } from '../src/imdb';
import type { IMDBItem } from '../src/types';

describe('IMDB Utils', () => {
    describe('parseListId', () => {
        test('parses user watchlist ID', () => {
            expect(parseListId('ur12345678')).toEqual({ type: 'user', id: 'ur12345678' });
        });

        test('parses list ID', () => {
            expect(parseListId('ls12345678')).toEqual({ type: 'list', id: 'ls12345678' });
        });

        test('parses full URL', () => {
            const url = 'https://www.imdb.com/user/ur12345678/watchlist';
            expect(parseListId(url)).toEqual({ type: 'url', id: url });
        });

        test('returns null for invalid input', () => {
            expect(parseListId('invalid')).toBeNull();
            expect(parseListId('12345678')).toBeNull();
        });
    });

    describe('parseIMDBType', () => {
        test('identifies TV series', () => {
            expect(parseIMDBType('TV Series')).toBe('tvSeries');
            expect(parseIMDBType('12 eps')).toBe('tvSeries');
            expect(parseIMDBType('2 seasons')).toBe('tvSeries');
            expect(parseIMDBType('TV Special')).toBe('tvSpecial');
        });

        test('identifies Movies', () => {
            expect(parseIMDBType('Movie')).toBe('unknown'); // "Movie" string isn't explicitly checked, falls to unknown unless duration matches
            expect(parseIMDBType('1h 30m')).toBe('movie');
        });

        test('identifies Mini Series', () => {
            expect(parseIMDBType('TV Mini Series')).toBe('tvMiniSeries');
            expect(parseIMDBType('Mini-Series')).toBe('tvMiniSeries');
        });
    });

    describe('filterTVShows', () => {
        test('filters only TV Series and Mini Series', () => {
            const items = [
                { imdbId: '1', title: 'Show 1', type: 'tvSeries' },
                { imdbId: '2', title: 'Movie 1', type: 'movie' },
                { imdbId: '3', title: 'Mini Series 1', type: 'tvMiniSeries' },
                { imdbId: '4', title: 'Unknown', type: 'unknown' },
            ] as any;

            const result = filterTVShows(items);
            expect(result).toHaveLength(2);
            expect(result.map(i => i.imdbId)).toEqual(['1', '3']);
        });
    });

    describe('filterPotentialTVShows', () => {
        test('includes Unknown types', () => {
            const items = [
                { imdbId: '1', title: 'Show 1', type: 'tvSeries' },
                { imdbId: '2', title: 'Movie 1', type: 'movie' },
                { imdbId: '3', title: 'Mini Series 1', type: 'tvMiniSeries' },
                { imdbId: '4', title: 'Unknown', type: 'unknown' },
            ] as any;

            const result = filterPotentialTVShows(items);
            expect(result).toHaveLength(3);
            expect(result.map(i => i.imdbId)).toEqual(['1', '3', '4']);
        });
    });

    describe('parseIMDBListPage', () => {
        test('parses items from NEXT_DATA json', () => {
             const htmlSimple = `
                <html>
                <script id="__NEXT_DATA__">
                    {
                        "someList": [
                            {
                                "id": "tt1234567",
                                "titleText": { "text": "Test Series" },
                                "titleType": { "id": "tvSeries" },
                                "releaseYear": { "year": 2023 }
                            },
                             {
                                "id": "tt7654321",
                                "titleText": { "text": "Test Movie" },
                                "titleType": { "id": "movie" },
                                "releaseYear": { "year": 2020 }
                            }
                        ]
                    }
                </script>
                </html>
            `;

            const results = parseIMDBListPage(htmlSimple);
            expect(results).toHaveLength(2);
            expect(results[0]).toEqual({ imdbId: 'tt1234567', title: 'Test Series', type: 'tvSeries', year: 2023 });
            expect(results[1]).toEqual({ imdbId: 'tt7654321', title: 'Test Movie', type: 'movie', year: 2020 });
        });
    });

    describe('extractListMetadata', () => {
        test('extracts total from "of X titles" pattern', () => {
            const html = `
                <html><body>
                    <div>Showing 1-250 of 1,523 titles</div>
                </body></html>
            `;
            const { totalItems } = extractListMetadata(html);
            expect(totalItems).toBe(1523);
        });

        test('extracts total from "X titles" pattern', () => {
            const html = `
                <html><body>
                    <div>523 titles in this list</div>
                </body></html>
            `;
            const { totalItems } = extractListMetadata(html);
            expect(totalItems).toBe(523);
        });

        test('extracts total from NEXT_DATA', () => {
            const html = `
                <html>
                <script id="__NEXT_DATA__">
                    {
                        "props": {
                            "pageProps": {
                                "mainColumnData": {
                                    "list": {
                                        "total": 1000
                                    }
                                }
                            }
                        }
                    }
                </script>
                </html>
            `;
            const { totalItems } = extractListMetadata(html);
            expect(totalItems).toBe(1000);
        });

        test('returns 0 when no count found', () => {
            const html = `<html><body><div>Some random content</div></body></html>`;
            const { totalItems } = extractListMetadata(html);
            expect(totalItems).toBe(0);
        });
    });

    describe('fetchIMDBList pagination', () => {
        // Helper to generate mock HTML page with items
        function generateMockPage(startIndex: number, count: number, totalItems: number): string {
            const items = [];
            for (let i = 0; i < count; i++) {
                const idx = startIndex + i;
                items.push({
                    id: `tt${String(idx).padStart(7, '0')}`,
                    titleText: { text: `Title ${idx}` },
                    titleType: { id: idx % 3 === 0 ? 'tvSeries' : 'movie' },
                    releaseYear: { year: 2020 + (idx % 5) }
                });
            }
            return `
                <html>
                <body>Showing ${startIndex}-${startIndex + count - 1} of ${totalItems} titles</body>
                <script id="__NEXT_DATA__">
                    { "items": ${JSON.stringify(items)} }
                </script>
                </html>
            `;
        }

        // Store original fetch
        const originalFetch = globalThis.fetch;
        let fetchCallCount = 0;
        let lastFetchUrls: string[] = [];

        beforeAll(() => {
            // Mock fetch for testing
            globalThis.fetch = mock(async (url: string | URL | Request) => {
                fetchCallCount++;
                const urlStr = url.toString();
                lastFetchUrls.push(urlStr);

                // Parse the start parameter
                const urlObj = new URL(urlStr);
                const start = parseInt(urlObj.searchParams.get('start') || '1', 10);

                // Total of 1000 items, 250 per page
                const totalItems = 1000;
                const itemsPerPage = 250;
                const pageStart = start;
                const itemsOnPage = Math.min(itemsPerPage, totalItems - pageStart + 1);

                if (itemsOnPage <= 0) {
                    // Empty page
                    return new Response(generateMockPage(pageStart, 0, totalItems), { status: 200 });
                }

                return new Response(generateMockPage(pageStart, itemsOnPage, totalItems), { status: 200 });
            }) as typeof fetch;
        });

        afterAll(() => {
            globalThis.fetch = originalFetch;
        });

        test('fetchAll=true fetches all 1000 items across 4 pages', async () => {
            fetchCallCount = 0;
            lastFetchUrls = [];

            const items = await fetchIMDBList('ls123456789', { fetchAll: true });

            // Should have fetched 4 pages (1000 items / 250 per page)
            expect(fetchCallCount).toBe(4);
            expect(items.length).toBe(1000);

            // Check first and last items
            expect(items[0].imdbId).toBe('tt0000001');
            expect(items[999].imdbId).toBe('tt0001000');
        });

        test('fetchAll=false returns only first page (250 items)', async () => {
            fetchCallCount = 0;
            lastFetchUrls = [];

            const items = await fetchIMDBList('ls123456789', { fetchAll: false });

            // Should have fetched only 1 page
            expect(fetchCallCount).toBe(1);
            expect(items.length).toBe(250);

            // Check it's the first page
            expect(items[0].imdbId).toBe('tt0000001');
            expect(items[249].imdbId).toBe('tt0000250');
        });

        test('maxItems=500 limits to 500 items', async () => {
            fetchCallCount = 0;
            lastFetchUrls = [];

            const items = await fetchIMDBList('ls123456789', { fetchAll: true, maxItems: 500 });

            // Should have fetched 2 pages (500 items / 250 per page)
            expect(fetchCallCount).toBe(2);
            expect(items.length).toBe(500);
        });

        test('page=2 with fetchAll=false fetches only page 2', async () => {
            fetchCallCount = 0;
            lastFetchUrls = [];

            const items = await fetchIMDBList('ls123456789', { fetchAll: false, page: 2 });

            // Should have fetched only 1 page
            expect(fetchCallCount).toBe(1);

            // URL should have start=251 (page 2)
            expect(lastFetchUrls[0]).toContain('start=251');

            // Items should be from page 2 (251-500)
            expect(items[0].imdbId).toBe('tt0000251');
            expect(items.length).toBe(250);
        });

        test('default behavior (no options) fetches all pages', async () => {
            fetchCallCount = 0;
            lastFetchUrls = [];

            const items = await fetchIMDBList('ls123456789');

            // Should have fetched all 4 pages
            expect(fetchCallCount).toBe(4);
            expect(items.length).toBe(1000);
        });
    });
});
