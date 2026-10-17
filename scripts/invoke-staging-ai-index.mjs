import { readFileSync } from 'node:fs';
import { config, parse } from 'dotenv';

const production = parse(readFileSync('.env.local'));
config({ path: '.env.staging.local', override: true, quiet: true });
const ref = (url) => /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url ?? '')?.[1] ?? null;
const stagingRef = ref(process.env.NEXT_PUBLIC_SUPABASE_URL);
if (!stagingRef || stagingRef !== process.env.AXIOM_STAGING_SUPABASE_PROJECT_REF) {
  throw new Error('Staging index invocation refused: project identity mismatch');
}
if (stagingRef === ref(production.NEXT_PUBLIC_SUPABASE_URL)) {
  throw new Error('Staging index invocation refused: production and staging match');
}
if (process.env.AXIOM_STAGING_ALLOW_WRITES !== 'true') {
  throw new Error('Staging index invocation refused: write gate is closed');
}
if (!process.env.CRON_SECRET) throw new Error('Staging index invocation refused: CRON_SECRET is missing');
const requestedPort = process.argv.find((value) => value.startsWith('--port='))?.slice('--port='.length);
const base = new URL(process.env.NEXTAUTH_URL ?? '');
if (requestedPort) base.port = requestedPort;
if (!['localhost', '127.0.0.1'].includes(base.hostname)) {
  throw new Error('Staging index invocation refused: local app URL required');
}
const response = await fetch(new URL('/api/cron/ai-index', base), {
  headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  signal: AbortSignal.timeout(65_000),
});
const payload = await response.json().catch(() => null);
if (!response.ok) throw new Error(`Staging index request failed (${response.status})`);
console.log(JSON.stringify({ indexInvocation: 'passed', ...payload }));
