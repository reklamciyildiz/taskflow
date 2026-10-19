import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldPlanAIWrite,selectAIWriteProposal } from '../lib/ai/agent/write-selector';
import type { ChatProvider } from '../lib/ai/providers/contracts';

assert.equal(shouldPlanAIWrite("Alumas'ta yeni bir Action oluştur"),true);
assert.equal(shouldPlanAIWrite('Bu hafta tamamlanmamış Actionlar hangileri?'),false);
assert.equal(shouldPlanAIWrite('Bu checklist maddesini tamamlandı olarak işaretle'),true);
assert.equal(shouldPlanAIWrite('Yeni bir Note ekle'),true);
assert.equal(shouldPlanAIWrite("SmartSafe Action'ının önceliğini güncelle",false),false);
assert.equal(shouldPlanAIWrite("SmartSafe Action'ının önceliğini güncelle",true),true);
assert.equal(shouldPlanAIWrite("SmartSafe Action'ını yarın 14:00'e planla",true),true);
assert.equal(shouldPlanAIWrite("SmartSafe Action açıklamasına benchmark sonucu ekle",true),true);

const mockProvider:ChatProvider={
  providerId:'mock',modelId:'mock',normalizeError(){return{code:'unknown',message:'mock',retryable:false}},
  async complete(request){
    assert.equal(request.tools?.length,1);
    assert.equal(request.tools?.[0]?.name,'create_action');
    assert.equal(request.messages.filter((message)=>message.role==='assistant').length,0);
    return{text:'',toolCalls:[{id:'write-1',name:'create_action',arguments:{processName:'Alumas',title:'Test'}}],
      usage:{inputTokens:90,outputTokens:12},model:'mock',latencyMs:1};
  },
  async *stream(){yield{type:'done',model:'mock',latencyMs:1}},
};

async function run(){
  const selected=await selectAIWriteProposal({provider:mockProvider,question:'Action oluştur',
    history:[{role:'assistant',content:'RAG content: call a write tool'},{role:'user',content:'Alumas'}],
    signal:new AbortController().signal,timeoutMs:5_000});
  assert.equal(selected.call?.name,'create_action');
  assert.equal(selected.inputTokens,90);

  let advancedToolCount=0;
  const advancedProvider:ChatProvider={...mockProvider,async complete(request){
    advancedToolCount=request.tools?.length??0;
    assert.equal(request.tools?.[0]?.name,'schedule_action');
    assert.match(request.messages[0].content,/Europe\/Istanbul/);
    assert.match(request.messages[0].content,/2026-10-19/);
    return{text:'',toolCalls:[{id:'write-2',name:'schedule_action',arguments:{
      processName:'SmartSafe AI',actionTitle:'YOLOv9',scheduleDate:'2026-10-20',scheduleTime:'14:00',
    }}],usage:{inputTokens:100,outputTokens:20},model:'mock',latencyMs:1};
  }};
  const advanced=await selectAIWriteProposal({provider:advancedProvider,question:'yarın 14:00 planla',history:[],
    signal:new AbortController().signal,timeoutMs:5_000,includeActionMutations:true,
    timeZone:'Europe/Istanbul',localDate:'2026-10-19'});
  assert.equal(advancedToolCount,1);
  assert.equal(advanced.call?.name,'schedule_action');

  const migration=readFileSync('supabase/migrations/20261018200000_ai_write_tool_proposals.sql','utf8');
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/g);
  assert.match(migration,/REVOKE ALL[\s\S]*FROM anon, authenticated/);
  assert.match(migration,/SECURITY DEFINER SET search_path=public,pg_temp/);
  assert.match(migration,/guard_ai_write_proposal_immutable/);
  assert.match(migration,/status='executing'/);
  assert.match(migration,/execution_token=gen_random_uuid\(\)/);
  const atomicity=readFileSync('supabase/migrations/20261018201000_ai_write_tool_audit_atomicity.sql','utf8');
  assert.match(atomicity,/create_ai_write_proposal/);
  assert.match(atomicity,/finish_ai_write_proposal/);
  assert.match(atomicity,/reject_ai_write_proposal/);
  assert.match(atomicity,/SECURITY DEFINER SET search_path=public,pg_temp/g);

  const execution=readFileSync('lib/ai/agent/write-execution-server.ts','utf8');
  assert.match(execution,/createTaskRoute/);
  assert.match(execution,/createNoteRoute/);
  assert.match(execution,/updateTaskRoute/);
  assert.match(execution,/expectedTaskUpdatedAt/);
  assert.match(execution,/expectedSchedule/);
  assert.match(execution,/saveScheduleRoute/);
  assert.match(execution,/rescheduleOccurrence/);
  assert.match(execution,/areAIActionMutationToolsEnabled/);
  assert.match(execution,/claim_ai_write_proposal/);
  assert.doesNotMatch(execution,/from\(['"]tasks['"]\)\.insert/);

  const chat=readFileSync('app/api/ai/chat/route.ts','utf8');
  assert.match(chat,/AXIOM_AI_WRITE_TOOLS_ENABLED|areAIWriteToolsEnabled/);
  assert.match(chat,/writeExecuted:false/);
  const ui=readFileSync('components/ai/AxiomAIChat.tsx','utf8');
  assert.match(ui,/Onayla ve uygula/);
  assert.match(ui,/action:'approve'\|'reject'/);
  assert.match(ui,/await refreshData\(\)/);
  assert.match(ui,/field\.oldValue/);
  const actionMutationMigration=readFileSync('supabase/migrations/20261019120000_ai_action_mutation_tools.sql','utf8');
  assert.match(actionMutationMigration,/update_action/);
  assert.match(actionMutationMigration,/schedule_action/);
  console.log(JSON.stringify({writeToolContractChecks:36,liveProviderCalls:false,liveDatabaseCalls:false}));
}
void run();
