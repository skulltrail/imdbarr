# imdbarr

A lightweight API that bridges the gap between IMDB watchlists and \*arr apps. While Radarr natively supports IMDB watchlists, Sonarr does not. This API (imdbarr) converts your IMDB watchlist (or any public IMDB list) to the format that Sonarr's Custom List feature expects.

## Features

- 📺 **Automatic TV Show Detection** - Filters movies from TV shows automatically
- 🔄 **Real-time Sync** - Fetches directly from IMDB (no database required)
- 🌐 **Multi-user Support** - Works with any public IMDB watchlist
- 💾 **Smart Caching** - Caches TVDB lookups for 24 hours
- 🎯 **Direct Sonarr Integration** - Returns exactly what Sonarr expects

## Quick Start

### 1. Get a TMDB API Key (Free)

1. Create a free account at [TMDB](https://www.themoviedb.org/signup)
2. Go to [API Settings](https://www.themoviedb.org/settings/api)
3. Request an API key (choose "Developer" for personal use)

### 2. Clone and Setup

```bash
git clone https://github.com/skulltrail/imdbarr.git
cd imdbarr

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and add your TMDB_API_KEY
```

### 3. Run the API

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run build
npm start
```

## API Endpoints

| Endpoint                        | Description                                       |
| ------------------------------- | ------------------------------------------------- |
| `GET /`                         | API documentation                                 |
| `GET /health`                   | Health check with cache stats                     |
| `GET /watchlist/:userId`        | All items from watchlist (movies, TV shows, etc.) |
| `GET /watchlist/:userId/tv`     | TV shows only (filtered from watchlist)           |
| `GET /watchlist/:userId/movies` | Movies only (filtered from watchlist)             |
| `GET /list/:listId`             | IMDB custom list in Sonarr format (TV only)       |
| `POST /admin/cache/clear`       | Clear cached TMDB lookups                         |

### User IDs and List IDs

- **User ID** (watchlist): Starts with `ur` (e.g., `ur12345678`)
- **List ID** (custom list): Starts with `ls` (e.g., `ls036390872`)

Find your User ID by going to your IMDB profile - it's in the URL.

## Configuring Sonarr

1. Open Sonarr → **Settings** → **Import Lists**
1. Click **+** to add a new list
1. Choose **Custom List**
1. Configure:
   - **Name**: IMDB Watchlist
   - **URL**: `http://your-server:3000/watchlist/ur12345678` (your user ID)
   - **Monitor**: Your preference
   - **Quality Profile**: Your preference
1. Click **Save**

Sonarr will now automatically import TV shows from your IMDB watchlist!

## How It Works

```text
IMDB Watchlist → Parse HTML → Filter TV Shows → TMDB API → TVDB IDs → Sonarr JSON
```

1. **Fetch**: Scrapes your public IMDB watchlist page
2. **Filter**: Identifies TV shows (series, miniseries, documentaries)
3. **Convert**: Uses TMDB's free API to convert IMDB IDs → TVDB IDs
4. **Return**: Returns JSON in the exact format Sonarr expects

### Sonarr Custom List Format

```json
[
  {
    "TvdbId": 121361,
    "Title": "The Bear",
    "TmdbId": 194764,
    "ImdbId": "tt14452776"
  }
]
```

## Environment Variables

| Variable       | Required | Default                 | Description       |
| -------------- | -------- | ----------------------- | ----------------- |
| `TMDB_API_KEY` | Yes      | -                       | Your TMDB API key |
| `PORT`         | No       | `3000`                  | Server port       |
| `BASE_URL`     | No       | `http://localhost:3000` | Base URL for docs |

## Query Parameters

### Pagination (all watchlist endpoints)

- `limit` - Maximum number of items to return
- `offset` - Number of items to skip (for pagination)

Example: `GET /watchlist/ur12345678?limit=50&offset=0`

## Deployment

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Build and run:

```bash
npm run build
docker build -t imdbarr .
docker run -d -p 3000:3000 -e TMDB_API_KEY=your_key imdbarr
```

### Docker Compose

Use the provided Compose files.

Local build (from this repo):

```bash
docker compose up -d --build
```

Production (pull prebuilt image):

```bash
TMDB_API_KEY=your_key \
BASE_URL=https://yourserver.com/imdb \
docker compose -f docker-compose.prod.yml up -d
```

### Reverse Proxy (nginx)

```nginx
location /imdb/ {
    proxy_pass http://localhost:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}
```

Then use: `https://yourserver.com/imdb/watchlist/ur12345678`

## Requirements

- **Public Watchlist**: Your IMDB watchlist must be set to PUBLIC
  - Go to IMDB → Account Settings → Privacy → Watchlist → Public
- **TMDB API Key**: Free, no credit card required

## Troubleshooting

### Testing Locally

Use the included `check.ts` script to test IMDB parsing without starting the server:

```bash
# Test with your user ID
npx tsx scripts/check.ts ur12345678

# Or use the default test user
npx tsx scripts/check.ts
```

This script will:

- Fetch your watchlist HTML (or use cached version from `/tmp/`)
- Parse all items and show type detection
- Display counts for TV shows, movies, and other content types
- List all parsed titles by category

**Tip**: If you get 503 errors, manually save the HTML first:

```bash
curl -H "User-Agent: Mozilla/5.0" \
  "https://www.imdb.com/user/ur12345678/watchlist?view=detail" \
  > /tmp/watchlist_ur12345678.html
```

### "TMDB API key not configured"

Set the `TMDB_API_KEY` environment variable.

### Empty results

- Check that your watchlist is public
- Verify your user ID is correct (starts with `ur`)
- Try `/watchlist/:userId` to see all parsed items

### Missing shows

Some very new or obscure shows may not have TVDB IDs. Check `/watchlist/:userId/tv` to see what TV shows were found, or `/watchlist/:userId` to see all items.

## License

MIT
