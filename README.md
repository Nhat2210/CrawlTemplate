# WebExporter

> Crawl and export any public website as a clean, self-hostable ZIP file.

WebExporter is a local tool that uses Playwright (headless Chromium) to fully render web pages — including SPAs — then downloads all assets, rewrites URLs to relative paths, removes tracking scripts and platform watermarks, and packages everything into a ready-to-deploy ZIP.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | 18+ | [Download](https://nodejs.org/) |
| **Redis** | 6+ | Optional — app falls back to an in-memory queue if Redis is unavailable |

> **Windows users**: Install Redis via WSL, Docker, or [Memurai](https://www.memurai.com/).  
> Without Redis the app works perfectly; you just lose job persistence across restarts.

---

## Installation

```bash
# 1. Clone or navigate to the project
cd tools

# 2. Install dependencies (also installs Chromium automatically via postinstall)
npm install

# 3. Copy and configure environment variables
cp .env.example .env
# Edit .env if you need to change defaults

# 4. (Optional) If the postinstall script didn't run:
npx playwright install chromium
```

---

## Running

```bash
# Production
npm start

# Development (auto-restart on file changes)
npm run dev
```

The server starts at **http://localhost:3000** (or the port in your `.env`).

---

## Usage

1. Open **http://localhost:3000** in your browser.
2. Paste a URL (e.g. `https://example.com`).
3. Adjust options if needed (max pages, crawl depth, tracker removal).
4. Click **Export** and watch the real-time progress.
5. Download the ZIP when done.

### Using the API directly

```bash
# Start an export
curl -X POST http://localhost:3000/api/export \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "options": {"maxPages": 50, "crawlDepth": 2}}'

# Check job status
curl http://localhost:3000/api/job/{jobId}

# Download the ZIP
curl -OJ http://localhost:3000/api/job/{jobId}/download

# List all jobs
curl http://localhost:3000/api/jobs

# Cancel a job
curl -X DELETE http://localhost:3000/api/job/{jobId}

# Real-time progress (SSE)
curl http://localhost:3000/api/events/{jobId}
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/export` | Start a new export job. Body: `{ url, options }` |
| `GET` | `/api/job/:jobId` | Get job status and progress |
| `GET` | `/api/job/:jobId/download` | Download the exported ZIP |
| `GET` | `/api/jobs` | List all jobs |
| `DELETE` | `/api/job/:jobId` | Cancel or delete a job |
| `GET` | `/api/events/:jobId` | SSE stream for real-time progress |

### POST /api/export — Request Body

```json
{
  "url": "https://example.com",
  "options": {
    "maxPages": 100,
    "crawlDepth": 3,
    "concurrency": 3,
    "removeTrackers": true,
    "removeWatermarks": true
  }
}
```

All options are optional and fall back to `.env` defaults.

---

## Project Structure

```
tools/
├── server.js            # Express API server
├── crawler.js           # Playwright crawling engine
├── processor.js         # HTML/CSS cleanup & URL rewriting
├── packager.js          # ZIP packaging
├── queue.js             # Job queue (Redis or in-memory)
├── package.json
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── public/
│   └── index.html       # Frontend UI
└── exports/             # Generated ZIP files (gitignored)
```

---

## Docker (Optional)

```bash
# Start with Redis
docker-compose up --build

# App available at http://localhost:3000
```

---

## Configuration

All settings live in `.env`. See [.env.example](.env.example) for defaults.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `MAX_PAGES` | `100` | Max pages to crawl per job |
| `CRAWL_DEPTH` | `3` | Max link-follow depth |
| `CONCURRENCY` | `3` | Parallel browser tabs |
| `PAGE_TIMEOUT` | `30000` | Timeout per page (ms) |
| `MAX_JOBS` | `5` | Max concurrent export jobs |
| `EXPORT_DIR` | `./exports` | Where ZIPs are saved |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |

---

## License

MIT
