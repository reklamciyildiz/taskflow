import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {config,parse} from 'dotenv';
import pg from 'pg';
const production=parse(readFileSync('.env.local'));config({path:'.env.staging.local',override:true,quiet:true});
const ref=(url)=>/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url??'')?.[1]??null,staging=ref(process.env.NEXT_PUBLIC_SUPABASE_URL);
if(!staging||staging!==process.env.AXIOM_STAGING_SUPABASE_PROJECT_REF||staging===ref(production.NEXT_PUBLIC_SUPABASE_URL))throw new Error('Staging schema check refused: project identity mismatch');
const client=new pg.Client({connectionString:process.env.AXIOM_STAGING_DATABASE_URL});
try{await client.connect();
  const tables=await client.query(`select c.relname,c.relrowsecurity,
    has_table_privilege('anon',c.oid,'select') anon_select,
    has_table_privilege('authenticated',c.oid,'select') authenticated_select,
    has_table_privilege('service_role',c.oid,'select') service_select
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('ai_write_proposals','ai_write_audit_events') order by c.relname`);
  assert.equal(tables.rowCount,2);for(const row of tables.rows){assert.equal(row.relrowsecurity,true);assert.equal(row.anon_select,false);assert.equal(row.authenticated_select,false);assert.equal(row.service_select,true);}
  const functions=await client.query(`select p.proname,p.prosecdef,p.proconfig,
    has_function_privilege('anon',p.oid,'execute') anon_execute,
    has_function_privilege('authenticated',p.oid,'execute') authenticated_execute,
    has_function_privilege('service_role',p.oid,'execute') service_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname in ('create_ai_write_proposal','claim_ai_write_proposal','finish_ai_write_proposal','reject_ai_write_proposal') order by p.proname`);
  assert.equal(functions.rowCount,4);for(const row of functions.rows){assert.equal(row.prosecdef,true);assert.ok(row.proconfig?.includes('search_path=public, pg_temp'));assert.equal(row.anon_execute,false);assert.equal(row.authenticated_execute,false);assert.equal(row.service_execute,true);}
  console.log(JSON.stringify({stagingWriteSchema:'passed',rlsTables:2,serviceOnlyRpcs:4,productionAccess:false,writesPerformed:false}));
}finally{await client.end().catch(()=>undefined);}
