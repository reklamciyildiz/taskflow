import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config,parse } from 'dotenv';
import pg from 'pg';

const production=parse(readFileSync('.env.local'));
config({path:'.env.staging.local',override:true,quiet:true});
const ref=(url)=>/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url??'')?.[1]??null;
const stagingRef=ref(process.env.NEXT_PUBLIC_SUPABASE_URL);
if(!stagingRef||stagingRef!==process.env.AXIOM_STAGING_SUPABASE_PROJECT_REF||stagingRef===ref(production.NEXT_PUBLIC_SUPABASE_URL))throw new Error('Staging write-tool test refused: project identity mismatch');
if(process.env.AXIOM_STAGING_ALLOW_WRITES!=='true')throw new Error('Staging writes are not enabled');
if(!process.env.AXIOM_STAGING_TEST_PASSWORD)throw new Error('Staging test password is missing');
const port=process.argv.find((value)=>value.startsWith('--port='))?.slice(7)??'3100';
const base=new URL(`http://localhost:${port}`),cookies=new Map();
function absorb(response){for(const value of(typeof response.headers.getSetCookie==='function'?response.headers.getSetCookie():[response.headers.get('set-cookie')].filter(Boolean))){const first=value.split(';',1)[0],at=first.indexOf('=');if(at>0)cookies.set(first.slice(0,at),first.slice(at+1));}}
async function request(path,init={}){const headers=new Headers(init.headers);if(cookies.size)headers.set('cookie',[...cookies].map(([key,value])=>`${key}=${value}`).join('; '));const response=await fetch(new URL(path,base),{...init,headers,redirect:init.redirect??'manual'});absorb(response);return response;}
const csrf=await(await request('/api/auth/csrf')).json();
const login=await request('/api/auth/callback/credentials',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken:csrf.csrfToken,email:'ai-staging-alice@example.invalid',password:process.env.AXIOM_STAGING_TEST_PASSWORD,callbackUrl:new URL('/ai',base).toString(),json:'true'})});
assert.ok([200,302].includes(login.status));

const client=new pg.Client({connectionString:process.env.AXIOM_STAGING_DATABASE_URL});await client.connect();
const tag=randomUUID().slice(0,8),actionTitle=`AI Write E2E ${tag}`,checklistText=`Confirm approval ${tag}`;
let actionId=null;
async function chatEvents(message){
  const created=await request('/api/ai/conversations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({context:{origin:'global'}})});
  const conversation=(await created.json()).conversation;assert.equal(created.status,201);
  const response=await request('/api/ai/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({conversationId:conversation.id,clientRequestId:randomUUID(),message,context:{origin:'global'}})});
  assert.equal(response.status,200);const wire=await response.text();
  const events=wire.split('\n\n').flatMap((frame)=>frame.split('\n')).filter((line)=>line.startsWith('data: ')).map((line)=>JSON.parse(line.slice(6)));
  return{conversationId:conversation.id,events};
}
async function propose(message){
  const {conversationId,events}=await chatEvents(message);
  const proposal=events.find((event)=>event.type==='proposal')?.proposal;assert.ok(proposal,JSON.stringify(events));
  return{conversationId,proposal};
}
async function decide(item,action){
  const response=await request(`/api/ai/write-proposals/${item.proposal.id}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({conversationId:item.conversationId,action})});
  const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body.proposal;
}
async function decideRaw(item,action){const response=await request(`/api/ai/write-proposals/${item.proposal.id}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({conversationId:item.conversationId,action})});return{response,body:await response.json()};}

try{
  const actionProposal=await propose(`Create a high priority Action titled "${actionTitle}" in the Open Stage of the Nebula Team Knowledge Process. Description: "Synthetic approval test". Add checklist items "${checklistText}" and "Verify idempotency ${tag}".`);
  assert.equal(actionProposal.proposal.toolName,'create_action');
  assert.equal(Number((await client.query('select count(*) from tasks where title=$1',[actionTitle])).rows[0].count),0,'proposal mutated before approval');
  const actionResult=await decide(actionProposal,'approve');assert.equal(actionResult.status,'completed');actionId=actionResult.result.actionId;
  const actionRows=await client.query('select id,checklist_blocks from tasks where title=$1',[actionTitle]);assert.equal(actionRows.rowCount,1);assert.equal(actionRows.rows[0].id,actionId);
  assert.equal(JSON.stringify(actionRows.rows[0].checklist_blocks).includes(checklistText),true);
  const replay=await decide(actionProposal,'approve');assert.equal(replay.result.actionId,actionId);
  assert.equal(Number((await client.query('select count(*) from tasks where title=$1',[actionTitle])).rows[0].count),1,'approval replay duplicated Action');

  const noteProposal=await propose(`Create a Note titled "E2E Note ${tag}" under the Action "${actionTitle}". Content: "Only explicit approval may create this synthetic note."`);
  assert.equal(noteProposal.proposal.toolName,'create_note');
  const noteResult=await decide(noteProposal,'approve');assert.equal(noteResult.status,'completed');
  assert.equal(Number((await client.query('select count(*) from notes where task_id=$1 and title=$2',[actionId,`E2E Note ${tag}`])).rows[0].count),1);

  const checklistProposal=await propose(`Mark the checklist item "${checklistText}" in Action "${actionTitle}" as completed.`);
  assert.equal(checklistProposal.proposal.toolName,'update_checklist');
  const checklistResult=await decide(checklistProposal,'approve');assert.equal(checklistResult.status,'completed');
  const updated=(await client.query('select checklist_blocks from tasks where id=$1',[actionId])).rows[0].checklist_blocks;
  const item=updated.content.flatMap((node)=>node.content??[]).find((node)=>JSON.stringify(node).includes(checklistText));assert.equal(item.attrs.checked,true);

  const rejected=await propose(`Create a Note titled "Rejected ${tag}" under Action "${actionTitle}". Content: "must not exist".`);
  const rejectedResult=await decide(rejected,'reject');assert.equal(rejectedResult.status,'rejected');
  assert.equal(Number((await client.query('select count(*) from notes where task_id=$1 and title=$2',[actionId,`Rejected ${tag}`])).rows[0].count),0);

  const beforeUpdate=(await client.query('select title,description,priority,updated_at from tasks where id=$1',[actionId])).rows[0];
  const updatedTitle=`AI Write Updated ${tag}`;
  const updateProposal=await propose(`In the Nebula Team Knowledge Process, update the Action "${actionTitle}": rename it to "${updatedTitle}", set priority to high, and append "Canonical update ${tag}" to its description.`);
  assert.equal(updateProposal.proposal.toolName,'update_action');
  const beforeApproval=(await client.query('select title,description,priority from tasks where id=$1',[actionId])).rows[0];
  assert.equal(beforeApproval.title,beforeUpdate.title);assert.equal(beforeApproval.priority,beforeUpdate.priority);
  const updateResult=await decide(updateProposal,'approve');assert.equal(updateResult.status,'completed');
  const afterUpdate=(await client.query('select title,description,priority from tasks where id=$1',[actionId])).rows[0];
  assert.equal(afterUpdate.title,updatedTitle);assert.equal(afterUpdate.priority,'high');assert.match(afterUpdate.description,/Synthetic approval test/);assert.match(afterUpdate.description,/Canonical update/);
  await decide(updateProposal,'approve');
  assert.equal(Number((await client.query('select count(*) from tasks where id=$1 and title=$2',[actionId,updatedTitle])).rows[0].count),1);

  const rejectedUpdate=await propose(`In the Nebula Team Knowledge Process, rename Action "${updatedTitle}" to "Rejected update ${tag}".`);
  assert.equal(rejectedUpdate.proposal.toolName,'update_action');
  assert.equal((await decide(rejectedUpdate,'reject')).status,'rejected');
  assert.equal((await client.query('select title from tasks where id=$1',[actionId])).rows[0].title,updatedTitle);

  const staleUpdate=await propose(`In the Nebula Team Knowledge Process, change Action "${updatedTitle}" priority to low.`);
  await request(`/api/tasks/${actionId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({description:`Concurrent edit ${tag}`})});
  const staleResult=await decideRaw(staleUpdate,'approve');assert.equal(staleResult.response.status,409);assert.equal(staleResult.body.error.code,'STALE_VERSION');
  assert.equal((await client.query('select priority from tasks where id=$1',[actionId])).rows[0].priority,'high');

  const scheduleProposal=await propose(`Schedule Action "${updatedTitle}" in the Nebula Team Knowledge Process for 2026-11-03 at 14:00.`);
  assert.equal(scheduleProposal.proposal.toolName,'schedule_action');
  assert.equal(Number((await client.query('select count(*) from work_schedules where task_id=$1 and archived_at is null',[actionId])).rows[0].count),0);
  const scheduleResult=await decide(scheduleProposal,'approve');assert.equal(scheduleResult.status,'completed');
  let schedule=(await client.query('select id,schedule_date::text,schedule_time::text,time_zone,updated_at from work_schedules where task_id=$1 and archived_at is null',[actionId])).rows[0];
  assert.equal(schedule.schedule_date,'2026-11-03');assert.match(schedule.schedule_time,/14:00/);assert.ok(schedule.time_zone);

  const rescheduleProposal=await propose(`Move Action "${updatedTitle}" in the Nebula Team Knowledge Process to 2026-11-04 at 10:00.`);
  assert.equal(rescheduleProposal.proposal.toolName,'schedule_action');
  assert.equal((await decide(rescheduleProposal,'approve')).status,'completed');
  schedule=(await client.query('select id,schedule_date::text,schedule_time::text,time_zone from work_schedules where task_id=$1 and archived_at is null',[actionId])).rows[0];
  assert.equal(schedule.schedule_date,'2026-11-04');assert.match(schedule.schedule_time,/10:00/);

  const staleSchedule=await propose(`Move Action "${updatedTitle}" in the Nebula Team Knowledge Process to 2026-11-05 at 11:00.`);
  const externalSchedule=await request('/api/schedules',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({taskId:actionId,scheduleType:'one_off',scheduleDate:'2026-11-06',scheduleTime:'09:00',timeZone:schedule.time_zone,recurrenceFrequency:null,recurrenceInterval:1,recurrenceWeekdays:[],endsOn:null,reminderRules:[]})});
  assert.equal(externalSchedule.status,200);
  const staleScheduleResult=await decideRaw(staleSchedule,'approve');assert.equal(staleScheduleResult.response.status,409);assert.equal(staleScheduleResult.body.error.code,'STALE_VERSION');
  assert.equal((await client.query('select schedule_date::text from work_schedules where task_id=$1 and archived_at is null',[actionId])).rows[0].schedule_date,'2026-11-06');

  const recurringResponse=await request('/api/schedules',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({taskId:actionId,scheduleType:'recurring',scheduleDate:'2026-11-06',scheduleTime:'09:00',timeZone:schedule.time_zone,recurrenceFrequency:'weekly',recurrenceInterval:1,recurrenceWeekdays:[5],endsOn:null,reminderRules:[]})});
  assert.equal(recurringResponse.status,200);
  const ambiguousRecurring=await chatEvents(`Move recurring Action "${updatedTitle}" in the Nebula Team Knowledge Process to 2026-11-13 at 10:00.`);
  assert.equal(ambiguousRecurring.events.some((event)=>event.type==='proposal'),false);
  assert.equal(ambiguousRecurring.events.find((event)=>event.type==='error')?.code,'WRITE_PROPOSAL_INVALID_ARGUMENTS');
  assert.equal((await client.query('select schedule_date::text from work_schedules where task_id=$1 and archived_at is null',[actionId])).rows[0].schedule_date,'2026-11-06');
  const recurringSeries=await propose(`Move the whole recurring series for Action "${updatedTitle}" in the Nebula Team Knowledge Process to start on 2026-11-13 at 10:00.`);
  assert.equal(recurringSeries.proposal.toolName,'schedule_action');assert.equal((await decide(recurringSeries,'approve')).status,'completed');
  const recurring=(await client.query('select schedule_type,schedule_date::text,schedule_time::text,recurrence_frequency,recurrence_weekdays from work_schedules where task_id=$1 and archived_at is null',[actionId])).rows[0];
  assert.equal(recurring.schedule_type,'recurring');assert.equal(recurring.schedule_date,'2026-11-13');assert.match(recurring.schedule_time,/10:00/);assert.equal(recurring.recurrence_frequency,'weekly');assert.deepEqual(recurring.recurrence_weekdays,[5]);

  const audit=await client.query("select event_type,count(*)::int from ai_write_audit_events where proposal_id=any($1::uuid[]) group by event_type",
    [[actionProposal.proposal.id,noteProposal.proposal.id,checklistProposal.proposal.id,rejected.proposal.id]]);
  assert.ok(audit.rows.some((row)=>row.event_type==='completed'&&row.count===3));
  console.log(JSON.stringify({stagingWriteTools:'passed',livePostgres:true,liveGroq:true,explicitApproval:true,
    createActionWithChecklist:true,createNote:true,stableChecklistUpdate:true,updateAction:true,updateActionStaleRejected:true,
    scheduleAction:true,rescheduleAction:true,scheduleStaleRejected:true,recurringScopeRequired:true,recurringSeriesPreserved:true,
    replayIdempotent:true,rejectionNoMutation:true,audit:true,syntheticOnly:true}));
}finally{
  if(actionId)await request(`/api/tasks/${actionId}`,{method:'DELETE'}).catch(()=>undefined);
  await client.end().catch(()=>undefined);
}
