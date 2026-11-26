// Sentry provider: read-only, needs a token with the `event:read` scope.
// API reference: https://docs.sentry.io/api/events/

import {
  ProviderError,
  type ErrorIssue,
  type ErrorIssueDetail,
  type ErrorLevel,
  type ErrorProvider,
  type ListOptions,
  type StackFrame,
} from "./types.ts";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface SentryOptions {
  baseUrl: string;
  organization: string;
  token: string;
  /** Project slugs to include; empty means every project the token can see. */
  projects: string[];
  environment: string | null;
  fetch: FetchLike;
}

const LEVELS: ErrorLevel[] = ["fatal", "error", "warning", "info", "debug"];
const MAX_FRAMES = 12;

// Sentry only offers two trend resolutions for issue lists.
const GROUP_STATS: Record<ListOptions["period"], "24h" | "14d"> = {
  "24h": "24h",
  "7d": "14d",
  "14d": "14d",
};
const TREND_POINTS: Record<ListOptions["period"], number> = { "24h": 24, "7d": 7, "14d": 14 };
const PERIOD_MS: Record<ListOptions["period"], number> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "14d": 14 * 86_400_000,
};

export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  const url = new URL(trimmed);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ProviderError(`Sentry URL must be http(s), got ${url.protocol}`, "unexpected");
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

export function createSentryProvider(options: SentryOptions): ErrorProvider {
  const base = normalizeBaseUrl(options.baseUrl);
  const org = encodeURIComponent(options.organization.trim());

  async function get(path: string, params: URLSearchParams): Promise<unknown> {
    const url = `${base}/api/0/organizations/${org}${path}?${params.toString()}`;
    let response: Response;
    try {
      response = await options.fetch(url, {
        headers: { Authorization: `Bearer ${options.token}`, Accept: "application/json" },
      });
    } catch {
      throw new ProviderError(`Could not reach Sentry at ${base}`, "network");
    }
    if (response.status === 401 || response.status === 403) {
      throw new ProviderError(
        "Sentry rejected the token. It needs the event:read scope (Issue & Event: Read).",
        "auth",
      );
    }
    if (response.status === 404) {
      throw new ProviderError(
        `Sentry organization "${options.organization}" was not found. Check the slug and the data region URL.`,
        "not-found",
      );
    }
    if (response.status === 429) {
      throw new ProviderError("Sentry rate limit reached. Try again in a minute.", "rate-limit");
    }
    if (!response.ok) {
      throw new ProviderError(`Sentry returned HTTP ${response.status}`, "unexpected");
    }
    try {
      return await response.json();
    } catch {
      throw new ProviderError("Sentry returned a response that is not JSON", "unexpected");
    }
  }

  function scopeParams(): URLSearchParams {
    const params = new URLSearchParams();
    for (const project of options.projects) params.append("project", project);
    if (options.environment) params.append("environment", options.environment);
    return params;
  }

  return {
    id: "sentry",
    displayName: "Sentry",

    async listIssues({ period, limit }) {
      const params = scopeParams();
      params.set("query", "is:unresolved");
      params.set("statsPeriod", period);
      params.set("groupStatsPeriod", GROUP_STATS[period]);
      params.set("sort", "freq");
      params.set("limit", String(Math.min(Math.max(limit, 1), 100)));
      const body = await get("/issues/", params);
      if (!Array.isArray(body)) throw new ProviderError("Unexpected issue list from Sentry", "unexpected");
      return body.map((raw) => parseIssue(raw, period, Date.now()));
    },

    async getIssue(issueId, period) {
      const id = encodeURIComponent(issueId);
      // The single-issue endpoint reports lifetime counts; that is what a task should quote.
      const [rawIssue, rawEvents] = await Promise.all([
        get(`/issues/${id}/`, new URLSearchParams()),
        get(`/issues/${id}/events/`, new URLSearchParams({ full: "true", per_page: "1" })),
      ]);
      const issue = parseIssue(rawIssue, period, Date.now());
      const event = Array.isArray(rawEvents) ? rawEvents[0] : undefined;
      return { issue, ...parseEvent(event) };
    },
  };
}

// ---------------------------------------------------------------------------
// Parsing. Sentry payloads are large and loosely typed; read defensively.
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function obj(value: unknown): Json {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}
function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback;
}
function num(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export function parseIssue(raw: unknown, period: ListOptions["period"], now: number): ErrorIssue {
  const o = obj(raw);
  const project = obj(o.project);
  const level = str(o.level) as ErrorLevel;
  const firstSeen = str(o.firstSeen);
  const substatus = str(o.substatus);
  const firstSeenMs = Date.parse(firstSeen);

  const series = obj(o.stats)[GROUP_STATS[period]];
  const counts = Array.isArray(series) ? series.map((point) => (Array.isArray(point) ? num(point[1]) : 0)) : [];

  return {
    id: str(o.id),
    shortId: str(o.shortId, str(o.id)),
    title: str(o.title, "(untitled issue)"),
    culprit: str(o.culprit),
    level: LEVELS.includes(level) ? level : "error",
    // Sentry's own UI labels projects by slug; the name field is often a leftover platform name.
    project: { id: str(project.id), slug: str(project.slug), name: str(project.slug) || str(project.name) },
    events: num(o.count),
    users: num(o.userCount),
    firstSeen,
    lastSeen: str(o.lastSeen),
    isNew: substatus === "new" || (Number.isFinite(firstSeenMs) && now - firstSeenMs <= PERIOD_MS[period]),
    isRegression: substatus === "regressed",
    url: str(o.permalink),
    trend: counts.slice(-TREND_POINTS[period]),
  };
}

export function parseEvent(raw: unknown): Omit<ErrorIssueDetail, "issue"> {
  const event = obj(raw);
  const tags = new Map<string, string>();
  if (Array.isArray(event.tags)) {
    for (const tag of event.tags) {
      const t = obj(tag);
      tags.set(str(t.key), str(t.value));
    }
  }

  let exceptionType: string | null = null;
  let exceptionValue: string | null = null;
  let frames: StackFrame[] = [];

  const entries = Array.isArray(event.entries) ? event.entries : [];
  const exception = entries.map(obj).find((entry) => entry.type === "exception");
  const values = Array.isArray(obj(exception?.data).values) ? (obj(exception?.data).values as unknown[]) : [];
  // Sentry lists chained exceptions oldest first; the last one is what was thrown.
  const thrown = obj(values[values.length - 1]);
  if (values.length > 0) {
    exceptionType = str(thrown.type) || null;
    exceptionValue = str(thrown.value) || null;
    const rawFrames = obj(thrown.stacktrace).frames;
    if (Array.isArray(rawFrames)) {
      // Sentry orders frames outermost first; show the innermost first.
      const all = rawFrames.map(obj).reverse().map((f) => ({
        file: str(f.filename) || str(f.module) || str(f.absPath) || "?",
        fn: str(f.function) || "?",
        line: typeof f.lineNo === "number" ? f.lineNo : null,
        inApp: f.inApp === true,
      }));
      const appFrames = all.filter((f) => f.inApp);
      frames = (appFrames.length > 0 ? appFrames : all).slice(0, MAX_FRAMES);
    }
  }

  return {
    exceptionType,
    exceptionValue,
    frames,
    release: tags.get("release") ?? null,
    environment: tags.get("environment") ?? null,
    os: tags.get("os") ?? tags.get("os.name") ?? null,
    device: tags.get("device") ?? tags.get("device.family") ?? null,
  };
}
