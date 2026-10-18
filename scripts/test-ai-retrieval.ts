import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCitationRegistry } from '../lib/ai/retrieval/citation';
import { deduplicateBySource, reciprocalRankFusion } from '../lib/ai/retrieval/ranking';
import type { SourceCitation } from '../lib/ai/retrieval/types';

let checks = 0;
const fused = reciprocalRankFusion(['semantic-only','both','tail'],['both','keyword-only','tail']);
assert.equal(fused[0].id,'both');
assert.ok(fused[0].score > fused.find((item) => item.id === 'semantic-only')!.score);
checks++;

const rows = [
  { source: 'note:n1',chunk: 1 },{ source: 'note:n1',chunk: 2 },{ source: 'action:a1',chunk: 1 },
];
assert.deepEqual(deduplicateBySource(rows,(row) => row.source,1),[rows[0],rows[2]]);
checks++;

const citation: SourceCitation = {
  citationId: 'a'.repeat(64),sourceDocumentId: '10000000-0000-4000-8000-000000000001',
  sourceType: 'note',sourceId: '10000000-0000-4000-8000-000000000002',
  actionId: '10000000-0000-4000-8000-000000000003',checklistItemId: null,
  noteId: '10000000-0000-4000-8000-000000000002',processId: null,attachmentId: null,
  process: null,title: 'Source',snippet: 'Verified text',sourceUpdatedAt: '2026-10-17T00:00:00Z',
  chunk: { id: 'a'.repeat(64),ordinal: 0 },index: { version: 'bge-m3-v1',embeddingModel: '@cf/baai/bge-m3' },
  score: { mode: 'hybrid',semantic: 0.8,keyword: 0.4,fused: 0.03,semanticRank: 1,keywordRank: 1 },
  navigation: { target: 'note',actionId: '10000000-0000-4000-8000-000000000003',sourceId: '10000000-0000-4000-8000-000000000002' },
};
const registry = createCitationRegistry([citation]);
assert.equal(registry.resolve(citation.citationId)?.sourceId,citation.sourceId);
assert.throws(() => registry.validate(['fabricated']),/outside the verified retrieval context/);
checks++;

const migration = fs.readFileSync('supabase/migrations/20261017170000_ai_hybrid_retrieval.sql','utf8');
assert.match(migration,/authorized_documents AS MATERIALIZED/);
assert.match(migration,/eligible AS NOT MATERIALIZED/);
assert.match(migration,/JOIN actor u ON u\.organization_id=d\.organization_id/);
assert.match(migration,/p\.visibility='restricted'.*project_members/s);
assert.match(migration,/p\.visibility='private'.*p\.created_by=u\.id/s);
assert.match(migration,/d\.stale_at IS NULL/);
assert.match(migration,/d\.active_index_version=c\.index_version/);
assert.match(migration,/ORDER BY e\.embedding OPERATOR\(extensions\.<=>\) p_query_embedding/);
assert.match(migration,/websearch_to_tsquery\('simple'::regconfig/);
assert.match(migration,/p_semantic_weight\/\(p_rrf_k\+s\.rank\)/);
assert.match(migration,/ai_validate_retrieval_chunks/);
assert.match(migration,/ai_retrieval_index_available/);
assert.match(migration,/REVOKE ALL ON FUNCTION public\.ai_retrieve_chunks.*FROM PUBLIC,anon,authenticated/);
checks++;

const runtimeRepair = fs.readFileSync('supabase/migrations/20261018110000_ai_retrieval_runtime_repair.sql','utf8');
assert.match(runtimeRepair,/ALTER FUNCTION public\.ai_retrieve_chunks/);
assert.match(runtimeRepair,/SET search_path = public, extensions, pg_temp/);
assert.match(runtimeRepair,/CREATE OR REPLACE FUNCTION public\.ai_retrieval_index_available/);
assert.match(runtimeRepair,/SECURITY DEFINER SET search_path=public,pg_temp/);
assert.match(runtimeRepair,/REVOKE ALL ON FUNCTION public\.ai_retrieval_index_available\(uuid,text\)[\s\S]*FROM PUBLIC,anon,authenticated/);
assert.match(runtimeRepair,/GRANT EXECUTE ON FUNCTION public\.ai_retrieval_index_available\(uuid,text\)[\s\S]*TO service_role/);
assert.doesNotMatch(runtimeRepair,/INSERT|UPDATE public|DELETE FROM|TRUNCATE/i);
checks++;

assert.match(migration,/WHEN 'note' THEN EXISTS\(/);
assert.match(migration,/WHEN 'attachment' THEN EXISTS\(/);
assert.match(migration,/a\.status='ready'/);
assert.match(migration,/t\.project_id IS NOT DISTINCT FROM d\.project_id/);
checks++;

const service = fs.readFileSync('lib/ai/retrieval/retrieval-server.ts','utf8');
assert.match(service,/requireAuthedUser\(\)/);
assert.match(service,/validateRowsAgain/);
assert.match(service,/indexAvailable !== true/);
assert.match(service,/executedMode = 'keyword'/);
assert.match(service,/console\.warn\('AI retrieval using keyword fallback', \{ requestId, code: 'embedding_unavailable' \}\)/);
assert.doesNotMatch(service,/console\.(?:log|warn|error)\([^\n]*input\.query/i);
assert.match(service,/response\.vectors\[0\]\.length !== 1_024/);
checks++;

const structured = fs.readFileSync('lib/ai/retrieval/structured-retrieval-server.ts','utf8');
assert.match(structured,/requireTeamScopeAccess\(input\.teamId,authed\)/);
assert.match(structured,/projectDb\.getVisibleForUser/);
assert.match(structured,/visibleProjectIds\.has\(input\.processId\)/);
assert.match(structured,/from\('work_schedules'\)/);
checks++;

console.log(JSON.stringify({ retrievalChecks: checks,productionAccess: false,liveDatabase: false,liveEmbeddingCalls: false }));
