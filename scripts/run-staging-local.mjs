import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { config, parse } from 'dotenv';

const stagingPath = '.env.staging.local';
const aiTestMode = process.argv.includes('--ai-test');
const requestedPort = process.argv.find((value) => value.startsWith('--port='))?.slice('--port='.length);

function fail(message) {
  console.error(`Staging startup refused: ${message}`);
  process.exit(1);
}

if (!existsSync(stagingPath)) {
  fail('copy .env.staging.example to .env.staging.local and fill the staging-only values');
}

const defaultEnv = existsSync('.env.local')
  ? parse(readFileSync('.env.local'))
  : {};

const result = config({ path: stagingPath, override: true, quiet: true });
if (result.error) fail('the staging environment file could not be loaded');

const required = [
  'AXIOM_STAGING_SUPABASE_PROJECT_REF',
  'NEXTAUTH_SECRET',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];
for (const name of required) {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith('your-') || value.startsWith('generate-')) {
    fail(`${name} is missing or still contains a placeholder`);
  }
}

if (process.env.AXIOM_STAGING_ALLOW_WRITES !== 'true') {
  fail('set AXIOM_STAGING_ALLOW_WRITES=true only after confirming this is an isolated staging project');
}

let supabaseUrl;
try {
  supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
} catch {
  fail('NEXT_PUBLIC_SUPABASE_URL is invalid');
}

const expectedHost = `${process.env.AXIOM_STAGING_SUPABASE_PROJECT_REF}.supabase.co`;
if (supabaseUrl.protocol !== 'https:' || supabaseUrl.hostname !== expectedHost) {
  fail('the Supabase URL does not match AXIOM_STAGING_SUPABASE_PROJECT_REF');
}

if (defaultEnv.NEXT_PUBLIC_SUPABASE_URL
  && defaultEnv.NEXT_PUBLIC_SUPABASE_URL.trim() === process.env.NEXT_PUBLIC_SUPABASE_URL.trim()) {
  fail('the staging Supabase URL is identical to .env.local; use a separate project');
}

let appUrl;
try {
  appUrl = new URL(process.env.NEXTAUTH_URL ?? '');
} catch {
  fail('NEXTAUTH_URL must be a valid localhost URL');
}
if (!['localhost', '127.0.0.1'].includes(appUrl.hostname)) {
  fail('NEXTAUTH_URL must point to localhost for this staging runner');
}
if (requestedPort) {
  if (!/^\d{2,5}$/.test(requestedPort) || Number(requestedPort) < 1024 || Number(requestedPort) > 65535) {
    fail('the requested local port is invalid');
  }
  appUrl.port = requestedPort;
  process.env.NEXTAUTH_URL = appUrl.origin;
}

if (aiTestMode) {
  // Process-local activation only: the staging file and every production flag
  // remain closed. Backfill is deliberately never enabled by this mode.
  process.env.AI_ATOMIC_QUOTA_ENABLED = 'true';
  process.env.AI_INDEXING_ENABLED = 'true';
  process.env.AI_INDEX_BACKFILL_ENABLED = 'false';
  process.env.AXIOM_AI_CHAT_ENABLED = 'true';
  process.env.AXIOM_AI_BETA_MODE_ENABLED = 'true';
  process.env.AXIOM_AI_BETA_USER_IDS = '20000000-0000-4000-8000-000000000001,20000000-0000-4000-8000-000000000002';
  process.env.AXIOM_AI_BETA_ORGANIZATION_IDS = '10000000-0000-4000-8000-000000000001';
  process.env.AXIOM_AI_READ_TOOLS_ENABLED = 'true';
  process.env.AXIOM_AI_WRITE_TOOLS_ENABLED = 'true';
  process.env.AXIOM_AI_ACTION_MUTATION_TOOLS_ENABLED = 'true';
  process.env.AI_DAILY_REQUESTS_PER_USER = '50';
  process.env.AI_MONTHLY_REQUESTS_PER_ORG = '1000';
}

console.log(`Starting Axiom locally against the isolated staging project${aiTestMode ? ' (controlled AI test mode)' : ''}.`);
const child = process.platform === 'win32'
  ? spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', appUrl.port || '3000'], { stdio: 'inherit', env: process.env })
  : spawn('node_modules/.bin/next', ['dev', '-p', appUrl.port || '3000'], { stdio: 'inherit', env: process.env });

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
