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

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Accepts an array or a comma/space separated string, so either form works in the settings form. */
export function parseProjects(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\s]+/) : [];
  return [...new Set(items.map(text).filter((slug) => slug.length > 0))];
}

export function parseConfig(raw: Record<string, unknown>): CrashdeskConfig {
  const interval = Number(raw.pollIntervalMinutes);
  const token = raw.authToken;
  return {
    sentryUrl: text(raw.sentryUrl) || DEFAULTS.baseUrl,
    organization: text(raw.organization),
    authToken:
      typeof token === "string" || (token !== null && typeof token === "object")
        ? (token as string | EnvSecretRefBinding)
        : null,
    projects: parseProjects(raw.projects),
    environment: text(raw.environment) || null,
    pollIntervalMinutes:
      Number.isFinite(interval) && interval >= 1 ? Math.min(Math.round(interval), 1440) : DEFAULTS.pollIntervalMinutes,
  };
}

export async function readConfig(ctx: PluginContext): Promise<CrashdeskConfig> {
  return parseConfig((await ctx.config.get()) ?? {});
}
