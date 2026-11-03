import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { config } from "./config.ts";
import type { Options, Progress, Result, Job } from "./types.ts";
mkdirSync(config.storage, { recursive: true });
export const sqlite = new Database(
  path.join(config.storage, "webexporter.sqlite"),
);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("foreign_keys = ON");
sqlite.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), kind TEXT NOT NULL, status TEXT NOT NULL, options TEXT NOT NULL, selected_urls TEXT NOT NULL, progress TEXT NOT NULL, result TEXT, error TEXT, created_at TEXT NOT NULL, completed_at TEXT);
CREATE INDEX IF NOT EXISTS jobs_project ON jobs(project_id, created_at);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status);`);
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  createdAt: text("created_at").notNull(),
});
export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  kind: text("kind").$type<Job["kind"]>().notNull(),
  status: text("status").$type<Job["status"]>().notNull(),
  options: text("options", { mode: "json" }).$type<Options>().notNull(),
  selectedUrls: text("selected_urls", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  progress: text("progress", { mode: "json" }).$type<Progress>().notNull(),
  result: text("result", { mode: "json" }).$type<Result>(),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});
export const db = drizzle(sqlite);
