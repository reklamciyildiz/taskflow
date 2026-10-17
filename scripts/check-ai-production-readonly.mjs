import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const production = parse(readFileSync('.env.local'));
const staging = parse(readFileSync('.env.staging.local'));
if (!production.NEXT_PUBLIC_SUPABASE_URL
  || production.NEXT_PUBLIC_SUPABASE_URL === staging.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Production/staging identity guard failed');
}
if (!production.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Production service role is unavailable');
if (!production.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error('Production anon key is unavailable');

const client = createClient(production.NEXT_PUBLIC_SUPABASE_URL,production.SUPABASE_SERVICE_ROLE_KEY,{
  auth:{ persistSession:false,autoRefreshToken:false },
});
const tables=[
  'ai_quota_counters','ai_quota_reservations','ai_source_documents','ai_chunks','ai_index_jobs',
  'ai_conversations','ai_messages','ai_message_sources','ai_chat_runs',
];
const result={};
const anon=createClient(production.NEXT_PUBLIC_SUPABASE_URL,production.NEXT_PUBLIC_SUPABASE_ANON_KEY,{
  auth:{ persistSession:false,autoRefreshToken:false },
});
for (const table of tables) {
  const { error }=await client.from(table).select('*',{ head:true,count:'exact' }).limit(0);
  const { error:anonError }=await anon.from(table).select('*',{ head:true,count:'exact' }).limit(0);
  result[table]={
    serviceRole:error?`missing_or_denied:${error.code ?? 'unknown'}`:'available',
    anon:anonError?'denied':'UNEXPECTEDLY_ALLOWED',
  };
}
const { error:healthError }=await client.rpc('ai_index_queue_health');
const { error:anonHealthError }=await anon.rpc('ai_index_queue_health');
result.ai_index_queue_health={
  serviceRole:healthError?`missing_or_denied:${healthError.code ?? 'unknown'}`:'available',
  anon:anonHealthError?'denied':'UNEXPECTEDLY_ALLOWED',
};

console.log(JSON.stringify(result,null,2));
