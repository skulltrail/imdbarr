import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { fetchIMDBList, filterTVShows } from './imdb.js';
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
    name: 'IMDB API for Sonarr',
    description: 'Convert IMDB watchlists to Sonarr-compatible custom list format',
    version: '0.6.1',
    endpoints: {
      watchlist: {
        url: `${baseUrl}/watchlist/{userId}`,
        description: 'Get all items from IMDB watchlist with complete metadata',
        example: `${baseUrl}/watchlist/ur12345678`,
      },
      watchlistTV: {
        url: `${baseUrl}/watchlist/{userId}/tv`,
        description: 'Get TV shows from watchlist in Sonarr format (JSON array)',
        example: `${baseUrl}/watchlist/ur12345678/tv`,
        sonarrCompatible: true,
      },
      list: {
        url: `${baseUrl}/list/{listId}`,
        description: 'Get all items from IMDB list with complete metadata',
        example: `${baseUrl}/list/ls036390872`,
      },
      listTV: {
        url: `${baseUrl}/list/{listId}/tv`,
        description: 'Get TV shows from IMDB list in Sonarr format (JSON array)',
        example: `${baseUrl}/list/ls036390872/tv`,
        sonarrCompatible: true,
      },
    },
    requirements: {
      imdb: 'Your IMDB watchlist must be set to PUBLIC',
      tmdb: 'TMDB_API_KEY environment variable must be set (free at themoviedb.org)',
    },
    notes: {
      formats: {
        base: 'Base endpoints (/watchlist, /list) return raw IMDB metadata',
        sonarr: '/tv endpoints return Sonarr-compatible format with TVDB IDs',
      },
      pagination: {
        fetchAll: 'By default, all pages are fetched and merged. Use ?fetchAll=false to get only the first page (250 items)',
        maxItems: 'Use ?maxItems=N to limit total items fetched (works with fetchAll=true)',
        page: 'Use ?page=N to fetch a specific page (1-indexed, only when fetchAll=false)',
        legacy: 'Also supports ?limit=N&offset=N for slicing the final result set',
      },
    },
  });
});

/**
 * WATCHLIST ENDPOINTS
 */

/**
 * Get all items from IMDB watchlist with complete metadata
 */
app.get('/watchlist/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Pagination options
    const fetchAll = req.query.fetchAll !== 'false'; // Default: true
    const maxItems = req.query.maxItems ? Math.max(1, parseInt(String(req.query.maxItems), 10)) : undefined;
    const page = !fetchAll && req.query.page ? Math.max(1, parseInt(String(req.query.page), 10)) : undefined;

    const items = await fetchIMDBList(userId, { fetchAll, maxItems, page });

    // Optional pagination
    const limit = req.query.limit ? Math.max(0, parseInt(String(req.query.limit), 10)) : undefined;
    const offset = req.query.offset ? Math.max(0, parseInt(String(req.query.offset), 10)) : 0;
    const paged =
      typeof limit === 'number' && limit > 0 ? items.slice(offset, offset + limit) : items;

    res.json({
      userId,
      totalItems: items.length,
      offset,
      limit: limit ?? null,
      items: paged,
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
 * Get TV shows from IMDB watchlist in Sonarr-compatible format
 */
app.get('/watchlist/:userId/tv', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!isTMDBConfigured()) {
      return res.status(503).json({
        error: 'TMDB API key not configured',
        message: 'Set TMDB_API_KEY env variable to enable Sonarr format with TVDB IDs.',
      });
    }

    // Pagination options
    const fetchAll = req.query.fetchAll !== 'false'; // Default: true
    const maxItems = req.query.maxItems ? Math.max(1, parseInt(String(req.query.maxItems), 10)) : undefined;
    const page = !fetchAll && req.query.page ? Math.max(1, parseInt(String(req.query.page), 10)) : undefined;

    const allItems = await fetchIMDBList(userId, { fetchAll, maxItems, page });
    const tvShows = filterTVShows(allItems);

    // Optional pagination
    const limit = req.query.limit ? Math.max(0, parseInt(String(req.query.limit), 10)) : undefined;
    const offset = req.query.offset ? Math.max(0, parseInt(String(req.query.offset), 10)) : 0;
    const paged =
      typeof limit === 'number' && limit > 0 ? tvShows.slice(offset, offset + limit) : tvShows;

    // Convert to Sonarr format
    const sonarrSeries = await convertToSonarrFormat(paged);

    // Return array directly for Sonarr compatibility
    res.json(sonarrSeries);
  } catch (error) {
    console.error('[API] Error fetching watchlist TV shows:', error);
    res.status(500).json({
      error: 'Failed to fetch watchlist TV shows',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * LIST ENDPOINTS
 */

/**
 * Get all items from IMDB list with complete metadata
 */
app.get('/list/:listId', async (req: Request, res: Response) => {
  try {
    const { listId } = req.params;

    // Pagination options
    const fetchAll = req.query.fetchAll !== 'false'; // Default: true
    const maxItems = req.query.maxItems ? Math.max(1, parseInt(String(req.query.maxItems), 10)) : undefined;
    const page = !fetchAll && req.query.page ? Math.max(1, parseInt(String(req.query.page), 10)) : undefined;

    const items = await fetchIMDBList(listId, { fetchAll, maxItems, page });

    // Optional pagination
    const limit = req.query.limit ? Math.max(0, parseInt(String(req.query.limit), 10)) : undefined;
    const offset = req.query.offset ? Math.max(0, parseInt(String(req.query.offset), 10)) : 0;
    const paged =
      typeof limit === 'number' && limit > 0 ? items.slice(offset, offset + limit) : items;

    res.json({
      listId,
      totalItems: items.length,
      offset,
      limit: limit ?? null,
      items: paged,
    });
  } catch (error) {
    console.error('[API] Error fetching list:', error);
    res.status(500).json({
      error: 'Failed to fetch list',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get TV shows from IMDB list in Sonarr-compatible format
 */
app.get('/list/:listId/tv', async (req: Request, res: Response) => {
  try {
    const { listId } = req.params;

    if (!isTMDBConfigured()) {
      return res.status(503).json({
        error: 'TMDB API key not configured',
        message: 'Set TMDB_API_KEY env variable to enable Sonarr format with TVDB IDs.',
      });
    }

    // Pagination options
    const fetchAll = req.query.fetchAll !== 'false'; // Default: true
    const maxItems = req.query.maxItems ? Math.max(1, parseInt(String(req.query.maxItems), 10)) : undefined;
    const page = !fetchAll && req.query.page ? Math.max(1, parseInt(String(req.query.page), 10)) : undefined;

    const items = await fetchIMDBList(listId, { fetchAll, maxItems, page });
    const tvShows = filterTVShows(items);

    // Optional pagination
    const limit = req.query.limit ? Math.max(0, parseInt(String(req.query.limit), 10)) : undefined;
    const offset = req.query.offset ? Math.max(0, parseInt(String(req.query.offset), 10)) : 0;
    const paged =
      typeof limit === 'number' && limit > 0 ? tvShows.slice(offset, offset + limit) : tvShows;

    const sonarrSeries = await convertToSonarrFormat(paged);

    // Return array directly for Sonarr compatibility
    res.json(sonarrSeries);
  } catch (error) {
    console.error('[API] Error fetching list TV shows:', error);
    res.status(500).json({
      error: 'Failed to fetch list TV shows',
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
║        IMDB API for Sonarr                                     ║
╠════════════════════════════════════════════════════════════════╣
║  Server running at http://localhost:${PORT.toString().padEnd(27)}║
║                                                                ║
║  Endpoints:                                                    ║
║    GET /                         - API documentation           ║
║    GET /watchlist/:userId        - Metadata                    ║
║    GET /watchlist/:userId/tv     - TV shows (Sonarr format)    ║
║    GET /list/:listId             - Metadata                    ║
║    GET /list/:listId/tv          - TV shows (Sonarr format)    ║
║                                                                ║
║  TMDB API: ${tmdbStatusPadded}                ║
╚════════════════════════════════════════════════════════════════╝
  `);
});

export default app;
