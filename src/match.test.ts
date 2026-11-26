import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanProjectMap, matchProject, normalizeName, resolveProject } from "./match.ts";

const projects = [
  { id: "p1", name: "Shop App" },
  { id: "p2", name: "Blog" },
  { id: "p3", name: "Company" },
];
const shop = { slug: "shop-app", name: "shop-app" };

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

test("a saved mapping wins over the name", () => {
  assert.deepEqual(resolveProject(shop, { "shop-app": "p3" }, projects), {
    project: { id: "p3", name: "Company" },
    source: "mapping",
  });
});

test("a saved 'no project' is respected", () => {
  assert.deepEqual(resolveProject(shop, { "shop-app": "" }, projects), { project: null, source: "mapping" });
});

test("unmapped projects fall back to the name suggestion", () => {
  assert.deepEqual(resolveProject(shop, {}, projects), { project: { id: "p1", name: "Shop App" }, source: "name" });
  assert.deepEqual(resolveProject({ slug: "android", name: "android" }, {}, projects), { project: null, source: null });
});

test("a mapping to a deleted project falls back to the name", () => {
  assert.equal(resolveProject(shop, { "shop-app": "gone" }, projects).source, "name");
});

test("cleanProjectMap drops bad slugs and unknown projects", () => {
  assert.deepEqual(
    cleanProjectMap({ "shop-app": "p1", blog: "", "bad slug": "p2", android: "nope", x: 3 }, projects),
    { "shop-app": "p1", blog: "" },
  );
  assert.deepEqual(cleanProjectMap(["p1"], projects), {});
  assert.deepEqual(cleanProjectMap(null, projects), {});
});
