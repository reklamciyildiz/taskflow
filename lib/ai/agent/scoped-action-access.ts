/**
 * Canonical access predicate for read-only AI Action projections.
 *
 * When a visible Process has a Team, its own Team governs its Actions.
 * Some migrated Actions have stale/null team_id; filtering those before
 * checking their Process silently reported zero results. General Actions
 * and Team-less Processes must remain scoped by the Action's actual Team.
 */
export type ScopedProcess = { id: string; team_id?: string | null };

export type ScopedAction = {
  project_id?: string | null;
  team_id?: string | null;
};

export function canReadScopedAction(
  action: ScopedAction,
  allowedTeams: ReadonlySet<string>,
  visibleProcesses: ReadonlyMap<string, ScopedProcess>,
): boolean {
  const processId = action.project_id ? String(action.project_id) : null;
  if (processId) {
    const process = visibleProcesses.get(processId);
    if (!process) return false;
    return process.team_id
      ? allowedTeams.has(String(process.team_id))
      : Boolean(action.team_id && allowedTeams.has(String(action.team_id)));
  }
  return Boolean(action.team_id && allowedTeams.has(String(action.team_id)));
}

export function selectRequestedActionCount(query: string, fallback = 10): number {
  const normalized = query.toLocaleLowerCase('tr-TR').replace(/\u0131/g,'i');
  const word = normalized.match(/\b(?:first|top|last|latest|son|ilk|en son)?\s*(\d{1,2})\s+(?:actions?\w*|aksiyon\w*|gorev\w*|görev\w*|tasks?\w*)\b/u);
  if (word) return Math.min(50, Math.max(1, Number(word[1])));
  const wordCount = /\b(?:five|bes|beş)\b/u.test(normalized) ? 5
    : /\b(?:three|uc|üç)\b/u.test(normalized) ? 3
    : /\b(?:ten|on)\b/u.test(normalized) ? 10 : null;
  if (wordCount && /\b(?:actions?|aksiyon\w*|tasks?|gorev\w*|görev\w*)\b/u.test(normalized)) return wordCount;
  return fallback;
}
