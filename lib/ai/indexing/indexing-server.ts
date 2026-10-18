import 'server-only';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { CloudflareEmbeddingProvider } from '@/lib/ai/providers/cloudflare-embedding-provider';
import type { EmbeddingProvider, NormalizedAIProviderError } from '@/lib/ai/providers/contracts';
import { aiBetaOrganizationIds,isAIBetaModeEnabled,isAIBetaScopeAllowed } from '@/lib/ai/beta-access';
import { requireTaskNoteAccess } from '@/lib/note-server';
import {
  buildAttachmentIndexDocument,
  buildNoteIndexDocument,
  buildProcessIndexDocument,
  buildTaskIndexDocuments,
  planAIIndexDocuments,
  serializeChunk,
} from './content';
import type {
  AIIndexDocumentDraft,
  AIIndexJob,
  ExistingAIIndexDocument,
  PlannedAIIndexDocument,
} from './types';

const DEFAULT_INDEX_VERSION = 'bge-m3-v1';
type IndexingStage = 'load_canonical' | 'plan' | 'embed' | 'persist';

class AIIndexStageError extends Error {
  constructor(readonly stage: IndexingStage, readonly original: unknown) {
    super(`AI indexing failed during ${stage}`, { cause: original });
    this.name = 'AIIndexStageError';
  }
}

async function atStage<T>(stage: IndexingStage, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) { throw new AIIndexStageError(stage, error); }
}

function indexingConfig() {
  const batchSize = Math.max(1, Math.min(20, Number(process.env.AI_INDEX_BATCH_SIZE ?? 8) || 8));
  const indexVersion = (process.env.AI_INDEX_VERSION ?? DEFAULT_INDEX_VERSION).trim();
  if (!/^[a-zA-Z0-9._-]{1,120}$/.test(indexVersion)) throw new Error('Invalid AI_INDEX_VERSION');
  return { batchSize, indexVersion };
}

async function maybeProject(projectId: string | null | undefined) {
  if (!projectId) return null;
  const { data, error } = await supabaseAdmin.from('projects')
    .select('id,name,organization_id,team_id,created_at')
    .eq('id', projectId).maybeSingle();
  if (error) throw error;
  return data;
}

async function loadCanonicalDrafts(job: AIIndexJob): Promise<AIIndexDocumentDraft[]> {
  if (job.operation === 'delete') return [];
  if (job.source_type === 'task') {
    const { data: task, error } = await supabaseAdmin.from('tasks')
      .select('id,title,description,checklist_blocks,project_id,organization_id,team_id,updated_at')
      .eq('id', job.source_key).maybeSingle();
    if (error) throw error;
    if (!task) return [];
    return buildTaskIndexDocuments(task, await maybeProject(task.project_id));
  }
  if (job.source_type === 'note') {
    const { data: note, error } = await supabaseAdmin.from('notes')
      .select('id,title,type,content,task_id,organization_id,team_id,updated_at')
      .eq('id', job.source_key).maybeSingle();
    if (error) throw error;
    if (!note) return [];
    const { data: task, error: taskError } = await supabaseAdmin.from('tasks')
      .select('id,title,project_id,organization_id,team_id')
      .eq('id', note.task_id).maybeSingle();
    if (taskError) throw taskError;
    if (!task || task.organization_id !== note.organization_id || task.team_id !== note.team_id) return [];
    const draft = buildNoteIndexDocument(note, task, await maybeProject(task.project_id));
    return draft ? [draft] : [];
  }
  if (job.source_type === 'process') {
    const { data, error } = await supabaseAdmin.from('projects')
      .select('id,name,organization_id,team_id,created_at')
      .eq('id', job.source_key).maybeSingle();
    if (error) throw error;
    return data ? [buildProcessIndexDocument(data)] : [];
  }
  const { data: attachment, error } = await supabaseAdmin.from('attachments')
    .select('id,task_id,organization_id,team_id,filename,mime_type,status,updated_at')
    .eq('id', job.source_key).eq('status', 'ready').maybeSingle();
  if (error) throw error;
  if (!attachment?.task_id) return [];
  const [{ data: task, error: taskError }, { data: links, error: linksError }] = await Promise.all([
    supabaseAdmin.from('tasks').select('id,title,project_id,organization_id,team_id')
      .eq('id', attachment.task_id).maybeSingle(),
    supabaseAdmin.from('attachment_links').select('note_id,checklist_item_id')
      .eq('attachment_id', attachment.id),
  ]);
  if (taskError) throw taskError;
  if (linksError) throw linksError;
  if (!task || task.organization_id !== attachment.organization_id || task.team_id !== attachment.team_id) return [];
  return [buildAttachmentIndexDocument(attachment, task, await maybeProject(task.project_id), links ?? [])];
}

async function loadExisting(job: AIIndexJob): Promise<ExistingAIIndexDocument[]> {
  let query = supabaseAdmin.from('ai_source_documents')
    .select('source_type,source_key,content_hash,active_index_version,active_embedding_model');
  if (job.source_type === 'task') query = query.eq('task_id', job.source_key).in('source_type', ['action','checklist']);
  else query = query.eq('source_type', job.source_type === 'process' ? 'process' : job.source_type).eq('source_key', job.source_key);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ExistingAIIndexDocument[];
}

function payloadDocument(document: PlannedAIIndexDocument, chunks: unknown[]) {
  const { chunkTexts: _chunkTexts, ...persisted } = document;
  return { ...persisted, chunks: document.reuseExisting ? [] : chunks };
}

async function indexClaimedJob(
  job: AIIndexJob,
  provider: EmbeddingProvider,
  indexVersion: string,
  deadline: number,
) {
  const [drafts, existing] = await atStage('load_canonical', () => Promise.all([
    loadCanonicalDrafts(job), loadExisting(job),
  ]));
  let planned: PlannedAIIndexDocument[];
  try { planned = planAIIndexDocuments(drafts, existing, indexVersion, provider.modelId); }
  catch (error) { throw new AIIndexStageError('plan', error); }
  const work: Array<{ document: PlannedAIIndexDocument; ordinal: number; content: string }> = [];
  for (const document of planned) {
    if (!document.reuseExisting) {
      document.chunkTexts.forEach((content, ordinal) => work.push({ document, ordinal, content }));
    }
  }
  const embeddings = new Map<string, number[]>();
  for (let offset = 0; offset < work.length; offset += 32) {
    const remainingMs = deadline - Date.now() - 3_000;
    if (remainingMs < 1_000) throw new Error('AI indexing execution deadline reached');
    const batch = work.slice(offset, offset + 32);
    const response = await atStage('embed', () => provider.embed(
      { texts: batch.map((item) => item.content) },
      { requestId: randomUUID(), timeoutMs: Math.min(30_000, remainingMs) },
    ));
    if (response.vectors.length !== batch.length) {
      throw new Error('Embedding batch result count mismatch');
    }
    batch.forEach((item, index) => embeddings.set(
      `${item.document.sourceType}:${item.document.sourceKey}:${item.ordinal}`,
      response.vectors[index],
    ));
  }
  const documents = planned.map((document) => payloadDocument(document,
    document.chunkTexts.map((content, ordinal) => {
      const embedding = embeddings.get(`${document.sourceType}:${document.sourceKey}:${ordinal}`);
      if (!document.reuseExisting && !embedding) throw new Error('Embedding batch result missing');
      return document.reuseExisting ? null : serializeChunk({ document, ordinal, content, embedding: embedding! });
    }).filter(Boolean),
  ));
  const { data, error } = await atStage('persist', async () => supabaseAdmin.rpc('apply_ai_index_result', {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_generation: job.generation,
    p_documents: documents,
  }));
  if (error) throw new AIIndexStageError('persist', error);
  return String(data);
}

function safeFailure(error: unknown, provider: EmbeddingProvider): { code: string; message: string } {
  const original = error instanceof AIIndexStageError ? error.original : error;
  let normalized: NormalizedAIProviderError | null = null;
  try { normalized = provider.normalizeError(original); } catch { normalized = null; }
  if (normalized && normalized.code !== 'unknown') {
    return { code: `provider_${normalized.code}`, message: normalized.message };
  }
  return { code: 'indexing_internal', message: 'AI indexing failed' };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Explicit one-shot path for the controlled production RAG validation. It can
 * only claim the exact Note job named by the operator; it never scans or falls
 * through to another pending outbox entry.
 */
export async function processTargetedAINoteIndexJob(options: {
  jobId: number;
  noteId: string;
  userId: string;
  organizationId: string;
  provider?: EmbeddingProvider;
  timeBudgetMs?: number;
}) {
  if (process.env.AI_TARGETED_NOTE_INDEXING_ENABLED !== 'true') {
    return { enabled: false, claimed: 0, completed: 0, failed: 0, superseded: 0 };
  }
  if (process.env.AI_INDEXING_ENABLED === 'true' || process.env.AI_INDEX_BACKFILL_ENABLED === 'true') {
    throw new Error('Targeted Note indexing requires global indexing and backfill to remain disabled');
  }
  if (!isAIBetaModeEnabled() || !isAIBetaScopeAllowed(options.userId, options.organizationId)) {
    throw new Error('Targeted Note indexing is outside the configured beta scope');
  }
  if (!Number.isSafeInteger(options.jobId) || options.jobId < 1
      || !UUID_PATTERN.test(options.noteId) || !UUID_PATTERN.test(options.userId)
      || !UUID_PATTERN.test(options.organizationId)) {
    throw new Error('Invalid targeted Note indexing identifiers');
  }

  const [{ data: user, error: userError }, { data: note, error: noteError }] = await Promise.all([
    supabaseAdmin.from('users').select('id,organization_id,role').eq('id', options.userId).maybeSingle(),
    supabaseAdmin.from('notes').select('id,task_id,author_id,organization_id,team_id')
      .eq('id', options.noteId).maybeSingle(),
  ]);
  if (userError) throw userError;
  if (noteError) throw noteError;
  if (!user || user.organization_id !== options.organizationId
      || !note || note.organization_id !== options.organizationId
      || note.author_id !== options.userId) {
    throw new Error('Targeted Note indexing scope validation failed');
  }
  const access = await requireTaskNoteAccess(String(note.task_id), { mutate: false }, { user });
  if (!('task' in access)
      || String((access.task as { organization_id?: unknown }).organization_id ?? '') !== options.organizationId
      || String((access.task as { team_id?: unknown }).team_id ?? '') !== String(note.team_id ?? '')) {
    throw new Error('Targeted Note indexing authorization failed');
  }

  const { data, error } = await supabaseAdmin.rpc('claim_ai_note_index_job_by_id_for_organization', {
    p_job_id: options.jobId,
    p_organization_id: options.organizationId,
    p_note_id: options.noteId,
    p_lease_seconds: 180,
    p_max_attempts: 8,
  });
  if (error) throw error;
  const job = (data?.[0] ?? null) as AIIndexJob | null;
  if (!job) return { enabled: true, claimed: 0, completed: 0, failed: 0, superseded: 0 };
  if (job.id !== options.jobId || job.source_type !== 'note'
      || job.source_key !== options.noteId || job.organization_id !== options.organizationId) {
    throw new Error('Targeted Note claim returned an unexpected job');
  }

  const provider = options.provider ?? new CloudflareEmbeddingProvider();
  const { indexVersion } = indexingConfig();
  const deadline = Date.now() + Math.max(10_000, Math.min(50_000, options.timeBudgetMs ?? 50_000));
  try {
    const result = await indexClaimedJob(job, provider, indexVersion, deadline);
    return {
      enabled: true,
      claimed: 1,
      completed: result === 'superseded' ? 0 : 1,
      failed: 0,
      superseded: result === 'superseded' ? 1 : 0,
    };
  } catch (jobError) {
    const safe = safeFailure(jobError, provider);
    const { error: failureError } = await supabaseAdmin.rpc('fail_ai_index_job', {
      p_job_id: job.id,
      p_lease_token: job.lease_token,
      p_error_code: safe.code,
      p_error_message: safe.message,
      p_max_attempts: 8,
    });
    if (failureError) throw failureError;
    return { enabled: true, claimed: 1, completed: 0, failed: 1, superseded: 0 };
  }
}

export async function processAIIndexJobs(options: {
  provider?: EmbeddingProvider;
  batchSize?: number;
  timeBudgetMs?: number;
} = {}) {
  if (process.env.AI_INDEXING_ENABLED !== 'true') {
    return { enabled: false, claimed: 0, completed: 0, failed: 0, superseded: 0, health: null };
  }
  const betaMode = isAIBetaModeEnabled();
  const betaOrganizationIds = betaMode ? aiBetaOrganizationIds() : [];
  if (betaMode && betaOrganizationIds.length === 0) {
    return { enabled: true, betaRestricted: true, claimed: 0, completed: 0, failed: 0, superseded: 0, health: null };
  }
  const config = indexingConfig();
  const provider = options.provider ?? new CloudflareEmbeddingProvider();
  const jobLimit = Math.max(1, Math.min(20, options.batchSize ?? config.batchSize));
  const deadline = Date.now() + Math.max(10_000, Math.min(50_000, options.timeBudgetMs ?? 50_000));
  let claimed = 0;
  let completed = 0;
  let failed = 0;
  let superseded = 0;
  while (claimed < jobLimit && Date.now() < deadline - 5_000) {
    // Claim one at a time so a serverless deadline never strands an entire
    // pre-claimed batch behind leases that were not actually processed.
    const rpcName = betaMode ? 'claim_ai_index_jobs_for_organizations' : 'claim_ai_index_jobs';
    const parameters = betaMode
      ? { p_organization_ids: betaOrganizationIds,p_limit:1,p_lease_seconds:180,p_max_attempts:8 }
      : { p_limit:1,p_lease_seconds:180,p_max_attempts:8 };
    const { data, error } = await supabaseAdmin.rpc(rpcName, parameters);
    if (error) throw error;
    const job = (data?.[0] ?? null) as AIIndexJob | null;
    if (!job) break;
    claimed += 1;
    try {
      const result = await indexClaimedJob(job, provider, config.indexVersion, deadline);
      if (result === 'superseded') superseded += 1;
      else completed += 1;
    } catch (jobError) {
      failed += 1;
      const safe = safeFailure(jobError, provider);
      const { error: failureError } = await supabaseAdmin.rpc('fail_ai_index_job', {
        p_job_id: job.id, p_lease_token: job.lease_token,
        p_error_code: safe.code, p_error_message: safe.message, p_max_attempts: 8,
      });
      const stage = jobError instanceof AIIndexStageError ? jobError.stage : 'unknown';
      const original = jobError instanceof AIIndexStageError ? jobError.original : jobError;
      const upstreamCode = typeof original === 'object' && original && 'code' in original
        ? String((original as { code?: unknown }).code ?? '').slice(0, 80) || undefined
        : undefined;
      console.error('AI indexing job failed', {
        jobId: job.id, sourceType: job.source_type, stage, code: safe.code, upstreamCode,
      });
      if (failureError) {
        console.error('AI indexing failure bookkeeping failed', {
          jobId: job.id,
          sourceType: job.source_type,
          code: 'failure_bookkeeping_failed',
        });
      }
    }
  }
  const { data: health, error: healthError } = await supabaseAdmin.rpc('ai_index_queue_health');
  if (healthError) {
    console.warn('AI index queue health unavailable', { code: 'queue_health_unavailable' });
  }
  return { enabled: true, claimed, completed, failed, superseded, health: healthError ? null : health };
}
