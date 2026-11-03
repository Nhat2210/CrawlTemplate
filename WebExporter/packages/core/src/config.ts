import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const root = fileURLToPath(new URL("../../../", import.meta.url));
export const config = {
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 4310),
  previewPort: Number(process.env.PREVIEW_PORT || 4311),
  webPort: Number(process.env.WEB_PORT || 3000),
  storage: path.resolve(root, process.env.STORAGE_DIR || "storage"),
  maxPages: Math.min(100, Math.max(1, Number(process.env.MAX_PAGES || 30))),
  depth: Math.min(5, Math.max(0, Number(process.env.CRAWL_DEPTH || 2))),
  timeout: Number(process.env.PAGE_TIMEOUT || 30000),
  allowPrivate: process.env.ALLOW_PRIVATE_NETWORK === "true",
};
