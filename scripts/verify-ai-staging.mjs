import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config, parse } from 'dotenv';
import pg from 'pg';

const IDS = {
  orgA: '10000000-0000-4000-8000-000000000001',
  alice: '20000000-0000-4000-8000-000000000001',
  bob: '20000000-0000-4000-8000-000000000002',
  eve: '20000000-0000-4000-8000-000000000003',
  teamProject: '40000000-0000-4000-8000-000000000001',
  restrictedProject: '40000000-0000-4000-8000-000000000002',
  privateProject: '40000000-0000-4000-8000-000000000003',
  noteTeam: '60000000-0000-4000-8000-000000000001',
};

const ref = (url) => /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url ?? '')?.[1] ?? null;
const production = parse(readFileSync('.env.local'));
config({ path: '.env.staging.local', override: true, quiet: true });
const stagingRef = ref(process.env.NEXT_PUBLIC_SUPABASE_URL);
if (!stagingRef || stagingRef !== process.env.AXIOM_STAGING_SUPABASE_PROJECT_REF
    || stagingRef === ref(production.NEXT_PUBLIC_SUPABASE_URL)) {
  throw new Error('Staging verification refused: project identity mismatch');
}
for (const name of ['AXIOM_STAGING_DATABASE_URL', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_AI_API_TOKEN',
  'CLOUDFLARE_EMBEDDING_MODEL', 'GROQ_API_KEY', 'GROQ_CHAT_MODEL']) {
  if (!process.env[name]) throw new Error(`Staging verification refused: ${name} is missing`);
}

async function embed(text) {
  const model = process.env.CLOUDFLARE_EMBEDDING_MODEL;
  const modelPath = model.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)}/ai/run/${modelPath}`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.CLOUDFLARE_AI_API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: [text] }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) throw new Error(`Cloudflare staging verification failed (${response.status})`);
  const payload = await response.json();
  const vector = payload?.result?.data?.[0];
  assert.equal(Array.isArray(vector), true);
  assert.equal(vector.length, 1_024);
  assert.equal(vector.every(Number.isFinite), true);
  return vector;
}

async function retrieve(client, userId, query, vector) {
  const result = await client.query(`
    SELECT * FROM public.ai_retrieve_chunks(
      $1::uuid,$2,$3::extensions.vector,'hybrid',20,0,80,0.05,60,1,1,
      'bge-m3-v1',NULL,NULL,NULL
    )`, [userId, query, `[${vector.join(',')}]`]);
  return result.rows;
}

async function askGroq(sourceText, citationId) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_CHAT_MODEL,
      messages: [
        { role: 'system', content: 'Answer only from the supplied synthetic source. Include the exact citation token.' },
        { role: 'user', content: `Question: What is the Nebula-42 verification phrase?\nSource [cite:${citationId}]: ${sourceText}` },
      ],
      max_completion_tokens: 120,
      temperature: 0,
      reasoning_effort: 'low',
      stream: false,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Groq staging verification failed (${response.status})`);
  const payload = await response.json();
  return String(payload?.choices?.[0]?.message?.content ?? '');
}

const client = new pg.Client({ connectionString: process.env.AXIOM_STAGING_DATABASE_URL });
try {
  await client.connect();
  const health = await client.query(`
    SELECT
      count(*) FILTER (WHERE status='completed')::int AS completed_jobs,
      count(*) FILTER (WHERE status IN ('pending','retry','processing','dead_letter'))::int AS incomplete_jobs
    FROM ai_index_jobs`);
  assert.equal(health.rows[0].completed_jobs, 8);
  assert.equal(health.rows[0].incomplete_jobs, 0);
  const dimensions = await client.query(`
    SELECT count(*)::int AS chunks,
      min(extensions.vector_dims(embedding))::int AS min_dimensions,
      max(extensions.vector_dims(embedding))::int AS max_dimensions
    FROM ai_chunks`);
  assert.ok(dimensions.rows[0].chunks >= 8);
  assert.equal(dimensions.rows[0].min_dimensions, 1_024);
  assert.equal(dimensions.rows[0].max_dimensions, 1_024);

  const nebulaQuery = 'Nebula-42 verification phrase cobalt lighthouse';
  const nebulaVector = await embed(nebulaQuery);
  const aliceNebula = await retrieve(client, IDS.alice, nebulaQuery, nebulaVector);
  const noteCitation = aliceNebula.find((row) => row.note_id === IDS.noteTeam);
  assert.ok(noteCitation, 'Alice should retrieve the Nebula note');
  assert.match(noteCitation.snippet, /cobalt-lighthouse-314/i);
  const bobNebula = await retrieve(client, IDS.bob, nebulaQuery, nebulaVector);
  assert.ok(bobNebula.some((row) => row.note_id === IDS.noteTeam), 'Bob should retrieve team-visible knowledge');
  const eveNebula = await retrieve(client, IDS.eve, nebulaQuery, nebulaVector);
  assert.equal(eveNebula.length, 0, 'Cross-tenant retrieval must return no rows');

  const restrictedQuery = 'Orchid-77 amber vault confidential phrase';
  const restrictedVector = await embed(restrictedQuery);
  const aliceRestricted = await retrieve(client, IDS.alice, restrictedQuery, restrictedVector);
  assert.ok(aliceRestricted.some((row) => row.project_id === IDS.restrictedProject));
  const bobRestricted = await retrieve(client, IDS.bob, restrictedQuery, restrictedVector);
  assert.equal(bobRestricted.some((row) => [IDS.restrictedProject, IDS.privateProject].includes(row.project_id)), false);

  const requestKey = randomUUID();
  const reserve = () => client.query(
    `SELECT * FROM reserve_ai_quota($1::uuid,$2::uuid,$3::uuid,'staging-e2e',25,500)`,
    [requestKey, IDS.alice, IDS.orgA],
  );
  const firstQuota = await reserve();
  const secondQuota = await reserve();
  assert.equal(firstQuota.rows[0].allowed, true);
  assert.equal(secondQuota.rows[0].reservation_id, firstQuota.rows[0].reservation_id);

  const answer = await askGroq(noteCitation.snippet, noteCitation.chunk_id);
  assert.match(answer, /cobalt-lighthouse-314/i);
  assert.match(answer, new RegExp(`\\[cite:${noteCitation.chunk_id}\\]`));
  console.log(JSON.stringify({
    verification: 'passed', syntheticOnly: true,
    indexing: { completedJobs: 8, chunks: dimensions.rows[0].chunks, dimensions: 1_024 },
    retrieval: { teamVisible: true, restricted: true, privateDenied: true, crossTenantRows: 0 },
    citations: { sourceMatched: true, groqCitationMatched: true },
    quota: { atomicIdempotency: true },
    liveProviders: { cloudflare: true, groq: true },
  }));
} finally {
  await client.end().catch(() => undefined);
}
