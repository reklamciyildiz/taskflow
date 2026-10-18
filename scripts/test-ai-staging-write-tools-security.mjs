import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {config,parse} from 'dotenv';
import pg from 'pg';

const IDS={orgA:'10000000-0000-4000-8000-000000000001',orgB:'10000000-0000-4000-8000-000000000002',
  alice:'20000000-0000-4000-8000-000000000001',bob:'20000000-0000-4000-8000-000000000002',eve:'20000000-0000-4000-8000-000000000003',
  teamA:'30000000-0000-4000-8000-000000000001',teamB:'30000000-0000-4000-8000-000000000002',
  projectA:'40000000-0000-4000-8000-000000000001',taskA:'50000000-0000-4000-8000-000000000001',checklist:'70000000-0000-4000-8000-000000000001'};
const production=parse(readFileSync('.env.local'));config({path:'.env.staging.local',override:true,quiet:true});
const ref=(url)=>/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url??'')?.[1]??null,stagingRef=ref(process.env.NEXT_PUBLIC_SUPABASE_URL);
if(!stagingRef||stagingRef!==process.env.AXIOM_STAGING_SUPABASE_PROJECT_REF||stagingRef===ref(production.NEXT_PUBLIC_SUPABASE_URL))throw new Error('Staging security test refused: project identity mismatch');
if(process.env.AXIOM_STAGING_ALLOW_WRITES!=='true')throw new Error('Staging writes are not enabled');
const port=process.argv.find((value)=>value.startsWith('--port='))?.slice(7)??'3100',base=new URL(`http://localhost:${port}`),cookies=new Map();
function canonical(value){if(Array.isArray(value))return`[${value.map(canonical).join(',')}]`;if(value&&typeof value==='object')return`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;return JSON.stringify(value);}
const hash=(toolName,payload)=>createHash('sha256').update(canonical({toolName,payload})).digest('hex');
function absorb(response){for(const value of(typeof response.headers.getSetCookie==='function'?response.headers.getSetCookie():[response.headers.get('set-cookie')].filter(Boolean))){const first=value.split(';',1)[0],at=first.indexOf('=');if(at>0)cookies.set(first.slice(0,at),first.slice(at+1));}}
async function request(path,init={}){const headers=new Headers(init.headers);if(cookies.size)headers.set('cookie',[...cookies].map(([key,value])=>`${key}=${value}`).join('; '));const response=await fetch(new URL(path,base),{...init,headers,redirect:init.redirect??'manual'});absorb(response);return response;}
const client=new pg.Client({connectionString:process.env.AXIOM_STAGING_DATABASE_URL});await client.connect();
const cleanupConversations=[];let createdActionId=null;let aliceHash,bobHash;
async function insertProposal({userId=IDS.bob,organizationId=IDS.orgA,toolName,payload,expired=false}){
  const conversationId=randomUUID(),messageId=randomUUID(),requestId=randomUUID(),proposalId=randomUUID();cleanupConversations.push(conversationId);
  await client.query('insert into ai_conversations(id,organization_id,user_id,title) values($1,$2,$3,$4)',[conversationId,organizationId,userId,'Write security test']);
  await client.query("insert into ai_messages(id,conversation_id,organization_id,user_id,client_request_id,role,status,content) values($1,$2,$3,$4,$5,'assistant','completed','Synthetic proposal')",[messageId,conversationId,organizationId,userId,requestId]);
  const createdAt=expired?new Date(Date.now()-120000):new Date(),expiresAt=expired?new Date(Date.now()-60000):new Date(Date.now()+600000);
  await client.query(`insert into ai_write_proposals(id,organization_id,user_id,conversation_id,assistant_message_id,tool_name,payload,payload_hash,display_snapshot,created_at,expires_at)
    values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10,$11)`,[proposalId,organizationId,userId,conversationId,messageId,toolName,JSON.stringify(payload),hash(toolName,payload),JSON.stringify({title:'Synthetic',summary:'Synthetic',targetLabel:'Synthetic',fields:[]}),createdAt,expiresAt]);
  return{proposalId,conversationId};
}
async function approve(item){const response=await request(`/api/ai/write-proposals/${item.proposalId}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({conversationId:item.conversationId,action:'approve'})});return{response,body:await response.json()};}

try{
  ({rows:[{password_hash:aliceHash}]}=await client.query('select password_hash from users where id=$1',[IDS.alice]));
  ({rows:[{password_hash:bobHash}]}=await client.query('select password_hash from users where id=$1',[IDS.bob]));
  await client.query('update users set password_hash=$1 where id=$2',[aliceHash,IDS.bob]);
  const csrf=await(await request('/api/auth/csrf')).json();const login=await request('/api/auth/callback/credentials',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken:csrf.csrfToken,email:'ai-staging-bob@example.invalid',password:process.env.AXIOM_STAGING_TEST_PASSWORD,callbackUrl:new URL('/ai',base).toString(),json:'true'})});assert.ok([200,302].includes(login.status));

  const expired=await insertProposal({toolName:'create_note',payload:{actionId:IDS.taskA,title:'Expired',content:'No mutation',noteType:'note'},expired:true});
  const expiredResult=await approve(expired);assert.equal(expiredResult.response.status,200);assert.equal(expiredResult.body.proposal.status,'expired');
  assert.equal(Number((await client.query("select count(*) from notes where title='Expired'")).rows[0].count),0);

  const foreign=await insertProposal({userId:IDS.eve,organizationId:IDS.orgB,toolName:'create_note',payload:{actionId:'50000000-0000-4000-8000-000000000099',title:'Foreign',content:'No',noteType:'note'}});
  const foreignResult=await approve(foreign);assert.equal(foreignResult.response.status,404);

  const revoked=await insertProposal({toolName:'create_note',payload:{actionId:IDS.taskA,title:'Revoked',content:'Must not exist',noteType:'note'}});
  await client.query('delete from team_members where team_id=$1 and user_id=$2',[IDS.teamA,IDS.bob]);
  const revokedResult=await approve(revoked);assert.equal(revokedResult.response.status,403);assert.equal(Number((await client.query("select count(*) from notes where title='Revoked'")).rows[0].count),0);
  await client.query("insert into team_members(team_id,user_id,role) values($1,$2,'member') on conflict(team_id,user_id) do update set role='member'",[IDS.teamA,IDS.bob]);

  const originalTask=(await client.query('select updated_at,checklist_blocks from tasks where id=$1',[IDS.taskA])).rows[0];
  const item=originalTask.checklist_blocks.content.flatMap((node)=>node.content??[]).find((node)=>node.attrs?.id===IDS.checklist);
  const stale=await insertProposal({toolName:'update_checklist',payload:{actionId:IDS.taskA,checklistItemId:IDS.checklist,completed:!item.attrs.checked,expectedTaskUpdatedAt:new Date(originalTask.updated_at).toISOString(),expectedChecked:item.attrs.checked}});
  await client.query("update tasks set updated_at=updated_at+interval '1 second' where id=$1",[IDS.taskA]);
  const staleResult=await approve(stale);assert.equal(staleResult.response.status,409);assert.equal(staleResult.body.error.code,'STALE_VERSION');
  const afterStale=(await client.query('select checklist_blocks from tasks where id=$1',[IDS.taskA])).rows[0].checklist_blocks;
  assert.equal(afterStale.content.flatMap((node)=>node.content??[]).find((node)=>node.attrs?.id===IDS.checklist).attrs.checked,item.attrs.checked);
  await client.query('update tasks set updated_at=$1 where id=$2',[originalTask.updated_at,IDS.taskA]);

  const title=`Concurrent ${randomUUID().slice(0,8)}`;
  const concurrent=await insertProposal({toolName:'create_action',payload:{processId:IDS.projectA,teamId:IDS.teamA,stageId:'open',title,description:'Synthetic',priority:'low',checklistItems:[]}});
  const attempts=await Promise.all([approve(concurrent),approve(concurrent)]);assert.ok(attempts.some((attempt)=>attempt.response.status===200));
  assert.equal(Number((await client.query('select count(*) from tasks where title=$1',[title])).rows[0].count),1);createdActionId=(await client.query('select id from tasks where title=$1',[title])).rows[0].id;

  console.log(JSON.stringify({stagingWriteSecurity:'passed',expiredRejected:true,crossUserTenantIsolation:true,
    authorizationRechecked:true,staleVersionRejected:true,concurrentApprovalSingleMutation:true,syntheticOnly:true}));
}finally{
  await client.query("insert into team_members(team_id,user_id,role) values($1,$2,'member') on conflict(team_id,user_id) do update set role='member'",[IDS.teamA,IDS.bob]).catch(()=>undefined);
  if(bobHash!==undefined)await client.query('update users set password_hash=$1 where id=$2',[bobHash,IDS.bob]).catch(()=>undefined);
  if(createdActionId)await client.query('delete from tasks where id=$1',[createdActionId]).catch(()=>undefined);
  if(cleanupConversations.length)await client.query('delete from ai_conversations where id=any($1::uuid[])',[cleanupConversations]).catch(()=>undefined);
  await client.end().catch(()=>undefined);
}
