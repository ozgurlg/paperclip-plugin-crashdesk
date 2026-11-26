import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "./config.ts";

test("defaults", () => {
  const config = parseConfig({});
  assert.equal(config.sentryUrl, "https://sentry.io");
  assert.equal(config.organization, "");
  assert.equal(config.authToken, null);
  assert.equal(config.pollIntervalMinutes, 10);
});

test("reads the manifest keys", () => {
  const config = parseConfig({ org: " acme ", url: "https://de.sentry.io" });
  assert.equal(config.organization, "acme");
  assert.equal(config.sentryUrl, "https://de.sentry.io");
});

test("refresh interval defaults to 10 and stays within 5..1440", () => {
  assert.equal(parseConfig({ refreshMinutes: "" }).pollIntervalMinutes, 10);
  assert.equal(parseConfig({ refreshMinutes: 2 }).pollIntervalMinutes, 5);
  assert.equal(parseConfig({ refreshMinutes: "30" }).pollIntervalMinutes, 30);
  assert.equal(parseConfig({ refreshMinutes: 99999 }).pollIntervalMinutes, 1440);
});

test("secret binding objects are kept as-is", () => {
  const ref = { type: "secret_ref", secretId: "abc", version: "latest" };
  assert.deepEqual(parseConfig({ token: ref }).authToken, ref);
});
