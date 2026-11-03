# WebExporter

**Capture a public website. Review the result. Export a portable ZIP.**

WebExporter is a local application for collecting rendered web pages and their assets into a static website you can host yourself. It opens pages in Chromium, lets you choose what to capture, rewrites supported resource links, and packages the result with a capture report and hosting instructions.

The workspace keeps each website's scans, exports and reports together. Projects and files are stored on your computer; WebExporter does not require an account, cloud storage, Redis or an API key.

## What you can do

- **Discover pages:** follow rendered links on the same origin, within a configurable page limit and link depth.
- **Choose the scope:** select pages before exporting; the entry page is retained as `index.html`.
- **Capture rendered content:** use Playwright and Chromium, including a bounded scroll to trigger common lazy-loaded content.
- **Bundle assets:** collect available stylesheets, scripts, images and fonts, rewrite HTML resource attributes, CSS `url()` references and CSS imports.
- **Review the result:** view the static export, switch viewport widths, or compare it with a screenshot of the source page.
- **Inspect dependencies:** see page failures, missing assets, observed runtime API calls and other capture notes.
- **Export and revisit:** download a ZIP and retain earlier jobs in the project's history.
- **Cancel work:** stop a queued or running scan/export without losing the project's earlier results.

## Understand the output

WebExporter creates a **rendered static capture**, not the original site's source project. An export is useful as a portable snapshot, a reference, or a starting point for rebuilding a site.

Backend services, databases, account systems, authentication and payment processing are not included. Preserved scripts can still depend on client-side routing, dynamic imports, runtime-generated URLs or remote APIs. Rendering a SPA successfully does not guarantee its exported interactions will work independently.

The original view is a **desktop screenshot taken during export**. It is not a live connection to the source website. Device controls select a fixed viewport width for the exported preview (1366, 768 or 390 pixels), scaled to fit the workspace; they do not recapture the original at another viewport. No automated visual similarity score is claimed.

The preview uses a separate local origin and blocks outgoing API connections, forms and embedded frames. Hosting the exported files yourself can behave differently. Review the capture report and test the result before deployment.

## Requirements

| Requirement     | Details                                                      |
| --------------- | ------------------------------------------------------------ |
| Node.js         | **24 LTS recommended**; `.nvmrc` selects the 24 release line |
| npm             | Included with Node.js                                        |
| Chromium        | Installed through the setup command below                    |
| Internet access | Required for installation and public website capture         |

On Linux, Chromium also requires system libraries. Use the Linux installation command below or the Docker setup. On Windows, run the commands in PowerShell; WSL is not required for this application.

## Quick start

Open a terminal in the `WebExporter` directory, the directory containing `package.json`.

```bash
# If you use nvm, select the project's Node.js release.
nvm install
nvm use

# Install the dependency versions recorded in the lockfile.
npm ci

# Install the browser used for captures.
npm run setup:browser
```

`nvm` is optional. If Node.js 24 is already installed, start at `npm ci`.

On Linux, install Chromium and its system dependencies with:

```bash
npx playwright install --with-deps chromium
```

Create your environment file:

```bash
# macOS / Linux
cp .env.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

Start the development workspace:

```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**. The development command starts the React frontend and the API; the API manages the capture worker and the isolated preview server. Leave this terminal running while using the application.

## Your first export

1. Enter a public HTTP(S) URL and choose **Create project**.
2. Open **Scan options** if you want to change the page limit, link depth or known-tracker filtering.
3. Choose **Scan website** and wait for the discovered pages.
4. Select the pages you want to keep, then choose **Export pages**.
5. Review the **Preview** and **Export report** tabs.
6. Choose **Download ZIP**.

Only same-origin page links are followed during discovery. Assets can be retrieved from other public hosts, including CDNs. Link depth `0` means the entry page only. The page limit applies to each job, not to the total history of a project.

Known-tracker filtering covers a predefined provider list. It is not a guarantee that every tracker or inline tracking script is removed. WebExporter does not automatically remove watermarks.

## What's inside the ZIP?

```text
index.html
pages/
  about-<hash>/
    index.html
assets/
  <hash>.css
  <hash>.js
  <hash>.png
  <hash>.woff2
export-report.json
README.md
```

The actual file types and folders depend on the website. Hashed asset names avoid collisions between resources with the same original filename. Links between captured pages point to their local files; links to pages outside the selection remain source links.

Extract the ZIP and serve the extracted directory over HTTP:

```bash
cd path/to/extracted-website
npx serve .
```

Open the URL printed by `serve`. You can also upload the directory contents to a static host that supports directory index files. Opening `index.html` directly through `file://` is not a reliable way to test scripts and resource loading.

## Run a production build locally

```bash
npm run build
npm start
```

Open **[http://localhost:4310](http://localhost:4310)**. The API serves the compiled frontend, so Vite is not needed at runtime. The server and worker run TypeScript through the installed `tsx` runtime; keep the application source and runtime dependencies available.

## Docker

Docker Compose builds the application, installs Chromium and mounts a persistent data volume:

```bash
docker compose up --build -d
```

Open **[http://localhost:4310](http://localhost:4310)**. Port `4311` serves the isolated preview. Both published ports are restricted to the host's loopback interface.

```bash
docker compose logs -f
docker compose down
```

The named volume preserves your projects and files when the container is recreated. `docker compose down -v` deletes that volume and its data. Local `.env` changes are not automatically injected into this Compose configuration; add explicit service environment values when needed.

## Configuration

The application reads `.env` from the project root. Restart the application after changing it.

| Variable                | Default     | Purpose                                                             |
| ----------------------- | ----------- | ------------------------------------------------------------------- |
| `PORT`                  | `4310`      | API and production frontend port                                    |
| `PREVIEW_PORT`          | `4311`      | Separate preview origin                                             |
| `WEB_PORT`              | `3000`      | Vite development frontend port                                      |
| `STORAGE_DIR`           | `./storage` | SQLite database and generated files; relative to the project root   |
| `MAX_PAGES`             | `30`        | Initial page limit; job options allow 1–100                         |
| `CRAWL_DEPTH`           | `2`         | Initial link depth; job options allow 0–5                           |
| `PAGE_TIMEOUT`          | `30000`     | Navigation, screenshot and asset request timeout in milliseconds    |
| `ALLOW_PRIVATE_NETWORK` | `false`     | Permit trusted local/intranet targets when explicitly set to `true` |
| `HOST`                  | `127.0.0.1` | Server bind address; Docker uses `0.0.0.0` inside the container     |

Preferences in the UI apply to subsequent jobs in the current browser session. Set `.env` values for persistent launch defaults.

This edition runs **one capture job at a time** and processes its pages sequentially. Up to ten queued/running jobs are accepted. Captured asset bodies are limited to 20 MiB per resource and 300 MiB in total per export. Large media and long/infinite-scroll pages may be incomplete.

Keep the service local. It does not include user authentication or a hardened public multi-tenant execution environment. Private-target checks and preview isolation are useful boundaries, but do not replace a network sandbox for an internet-facing service.

## Data and recovery

```text
storage/
  webexporter.sqlite
  jobs/
    <job-id>/
      screenshots/
      site/
      website.zip
```

SQLite runs in WAL mode. Queued jobs remain queued across restarts. A job interrupted while running is marked failed on the next launch; retry it from the workspace. Captures are not resumed partway through a page.

Generated files remain until you remove them manually. Stop the application before backing up or removing the entire `storage` directory. A complete backup should include the database, any SQLite WAL files and the `jobs` directory together.

## API

The UI and command-line clients use the same JSON API. The examples below assume the default API port and a running application.

```bash
# Create a project. Save the returned id.
curl -X POST http://localhost:4310/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}'

# Discover pages. Replace PROJECT_ID with the returned project id.
curl -X POST http://localhost:4310/api/projects/PROJECT_ID/discover \
  -H 'Content-Type: application/json' \
  -d '{"options":{"maxPages":20,"crawlDepth":2,"removeTrackers":true}}'

# Read the returned job id until status becomes completed or failed.
curl http://localhost:4310/api/jobs/JOB_ID

# Export URLs from the latest successful scan, including the entry URL.
curl -X POST http://localhost:4310/api/projects/PROJECT_ID/export \
  -H 'Content-Type: application/json' \
  -d '{"selectedUrls":["https://example.com/"]}'

# Download a completed export job.
curl -fL http://localhost:4310/api/jobs/EXPORT_JOB_ID/download -o website.zip
```

Use the normalized entry URL returned when creating the project, including its trailing slash where applicable. The shell examples use POSIX quoting; PowerShell users can use the web UI or `Invoke-RestMethod` with equivalent JSON bodies.

| Method   | Endpoint                          | Result                                               |
| -------- | --------------------------------- | ---------------------------------------------------- |
| `GET`    | `/api/health`                     | Readiness, preview port and capture defaults         |
| `GET`    | `/api/projects`                   | Projects, newest first                               |
| `POST`   | `/api/projects`                   | Create a project from `{ url, name? }`               |
| `GET`    | `/api/projects/:id`               | Project and job history                              |
| `POST`   | `/api/projects/:id/discover`      | Queue a scan from `{ options? }`                     |
| `POST`   | `/api/projects/:id/export`        | Queue an export from `{ selectedUrls, options? }`    |
| `GET`    | `/api/jobs/:id`                   | Job state, progress, result and error                |
| `GET`    | `/api/jobs/:id/events`            | Server-sent events carrying job snapshots            |
| `DELETE` | `/api/jobs/:id`                   | Cancel a queued/running job; does not delete history |
| `GET`    | `/api/jobs/:id/download`          | Download a completed export ZIP                      |
| `GET`    | `/api/jobs/:id/screenshots/:file` | Original capture screenshot                          |

Job states are `queued`, `running`, `completed`, `failed` and `cancelled`. A completed job can still contain reported issues: completion means the capture process finished, not that every original feature works offline.

This rewrite uses the project-based API above; it is not a drop-in replacement for the earlier `/api/export` API.

## Development

| Command             | Purpose                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `npm run dev`       | Start frontend and API with reload                                 |
| `npm run typecheck` | Check frontend, API, worker and scripts                            |
| `npm test`          | Test URL normalization, private-address detection and output paths |
| `npm run build`     | Type-check and compile the frontend                                |
| `npm run test:e2e`  | Exercise a real browser capture and UI against a local fixture     |
| `npm start`         | Serve the built frontend, API and preview                          |

Run `npm run build` before `npm run test:e2e`. The end-to-end check requires Chromium, the `unzip` command, and available ports `4410`, `4411` and `4455`. It uses a temporary database and removes its fixture data when finished. Screenshots are written to `.taste-skill/smoke/`.

```text
apps/
  web/                  React UI, Vite configuration and styles
  api/src/              Express API, persistent queue and preview server
  worker/src/           Capture worker process entry point
packages/core/src/
  config.ts             Environment and filesystem configuration
  db.ts                 SQLite schema and Drizzle access
  types.ts              Shared project, job and report types
  urls.ts               URL normalization and target checks
  crawler.ts            Browser capture, processing and ZIP packaging
scripts/smoke.ts         Browser-based end-to-end check
tests/                  Focused unit tests
```

The repository uses one root dependency installation and shared TypeScript types. Redis and BullMQ are not required or implemented in this edition.

## Troubleshooting

**Chromium executable is missing:** run `npm run setup:browser`. After upgrading Playwright, run it again so the matching browser is installed.

**Chromium cannot launch on Linux:** run `npx playwright install --with-deps chromium`, or use Docker.

**A port is already in use:** change the corresponding port in `.env`, then restart both the frontend and API. Keep the preview port distinct from the application ports.

**Native SQLite module cannot load after changing Node.js:** switch to Node.js 24, remove `node_modules`, then run `npm ci`. If your package manager blocks dependency install scripts, approve the SQLite build and esbuild setup scripts before retrying.

**A page is blocked, blank or incomplete:** confirm the source is publicly accessible, inspect the job error and export report, and try a smaller capture. Authentication, anti-bot challenges, streaming media and unusually complex client-side applications may need site-specific handling.

**An export still calls the original website:** inspect `export-report.json`. Static capture does not recreate backend services or reliably rewrite URLs generated inside arbitrary JavaScript.

## Planned improvements

These are future work, not features included in this release:

- Automated screenshot difference analysis.
- Editing text, images and theme values inside the preview.
- Incremental recapture and retry of individual failed resources.
- Distributed workers with BullMQ/Redis.
- Rebuilding captured views as maintainable React source projects.

## License

WebExporter is released under the [MIT License](LICENSE). Captured content, third-party assets and fonts retain their original licenses. Use the tool on websites you own or have permission to reproduce.
