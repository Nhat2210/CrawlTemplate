import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileCode2,
  FileImage,
  Folder,
  Globe2,
  Layers3,
  LayoutGrid,
  Loader2,
  Menu,
  Monitor,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Square,
  Tablet,
  X,
} from "lucide-react";
import type {
  Project,
  Job,
  Options,
  CapturedPage,
} from "../../../packages/core/src/types";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "./styles.css";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${url}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "The request could not be completed.");
  return data;
}
const formatBytes = (bytes: number) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
const busy = (job?: Job) => !!job && ["queued", "running"].includes(job.status);
const Mark = () => (
  <svg
    className="brand-mark"
    width="27"
    height="29"
    viewBox="0 0 27 29"
    fill="none"
    aria-hidden="true"
  >
    <path d="M2 3h15v15H2z" stroke="currentColor" strokeWidth="2" />
    <path
      d="M9 10h15v15H9z"
      fill="var(--ground)"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path d="M13 15h6m0 0v6m0-6-7 7" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);
function Status({ job }: { job?: Job }) {
  if (!job)
    return (
      <span className="status neutral">
        <span className="status-dot" />
        Not scanned
      </span>
    );
  const labels = {
    queued: "Queued",
    running: "In progress",
    completed: job.kind === "export" ? "Export ready" : "Scanned",
    failed: "Needs attention",
    cancelled: "Cancelled",
  };
  return (
    <span className={`status ${job.status}`}>
      <span className="status-dot" />
      {labels[job.status]}
    </span>
  );
}

function App() {
  const [projects, setProjects] = useState<Project[]>([]),
    [project, setProject] = useState<Project | null>(null),
    [jobs, setJobs] = useState<Job[]>([]);
  const [view, setView] = useState<"projects" | "history" | "settings">(
    "projects",
  );
  const [tab, setTab] = useState<"pages" | "preview" | "report">("pages");
  const [url, setUrl] = useState(""),
    [search, setSearch] = useState(""),
    [error, setError] = useState("");
  const [loading, setLoading] = useState(true),
    [submitting, setSubmitting] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [mobileNav, setMobileNav] = useState(false);
  const [selected, setSelected] = useState<string[]>([]),
    [options, setOptions] = useState<Options>({
      maxPages: 30,
      crawlDepth: 2,
      removeTrackers: true,
    });
  const [previewPort, setPreviewPort] = useState(4311),
    [previewPage, setPreviewPage] = useState(0),
    [device, setDevice] = useState("desktop"),
    [mode, setMode] = useState("export");
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const scanId = useRef("");
  const activeJob = jobs.find((j) => busy(j));
  const scan = jobs.find(
    (j) => j.kind === "discover" && j.status === "completed",
  );
  const exported =
    jobs.find(
      (j) =>
        j.id === previewJobId &&
        j.kind === "export" &&
        j.status === "completed",
    ) || jobs.find((j) => j.kind === "export" && j.status === "completed");
  const pages = scan?.result?.pages || [];
  const currentPage =
    exported?.result?.pages[previewPage] || exported?.result?.pages[0];

  useEffect(() => {
    Promise.all([
      api<Project[]>("/projects"),
      api<{ previewPort: number; defaults: Options }>("/health"),
    ])
      .then(([list, health]) => {
        setProjects(list);
        setPreviewPort(health.previewPort);
        setOptions(health.defaults);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!project) return;
    let disposed = false;
    setLoading(true);
    setJobs([]);
    setSelected([]);
    scanId.current = "";
    api<{ jobs: Job[] }>(`/projects/${project.id}`)
      .then((data) => {
        if (!disposed) setJobs(data.jobs);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [project?.id]);
  useEffect(() => {
    if (scan && scan.id !== scanId.current) {
      scanId.current = scan.id;
      setSelected(scan.result!.pages.map((p) => p.url));
    }
  }, [scan?.id]);
  useEffect(() => {
    if (!activeJob) return;
    const stream = new EventSource(`/api/jobs/${activeJob.id}/events`);
    stream.onmessage = (event) => {
      const job: Job = JSON.parse(event.data);
      setJobs((current) => current.map((j) => (j.id === job.id ? job : j)));
      if (!busy(job)) {
        stream.close();
        if (job.status === "completed" && job.kind === "export") {
          setTab("preview");
          setPreviewPage(0);
          setPreviewJobId(job.id);
        }
      }
    };
    stream.onerror = () => {
      void api<Job>(`/jobs/${activeJob.id}`)
        .then((job) =>
          setJobs((current) => current.map((j) => (j.id === job.id ? job : j))),
        )
        .catch(() => {});
    };
    return () => stream.close();
  }, [activeJob?.id]);

  const perform = async (action: () => Promise<void>) => {
    setError("");
    setSubmitting(true);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };
  const createProject = (event: React.FormEvent) => {
    event.preventDefault();
    void perform(async () => {
      const input = /^https?:\/\//i.test(url.trim())
        ? url.trim()
        : `https://${url.trim()}`;
      const created = await api<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({ url: input }),
      });
      setProjects((list) => [created, ...list]);
      setProject(created);
      setTab("pages");
      setView("projects");
      setUrl("");
    });
  };
  const enqueue = (kind: "discover" | "export") =>
    void perform(async () => {
      if (!project) return;
      const job = await api<Job>(`/projects/${project.id}/${kind}`, {
        method: "POST",
        body: JSON.stringify({
          options,
          ...(kind === "export" ? { selectedUrls: selected } : {}),
        }),
      });
      setJobs((current) => [job, ...current]);
    });
  const cancel = () =>
    void perform(async () => {
      if (activeJob) {
        const job = await api<Job>(`/jobs/${activeJob.id}`, {
          method: "DELETE",
        });
        setJobs((current) => current.map((j) => (j.id === job.id ? job : j)));
      }
    });
  const goHome = () => {
    setProject(null);
    setJobs([]);
    setError("");
    setView("projects");
    setMobileNav(false);
  };
  const openProject = (item: Project) => {
    setProject(item);
    setView("projects");
    setTab("pages");
    setPreviewJobId(null);
    setPreviewPage(0);
    setError("");
    setMobileNav(false);
  };
  const optionFields = (
    <div className="option-grid">
      <label>
        Page limit
        <input
          type="number"
          min="1"
          max="100"
          value={options.maxPages}
          onChange={(e) =>
            setOptions((o) => ({ ...o, maxPages: Number(e.target.value) }))
          }
        />
      </label>
      <label>
        Link depth
        <input
          type="number"
          min="0"
          max="5"
          value={options.crawlDepth}
          onChange={(e) =>
            setOptions((o) => ({ ...o, crawlDepth: Number(e.target.value) }))
          }
        />
      </label>
      <label className="toggle-label">
        <span>
          Remove known trackers
          <small>Filters recognized tracking providers</small>
        </span>
        <input
          type="checkbox"
          checked={options.removeTrackers}
          onChange={(e) =>
            setOptions((o) => ({ ...o, removeTrackers: e.target.checked }))
          }
        />
      </label>
    </div>
  );
  const previewURL = (p: CapturedPage) =>
    `http://127.0.0.1:${previewPort}/${exported!.id}/site/${p.path}`;
  const exportContent = (job: Job) => {
    setPreviewJobId(job.id);
    setPreviewPage(0);
    setTab("preview");
    setView("projects");
  };

  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <button
          className="wordmark"
          onClick={goHome}
          aria-label="WebExporter home"
        >
          <Mark />
          <span>WebExporter</span>
        </button>
        <div className="workspace">
          <span className="workspace-avatar">W</span>
          <span>
            Personal workspace<small>Local environment</small>
          </span>
          <ShieldCheck size={15} />
        </div>
        <div className="nav-caption">Workspace</div>
        <nav aria-label="Main navigation">
          <button
            className={view === "projects" ? "active" : ""}
            aria-current={view === "projects" ? "page" : undefined}
            onClick={() => {
              setView("projects");
              setMobileNav(false);
            }}
          >
            <LayoutGrid size={17} />
            Projects
          </button>
          <button
            className={view === "history" ? "active" : ""}
            onClick={() => {
              setView("history");
              setMobileNav(false);
            }}
          >
            <Clock3 size={17} />
            Export history
          </button>
          <button
            className={view === "settings" ? "active" : ""}
            onClick={() => {
              setView("settings");
              setMobileNav(false);
            }}
          >
            <Settings2 size={17} />
            Preferences
          </button>
        </nav>
        <div className="sidebar-projects">
          <div className="nav-caption">
            Recent projects
            <button
              className="icon-button"
              aria-label="New project"
              onClick={goHome}
            >
              <Plus size={15} />
            </button>
          </div>
          {projects.slice(0, 5).map((p) => (
            <button
              key={p.id}
              className={`project-link ${p.id === project?.id ? "chosen" : ""}`}
              onClick={() => openProject(p)}
            >
              <Globe2 size={15} />
              <span>{p.name}</span>
            </button>
          ))}
          {!projects.length && (
            <p className="sidebar-empty">
              Your captured websites
              <br />
              will appear here.
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <span className="local-indicator" />
          <span>
            Everything stays on your device
            <small>WebExporter · Local edition</small>
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <span>WebExporter</span>
            <ChevronRight size={13} />
            <span>
              {view === "settings"
                ? "Preferences"
                : view === "history"
                  ? "Export history"
                  : project
                    ? project.name
                    : "Projects"}
            </span>
          </div>
          <span className="local-badge">
            <span className="local-indicator" />
            Running locally
          </span>
        </header>
        <main className="sheet">
          {error && (
            <div className="error-banner" role="alert">
              <CircleAlert size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {view === "projects" && !project && (
            <>
              <div className="title-row">
                <div>
                  <h1>Website projects</h1>
                  <p>Bring a website into your own workspace.</p>
                </div>
                <span className="quiet-count">
                  {projects.length}{" "}
                  {projects.length === 1 ? "project" : "projects"}
                </span>
              </div>
              <div className="start-layout">
                <section className="capture-panel">
                  <div className="capture-symbol">
                    <Mark />
                  </div>
                  <h2>Start with a website.</h2>
                  <p>
                    Capture the pages you need. Review the result.
                    <br className="desktop-break" /> Take a portable website
                    with you.
                  </p>
                  <form onSubmit={createProject}>
                    <label htmlFor="website-url">Website URL</label>
                    <div className="url-control">
                      <Globe2 size={19} />
                      <input
                        id="website-url"
                        type="text"
                        inputMode="url"
                        autoComplete="url"
                        required
                        placeholder="Paste a website URL"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                      <button className="primary" disabled={submitting}>
                        {submitting ? (
                          <Loader2 className="spin" size={16} />
                        ) : (
                          <ArrowRight size={17} />
                        )}
                        <span>Create project</span>
                      </button>
                    </div>
                  </form>
                  <p className="field-note">
                    <ShieldCheck size={14} />
                    Public websites. Local files. Your workspace.
                  </p>
                </section>
                <section className="output-panel">
                  <div className="panel-heading">
                    <h2>Your export, unpacked</h2>
                    <ArrowDownToLine size={17} />
                  </div>
                  <div className="file-tree">
                    <div>
                      <Folder size={17} />
                      <strong>your-website/</strong>
                    </div>
                    <div className="tree-child">
                      <FileCode2 size={16} />
                      index.html<span>Pages</span>
                    </div>
                    <div className="tree-child">
                      <Folder size={16} />
                      assets/<span>Styles, images, fonts</span>
                    </div>
                    <div className="tree-child">
                      <FileCode2 size={16} />
                      export-report.json<span>Capture report</span>
                    </div>
                    <div className="tree-child">
                      <FileCode2 size={16} />
                      README.md<span>Hosting guide</span>
                    </div>
                  </div>
                  <div className="output-note">
                    A static website in a ZIP.
                    <br />
                    <span>Ready to review and host on your terms.</span>
                  </div>
                </section>
              </div>
              <section className="projects-section">
                <div className="section-title">
                  <h2>
                    All projects <span>{projects.length}</span>
                  </h2>
                  <label className="search-control">
                    <Search size={16} />
                    <input
                      aria-label="Search projects"
                      placeholder="Find a project"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>
                {loading ? (
                  <div className="loading-state">
                    <Loader2 className="spin" size={18} />
                    Loading your workspace…
                  </div>
                ) : projects.length ? (
                  <div className="project-list">
                    {projects
                      .filter((p) =>
                        `${p.name} ${p.url}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((p) => (
                        <button
                          className="project-row"
                          key={p.id}
                          onClick={() => openProject(p)}
                        >
                          <div className="site-thumb">
                            <Globe2 size={24} />
                          </div>
                          <div>
                            <strong>{p.name}</strong>
                            <span>{p.url}</span>
                          </div>
                          <time>{formatDate(p.createdAt)}</time>
                          <ArrowUpRight size={18} />
                        </button>
                      ))}
                    {!projects.some((p) =>
                      `${p.name} ${p.url}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    ) && (
                      <p className="empty-inline">
                        No projects match “{search}”.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="first-project">
                    <div className="empty-file">
                      <Layers3 size={27} />
                    </div>
                    <div>
                      <h3>A home for your website captures</h3>
                      <p>
                        Create your first project using the URL field above.
                        <br />
                        Your pages, export history and reports stay together
                        here.
                      </p>
                    </div>
                    <ArrowUpRight size={23} />
                  </div>
                )}
              </section>
              <div className="workflow-strip">
                <div>
                  <span className="workflow-dot" />
                  <strong>Discover</strong>
                  <span>Choose exactly what to keep</span>
                </div>
                <ChevronRight size={14} />
                <div>
                  <span className="workflow-dot" />
                  <strong>Review</strong>
                  <span>Check pages and dependencies</span>
                </div>
                <ChevronRight size={14} />
                <div>
                  <span className="workflow-dot" />
                  <strong>Export</strong>
                  <span>Download your website ZIP</span>
                </div>
              </div>
            </>
          )}

          {project && view === "projects" && (
            <>
              <button className="back-link" onClick={goHome}>
                <ArrowLeft size={15} />
                All projects
              </button>
              <div className="title-row">
                <div>
                  <h1>{project.name}</h1>
                  <p className="source-url">
                    {project.url}
                    <a
                      href={project.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open original website"
                    >
                      <ExternalLink size={13} />
                    </a>
                  </p>
                </div>
                <div className="title-actions">
                  <Status job={jobs[0]} />
                  {exported && (
                    <a
                      className="primary"
                      href={`/api/jobs/${exported.id}/download`}
                    >
                      <ArrowDownToLine size={16} />
                      Download ZIP
                    </a>
                  )}
                </div>
              </div>
              <div className="tabs" role="tablist" aria-label="Project views">
                {(["pages", "preview", "report"] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                  >
                    {t === "pages"
                      ? "Pages"
                      : t === "preview"
                        ? "Preview"
                        : "Export report"}
                    {t === "pages" && !!pages.length && (
                      <span>{pages.length}</span>
                    )}
                    {t === "report" && !!exported?.result?.issues.length && (
                      <span>{exported.result.issues.length}</span>
                    )}
                  </button>
                ))}
              </div>
              {activeJob && (
                <section className="progress-panel" aria-live="polite">
                  <div>
                    <Loader2 className="spin" size={18} />
                    <strong>{activeJob.progress.phase}</strong>
                    <span>
                      {activeJob.progress.current}
                      {activeJob.progress.total
                        ? ` / ${activeJob.progress.total}`
                        : ""}{" "}
                      pages
                    </span>
                    <button
                      className="text-button"
                      onClick={cancel}
                      disabled={submitting}
                    >
                      <Square size={12} />
                      Cancel
                    </button>
                  </div>
                  <div className="progress-track">
                    <div
                      style={{
                        width: activeJob.progress.total
                          ? `${Math.min(98, (activeJob.progress.current / activeJob.progress.total) * 100)}%`
                          : "3%",
                      }}
                    />
                  </div>
                  <p>{activeJob.progress.message}</p>
                </section>
              )}
              {jobs[0]?.status === "failed" && (
                <div className="error-banner" role="alert">
                  <CircleAlert size={17} />
                  <span>{jobs[0].error}</span>
                  <button
                    className="text-button"
                    onClick={() => enqueue(jobs[0].kind)}
                  >
                    Retry
                  </button>
                </div>
              )}
              {loading ? (
                <div className="loading-state">
                  <Loader2 className="spin" size={18} />
                  Loading project…
                </div>
              ) : tab === "pages" ? (
                <>
                  <section className="scan-controls">
                    <div>
                      <h2>
                        {scan ? "Choose your pages" : "Discover what’s inside"}
                      </h2>
                      <p>
                        {scan
                          ? "The entry page stays selected as the home of your export."
                          : "Scan this website to find the pages you want to take with you."}
                      </p>
                    </div>
                    <div className="inline-actions">
                      <button
                        className="secondary"
                        onClick={() => setAdvanced(!advanced)}
                        aria-expanded={advanced}
                      >
                        <Settings2 size={15} />
                        Scan options
                        <ChevronDown size={13} />
                      </button>
                      <button
                        className={scan ? "secondary" : "primary"}
                        onClick={() => enqueue("discover")}
                        disabled={submitting || !!activeJob}
                      >
                        {scan ? <RefreshCw size={15} /> : <Search size={15} />}{" "}
                        {scan ? "Rescan website" : "Scan website"}
                      </button>
                    </div>
                  </section>
                  {advanced && (
                    <section className="options-panel">{optionFields}</section>
                  )}
                  {!!pages.length ? (
                    <>
                      <div className="selection-bar">
                        <span>
                          {selected.length} of {pages.length} pages selected
                        </span>
                        <button
                          className="text-button"
                          disabled={!!activeJob}
                          onClick={() =>
                            setSelected(
                              selected.length === pages.length
                                ? [project.url]
                                : pages.map((p) => p.url),
                            )
                          }
                        >
                          {selected.length === pages.length
                            ? "Deselect optional pages"
                            : "Select all"}
                        </button>
                      </div>
                      <div className="pages-table">
                        <div className="pages-head">
                          <span>Page</span>
                          <span>Depth</span>
                          <span>Source</span>
                        </div>
                        {pages.map((p) => (
                          <label className="page-row" key={p.url}>
                            <input
                              type="checkbox"
                              checked={selected.includes(p.url)}
                              disabled={p.url === project.url || !!activeJob}
                              onChange={(e) =>
                                setSelected((list) =>
                                  e.target.checked
                                    ? [...list, p.url]
                                    : list.filter((x) => x !== p.url),
                                )
                              }
                            />
                            <div>
                              <strong>{p.title}</strong>
                              <span>
                                {new URL(p.url).pathname}
                                {new URL(p.url).search}
                              </span>
                            </div>
                            <span className="num">{p.depth}</span>
                            <span className="page-source">
                              {p.url === project.url
                                ? "Entry page"
                                : "Internal link"}
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="export-footer">
                        <span>
                          <Folder size={15} />
                          HTML, styles, images & fonts
                        </span>
                        <button
                          className="primary"
                          disabled={
                            !!activeJob || submitting || !selected.length
                          }
                          onClick={() => enqueue("export")}
                        >
                          <ArrowDownToLine size={16} />
                          Export {selected.length}{" "}
                          {selected.length === 1 ? "page" : "pages"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="scan-empty">
                      <Globe2 size={38} />
                      <h3>Your capture starts here</h3>
                      <p>
                        A scan follows links within the same website.
                        <br />
                        You choose the pages before anything is exported.
                      </p>
                    </div>
                  )}
                  {!!scan?.result?.issues.length && (
                    <div className="notice">
                      <CircleAlert size={16} />
                      {scan.result.issues.length} pages could not be scanned.{" "}
                      <button
                        className="text-button"
                        onClick={() => setTab("report")}
                      >
                        View details
                      </button>
                    </div>
                  )}
                </>
              ) : tab === "preview" ? (
                exported && currentPage ? (
                  <section className="preview-section">
                    <div className="preview-toolbar">
                      <label className="page-select">
                        <FileCode2 size={15} />
                        <select
                          aria-label="Preview page"
                          value={previewPage}
                          onChange={(e) =>
                            setPreviewPage(Number(e.target.value))
                          }
                        >
                          {exported.result!.pages.map((p, i) => (
                            <option value={i} key={p.url}>
                              {p.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="preview-modes">
                        {["original", "export", "compare"].map((m) => (
                          <button
                            key={m}
                            className={mode === m ? "selected" : ""}
                            onClick={() => setMode(m)}
                          >
                            {m === "original"
                              ? "Original capture"
                              : m === "export"
                                ? "Exported"
                                : "Compare"}
                          </button>
                        ))}
                      </div>
                      <div className="device-controls">
                        {[
                          ["desktop", Monitor],
                          ["tablet", Tablet],
                          ["mobile", Smartphone],
                        ].map(([name, Icon]) => {
                          const DeviceIcon = Icon as typeof Monitor;
                          return (
                            <button
                              key={name as string}
                              className={`icon-button ${device === name ? "selected" : ""}`}
                              aria-label={`Preview ${name}`}
                              aria-pressed={device === name}
                              onClick={() => setDevice(name as string)}
                            >
                              <DeviceIcon size={17} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div
                      className={`preview-stage ${mode === "compare" ? "compare" : ""}`}
                    >
                      {mode !== "export" && (
                        <div className="preview-pane">
                          <div className="preview-caption">
                            Original · captured at desktop width
                          </div>
                          <div className="original-scroll">
                            <img
                              className="original-capture"
                              src={`/api/jobs/${exported.id}/screenshots/${currentPage.screenshot}`}
                              alt={`Original desktop capture of ${currentPage.title}`}
                            />
                          </div>
                        </div>
                      )}
                      {mode !== "original" && (
                        <div className="preview-pane">
                          <div className="preview-caption">
                            Exported · {device}
                          </div>
                          <div className="frame-scroll">
                            <ExportFrame
                              title={`Exported ${currentPage.title}`}
                              src={previewURL(currentPage)}
                              width={
                                device === "mobile"
                                  ? 390
                                  : device === "tablet"
                                    ? 768
                                    : 1366
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="preview-footnote">
                      <ShieldCheck size={14} />
                      Preview blocks outgoing API calls and form submissions.
                      <span>
                        Original is a screenshot; device controls apply to the
                        export.
                      </span>
                    </div>
                  </section>
                ) : (
                  <EmptyExport onPages={() => setTab("pages")} />
                )
              ) : (
                <>
                  {exported ? (
                    <>
                      <div className="report-heading">
                        <div>
                          <h2>Your export is ready.</h2>
                          <p>
                            {exported.result!.issues.length
                              ? "Review these dependencies before hosting your website."
                              : "No capture issues were reported. Review the preview before deployment."}
                          </p>
                        </div>
                        <CheckCircle2 size={27} />
                      </div>
                      <div className="metric-strip">
                        <div>
                          <span>Pages captured</span>
                          <strong className="num">
                            {exported.result!.pages.length}
                          </strong>
                        </div>
                        <div>
                          <span>Assets bundled</span>
                          <strong className="num">
                            {exported.result!.assetCount}
                          </strong>
                        </div>
                        <div>
                          <span>ZIP size</span>
                          <strong className="num">
                            {formatBytes(exported.result!.zipBytes || 0)}
                          </strong>
                        </div>
                        <div>
                          <span>Items to review</span>
                          <strong className="num">
                            {exported.result!.issues.length}
                          </strong>
                        </div>
                      </div>
                      <h2 className="report-title">
                        Capture notes & dependencies
                      </h2>
                      <IssueList issues={exported.result!.issues} />
                    </>
                  ) : scan?.result?.issues.length ? (
                    <>
                      <h2 className="report-title">Scan issues</h2>
                      <IssueList issues={scan.result.issues} />
                    </>
                  ) : (
                    <EmptyExport onPages={() => setTab("pages")} />
                  )}
                </>
              )}
            </>
          )}

          {view === "history" && (
            <>
              <div className="title-row">
                <div>
                  <h1>Export history</h1>
                  <p>
                    {project
                      ? `Scans and exports for ${project.name}.`
                      : "Open a project to review its scans and exports."}
                  </p>
                </div>
                {!project && (
                  <button className="secondary" onClick={goHome}>
                    Choose project
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>
              {project ? (
                jobs.length ? (
                  <div className="history-list">
                    {jobs.map((job) => (
                      <div key={job.id} className="history-row">
                        <div>
                          <strong>
                            {job.kind === "export"
                              ? "Website export"
                              : "Website scan"}
                          </strong>
                          <span>{formatDate(job.createdAt)}</span>
                        </div>
                        <Status job={job} />
                        <span className="num">
                          {job.result
                            ? `${job.result.pages.length} pages`
                            : "—"}
                        </span>
                        {job.status === "completed" && job.kind === "export" ? (
                          <button
                            className="secondary"
                            onClick={() => exportContent(job)}
                          >
                            Review
                            <ArrowUpRight size={14} />
                          </button>
                        ) : (
                          <span />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-inline">
                    No jobs yet. Run your first scan from the Pages tab.
                  </p>
                )
              ) : (
                <div className="project-list">
                  {projects.map((p) => (
                    <button
                      className="project-row"
                      key={p.id}
                      onClick={() => {
                        openProject(p);
                        setView("history");
                      }}
                    >
                      <Globe2 size={21} />
                      <div>
                        <strong>{p.name}</strong>
                        <span>{p.url}</span>
                      </div>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                  {!projects.length && (
                    <p className="empty-inline">
                      Create a project to start building your export history.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {view === "settings" && (
            <>
              <div className="title-row">
                <div>
                  <h1>Preferences</h1>
                  <p>
                    Capture settings for the next scan or export in this
                    session.
                  </p>
                </div>
              </div>
              <section className="settings-section">
                <div>
                  <h2>Capture defaults</h2>
                  <p>
                    Keep scans focused with a page limit and link depth.
                    Existing jobs keep their original settings.
                  </p>
                </div>
                <div className="settings-panel">
                  {optionFields}
                  <p className="field-note">
                    <Check size={14} />
                    Changes apply to your next job automatically.
                  </p>
                </div>
              </section>
              <section className="settings-section">
                <div>
                  <h2>Local workspace</h2>
                  <p>Projects and export history are saved on this computer.</p>
                </div>
                <div className="settings-panel">
                  <div className="key-value">
                    <span>Storage</span>
                    <strong>SQLite & local files</strong>
                  </div>
                  <div className="key-value">
                    <span>Capture engine</span>
                    <strong>Playwright / Chromium</strong>
                  </div>
                  <div className="key-value">
                    <span>Output</span>
                    <strong>Static website ZIP</strong>
                  </div>
                  <div className="key-value">
                    <span>Preview isolation</span>
                    <strong>Separate origin · port {previewPort}</strong>
                  </div>
                </div>
              </section>
              <div className="notice">
                <ShieldCheck size={17} />
                <span>
                  Backend services, databases and account systems from the
                  source website are not included in an export.
                </span>
              </div>
            </>
          )}
          <footer className="app-footer">
            <span>WebExporter</span>
            <span>Capture thoughtfully. Make it yours.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function ExportFrame({
  title,
  src,
  width,
}: {
  title: string;
  src: string;
  width: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(width);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setAvailable(el.clientWidth));
    observer.observe(el);
    setAvailable(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(1, available / width);
  return (
    <div className="frame-container" ref={container}>
      <div
        style={{
          width: width * scale,
          height: 900 * scale,
          position: "relative",
          flex: "none",
          margin: "0 auto",
        }}
      >
        <iframe
          title={title}
          sandbox="allow-scripts"
          src={src}
          style={{
            position: "absolute",
            width,
            height: 900,
            minHeight: 900,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      </div>
    </div>
  );
}
function EmptyExport({ onPages }: { onPages: () => void }) {
  return (
    <div className="scan-empty">
      <FileImage size={36} />
      <h3>A closer look, after your first export</h3>
      <p>
        Select your pages and create an export to view
        <br />
        the preview and capture report.
      </p>
      <button className="secondary" onClick={onPages}>
        Choose pages
        <ArrowRight size={15} />
      </button>
    </div>
  );
}
function IssueList({
  issues,
}: {
  issues: NonNullable<Job["result"]>["issues"];
}) {
  return (
    <div className="issue-list">
      {issues.length ? (
        issues.map((issue, i) => (
          <div className="issue-row" key={i}>
            <CircleAlert size={17} />
            <div>
              <strong>
                {issue.kind === "dependency"
                  ? "External dependency"
                  : issue.kind === "asset"
                    ? "Asset needs attention"
                    : "Page could not be captured"}
              </strong>
              <p>{issue.message}</p>
              <span>{issue.url}</span>
            </div>
          </div>
        ))
      ) : (
        <p className="empty-inline">No issues reported.</p>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
