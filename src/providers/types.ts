// Provider-neutral shapes. Every error tracker (Sentry today, others later)
// maps its API onto these, so the worker, UI and agent tools never see a
// provider's raw payload.

export type ErrorLevel = "fatal" | "error" | "warning" | "info" | "debug";

export interface ErrorProject {
  id: string;
  slug: string;
  name: string;
  /** The project's platform as the tracker reports it, e.g. "react-native", "node"; "" when unknown. */
  platform: string;
}

export interface ErrorIssue {
  /** Provider's issue id, unique within the provider. */
  id: string;
  /** Human-readable id, e.g. "SHOP-APP-1A". */
  shortId: string;
  title: string;
  /** Where it happened, e.g. "screens/CartList.tsx in renderCartItem". */
  culprit: string;
  level: ErrorLevel;
  project: ErrorProject;
  /** Events in the selected period. */
  events: number;
  /** Distinct users affected in the selected period. */
  users: number;
  firstSeen: string;
  lastSeen: string;
  /** First seen inside the selected period. */
  isNew: boolean;
  /** Came back after being resolved. */
  isRegression: boolean;
  /** Link to the issue in the provider's own UI. */
  url: string;
  /** Event counts, oldest bucket first, for a sparkline. */
  trend: number[];
}

export interface StackFrame {
  file: string;
  fn: string;
  line: number | null;
  inApp: boolean;
}

export interface ErrorIssueDetail {
  issue: ErrorIssue;
  exceptionType: string | null;
  exceptionValue: string | null;
  /** Innermost frame first. */
  frames: StackFrame[];
  release: string | null;
  environment: string | null;
  os: string | null;
  device: string | null;
}

export interface ListOptions {
  period: "24h" | "7d" | "14d";
  limit: number;
}

export interface ErrorProvider {
  readonly id: string;
  readonly displayName: string;
  listIssues(options: ListOptions): Promise<ErrorIssue[]>;
  getIssue(issueId: string, period: ListOptions["period"]): Promise<ErrorIssueDetail>;
  /**
   * Marks the issue as fixed in the tracker. Where the tracker knows releases,
   * "fixed in the next release", so events from older versions do not reopen it.
   * Absent on trackers that cannot be written to.
   */
  resolveIssue?(issueId: string): Promise<void>;
}

/** An error whose message is safe to show to the operator as-is. */
export class ProviderError extends Error {
  readonly kind: "auth" | "not-found" | "rate-limit" | "network" | "unexpected";

  constructor(message: string, kind: ProviderError["kind"]) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
  }
}
