import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CloudflareEmbeddingProvider } from '@/lib/ai/providers/cloudflare-embedding-provider';
import { createRequestSignal } from '@/lib/ai/providers/provider-http';
import type { EmbeddingProvider } from '@/lib/ai/providers/contracts';
import { requireAuthedUser } from '@/lib/server-authz';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checklistItemIdFromDocumentSourceKey } from '@/lib/ai/indexing/content';
import { deduplicateBySource } from './ranking';
import type {
  RetrievalInput,
  RetrievalMode,
  RetrievalResult,
  SourceCitation,
} from './types';
import { RetrievalError } from './types';

const sourceTypeSchema = z.enum(['action','checklist','note','process','attachment']);
const retrievalRowSchema = z.object({
  chunk_id: z.string().regex(/^[0-9a-f]{64}$/),
  source_document_id: z.string().uuid(),
  source_type: sourceTypeSchema,
  source_key: z.string().min(1),
  task_id: z.string().uuid().nullable(),
  note_id: z.string().uuid().nullable(),
  attachment_id: z.string().uuid().nullable(),
  project_id: z.string().uuid().nullable(),
  process_name: z.string().nullable(),
  title: z.string(),
  snippet: z.string(),
  source_updated_at: z.string().datetime({ offset: true }),
  chunk_ordinal: z.number().int().nonnegative(),
  index_version: z.string().min(1),
  embedding_model: z.string().min(1),
  semantic_score: z.number().finite().nullable(),
  keyword_score: z.number().finite().nullable(),
  fused_score: z.number().finite(),
  semantic_rank: z.number().int().positive().nullable(),
  keyword_rank: z.number().int().positive().nullable(),
});

const inputSchema = z.object({
  query: z.string().trim().min(1).max(1_000),
  mode: z.enum(['semantic','keyword','hybrid']).default('hybrid'),
  limit: z.number().int().min(1).max(50).default(8),
  offset: z.number().int().min(0).max(200).default(0),
  candidateLimit: z.number().int().min(1).max(500).default(80),
  similarityThreshold: z.number().min(-1).max(1).default(0.2),
  rrfK: z.number().int().min(1).max(1_000).default(60),
  semanticWeight: z.number().min(0).max(10).default(1),
  keywordWeight: z.number().min(0).max(10).default(1),
  sourceTypes: z.array(sourceTypeSchema).min(1).max(5).optional(),
  teamId: z.string().uuid().optional(),
  processId: z.string().uuid().optional(),
  timeoutMs: z.number().int().min(1_000).max(60_000).default(15_000),
  maxChunksPerSource: z.number().int().min(1).max(5).default(1),
  allowKeywordFallback: z.boolean().default(true),
  signal: z.custom<AbortSignal>((value) => value === undefined || value instanceof AbortSignal).optional(),
});

type ParsedInput = z.infer<typeof inputSchema>;

function indexVersion() {
  const value = (process.env.AI_RETRIEVAL_INDEX_VERSION
    ?? process.env.AI_INDEX_VERSION
    ?? 'bge-m3-v1').trim();
  if (!/^[a-zA-Z0-9._-]{1,120}$/.test(value)) {
    throw new RetrievalError('configuration','AI retrieval index version is invalid');
  }
  return value;
}

function toCitation(row: z.infer<typeof retrievalRowSchema>, mode: RetrievalMode): SourceCitation {
  const actionId = row.task_id;
  const checklistItemId = row.source_type === 'checklist'
    ? checklistItemIdFromDocumentSourceKey(row.source_key, actionId)
    : null;
  return {
    citationId: row.chunk_id,
    sourceDocumentId: row.source_document_id,
    sourceType: row.source_type,
    sourceId: row.source_key,
    actionId,
    checklistItemId,
    noteId: row.note_id,
    processId: row.project_id,
    attachmentId: row.attachment_id,
    process: row.project_id ? { id: row.project_id, name: row.process_name } : null,
    title: row.title,
    snippet: row.snippet,
    sourceUpdatedAt: row.source_updated_at,
    chunk: { id: row.chunk_id, ordinal: row.chunk_ordinal },
    index: { version: row.index_version, embeddingModel: row.embedding_model },
    score: {
      mode,
      semantic: row.semantic_score,
      keyword: row.keyword_score,
      fused: row.fused_score,
      semanticRank: row.semantic_rank,
      keywordRank: row.keyword_rank,
    },
    navigation: {
      target: row.source_type,
      actionId,
      sourceId: checklistItemId ?? row.source_key,
    },
  };
}

async function runRpc(input: ParsedInput, options: {
  userId: string;
  mode: RetrievalMode;
  embedding: number[] | null;
  indexVersion: string;
  signal: AbortSignal;
}) {
  const requestedRows = Math.min(
    100,
    Math.max(input.limit + input.offset, (input.limit + input.offset) * input.maxChunksPerSource * 2),
  );
  const candidateLimit = Math.max(input.candidateLimit, requestedRows);
  const query = supabaseAdmin.rpc('ai_retrieve_chunks', {
    p_user_id: options.userId,
    p_query_text: input.query,
    p_query_embedding: options.embedding,
    p_mode: options.mode,
    p_limit: requestedRows,
    p_offset: 0,
    p_candidate_limit: candidateLimit,
    p_similarity_threshold: input.similarityThreshold,
    p_rrf_k: input.rrfK,
    p_semantic_weight: input.semanticWeight,
    p_keyword_weight: input.keywordWeight,
    p_index_version: options.indexVersion,
    p_source_types: input.sourceTypes ?? null,
    p_team_id: input.teamId ?? null,
    p_project_id: input.processId ?? null,
  }).abortSignal(options.signal);
  const { data, error } = await query;
  if (error) throw new RetrievalError('database_unavailable','Knowledge retrieval is temporarily unavailable',true);
  const parsed = z.array(retrievalRowSchema).safeParse(data ?? []);
  if (!parsed.success) throw new RetrievalError('database_unavailable','Knowledge retrieval returned an invalid response',true);
  return parsed.data;
}

async function validateRowsAgain(
  userId: string,
  rows: Array<z.infer<typeof retrievalRowSchema>>,
  currentIndexVersion: string,
  signal: AbortSignal,
) {
  if (rows.length === 0) return rows;
  const { data, error } = await supabaseAdmin.rpc('ai_validate_retrieval_chunks', {
    p_user_id: userId,
    p_chunk_ids: rows.map((row) => row.chunk_id),
    p_index_version: currentIndexVersion,
  }).abortSignal(signal);
  if (error) throw new RetrievalError('database_unavailable','Citation validation is temporarily unavailable',true);
  const validIds = new Set((data ?? []).map((row: any) => String(row.chunk_id)));
  return rows.filter((row) => validIds.has(row.chunk_id));
}

export async function retrieveKnowledge(
  rawInput: RetrievalInput,
  dependencies: { embeddingProvider?: EmbeddingProvider } = {},
): Promise<RetrievalResult> {
  const startedAt = performance.now();
  const requestId = randomUUID();
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) throw new RetrievalError('invalid_request','Invalid retrieval request');
  const input = parsed.data;
  const authed = await requireAuthedUser();
  if (authed instanceof NextResponse || !authed.user.id || !authed.user.organization_id) {
    throw new RetrievalError('unauthorized','Authentication required');
  }
  const currentIndexVersion = indexVersion();
  const requestSignal = createRequestSignal(input.timeoutMs,input.signal);
  let executedMode: RetrievalMode = input.mode;
  let semanticStatus: RetrievalResult['semanticStatus'] = input.mode === 'keyword' ? 'not_requested' : 'used';
  let embedding: number[] | null = null;
  try {
    const { data: indexAvailable,error: availabilityError } = await supabaseAdmin
      .rpc('ai_retrieval_index_available', {
        p_user_id: authed.user.id,
        p_index_version: currentIndexVersion,
      })
      .abortSignal(requestSignal.signal);
    if (availabilityError) {
      throw new RetrievalError('database_unavailable','Knowledge retrieval is temporarily unavailable',true);
    }
    if (indexAvailable !== true) {
      return {
        citations: [],requestedMode: input.mode,executedMode: input.mode,
        semanticStatus: input.mode === 'keyword' ? 'not_requested' : 'index_empty',
        indexVersion: currentIndexVersion,latencyMs: Math.round(performance.now()-startedAt),
      };
    }
    if (input.mode !== 'keyword') {
      try {
        const provider = dependencies.embeddingProvider ?? new CloudflareEmbeddingProvider();
        const response = await provider.embed(
          { texts: [input.query] },
          { requestId,timeoutMs: input.timeoutMs,signal: requestSignal.signal },
        );
        if (response.dimensions !== 1_024 || response.vectors.length !== 1
            || response.vectors[0].length !== 1_024
            || response.vectors[0].some((value) => !Number.isFinite(value))) {
          throw new RetrievalError('embedding_unavailable','Embedding provider returned an invalid response',true);
        }
        embedding = response.vectors[0];
      } catch (error) {
        if (input.mode !== 'hybrid' || !input.allowKeywordFallback) {
          if (error instanceof RetrievalError) throw error;
          throw new RetrievalError('embedding_unavailable','Semantic retrieval is temporarily unavailable',true);
        }
        executedMode = 'keyword';
        semanticStatus = 'unavailable';
        console.warn('AI retrieval using keyword fallback', { requestId, code: 'embedding_unavailable' });
      }
    }
    let rows = await runRpc(input, {
      userId: authed.user.id,
      mode: executedMode,
      embedding,
      indexVersion: currentIndexVersion,
      signal: requestSignal.signal,
    });
    rows = await validateRowsAgain(authed.user.id,rows,currentIndexVersion,requestSignal.signal);
    const deduplicated = deduplicateBySource(
      rows,
      (row) => `${row.source_type}:${row.source_key}`,
      input.maxChunksPerSource,
    ).slice(input.offset,input.offset + input.limit);
    return {
      citations: deduplicated.map((row) => toCitation(row,executedMode)),
      requestedMode: input.mode,
      executedMode,
      semanticStatus,
      indexVersion: currentIndexVersion,
      latencyMs: Math.round(performance.now()-startedAt),
    };
  } catch (error) {
    if (error instanceof RetrievalError) throw error;
    if (requestSignal.signal.aborted) throw new RetrievalError('timeout','Knowledge retrieval timed out',true);
    throw new RetrievalError('database_unavailable','Knowledge retrieval is temporarily unavailable',true);
  } finally {
    requestSignal.cleanup();
  }
}
