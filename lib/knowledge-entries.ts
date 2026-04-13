import { ACTION_CHECKLIST_QUICK_ROW_ID } from '@/lib/action-checklist';
import type { Task, Team } from '@/lib/types';
import { format, isValid, parseISO } from 'date-fns';

/** Knowledge card source: `Task.learnings` summary or `journalLogs` note/checklist rows. */
export type KnowledgeEntryType = 'learnings' | 'action_notes';

/** @deprecated Use KnowledgeHubCard for masonry hub; kept for pin id migration. */
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

export interface KnowledgeHubCard {
  id: string;
  taskId: string;
  taskTitle: string;
  sortDate: Date;
  projectId: string | null;
  projectName: string | null;
  teamId: string;
  teamName: string;
  checklistItems: { id: string; text: string; done: boolean }[];
  learningsPreview: string | null;
}

/** Map legacy pin ids (per-line) to stable card id `card-<taskId>`. */
export function normalizeKnowledgePinId(id: string): string {
  if (id.startsWith('card-')) return id;
  const learning = /^learning-(.+)$/.exec(id);
  if (learning) return `card-${learning[1]}`;
  const journal = /^journal-([^-]+)-/.exec(id);
  if (journal) return `card-${journal[1]}`;
  return id;
}

export function buildKnowledgeHubCards(
  tasks: Task[],
  projectNameById: Map<string, string>,
  teamNameById: Map<string, string>
): KnowledgeHubCard[] {
  const out: KnowledgeHubCard[] = [];

  for (const task of tasks) {
    const teamName = teamNameById.get(task.teamId) ?? 'Team';
    const projectName = task.projectId ? projectNameById.get(task.projectId) ?? null : null;

    const checklistItems = (task.journalLogs ?? [])
      .filter((l) => l.id !== ACTION_CHECKLIST_QUICK_ROW_ID && l.text?.trim())
      .map((l) => ({
        id: l.id,
        text: l.text.trim(),
        done: l.done === true,
      }));

    const learningsPreview = task.learnings?.trim() ? task.learnings.trim() : null;

    if (checklistItems.length === 0 && !learningsPreview) continue;

    const dates: Date[] = [task.updatedAt];
    for (const log of task.journalLogs ?? []) {
      const primary = log.updatedAt ? parseISO(log.updatedAt) : parseISO(log.createdAt);
      if (isValid(primary)) dates.push(primary);
    }
    const sortDate = new Date(Math.max(...dates.map((d) => d.getTime())));

    out.push({
      id: `card-${task.id}`,
      taskId: task.id,
      taskTitle: task.title,
      sortDate,
      projectId: task.projectId ?? null,
      projectName,
      teamId: task.teamId,
      teamName,
      checklistItems,
      learningsPreview,
    });
  }

  return out.sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
}

/** Legacy builder for backward-compatible exports / migrations. */
export function buildKnowledgeEntries(
  tasks: Task[],
  projectNameById: Map<string, string>,
  teamNameById: Map<string, string>
): KnowledgeHubEntry[] {
  const cards = buildKnowledgeHubCards(tasks, projectNameById, teamNameById);
  const out: KnowledgeHubEntry[] = [];
  for (const c of cards) {
    if (c.learningsPreview) {
      out.push({
        id: `learning-${c.taskId}`,
        type: 'learnings',
        text: c.learningsPreview,
        sortDate: c.sortDate,
        taskId: c.taskId,
        taskTitle: c.taskTitle,
        projectId: c.projectId,
        projectName: c.projectName,
        teamId: c.teamId,
        teamName: c.teamName,
      });
    }
    for (const item of c.checklistItems) {
      out.push({
        id: `journal-${c.taskId}-${item.id}`,
        type: 'action_notes',
        text: item.text,
        sortDate: c.sortDate,
        taskId: c.taskId,
        taskTitle: c.taskTitle,
        projectId: c.projectId,
        projectName: c.projectName,
        teamId: c.teamId,
        teamName: c.teamName,
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
