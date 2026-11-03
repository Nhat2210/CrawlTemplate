import { eq, and } from "drizzle-orm";
import { db, jobs, projects, sqlite } from "../../../packages/core/src/db.ts";
import { runCapture } from "../../../packages/core/src/crawler.ts";
const id = process.argv[2];
try {
  const job = db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!job || job.status !== "running") throw new Error("Job is not runnable.");
  const project = db
    .select()
    .from(projects)
    .where(eq(projects.id, job.projectId))
    .get();
  if (!project) throw new Error("Project not found.");
  const result = await runCapture(job, project.url, (progress) => {
    db.update(jobs)
      .set({ progress })
      .where(and(eq(jobs.id, id), eq(jobs.status, "running")))
      .run();
  });
  db.update(jobs)
    .set({
      result,
      status: "completed",
      completedAt: new Date().toISOString(),
      progress: {
        phase: "Completed",
        current: result.pages.length,
        total: result.pages.length,
        message:
          job.kind === "export"
            ? "Your export is ready to review."
            : "Choose the pages you want to export.",
      },
    })
    .where(and(eq(jobs.id, id), eq(jobs.status, "running")))
    .run();
} catch (error) {
  db.update(jobs)
    .set({
      status: "failed",
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    })
    .where(and(eq(jobs.id, id), eq(jobs.status, "running")))
    .run();
  process.exitCode = 1;
} finally {
  sqlite.close();
}
