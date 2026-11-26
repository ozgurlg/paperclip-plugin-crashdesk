import { test } from "node:test";
import assert from "node:assert/strict";
import { matchProject, normalizeName } from "./match.ts";

const projects = [
  { id: "p1", name: "Shop App" },
  { id: "p2", name: "Blog" },
  { id: "p3", name: "Company" },
];

test("normalizeName ignores case and separators", () => {
  assert.equal(normalizeName("Shop App"), "shopapp");
  assert.equal(normalizeName("shop-app"), "shopapp");
  assert.equal(normalizeName("SHOP_APP"), "shopapp");
});

test("matches the Paperclip project with the same name", () => {
  assert.equal(matchProject({ slug: "shop-app", name: "shop-app" }, projects)?.id, "p1");
  assert.equal(matchProject({ slug: "blog", name: "blog" }, projects)?.id, "p2");
});

test("no match when nothing has the same name", () => {
  assert.equal(matchProject({ slug: "android", name: "android" }, projects), null);
  assert.equal(matchProject({ slug: "shop", name: "shop" }, projects), null);
});

test("no match when two projects share the name", () => {
  assert.equal(matchProject({ slug: "blog", name: "blog" }, [...projects, { id: "p4", name: "BLOG" }]), null);
});

test("empty names never match", () => {
  assert.equal(matchProject({ slug: "", name: "" }, [{ id: "x", name: "" }]), null);
});
