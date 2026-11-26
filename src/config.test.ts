import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig, parseProjects } from "./config.ts";

test("defaults", () => {
  const config = parseConfig({});
  assert.equal(config.sentryUrl, "https://sentry.io");
  assert.equal(config.organization, "");
  assert.equal(config.authToken, null);
  assert.deepEqual(config.projects, []);
  assert.equal(config.environment, null);
  assert.equal(config.pollIntervalMinutes, 10);
});

test("projects accept a list or a comma-separated string", () => {
  assert.deepEqual(parseProjects("shop-app, blog,,shop-app"), ["shop-app", "blog"]);
  assert.deepEqual(parseProjects(["a", " b ", 3]), ["a", "b"]);
});

test("interval is clamped", () => {
  assert.equal(parseConfig({ pollIntervalMinutes: 0 }).pollIntervalMinutes, 10);
  assert.equal(parseConfig({ pollIntervalMinutes: 99999 }).pollIntervalMinutes, 1440);
  assert.equal(parseConfig({ pollIntervalMinutes: "15" }).pollIntervalMinutes, 15);
});

test("secret binding objects are kept as-is", () => {
  const ref = { type: "secret_ref", secretId: "abc", version: "latest" };
  assert.deepEqual(parseConfig({ authToken: ref }).authToken, ref);
});
