export const PLUGIN_ID = "ozgurlg.crashdesk";
export const PLUGIN_VERSION = "0.1.0";
export const PAGE_ROUTE = "crashdesk";
/** Company settings page: /<company>/company/settings/crashdesk-projects */
export const SETTINGS_ROUTE = "crashdesk-projects";

/** Every task this plugin creates carries this origin, so the link survives restarts. */
export const ORIGIN_KIND = `plugin:${PLUGIN_ID}:error` as const;

export const SLOT_IDS = {
  page: "crashdesk-page",
  sidebar: "crashdesk-sidebar",
  dashboardWidget: "crashdesk-dashboard-widget",
  projectSettings: "crashdesk-project-settings",
} as const;

export const EXPORT_NAMES = {
  page: "CrashdeskPage",
  sidebar: "CrashdeskSidebarLink",
  dashboardWidget: "CrashdeskDashboardWidget",
  projectSettings: "CrashdeskProjectSettings",
} as const;

export const JOB_KEYS = {
  sync: "sync-errors",
} as const;

export const TOOL_NAMES = {
  listErrors: "list-errors",
  getError: "get-error",
} as const;

export const DATA_KEYS = {
  overview: "overview",
  projectMap: "project-map",
} as const;

export const ACTION_KEYS = {
  refresh: "refresh",
  createTask: "create-task",
  saveProjectMap: "save-project-map",
} as const;

export const PERIODS = ["24h", "7d", "14d"] as const;
export type Period = (typeof PERIODS)[number];

export const DEFAULTS = {
  baseUrl: "https://sentry.io",
  pollIntervalMinutes: 10,
  issueLimit: 25,
} as const;
