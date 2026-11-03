import express from "express";
import { z } from "zod";
import { eq, desc, asc, and, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { db, projects, jobs } from "../../../packages/core/src/db.ts";
import { config, root } from "../../../packages/core/src/config.ts";
import { assertPublic, normalizeUrl } from "../../../packages/core/src/urls.ts";
import type { Job } from "../../../packages/core/src/types.ts";

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  if (
    req.path.startsWith("/api") &&
    !["GET", "HEAD", "OPTIONS"].includes(req.method)
  ) {
    const origin = req.headers.origin;
    const allowed = [config.port, config.webPort].flatMap((port) => [
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
    ]);
    if (origin && !allowed.includes(origin))
      return res.status(403).json({
        error:
          "This local API only accepts requests from the WebExporter application.",
      });
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
app.use(express.json({ limit: "256kb" }));
const idSchema = z.uuid();
const optionsSchema = z.object({
  maxPages: z.number().int().min(1).max(100).default(config.maxPages),
  crawlDepth: z.number().int().min(0).max(5).default(config.depth),
  removeTrackers: z.boolean().default(true),
});
const findProject = (id: string) =>
  db
    .select()
    .from(projects)
    .where(eq(projects.id, idSchema.parse(id)))
    .get();
const findJob = (id: string) =>
  db
    .select()
    .from(jobs)
    .where(eq(jobs.id, idSchema.parse(id)))
    .get();
let active: { id: string; process: ChildProcess } | null = null;
let stopping = false;
// A process interrupted by an earlier API shutdown must never remain "running" forever.
db.update(jobs)
  .set({
    status: "failed",
    error:
      "The application stopped during this job. Start a new scan or export to retry.",
    completedAt: new Date().toISOString(),
  })
  .where(eq(jobs.status, "running"))
  .run();
function pump() {
  if (active || stopping) return;
  const next = db
    .select()
    .from(jobs)
    .where(eq(jobs.status, "queued"))
    .orderBy(asc(jobs.createdAt))
    .get();
  if (!next) return;
  db.update(jobs).set({ status: "running" }).where(eq(jobs.id, next.id)).run();
  const child = spawn(
    process.execPath,
    ["--import", "tsx", path.join(root, "apps/worker/src/index.ts"), next.id],
    { cwd: root, env: process.env, stdio: ["ignore", "inherit", "inherit"] },
  );
  active = { id: next.id, process: child };
  const finish = () => {
    db.update(jobs)
      .set({
        status: "failed",
        error: "The capture worker stopped unexpectedly.",
        completedAt: new Date().toISOString(),
      })
      .where(and(eq(jobs.id, next.id), eq(jobs.status, "running")))
      .run();
    active = null;
    pump();
  };
  child.once("error", (error) => {
    console.error("Worker launch failed:", error.message);
  });
  child.once("close", finish);
}
function enqueue(
  projectId: string,
  kind: Job["kind"],
  options: Job["options"],
  selectedUrls: string[] = [],
) {
  const pending = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(inArray(jobs.status, ["queued", "running"]))
    .all();
  if (pending.length >= 10)
    throw Object.assign(
      new Error("The queue is full. Wait for a job to finish."),
      { status: 429 },
    );
  const row: Job = {
    id: randomUUID(),
    projectId,
    kind,
    status: "queued",
    options,
    selectedUrls,
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    progress: {
      phase: "Queued",
      current: 0,
      total: 0,
      message: "Waiting for the capture worker.",
    },
  };
  db.insert(jobs).values(row).run();
  pump();
  return findJob(row.id)!;
}
app.get("/api/health", (_req, res) =>
  res.json({
    status: "ok",
    previewPort: config.previewPort,
    defaults: {
      maxPages: config.maxPages,
      crawlDepth: config.depth,
      removeTrackers: true,
    },
  }),
);
app.get("/api/projects", (_req, res) =>
  res.json(db.select().from(projects).orderBy(desc(projects.createdAt)).all()),
);
app.post("/api/projects", async (req, res) => {
  const input = z
    .object({
      url: z.string().trim().min(1).max(2048),
      name: z.string().trim().max(80).optional(),
    })
    .parse(req.body);
  const url = await assertPublic(input.url);
  const project = {
    id: randomUUID(),
    name: input.name || new URL(url).hostname.replace(/^www\./, ""),
    url,
    createdAt: new Date().toISOString(),
  };
  db.insert(projects).values(project).run();
  res.status(201).json(project);
});
app.get("/api/projects/:id", (req, res) => {
  const project = findProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found." });
  res.json({
    project,
    jobs: db
      .select()
      .from(jobs)
      .where(eq(jobs.projectId, project.id))
      .orderBy(desc(jobs.createdAt))
      .all(),
  });
});
app.post("/api/projects/:id/discover", (req, res) => {
  const project = findProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found." });
  const input = z
    .object({ options: optionsSchema.optional() })
    .parse(req.body || {});
  res
    .status(202)
    .json(
      enqueue(project.id, "discover", input.options || optionsSchema.parse({})),
    );
});
app.post("/api/projects/:id/export", (req, res) => {
  const project = findProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found." });
  const input = z
    .object({
      options: optionsSchema.optional(),
      selectedUrls: z.array(z.string().max(2048)).min(1).max(100),
    })
    .parse(req.body);
  const scans = db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.projectId, project.id),
        eq(jobs.kind, "discover"),
        eq(jobs.status, "completed"),
      ),
    )
    .orderBy(desc(jobs.createdAt))
    .all();
  const allowed = new Set([
    project.url,
    ...(scans[0]?.result?.pages || []).map((p) => p.url),
  ]);
  const selectedUrls = [
    ...new Set(input.selectedUrls.map((u) => normalizeUrl(u))),
  ];
  if (selectedUrls.some((url) => !allowed.has(url)))
    return res
      .status(400)
      .json({ error: "Select pages from the latest successful scan." });
  if (!selectedUrls.includes(project.url))
    return res.status(400).json({
      error: "Keep the entry page selected so the export has an index.html.",
    });
  const options = input.options || optionsSchema.parse({});
  if (selectedUrls.length > options.maxPages)
    return res
      .status(400)
      .json({ error: "The page limit is smaller than your selection." });
  selectedUrls.sort((a, b) =>
    a === project.url ? -1 : b === project.url ? 1 : 0,
  );
  res.status(202).json(enqueue(project.id, "export", options, selectedUrls));
});
app.get("/api/jobs/:id", (req, res) => {
  const job = findJob(req.params.id);
  return job
    ? res.json(job)
    : res.status(404).json({ error: "Job not found." });
});
app.delete("/api/jobs/:id", (req, res) => {
  const job = findJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });
  if (!["queued", "running"].includes(job.status))
    return res
      .status(409)
      .json({ error: "Only queued or running jobs can be cancelled." });
  db.update(jobs)
    .set({ status: "cancelled", completedAt: new Date().toISOString() })
    .where(eq(jobs.id, job.id))
    .run();
  if (active?.id === job.id) active.process.kill("SIGTERM");
  res.json(findJob(job.id));
});
app.get("/api/jobs/:id/events", (req, res) => {
  if (!findJob(req.params.id))
    return res.status(404).json({ error: "Job not found." });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  let previous = "";
  const send = () => {
    const job = findJob(req.params.id);
    const data = JSON.stringify(job);
    if (data !== previous) {
      res.write(`data: ${data}\n\n`);
      previous = data;
    } else res.write(": heartbeat\n\n");
    if (!job || !["running", "queued"].includes(job.status)) {
      clearInterval(timer);
      res.end();
    }
  };
  const timer = setInterval(send, 750);
  send();
  req.on("close", () => clearInterval(timer));
});
app.get("/api/jobs/:id/download", (req, res) => {
  const job = findJob(req.params.id);
  if (!job || job.status !== "completed" || job.kind !== "export")
    return res
      .status(409)
      .json({ error: "This export is not ready for download." });
  const project = findProject(job.projectId)!;
  res.download(
    path.join(config.storage, "jobs", job.id, "website.zip"),
    `${project.name.replace(/[^a-z0-9.-]/gi, "-")}-${job.id.slice(0, 8)}.zip`,
  );
});
app.get("/api/jobs/:id/screenshots/:file", (req, res) => {
  const job = findJob(req.params.id);
  if (!job || job.status !== "completed" || !/^\d+\.png$/.test(req.params.file))
    return res.sendStatus(404);
  res.sendFile(
    path.join(config.storage, "jobs", job.id, "screenshots", req.params.file),
  );
});
const web = path.join(root, "dist/web");
if (existsSync(web)) {
  app.use(express.static(web));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(web, "index.html")),
  );
}
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const err = error as Error & { status?: number };
    res.status(error instanceof z.ZodError ? 400 : err.status || 400).json({
      error:
        error instanceof z.ZodError
          ? error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; ")
          : err.message || "Request failed.",
    });
  },
);
const preview = express();
preview.disable("x-powered-by");
preview.use((_req, res, next) => {
  // Captured scripts run on another origin and cannot read the application's API/storage.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; sandbox allow-scripts",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
preview.use("/:id/site", (req, res, next) => {
  let job;
  try {
    job = findJob(req.params.id);
  } catch {
    return res.sendStatus(404);
  }
  if (!job || job.kind !== "export" || job.status !== "completed")
    return res.sendStatus(404);
  // Sandboxed documents have opaque origins; local font responses need CORS.
  res.setHeader("Access-Control-Allow-Origin", "*");
  express.static(path.join(config.storage, "jobs", job.id, "site"), {
    index: "index.html",
    dotfiles: "deny",
  })(req, res, next);
});
const apiServer = app.listen(config.port, config.host, () => {
  console.log(`WebExporter API: http://127.0.0.1:${config.port}`);
  pump();
});
const previewServer = preview.listen(config.previewPort, config.host, () =>
  console.log(`Isolated preview: http://127.0.0.1:${config.previewPort}`),
);
for (const server of [apiServer, previewServer])
  server.on("error", (error) => {
    console.error(error.message);
    stop();
    process.exitCode = 1;
  });
function stop() {
  if (stopping) return;
  stopping = true;
  if (active) {
    db.update(jobs)
      .set({
        status: "failed",
        error: "Application stopped. Start a new job to retry.",
        completedAt: new Date().toISOString(),
      })
      .where(and(eq(jobs.id, active.id), eq(jobs.status, "running")))
      .run();
    active.process.kill("SIGTERM");
  }
  apiServer.close();
  previewServer.close();
  apiServer.closeAllConnections();
  previewServer.closeAllConnections();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
