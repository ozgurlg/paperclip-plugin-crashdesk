import type { EnvSecretRefBinding, PluginContext } from "@paperclipai/plugin-sdk";
import { DEFAULTS } from "./constants.ts";

export interface CrashdeskConfig {
  sentryUrl: string;
  organization: string;
  authToken: string | EnvSecretRefBinding | null;
  projects: string[];
  environment: string | null;
  pollIntervalMinutes: number;
}

/** Settings keys, as declared in the manifest. */
export const CONFIG_KEYS = {
  organization: "org",
  url: "url",
  token: "token",
  projects: "projects",
  environment: "environment",
} as const;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Accepts an array or a comma/space separated string, so either form works in the settings form. */
export function parseProjects(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\s]+/) : [];
  return [...new Set(items.map(text).filter((slug) => slug.length > 0))];
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
    projects: parseProjects(raw[CONFIG_KEYS.projects]),
    environment: text(raw[CONFIG_KEYS.environment]) || null,
    // Not a setting: every 10 minutes is right for nearly everyone.
    pollIntervalMinutes: DEFAULTS.pollIntervalMinutes,
  };
}

export async function readConfig(ctx: PluginContext): Promise<CrashdeskConfig> {
  return parseConfig((await ctx.config.get()) ?? {});
}
