import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { config,parse } from 'dotenv';
import pg from 'pg';

const production=parse(readFileSync('.env.local'));
config({path:'.env.staging.local',override:true,quiet:true});
const ref=(url)=>/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url??'')?.[1]??null;
const stagingRef=ref(process.env.NEXT_PUBLIC_SUPABASE_URL);
if(!stagingRef||stagingRef!==process.env.AXIOM_STAGING_SUPABASE_PROJECT_REF||stagingRef===ref(production.NEXT_PUBLIC_SUPABASE_URL))throw new Error('ACL test refused: staging identity mismatch');
if(process.env.AXIOM_STAGING_ALLOW_WRITES!=='true')throw new Error('ACL test requires the explicit staging write guard for its rolled-back revocation check');

const ids={
  alice:'20000000-0000-4000-8000-000000000001',bob:'20000000-0000-4000-8000-000000000002',eve:'20000000-0000-4000-8000-000000000003',
  teamProject:'40000000-0000-4000-8000-000000000001',restrictedProject:'40000000-0000-4000-8000-000000000002',privateProject:'40000000-0000-4000-8000-000000000003',
};
const client=new pg.Client({connectionString:process.env.AXIOM_STAGING_DATABASE_URL});
await client.connect();
const access=async(user,project)=>(await client.query('select public.ai_user_can_access_read_reference($1,\'process\',$2,null) as allowed',[user,project])).rows[0].allowed;
try{
  assert.equal(await access(ids.alice,ids.teamProject),true);
  assert.equal(await access(ids.alice,ids.restrictedProject),true);
  assert.equal(await access(ids.alice,ids.privateProject),true);
  assert.equal(await access(ids.bob,ids.teamProject),true);
  assert.equal(await access(ids.bob,ids.restrictedProject),false);
  assert.equal(await access(ids.bob,ids.privateProject),false);
  assert.equal(await access(ids.eve,ids.teamProject),false);
  await client.query('begin');
  await client.query('delete from public.project_members where project_id=$1 and user_id=$2',[ids.restrictedProject,ids.alice]);
  assert.equal(await access(ids.alice,ids.restrictedProject),false);
  await client.query('rollback');
  assert.equal(await access(ids.alice,ids.restrictedProject),true);
  console.log(JSON.stringify({stagingAcl:'passed',teamAccess:true,restrictedDenied:true,privateDenied:true,crossTenantDenied:true,revocationImmediate:true,revocationRolledBack:true}));
}catch(error){await client.query('rollback').catch(()=>undefined);throw error;}finally{await client.end();}
