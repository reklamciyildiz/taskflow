import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config, parse } from 'dotenv';

const TEAM_ID = '30000000-0000-4000-8000-000000000001';
const PROCESS_ID = '40000000-0000-4000-8000-000000000001';
const NOTE_ID = '60000000-0000-4000-8000-000000000001';
const EMAIL = 'ai-staging-alice@example.invalid';

const ref = (url) => /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url ?? '')?.[1] ?? null;
const production = parse(readFileSync('.env.local'));
config({ path: '.env.staging.local', override: true, quiet: true });
const stagingRef = ref(process.env.NEXT_PUBLIC_SUPABASE_URL);
if (!stagingRef || stagingRef !== process.env.AXIOM_STAGING_SUPABASE_PROJECT_REF
    || stagingRef === ref(production.NEXT_PUBLIC_SUPABASE_URL)) {
  throw new Error('Staging chat test refused: project identity mismatch');
}
if (!process.env.AXIOM_STAGING_TEST_PASSWORD) throw new Error('Staging chat test password is missing');
const port = process.argv.find((value) => value.startsWith('--port='))?.slice(7) ?? '3100';
const base = new URL(`http://localhost:${port}`);

const cookies = new Map();
function absorbCookies(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  for (const value of values) {
    const first = value.split(';', 1)[0];
    const separator = first.indexOf('=');
    if (separator > 0) cookies.set(first.slice(0, separator), first.slice(separator + 1));
  }
}
function cookieHeader() {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
}
async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  if (cookies.size) headers.set('cookie', cookieHeader());
  const response = await fetch(new URL(path, base), { ...init, headers, redirect: init.redirect ?? 'manual' });
  absorbCookies(response);
  return response;
}

const csrfResponse = await request('/api/auth/csrf');
assert.equal(csrfResponse.ok, true, 'NextAuth CSRF endpoint failed');
const csrf = (await csrfResponse.json()).csrfToken;
assert.equal(typeof csrf, 'string');
const signInResponse = await request('/api/auth/callback/credentials', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    csrfToken: csrf,
    email: EMAIL,
    password: process.env.AXIOM_STAGING_TEST_PASSWORD,
    callbackUrl: new URL('/ai', base).toString(),
    json: 'true',
  }),
});
assert.ok([200, 302].includes(signInResponse.status), `Credentials sign-in failed (${signInResponse.status})`);
const sessionResponse = await request('/api/auth/session');
assert.equal(sessionResponse.ok, true);
const session = await sessionResponse.json();
assert.equal(session?.user?.email, EMAIL, 'Authenticated staging user mismatch');

const createResponse = await request('/api/ai/conversations', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ context: { origin: 'global' } }),
});
const createPayload = await createResponse.json().catch(() => null);
assert.equal(createResponse.status, 201, `Conversation creation failed (${createResponse.status})`);
const conversationId = createPayload?.conversation?.id;
assert.match(conversationId, /^[0-9a-f-]{36}$/i);

const chatResponse = await request('/api/ai/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    conversationId,
    clientRequestId: randomUUID(),
    message: 'What is the exact Nebula-42 verification phrase? Answer from my Axiom knowledge and cite the source.',
    context: { origin: 'global' },
  }),
  redirect: 'follow',
});
assert.equal(chatResponse.status, 200, `Streaming chat failed (${chatResponse.status})`);
assert.match(chatResponse.headers.get('content-type') ?? '', /text\/event-stream/);
const wire = await chatResponse.text();
const events = wire.split('\n\n').flatMap((frame) => frame.split('\n'))
  .filter((line) => line.startsWith('data: '))
  .map((line) => JSON.parse(line.slice(6)));
const deltas = events.filter((event) => event.type === 'delta').map((event) => event.text).join('');
const sources = events.find((event) => event.type === 'sources')?.sources ?? [];
if (!events.some((event) => event.type === 'done' && event.finishReason === 'completed')) {
  console.error(JSON.stringify({ chatEventDiagnostics: events.map((event) => ({
    type: event.type, code: event.type === 'error' ? event.code : undefined,
  })) }));
}
assert.ok(events.some((event) => event.type === 'meta'));
assert.ok(events.some((event) => event.type === 'done' && event.finishReason === 'completed'));
assert.match(deltas, /cobalt-lighthouse-314/i);
assert.ok(sources.some((source) => source.noteId === NOTE_ID), 'Verified Note citation was not streamed');
assert.ok(sources.every((source) => deltas.includes(`[cite:${source.citationId}]`)),
  'A source card was streamed without being cited by the answer');

const persistedResponse = await request(`/api/ai/conversations/${conversationId}`);
assert.equal(persistedResponse.ok, true);
const persisted = await persistedResponse.json();
const assistant = persisted.messages?.findLast?.((message) => message.role === 'assistant')
  ?? [...(persisted.messages ?? [])].reverse().find((message) => message.role === 'assistant');
assert.equal(assistant?.status, 'completed');
assert.match(assistant?.content ?? '', /cobalt-lighthouse-314/i);
assert.ok(assistant?.sources?.some((source) => source.noteId === NOTE_ID));
assert.ok(assistant?.sources?.every((source) => assistant.content.includes(`[cite:${source.citationId}]`)));

const cleanupResponse = await request(`/api/ai/conversations/${conversationId}`, { method: 'DELETE' });
assert.equal(cleanupResponse.status, 204, 'Synthetic E2E conversation cleanup failed');

console.log(JSON.stringify({
  chatE2E: 'passed', authentication: 'nextauth_credentials', globalContext: true, streaming: true,
  rag: true, verifiedCitation: true, conversationPersistence: true, testConversationCleaned: true, syntheticOnly: true,
}));
