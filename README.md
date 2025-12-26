# imdbarr

A lightweight API that bridges the gap between IMDB watchlists and Sonarr. Converts your IMDB watchlist or any public IMDB list to the format that Sonarr's Custom List feature expects.

## Features

- 📺 **Sonarr Integration** - TV shows with TVDB IDs in Sonarr-compatible format
- 🔄 **Real-time Sync** - Fetches directly from IMDB (no database required)
- 🌐 **Multi-user Support** - Works with any public IMDB watchlist or list
- 💾 **Smart Caching** - Caches TMDB lookups for 24 hours
- 🎯 **Direct Integration** - Returns exactly what Sonarr expects
- 📊 **Complete Metadata** - Access full IMDB data via base endpoints
- 📑 **Large List Support** - Automatically fetches all pages for lists with 250+ items

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
bun install

# Configure environment
cp .env.example .env
# Edit .env and add your TMDB_API_KEY
```

### 3. Run the API

```bash
# Development mode (with hot reload)
bun run dev

# Production mode
bun run build
bun start
```

## API Endpoints

### Endpoint Structure

All endpoints follow a consistent pattern:

- **Base endpoints** (`/watchlist/:userId`, `/list/:listId`) - Return complete IMDB metadata for all content types
- **`/tv` filter** - Returns only TV shows in Sonarr-compatible format (TVDB IDs)

### Watchlist Endpoints

| Endpoint                    | Description                       | Format         |
| --------------------------- | --------------------------------- | -------------- |
| `GET /watchlist/:userId`    | All items with complete metadata  | JSON (wrapped) |
| `GET /watchlist/:userId/tv` | TV shows only (Sonarr-compatible) | JSON array     |

### List Endpoints

| Endpoint               | Description                       | Format         |
| ---------------------- | --------------------------------- | -------------- |
| `GET /list/:listId`    | All items with complete metadata  | JSON (wrapped) |
| `GET /list/:listId/tv` | TV shows only (Sonarr-compatible) | JSON array     |

### Admin Endpoints

| Endpoint                  | Description                   |
| ------------------------- | ----------------------------- |
| `GET /`                   | API documentation             |
| `GET /health`             | Health check with cache stats |
| `POST /admin/cache/clear` | Clear cached TMDB lookups     |

### User IDs and List IDs

- **User ID** (watchlist): Starts with `ur` (e.g., `ur12345678`)
- **List ID** (custom list): Starts with `ls` (e.g., `ls036390872`)

Find your User ID by going to your IMDB profile - it's in the URL.

### Output Formats

- **Base Format** (`/watchlist/:userId`, `/list/:listId`): JSON object with metadata including `totalItems`, `offset`, `limit`, `items[]`
- **Sonarr Format** (`/tv`): JSON array with `TvdbId`, `Title`, `TmdbId`, `ImdbId`

## Configuring Sonarr

1. Open Sonarr → **Settings** → **Import Lists**
1. Click **+** to add a new list
1. Choose **Custom List**
1. Configure:
   - **Name**: IMDB Watchlist
   - **URL**: `http://your-server:3000/watchlist/ur12345678/tv` (your user ID)
   - **Monitor**: Your preference
   - **Quality Profile**: Your preference
1. Click **Save**

Sonarr will now automatically import TV shows from your IMDB watchlist!

## How It Works

```text
IMDB Watchlist → Parse HTML → Filter TV Shows → TMDB API → TVDB IDs → Sonarr JSON
```

1. **Fetch**: Scrapes your public IMDB watchlist page
2. **Filter**: Identifies TV shows (series, miniseries)
3. **Convert**: Uses TMDB's free API to convert IMDB IDs → TVDB IDs
4. **Return**: Returns JSON in the exact format Sonarr expects

### Output Format Examples

**Base Format** (`/watchlist/:userId`, `/list/:listId`):

```json
{
  "userId": "ur12345678",
  "totalItems": 42,
  "offset": 0,
  "limit": null,
  "items": [
    {
      "imdbId": "tt0137523",
      "title": "Fight Club",
      "type": "movie",
      "year": 1999
    },
    {
      "imdbId": "tt14452776",
      "title": "The Bear",
      "type": "tvSeries",
      "year": 2022
    }
  ]
}
```

**Sonarr Custom List Format** (`/tv`):

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

### Pagination for Large Lists

IMDB displays lists in pages of 250 items. By default, the API fetches **all pages** and merges the results. You can control this behavior:

| Parameter  | Default | Description                                                           |
| ---------- | ------- | --------------------------------------------------------------------- |
| `fetchAll` | `true`  | Fetch all pages and merge results. Set to `false` for single page.   |
| `maxItems` | -       | Maximum total items to fetch (works when `fetchAll=true`)             |
| `page`     | -       | Fetch specific page (1-indexed, only when `fetchAll=false`)           |

**Examples:**

```bash
# Fetch entire list - all pages merged (default)
GET /list/ls123456789

# Limit to first 500 items
GET /list/ls123456789?maxItems=500

# Get only the first page (250 items max)
GET /list/ls123456789?fetchAll=false

# Get page 3 specifically
GET /list/ls123456789?fetchAll=false&page=3
```

### Result Slicing

After fetching, you can slice the final result set:

| Parameter | Description                        |
| --------- | ---------------------------------- |
| `limit`   | Maximum number of items to return  |
| `offset`  | Number of items to skip            |

**Examples:**

```bash
# Get items 51-100 from the full list
GET /watchlist/ur12345678?limit=50&offset=50

# Combine with maxItems: fetch up to 1000, return items 101-200
GET /list/ls123456789?maxItems=1000&limit=100&offset=100
```

## Deployment

### Docker

```dockerfile
FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production
COPY dist ./dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "run", "dist/index.js"]
```

Build and run:

```bash
bun run build
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

Then use:

- Sonarr: `https://yourserver.com/imdb/watchlist/ur12345678/tv`

## Requirements

- **Public Watchlist**: Your IMDB watchlist must be set to PUBLIC
  - Go to IMDB → Account Settings → Privacy → Watchlist → Public
- **TMDB API Key**: Free, no credit card required
- **Bun Runtime**: This project uses [Bun](https://bun.sh) instead of npm/Node.js for faster installs, builds, and runtime performance. Bun is a drop-in replacement that's significantly faster while maintaining full npm compatibility

## Troubleshooting

### Testing Locally

Use the included `check.ts` script to test IMDB parsing without starting the server:

```bash
# Test with your user ID
bunx tsx scripts/check.ts ur12345678

# Or use the default test user
bunx tsx scripts/check.ts
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
- Try the base endpoint (`/watchlist/:userId`) to see all parsed items
- Ensure you're using the `/tv` endpoint for Sonarr

### Missing shows or movies

Some very new or obscure titles may not have TVDB/TMDB IDs. Use the base endpoint to see what was found from IMDB, then check if those titles exist on TMDB.

## License

MIT
