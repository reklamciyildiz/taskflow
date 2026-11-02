'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTaskContext } from '@/components/TaskContext';
import { KnowledgeHubWorkspace } from '@/components/knowledge/KnowledgeHubWorkspace';
import { useKnowledgeRetrieval } from '@/hooks/useKnowledgeRetrieval';
import type { ApiResponse, Note, Project, Task, TaskUpdateFields, Team } from '@/lib/types';
export type { KnowledgeHubCard } from '@/lib/knowledge-retrieval';

export type KnowledgeHubRuntime = {
  tasks: Task[];
  projects: Project[];
  teams: Team[];
  currentTeam: Team | null;
  loading: boolean;
  openTaskEditor: (taskId: string, checklistItemId?: string | null) => void;
  updateTask: (taskId: string, updates: TaskUpdateFields) => Promise<boolean>;
  canEditTask: (creatorId?: string | null, assigneeId?: string | null) => boolean;
  navigate: (path: string) => void;
  loadNotes?: (teamId: string, limit?: number) => Promise<ApiResponse<Note[]>>;
};

/** Web and Capacitor share one curated, accessible knowledge workspace.
 * The canonical notes/checklists and their permissions remain in existing APIs.
 */
export function KnowledgeHubViewContent({ runtime }: { runtime: KnowledgeHubRuntime }) {
  const { tasks, projects, teams, currentTeam, loading, openTaskEditor, updateTask, canEditTask, navigate, loadNotes } = runtime;

  const tasksScoped = useMemo(
    () => currentTeam ? tasks.filter((task) => task.teamId === currentTeam.id) : tasks,
    [tasks, currentTeam],
  );
  const projectsScoped = useMemo(
    () => currentTeam ? projects.filter((project) => !project.teamId || project.teamId === currentTeam.id) : projects,
    [projects, currentTeam],
  );
  const { cards, notesLoading, notesError, retryNotes } = useKnowledgeRetrieval({
    tasks: tasksScoped,
    projects: projectsScoped,
    teams,
    teamId: currentTeam?.id ?? null,
    loadNotes,
  });

  return (
    <KnowledgeHubWorkspace
      cards={cards}
      tasks={tasksScoped}
      projects={projectsScoped}
      teamId={currentTeam?.id ?? null}
      loading={loading}
      notesLoading={notesLoading}
      notesError={notesError}
      retryNotes={retryNotes}
      openTaskEditor={openTaskEditor}
      updateTask={updateTask}
      canEditTask={canEditTask}
      navigate={navigate}
    />
  );
}

export function KnowledgeHubView() {
  const router = useRouter();
  const context = useTaskContext();
  return (
    <KnowledgeHubViewContent
      runtime={{
        tasks: context.tasks,
        projects: context.projects,
        teams: context.teams,
        currentTeam: context.currentTeam,
        loading: context.loading,
        openTaskEditor: context.openTaskEditor,
        updateTask: context.updateTask,
        canEditTask: context.canEditTask,
        navigate: (path) => router.push(path),
      }}
    />
  );
}
