import { test } from "node:test";
import assert from "node:assert/strict";
import { createSentryProvider, normalizeBaseUrl, parseEvent, parseIssue } from "./sentry.ts";
import { ProviderError } from "./types.ts";

const NOW = Date.parse("2026-11-26T12:00:00Z");

const rawIssue = {
  id: "4821",
  shortId: "SHOP-APP-1A",
  title: "TypeError: undefined is not an object (evaluating 'cart.items')",
  culprit: "screens/CartList.tsx in renderCartItem",
  level: "error",
  count: "48",
  userCount: 31,
  firstSeen: "2026-11-26T06:00:00Z",
  lastSeen: "2026-11-26T11:57:00Z",
  substatus: "new",
  permalink: "https://acme.sentry.io/issues/4821/",
  project: { id: "7", slug: "shop-app", name: "Shop App" },
  stats: { "24h": Array.from({ length: 24 }, (_, i) => [i, i >= 21 ? 10 + i : 0]) },
};

test("parseIssue maps the Sentry fields", () => {
  const issue = parseIssue(rawIssue, "24h", NOW);
  assert.equal(issue.id, "4821");
  assert.equal(issue.shortId, "SHOP-APP-1A");
  assert.equal(issue.events, 48);
  assert.equal(issue.users, 31);
  assert.equal(issue.level, "error");
  assert.equal(issue.project.name, "shop-app");
  assert.equal(issue.isNew, true);
  assert.equal(issue.isRegression, false);
  assert.equal(issue.trend.length, 24);
  assert.equal(issue.trend[23], 33);
});

test("parseIssue keeps the last 7 daily points for 7d", () => {
  const issue = parseIssue(
    { ...rawIssue, substatus: "ongoing", firstSeen: "2026-10-01T00:00:00Z", stats: { "14d": Array.from({ length: 14 }, (_, i) => [i, i]) } },
    "7d",
    NOW,
  );
  assert.deepEqual(issue.trend, [7, 8, 9, 10, 11, 12, 13]);
  assert.equal(issue.isNew, false);
});

test("parseIssue survives junk", () => {
  const issue = parseIssue({ level: "weird", count: "x", project: null }, "24h", NOW);
  assert.equal(issue.level, "error");
  assert.equal(issue.events, 0);
  assert.equal(issue.title, "(untitled issue)");
  assert.deepEqual(issue.trend, []);
});

test("parseIssue flags regressions", () => {
  assert.equal(parseIssue({ ...rawIssue, substatus: "regressed" }, "24h", NOW).isRegression, true);
});

test("parseEvent takes the thrown exception and innermost in-app frames first", () => {
  const detail = parseEvent({
    tags: [
      { key: "release", value: "1.2.0 (14)" },
      { key: "environment", value: "production" },
      { key: "os", value: "iOS 18.1" },
    ],
    entries: [
      { type: "breadcrumbs", data: {} },
      {
        type: "exception",
        data: {
          values: [
            { type: "CauseError", value: "inner cause" },
            {
              type: "TypeError",
              value: "undefined is not an object",
              stacktrace: {
                frames: [
                  { filename: "node_modules/react-native/Renderer.js", function: "renderWithHooks", lineNo: 1203, inApp: false },
                  { filename: "screens/CartList.tsx", function: "CartList", lineNo: 61, inApp: true },
                  { filename: "screens/CartList.tsx", function: "renderCartItem", lineNo: 84, inApp: true },
                ],
              },
            },
          ],
        },
      },
    ],
  });
  assert.equal(detail.exceptionType, "TypeError");
  assert.equal(detail.release, "1.2.0 (14)");
  assert.equal(detail.os, "iOS 18.1");
  assert.deepEqual(
    detail.frames.map((f) => f.fn),
    ["renderCartItem", "CartList"],
  );
});

test("parseEvent handles an event without an exception", () => {
  const detail = parseEvent({ entries: [{ type: "message", data: {} }] });
  assert.equal(detail.exceptionType, null);
  assert.deepEqual(detail.frames, []);
});

test("normalizeBaseUrl trims slashes and rejects other schemes", () => {
  assert.equal(normalizeBaseUrl("https://de.sentry.io/"), "https://de.sentry.io");
  assert.equal(normalizeBaseUrl(" https://sentry.example.com/sentry/ "), "https://sentry.example.com/sentry");
  assert.throws(() => normalizeBaseUrl("ftp://x"), ProviderError);
});

function provider(response: () => Response | Promise<Response>, seen: string[] = []) {
  return createSentryProvider({
    baseUrl: "https://de.sentry.io",
    organization: "acme",
    token: "secret-token",
    projects: ["shop-app", "blog"],
    environment: "production",
    fetch: async (url, init) => {
      seen.push(url);
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret-token");
      return response();
    },
  });
}

test("listIssues builds the documented query", async () => {
  const seen: string[] = [];
  const issues = await provider(() => new Response(JSON.stringify([rawIssue]), { status: 200 }), seen).listIssues({
    period: "24h",
    limit: 25,
  });
  assert.equal(issues.length, 1);
  const url = new URL(seen[0]!);
  assert.equal(url.pathname, "/api/0/organizations/acme/issues/");
  assert.deepEqual(url.searchParams.getAll("project"), ["shop-app", "blog"]);
  assert.equal(url.searchParams.get("environment"), "production");
  assert.equal(url.searchParams.get("query"), "is:unresolved");
  assert.equal(url.searchParams.get("statsPeriod"), "24h");
  assert.equal(url.searchParams.get("sort"), "freq");
});

test("listIssues can list resolved errors, latest first", async () => {
  const seen: string[] = [];
  await provider(() => new Response(JSON.stringify([rawIssue]), { status: 200 }), seen).listIssues({
    period: "7d",
    limit: 25,
    status: "resolved",
  });
  const url = new URL(seen[0]!);
  assert.equal(url.searchParams.get("query"), "is:resolved");
  assert.equal(url.searchParams.get("sort"), "date");
  assert.equal(url.searchParams.get("statsPeriod"), "7d");
});

test("HTTP errors become readable ProviderErrors without the token", async () => {
  for (const [status, kind] of [
    [401, "auth"],
    [403, "auth"],
    [404, "not-found"],
    [429, "rate-limit"],
    [500, "unexpected"],
  ] as const) {
    await assert.rejects(
      provider(() => new Response("{}", { status })).listIssues({ period: "24h", limit: 5 }),
      (err: unknown) => err instanceof ProviderError && err.kind === kind && !err.message.includes("secret-token"),
    );
  }
});

test("network failures are reported as network errors", async () => {
  await assert.rejects(
    provider(() => {
      throw new TypeError("fetch failed");
    }).listIssues({ period: "24h", limit: 5 }),
    (err: unknown) => err instanceof ProviderError && err.kind === "network",
  );
});

function writer(statuses: number[]) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const provider = createSentryProvider({
    baseUrl: "https://sentry.io",
    organization: "acme",
    token: "t",
    projects: [],
    environment: null,
    fetch: async (url, init) => {
      calls.push({ url, method: init?.method ?? "GET", body: JSON.parse(String(init?.body ?? "null")) });
      return new Response("{}", { status: statuses.shift() ?? 200 });
    },
  });
  return { provider, calls };
}

test("resolveIssue resolves in the next release", async () => {
  const { provider, calls } = writer([200]);
  await provider.resolveIssue!("4821");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, "PUT");
  assert.equal(calls[0]!.url, "https://sentry.io/api/0/organizations/acme/issues/4821/?");
  assert.deepEqual(calls[0]!.body, { status: "resolved", statusDetails: { inNextRelease: true } });
});

test("resolveIssue falls back to a plain resolve when the project has no release", async () => {
  const { provider, calls } = writer([400, 200]);
  await provider.resolveIssue!("4821");
  assert.deepEqual(calls[1]!.body, { status: "resolved" });
});

test("resolveIssue names the missing write scope", async () => {
  const { provider, calls } = writer([403]);
  await assert.rejects(provider.resolveIssue!("4821"), (err: unknown) => err instanceof ProviderError && err.kind === "auth" && /event:write/.test(err.message));
  assert.equal(calls.length, 1);
});
