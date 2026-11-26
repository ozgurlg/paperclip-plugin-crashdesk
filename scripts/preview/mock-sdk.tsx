// Stand-in for the host's UI bridge, so the plugin UI can be looked at in a
// plain browser without a running Paperclip. Example data only.
import type { ReactNode } from "react";

const hours = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();
const trend = (peak: number) => Array.from({ length: 24 }, (_, i) => Math.round(peak * Math.max(0, Math.sin((i / 23) * 3)) * (i > 17 ? 1 : 0.3)));

function issue(n: number, o: Record<string, unknown>) {
  return {
    id: String(4800 + n),
    shortId: `SHOP-APP-${n}`,
    title: "TypeError: undefined is not an object (evaluating 'item.price.amount')",
    culprit: "screens/CartList.tsx in renderCartItem",
    level: "error",
    project: { id: "7", slug: "shop-app", name: "shop-app", platform: "react-native" },
    events: 48,
    users: 31,
    firstSeen: hours(5),
    lastSeen: hours(0.1),
    isNew: false,
    isRegression: false,
    url: "https://acme.sentry.io/issues/4821/",
    trend: trend(12),
    ...o,
  };
}

const issues = [
  issue(1, { isRegression: true, level: "fatal", events: 412, users: 187, trend: trend(60) }),
  issue(2, { title: "NetworkError: Request to https://api.acme.example/v2/orders/checkout/confirm timed out after 30000ms", culprit: "services/api/client.ts in request", isNew: true, events: 96, users: 54 }),
  issue(3, { title: "RangeError: Maximum call stack size exceeded", culprit: "lib/markdown/render.ts in renderNode", project: { id: "9", slug: "blog", name: "blog", platform: "node" }, shortId: "BLOG-3", events: 20, users: 0, level: "warning", firstSeen: hours(200) }),
  issue(4, { title: "Error: Hydration failed because the server rendered HTML didn't match the client", culprit: "app/posts/[slug]/page.tsx", project: { id: "9", slug: "blog", name: "blog", platform: "node" }, shortId: "BLOG-4", isNew: true, events: 7, users: 5 }),
  issue(5, { title: "UnhandledRejection: AbortError", culprit: "", events: 3, users: 1, level: "info", firstSeen: hours(90) }),
];

const overview = {
  configured: true,
  provider: "Sentry",
  defaultAssignee: new URLSearchParams(location.search).has("fresh") ? "" : "agent:lead",
  snapshot: { period: "24h", fetchedAt: hours(0.03), ok: true, error: null, issues },
  links: {
    "4801": { id: "t1", identifier: "ACME-41", status: "in_progress", title: "Fix SHOP-APP-1" },
    "4803": { id: "t2", identifier: "ACME-37", status: "done", title: "Fix BLOG-3" },
  },
  targets: Object.fromEntries(
    issues.map((i) => [i.id, { projectId: "p1", projectName: "Shop app", projectSource: "mapping", assignee: new URLSearchParams(location.search).has("fresh") ? "" : "agent:lead", assigneeSource: "fallback" }]),
  ),
};

const projectMap = {
  companyId: "c1",
  fallbackAssignee: "agent:lead",
  rows: [
    { slug: "blog", platform: "node", projectId: "p2", projectSource: "name", assignee: "" },
    { slug: "shop-app", platform: "react-native", projectId: "p1", projectSource: "mapping", assignee: "agent:mobile" },
  ],
};

export function usePluginData(key: string) {
  const empty = new URLSearchParams(location.search).has("empty");
  const data = key === "overview" ? (empty ? { ...overview, snapshot: { ...overview.snapshot, issues: [] } } : overview) : projectMap;
  return { data, loading: false, error: null, refresh: () => {} };
}

export function usePluginAction(key: string) {
  return async () => {
    await new Promise((r) => setTimeout(r, 400));
    if (key === "triage") {
      return {
        created: [{ project: "shop-app", errors: 2, task: { id: "t9", identifier: "ACME-52", status: "todo", title: "Triage" } }],
        skipped: [{ project: "blog", reason: "already being triaged", task: { id: "t8", identifier: "ACME-50", status: "in_progress", title: "Triage" } }],
      };
    }
    return {};
  };
}

export const useHostContext = () => ({ companyPrefix: "ACME" });
export const useHostNavigation = () => ({ linkProps: (href: string) => ({ href }) });

function Picker({ value, placeholder, options }: { value: string; placeholder?: string; options: Record<string, string> }): ReactNode {
  return (
    <button type="button" style={{ width: "100%", textAlign: "left", padding: "7px 10px", border: "1px solid var(--input)", borderRadius: "var(--radius)", background: "transparent", color: value ? "inherit" : "var(--muted-foreground)", font: "inherit" }}>
      {options[value] ?? placeholder}
    </button>
  );
}
export const AssigneePicker = (p: { value: string; placeholder?: string }) => <Picker {...p} options={{ "agent:lead": "Team Lead", "agent:mobile": "Mobile Engineer" }} />;
export const ProjectPicker = (p: { value: string; placeholder?: string }) => <Picker {...p} options={{ p1: "Shop app", p2: "Blog" }} />;
