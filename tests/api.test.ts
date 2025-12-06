import { describe, expect, test, spyOn, beforeEach, afterEach, mock } from 'bun:test';
import request from 'supertest';
import * as imdb from '../src/imdb';
import * as tvdb from '../src/tvdb';
import app from '../src/index';

describe('API Integration', () => {
    beforeEach(() => {
        // Mock IMDB functions
        spyOn(imdb, 'fetchIMDBList').mockImplementation(async (id: string) => {
            if (id === 'error') throw new Error('Mock error');
            return [
                { imdbId: 'tt1', title: 'Show 1', type: 'tvSeries' },
                { imdbId: 'tt2', title: 'Movie 1', type: 'movie' }
            ] as any;
        });

        spyOn(imdb, 'filterTVShows').mockImplementation((items: any[]) =>
            items.filter((i: any) => i.type === 'tvSeries' || i.type === 'tvMiniSeries')
        );

        // Mock TVDB functions
        spyOn(tvdb, 'isTMDBConfigured').mockReturnValue(true);
        spyOn(tvdb, 'convertToSonarrFormat').mockImplementation(async (items: any[]) => items.map((i: any) => ({
            TvdbId: 12345,
            Title: i.title,
            ImdbId: i.imdbId
        })));
        spyOn(tvdb, 'getCacheStats').mockReturnValue({ keys: 0, hits: 0, misses: 0 });
    });

    afterEach(() => {
        // Restore all spies
        mock.restore();
    });

    describe('GET /health', () => {
        test('returns health status', async () => {
            const res = await request(app).get('/health');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ok');
        });
    });

    describe('GET /watchlist/:userId', () => {
        test('returns watchlist items', async () => {
            const res = await request(app).get('/watchlist/ur12345678');
            expect(res.status).toBe(200);
            expect(res.body.items).toHaveLength(2);
            expect(res.body.totalItems).toBe(2);
        });

        test('handles errors', async () => {
            const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
            const res = await request(app).get('/watchlist/error');
            expect(res.status).toBe(500);
            expect(errorSpy).toHaveBeenCalled();
            errorSpy.mockRestore();
        });
    });

    describe('GET /watchlist/:userId/tv', () => {
        test('returns sonarr format', async () => {
            const res = await request(app).get('/watchlist/ur12345678/tv');
            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].TvdbId).toBe(12345);
        });
    });
});
