import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedCompletionAt,completedWithin,completionDurationDays,completionCalendarDay} from '../lib/metrics/completions';

const source=(path:string)=>readFileSync(path,'utf8');
const createdAt=new Date('2026-11-01T08:00:00Z');
const completedAt=new Date('2026-11-02T10:00:00Z');
const good={createdAt,completedAt};
const editedAfterCompletion={createdAt,completedAt,updatedAt:new Date('2026-11-11T19:20:00Z')};
assert.equal(verifiedCompletionAt(good)?.toISOString(),completedAt.toISOString());
assert.equal(verifiedCompletionAt(editedAfterCompletion)?.toISOString(),completedAt.toISOString());
assert.equal(completedWithin(good,new Date('2026-11-02T09:59Z'),new Date('2026-11-02T10:01Z')),true);
assert.equal(completedWithin(good,new Date('2026-11-03T00:00Z'),new Date('2026-11-04T00:00Z')),false);
assert.equal(completionDurationDays(good),26/24); // 26 hours
assert.equal(verifiedCompletionAt({createdAt,completedAt:null}),null);
assert.equal(completionDurationDays({createdAt,completedAt:null}),null);
assert.equal(completionCalendarDay({createdAt,completedAt:null}),null);
assert.equal(verifiedCompletionAt({createdAt,completedAt:new Date('2026-10-30')}),null);
assert.equal(verifiedCompletionAt({createdAt,completedAt:new Date('invalid')}),null);

const analytics=source('components/Analytics.tsx');
const achievements=source('components/Achievements.tsx');
assert.match(analytics,/completionDurationDays/);
assert.match(analytics,/completedWithin/);
assert.match(achievements,/completionCalendarDay/);
assert.doesNotMatch(analytics,/t\.updatedAt\s*>=\s*weekAgo/);
assert.doesNotMatch(achievements,/new Date\(t\.updatedAt\)/);
assert.match(analytics,/historical completions without verified dates excluded/);

const account=source('app/(shell)/settings/account/page.tsx');
const settings=source('components/Settings.tsx');
for(const content of [account,settings]){
  assert.doesNotMatch(content,/TwoFactorModal|ActiveSessionsModal|showTwoFactor|showActiveSessions/);
  assert.match(content,/ChangePasswordModal/);
}
const monitor=source('app/api/monitoring/client-error/route.ts');
assert.match(monitor,/requireAuthedUser/);
assert.match(monitor,/headers\.get\('origin'\)/);
assert.match(monitor,/raw\.length>1024/);
assert.match(monitor,/CLIENT_RENDER_FAILURE/);
assert.doesNotMatch(monitor,/p\.message|p\.stack|p\.url|p\.email/);
const error=source('app/(shell)/error.tsx');
assert.match(error,/credentials:'same-origin'/);
assert.doesNotMatch(error,/error\.message|error\.stack/);
const sql=source('supabase/migrations/20261114120000_p0_task_completion_timestamp.sql');
assert.match(sql,/completed_at timestamptz/);
assert.match(sql,/BEFORE INSERT OR UPDATE/);
assert.match(sql,/NEW\.completed_at:=now\(\)/);
assert.match(sql,/NEW\.completed_at:=NULL/);
assert.doesNotMatch(sql,/SET completed_at = updated_at|completed_at = created_at/i);
console.log('P0 security, metric chronology, and privacy contracts verified');
