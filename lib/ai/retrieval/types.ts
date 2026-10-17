import type { AISourceType } from '@/lib/ai/indexing/types';

export type RetrievalMode = 'semantic' | 'keyword' | 'hybrid';

export type RetrievalScore = {
  mode: RetrievalMode;
  semantic: number | null;
  keyword: number | null;
  fused: number;
  semanticRank: number | null;
  keywordRank: number | null;
};

export type SourceCitation = {
  citationId: string;
  sourceDocumentId: string;
  sourceType: AISourceType;
  sourceId: string;
  actionId: string | null;
  checklistItemId: string | null;
  noteId: string | null;
  processId: string | null;
  attachmentId: string | null;
  process: { id: string; name: string | null } | null;
  title: string;
  snippet: string;
  sourceUpdatedAt: string;
  chunk: { id: string; ordinal: number };
  index: { version: string; embeddingModel: string };
  score: RetrievalScore;
  navigation: {
    target: 'action' | 'note' | 'checklist' | 'process' | 'attachment';
    actionId: string | null;
    sourceId: string;
  };
};

export type RetrievalInput = {
  query: string;
  mode?: RetrievalMode;
  limit?: number;
  offset?: number;
  candidateLimit?: number;
  similarityThreshold?: number;
  rrfK?: number;
  semanticWeight?: number;
  keywordWeight?: number;
  sourceTypes?: AISourceType[];
  teamId?: string;
  processId?: string;
  timeoutMs?: number;
  maxChunksPerSource?: number;
  allowKeywordFallback?: boolean;
  signal?: AbortSignal;
};

export type RetrievalResult = {
  citations: SourceCitation[];
  requestedMode: RetrievalMode;
  executedMode: RetrievalMode;
  semanticStatus: 'not_requested' | 'used' | 'unavailable' | 'index_empty';
  indexVersion: string;
  latencyMs: number;
};

export type RetrievalErrorCode =
  | 'unauthorized'
  | 'invalid_request'
  | 'configuration'
  | 'timeout'
  | 'database_unavailable'
  | 'embedding_unavailable';

export class RetrievalError extends Error {
  constructor(
    readonly code: RetrievalErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'RetrievalError';
  }
}
