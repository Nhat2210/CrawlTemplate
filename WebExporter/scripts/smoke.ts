import http from "node:http";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import type { Job } from "../packages/core/src/types.ts";
const exec = promisify(execFile);
const storage = await mkdtemp(path.join(os.tmpdir(), "webexporter-e2e-"));
const screenshotDir = path.resolve(".taste-skill/smoke");
await mkdir(screenshotDir, { recursive: true });
const font = await readFile(
  "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2",
);
const fixture = http.createServer((req, res) => {
  if (req.url === "/style.css") {
    res.setHeader("Content-Type", "text/css");
    res.end(
      '@import "/theme.css"; @font-face{font-family:Fixture;src:url(/font.woff2)} body{font-family:Fixture;background-image:url(/tile.svg)}',
    );
  } else if (req.url === "/theme.css") {
    res.setHeader("Content-Type", "text/css");
    res.end(
      "body{background-color:#f3f7f6;color:#152424;margin:48px}h1{font-size:40px}a{color:#1b6c80}",
    );
  } else if (req.url === "/font.woff2") {
    res.setHeader("Content-Type", "font/woff2");
    res.end(font);
  } else if (req.url === "/tile.svg") {
    res.setHeader("Content-Type", "image/svg+xml");
    res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="60" cy="60" r="4" fill="#c6d9d6"/></svg>',
    );
  } else if (req.url === "/missing.png") {
    res.statusCode = 404;
    res.end("Missing");
  } else if (req.url === "/app.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(
      `document.querySelector('#dynamic').innerHTML='<a href="/rendered">Rendered link</a>';`,
    );
  } else if (req.url === "/slow") {
    setTimeout(() => {
      if (!res.destroyed) res.end("<html>Slow page</html>");
    }, 15000).unref();
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<!doctype html><html><head><title>${req.url === "/" ? "Studio fixture" : req.url === "/about" ? "About the studio" : "Rendered page"}</title><link rel="stylesheet" href="/style.css"></head><body><h1>Studio fixture</h1><p>A rendered website for a real export test.</p><a href="/">Home</a> · <a href="/about">About</a><div id="dynamic"></div><img src="/tile.svg" alt="Pattern"><img src="/missing.png" alt="Deliberately missing image"><script src="/app.js"></script></body></html>`,
    );
  }
});
await new Promise<void>((resolve) =>
  fixture.listen(4455, "127.0.0.1", resolve),
);
let output = "";
const server = spawn(
  process.execPath,
  ["--import", "tsx", "apps/api/src/index.ts"],
  {
    env: {
      ...process.env,
      PORT: "4410",
      PREVIEW_PORT: "4411",
      WEB_PORT: "3000",
      STORAGE_DIR: storage,
      ALLOW_PRIVATE_NETWORK: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
server.stdout.on("data", (data) => {
  output += data;
});
server.stderr.on("data", (data) => {
  output += data;
});
const base = "http://127.0.0.1:4410";
async function request(url: string, init?: RequestInit) {
  const r = await fetch(base + url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  return { status: r.status, data: await r.json() };
}
async function waitFor<T>(
  fn: () => Promise<T | false>,
  timeout = 90000,
): Promise<T> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await fn().catch(() => false as const);
    if (result) return result;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Timed out.\n" + output);
}
const browser = await chromium.launch();
try {
  await waitFor(
    async () => (await request("/api/health")).status === 200,
    20000,
  );
  assert.equal(
    (
      await request("/api/projects", {
        method: "POST",
        body: JSON.stringify({ url: "file:///etc/passwd" }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/projects", {
        method: "POST",
        headers: { Origin: "https://unrelated.example" },
        body: JSON.stringify({ url: "http://127.0.0.1:4455/" }),
      })
    ).status,
    403,
  );
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(base);
  await page.getByRole("heading", { name: "Website projects" }).waitFor();
  await page.screenshot({
    path: path.join(screenshotDir, "workspace.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Website URL", { exact: true })
    .fill("http://127.0.0.1:4455/");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("heading", { name: "127.0.0.1" }).waitFor();
  await page.getByRole("button", { name: "Scan website", exact: true }).click();
  const exportButton = page.getByRole("button", { name: "Export 3 pages" });
  await exportButton.waitFor({ timeout: 60000 });
  await exportButton.click();
  const downloadLink = page.getByRole("link", { name: "Download ZIP" });
  await downloadLink.waitFor({ timeout: 60000 });
  const project = (await request("/api/projects")).data[0];
  const detail = await request(`/api/projects/${project.id}`);
  const job: Job = detail.data.jobs.find((j: Job) => j.kind === "export");
  assert.equal(job.status, "completed");
  assert.equal(job.result!.pages.length, 3);
  assert.ok(job.result!.assetCount >= 5);
  assert.ok(
    job.result!.issues.some(
      (i) => i.kind === "asset" && i.url.includes("missing.png"),
    ),
  );
  const html = await readFile(
    path.join(storage, "jobs", job.id, "site/index.html"),
    "utf8",
  );
  assert.ok(html.includes("./assets/"));
  assert.ok(html.includes("./pages/about-"));
  assert.ok(!html.includes('src="/tile.svg"'));
  const { stdout: zipTest } = await exec("unzip", [
    "-t",
    path.join(storage, "jobs", job.id, "website.zip"),
  ]);
  assert.match(zipTest, /No errors detected/);
  const { stdout: zipHtml } = await exec("unzip", [
    "-p",
    path.join(storage, "jobs", job.id, "website.zip"),
    "index.html",
  ]);
  assert.match(zipHtml, /Studio fixture/);
  const cssFiles = (
    await (
      await import("node:fs/promises")
    ).readdir(path.join(storage, "jobs", job.id, "site/assets"))
  ).filter((f) => f.endsWith(".css"));
  for (const file of cssFiles) {
    const css = await readFile(
      path.join(storage, "jobs", job.id, "site/assets", file),
      "utf8",
    );
    assert.ok(!css.includes("url(/"), css);
    assert.ok(!css.includes('"/theme.css"'), css);
  }
  const preview = await fetch(
    `http://127.0.0.1:4411/${job.id}/site/index.html`,
  );
  assert.equal(preview.status, 200);
  assert.match(
    preview.headers.get("content-security-policy")!,
    /connect-src 'none'/,
  );
  const capturedFrame = page
    .frames()
    .find((frame) => frame.url().includes(`/${job.id}/site/`));
  assert.ok(capturedFrame, "Exported iframe is mounted");
  await capturedFrame.waitForFunction(() =>
    document.fonts.check("16px Fixture"),
  );
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page.screenshot({
    path: path.join(screenshotDir, "preview.png"),
    fullPage: true,
  });
  await page.getByRole("tab", { name: /Export report/ }).click();
  await page.getByRole("heading", { name: "Your export is ready." }).waitFor();
  await page.screenshot({
    path: path.join(screenshotDir, "report.png"),
    fullPage: true,
  });
  const downloadPromise = page.waitForEvent("download");
  await downloadLink.click();
  const download = await downloadPromise;
  await download.saveAs(path.join(storage, "download.zip"));
  assert.ok((await readFile(path.join(storage, "download.zip"))).length > 1000);
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(
      () =>
        document.querySelector(".sidebar")!.getBoundingClientRect().right <= 0,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: path.join(screenshotDir, `report-${width}.png`),
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page
    .getByRole("heading", { name: "Preferences", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  // Cancellation is a terminal state and must not be overwritten by worker shutdown.
  const slow = (
    await request("/api/projects", {
      method: "POST",
      body: JSON.stringify({ url: "http://127.0.0.1:4455/slow" }),
    })
  ).data;
  const cancelled = (
    await request(`/api/projects/${slow.id}/discover`, {
      method: "POST",
      body: "{}",
    })
  ).data;
  assert.equal(
    (await request(`/api/jobs/${cancelled.id}`, { method: "DELETE" })).data
      .status,
    "cancelled",
  );
  assert.equal(
    (await request(`/api/jobs/${cancelled.id}`)).data.status,
    "cancelled",
  );
  console.log(
    `PASS: UI create → scan → export → preview → report → ZIP download; ${job.result!.pages.length} rendered pages, ${job.result!.assetCount} assets; CSS rewrites, responsive layouts, cancellation and local origin guard.`,
  );
} catch (error) {
  console.error(output);
  for (const page of browser.contexts().flatMap((c) => c.pages())) {
    console.error((await page.locator("body").innerText()).slice(0, 8000));
    await page
      .screenshot({
        path: path.join(screenshotDir, "failure.png"),
        fullPage: true,
      })
      .catch(() => {});
  }
  const projects = (await request("/api/projects")).data;
  for (const project of projects)
    console.error(
      JSON.stringify(
        (await request(`/api/projects/${project.id}`)).data,
        null,
        2,
      ),
    );
  throw error;
} finally {
  await browser.close();
  server.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    if (server.exitCode !== null) resolve();
    else server.once("close", () => resolve());
  });
  fixture.closeAllConnections();
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
  await rm(storage, { recursive: true, force: true });
}
