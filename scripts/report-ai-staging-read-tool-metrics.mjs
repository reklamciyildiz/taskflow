import { readFileSync } from 'node:fs';
import { config,parse } from 'dotenv';
import pg from 'pg';

const production=parse(readFileSync('.env.local'));
config({path:'.env.staging.local',override:true,quiet:true});
const ref=(url)=>/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url??'')?.[1]??null;
const stagingRef=ref(process.env.NEXT_PUBLIC_SUPABASE_URL);
if(!stagingRef||stagingRef!==process.env.AXIOM_STAGING_SUPABASE_PROJECT_REF||stagingRef===ref(production.NEXT_PUBLIC_SUPABASE_URL))throw new Error('Metrics query refused: staging identity mismatch');
const client=new pg.Client({connectionString:process.env.AXIOM_STAGING_DATABASE_URL});
await client.connect();
try{
  const result=await client.query(`
    SELECT input_tokens,output_tokens,latency_ms,
      request_metadata->'readTools' AS tools,
      request_metadata->>'toolCallCount' AS tool_call_count,
      request_metadata->>'modelToolSelection' AS model_tool_selection
    FROM public.ai_requests
    WHERE user_id='20000000-0000-4000-8000-000000000001'
      AND feature='axiom-chat' AND success=true
    ORDER BY created_at DESC LIMIT 4
  `);
  console.log(JSON.stringify(result.rows));
}finally{await client.end();}
