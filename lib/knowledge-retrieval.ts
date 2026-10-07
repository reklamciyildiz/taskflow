import { extractTextFromNode } from '@/lib/tiptap-parser';
import type { Note, NoteType, Task, Team } from '@/lib/types';
import { format } from 'date-fns';

export type KnowledgeSourceType = 'action' | 'checklist' | 'note';
export type KnowledgeContentFilter = 'all' | 'notes' | 'checklist';

export interface KnowledgeRetrievalDocument {
  sourceType: KnowledgeSourceType;
  sourceId: string;
  taskId: string;
  noteType?: NoteType;
  organizationId: string;
  teamId: string;
  projectId: string | null;
  authorId: string | null;
  title: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  /** Reserved for an eventual user-curated knowledge signal; never required for retrieval. */
  curatedKnowledge?: boolean;
}

export interface KnowledgeChecklistItem {
  id: string;
  persistedId: string | null;
  text: string;
  done: boolean;
}

export interface KnowledgeNoteSummary {
  id: string;
  title: string;
  text: string;
  type: NoteType;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  curatedKnowledge?: boolean;
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
  checklistItems: KnowledgeChecklistItem[];
  notes: KnowledgeNoteSummary[];
  sources: KnowledgeRetrievalDocument[];
}

export interface KnowledgeMatch {
  sourceType: KnowledgeSourceType;
  sourceId: string;
  noteType?: NoteType;
  label: string;
  snippet: string;
}

export interface KnowledgeSearchResult {
  card: KnowledgeHubCard;
  matches: KnowledgeMatch[];
}

interface KnowledgeMaps {
  projectNameById: Map<string, string>;
  teamNameById: Map<string, string>;
  organizationIdByTeamId: Map<string, string>;
}

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isoDate(value: Date | string | null | undefined, fallback: Date): string {
  const parsed = value instanceof Date ? value : value ? new Date(value) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString();
}

function extractChecklistItems(task: Task): KnowledgeChecklistItem[] {
  const items: KnowledgeChecklistItem[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'taskItem') {
      const text = cleanText(extractTextFromNode({ content: node.content }));
      if (text) {
        const persistedId = typeof node.attrs?.id === 'string' && node.attrs.id
          ? node.attrs.id
          : null;
        items.push({
          id: persistedId ?? `${task.id}-checklist-${items.length}`,
          persistedId,
          text,
          done: node.attrs?.checked === true,
        });
      }
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(task.checklistBlocks);
  return items;
}

function noteLabel(type: NoteType): string {
  if (type === 'learning') return 'Learning';
  if (type === 'idea') return 'Idea';
  if (type === 'decision') return 'Decision';
  return 'Note';
}

function sourceSearchText(source: KnowledgeRetrievalDocument): string {
  const labels = source.sourceType === 'note'
    ? `note notes ${source.noteType ?? ''}`
    : source.sourceType === 'checklist'
      ? 'checklist task item'
      : 'action task';
  return cleanText(`${source.title} ${source.text} ${labels}`).toLocaleLowerCase();
}

function makeSnippet(source: KnowledgeRetrievalDocument, query: string): string {
  const combined = cleanText([source.title, source.text].filter(Boolean).join(' — '));
  if (!combined) return '';
  const lower = combined.toLocaleLowerCase();
  const index = lower.indexOf(query);
  if (index < 0 || combined.length <= 180) return combined;
  const start = Math.max(0, index - 55);
  const end = Math.min(combined.length, index + query.length + 105);
  return `${start > 0 ? '…' : ''}${combined.slice(start, end)}${end < combined.length ? '…' : ''}`;
}

export function knowledgeMapsFromContext(
  projects: { id: string; name: string }[],
  teams: Team[],
): KnowledgeMaps {
  return {
    projectNameById: new Map(projects.map((project) => [project.id, project.name] as const)),
    teamNameById: new Map(teams.map((team) => [team.id, team.name] as const)),
    organizationIdByTeamId: new Map(
      teams.map((team) => [team.id, team.organizationId] as const),
    ),
  };
}

/**
 * Builds a serializable retrieval index from canonical runtime sources.
 * Tasks, TipTap checklist blocks and independent notes are the only runtime sources.
 */
export function buildKnowledgeRetrieval(
  tasks: Task[],
  notes: Note[],
  maps: KnowledgeMaps,
): { documents: KnowledgeRetrievalDocument[]; cards: KnowledgeHubCard[] } {
  const notesByTask = new Map<string, Note[]>();
  for (const note of notes) {
    const list = notesByTask.get(note.taskId) ?? [];
    list.push(note);
    notesByTask.set(note.taskId, list);
  }

  const documents: KnowledgeRetrievalDocument[] = [];
  const cards: KnowledgeHubCard[] = [];

  for (const task of tasks) {
    const organizationId = maps.organizationIdByTeamId.get(task.teamId) ?? '';
    const projectId = task.projectId ?? null;
    const projectName = projectId ? maps.projectNameById.get(projectId) ?? null : null;
    const teamName = maps.teamNameById.get(task.teamId) ?? 'Team';
    const taskCreatedAt = isoDate(task.createdAt, new Date(0));
    const taskUpdatedAt = isoDate(task.updatedAt, task.createdAt);
    const actionText = cleanText([
      task.description,
      task.status,
      task.priority,
      task.customerName,
      projectName,
      teamName,
    ].filter(Boolean).join(' '));

    const actionSource: KnowledgeRetrievalDocument = {
      sourceType: 'action',
      sourceId: task.id,
      taskId: task.id,
      organizationId,
      teamId: task.teamId,
      projectId,
      authorId: task.createdBy || null,
      title: task.title,
      text: actionText,
      createdAt: taskCreatedAt,
      updatedAt: taskUpdatedAt,
    };
    const sources: KnowledgeRetrievalDocument[] = [actionSource];

    const checklistItems = extractChecklistItems(task);
    for (const item of checklistItems) {
      sources.push({
        sourceType: 'checklist',
        sourceId: item.id,
        taskId: task.id,
        organizationId,
        teamId: task.teamId,
        projectId,
        authorId: null,
        title: task.title,
        text: item.text,
        createdAt: taskCreatedAt,
        updatedAt: taskUpdatedAt,
      });
    }

    const taskNotes = (notesByTask.get(task.id) ?? [])
      .filter((note) => note.teamId === task.teamId && note.organizationId === organizationId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const noteSummaries: KnowledgeNoteSummary[] = [];
    for (const note of taskNotes) {
      const text = cleanText(extractTextFromNode(note.content));
      noteSummaries.push({
        id: note.id,
        title: note.title.trim(),
        text,
        type: note.type,
        authorId: note.authorId,
        authorName: note.authorName,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      });
      sources.push({
        sourceType: 'note',
        sourceId: note.id,
        taskId: task.id,
        noteType: note.type,
        organizationId: note.organizationId,
        teamId: note.teamId,
        projectId,
        authorId: note.authorId,
        title: note.title.trim(),
        text,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      });
    }

    documents.push(...sources);
    const timestamps = sources.map((source) => new Date(source.updatedAt).getTime());
    cards.push({
      id: `card-${task.id}`,
      taskId: task.id,
      taskTitle: task.title,
      sortDate: new Date(Math.max(...timestamps.filter(Number.isFinite))),
      projectId,
      projectName,
      teamId: task.teamId,
      teamName,
      checklistItems,
      notes: noteSummaries,
      sources,
    });
  }

  cards.sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
  return { documents, cards };
}

export function searchKnowledgeCards(
  cards: KnowledgeHubCard[],
  input: {
    query: string;
    content: KnowledgeContentFilter;
    projectId: string | 'all' | '__none__';
  },
): KnowledgeSearchResult[] {
  const query = cleanText(input.query).toLocaleLowerCase();

  return cards.flatMap((card) => {
    if (input.projectId === '__none__' && card.projectId !== null) return [];
    if (input.projectId !== 'all' && input.projectId !== '__none__' && card.projectId !== input.projectId) {
      return [];
    }
    if (input.content === 'notes' && card.notes.length === 0) return [];
    if (input.content === 'checklist' && card.checklistItems.length === 0) return [];

    const eligibleSources = card.sources.filter((source) => {
      if (source.sourceType === 'action') return true;
      if (input.content === 'notes') return source.sourceType === 'note';
      if (input.content === 'checklist') return source.sourceType === 'checklist';
      return true;
    });
    if (!query) return [{ card, matches: [] }];

    const matches = eligibleSources
      .filter((source) => sourceSearchText(source).includes(query))
      .map((source): KnowledgeMatch => ({
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        noteType: source.noteType,
        label: source.sourceType === 'note'
          ? noteLabel(source.noteType ?? 'note')
          : source.sourceType === 'checklist'
            ? 'Checklist'
            : 'Action',
        snippet: makeSnippet(source, query),
      }));
    return matches.length > 0 ? [{ card, matches }] : [];
  });
}

/** Updates a canonical TipTap taskItem by id. */
export function setChecklistItemChecked(
  document: any,
  itemId: string,
  checked: boolean,
): any | null {
  let changed = false;
  const walk = (node: any): any => {
    if (!node || typeof node !== 'object') return node;
    let next = node;
    if (node.type === 'taskItem' && node.attrs?.id === itemId) {
      changed = true;
      next = { ...node, attrs: { ...(node.attrs ?? {}), checked } };
    }
    if (Array.isArray(node.content)) {
      const content = node.content.map(walk);
      if (content.some((child: any, index: number) => child !== node.content[index])) {
        next = { ...next, content };
      }
    }
    return next;
  };
  const next = walk(document);
  return changed ? next : null;
}

/** Maps old per-source pin ids to the stable Action card id. */
export function normalizeKnowledgePinId(id: string): string {
  if (id.startsWith('card-')) return id;
  const learning = /^learning-(.+)$/.exec(id);
  if (learning) return `card-${learning[1]}`;
  const journal = /^journal-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-/i.exec(id);
  if (journal) return `card-${journal[1]}`;
  return id;
}

export function formatKnowledgeEntryDate(date: Date): string {
  try {
    return format(date, 'd MMM yyyy, HH:mm');
  } catch {
    return '';
  }
}
