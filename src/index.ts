import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { fetchIMDBList, filterTVShows, filterMovies } from './imdb.js';
import { isTMDBConfigured, getCacheStats, clearCache, convertToSonarrFormat } from './tvdb.js';

dotenv.config();
const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware for JSON responses
app.use(express.json());

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

/**
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    tmdbConfigured: isTMDBConfigured(),
    cache: getCacheStats(),
  });
});

/**
 * API documentation
 */
app.get('/', (_req: Request, res: Response) => {
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  res.json({
    name: 'IMDB Watchlist to Sonarr Bridge',
    description: 'Converts IMDB watchlists to Sonarr-compatible custom list format',
    version: '0.1.0',
    endpoints: {
      watchlist: {
        url: `${baseUrl}/watchlist/{userId}`,
        description: 'Get raw IMDB watchlist data (all items)',
        example: `${baseUrl}/watchlist/ur12345678`,
      },
      tvShows: {
        url: `${baseUrl}/watchlist/{userId}/tv`,
        description: 'Get only TV shows from IMDB watchlist',
        example: `${baseUrl}/watchlist/ur12345678/tv`,
      },
      movies: {
        url: `${baseUrl}/watchlist/{userId}/movies`,
        description: 'Get only Movies from IMDB watchlist',
        example: `${baseUrl}/watchlist/ur12345678/movies`,
      },
      list: {
        url: `${baseUrl}/list/{listId}`,
        description: 'Get items from a specific IMDB list',
        example: `${baseUrl}/list/ls036390872`,
      },
    },
    requirements: {
      imdb: 'Your IMDB watchlist must be set to PUBLIC',
      tmdb: 'TMDB_API_KEY environment variable must be set (free at themoviedb.org)',
    },
  });
});

/**
 * Get raw IMDB watchlist
 */
app.get('/watchlist/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const items = await fetchIMDBList(userId);
    const tvShows = filterTVShows(items);
    if (!isTMDBConfigured()) {
      return res.status(503).json({
        error: 'TMDB API key not configured',
        message:
          'Set TMDB_API_KEY env variable (in .env) to enable Sonarr format resolution to TVDB IDs.',
      });
    }
    const sonarrSeries = await convertToSonarrFormat(tvShows);
    res.json(sonarrSeries);
  } catch (error) {
    console.error('[API] Error fetching watchlist:', error);
    res.status(500).json({
      error: 'Failed to fetch watchlist',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get TV shows only from IMDB watchlist
 */
app.get('/watchlist/:userId/tv', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const allItems = await fetchIMDBList(userId);
    const tvShows = filterTVShows(allItems);

    res.json({
      userId,
      totalItems: allItems.length,
      tvShowCount: tvShows.length,
      items: tvShows,
    });
  } catch (error) {
    console.error('[API] Error fetching watchlist:', error);
    res.status(500).json({
      error: 'Failed to fetch watchlist',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get Movies only from IMDB watchlist
 */
app.get('/watchlist/:userId/movies', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const allItems = await fetchIMDBList(userId);
    const movies = filterMovies(allItems);

    res.json({
      userId,
      totalItems: allItems.length,
      movieCount: movies.length,
      items: movies,
    });
  } catch (error) {
    console.error('[API] Error fetching watchlist:', error);
    res.status(500).json({
      error: 'Failed to fetch watchlist',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get IMDB list (not watchlist)
 */
app.get('/list/:listId', async (req: Request, res: Response) => {
  try {
    const { listId } = req.params;
    const items = await fetchIMDBList(listId);
    const tvShows = filterTVShows(items);
    if (!isTMDBConfigured()) {
      return res.status(503).json({
        error: 'TMDB API key not configured',
        message:
          'Set TMDB_API_KEY env variable (in .env) to enable Sonarr format resolution to TVDB IDs.',
      });
    }
    const sonarrSeries = await convertToSonarrFormat(tvShows);
    res.json(sonarrSeries);
  } catch (error) {
    console.error('[API] Error fetching list:', error);
    res.status(500).json({
      error: 'Failed to fetch list',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Admin endpoint to clear cache
 */
app.post('/admin/cache/clear', (_req: Request, res: Response) => {
  clearCache();
  res.json({ message: 'Cache cleared', stats: getCacheStats() });
});

/**
 * Error handler
 */
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  const tmdbStatus = isTMDBConfigured() ? '✓ Configured' : '✗ Not configured (set TMDB_API_KEY)';
  const tmdbStatusPadded = tmdbStatus.padEnd(36);
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║        IMDB API for *arr apps                                  ║
╠════════════════════════════════════════════════════════════════╣
║  Server running at http://localhost:${PORT.toString().padEnd(27)}║
║                                                                ║
║  Endpoints:                                                    ║
║    GET /                         - API documentation           ║
║    GET /watchlist/:userId        - Raw IMDB watchlist          ║
║    GET /watchlist/:userId/tv     - TV shows only               ║
║    GET /watchlist/:userId/movies - Movies only                 ║
║    GET /list/:listId             - IMDB list                   ║
║                                                                ║
║  TMDB API: ${tmdbStatusPadded}                ║
╚════════════════════════════════════════════════════════════════╝
  `);
});

export default app;
