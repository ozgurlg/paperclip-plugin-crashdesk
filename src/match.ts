// Which Paperclip project (and default assignee) an error belongs to.
//
// Sentry knows each error's Sentry project (from the DSN the app sends with).
// Nothing links a Sentry project to a Paperclip project, so the operator does
// it once in the Projects panel of the errors page and it is saved per
// company, together with a default assignee for that project's errors.
// Until a Sentry project has been mapped, a Paperclip project with the same
// name is offered as a suggestion: exact match after ignoring case and
// separators, never a guess, and two candidates means no suggestion.

export interface NamedProject {
  id: string;
  name: string;
}

export interface MappingEntry {
  /** Paperclip project id, or "" for "no project". */
  projectId: string;
  /** Default assignee in the host picker's encoding: "agent:<id>", "user:<id>" or "". */
  assignee: string;
}

/** Saved choices, keyed by Sentry project slug. */
export type ProjectMap = Record<string, MappingEntry>;

export type ProjectSource = "mapping" | "name";

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

/** Reads one stored entry; an older plain string meant "project only". */
function readEntry(value: unknown): MappingEntry | null {
  if (typeof value === "string") return { projectId: value, assignee: "" };
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.projectId !== "string") return null;
  return { projectId: v.projectId, assignee: typeof v.assignee === "string" ? v.assignee : "" };
}

/** Keeps only well-formed entries that point at an existing project (or "") and a well-formed assignee. */
export function cleanProjectMap(raw: unknown, projects: NamedProject[]): ProjectMap {
  const ids = new Set(projects.map((p) => p.id));
  const clean: ProjectMap = {};
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return clean;
  for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = readEntry(value);
    if (!SLUG.test(slug) || !entry) continue;
    if (entry.projectId !== "" && !ids.has(entry.projectId)) continue;
    clean[slug] = { projectId: entry.projectId, assignee: ASSIGNEE.test(entry.assignee) ? entry.assignee : "" };
  }
  return clean;
}

/** Stored maps may predate the assignee field; read them in today's shape. */
export function readProjectMapValue(raw: unknown): ProjectMap {
  const map: ProjectMap = {};
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return map;
  for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = readEntry(value);
    if (entry) map[slug] = entry;
  }
  return map;
}

export interface Resolved {
  project: NamedProject | null;
  source: ProjectSource | null;
  /** Default assignee from the mapping ("" when none). */
  assignee: string;
}

/**
 * A saved mapping wins, including a saved "no project". A mapping to a project
 * that no longer exists counts as unmapped, so the name suggestion applies again.
 */
export function resolveProject(
  errorProject: { slug: string; name: string },
  map: ProjectMap,
  projects: NamedProject[],
): Resolved {
  const entry = Object.prototype.hasOwnProperty.call(map, errorProject.slug) ? map[errorProject.slug] : undefined;
  const assignee = entry?.assignee ?? "";
  if (entry) {
    if (entry.projectId === "") return { project: null, source: "mapping", assignee };
    const project = projects.find((p) => p.id === entry.projectId);
    if (project) return { project, source: "mapping", assignee };
  }
  const match = matchProject(errorProject, projects);
  return match ? { project: match, source: "name", assignee } : { project: null, source: null, assignee };
}

/** Splits the picker encoding into the ids the issues API takes. */
export function assigneeIds(assignee: string): { assigneeAgentId?: string; assigneeUserId?: string } {
  if (!ASSIGNEE.test(assignee)) return {};
  const [kind, id] = assignee.split(":") as [string, string];
  return kind === "agent" ? { assigneeAgentId: id } : { assigneeUserId: id };
}
