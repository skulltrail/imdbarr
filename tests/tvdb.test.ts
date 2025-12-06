import { describe, expect, test, spyOn, beforeEach, afterEach, mock } from 'bun:test';
import { resolveIMDBToTVDB, convertToSonarrFormat, clearCache } from '../src/tvdb';

// Mock environment variables
process.env.TMDB_API_KEY = 'test_api_key';

describe('TVDB Utils', () => {
    beforeEach(() => {
        clearCache();
        mock.restore();
    });

    describe('resolveIMDBToTVDB', () => {
        test('resolves IMDB ID to TVDB ID via TMDB', async () => {
            const mockFetch = spyOn(global, 'fetch').mockImplementation(async (url) => {
                if (url.toString().includes('/find/')) {
                    return new Response(JSON.stringify({
                        tv_results: [{ id: 1001, name: 'Test Show' }]
                    }));
                }
                if (url.toString().includes('/external_ids')) {
                    return new Response(JSON.stringify({
                        tvdb_id: 2001,
                        id: 1001
                    }));
                }
                return new Response(null, { status: 404 });
            });

            const result = await resolveIMDBToTVDB('tt1234567');

            expect(result).toEqual({
                tvdbId: 2001,
                tmdbId: 1001,
                title: 'Test Show'
            });
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        test('returns null if not found on TMDB', async () => {
            spyOn(global, 'fetch').mockImplementation(async () => {
                return new Response(JSON.stringify({
                    tv_results: []
                }));
            });

            const result = await resolveIMDBToTVDB('tt1234567');
            expect(result).toBeNull();
        });
    });

    describe('convertToSonarrFormat', () => {
        test('converts items to Sonarr format', async () => {
            // Mock resolveIMDBToTVDB internally by mocking fetch again
            // deeper integration test of the module
             spyOn(global, 'fetch').mockImplementation(async (url) => {
                const u = url.toString();
                if (u.includes('/find/')) {
                    return new Response(JSON.stringify({
                        tv_results: [{ id: 1001, name: 'Test Show' }]
                    }));
                }
                if (u.includes('/external_ids')) {
                    return new Response(JSON.stringify({
                        tvdb_id: 2001
                    }));
                }
                return new Response(null, { status: 404 });
            });

            const items: any[] = [
                { imdbId: 'tt1234567', title: 'Test Show', type: 'tvSeries' }
            ];

            const result = await convertToSonarrFormat(items);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                TvdbId: 2001,
                TmdbId: 1001,
                Title: 'Test Show',
                ImdbId: 'tt1234567'
            });
        });
    });
});
