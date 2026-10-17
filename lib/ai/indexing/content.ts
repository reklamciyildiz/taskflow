import { createHash } from 'node:crypto';
import { estimateTokens } from '@/lib/ai/utils/token-counter';
import type {
  AIIndexDocumentDraft,
  ExistingAIIndexDocument,
  PlannedAIIndexDocument,
} from './types';

export const AI_CHUNK_MAX_CHARACTERS = 1_800;
export const AI_CHUNK_OVERLAP_CHARACTERS = 240;
export const AI_EMBEDDING_DIMENSIONS = 1_024;

export function normalizeAIText(value: unknown): string {
  return String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function chunkPlainText(
  value: string,
  maxCharacters = AI_CHUNK_MAX_CHARACTERS,
  overlapCharacters = AI_CHUNK_OVERLAP_CHARACTERS,
): string[] {
  const text = normalizeAIText(value);
  if (!text) return [];
  if (text.length <= maxCharacters) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxCharacters);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf(' ', end));
      if (boundary > start + Math.floor(maxCharacters * 0.6)) end = boundary;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    const next = Math.max(start + 1, end - overlapCharacters);
    const whitespace = text.indexOf(' ', next);
    start = whitespace >= 0 && whitespace < end ? whitespace + 1 : next;
  }
  return chunks;
}

type TipTapBlock = { type: 'heading' | 'paragraph'; text: string; level?: number };

export function extractTipTapBlocks(document: unknown): TipTapBlock[] {
  const blocks: TipTapBlock[] = [];
  const inlineText = (node: any): string => {
    if (!node || typeof node !== 'object' || node.type === 'attachment') return '';
    if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
    return Array.isArray(node.content) ? node.content.map(inlineText).join('') : '';
  };
  const walk = (node: any) => {
    if (!node || typeof node !== 'object' || node.type === 'attachment') return;
    if (node.type === 'heading') {
      const text = normalizeAIText(inlineText(node));
      if (text) blocks.push({ type: 'heading', text, level: Number(node.attrs?.level) || 2 });
      return;
    }
    if (node.type === 'paragraph') {
      const text = normalizeAIText(inlineText(node));
      if (text) blocks.push({ type: 'paragraph', text });
      return;
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(document);
  return blocks;
}

export function chunkTipTapDocument(document: unknown, title?: string): { content: string; chunks: string[] } {
  const blocks = extractTipTapBlocks(document);
  const rendered = blocks.map((block) => block.type === 'heading'
    ? `${'#'.repeat(Math.min(6, Math.max(1, block.level ?? 2)))} ${block.text}`
    : block.text);
  const content = normalizeAIText([title ? `# ${normalizeAIText(title)}` : '', ...rendered].filter(Boolean).join('\n\n'));
  return { content, chunks: chunkPlainText(content) };
}

function directChecklistText(node: any): string {
  const directBlocks = Array.isArray(node?.content)
    ? node.content.filter((child: any) => child?.type !== 'taskList')
    : [];
  return normalizeAIText(extractTipTapBlocks({ type: 'doc', content: directBlocks }).map((block) => block.text).join(' '));
}

export function extractStableChecklistItems(document: unknown): Array<{ id: string; text: string }> {
  const items: Array<{ id: string; text: string }> = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'taskItem') {
      const id = typeof node.attrs?.id === 'string' ? node.attrs.id.trim() : '';
      const text = directChecklistText(node);
      if (id && text) items.push({ id, text });
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(document);
  return items;
}

function draft(input: Omit<AIIndexDocumentDraft, 'contentHash' | 'chunkTexts'> & { chunkTexts?: string[] }): AIIndexDocumentDraft {
  const content = normalizeAIText(input.content);
  return {
    ...input,
    title: normalizeAIText(input.title),
    content,
    contentHash: sha256(content),
    chunkTexts: input.chunkTexts ?? chunkPlainText(content),
  };
}

export function buildTaskIndexDocuments(task: any, process: any | null): AIIndexDocumentDraft[] {
  const processName = normalizeAIText(process?.name);
  const actionContent = normalizeAIText([
    `Action: ${normalizeAIText(task.title)}`,
    task.description ? `Description: ${normalizeAIText(task.description)}` : '',
    processName ? `Process: ${processName}` : '',
  ].filter(Boolean).join('\n'));
  const common = {
    organizationId: String(task.organization_id), teamId: task.team_id ? String(task.team_id) : null,
    projectId: task.project_id ? String(task.project_id) : null,
    taskId: String(task.id), noteId: null, attachmentId: null,
    sourceUpdatedAt: String(task.updated_at),
  };
  const documents: AIIndexDocumentDraft[] = [draft({
    ...common, sourceType: 'action', sourceKey: String(task.id),
    title: String(task.title ?? ''), content: actionContent,
  })];
  for (const item of extractStableChecklistItems(task.checklist_blocks)) {
    const content = normalizeAIText([
      `Checklist: ${item.text}`,
      `Parent Action: ${normalizeAIText(task.title)}`,
      processName ? `Process: ${processName}` : '',
    ].filter(Boolean).join('\n'));
    documents.push(draft({
      ...common, sourceType: 'checklist', sourceKey: item.id,
      title: item.text, content,
    }));
  }
  return documents;
}

export function buildNoteIndexDocument(note: any, task: any, process: any | null): AIIndexDocumentDraft | null {
  const extracted = chunkTipTapDocument(note.content, note.title);
  const context = normalizeAIText([
    extracted.content,
    `Parent Action: ${normalizeAIText(task.title)}`,
    process?.name ? `Process: ${normalizeAIText(process.name)}` : '',
  ].filter(Boolean).join('\n\n'));
  if (!context) return null;
  return draft({
    sourceType: 'note', sourceKey: String(note.id), organizationId: String(note.organization_id),
    teamId: note.team_id ? String(note.team_id) : null, projectId: task.project_id ? String(task.project_id) : null,
    taskId: String(task.id), noteId: String(note.id), attachmentId: null,
    title: String(note.title ?? ''), content: context, sourceUpdatedAt: String(note.updated_at),
    chunkTexts: chunkPlainText(context),
  });
}

export function buildProcessIndexDocument(process: any): AIIndexDocumentDraft {
  const content = `Process: ${normalizeAIText(process.name)}`;
  return draft({
    sourceType: 'process', sourceKey: String(process.id), organizationId: String(process.organization_id),
    teamId: process.team_id ? String(process.team_id) : null, projectId: String(process.id),
    taskId: null, noteId: null, attachmentId: null, title: String(process.name ?? ''),
    content, sourceUpdatedAt: String(process.updated_at ?? process.created_at),
  });
}

export function buildAttachmentIndexDocument(attachment: any, task: any, process: any | null, links: any[]): AIIndexDocumentDraft {
  const targets = links.map((link) => link.note_id ? 'Note' : link.checklist_item_id ? 'Checklist' : 'Action');
  const content = normalizeAIText([
    `Attachment: ${normalizeAIText(attachment.filename)}`,
    `Type: ${normalizeAIText(attachment.mime_type)}`,
    `Parent Action: ${normalizeAIText(task.title)}`,
    process?.name ? `Process: ${normalizeAIText(process.name)}` : '',
    targets.length ? `Linked from: ${[...new Set(targets)].join(', ')}` : '',
  ].filter(Boolean).join('\n'));
  return draft({
    sourceType: 'attachment', sourceKey: String(attachment.id), organizationId: String(attachment.organization_id),
    teamId: attachment.team_id ? String(attachment.team_id) : null, projectId: task.project_id ? String(task.project_id) : null,
    taskId: String(task.id), noteId: null, attachmentId: String(attachment.id),
    title: String(attachment.filename), content, sourceUpdatedAt: String(attachment.updated_at),
  });
}

export function planAIIndexDocuments(
  drafts: AIIndexDocumentDraft[], existing: ExistingAIIndexDocument[],
  indexVersion: string, embeddingModel: string,
): PlannedAIIndexDocument[] {
  const byKey = new Map(existing.map((item) => [`${item.source_type}:${item.source_key}`, item]));
  return drafts.map((item) => {
    const current = byKey.get(`${item.sourceType}:${item.sourceKey}`);
    return {
      ...item, indexVersion, embeddingModel,
      reuseExisting: current?.content_hash === item.contentHash
        && current.active_index_version === indexVersion
        && current.active_embedding_model === embeddingModel,
    };
  });
}

export function deterministicChunkId(input: {
  sourceType: string; sourceKey: string; indexVersion: string;
  embeddingModel: string; ordinal: number; contentHash: string;
}): string {
  return sha256([input.sourceType,input.sourceKey,input.indexVersion,input.embeddingModel,input.ordinal,input.contentHash].join(':'));
}

export function serializeChunk(input: {
  document: PlannedAIIndexDocument; ordinal: number; content: string; embedding: number[];
}) {
  if (input.embedding.length !== AI_EMBEDDING_DIMENSIONS
      || input.embedding.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid embedding: expected ${AI_EMBEDDING_DIMENSIONS} finite dimensions`);
  }
  const content = normalizeAIText(input.content);
  const contentHash = sha256(content);
  return {
    id: deterministicChunkId({
      sourceType: input.document.sourceType, sourceKey: input.document.sourceKey,
      indexVersion: input.document.indexVersion, embeddingModel: input.document.embeddingModel,
      ordinal: input.ordinal, contentHash,
    }),
    ordinal: input.ordinal, content, contentHash,
    tokenEstimate: Math.max(1, estimateTokens(content)), embedding: input.embedding,
  };
}
