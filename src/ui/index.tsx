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
      snapshot: {
        period: Period;
        fetchedAt: string;
        ok: boolean;
        error: string | null;
        issues: ErrorIssue[];
        /** Closed errors seen in the period, latest first. */
        resolved?: ErrorIssue[];
      };
      links: Record<string, LinkedTask>;
      /** Where each error's task goes, keyed by issue id. */
      targets?: Record<string, Target>;
      /** "" until someone picks who gets errors. */
      defaultAssignee?: string;
      /** A finished task resolves its error in the tracker. */
      resolveWhenDone?: boolean;
      /** Why the last attempt to resolve an error failed, if it did. */
      resolveError?: string | null;
    };

const PAGE_PATH = "/crashdesk";

/** Where an error's task goes, as the routing decides it. */
interface Target {
  /** "" when there is no project. */
  projectId: string;
  projectName: string;
  /** Saved in the panel, or only suggested by a matching name. */
  projectSource: "mapping" | "name" | null;
  /** In the picker encoding ("agent:<id>", "user:<id>"), or "". */
  assignee: string;
  /** The tracker project's own assignee, or the default for all projects. */
  assigneeSource: "project" | "fallback" | null;
}

/** "agent:<id>" / "user:<id>" → the ids the create action takes. */
function splitAssignee(value: string): { agent: string | null; user: string | null } {
  const [kind, id] = value.split(":");
  if (!id) return { agent: null, user: null };
  return kind === "agent" ? { agent: id, user: null } : kind === "user" ? { agent: null, user: id } : { agent: null, user: null };
}

/**
 * Paperclip routes are company-scoped ("/<PREFIX>/crashdesk"). The host does
 * not add the prefix to every absolute path: it reads "/crashdesk" as a
 * company called CRASHDESK. So build the path from the active company's own
 * prefix, whatever that company is called.
 */
/**
 * Paperclip does not pass companyPrefix to every slot (dashboard widgets get
 * none). Company routes always start with the prefix, so fall back to the
 * first segment of the current URL, the same way the host resolves it.
 */
function prefixFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const first = window.location.pathname.split("/").filter(Boolean)[0];
  return first ? decodeURIComponent(first) : null;
}

function useCompanyPath(): (path: string) => string | null {
  const companyPrefix = useHostContext().companyPrefix ?? prefixFromLocation();
  // Without a company there is no valid in-app route: render no link rather than a broken one.
  return (path: string) => (companyPrefix ? `/${encodeURIComponent(companyPrefix)}${path}` : null);
}

/** Link props for a company route, or nothing when there is no active company. */
function useCompanyLink(): (path: string) => ReturnType<ReturnType<typeof useHostNavigation>["linkProps"]> | { "aria-disabled": true } {
  const nav = useHostNavigation();
  const companyPath = useCompanyPath();
  return (path: string) => {
    const href = companyPath(path);
    return href ? nav.linkProps(href) : { "aria-disabled": true };
  };
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

// Layout rules live here, not in inline styles, so they can change with the
// width: one column on a phone, a table-like grid on a desktop.
const CSS = `
.cd-root { color: ${c.fg}; font-size: 14px; min-width: 0; box-sizing: border-box; }
.cd-root *, .cd-root *::before { box-sizing: border-box; }
.cd-root button { font: inherit; }
.cd-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: ${c.radius}; padding: 7px 12px; cursor: pointer; border: 1px solid ${c.input}; background: transparent; color: ${c.fg}; white-space: nowrap; }
.cd-btn:hover:not(:disabled) { background: ${c.muted}; }
.cd-btn:disabled { opacity: .55; cursor: default; }
.cd-btn-primary { background: ${c.primary}; color: ${c.primaryFg}; border-color: transparent; }
.cd-btn-primary:hover:not(:disabled) { background: ${c.primary}; opacity: .9; }
.cd-seg { display: inline-flex; border: 1px solid ${c.input}; border-radius: ${c.radius}; overflow: hidden; }
.cd-seg button { border: 0; background: transparent; color: ${c.mutedFg}; padding: 7px 12px; cursor: pointer; }
.cd-seg button[aria-pressed="true"] { background: ${c.muted}; color: ${c.fg}; }
.cd-select { background: transparent; color: ${c.fg}; border: 1px solid ${c.input}; border-radius: ${c.radius}; padding: 7px 8px; font: inherit; font-size: 13px; max-width: 100%; }
.cd-select option { background: ${c.card}; color: ${c.fg}; }
.cd-link { color: inherit; text-decoration: none; }
.cd-link:hover { text-decoration: underline; }
.cd-nav { display: flex; align-items: center; gap: 10px; padding: 6px 12px; border-radius: ${c.radius}; color: inherit; text-decoration: none; font-size: 14px; }
.cd-nav:hover { background: var(--sidebar-accent, ${c.muted}); }
.cd-card { border: 1px solid ${c.border}; border-radius: ${c.radius}; background: ${c.card}; }
.cd-badge { display: inline-flex; align-items: center; gap: 5px; border: 1px solid ${c.input}; border-radius: 999px; padding: 1px 8px; font-size: 11px; line-height: 1.5; white-space: nowrap; }
.cd-clamp { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
.cd-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }

.cd-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.cd-stat { display: flex; flex-direction: column; gap: 2px; text-align: left; padding: 14px 16px; border: 1px solid ${c.border}; border-radius: ${c.radius}; background: ${c.card}; color: inherit; cursor: pointer; min-width: 0; }
.cd-stat:hover { border-color: ${c.mutedFg}; }
.cd-stat[aria-pressed="true"] { border-color: ${c.fg}; }
.cd-stat-value { font-size: 28px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.15; }
.cd-stat-label { font-size: 14px; }
.cd-stat-sub { font-size: 12px; color: ${c.mutedFg}; overflow-wrap: anywhere; }

.cd-list { border: 1px solid ${c.border}; border-radius: ${c.radius}; background: ${c.card}; overflow: hidden; }
.cd-row, .cd-list-head { display: grid; grid-template-columns: minmax(0, 1fr) 150px 56px 210px; grid-template-areas: "main events users task"; column-gap: 20px; padding: 14px 16px; align-items: start; }
.cd-list-head { padding-top: 10px; padding-bottom: 10px; font-size: 12px; color: ${c.mutedFg}; border-bottom: 1px solid ${c.border}; }
.cd-row + .cd-row, .cd-row-form + .cd-row { border-top: 1px solid ${c.border}; }
.cd-row-main { grid-area: main; min-width: 0; display: flex; gap: 10px; }
.cd-row-events { grid-area: events; }
.cd-row-users { grid-area: users; text-align: right; }
.cd-row-task { grid-area: task; min-width: 0; }
.cd-cell-label { display: none; font-size: 11px; color: ${c.mutedFg}; margin-bottom: 2px; }
.cd-row-form { padding: 12px 16px; background: ${c.muted}; border-top: 1px solid ${c.border}; }

.cd-map-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 1.3fr); gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid ${c.border}; }
.cd-map-label { display: none; font-size: 11px; color: ${c.mutedFg}; margin-bottom: 4px; }

@media (max-width: 860px) {
  .cd-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .cd-stat { padding: 12px; }
  .cd-stat:last-child:nth-child(odd) { grid-column: 1 / -1; }
  .cd-list-head { display: none; }
  .cd-row { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "main main" "events users" "task task"; row-gap: 12px; }
  .cd-cell-label { display: block; }
  .cd-row-task > * { width: 100%; }
  .cd-row-task .cd-btn-wide { flex: 1; }
  .cd-map-row { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .cd-map-label { display: block; }
  .cd-toolbar-grow { flex: 1 1 100%; }
}
@keyframes cd-spin { to { transform: rotate(360deg); } }
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
const plural = (n: number, word: string) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;

/** A task that is still being worked on covers its error; a finished or cancelled one does not. */
const isOpenTask = (task: LinkedTask | undefined): task is LinkedTask =>
  Boolean(task) && task!.status !== "done" && task!.status !== "cancelled";

function BugIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}

function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
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
  const recent = values.length - Math.ceil(values.length / 4);
  return (
    <div role="img" aria-label={`${total} events over the period`} style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 22 }}>
      {values.map((v, i) => (
        <span
          key={i}
          style={{
            width: 3,
            height: Math.max(2, Math.round((v / max) * 22)),
            background: hot && i >= recent ? c.destructive : c.mutedFg,
            opacity: hot && i >= recent ? 1 : 0.45,
          }}
        />
      ))}
    </div>
  );
}

const sectionTitle: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 600 };
const hint: CSSProperties = { margin: 0, fontSize: 13, color: c.mutedFg, lineHeight: 1.5 };

function Banner({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      style={{
        border: `1px solid ${tone === "error" ? c.destructive : c.border}`,
        borderRadius: c.radius,
        color: tone === "error" ? c.destructive : c.fg,
        padding: "10px 14px",
        fontSize: 13,
        overflowWrap: "anywhere",
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task cell: linked task chip, or "Create task" with an inline form
// ---------------------------------------------------------------------------

function TaskChip({ task }: { task: LinkedTask }) {
  const companyLink = useCompanyLink();
  return (
    <a
      {...companyLink(`/issues/${encodeURIComponent(task.identifier ?? task.id)}`)}
      className="cd-link cd-badge"
      title={task.title}
      style={{ fontSize: 12, padding: "3px 10px", alignSelf: "flex-start", width: "auto" }}
    >
      <Dot color={STATUS_COLOR[task.status] ?? c.mutedFg} />
      {task.identifier ?? "Task"} · {task.status.replace("_", " ")}
    </a>
  );
}

/**
 * With an assignee (the project's own or the default) the task is one click:
 * the worker fills in project, assignee and a priority from the error level.
 * "⋯" still opens the form for a one-off change. Without an assignee the
 * button opens the form, because there is something to choose.
 */
function CreateTaskButton({
  companyId,
  issue,
  label,
  target,
  formOpen,
  onToggleForm,
  onCreated,
}: {
  companyId: string;
  issue: ErrorIssue;
  label: string;
  target: Target | undefined;
  formOpen: boolean;
  onToggleForm: () => void;
  onCreated: () => void;
}) {
  const createTask = usePluginAction("create-task");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = Boolean(target?.assignee);

  if (!ready) {
    return (
      <div style={{ display: "flex" }}>
        <button type="button" className={`cd-btn cd-btn-wide${formOpen ? "" : " cd-btn-primary"}`} onClick={onToggleForm} aria-expanded={formOpen}>
          {label}
        </button>
      </div>
    );
  }

  async function createNow() {
    setBusy(true);
    setError(null);
    try {
      // No project, assignee or priority: the worker uses the routing and the error level.
      await createTask({ companyId, issueId: issue.id });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the task.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" className="cd-btn cd-btn-primary cd-btn-wide" onClick={() => void createNow()} disabled={busy}>
          {busy ? "Creating…" : label}
        </button>
        <button type="button" className="cd-btn" onClick={onToggleForm} aria-expanded={formOpen} aria-label="Choose project, assignee and priority" title="Choose project, assignee and priority" disabled={busy}>
          ⋯
        </button>
      </div>
      {error && (
        <span role="alert" style={{ fontSize: 12, color: c.destructive }}>
          {error}
        </span>
      )}
    </div>
  );
}

function CreateTaskForm({
  companyId,
  issue,
  target,
  onDone,
  onCancel,
}: {
  companyId: string;
  issue: ErrorIssue;
  target: Target | undefined;
  onDone: () => void;
  onCancel: () => void;
}) {
  const createTask = usePluginAction("create-task");
  // Start with what the routing decides; every field can be changed for this task.
  const [assignee, setAssignee] = useState(target?.assignee ?? "");
  const [assigneeIds, setAssigneeIds] = useState(splitAssignee(target?.assignee ?? ""));
  const [projectId, setProjectId] = useState(target?.projectId ?? "");
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

  const field: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: c.mutedFg, flex: "1 1 200px", minWidth: 0 };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
      <label style={field}>
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
      <label style={field}>
        Project
        <ProjectPicker companyId={companyId} value={projectId} onChange={setProjectId} placeholder="No project" noneLabel="No project" />
      </label>
      <label style={{ ...field, flex: "0 1 140px" }}>
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
// One error in the list
// ---------------------------------------------------------------------------

function IssueRow({
  issue,
  period,
  action,
  form,
  resolved = false,
}: {
  issue: ErrorIssue;
  period: Period;
  action: ReactNode;
  form: ReactNode;
  /** A closed error: no New or Regression flag, a Resolved one instead. */
  resolved?: boolean;
}) {
  const hot = !resolved && (issue.isNew || issue.isRegression);
  return (
    <>
      <div className="cd-row">
        <div className="cd-row-main">
          <span style={{ marginTop: 6 }}>
            <Dot color={LEVEL_COLOR[issue.level]} label={issue.level} />
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <a href={issue.url} target="_blank" rel="noopener noreferrer" className="cd-link cd-clamp" title={issue.title} style={{ fontFamily: c.mono, fontSize: 13 }}>
              {issue.title}
            </a>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px", fontSize: 12, color: c.mutedFg, minWidth: 0 }}>
              {resolved && (
                <span className="cd-badge" style={{ color: c.green, borderColor: c.green }}>
                  Resolved
                </span>
              )}
              {!resolved && issue.isRegression && (
                <span className="cd-badge" style={{ color: c.destructive, borderColor: c.destructive }}>
                  Regression
                </span>
              )}
              {!resolved && issue.isNew && !issue.isRegression && (
                <span className="cd-badge" style={{ color: c.fg }}>
                  New
                </span>
              )}
              <span>{issue.project.name}</span>
              <span>· {resolved ? `last seen ${timeAgo(issue.lastSeen)}` : `first seen ${timeAgo(issue.firstSeen)}`}</span>
              {issue.shortId && <span>· {issue.shortId}</span>}
            </div>
            {issue.culprit && (
              <span style={{ fontSize: 12, color: c.mutedFg, overflowWrap: "anywhere" }}>{issue.culprit}</span>
            )}
          </div>
        </div>
        <div className="cd-row-events">
          <div className="cd-cell-label">Events · {period}</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <Sparkline values={issue.trend} hot={hot} />
            <span>{fmt(issue.events)}</span>
          </div>
        </div>
        <div className="cd-row-users">
          <div className="cd-cell-label">Users</div>
          {fmt(issue.users)}
        </div>
        <div className="cd-row-task" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {action}
        </div>
      </div>
      {form && <div className="cd-row-form">{form}</div>}
    </>
  );
}

// ---------------------------------------------------------------------------
// Triage: hand the errors nobody is on to an agent, one task per tracker project
// ---------------------------------------------------------------------------

interface TriageResult {
  created: Array<{ project: string; errors: number; task: LinkedTask }>;
  skipped: Array<{ project: string; reason: string; task?: LinkedTask }>;
}

function TriageBar({
  companyId,
  period,
  project,
  count,
  onDone,
}: {
  companyId: string;
  period: Period;
  project: string;
  count: number;
  onDone: () => void;
}) {
  const triage = usePluginAction("triage");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageResult | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult((await triage({ companyId, period, projectSlug: project })) as TriageResult);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the triage.");
    } finally {
      setBusy(false);
    }
  }

  if (count === 0 && !result) return null;
  return (
    <section className="cd-card" aria-label="Triage" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      {count > 0 && (
        <div className="cd-toolbar" style={{ gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 260px", minWidth: 0 }}>
            <strong style={{ fontWeight: 600 }}>{plural(count, "error")} without a task</strong>
            <span style={hint}>
              Let an agent sort them: it groups errors by root cause, opens a fix task for each one worth fixing and
              skips the noise.
            </span>
          </div>
          <button type="button" className="cd-btn cd-btn-primary" onClick={() => void run()} disabled={busy}>
            {busy ? "Starting…" : "Triage with an agent"}
          </button>
        </div>
      )}
      {error && (
        <span role="alert" style={{ fontSize: 13, color: c.destructive }}>
          {error}
        </span>
      )}
      {result && (
        <div role="status" style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
          {result.created.map((r) => (
            <div key={r.project} className="cd-toolbar">
              <span>
                Triage started for {plural(r.errors, "error")} in {r.project}:
              </span>
              <TaskChip task={r.task} />
            </div>
          ))}
          {result.skipped.map((r) => (
            <div key={r.project} className="cd-toolbar" style={{ color: c.mutedFg }}>
              <span>
                {r.project}: {r.reason}
              </span>
              {r.task && <TaskChip task={r.task} />}
            </div>
          ))}
          {result.created.length === 0 && result.skipped.length === 0 && <span style={{ color: c.mutedFg }}>Nothing to triage.</span>}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// First run: who gets errors
// ---------------------------------------------------------------------------

function DefaultAssigneeCard({ companyId, onSaved }: { companyId: string; onSaved: () => void }) {
  const save = usePluginAction("save-default-assignee");
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setBusy(true);
    setError(null);
    try {
      await save({ companyId, assignee });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setBusy(false);
    }
  }

  return (
    <section className="cd-card" aria-label="Choose who gets errors" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={sectionTitle}>Who should get errors?</h2>
        <p style={hint}>
          Pick the agent that tasks from errors go to. One choice is enough to start; later you can send single
          projects to someone else under Routing.
        </p>
      </div>
      <div className="cd-toolbar" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 240px", maxWidth: 360, minWidth: 0 }}>
          <AssigneePicker companyId={companyId} value={assignee} onChange={(value) => setAssignee(value)} placeholder="Choose an agent" noneLabel="Nobody" />
        </div>
        <button type="button" className="cd-btn cd-btn-primary" onClick={() => void onSave()} disabled={busy || !assignee}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {error && (
        <span role="alert" style={{ fontSize: 13, color: c.destructive }}>
          {error}
        </span>
      )}
    </section>
  );
}

function SetupCard({ message }: { message: string }) {
  return (
    <section className="cd-card" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Connect your error tracker</h2>
      <p style={{ margin: 0, color: c.mutedFg }}>{message}</p>
      <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, lineHeight: 1.5 }}>
        <li>In Sentry, create an internal integration with read access to Issue &amp; Event and copy its token.</li>
        <li>In Paperclip, save that token as a company secret.</li>
        <li>Open Settings → Plugins → Crashdesk, enter your organization slug and pick the secret.</li>
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Filter = "all" | "new" | "untracked" | "tracked" | "resolved";

export function CrashdeskPage({ context }: PluginPageProps) {
  const companyId = context.companyId;
  const [showRouting, setShowRouting] = useState(false);
  const [period, setPeriod] = useState<Period>("24h");
  const [project, setProject] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const { data, loading, error, refresh } = usePluginData<Overview>("overview", { companyId, period });
  const runRefresh = usePluginAction("refresh");

  async function syncNow() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await runRefresh({ companyId, period });
      refresh();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  const issues = data?.configured ? data.snapshot.issues : [];
  const links = data?.configured ? data.links : {};
  const closed = data?.configured ? (data.snapshot.resolved ?? []) : [];
  const projects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of [...issues, ...closed]) seen.set(i.project.slug, i.project.name);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [issues, closed]);
  const inProject = project === "all" ? issues : issues.filter((i) => i.project.slug === project);
  const closedInProject = project === "all" ? closed : closed.filter((i) => i.project.slug === project);
  const closedByTask = closedInProject.filter((i) => links[i.id]?.status === "done").length;

  const stats = useMemo(() => {
    const tracked = inProject.filter((i) => isOpenTask(links[i.id])).length;
    return {
      all: inProject.length,
      fresh: inProject.filter((i) => i.isNew || i.isRegression).length,
      regressions: inProject.filter((i) => i.isRegression).length,
      users: inProject.reduce((sum, i) => sum + i.users, 0),
      tracked,
      untracked: inProject.length - tracked,
      fixed: inProject.filter((i) => links[i.id]?.status === "done").length,
    };
  }, [inProject, links]);

  const showClosed = filter === "resolved";
  const visible = showClosed
    ? closedInProject
    : inProject.filter((i) =>
        filter === "new"
          ? i.isNew || i.isRegression
          : filter === "untracked"
            ? !isOpenTask(links[i.id])
            : filter === "tracked"
              ? isOpenTask(links[i.id])
              : true,
      );

  const tiles: Array<{ key: Filter; value: number; label: string; sub: string }> = [
    { key: "all", value: stats.all, label: "Unresolved", sub: `${plural(stats.users, "user")} affected` },
    {
      key: "new",
      value: stats.fresh,
      label: "New",
      sub: stats.regressions > 0 ? `${plural(stats.regressions, "regression")} included` : `first seen in the last ${period}`,
    },
    { key: "untracked", value: stats.untracked, label: "Without a task", sub: "nobody is on these yet" },
    { key: "tracked", value: stats.tracked, label: "In progress", sub: "an open task covers these" },
    {
      key: "resolved",
      value: closedInProject.length,
      label: "Resolved",
      sub: closedByTask > 0 ? `${closedByTask} by a finished task` : `seen in the last ${period}, now closed`,
    },
  ];

  return (
    <div className="cd-root" style={{ padding: "20px clamp(12px, 3vw, 32px) 40px", maxWidth: 1200, display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{CSS}</style>

      <header className="cd-toolbar" style={{ gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 200px", minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>App errors</h1>
          <span style={{ fontSize: 13, color: c.mutedFg }}>
            {data?.configured
              ? `Most frequent unresolved errors from ${data.provider}`
              : "Errors from your tracker, turned into tasks"}
          </span>
        </div>
        {data?.configured && (
          <button type="button" className="cd-btn" onClick={() => void syncNow()} disabled={refreshing} aria-label="Refresh now">
            <RefreshIcon spinning={refreshing} />
            {`Synced ${timeAgo(data.snapshot.fetchedAt)}`}
          </button>
        )}
        {companyId && data?.configured && (
          <button type="button" className="cd-btn" onClick={() => setShowRouting(!showRouting)} aria-expanded={showRouting}>
            Routing
          </button>
        )}
      </header>

      {refreshError && <Banner tone="error">{refreshError}</Banner>}
      {error && <Banner tone="error">{error.message}</Banner>}
      {loading && !data && <p style={{ color: c.mutedFg }}>Loading errors…</p>}

      {data && !data.configured && <SetupCard message={data.setupMessage} />}

      {data?.configured && companyId && !data.defaultAssignee && !showRouting && (
        <DefaultAssigneeCard companyId={companyId} onSaved={refresh} />
      )}

      {showRouting && companyId && <RoutingPanel companyId={companyId} onClose={() => setShowRouting(false)} onSaved={refresh} />}

      {data?.configured && (
        <>
          {!data.snapshot.ok && data.snapshot.error && (
            <Banner tone="error">Last sync failed: {data.snapshot.error} Showing the last list that loaded.</Banner>
          )}

          {data.resolveError && <Banner tone="error">Could not resolve fixed errors in {data.provider}: {data.resolveError}</Banner>}
          {!data.resolveWhenDone && stats.fixed > 0 && (
            <Banner tone="info">
              {plural(stats.fixed, "error")} {stats.fixed === 1 ? "has" : "have"} a finished task but {stats.fixed === 1 ? "is" : "are"} still
              open in {data.provider}. Turn on “Resolve fixed errors” in Settings → Plugins → Crashdesk and Crashdesk closes
              them for you when a task is done.
            </Banner>
          )}

          <div className="cd-stats">
            {tiles.map((t) => (
              <button key={t.key} type="button" className="cd-stat" aria-pressed={filter === t.key} onClick={() => setFilter(t.key)}>
                <span className="cd-stat-value">{fmt(t.value)}</span>
                <span className="cd-stat-label">{t.label}</span>
                <span className="cd-stat-sub">{t.sub}</span>
              </button>
            ))}
          </div>

          {companyId && (
            <TriageBar companyId={companyId} period={period} project={project} count={stats.untracked} onDone={refresh} />
          )}

          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="cd-toolbar">
              <h2 className="cd-toolbar-grow" style={{ ...sectionTitle, flexGrow: 1 }}>
                {tiles.find((t) => t.key === filter)!.label} · {visible.length}
              </h2>
              {projects.length > 1 && (
                <select className="cd-select" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project">
                  <option value="all">All projects</option>
                  {projects.map(([slug, name]) => (
                    <option key={slug} value={slug}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
              <div className="cd-seg" role="group" aria-label="Time range">
                {PERIODS.map((p) => (
                  <button key={p} type="button" aria-pressed={p === period} onClick={() => setPeriod(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <div className="cd-card" style={{ padding: "28px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: c.mutedFg, textAlign: "center" }}>
                <CheckIcon size={22} />
                <span>
                  {filter === "all"
                    ? `No unresolved errors in the last ${period}.`
                    : filter === "untracked"
                      ? "Every error has a task."
                      : showClosed
                        ? `No error seen in the last ${period} has been resolved yet.`
                        : "Nothing here for this filter."}
                </span>
              </div>
            ) : (
              <div className="cd-list">
                <div className="cd-list-head" aria-hidden="true">
                  <span>Error</span>
                  <span>Events · {period}</span>
                  <span style={{ textAlign: "right" }}>Users</span>
                  <span>Task</span>
                </div>
                {visible.map((issue) => {
                  const link = links[issue.id];
                  const canCreate = !showClosed && !isOpenTask(link);
                  const formOpen = !showClosed && openForm === issue.id;
                  return (
                    <IssueRow
                      key={issue.id}
                      issue={issue}
                      period={period}
                      resolved={showClosed}
                      action={
                        <>
                          {link && <TaskChip task={link} />}
                          {showClosed && !link && <span style={{ fontSize: 12, color: c.mutedFg }}>Closed in {data.provider}</span>}
                          {canCreate && companyId && (
                            <CreateTaskButton
                              companyId={companyId}
                              issue={issue}
                              label={link ? "New task" : "Create task"}
                              target={data.targets?.[issue.id]}
                              formOpen={formOpen}
                              onToggleForm={() => setOpenForm(formOpen ? null : issue.id)}
                              onCreated={refresh}
                            />
                          )}
                        </>
                      }
                      form={
                        formOpen && companyId ? (
                          <CreateTaskForm
                            companyId={companyId}
                            issue={issue}
                            target={data.targets?.[issue.id]}
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
              </div>
            )}
            <p style={{ ...hint, fontSize: 12 }}>
              A task carries the error, its stack trace and a link back to {data.provider}. Error text reaches agents
              only as labelled, untrusted data.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard widget: headline numbers, the top issues, and the way in
// ---------------------------------------------------------------------------

export function CrashdeskDashboardWidget({ context }: PluginWidgetProps) {
  const companyLink = useCompanyLink();
  const { data, loading, error, refresh } = usePluginData<Overview>("overview", {
    companyId: context.companyId,
    period: "24h",
  });
  const runRefresh = usePluginAction("refresh");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  async function syncNow() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await runRefresh({ companyId: context.companyId, period: "24h" });
      refresh();
    } catch (err) {
      // Keep the last data on screen, but say that the refresh did not work.
      setRefreshError(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  const issues = data?.configured ? data.snapshot.issues : [];
  const links = data?.configured ? data.links : {};
  const top = issues[0];
  const untracked = issues.filter((i) => !isOpenTask(links[i.id])).length;
  const fresh = issues.filter((i) => i.isNew || i.isRegression).length;
  const users = issues.reduce((sum, i) => sum + i.users, 0);
  // All events of the listed errors, hour by hour.
  const trend = issues.reduce<number[]>((sum, i) => i.trend.map((v, at) => v + (sum[at] ?? 0)), []);

  // One line per project: how much is broken there, and how much of it someone is on.
  const projects = [
    ...issues
      .reduce((map, i) => {
        const row = map.get(i.project.slug) ?? { slug: i.project.slug, name: i.project.name, total: 0, fresh: 0, regressions: 0, untracked: 0, users: 0, events: 0 };
        row.total += 1;
        row.fresh += i.isNew && !i.isRegression ? 1 : 0;
        row.regressions += i.isRegression ? 1 : 0;
        row.untracked += isOpenTask(links[i.id]) ? 0 : 1;
        row.users += i.users;
        row.events += i.events;
        return map.set(i.project.slug, row);
      }, new Map<string, { slug: string; name: string; total: number; fresh: number; regressions: number; untracked: number; users: number; events: number }>())
      .values(),
  ].sort((a, b) => b.untracked - a.untracked || b.events - a.events);
  const shown = projects.slice(0, 4);

  return (
    // `contain` keeps long error text from widening the host's dashboard column.
    <div
      className="cd-root"
      style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 2px", width: "100%", maxWidth: "100%", overflow: "hidden", contain: "inline-size" }}
    >
      <style>{CSS}</style>

      <div className="cd-toolbar" style={{ minWidth: 0 }}>
        <span style={{ color: c.mutedFg, display: "flex" }}>
          <BugIcon size={16} />
        </span>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, flexGrow: 1, minWidth: 0 }}>App errors</h2>
        {data?.configured && (
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={refreshing}
            aria-label="Refresh errors"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 2px", background: "transparent", border: 0, color: c.mutedFg, cursor: "pointer", fontSize: 12 }}
          >
            {`24h · ${timeAgo(data.snapshot.fetchedAt)}`}
            <RefreshIcon spinning={refreshing} />
          </button>
        )}
      </div>

      {loading && !data && <p style={hint}>Loading errors…</p>}
      {error && <p style={{ ...hint, color: c.destructive }}>{error.message}</p>}
      {refreshError && (
        <p role="alert" style={{ ...hint, color: c.destructive }}>
          {refreshError}
        </p>
      )}

      {data && !data.configured && <p style={hint}>Connect your error tracker to see app errors here and turn them into tasks.</p>}

      {data?.configured && (
        <>
          {!data.snapshot.ok && <p style={{ ...hint, fontSize: 12, color: c.destructive }}>Last sync failed. Showing the last list that loaded.</p>}

          {issues.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: c.mutedFg, fontSize: 13 }}>
              <span style={{ color: c.green, display: "flex" }}>
                <CheckIcon size={18} />
              </span>
              No unresolved errors in the last 24 hours.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, minWidth: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{fmt(issues.length)}</span>
                    <span style={{ fontSize: 14 }}>unresolved {issues.length === 1 ? "error" : "errors"}</span>
                  </span>
                  <span style={{ fontSize: 12, color: c.mutedFg }}>
                    {fmt(fresh)} new · {plural(users, "user")} affected
                  </span>
                </div>
                {trend.length > 0 && <Sparkline values={trend} hot={fresh > 0} />}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                {untracked > 0 ? (
                  <>
                    <Dot color={c.yellow} />
                    <span>
                      {plural(untracked, "error")} without a task
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ color: c.green, display: "flex" }}>
                      <CheckIcon size={16} />
                    </span>
                    <span>Every error has a task</span>
                  </>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: `1px solid ${c.border}`, paddingTop: 12 }}>
                {shown.map((p) => {
                  const covered = p.total - p.untracked;
                  const notes = [
                    p.regressions > 0 ? plural(p.regressions, "regression") : "",
                    p.fresh > 0 ? `${fmt(p.fresh)} new` : "",
                    p.untracked > 0 ? `${fmt(p.untracked)} without a task` : "all have a task",
                  ].filter(Boolean);
                  return (
                    <div key={p.slug} style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                        <span style={{ fontWeight: 500, flexGrow: 1, minWidth: 0, overflowWrap: "anywhere" }}>{p.name}</span>
                        <span style={{ fontSize: 12, color: c.mutedFg, whiteSpace: "nowrap" }}>
                          {plural(p.total, "error")} · {plural(p.users, "user")}
                        </span>
                      </div>
                      <div
                        role="img"
                        aria-label={`${covered} of ${p.total} errors have a task`}
                        style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: c.muted }}
                      >
                        <span style={{ width: `${(covered / p.total) * 100}%`, background: c.green }} />
                        <span style={{ flexGrow: 1, background: c.yellow }} />
                      </div>
                      <span style={{ fontSize: 12, color: c.mutedFg }}>{notes.join(" · ")}</span>
                    </div>
                  );
                })}
                {projects.length > shown.length && (
                  <span style={{ fontSize: 12, color: c.mutedFg }}>and {plural(projects.length - shown.length, "more project")}</span>
                )}
              </div>

              {top && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${c.border}`, paddingTop: 12 }}>
                  <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: c.mutedFg }}>Most frequent</span>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
                    <span style={{ marginTop: 5 }}>
                      <Dot color={LEVEL_COLOR[top.level]} label={top.level} />
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flexGrow: 1 }}>
                      <span className="cd-clamp" title={top.title} style={{ fontFamily: c.mono, fontSize: 12.5 }}>
                        {top.title}
                      </span>
                      <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px", fontSize: 12, color: c.mutedFg }}>
                        <span>
                          {top.project.name} · {plural(top.events, "event")} · {plural(top.users, "user")}
                        </span>
                        {links[top.id] ? (
                          <span className="cd-badge">
                            <Dot color={STATUS_COLOR[links[top.id]!.status] ?? c.mutedFg} />
                            {links[top.id]!.identifier ?? "Task"} · {links[top.id]!.status.replace("_", " ")}
                          </span>
                        ) : (
                          <span className="cd-badge" style={{ color: c.yellow, borderColor: c.yellow }}>
                            No task
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      <a {...companyLink(PAGE_PATH)} className="cd-link" style={{ fontSize: 13, color: c.mutedFg, alignSelf: "flex-start" }}>
        {data && !data.configured
          ? "Set up Crashdesk →"
          : "Open Crashdesk →"}
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Routing panel: who gets errors, and which Paperclip project they belong to
// ---------------------------------------------------------------------------

interface ProjectMapRow {
  slug: string;
  /** Platform the tracker reports for the project, e.g. "react-native", "node". */
  platform: string;
  projectId: string;
  projectSource: "mapping" | "name" | null;
  /** The row's own assignee; "" means it uses the default. */
  assignee: string;
}

interface ProjectMapData {
  companyId: string | null;
  rows: ProjectMapRow[];
  /** Assignee for projects without their own, in the picker encoding. */
  fallbackAssignee: string;
}

interface MappingDraft {
  rows: Record<string, { projectId: string; assignee: string }>;
  fallbackAssignee: string;
}

/**
 * The default assignee is the only choice a team has to make. The rows below
 * are for teams where different agents own different code: each tracker
 * project is one codebase, so it can go to its own Paperclip project and agent.
 */
function RoutingPanel({ companyId, onClose, onSaved }: { companyId: string; onClose: () => void; onSaved: () => void }) {
  const { data, loading, error, refresh } = usePluginData<ProjectMapData>("project-map", { companyId });
  const save = usePluginAction("save-project-map");
  const [draft, setDraft] = useState<MappingDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const rows = data?.rows ?? [];
  // The draft starts from what is saved (or suggested); editing changes only the draft.
  const values: MappingDraft = draft ?? {
    rows: Object.fromEntries(rows.map((r) => [r.slug, { projectId: r.projectId, assignee: r.assignee }])),
    fallbackAssignee: data?.fallbackAssignee ?? "",
  };
  const editRow = (slug: string, patch: Partial<{ projectId: string; assignee: string }>) =>
    setDraft({
      ...values,
      rows: { ...values.rows, [slug]: { projectId: "", assignee: "", ...values.rows[slug], ...patch } },
    });
  const unsaved = draft !== null || rows.some((r) => r.projectSource !== "mapping");

  async function onSave() {
    setBusy(true);
    setMessage(null);
    try {
      await save({ companyId, map: values.rows, fallbackAssignee: values.fallbackAssignee });
      setDraft(null);
      refresh();
      onSaved();
      setMessage({ tone: "ok", text: "Saved." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cd-card" aria-label="Routing" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="cd-toolbar">
        <h2 style={{ ...sectionTitle, flexGrow: 1 }}>Routing</h2>
        <button type="button" className="cd-btn" onClick={onClose}>
          Close
        </button>
      </div>

      {loading && !data && <p style={hint}>Loading…</p>}
      {error && <p style={{ ...hint, color: c.destructive }}>{error.message}</p>}

      {data && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 380 }}>
          <span style={{ fontWeight: 600 }}>Default assignee</span>
          <AssigneePicker
            companyId={companyId}
            value={values.fallbackAssignee}
            onChange={(fallbackAssignee) => setDraft({ ...values, fallbackAssignee })}
            placeholder="Nobody"
            noneLabel="Nobody"
          />
          <span style={{ ...hint, fontSize: 12 }}>Gets every error task, unless a project below has its own assignee.</span>
        </label>
      )}

      {data && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 600 }}>Projects</span>
          <p style={{ ...hint, fontSize: 12, marginTop: 4, marginBottom: 10 }}>
            Optional. Send a project's errors to a Paperclip project and to the agent who owns that code. A project
            with the same name is suggested; save to confirm it.
          </p>
          {rows.length === 0 && <p style={hint}>No projects yet. A project shows up here once it has an unresolved error.</p>}
          {rows.map((row) => {
            const value = values.rows[row.slug] ?? { projectId: "", assignee: "" };
            const changed = draft !== null && (value.projectId !== row.projectId || value.assignee !== row.assignee);
            const status = changed
              ? "Not saved"
              : row.projectSource === "mapping"
                ? "Saved"
                : row.projectSource === "name"
                  ? "Suggested, not saved"
                  : "Not set";
            return (
              <div key={row.slug} className="cd-map-row">
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontFamily: c.mono, overflowWrap: "anywhere" }}>{row.slug}</span>
                  <span style={{ fontSize: 12, color: c.mutedFg }}>{[row.platform, status].filter(Boolean).join(" · ")}</span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="cd-map-label">Paperclip project</div>
                  <ProjectPicker
                    companyId={companyId}
                    value={value.projectId}
                    onChange={(projectId) => editRow(row.slug, { projectId })}
                    placeholder="No project"
                    noneLabel="No project"
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="cd-map-label">Assignee</div>
                  <AssigneePicker
                    companyId={companyId}
                    value={value.assignee}
                    onChange={(assignee) => editRow(row.slug, { assignee })}
                    placeholder="Default assignee"
                    noneLabel="Default assignee"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data && (
        <div className="cd-toolbar" style={{ gap: 12 }}>
          <button type="button" className="cd-btn cd-btn-primary" onClick={() => void onSave()} disabled={busy || !unsaved}>
            {busy ? "Saving…" : "Save"}
          </button>
          {draft !== null && (
            <button type="button" className="cd-btn" onClick={() => setDraft(null)} disabled={busy}>
              Reset
            </button>
          )}
          {message && (
            <span role={message.tone === "error" ? "alert" : "status"} style={{ fontSize: 13, color: message.tone === "error" ? c.destructive : c.mutedFg }}>
              {message.text}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sidebar entry
// ---------------------------------------------------------------------------

export function CrashdeskSidebarLink(_props: PluginSidebarProps) {
  const companyLink = useCompanyLink();
  return (
    <>
      <style>{CSS}</style>
      <a {...companyLink(PAGE_PATH)} className="cd-nav">
        <BugIcon size={16} />
        Crashdesk
      </a>
    </>
  );
}
