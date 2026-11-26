// The one place that knows which error trackers exist. The worker, UI and
// agent tools only see the provider-neutral shapes in types.ts, so adding a
// tracker means: write providers/<name>.ts, then add it here.

import { createSentryProvider, type FetchLike } from "./sentry.ts";
import type { ErrorProvider } from "./types.ts";

export interface ProviderConnection {
  baseUrl: string;
  organization: string;
  token: string;
  fetch: FetchLike;
}

export const PROVIDER_KINDS = ["sentry"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/** The tracker used when the settings name none. */
export const DEFAULT_PROVIDER: ProviderKind = "sentry";

export function createProvider(kind: ProviderKind, connection: ProviderConnection): ErrorProvider {
  switch (kind) {
    case "sentry":
      return createSentryProvider({
        ...connection,
        // Every project and environment the token can see.
        projects: [],
        environment: null,
      });
  }
}
