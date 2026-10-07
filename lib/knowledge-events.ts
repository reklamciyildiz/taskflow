export const KNOWLEDGE_SOURCES_CHANGED_EVENT = 'taskflow:knowledge-sources-changed';

export function notifyKnowledgeSourcesChanged(teamId?: string | null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(KNOWLEDGE_SOURCES_CHANGED_EVENT, {
      detail: { teamId: teamId ?? null },
    }),
  );
}
