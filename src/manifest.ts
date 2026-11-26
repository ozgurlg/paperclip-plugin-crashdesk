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
    "Error tracking for Paperclip. See your most frequent Sentry errors and hand any of them to an agent as a Paperclip task, with the stack trace attached.",
  author: "ozgurlg",
  categories: ["ui", "automation"],
  capabilities: [
    "companies.read",
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
  instanceConfigSchema: {
    type: "object",
    properties: {
      sentryUrl: {
        type: "string",
        title: "Sentry URL",
        description:
          "https://sentry.io for the US region, https://de.sentry.io for the EU region, or the address of your self-hosted Sentry.",
        default: DEFAULTS.baseUrl,
      },
      organization: {
        type: "string",
        title: "Organization slug",
        description: "The slug in your Sentry URL, e.g. acme in sentry.io/organizations/acme/.",
      },
      authToken: {
        // The secret picker sends a structured binding; a plain string means pasted text.
        type: ["string", "object"],
        format: "secret-ref",
        title: "Sentry auth token",
        description:
          "A token with the event:read scope, stored as a Paperclip secret. In Sentry: Settings → Developer Settings → Custom Integrations → New Internal Integration, set Issue & Event to Read.",
      },
      projects: {
        type: "string",
        title: "Projects (optional)",
        description: "Comma-separated project slugs to include. Leave empty for every project the token can see.",
      },
      environment: {
        type: "string",
        title: "Environment (optional)",
        description: "Only show errors from this environment, e.g. production.",
      },
      pollIntervalMinutes: {
        type: "number",
        title: "Refresh interval (minutes)",
        description: "How often errors are fetched in the background.",
        default: DEFAULTS.pollIntervalMinutes,
        minimum: 1,
      },
    },
    required: ["organization"],
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
