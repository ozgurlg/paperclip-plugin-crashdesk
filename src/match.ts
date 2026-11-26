// Picks the Paperclip project an error most likely belongs to, by name.
//
// Sentry project "evergate" and Paperclip project "Evergate" are the same
// app, so Create task can start with that project selected. Only exact
// matches after normalising case and separators count; no guessing, and two
// candidates means no match. Explicit mapping comes with the v0.2 settings page.

export interface NamedProject {
  id: string;
  name: string;
}

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
