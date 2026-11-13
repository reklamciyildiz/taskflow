import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  cleanFeedbackText,isFeedbackId,isOneOf,FEEDBACK_CATEGORIES,
  FEEDBACK_AREAS,FEEDBACK_STATUSES,categoryLabels,areaLabels,statusLabels,
} from '../lib/feedback/contract';

assert.equal(cleanFeedbackText('  kısa ',8,140),null);
assert.equal(cleanFeedbackText('  İş akışı otomasyonları  ',8,140),'İş akışı otomasyonları');
assert.equal(cleanFeedbackText('a'.repeat(141),8,140),null);
assert.equal(cleanFeedbackText('ok\u0000x',2,100),null);
assert.equal(cleanFeedbackText(undefined,2,100),null);
assert.equal(isFeedbackId('00000000-0000-4000-8000-000000000000'),true);
assert.equal(isFeedbackId('00000000-0000-4000-8000-000000000000 OR 1=1'),false);
assert.equal(isFeedbackId('other'),false);
assert.equal(isOneOf('planned',FEEDBACK_STATUSES),true);
assert.equal(isOneOf('shipped',FEEDBACK_STATUSES),true);
assert.equal(isOneOf('admin',FEEDBACK_STATUSES),false);
assert.equal(isOneOf('feature',FEEDBACK_CATEGORIES),true);
assert.equal(isOneOf('integration',FEEDBACK_CATEGORIES),true);
assert.equal(isOneOf('billing',FEEDBACK_AREAS),true);
for(const c of FEEDBACK_CATEGORIES)assert.ok(categoryLabels[c]);
for(const a of FEEDBACK_AREAS)assert.ok(areaLabels[a]);
for(const s of FEEDBACK_STATUSES)assert.ok(statusLabels[s]);

const migration=readFileSync('supabase/migrations/20261113110000_actiproc_feedback_hub.sql','utf8');
for(const table of ['feedback_posts','feedback_votes','feedback_comments','feedback_updates']){
  assert.ok(migration.includes('ALTER TABLE public.'+table+' ENABLE ROW LEVEL SECURITY'));
}
assert.ok(migration.includes('FROM PUBLIC, anon, authenticated'));
assert.ok(migration.includes('GRANT EXECUTE ON FUNCTION public.feedback_merge_posts(uuid,uuid) TO service_role'));
assert.ok(migration.includes('pg_advisory_xact_lock'));
assert.ok(migration.includes('PRIMARY KEY (post_id,user_id)'));
const api=readFileSync('app/api/feedback/moderate/route.ts','utf8');
assert.ok(api.includes('isFeedbackStaff(actor)'));
assert.ok(!api.includes('requireOrgAdmin'));
const code=readFileSync('lib/feedback/server.ts','utf8');
assert.ok(code.includes('ACTIPROC_FEEDBACK_ADMIN_EMAILS'));
assert.ok(!code.includes("role==='owner'"));
console.log('Actiproc feedback contract and structural security checks passed');
