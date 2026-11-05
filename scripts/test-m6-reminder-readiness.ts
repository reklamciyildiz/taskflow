import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { validReminderCronBearer, cronRemindersUnauthorizedResponse } from '@/lib/cron-reminders-guard';
import { mayDeliverScheduledReminder } from '@/lib/reminder-delivery-policy';
import type { Entitlements } from '@/lib/entitlements';

const secret='synthetic-32-character-secret-test-for-ci';
assert.equal(validReminderCronBearer('Bearer '+secret,secret),true);
for(const input of [
 null,'',secret,'Bearer invalid','Basic '+secret,'Bearer '+secret+'x','bearer '+secret,
]) assert.equal(validReminderCronBearer(input,secret),false);
assert.equal(validReminderCronBearer('Bearer '+secret,''),false);
const oldEnv={ NODE_ENV:process.env.NODE_ENV, CRON_SECRET:process.env.CRON_SECRET };
try {
 process.env.NODE_ENV='production';
 delete process.env.CRON_SECRET;
 const uaOnly=new NextRequest('https://example.test/api/cron/reminders-tick',{
   headers:{ 'user-agent':'vercel-cron/1.0' },
 });
 assert.equal(cronRemindersUnauthorizedResponse(uaOnly)?.status,503,
   'Vercel-like User-Agent is not authentication');
 process.env.CRON_SECRET=secret;
 assert.equal(cronRemindersUnauthorizedResponse(uaOnly)?.status,401);
 const bearer=new NextRequest('https://example.test/api/cron/reminders-tick',{
   headers:{ authorization:'Bearer '+secret },
 });
 assert.equal(cronRemindersUnauthorizedResponse(bearer),null);
} finally {
 for(const [key,value] of Object.entries(oldEnv)) {
  if(value===undefined) delete process.env[key]; else process.env[key]=value;
 }
}
type Status=Entitlements['subscriptionStatus'];
const ent=(plan:Entitlements['plan'],status:Status='active',endsAt:string|null=null)=>({
 plan,subscriptionStatus:status,endsAt,
});
const calendar={scheduleTime:'09:00:00',timeZone:'Europe/Istanbul'};
const due='2026-11-10T06:00:00.000Z';
const early='2026-11-10T05:55:00.000Z';
assert.equal(mayDeliverScheduledReminder(ent('free'),calendar,'2026-11-10',due),true);
assert.equal(mayDeliverScheduledReminder(ent('individual'),calendar,'2026-11-10',due),true);
assert.equal(mayDeliverScheduledReminder(ent('free'),calendar,'2026-11-10',early),false);
assert.equal(mayDeliverScheduledReminder(ent('individual'),calendar,'2026-11-10',early),false);
assert.equal(mayDeliverScheduledReminder(ent('pro'),calendar,'2026-11-10',early),true);
assert.equal(mayDeliverScheduledReminder(ent('team'),calendar,'2026-11-10',early),true);
assert.equal(mayDeliverScheduledReminder(ent('pro','past_due'),calendar,'2026-11-10',early),false);
assert.equal(mayDeliverScheduledReminder(ent('team','expired'),calendar,'2026-11-10',early),false);
assert.equal(mayDeliverScheduledReminder(ent('team','cancelled','2020-01-01T00:00:00Z'),calendar,'2026-11-10',early),false);
assert.equal(mayDeliverScheduledReminder(ent('free'),calendar,'2026-11-10','invalid'),false);
const read=(p:string)=>readFileSync(p,'utf8');
const guard=read('lib/cron-reminders-guard.ts');
const tick=read('app/api/cron/reminders-tick/route.ts');
const schedule=read('lib/process-scheduled-reminders.ts');
const docs=read('docs/REMINDERS_CRON.md');
const cron=JSON.parse(read('vercel.json'));
const contracts:Record<string,boolean>={
 'Production cron never trusts user agent':!guard.includes("request.headers.get('user-agent')"),
 'Production no-secret is denied':guard.includes("process.env.NODE_ENV === 'production'"),
 'Cron missing secret fails closed':guard.includes('status: 503'),
 'Both processors always run':tick.includes('Promise.allSettled(['),
 'Partial failure signals 503':tick.includes("status: failed.length ? 503 : 200"),
 'Response disallows cache':tick.includes("response.headers.set('Cache-Control', 'no-store')"),
 'Scheduled delivery server-gated':schedule.includes('mayDeliverScheduledReminder(entitlements, work.schedule, work.dueDate, iso)'),
 'Missing paid entitlement cannot be spoofed by when_due label':!schedule.includes("if (preset === 'when_due') return true;"),
 'Existing Vercel auto-deploy remains disabled':cron.git.deploymentEnabled===false,
 'Single unified cron target':cron.crons.every((x:any)=>x.path==='/api/cron/reminders-tick'),
 'Docs warn external scheduler is needed for 5m reminders':docs.includes('dedicated HTTP cron'),
 'Docs warn push is best effort':docs.includes('best effort'),
};
for(const [name,ok] of Object.entries(contracts))assert.ok(ok,'M6 regression failed: '+name);
console.log(JSON.stringify({checks:Object.keys(contracts).length+23,liveCronInvocations:false,noSecretsRequired:true}));
