export type ActionPanelTabOrder = 'checklist_first' | 'notes_first';

export type UserWorkspacePreferences = {
  actionPanelTabOrder: ActionPanelTabOrder;
  processOrderByTeam: Record<string, string[]>;
};

export const DEFAULT_USER_WORKSPACE_PREFERENCES: UserWorkspacePreferences = {
  actionPanelTabOrder: 'checklist_first',
  processOrderByTeam: {},
};

export function reconcileProcessOrder<T extends { id: string }>(
  projects: readonly T[],
  preferredIds: readonly string[] | undefined,
): T[] {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const ordered: T[] = [];
  const seen = new Set<string>();
  for (const id of preferredIds ?? []) {
    const project = byId.get(id);
    if (project && !seen.has(id)) {
      ordered.push(project);
      seen.add(id);
    }
  }
  for (const project of projects) {
    if (!seen.has(project.id)) ordered.push(project);
  }
  return ordered;
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to)
    return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
