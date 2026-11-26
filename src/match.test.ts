import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assigneeIds,
  cleanAssignee,
  cleanProjectMap,
  matchProject,
  normalizeName,
  readProjectMapValue,
  resolveTarget,
} from "./match.ts";

const projects = [
  { id: "p1", name: "Shop App" },
  { id: "p2", name: "Blog" },
  { id: "p3", name: "Company" },
];
const shop = { slug: "shop-app", name: "shop-app" };
const api = { slug: "api", name: "api" };
const row = (projectId: string, assignee = "") => ({ projectId, assignee });

test("normalizeName ignores case and separators", () => {
  assert.equal(normalizeName("Shop App"), "shopapp");
  assert.equal(normalizeName("shop-app"), "shopapp");
  assert.equal(normalizeName("SHOP_APP"), "shopapp");
});

test("name suggestion: same name only, never ambiguous", () => {
  assert.equal(matchProject(shop, projects)?.id, "p1");
  assert.equal(matchProject({ slug: "android", name: "android" }, projects), null);
  assert.equal(matchProject({ slug: "blog", name: "blog" }, [...projects, { id: "p4", name: "BLOG" }]), null);
  assert.equal(matchProject({ slug: "", name: "" }, [{ id: "x", name: "" }]), null);
});

test("each Sentry project can have its own assignee", () => {
  const map = { "shop-app": row("p1", "agent:mobile"), api: row("p3", "agent:backend") };
  assert.equal(resolveTarget(shop, map, projects, "agent:fallback").assignee, "agent:mobile");
  assert.equal(resolveTarget(api, map, projects, "agent:fallback").assignee, "agent:backend");
  assert.equal(resolveTarget(api, map, projects, "agent:fallback").assigneeSource, "project");
});

test("rows without their own assignee use the fallback", () => {
  const resolved = resolveTarget(shop, { "shop-app": row("p1") }, projects, "agent:fallback");
  assert.deepEqual(resolved, {
    project: { id: "p1", name: "Shop App" },
    projectSource: "mapping",
    assignee: "agent:fallback",
    assigneeSource: "fallback",
  });
  assert.equal(resolveTarget(shop, {}, projects, "").assigneeSource, null);
});

test("a saved 'no project' is respected; unmapped rows get the name suggestion", () => {
  assert.equal(resolveTarget(shop, { "shop-app": row("") }, projects, "").project, null);
  assert.equal(resolveTarget(shop, { "shop-app": row("") }, projects, "").projectSource, "mapping");
  assert.equal(resolveTarget(shop, {}, projects, "").projectSource, "name");
  assert.equal(resolveTarget({ slug: "android", name: "android" }, {}, projects, "").projectSource, null);
});

test("a row pointing at a deleted project falls back to the name but keeps its assignee", () => {
  const resolved = resolveTarget(shop, { "shop-app": row("gone", "agent:mobile") }, projects, "");
  assert.equal(resolved.projectSource, "name");
  assert.equal(resolved.assignee, "agent:mobile");
});

test("cleanProjectMap drops bad slugs, unknown projects and malformed assignees", () => {
  assert.deepEqual(
    cleanProjectMap(
      {
        "shop-app": row("p1", "agent:a1"),
        blog: row("", "user:u1"),
        company: { projectId: "p3", assignee: "agent:x; drop table" },
        "bad slug": row("p2"),
        android: row("nope"),
        x: 3,
      },
      projects,
    ),
    { "shop-app": row("p1", "agent:a1"), blog: row("", "user:u1"), company: row("p3", "") },
  );
  assert.deepEqual(cleanProjectMap(["p1"], projects), {});
});

test("older 'project only' rows still read", () => {
  assert.deepEqual(readProjectMapValue({ "shop-app": "p1", blog: "" }), { "shop-app": row("p1"), blog: row("") });
});

test("assignee values must be picker values", () => {
  assert.equal(cleanAssignee("agent:a1"), "agent:a1");
  assert.equal(cleanAssignee("agent:x; drop table"), "");
  assert.deepEqual(assigneeIds("agent:a1"), { assigneeAgentId: "a1" });
  assert.deepEqual(assigneeIds("user:u1"), { assigneeUserId: "u1" });
  assert.deepEqual(assigneeIds(""), {});
});
