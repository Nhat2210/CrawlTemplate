# Interface direction and verification

WebExporter uses the `design-taste-frontend` app-screen workflow. The selected direction is **Framed sheet**, seed **1559747121**, with no palette or typography redraws.

The product's exported folder becomes its visual signature: the overlapping-page/export mark, the output file tree and the page-to-ZIP workflow. The frame stays pale, the work sits on white, and teal identifies progress and selection. IBM Plex Sans is bundled locally rather than fetched from a font service at runtime.

## Questions each view answers

| View | Main question | Primary action |
| --- | --- | --- |
| Projects | Which website should I capture? | Create project |
| Pages | Which pages will the capture include? | Scan / export selection |
| Preview | What does the exported site look like? | Choose page and viewport |
| Report | What needs attention before hosting? | Review dependencies / download |
| History | Which previous job should I revisit? | Review completed export |
| Preferences | How should the next capture run? | Change session defaults |

## Final critique

ROUND 3

Seen in one second: a URL field with a concrete export action.

Idea (one sentence): the website's future ZIP contents become the first-run explanation of the product.

Live thing: create a project from a URL, discover real links, select pages and export them.

Layout words by section: shell=framed sheet / capture=split / projects=list / preview=canvas / report=divided metrics and notes.

Scores: design 7.8 · usability 8.0 · creativity 7.0 · content 8.0 → overall 7.74. These are an internal design assessment, not an independent rating.

Caps applied: marketing-page imagery and motion floors do not apply to app screens; creativity stays at 7 because the workflow is a familiar developer-tool pattern.

Top three problems addressed, each with its screenshot and fix:

1. Small secondary labels dominated the first workspace screenshot (`desktop-fold.jpg`). Increased general labels to 13px and retained 12px for metadata.
2. Product identity disappeared when navigation folded (`mobile-fold.jpg`). The top breadcrumb now names WebExporter at every width; the phone header also keeps a 16px edge margin.
3. Original and exported previews used different visual scales (`smoke/preview.png`). Exports now render at fixed 1366/768/390px viewports and scale to the available canvas; the desktop comparison matches the original capture width.

Remaining limits: the original is a desktop screenshot, not a live responsive source view. Comparison is visual, with no automated similarity score or synchronized scroll. The first-run screen cannot show actual project thumbnails until a website has been captured.

## Verification record

- Production frontend build and strict TypeScript check passed.
- URL normalization, private-network detection and output path tests passed.
- Browser end-to-end test passed: create → scan → select → export → preview → report → ZIP download.
- The fixture exercises three rendered pages, five assets, CSS imports, local fonts and an intentionally missing image. It also checks cancellation, origin restrictions and tablet/mobile overflow.
- A separate public capture of `https://example.com/` produced a ZIP successfully.
- Taste source lint and browser inspector: **0 FAIL, 0 WARN** at 1440, 768 and 390px. Every final workspace screenshot was opened and reviewed.
- `npm audit` reported zero known vulnerabilities for the installed lockfile at verification time. The scoped `minimatch` override is exercised by the ZIP end-to-end test.
- Docker Compose configuration validation passed. The Docker image was not built or run during this verification.

No stock photographs, generated images or fabricated business metrics are used. File-tree names describe the output format. The test website is fixture content in temporary storage, not a seeded user project. Screenshot artifacts are ignored under `.taste-skill/`.
