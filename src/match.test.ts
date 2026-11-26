import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assigneeIds,
  cleanProjectMap,
  matchProject,
  normalizeName,
  readProjectMapValue,
  resolveProject,
} from "./match.ts";

const projects = [
  { id: "p1", name: "Shop App" },
  { id: "p2", name: "Blog" },
  { id: "p3", name: "Company" },
];
const shop = { slug: "shop-app", name: "shop-app" };
const entry = (projectId: string, assignee = "") => ({ projectId, assignee });

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

test("a saved mapping wins over the name and carries its assignee", () => {
  assert.deepEqual(resolveProject(shop, { "shop-app": entry("p3", "agent:a1") }, projects), {
    project: { id: "p3", name: "Company" },
    source: "mapping",
    assignee: "agent:a1",
  });
});

test("a saved 'no project' is respected", () => {
  assert.deepEqual(resolveProject(shop, { "shop-app": entry("") }, projects), {
    project: null,
    source: "mapping",
    assignee: "",
  });
});

test("unmapped projects fall back to the name suggestion", () => {
  assert.deepEqual(resolveProject(shop, {}, projects), {
    project: { id: "p1", name: "Shop App" },
    source: "name",
    assignee: "",
  });
  assert.equal(resolveProject({ slug: "android", name: "android" }, {}, projects).source, null);
});

test("a mapping to a deleted project falls back to the name but keeps the assignee", () => {
  const resolved = resolveProject(shop, { "shop-app": entry("gone", "agent:a1") }, projects);
  assert.equal(resolved.source, "name");
  assert.equal(resolved.assignee, "agent:a1");
});

test("cleanProjectMap drops bad slugs, unknown projects and malformed assignees", () => {
  assert.deepEqual(
    cleanProjectMap(
      {
        "shop-app": entry("p1", "agent:a1"),
        blog: entry("", "user:u1"),
        company: { projectId: "p3", assignee: "agent:x; drop table" },
        "bad slug": entry("p2"),
        android: entry("nope"),
        x: 3,
      },
      projects,
    ),
    { "shop-app": entry("p1", "agent:a1"), blog: entry("", "user:u1"), company: entry("p3", "") },
  );
  assert.deepEqual(cleanProjectMap(["p1"], projects), {});
  assert.deepEqual(cleanProjectMap(null, projects), {});
});

test("older maps that stored only a project id still read", () => {
  assert.deepEqual(readProjectMapValue({ "shop-app": "p1", blog: "" }), {
    "shop-app": entry("p1"),
    blog: entry(""),
  });
  assert.deepEqual(cleanProjectMap({ "shop-app": "p1" }, projects), { "shop-app": entry("p1") });
});

test("assigneeIds splits the picker encoding", () => {
  assert.deepEqual(assigneeIds("agent:a1"), { assigneeAgentId: "a1" });
  assert.deepEqual(assigneeIds("user:u1"), { assigneeUserId: "u1" });
  assert.deepEqual(assigneeIds(""), {});
  assert.deepEqual(assigneeIds("robot:x"), {});
});
