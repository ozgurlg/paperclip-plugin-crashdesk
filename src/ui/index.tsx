import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  AssigneePicker,
  ProjectPicker,
  useHostContext,
  useHostNavigation,
  usePluginAction,
  usePluginData,
  type PluginPageProps,
  type PluginSidebarProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";

// ---------------------------------------------------------------------------
// Data shapes returned by the worker (see worker.ts)
// ---------------------------------------------------------------------------

type Period = "24h" | "7d" | "14d";
type Level = "fatal" | "error" | "warning" | "info" | "debug";

interface ErrorIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  level: Level;
  project: { id: string; slug: string; name: string };
  events: number;
  users: number;
  firstSeen: string;
  lastSeen: string;
  isNew: boolean;
  isRegression: boolean;
  url: string;
  trend: number[];
}

interface LinkedTask {
  id: string;
  identifier: string | null;
  status: string;
  title: string;
}

type Overview =
  | { configured: false; setupMessage: string }
  | {
      configured: true;
      provider: string;
      snapshot: { period: Period; fetchedAt: string; ok: boolean; error: string | null; issues: ErrorIssue[] };
      links: Record<string, LinkedTask>;
    };

const PAGE_PATH = "/crashdesk";

/**
 * Paperclip routes are company-scoped ("/<PREFIX>/crashdesk"). The host does
 * not add the prefix to every absolute path: it reads "/crashdesk" as a
 * company called CRASHDESK. So build the path from the active company's own
 * prefix, whatever that company is called.
 */
function useCompanyPath(): (path: string) => string {
  const { companyPrefix } = useHostContext();
  return (path: string) => (companyPrefix ? `/${encodeURIComponent(companyPrefix)}${path}` : path);
}
const PERIODS: Period[] = ["24h", "7d", "14d"];

// ---------------------------------------------------------------------------
// Look: Paperclip's own tokens, so the page follows the host theme
// ---------------------------------------------------------------------------

const c = {
  fg: "var(--foreground)",
  muted: "var(--muted)",
  mutedFg: "var(--muted-foreground)",
  card: "var(--card)",
  border: "var(--border)",
  input: "var(--input)",
  primary: "var(--primary)",
  primaryFg: "var(--primary-foreground)",
  destructive: "var(--destructive)",
  radius: "var(--radius, 0.5rem)",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  // Status hues from Paperclip's dashboard charts.
  green: "#00bc7d",
  yellow: "#f0b100",
  purple: "#ad46ff",
};

const LEVEL_COLOR: Record<Level, string> = {
  fatal: c.destructive,
  error: c.destructive,
  warning: c.yellow,
  info: c.mutedFg,
  debug: c.mutedFg,
};

const STATUS_COLOR: Record<string, string> = {
  backlog: c.mutedFg,
  todo: c.mutedFg,
  in_progress: c.yellow,
  in_review: c.purple,
  blocked: c.destructive,
  done: c.green,
  cancelled: c.mutedFg,
};

const CSS = `
.cd-root { color: ${c.fg}; font-size: 14px; }
.cd-root button { font: inherit; }
.cd-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; }
.cd-table-wrap { overflow-x: auto; border: 1px solid ${c.border}; }
.cd-table { width: 100%; min-width: 820px; border-collapse: collapse; font-size: 13px; }
.cd-table th { text-align: left; font-weight: 500; color: ${c.mutedFg}; padding: 10px 14px; border-bottom: 1px solid ${c.border}; }
.cd-table td { padding: 12px 14px; border-bottom: 1px solid ${c.border}; vertical-align: top; }
.cd-table tr:last-child td { border-bottom: 0; }
.cd-btn { display: inline-flex; align-items: center; gap: 6px; border-radius: ${c.radius}; padding: 6px 12px; cursor: pointer; border: 1px solid ${c.input}; background: transparent; color: ${c.fg}; white-space: nowrap; }
.cd-btn:hover:not(:disabled) { background: ${c.muted}; }
.cd-btn:disabled { opacity: .55; cursor: default; }
.cd-btn-primary { background: ${c.primary}; color: ${c.primaryFg}; border-color: transparent; }
.cd-btn-primary:hover:not(:disabled) { background: ${c.primary}; opacity: .9; }
.cd-seg { display: inline-flex; border: 1px solid ${c.input}; border-radius: ${c.radius}; overflow: hidden; }
.cd-seg button { border: 0; background: transparent; color: ${c.mutedFg}; padding: 6px 12px; cursor: pointer; }
.cd-seg button[aria-pressed="true"] { background: ${c.muted}; color: ${c.fg}; }
.cd-select { background: transparent; color: ${c.fg}; border: 1px solid ${c.input}; border-radius: ${c.radius}; padding: 6px 8px; font: inherit; font-size: 13px; }
.cd-select option { background: ${c.card}; color: ${c.fg}; }
.cd-link { color: inherit; text-decoration: none; }
.cd-link:hover { text-decoration: underline; }
.cd-nav { display: flex; align-items: center; gap: 10px; padding: 6px 12px; border-radius: ${c.radius}; color: inherit; text-decoration: none; font-size: 14px; }
.cd-nav:hover { background: var(--sidebar-accent, ${c.muted}); }
`;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "unknown";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const fmt = (n: number) => new Intl.NumberFormat("en", { notation: "compact" }).format(n);

function BugIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={spinning ? { animation: "cd-spin 0.8s linear infinite" } : undefined}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

function Dot({ color, label }: { color: string; label?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }}
    />
  );
}

function Sparkline({ values, hot }: { values: number[]; hot: boolean }) {
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <div role="img" aria-label={`${total} events over the period`} style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 22 }}>
      {values.map((v, i) => (
        <span
          key={i}
          style={{
            width: 4,
            height: Math.max(2, Math.round((v / max) * 22)),
            background: hot && i >= values.length - Math.ceil(values.length / 4) ? c.destructive : c.mutedFg,
            opacity: hot && i >= values.length - Math.ceil(values.length / 4) ? 1 : 0.45,
          }}
        />
      ))}
    </div>
  );
}

function Tile({ value, label, sub, icon }: { value: string; label: string; sub: string; icon: ReactNode }) {
  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{value}</span>
        <span style={{ color: c.mutedFg }}>{icon}</span>
      </div>
      <span style={{ fontSize: 15 }}>{label}</span>
      <span style={{ fontSize: 13, color: c.mutedFg }}>{sub}</span>
    </div>
  );
}

const sectionTitle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

// ---------------------------------------------------------------------------
// Task cell: linked task chip, or "Create task" with an inline form
// ---------------------------------------------------------------------------

function TaskChip({ task }: { task: LinkedTask }) {
  const nav = useHostNavigation();
  const companyPath = useCompanyPath();
  const label = `${task.identifier ?? "Task"} · ${task.status.replace("_", " ")}`;
  return (
    <a
      {...nav.linkProps(companyPath(`/issues/${encodeURIComponent(task.identifier ?? task.id)}`))}
      className="cd-link"
      title={task.title}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${c.input}`, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}
    >
      <Dot color={STATUS_COLOR[task.status] ?? c.mutedFg} />
      {label}
    </a>
  );
}

function CreateTaskForm({
  companyId,
  issue,
  onDone,
  onCancel,
}: {
  companyId: string;
  issue: ErrorIssue;
  onDone: () => void;
  onCancel: () => void;
}) {
  const createTask = usePluginAction("create-task");
  const [assignee, setAssignee] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<{ agent: string | null; user: string | null }>({ agent: null, user: null });
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState(issue.level === "fatal" ? "critical" : issue.level === "error" ? "high" : "medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await createTask({
        companyId,
        issueId: issue.id,
        assigneeAgentId: assigneeIds.agent ?? "",
        assigneeUserId: assigneeIds.user ?? "",
        projectId,
        priority,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the task.");
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", padding: "4px 0 6px" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: c.mutedFg, minWidth: 220 }}>
        Assignee
        <AssigneePicker
          companyId={companyId}
          value={assignee}
          placeholder="Choose an agent"
          noneLabel="No assignee"
          onChange={(value, selection) => {
            setAssignee(value);
            setAssigneeIds({ agent: selection.assigneeAgentId, user: selection.assigneeUserId });
          }}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: c.mutedFg, minWidth: 200 }}>
        Project
        <ProjectPicker companyId={companyId} value={projectId} onChange={setProjectId} placeholder="No project" noneLabel="No project" />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: c.mutedFg }}>
        Priority
        <select className="cd-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="cd-btn cd-btn-primary" onClick={() => void submit()} disabled={busy}>
          {busy ? "Creating…" : "Create task"}
        </button>
        <button type="button" className="cd-btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" style={{ margin: 0, width: "100%", fontSize: 13, color: c.destructive }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function CrashdeskPage({ context }: PluginPageProps) {
  const companyId = context.companyId;
  const [period, setPeriod] = useState<Period>("24h");
  const [project, setProject] = useState("all");
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const { data, loading, error, refresh } = usePluginData<Overview>("overview", { companyId, period });
  const runRefresh = usePluginAction("refresh");

  async function syncNow() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await runRefresh({ period });
      refresh();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  const issues = data?.configured ? data.snapshot.issues : [];
  const links = data?.configured ? data.links : {};
  const projects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of issues) seen.set(i.project.slug, i.project.name);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [issues]);
  const visible = project === "all" ? issues : issues.filter((i) => i.project.slug === project);

  const stats = useMemo(() => {
    const linked = visible.map((i) => links[i.id]).filter((l): l is LinkedTask => Boolean(l));
    return {
      unresolved: visible.length,
      fresh: visible.filter((i) => i.isNew).length,
      regressions: visible.filter((i) => i.isRegression).length,
      users: visible.reduce((sum, i) => sum + i.users, 0),
      linked: linked.length,
      done: linked.filter((l) => l.status === "done").length,
    };
  }, [visible, links]);

  return (
    <div className="cd-root" style={{ padding: "24px clamp(16px, 3vw, 32px) 40px", maxWidth: 1200, display: "flex", flexDirection: "column", gap: 24 }}>
      <style>{CSS + "@keyframes cd-spin { to { transform: rotate(360deg); } }"}</style>

      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, borderBottom: `1px solid ${c.border}`, paddingBottom: 16 }}>
        <h1 style={{ ...sectionTitle, fontSize: 17, flexGrow: 1 }}>App Errors</h1>
        {projects.length > 1 && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: c.mutedFg }}>
            Project
            <select className="cd-select" value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="all">All projects</option>
              {projects.map(([slug, name]) => (
                <option key={slug} value={slug}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="cd-seg" role="group" aria-label="Time range">
          {PERIODS.map((p) => (
            <button key={p} type="button" aria-pressed={p === period} onClick={() => setPeriod(p)}>
              {p}
            </button>
          ))}
        </div>
        <button type="button" className="cd-btn" onClick={() => void syncNow()} disabled={refreshing} aria-label="Refresh now">
          <RefreshIcon spinning={refreshing} />
          {data?.configured ? `Synced ${timeAgo(data.snapshot.fetchedAt)}` : "Refresh"}
        </button>
      </header>

      {refreshError && <Banner tone="error">{refreshError}</Banner>}
      {error && <Banner tone="error">{error.message}</Banner>}
      {loading && !data && <p style={{ color: c.mutedFg }}>Loading errors…</p>}

      {data && !data.configured && <SetupCard message={data.setupMessage} />}

      {data?.configured && (
        <>
          {!data.snapshot.ok && data.snapshot.error && (
            <Banner tone="error">
              Last sync failed: {data.snapshot.error} Showing the last list that loaded.
            </Banner>
          )}

          <div className="cd-tiles">
            <Tile value={fmt(stats.unresolved)} label="Unresolved" sub={`top issues, last ${period}`} icon={<BugIcon size={18} />} />
            <Tile
              value={fmt(stats.fresh)}
              label="New"
              sub={stats.regressions > 0 ? `${stats.regressions} regression${stats.regressions === 1 ? "" : "s"}` : "first seen in this period"}
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>}
            />
            <Tile
              value={fmt(stats.users)}
              label="Users Affected"
              sub="summed across issues"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="M17 4a4 4 0 0 1 0 8" /><path d="M22 21a7 7 0 0 0-4-6.3" /></svg>}
            />
            <Tile
              value={fmt(stats.linked)}
              label="Linked to Tasks"
              sub={`${stats.linked - stats.done} open, ${stats.done} done`}
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m9 12 2 2 4-4" /></svg>}
            />
          </div>

          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={sectionTitle}>Top Issues</h2>
            {visible.length === 0 ? (
              <p style={{ color: c.mutedFg, margin: 0 }}>No unresolved errors in the last {period}. Nice.</p>
            ) : (
              <div className="cd-table-wrap">
                <table className="cd-table">
                  <thead>
                    <tr>
                      <th scope="col">Issue</th>
                      <th scope="col">Project</th>
                      <th scope="col">Events · {period}</th>
                      <th scope="col" style={{ textAlign: "right" }}>Users</th>
                      <th scope="col">Paperclip task</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((issue) => {
                      const link = links[issue.id];
                      const canCreate = !link || link.status === "done" || link.status === "cancelled";
                      return (
                        <IssueRow
                          key={issue.id}
                          issue={issue}
                          link={link}
                          formOpen={openForm === issue.id}
                          action={
                            canCreate && companyId ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                                {link && <TaskChip task={link} />}
                                <button
                                  type="button"
                                  className={openForm === issue.id ? "cd-btn" : "cd-btn cd-btn-primary"}
                                  onClick={() => setOpenForm(openForm === issue.id ? null : issue.id)}
                                  aria-expanded={openForm === issue.id}
                                >
                                  {link ? "New task" : "Create task"}
                                </button>
                              </div>
                            ) : link ? (
                              <TaskChip task={link} />
                            ) : null
                          }
                          form={
                            companyId ? (
                              <CreateTaskForm
                                companyId={companyId}
                                issue={issue}
                                onCancel={() => setOpenForm(null)}
                                onDone={() => {
                                  setOpenForm(null);
                                  refresh();
                                }}
                              />
                            ) : null
                          }
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ margin: 0, fontSize: 12, color: c.mutedFg }}>
              Create task opens a Paperclip issue with the error, stack trace and a link back to {data.provider}, assigned to the agent you choose.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function IssueRow({
  issue,
  link,
  action,
  form,
  formOpen,
}: {
  issue: ErrorIssue;
  link: LinkedTask | undefined;
  action: ReactNode;
  form: ReactNode;
  formOpen: boolean;
}) {
  const hot = issue.isNew || issue.isRegression;
  return (
    <>
      <tr>
        <td>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ marginTop: 5 }}>
              <Dot color={LEVEL_COLOR[issue.level]} label={issue.level} />
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <a href={issue.url} target="_blank" rel="noopener noreferrer" className="cd-link" style={{ fontFamily: c.mono, wordBreak: "break-word" }}>
                {issue.title}
              </a>
              <span style={{ color: c.mutedFg }}>
                {[
                  issue.culprit,
                  issue.isRegression ? "regression" : issue.isNew ? `new, first seen ${timeAgo(issue.firstSeen)}` : `first seen ${timeAgo(issue.firstSeen)}`,
                  issue.shortId,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          </div>
        </td>
        <td>{issue.project.name}</td>
        <td>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <Sparkline values={issue.trend} hot={hot} />
            <span>{fmt(issue.events)}</span>
          </div>
        </td>
        <td style={{ textAlign: "right" }}>{fmt(issue.users)}</td>
        <td>{action ?? (link ? null : <span style={{ color: c.mutedFg }}>—</span>)}</td>
      </tr>
      {formOpen && (
        <tr>
          <td colSpan={5} style={{ background: c.muted }}>
            {form}
          </td>
        </tr>
      )}
    </>
  );
}

function Banner({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      style={{
        border: `1px solid ${tone === "error" ? c.destructive : c.border}`,
        color: tone === "error" ? c.destructive : c.fg,
        padding: "10px 14px",
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

function SetupCard({ message }: { message: string }) {
  return (
    <section style={{ border: `1px solid ${c.border}`, background: c.card, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Connect Sentry</h2>
      <p style={{ margin: 0, color: c.mutedFg }}>{message}</p>
      <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, lineHeight: 1.5 }}>
        <li>In Sentry, open Settings → Developer Settings → Custom Integrations and create an Internal Integration with Issue &amp; Event set to Read.</li>
        <li>Copy its token and save it in Paperclip under Company settings → Secrets.</li>
        <li>Open Instance settings → Plugins → Crashdesk, enter your organization slug and pick the secret.</li>
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dashboard widget: headline numbers, the top issues, and the way in
// ---------------------------------------------------------------------------

export function CrashdeskDashboardWidget({ context }: PluginWidgetProps) {
  const nav = useHostNavigation();
  const companyPath = useCompanyPath();
  const { data, loading, error, refresh } = usePluginData<Overview>("overview", {
    companyId: context.companyId,
    period: "24h",
  });
  const runRefresh = usePluginAction("refresh");
  const [refreshing, setRefreshing] = useState(false);

  async function syncNow() {
    setRefreshing(true);
    try {
      await runRefresh({ period: "24h" });
      refresh();
    } catch {
      // The page shows refresh errors in full; the widget keeps the last data.
    } finally {
      setRefreshing(false);
    }
  }

  const issues = data?.configured ? data.snapshot.issues : [];
  const links = data?.configured ? data.links : {};
  const top = issues.slice(0, 3);
  const numbers = [
    { label: "unresolved", value: issues.length },
    { label: "new", value: issues.filter((i) => i.isNew).length },
    { label: "users affected", value: issues.reduce((sum, i) => sum + i.users, 0) },
  ];

  return (
    <div className="cd-root" style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 2px" }}>
      <style>{CSS + "@keyframes cd-spin { to { transform: rotate(360deg); } }"}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: c.mutedFg, display: "flex" }}>
          <BugIcon size={16} />
        </span>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, flexGrow: 1 }}>App Errors</h2>
        <span style={{ fontSize: 12, color: c.mutedFg }}>
          {data?.configured ? `Last 24h · ${timeAgo(data.snapshot.fetchedAt)}` : ""}
        </span>
        {data?.configured && (
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={refreshing}
            aria-label="Refresh errors"
            style={{ display: "flex", padding: 6, background: "transparent", border: 0, color: c.mutedFg, cursor: "pointer" }}
          >
            <RefreshIcon spinning={refreshing} />
          </button>
        )}
      </div>

      {loading && !data && <p style={{ margin: 0, fontSize: 13, color: c.mutedFg }}>Loading errors…</p>}
      {error && <p style={{ margin: 0, fontSize: 13, color: c.destructive }}>{error.message}</p>}

      {data && !data.configured && (
        <p style={{ margin: 0, fontSize: 13, color: c.mutedFg, lineHeight: 1.5 }}>
          Connect Sentry to see your app errors here and turn them into tasks.
        </p>
      )}

      {data?.configured && (
        <>
          {!data.snapshot.ok && (
            <p style={{ margin: 0, fontSize: 12, color: c.destructive }}>Last sync failed. Showing the last list that loaded.</p>
          )}
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {numbers.map((n) => (
              <div key={n.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{fmt(n.value)}</span>
                <span style={{ fontSize: 12, color: c.mutedFg }}>{n.label}</span>
              </div>
            ))}
          </div>

          {top.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: c.mutedFg }}>No unresolved errors in the last 24 hours.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: `1px solid ${c.border}`, paddingTop: 12 }}>
              <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: c.mutedFg }}>Top issues</span>
              {top.map((issue) => {
                const link = links[issue.id];
                return (
                  <div key={issue.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ marginTop: 5 }}>
                      <Dot color={LEVEL_COLOR[issue.level]} label={issue.level} />
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flexGrow: 1 }}>
                      <span
                        title={issue.title}
                        style={{ fontFamily: c.mono, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                      >
                        {issue.title}
                      </span>
                      <span style={{ fontSize: 12, color: c.mutedFg }}>
                        {issue.project.name} · {fmt(issue.events)} events · {fmt(issue.users)} users
                        {link ? ` · ${link.identifier ?? "task"} ${link.status.replace("_", " ")}` : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <a {...nav.linkProps(companyPath(PAGE_PATH))} className="cd-link" style={{ fontSize: 13, color: c.mutedFg, alignSelf: "flex-start" }}>
        {data && !data.configured ? "Set up Crashdesk →" : "Open Crashdesk →"}
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar entry
// ---------------------------------------------------------------------------

export function CrashdeskSidebarLink(_props: PluginSidebarProps) {
  const nav = useHostNavigation();
  const companyPath = useCompanyPath();
  return (
    <>
      <style>{CSS}</style>
      <a {...nav.linkProps(companyPath(PAGE_PATH))} className="cd-nav">
        <BugIcon size={16} />
        Crashdesk
      </a>
    </>
  );
}
