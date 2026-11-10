import { chromium, type BrowserContext } from "playwright";
import { load } from "cheerio";
import { init, parse } from "es-module-lexer";
import postcss from "postcss";
import valueParser from "postcss-value-parser";
import path from "node:path";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { ZipArchive } from "archiver";
import {
  assertPublic,
  normalizeUrl,
  pagePath,
  relativeUrl,
  tracker,
  digest,
} from "./urls.ts";
import type { CapturedPage, Issue, Job, Progress, Result } from "./types.ts";
import { config } from "./config.ts";
import { imageReplayScript } from "./image-replay.ts";

const mimeExtensions: Record<string, string> = {
  "text/css": ".css",
  "application/javascript": ".js",
  "text/javascript": ".js",
  "application/json": ".json",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "font/woff2": ".woff2",
  "font/woff": ".woff",
  "application/font-woff": ".woff",
  "image/x-icon": ".ico",
  "video/mp4": ".mp4",
};
type Asset = { base: string; path: string; mime: string; body: Buffer };
const MAX_ASSET = 20 * 1024 * 1024;
const MAX_TOTAL = 300 * 1024 * 1024;
function assetPath(url: string, mime: string) {
  const ext =
    mimeExtensions[mime] ||
    (/^\.[a-z0-9]{1,5}$/i.test(path.extname(new URL(url).pathname))
      ? path.extname(new URL(url).pathname)
      : ".bin");
  return `assets/${digest(url)}${ext}`;
}
export async function runCapture(
  job: Job,
  source: string,
  update: (p: Progress) => void,
): Promise<Result> {
  const dir = path.join(config.storage, "jobs", job.id);
  const site = path.join(dir, "site");
  await mkdir(site, { recursive: true });
  await mkdir(path.join(dir, "screenshots"), { recursive: true });
  const pages: CapturedPage[] = [],
    issues: Issue[] = [];
  const issueKeys = new Set<string>();
  const issue = (kind: Issue["kind"], url: string, message: string) => {
    const key = `${kind}:${url}:${message}`;
    if (!issueKeys.has(key)) {
      issueKeys.add(key);
      issues.push({ kind, url, message });
    }
  };
  const assets = new Map<string, Asset>();
  const rawPages: { page: CapturedPage; html: string; base: string }[] = [];
  let totalBytes = 0;
  const addAsset = (url: string, mime: string, body: Buffer, base = url) => {
    if (assets.has(url)) return;
    if (body.length > MAX_ASSET || totalBytes + body.length > MAX_TOTAL) {
      issue("asset", url, "Asset skipped: capture size limit reached.");
      return;
    }
    assets.set(url, { base, mime, body, path: assetPath(url, mime) });
    totalBytes += body.length;
  };
  const browser = await chromium.launch({ headless: true });
  const terminate = () => {
    void browser.close().finally(() => process.exit(0));
  };
  process.once("SIGTERM", terminate);
  let context: BrowserContext | undefined;
  try {
    context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      reducedMotion: "no-preference",
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    await context.route("**/*", async (route) => {
      try {
        if (job.options.removeTrackers && tracker(route.request().url()))
          return await route.abort();
        await assertPublic(route.request().url());
        await route.continue();
      } catch {
        await route.abort().catch(() => {});
      }
    });
    const entry = normalizeUrl(source);
    const queue = (job.kind === "export" ? job.selectedUrls : [entry]).map(
      (url) => ({ url, depth: 0 }),
    );
    const seen = new Set<string>();
    while (queue.length && pages.length < job.options.maxPages) {
      const item = queue.shift()!;
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      update({
        phase:
          job.kind === "discover" ? "Discovering pages" : "Capturing pages",
        current: pages.length,
        total:
          job.kind === "export"
            ? job.selectedUrls.length
            : Math.min(job.options.maxPages, seen.size + queue.length),
        message: item.url,
      });
      const tab = await context.newPage();
      const pending: Promise<void>[] = [];
      if (job.kind === "export") {
        tab.on("response", (response) => {
          const request = response.request();
          if (["fetch", "xhr", "websocket"].includes(request.resourceType())) {
            issue(
              "dependency",
              request.url(),
              "Runtime API request observed. Backend data and services are not included in the ZIP.",
            );
            return;
          }
          if (
            request.resourceType() === "document" ||
            response.status() === 206 ||
            !response.ok()
          )
            return;
          pending.push(
            (async () => {
              const mime = (response.headers()["content-type"] || "")
                .split(";")[0]
                .trim();
              if (
                mime.includes("html") ||
                Number(response.headers()["content-length"]) > MAX_ASSET
              )
                return;
              try {
                addAsset(
                  normalizeUrl(response.url()),
                  mime,
                  await response.body(),
                );
              } catch {
                /* A cancelled browser request may have no readable body; explicit downloads retry it. */
              }
            })(),
          );
        });
      }
      try {
        await assertPublic(item.url);
        const response = await tab.goto(item.url, {
          waitUntil: "domcontentloaded",
          timeout: config.timeout,
        });
        if (response && response.status() >= 400)
          throw new Error(`HTTP ${response.status()}`);
        await assertPublic(tab.url());
        if (new URL(tab.url()).origin !== new URL(entry).origin)
          throw new Error("Page redirected outside the project origin.");
        await tab
          .waitForLoadState("networkidle", { timeout: 2500 })
          .catch(() => {});
        // Bounded scroll loads common lazy images without following infinite feeds forever.
        await tab.evaluate(async () => {
          for (let i = 0; i < 8; i++) {
            window.scrollBy(0, window.innerHeight);
            await new Promise((r) => setTimeout(r, 120));
            if (
              window.scrollY + innerHeight >=
              document.documentElement.scrollHeight
            )
              break;
          }
          window.scrollTo(0, 0);
          await Promise.race([
            document.fonts.ready,
            new Promise((r) => setTimeout(r, 2000)),
          ]);
        });
        const captured: CapturedPage = {
          url: item.url,
          title: (await tab.title()) || new URL(item.url).pathname,
          depth: item.depth,
        };
        if (job.kind === "discover" && item.depth < job.options.crawlDepth) {
          const links = await tab
            .locator("a[href]")
            .evaluateAll((nodes) =>
              nodes.map((n) => (n as HTMLAnchorElement).href),
            );
          for (const href of links) {
            try {
              const next = normalizeUrl(href);
              if (
                new URL(next).origin === new URL(entry).origin &&
                !/\.(?:zip|pdf|png|jpe?g|gif|svg|webp|mp4|woff2?)(?:\?|$)/i.test(
                  next,
                ) &&
                !seen.has(next) &&
                !queue.some((x) => x.url === next) &&
                seen.size + queue.length < job.options.maxPages
              )
                queue.push({ url: next, depth: item.depth + 1 });
            } catch {
              /* Ignore mailto, anchors and unsupported URLs. */
            }
          }
        }
        if (job.kind === "export") {
          captured.path = pagePath(item.url, entry);
          captured.screenshot = `${pages.length}.png`;
          const rawPage = {
            page: captured,
            html: await tab.evaluate(() => {
              const root = document.documentElement;
              const clone = root.cloneNode(true) as HTMLElement;
              const styles = clone.querySelectorAll("style");
              root.querySelectorAll("style").forEach((style, index) => {
                // CSS-in-JS can insert rules into a style with no text node.
                if (!style.textContent?.trim() && style.sheet?.cssRules.length)
                  styles[index].textContent = Array.from(
                    style.sheet.cssRules,
                    (rule) => rule.cssText,
                  ).join("\n");
              });
              const doctype = document.doctype
                ? new XMLSerializer().serializeToString(document.doctype)
                : "";
              return doctype + clone.outerHTML;
            }),
            base: await tab.evaluate(() => document.baseURI),
          };
          await tab.screenshot({
            path: path.join(dir, "screenshots", captured.screenshot),
            fullPage: false,
            timeout: config.timeout,
          });
          rawPages.push(rawPage);
        }
        pages.push(captured);
      } catch (error) {
        issue(
          "page",
          item.url,
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        await Promise.allSettled(pending);
        await tab.close();
      }
    }
  } finally {
    await context?.close();
    await browser.close();
    process.removeListener("SIGTERM", terminate);
  }
  if (!pages.length)
    throw new Error(issues[0]?.message || "No pages could be captured.");
  if (job.kind === "discover")
    return { pages, issues, assetCount: 0, bytes: 0 };

  update({
    phase: "Rewriting assets",
    current: pages.length,
    total: pages.length,
    message: "Making page links, styles, images and fonts local.",
  });
  const downloads = new Map<string, Promise<Asset | undefined>>();
  const downloadAsset = async (url: string): Promise<Asset | undefined> => {
    const existing = assets.get(url);
    if (existing) return existing;
    if (job.options.removeTrackers && tracker(url)) return;
    try {
      let target = url;
      for (let redirects = 0; redirects < 6; redirects++) {
        await assertPublic(target);
        const response = await fetch(target, {
          redirect: "manual",
          signal: AbortSignal.timeout(config.timeout),
        });
        if (
          response.status >= 300 &&
          response.status < 400 &&
          response.headers.get("location")
        ) {
          await response.body?.cancel();
          target = new URL(response.headers.get("location")!, target).href;
          continue;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const mime = (response.headers.get("content-type") || "").split(";")[0];
        if (mime.includes("html")) {
          await response.body?.cancel();
          throw new Error("Expected an asset, received HTML.");
        }
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        if (!response.body) throw new Error("Empty response body.");
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > MAX_ASSET || bytes + totalBytes > MAX_TOTAL) {
            await reader.cancel();
            throw new Error("Asset exceeds the capture size limit.");
          }
          chunks.push(value);
        }
        addAsset(url, mime, Buffer.concat(chunks), target);
        return assets.get(url);
      }
      throw new Error("Too many redirects.");
    } catch (error) {
      issue(
        "asset",
        url,
        error instanceof Error ? error.message : String(error),
      );
      return;
    }
  };
  const ensureAsset = (url: string): Promise<Asset | undefined> => {
    if (assets.has(url)) return Promise.resolve(assets.get(url));
    if (!downloads.has(url)) downloads.set(url, downloadAsset(url));
    return downloads.get(url)!;
  };
  const rewriteAsset = async (
    value: string,
    base: string,
    from: string,
  ): Promise<string> => {
    if (!value || /^(?:data:|blob:|#|mailto:|tel:|javascript:)/i.test(value))
      return value;
    try {
      const resolved = new URL(value, base);
      const hash = resolved.hash;
      const url = normalizeUrl(resolved.href);
      const asset = await ensureAsset(url);
      return asset ? relativeUrl(from, asset.path) + hash : resolved.href;
    } catch {
      return value;
    }
  };
  const rewriteCss = async (
    css: string,
    base: string,
    from: string,
  ): Promise<string> => {
    try {
      const sheet = postcss.parse(css);
      const tasks: Promise<void>[] = [];
      sheet.walkDecls((decl) => {
        tasks.push(
          (async () => {
            const parsed = valueParser(decl.value);
            const refs: { node: valueParser.FunctionNode; value: string }[] =
              [];
            parsed.walk((node) => {
              if (
                node.type === "function" &&
                node.value.toLowerCase() === "url"
              )
                refs.push({
                  node,
                  value: valueParser
                    .stringify(node.nodes)
                    .replace(/^["']|["']$/g, ""),
                });
            });
            for (const ref of refs)
              ref.node.nodes = [
                {
                  type: "string",
                  quote: '"',
                  value: await rewriteAsset(ref.value, base, from),
                  sourceIndex: 0,
                  sourceEndIndex: 0,
                },
              ];
            decl.value = parsed.toString();
          })(),
        );
      });
      sheet.walkAtRules("import", (rule) => {
        tasks.push(
          (async () => {
            const parsed = valueParser(rule.params);
            const first = parsed.nodes.find((n) => n.type !== "space");
            if (first?.type === "string")
              first.value = await rewriteAsset(first.value, base, from);
            else if (first?.type === "function" && first.value === "url")
              first.nodes = [
                {
                  type: "string",
                  quote: '"',
                  value: await rewriteAsset(
                    valueParser
                      .stringify(first.nodes)
                      .replace(/^["']|["']$/g, ""),
                    base,
                    from,
                  ),
                  sourceIndex: 0,
                  sourceEndIndex: 0,
                },
              ];
            rule.params = parsed.toString();
          })(),
        );
      });
      await Promise.all(tasks);
      return sheet.toString();
    } catch {
      issue(
        "asset",
        base,
        "CSS could not be fully parsed; some URLs may remain external.",
      );
      return css;
    }
  };
  await init;
  const rewriteScript = async (source: string, base: string, from: string) => {
    let imports;
    try {
      [imports] = parse(source);
    } catch {
      issue("asset", base, "JavaScript could not be parsed for module links.");
      return source;
    }
    // Apply edits right to left so each replacement uses the original offsets.
    for (const entry of [...imports].reverse()) {
      if (
        entry.type === "import-meta" ||
        (entry.type === "dynamic" && entry.glob) ||
        !entry.specifier ||
        !/^(?:https?:|\/|\.\.?\/)/i.test(entry.specifier)
      )
        continue;
      const target = await rewriteAsset(entry.specifier, base, from);
      const start = entry.type === "dynamic" ? entry.start : entry.start - 1;
      const end = entry.type === "dynamic" ? entry.end : entry.end + 1;
      const literal = JSON.stringify(target).replace(/</g, "\\u003c");
      source = source.slice(0, start) + literal + source.slice(end);
    }
    return source;
  };
  const paths = new Map(pages.map((p) => [normalizeUrl(p.url), p.path!]));
  const imageReplayPath = "assets/webexporter-images.js";
  let needsImageReplay = false;
  for (const raw of rawPages) {
    const $ = load(raw.html);
    $(
      'base, meta[http-equiv="Content-Security-Policy"], link[rel="manifest"], link[rel="preconnect"], link[rel="dns-prefetch"]',
    ).remove();
    if (job.options.removeTrackers)
      $("script[src], iframe[src], img[src]").each((_, el) => {
        if (tracker($(el).attr("src") || "")) $(el).remove();
      });
    for (const el of $(
      "[src], [poster], link[href], object[data], [srcset]",
    ).toArray()) {
      const node = $(el);
      if (
        el.tagName === "link" &&
        !/(?:stylesheet|icon|preload|modulepreload)/i.test(
          node.attr("rel") || "",
        )
      ) {
        try {
          node.attr("href", new URL(node.attr("href")!, raw.base).href);
        } catch {
          /* Keep non-resource metadata links unchanged. */
        }
        continue;
      }
      if (el.tagName === "iframe") {
        issue(
          "dependency",
          node.attr("src") || raw.page.url,
          "Embedded third-party content is not bundled.",
        );
        continue;
      }
      for (const attr of [
        "src",
        "poster",
        ...(el.tagName === "link" ? ["href"] : []),
        ...(el.tagName === "object" ? ["data"] : []),
      ]) {
        const value = node.attr(attr);
        if (value)
          node.attr(attr, await rewriteAsset(value, raw.base, raw.page.path!));
      }
      const srcset = node.attr("srcset");
      if (srcset && !srcset.includes("data:")) {
        const entries = await Promise.all(
          srcset.split(",").map(async (part) => {
            const [url, ...descriptor] = part.trim().split(/\s+/);
            return [
              await rewriteAsset(url, raw.base, raw.page.path!),
              ...descriptor,
            ].join(" ");
          }),
        );
        node.attr("srcset", entries.join(", "));
      }
      node.removeAttr("integrity").removeAttr("crossorigin");
    }
    $("a[href]").each((_, el) => {
      const node = $(el),
        value = node.attr("href")!;
      if (/^(#|mailto:|tel:|javascript:)/i.test(value)) return;
      try {
        const url = new URL(value, raw.base);
        const target = paths.get(normalizeUrl(url.href));
        node.attr(
          "href",
          target ? relativeUrl(raw.page.path!, target) + url.hash : url.href,
        );
      } catch {
        /* Keep unsupported links unchanged. */
      }
    });
    for (const el of $("style").toArray())
      $(el).text(await rewriteCss($(el).text(), raw.base, raw.page.path!));
    for (const el of $('script[type="module"]:not([src])').toArray())
      $(el).text(await rewriteScript($(el).text(), raw.base, raw.page.path!));
    for (const el of $("[style]").toArray()) {
      const rewritten = await rewriteCss(
        `x{${$(el).attr("style")}}`,
        raw.base,
        raw.page.path!,
      );
      $(el).attr(
        "style",
        rewritten.slice(rewritten.indexOf("{") + 1, rewritten.lastIndexOf("}")),
      );
    }
    if ($("form").length)
      issue(
        "dependency",
        raw.page.url,
        "Forms may still require the original submission service.",
      );
    $("form[action]").each((_, el) => {
      try {
        $(el).attr("action", new URL($(el).attr("action")!, raw.base).href);
      } catch {
        /* no action */
      }
    });
    if ($("script").length) {
      issue(
        "dependency",
        raw.page.url,
        "Scripts and URL-based module imports are preserved where available. Computed imports, client-side routing and runtime API calls may need manual adaptation.",
      );
      needsImageReplay = true;
      $("head").prepend(
        $("<script>").attr({
          src: relativeUrl(raw.page.path!, imageReplayPath),
          "data-source-base": raw.base,
        }),
      );
    }
    const destination = path.join(site, raw.page.path!);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, $.html());
  }
  // A growing map is intentional: CSS and JavaScript can discover more assets.
  for (const asset of assets.values()) {
    let body = asset.body;
    if (asset.mime === "text/css" || asset.path.endsWith(".css"))
      body = Buffer.from(
        await rewriteCss(body.toString(), asset.base, asset.path),
      );
    if (/\.(?:m?js)$/i.test(asset.path))
      body = Buffer.from(
        await rewriteScript(body.toString(), asset.base, asset.path),
      );
    const destination = path.join(site, asset.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, body);
  }
  if (needsImageReplay) {
    const images: Record<string, string> = {};
    for (const [url, asset] of assets) {
      if (asset.mime.startsWith("image/"))
        images[url] = path.posix.basename(asset.path);
    }
    const destination = path.join(site, imageReplayPath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, imageReplayScript(images));
  }
  const result: Result = {
    pages,
    issues,
    assetCount: assets.size,
    bytes: totalBytes,
  };
  await writeFile(
    path.join(site, "export-report.json"),
    JSON.stringify(
      { source, exportedAt: new Date().toISOString(), ...result },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(site, "README.md"),
    `# Website capture\n\nSource: ${source}\n\nServe this directory over HTTP, for example with \`npx serve .\`, then open the printed URL. Upload the contents of this directory to any static host that supports directory index files.\n\nThis is a rendered static capture, not the original source project. Backend services, databases, authentication and payments are not included. Scripts, dynamic routes, forms and external services may need manual adaptation. Review export-report.json before deployment.\n\nCaptured pages: ${pages.length}\nAssets: ${assets.size}\nReported issues and dependencies: ${issues.length}\n`,
  );
  update({
    phase: "Packaging ZIP",
    current: pages.length,
    total: pages.length,
    message: "Writing the portable website and export report.",
  });
  const zipPath = path.join(dir, "website.zip");
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const zip = new ZipArchive({ zlib: { level: 6 } });
    output.on("close", resolve);
    output.on("error", reject);
    zip.on("error", reject);
    zip.pipe(output);
    zip.directory(site, false);
    void zip.finalize().catch(reject);
  });
  result.zipBytes = (await stat(zipPath)).size;
  return result;
}
