import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  DEFAULTS,
  EXPORT_NAMES,
  JOB_KEYS,
  PAGE_ROUTE,
  PERIODS,
  PLUGIN_ID,
  PLUGIN_VERSION,
  SLOT_IDS,
  TOOL_NAMES,
} from "./constants.ts";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Crashdesk",
  description:
    "Error tracking for Paperclip. See your most frequent app errors from Sentry, hand any of them to an agent as a Paperclip task with the stack trace attached, or let an agent triage the whole list.",
  author: "ozgurlg",
  categories: ["ui", "automation"],
  capabilities: [
    "companies.read",
    "projects.read",
    "issues.read",
    "issues.create",
    "plugin.state.read",
    "plugin.state.write",
    "jobs.schedule",
    "http.outbound",
    "secrets.read-ref",
    "agent.tools.register",
    "instance.settings.register",
    "ui.page.register",
    "ui.sidebar.register",
    "ui.dashboardWidget.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  // Paperclip stores this schema as Postgres jsonb, which orders keys by
  // length, then alphabetically. The form follows that order, so the key
  // names are chosen to read top to bottom: org, url, token, refreshMinutes.
  // Project and environment choices will come as pick lists on a custom
  // settings page (see ROADMAP.md), not as free-text fields.
  instanceConfigSchema: {
    type: "object",
    properties: {
      org: {
        type: "string",
        title: "Organization slug",
        description: "The slug in your Sentry URL, e.g. acme in acme.sentry.io or sentry.io/organizations/acme/.",
      },
      url: {
        type: "string",
        title: "Sentry URL",
        description: "https://sentry.io (US), https://de.sentry.io (EU), or the address of your self-hosted Sentry.",
        default: DEFAULTS.baseUrl,
      },
      token: {
        // The secret picker sends a structured binding; a plain string means pasted text.
        type: ["string", "object"],
        format: "secret-ref",
        title: "Auth token",
        description:
          "A Sentry token with the event:read scope, stored as a Paperclip secret. In Sentry: Settings → Developer Settings → Custom Integrations → New Internal Integration, Issue & Event: Read.",
      },
      refreshMinutes: {
        type: "number",
        title: "Refresh interval (minutes)",
        description: "How often errors are fetched in the background. At least 5.",
        default: DEFAULTS.pollIntervalMinutes,
        minimum: 5,
      },
    },
    required: ["org"],
  },
  jobs: [
    {
      jobKey: JOB_KEYS.sync,
      displayName: "Sync errors",
      description: "Fetches the most frequent unresolved errors from the error tracker.",
      schedule: "*/5 * * * *",
    },
  ],
  tools: [
    {
      name: TOOL_NAMES.listErrors,
      displayName: "List app errors",
      description:
        "Lists the most frequent unresolved errors from the connected error tracker, with event and user counts and any linked Paperclip task.",
      parametersSchema: {
        type: "object",
        properties: { period: { type: "string", enum: [...PERIODS] } },
      },
    },
    {
      name: TOOL_NAMES.getError,
      displayName: "Get app error",
      description:
        "Returns one error with its exception, release, device and the innermost stack frames, as an untrusted data block.",
      parametersSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Error id from list-errors." } },
        required: ["id"],
      },
    },
    {
      name: TOOL_NAMES.createErrorTask,
      displayName: "Create a fix task for app errors",
      description:
        "Creates one Paperclip fix task for one error, or for several errors that share a root cause, and links them to it. The task goes to the project and assignee set in Crashdesk's routing.",
      parametersSchema: {
        type: "object",
        properties: {
          ids: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 10,
            description: "Error ids from list-errors. The first one is the main error; the rest share its root cause.",
          },
          parentTaskId: { type: "string", description: "Id of the triage task this fix belongs to, if any." },
        },
        required: ["ids"],
      },
    },
  ],
  ui: {
    slots: [
      {
        type: "page",
        id: SLOT_IDS.page,
        displayName: "Crashdesk",
        exportName: EXPORT_NAMES.page,
        routePath: PAGE_ROUTE,
      },
      {
        type: "sidebar",
        id: SLOT_IDS.sidebar,
        displayName: "Crashdesk",
        exportName: EXPORT_NAMES.sidebar,
      },
      {
        type: "dashboardWidget",
        id: SLOT_IDS.dashboardWidget,
        displayName: "App Errors",
        exportName: EXPORT_NAMES.dashboardWidget,
      },
    ],
  },
};

export default manifest;
