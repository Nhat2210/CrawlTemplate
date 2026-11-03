export type Options = {
  maxPages: number;
  crawlDepth: number;
  removeTrackers: boolean;
};
export type CapturedPage = {
  url: string;
  title: string;
  depth: number;
  path?: string;
  screenshot?: string;
};
export type Issue = {
  url: string;
  message: string;
  kind: "page" | "asset" | "dependency";
};
export type Progress = {
  phase: string;
  current: number;
  total: number;
  message: string;
};
export type Result = {
  pages: CapturedPage[];
  issues: Issue[];
  assetCount: number;
  bytes: number;
  zipBytes?: number;
};
export type Project = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
};
export type Job = {
  id: string;
  projectId: string;
  kind: "discover" | "export";
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  options: Options;
  selectedUrls: string[];
  progress: Progress;
  result: Result | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};
