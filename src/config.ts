import type { EnvSecretRefBinding, PluginContext } from "@paperclipai/plugin-sdk";
import { DEFAULTS } from "./constants.ts";

export interface CrashdeskConfig {
  sentryUrl: string;
  organization: string;
  authToken: string | EnvSecretRefBinding | null;
  pollIntervalMinutes: number;
}

/** Settings keys, as declared in the manifest. */
export const CONFIG_KEYS = {
  organization: "org",
  url: "url",
  token: "token",
  refreshMinutes: "refreshMinutes",
} as const;

const MIN_REFRESH_MINUTES = 5; // the sync job runs every 5 minutes

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseConfig(raw: Record<string, unknown>): CrashdeskConfig {
  const token = raw[CONFIG_KEYS.token];
  return {
    sentryUrl: text(raw[CONFIG_KEYS.url]) || DEFAULTS.baseUrl,
    organization: text(raw[CONFIG_KEYS.organization]),
    authToken:
      typeof token === "string" || (token !== null && typeof token === "object")
        ? (token as string | EnvSecretRefBinding)
        : null,
    pollIntervalMinutes: refreshMinutes(raw[CONFIG_KEYS.refreshMinutes]),
  };
}

function refreshMinutes(value: unknown): number {
  const n = Number(value);
  if (value === undefined || value === null || value === "" || !Number.isFinite(n)) return DEFAULTS.pollIntervalMinutes;
  return Math.min(Math.max(Math.round(n), MIN_REFRESH_MINUTES), 1440);
}

/** Settings are per company in Paperclip; the host refuses config.get without one. */
export async function readConfig(ctx: PluginContext, companyId: string): Promise<CrashdeskConfig> {
  return parseConfig((await ctx.config.get(companyId)) ?? {});
}
