// Which Paperclip project an error belongs to, and who gets it by default.
//
// Sentry knows each error's Sentry project (from the DSN the app sends with).
// Nothing links a Sentry project to a Paperclip project, so the operator does
// it once in the Projects panel of the errors page, saved per company. One
// default assignee for the whole company sits in the same panel: most teams
// have one agent who fixes app errors.
//
// Until a Sentry project has been mapped, a Paperclip project with the same
// name is offered as a suggestion: exact match after ignoring case and
// separators, never a guess, and two candidates means no suggestion.

export interface NamedProject {
  id: string;
  name: string;
}

/** Saved choices: Sentry project slug → Paperclip project id, or "" for "no project". */
export type ProjectMap = Record<string, string>;

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

/**
 * A saved mapping wins, including a saved "no project". A mapping to a project
 * that no longer exists counts as unmapped, so the name suggestion applies again.
 */
export function resolveProject(
  errorProject: { slug: string; name: string },
  map: ProjectMap,
  projects: NamedProject[],
): { project: NamedProject | null; source: ProjectSource | null } {
  if (Object.prototype.hasOwnProperty.call(map, errorProject.slug)) {
    const saved = map[errorProject.slug];
    if (saved === "") return { project: null, source: "mapping" };
    const project = projects.find((p) => p.id === saved);
    if (project) return { project, source: "mapping" };
  }
  const match = matchProject(errorProject, projects);
  return match ? { project: match, source: "name" } : { project: null, source: null };
}

const SLUG = /^[A-Za-z0-9_.-]{1,100}$/;
const ASSIGNEE = /^(agent|user):[A-Za-z0-9_-]{1,64}$/;

/** One stored value; an object with projectId is an older shape of the same thing. */
function readProjectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const projectId = (value as Record<string, unknown>).projectId;
    if (typeof projectId === "string") return projectId;
  }
  return null;
}

/** Stored maps may come from an older version; read them in today's shape. */
export function readProjectMapValue(raw: unknown): ProjectMap {
  const map: ProjectMap = {};
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return map;
  for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
    const projectId = readProjectId(value);
    if (projectId !== null) map[slug] = projectId;
  }
  return map;
}

/** Keeps only well-formed entries that point at an existing project (or ""). */
export function cleanProjectMap(raw: unknown, projects: NamedProject[]): ProjectMap {
  const ids = new Set(projects.map((p) => p.id));
  const clean: ProjectMap = {};
  for (const [slug, projectId] of Object.entries(readProjectMapValue(raw))) {
    if (!SLUG.test(slug)) continue;
    if (projectId === "" || ids.has(projectId)) clean[slug] = projectId;
  }
  return clean;
}

/** The company default assignee in the host picker's encoding, or "" when unset or malformed. */
export function cleanAssignee(value: unknown): string {
  return typeof value === "string" && ASSIGNEE.test(value) ? value : "";
}

/** Splits the picker encoding into the ids the issues API takes. */
export function assigneeIds(assignee: string): { assigneeAgentId?: string; assigneeUserId?: string } {
  if (!ASSIGNEE.test(assignee)) return {};
  const [kind, id] = assignee.split(":") as [string, string];
  return kind === "agent" ? { assigneeAgentId: id } : { assigneeUserId: id };
}

/**
 * Earlier versions saved an assignee per project. When there is no company
 * default yet, adopt the one they all agree on.
 */
export function legacyCommonAssignee(raw: unknown): string {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return "";
  const found = new Set<string>();
  for (const value of Object.values(raw as Record<string, unknown>)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const assignee = cleanAssignee((value as Record<string, unknown>).assignee);
      if (assignee) found.add(assignee);
    }
  }
  return found.size === 1 ? [...found][0]! : "";
}
