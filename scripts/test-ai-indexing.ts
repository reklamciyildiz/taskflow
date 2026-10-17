import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildAttachmentIndexDocument,
  buildNoteIndexDocument,
  buildTaskIndexDocuments,
  deterministicChunkId,
  planAIIndexDocuments,
  serializeChunk,
} from '../lib/ai/indexing/content';

let checks = 0;
const scope = {
  id: '10000000-0000-4000-8000-000000000001', title: 'Action title', description: 'Useful description',
  organization_id: '10000000-0000-4000-8000-000000000002',
  team_id: '10000000-0000-4000-8000-000000000003',
  project_id: '10000000-0000-4000-8000-000000000004', updated_at: '2026-10-17T00:00:00Z',
};
const process = { id: scope.project_id, name: 'Private process', organization_id: scope.organization_id, team_id: scope.team_id, created_at: '2026-01-01T00:00:00Z' };
const checklistA = '10000000-0000-4000-8000-000000000010';
const checklistB = '10000000-0000-4000-8000-000000000011';
const item = (id: string, text: string) => ({
  type: 'taskItem', attrs: { id, checked: false },
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const firstTask = {
  ...scope,
  checklist_blocks: { type: 'doc', content: [{ type: 'taskList', content: [item(checklistA, 'First'), item(checklistB, 'Second')] }] },
};
const reorderedTask = {
  ...scope,
  checklist_blocks: { type: 'doc', content: [{ type: 'taskList', content: [item(checklistB, 'Second'), item(checklistA, 'First')] }] },
};
const firstDocuments = buildTaskIndexDocuments(firstTask, process);
const reorderedDocuments = buildTaskIndexDocuments(reorderedTask, process);
assert.deepEqual(
  firstDocuments.filter((doc) => doc.sourceType === 'checklist').map((doc) => doc.sourceKey).sort(),
  reorderedDocuments.filter((doc) => doc.sourceType === 'checklist').map((doc) => doc.sourceKey).sort(),
);
assert.equal(firstDocuments.find((doc) => doc.sourceKey === checklistA)?.contentHash,
  reorderedDocuments.find((doc) => doc.sourceKey === checklistA)?.contentHash);
checks++;

const note = {
  id: '10000000-0000-4000-8000-000000000020', task_id: scope.id,
  organization_id: scope.organization_id, team_id: scope.team_id,
  title: 'Architecture', updated_at: '2026-10-17T01:00:00Z',
  content: { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Decision' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Use a durable outbox.' }] },
    { type: 'attachment', attrs: { attachmentId: 'secret', src: 'data:application/pdf;base64,SECRET' } },
  ] },
};
const noteDocument = buildNoteIndexDocument(note, scope, process);
assert.ok(noteDocument);
assert.match(noteDocument!.content, /## Decision/);
assert.match(noteDocument!.content, /durable outbox/);
assert.doesNotMatch(noteDocument!.content, /SECRET|base64|attachmentId/);
checks++;

const changedNote = buildNoteIndexDocument({
  ...note,
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated content' }] }] },
}, scope, process)!;
assert.notEqual(noteDocument!.contentHash, changedNote.contentHash);
assert.notDeepEqual(noteDocument!.chunkTexts, changedNote.chunkTexts);
checks++;

const existing = [{
  source_type: noteDocument!.sourceType, source_key: noteDocument!.sourceKey,
  content_hash: noteDocument!.contentHash, active_index_version: 'bge-m3-v1',
  active_embedding_model: '@cf/baai/bge-m3',
}];
assert.equal(planAIIndexDocuments([noteDocument!], existing, 'bge-m3-v1', '@cf/baai/bge-m3')[0].reuseExisting, true);
assert.equal(planAIIndexDocuments([changedNote], existing, 'bge-m3-v1', '@cf/baai/bge-m3')[0].reuseExisting, false);
assert.equal(planAIIndexDocuments([noteDocument!], existing, 'bge-m3-v2', '@cf/baai/bge-m3')[0].reuseExisting, false);
checks++;

const planned = planAIIndexDocuments([noteDocument!], [], 'bge-m3-v1', '@cf/baai/bge-m3')[0];
const fakeEmbedding = Array.from({ length: 1024 }, () => 0.01);
const chunkOne = serializeChunk({ document: planned, ordinal: 0, content: planned.chunkTexts[0], embedding: fakeEmbedding });
const chunkTwo = serializeChunk({ document: planned, ordinal: 0, content: planned.chunkTexts[0], embedding: fakeEmbedding });
assert.equal(chunkOne.id, chunkTwo.id);
assert.equal(chunkOne.id, deterministicChunkId({
  sourceType: planned.sourceType, sourceKey: planned.sourceKey, indexVersion: planned.indexVersion,
  embeddingModel: planned.embeddingModel, ordinal: 0, contentHash: chunkOne.contentHash,
}));
assert.throws(
  () => serializeChunk({ document: planned, ordinal: 0, content: planned.chunkTexts[0], embedding: [0.1] }),
  /expected 1024 finite dimensions/,
);
assert.throws(
  () => serializeChunk({ document: planned, ordinal: 0, content: planned.chunkTexts[0], embedding: [...fakeEmbedding.slice(0, -1), Number.NaN] }),
  /expected 1024 finite dimensions/,
);
checks++;

const attachment = buildAttachmentIndexDocument({
  id: '10000000-0000-4000-8000-000000000030', organization_id: scope.organization_id,
  team_id: scope.team_id, filename: 'design.pdf', mime_type: 'application/pdf',
  object_key: 'private/raw.pdf', binary: 'MALWARE_OR_BINARY', updated_at: '2026-10-17T02:00:00Z',
}, scope, process, [{ note_id: note.id, checklist_item_id: null }]);
assert.match(attachment.content, /design\.pdf/);
assert.doesNotMatch(attachment.content, /private\/raw|MALWARE_OR_BINARY/);
checks++;

const migration = fs.readFileSync('supabase/migrations/20261017160000_ai_rag_index_foundation.sql', 'utf8');
assert.match(migration, /embedding extensions\.vector\(1024\)/);
assert.match(migration, /extensions\.digest\(/);
assert.match(migration, /to_tsvector\('simple'::regconfig/);
assert.match(migration, /FOR UPDATE SKIP LOCKED/);
assert.match(migration, /generation = ai_index_jobs\.generation \+ 1/);
assert.match(migration, /stale_at=now\(\)/);
assert.match(migration, /ai_user_can_access_source/);
assert.match(migration, /p\.visibility='restricted'.*project_members/s);
assert.match(migration, /REVOKE ALL ON public\.ai_source_documents, public\.ai_chunks, public\.ai_index_jobs FROM PUBLIC, anon, authenticated/);
assert.match(migration, /ai_task_index_outbox\(\) RETURNS trigger\s+LANGUAGE plpgsql SECURITY DEFINER/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.ai_task_index_outbox\(\) FROM PUBLIC,anon,authenticated/);
assert.doesNotMatch(migration, /USING hnsw/);
checks++;

assert.match(migration, /DELETE FROM public\.ai_source_documents WHERE task_id=job\.source_key::uuid/);
assert.match(migration, /ON CONFLICT\(source_type,source_key\) DO UPDATE/);
assert.match(migration, /Cannot reuse missing or incompatible AI index/);
checks++;

const hardening = fs.readFileSync('supabase/migrations/20261017190000_ai_production_readiness_hardening.sql', 'utf8');
assert.match(hardening, /FROM public\.notes WHERE task_id=row_data\.id/);
assert.match(hardening, /FROM public\.attachments WHERE task_id=row_data\.id/);
assert.match(hardening, /JOIN public\.tasks t ON t\.id=n\.task_id WHERE t\.project_id=row_data\.id/);
assert.match(hardening, /JOIN public\.tasks t ON t\.id=a\.task_id WHERE t\.project_id=row_data\.id/);
assert.match(hardening, /ai_index_queue_health/);
checks++;

const betaScope = fs.readFileSync('supabase/migrations/20261017210000_ai_beta_index_claim_scope.sql', 'utf8');
assert.match(betaScope, /j\.organization_id=any\(p_organization_ids\)/);
assert.match(betaScope, /FOR UPDATE SKIP LOCKED/i);
assert.match(betaScope, /REVOKE ALL ON FUNCTION public\.claim_ai_index_jobs_for_organizations/i);
const worker = fs.readFileSync('lib/ai/indexing/indexing-server.ts', 'utf8');
assert.match(worker, /claim_ai_index_jobs_for_organizations/);
checks++;

console.log(JSON.stringify({ aiIndexingChecks: checks, productionAccess: false, liveEmbeddingCalls: false }));
