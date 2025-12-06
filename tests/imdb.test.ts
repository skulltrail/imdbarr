import { describe, expect, test } from 'bun:test';
import { parseListId, parseIMDBType, parseIMDBListPage, filterTVShows, filterPotentialTVShows } from '../src/imdb';

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
            const html = `
                <html>
                <script id="__NEXT_DATA__" type="application/json">
                    {
                        "props": {
                            "pageProps": {
                                "mainColumnData": {
                                    "predefinedList": {
                                        "titleListItemSearch": {
                                            "edges": [
                                                { "node": { "id": "tt1234567", "titleText": { "text": "Test Series" }, "titleType": { "id": "tvSeries" }, "releaseYear": { "year": 2023 } } }
                                            ]
                                        }
                                    }
                                }
                            }
                        }
                    }
                </script>
                </html>
            `;
            // NOTE: The implementation of parseIMDBListPage recursively walks the JSON.
            // The structure above is a simplified plausible guess.
            // Let's create a structure closer to what the walker expects: ANY object with id/const, title, etc.

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
});
