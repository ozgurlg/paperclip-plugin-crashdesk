// Which Paperclip project an error belongs to.
//
// Sentry knows each error's Sentry project (from the DSN the app sends with).
// Nothing links a Sentry project to a Paperclip project, so the operator does
// it once on the "Crashdesk projects" settings page and it is saved per
// company. Until a Sentry project has been mapped, a Paperclip project with
// the same name is offered as a suggestion: exact match after ignoring case
// and separators, never a guess, and two candidates means no suggestion.

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

/** Keeps only well-formed entries that point at an existing project (or ""). */
export function cleanProjectMap(raw: unknown, projects: NamedProject[]): ProjectMap {
  const ids = new Set(projects.map((p) => p.id));
  const clean: ProjectMap = {};
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return clean;
  for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!SLUG.test(slug) || typeof value !== "string") continue;
    if (value === "" || ids.has(value)) clean[slug] = value;
  }
  return clean;
}
