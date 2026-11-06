// Cron-job.org compatibility, monitoring and deployment safety contracts.
// No live external requests, credentials, or customer notifications.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { validReminderCronBearer, cronRemindersUnauthorizedResponse } from '@/lib/cron-reminders-guard';

const read=(path:string)=>readFileSync(path,'utf8');
const ai=read('app/api/cron/ai-index/route.ts');
const rem=read('app/api/cron/reminders-tick/route.ts');
const middleware=read('middleware.ts');
const docs=read('docs/REMINDERS_CRON.md');
const aiDocs=read('docs/ai-indexing-rollout.md');
const vercel=JSON.parse(read('vercel.json'));

const secret='synthetic-test-cron-secret-00000001';
assert.equal(validReminderCronBearer('Bearer '+secret,secret),true);
for(const v of [null,'Bearer wrong','Basic '+secret,'Bearer '+secret+'x',''])
  assert.equal(validReminderCronBearer(v,secret),false);
const old=process.env.CRON_SECRET;
try {
  process.env.CRON_SECRET=secret;
  const req=new NextRequest('https://example.test/api/cron/reminders-tick',{
    headers:{authorization:'Bearer '+secret},
  });
  assert.equal(cronRemindersUnauthorizedResponse(req),null);
  const wrong=new NextRequest('https://example.test/api/cron/reminders-tick',{
    headers:{'user-agent':'vercel-cron/1.0'},
  });
  assert.equal(cronRemindersUnauthorizedResponse(wrong)?.status,401);
} finally {
  if(old===undefined)delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET=old;
}
const contract:Record<string,boolean>={
  'both jobs use the same server-only CRON_SECRET':
    ai.includes("process.env.CRON_SECRET")&&
    read('lib/cron-reminders-guard.ts').includes('process.env.CRON_SECRET'),
  'index worker time budget below 30 seconds':
    ai.includes('CRON_TIME_BUDGET_MS = 20_000')&&ai.includes('maxDuration = 30'),
  'index returns non-2xx on failed job':
    ai.includes('result.failed > 0')&&ai.includes('status: failed ? 503 : 200'),
  'index reports worker crash without exposing exception':
    ai.includes('AI indexing cron failed')&&ai.includes('status: 503'),
  'index disabled mode remains observable':ai.includes('...result, ok: !failed'),
  'index response private':ai.includes("'Cache-Control': 'no-store'"),
  'reminders return partial failure non-2xx':
    rem.includes('Promise.allSettled([')&&rem.includes('status: failed.length ? 503 : 200'),
  'reminders always dynamic':rem.includes("dynamic = 'force-dynamic'"),
  'reminders route private':rem.includes("response.headers.set('Cache-Control', 'no-store')"),
  'middleware exempts cron from next-auth redirects':middleware.includes("'/api/cron'"),
  'middleware no longer endorses UA authentication':
    !middleware.includes('Vercel Cron UA)'),
  'external headers explicitly documented':docs.includes('Advanced / Request headers')&&docs.includes('Authorization'),
  'old production hostname migration documented':docs.includes('getaxiomm.vercel.app'),
  '30s external timeout caveat documented':docs.includes('limit is 30 seconds'),
  'index monitoring and disabled behavior documented':aiDocs.includes('enabled:false'),
  'Vercel two daily fallback jobs unchanged':
    vercel.crons.length===2&&vercel.crons.every((v:any)=>v.path==='/api/cron/reminders-tick'),
  'automatic deployment remains disabled':vercel.git.deploymentEnabled===false,
};
for(const [name,pass] of Object.entries(contract))assert.ok(pass,'Cron compatibility: '+name);
console.log(JSON.stringify({checks:Object.keys(contract).length+7,liveCalls:false,secretExposed:false}));
