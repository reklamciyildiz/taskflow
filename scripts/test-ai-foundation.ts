import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSafeDescription } from '../lib/ai/utils/safe-description';
import { quotaBackendFailureDecision } from '../lib/ai/utils/quota-decision';

let checks = 0;

const hostile = '## Overview\n<img src=x onerror=alert(1)>\n- <script>alert(2)</script>';
const blocks = parseSafeDescription(hostile);
assert.deepEqual(blocks, [
  { type: 'heading', text: 'Overview' },
  { type: 'paragraph', text: '<img src=x onerror=alert(1)>' },
  { type: 'list-item', text: '<script>alert(2)</script>' },
]);
checks++;

const descriptionComponent = fs.readFileSync('components/ai/DescriptionGeneratorButton.tsx', 'utf8');
assert.doesNotMatch(descriptionComponent, /dangerouslySetInnerHTML/);
assert.match(descriptionComponent, /parseSafeDescription/);
checks++;

const failure = quotaBackendFailureDecision(0);
assert.equal(failure.allowed, false);
assert.equal(failure.remaining, 0);
assert.equal(failure.resetAt.toISOString(), '1970-01-01T00:05:00.000Z');
checks++;

const migration = fs.readFileSync(
  'supabase/migrations/20261017140000_ai_foundation_hardening.sql',
  'utf8',
);
assert.match(migration, /DROP POLICY IF EXISTS "Users can view AI cache"/);
assert.match(migration, /REVOKE ALL ON public\.ai_cache FROM anon, authenticated/);
assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('ai-quota:org:/);
assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('ai-quota:user:/);
assert.match(migration, /ON CONFLICT \(scope_type, scope_id, bucket_start\)/);
checks++;

console.log(JSON.stringify({ aiFoundationChecks: checks, productionAccess: false }));
