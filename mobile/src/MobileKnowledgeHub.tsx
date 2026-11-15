import { useCallback } from 'react';
import {T,useAppLocale} from '../../components/i18n/AppLocaleProvider';
import { KnowledgeHubViewContent, type KnowledgeHubRuntime } from '../../components/KnowledgeHubView';
import { usePlannerRuntime } from '../../components/planner/PlannerRuntime';
import { PlannerTeamSwitcher } from '../../components/planner/PlannerTeamSwitcher';
import type { Note } from '../../lib/types';
import { authenticatedRequest } from './mobile-api';

export function MobileKnowledgeHub({
  onOpenAction,
  onOpenAI,
  onOpenBoard,
}: {
  onOpenAction: (taskId: string, checklistItemId?: string | null) => void;
  onOpenAI: () => void;
  onOpenBoard: () => void;
}) {
  const {t}=useAppLocale();
  const planner = usePlannerRuntime();
  const loadNotes = useCallback(async (teamId: string, limit?: number) => {
    const params = new URLSearchParams({ teamId });
    if (limit !== undefined) params.set('limit', String(limit));
    try {
      const data = await authenticatedRequest<Note[]>(`/api/knowledge?${params}`);
      return { success: true as const, data };
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : t('Could not load notes.'),
      };
    }
  }, [t]);

  const runtime: KnowledgeHubRuntime = {
    tasks: planner.tasks,
    projects: planner.projects,
    teams: planner.teams,
    currentTeam: planner.currentTeam,
    loading: planner.loading,
    openTaskEditor: onOpenAction,
    updateTask: planner.updateTask,
    canEditTask: planner.canEditTask,
    navigate: (path) => path.startsWith('/ai') ? onOpenAI() : onOpenBoard(),
    loadNotes,
  };

  return (
    <section className="workspace mobile-product-view mobile-knowledge-view" aria-label={t("Knowledge Hub")}>
      <div className="mobile-workspace-toolbar">
        <PlannerTeamSwitcher />
      </div>
      {planner.currentTeam ? (
        <KnowledgeHubViewContent runtime={runtime} />
      ) : (
        <div className="planner-v2-section flex min-h-44 items-center justify-center px-6 text-center">
          <div className="max-w-md">
            <h2 className="text-base font-semibold"><T text="Choose a workspace"/></h2>
            <p className="mt-1.5 text-sm text-muted-foreground"><T text="Select a workspace above to load its Knowledge Hub."/></p>
          </div>
        </div>
      )}
    </section>
  );
}
