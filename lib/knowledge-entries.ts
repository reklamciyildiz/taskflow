import type { Task, Team } from '@/lib/types';
import { format, isValid, parseISO } from 'date-fns';

export type KnowledgeEntryType = 'learning' | 'journal';

export interface KnowledgeHubEntry {
  id: string;
  type: KnowledgeEntryType;
  text: string;
  sortDate: Date;
  taskId: string;
  taskTitle: string;
  projectId: string | null;
  projectName: string | null;
  teamId: string;
  teamName: string;
}

export function buildKnowledgeEntries(
  tasks: Task[],
  projectNameById: Map<string, string>,
  teamNameById: Map<string, string>
): KnowledgeHubEntry[] {
  const out: KnowledgeHubEntry[] = [];

  for (const task of tasks) {
    const teamName = teamNameById.get(task.teamId) ?? 'Team';
    const projectName = task.projectId
      ? projectNameById.get(task.projectId) ?? null
      : null;

    if (task.learnings?.trim()) {
      out.push({
        id: `learning-${task.id}`,
        type: 'learning',
        text: task.learnings.trim(),
        sortDate: task.updatedAt,
        taskId: task.id,
        taskTitle: task.title,
        projectId: task.projectId ?? null,
        projectName,
        teamId: task.teamId,
        teamName,
      });
    }

    for (const log of task.journalLogs ?? []) {
      if (!log.text?.trim()) continue;
      const primary = log.updatedAt ? parseISO(log.updatedAt) : parseISO(log.createdAt);
      const d = isValid(primary) ? primary : parseISO(log.createdAt);
      out.push({
        id: `journal-${task.id}-${log.id}`,
        type: 'journal',
        text: log.text.trim(),
        sortDate: isValid(d) ? d : task.updatedAt,
        taskId: task.id,
        taskTitle: task.title,
        projectId: task.projectId ?? null,
        projectName,
        teamId: task.teamId,
        teamName,
      });
    }
  }

  return out.sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
}

export function formatKnowledgeEntryDate(d: Date): string {
  try {
    return format(d, 'd MMM yyyy, HH:mm');
  } catch {
    return '';
  }
}

export function knowledgeMapsFromContext(
  projects: { id: string; name: string }[],
  teams: Team[]
): {
  projectNameById: Map<string, string>;
  teamNameById: Map<string, string>;
} {
  return {
    projectNameById: new Map(projects.map((p) => [p.id, p.name] as const)),
    teamNameById: new Map(teams.map((t) => [t.id, t.name] as const)),
  };
}
