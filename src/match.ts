// Where an error's task goes: which Paperclip project, and which assignee.
//
// Who fixes an error depends on which code broke, and in Sentry each project
// is one codebase (an app, an API...). So the Projects panel holds one row per
// Sentry project: the Paperclip project its tasks belong to and the agent who
// fixes that code. A company-wide fallback assignee covers rows without their
// own, so a team with one kind of code only picks it once.
//
// Nothing links a Sentry project to a Paperclip project, so until a row is
// saved, a Paperclip project with the same name is offered as a suggestion:
// exact match after ignoring case and separators, never a guess, and two
// candidates means no suggestion.

export interface NamedProject {
  id: string;
  name: string;
}

export interface MappingEntry {
  /** Paperclip project id, or "" for "no project". */
  projectId: string;
  /** This project's assignee in the host picker encoding ("agent:<id>", "user:<id>"), or "" to use the fallback. */
  assignee: string;
}

/** Saved rows, keyed by Sentry project slug. */
export type ProjectMap = Record<string, MappingEntry>;

export type ProjectSource = "mapping" | "name";
export type AssigneeSource = "project" | "fallback";

export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function matchProject(
  errorProject: { slug: string; name: string },
  projects: NamedProject[],
): NamedProject | null {
  const keys = new Set([normalizeName(errorProject.slug), normalizeName(errorProject.name)].filter(Boolean));
  if (keys.size === 0) return null;
  const hits = projects.filter((p) => keys.has(normalizeName(p.name)));
  return hits.length === 1 ? hits[0]! : null;
}

const SLUG = /^[A-Za-z0-9_.-]{1,100}$/;
const ASSIGNEE = /^(agent|user):[A-Za-z0-9_-]{1,64}$/;

/** An assignee in the picker encoding, or "" when unset or malformed. */
export function cleanAssignee(value: unknown): string {
  return typeof value === "string" && ASSIGNEE.test(value) ? value : "";
}

/** One stored row; a plain string is an older "project only" row. */
function readEntry(value: unknown): MappingEntry | null {
  if (typeof value === "string") return { projectId: value, assignee: "" };
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.projectId !== "string") return null;
  return { projectId: v.projectId, assignee: cleanAssignee(v.assignee) };
}

/** Stored maps may come from an older version; read them in today's shape. */
export function readProjectMapValue(raw: unknown): ProjectMap {
  const map: ProjectMap = {};
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return map;
  for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = readEntry(value);
    if (entry) map[slug] = entry;
  }
  return map;
}

/** Keeps only well-formed rows that point at an existing project (or ""). */
export function cleanProjectMap(raw: unknown, projects: NamedProject[]): ProjectMap {
  const ids = new Set(projects.map((p) => p.id));
  const clean: ProjectMap = {};
  for (const [slug, entry] of Object.entries(readProjectMapValue(raw))) {
    if (!SLUG.test(slug)) continue;
    if (entry.projectId === "" || ids.has(entry.projectId)) clean[slug] = entry;
  }
  return clean;
}

export interface Resolved {
  project: NamedProject | null;
  projectSource: ProjectSource | null;
  /** Effective assignee in the picker encoding, or "" when neither the row nor the fallback has one. */
  assignee: string;
  assigneeSource: AssigneeSource | null;
}

/**
 * A saved row wins, including a saved "no project"; a row pointing at a
 * deleted project counts as unmapped. The row's assignee wins over the fallback.
 */
export function resolveTarget(
  errorProject: { slug: string; name: string },
  map: ProjectMap,
  projects: NamedProject[],
  fallbackAssignee: string,
): Resolved {
  const entry = Object.prototype.hasOwnProperty.call(map, errorProject.slug) ? map[errorProject.slug] : undefined;

  let project: NamedProject | null = null;
  let projectSource: ProjectSource | null = null;
  if (entry && entry.projectId === "") {
    projectSource = "mapping";
  } else if (entry && projects.some((p) => p.id === entry.projectId)) {
    project = projects.find((p) => p.id === entry.projectId)!;
    projectSource = "mapping";
  } else {
    project = matchProject(errorProject, projects);
    projectSource = project ? "name" : null;
  }

  const own = entry?.assignee ?? "";
  const fallback = cleanAssignee(fallbackAssignee);
  const assignee = own || fallback;
  const assigneeSource: AssigneeSource | null = own ? "project" : fallback ? "fallback" : null;
  return { project, projectSource, assignee, assigneeSource };
}

/** Splits the picker encoding into the ids the issues API takes. */
export function assigneeIds(assignee: string): { assigneeAgentId?: string; assigneeUserId?: string } {
  if (!ASSIGNEE.test(assignee)) return {};
  const [kind, id] = assignee.split(":") as [string, string];
  return kind === "agent" ? { assigneeAgentId: id } : { assigneeUserId: id };
}
