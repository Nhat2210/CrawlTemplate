# WebExporter

**Capture public websites, review the results, and export portable static website ZIPs.**

WebExporter is a local workspace built with React, TypeScript, Express, Playwright and SQLite. Discover pages, choose what to capture, preview the exported website, and review missing assets or external dependencies before downloading your ZIP.

The application source and complete documentation are in **[WebExporter/](WebExporter/)**.

## Get started

Install Node.js 24 LTS, then run:

```bash
git clone https://github.com/Nhat2210/CrawlTemplate.git
cd CrawlTemplate/WebExporter
npm ci
npm run setup:browser
cp .env.example .env
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**. Keep the terminal running while using the application.

On Windows PowerShell, replace `cp .env.example .env` with `Copy-Item .env.example .env`. Linux users may need `npx playwright install --with-deps chromium` to install the browser's system dependencies.

## Main capabilities

- Project-based website discovery and page selection.
- Rendered captures with available HTML, styles, scripts, images and fonts.
- Local resource rewriting and ZIP packaging.
- Preview at desktop, tablet and mobile viewport widths.
- Side-by-side comparison with original desktop screenshots.
- Capture reports, persistent job history and cancellation.

An export is a **static capture**, not the original source project. Backend services, databases, authentication and payments are not included; complex scripts and remote APIs may require manual adaptation.

See the **[installation and user guide](WebExporter/README.md)** for configuration, production startup, Docker, API usage and troubleshooting. The **[design and verification notes](WebExporter/docs/DESIGN.md)** describe the interface decisions and checks performed.

## License

[MIT](WebExporter/LICENSE). Captured content and third-party assets retain their original licenses.
