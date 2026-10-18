import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const env=parse(readFileSync('.env.local'));
if (!env.NEXT_PUBLIC_SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Production Supabase configuration is unavailable');
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{
  auth:{ persistSession:false,autoRefreshToken:false },
});
const since=new Date(Date.now()-24*60*60*1_000).toISOString();
const { data,error }=await db.from('ai_requests')
  .select('created_at,model,input_tokens,output_tokens,success,error_message,latency_ms,request_metadata')
  .eq('feature','axiom-chat').gte('created_at',since).order('created_at',{ ascending:true });
if (error) throw new Error(`AI usage query failed: ${error.code??'unknown'}`);
const rows=(data??[]).map((row)=>({
  at:row.created_at,model:row.model,inputTokens:row.input_tokens,outputTokens:row.output_tokens,
  success:row.success,errorCode:row.error_message,latencyMs:row.latency_ms,
  contextProfile:row.request_metadata?.contextProfile,
  estimatedInputTokens:row.request_metadata?.estimatedInputTokens,
  citationCount:row.request_metadata?.citationCount,
}));
const { data:runs,error:runError }=await db.from('ai_chat_runs')
  .select('status,lease_expires_at,created_at').gte('created_at',since);
if (runError) throw new Error(`AI run query failed: ${runError.code??'unknown'}`);
const runStatus=Object.fromEntries(['running','completed','failed','cancelled'].map((status)=>[
  status,(runs??[]).filter((run)=>run.status===status).length,
]));
const activeLeases=(runs??[]).filter((run)=>run.status==='running'&&Date.parse(run.lease_expires_at)>Date.now()).length;
console.log(JSON.stringify({ requestCount:rows.length,rows,runStatus,activeLeases },null,2));
