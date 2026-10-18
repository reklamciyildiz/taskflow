import { buildChatMessages } from '../lib/ai/chat/prompt';
import { planChatContext } from '../lib/ai/chat/context-budget';
import { estimateMessagesTokens } from '../lib/ai/utils/token-counter';
import type { ChatMessage } from '../lib/ai/providers/contracts';
import type { SourceCitation } from '../lib/ai/retrieval/types';

const history:ChatMessage[]=Array.from({ length:16 },(_,index)=>({
  role:index%2?'assistant':'user',content:`Turn ${index}: ${'workspace discussion '.repeat(115)}`,
}));
const types=['note','action','checklist','process'] as const;
const citations:SourceCitation[]=Array.from({ length:8 },(_,index)=>({
  citationId:String(index+1).padStart(64,'a'),sourceDocumentId:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
  sourceType:types[index%4],sourceId:`source-${index}`,actionId:null,checklistItemId:null,noteId:null,processId:null,
  attachmentId:null,process:null,title:`Source ${index}`,snippet:`Relevant fact ${index}. ${'Supporting detail. '.repeat(90)}`,
  sourceUpdatedAt:new Date(0).toISOString(),chunk:{ id:String(index+1).padStart(64,'a'),ordinal:0 },
  index:{ version:'test',embeddingModel:'test' },score:{ mode:'hybrid',semantic:.8,keyword:.4,fused:.6,
    semanticRank:index+1,keywordRank:index+1 },navigation:{ target:types[index%4],actionId:null,sourceId:`source-${index}` },
}));

function legacyHistory(messages:ChatMessage[]) {
  let used=0;const selected:ChatMessage[]=[];
  for(const message of [...messages].reverse()) {
    if(used+message.content.length>24_000) break;
    selected.unshift(message);used+=message.content.length;
  }
  return selected;
}

for(const scenario of [
  { name:'general-long-history',intent:'general' as const,question:'Yeni bir fikir üzerinde düşünelim.',sources:[] as SourceCitation[] },
  { name:'narrow-rag',intent:'knowledge' as const,question:'Doğrulama kodu nedir?',sources:citations },
  { name:'broad-rag',intent:'knowledge' as const,question:'Tüm Process kaynaklarını özetle ve karşılaştır.',sources:citations },
]) {
  const beforeMessages=buildChatMessages({ history:legacyHistory(history),question:scenario.question,citations:scenario.sources });
  const beforeInput=estimateMessagesTokens(beforeMessages);
  const after=planChatContext({ intent:scenario.intent,question:scenario.question,history,citations:scenario.sources,
    configuredMaxOutputTokens:2_048 });
  console.log(JSON.stringify({ scenario:scenario.name,before:{ input:beforeInput,outputBudget:2_048,
    reserved:beforeInput+2_048,history:legacyHistory(history).length,sources:scenario.sources.length },after:{
    input:after.estimatedInputTokens,outputBudget:after.maxOutputTokens,reserved:after.estimatedInputTokens+after.maxOutputTokens,
    history:after.history.length,sources:after.citations.length },reservedReductionPercent:Math.round(
      (1-(after.estimatedInputTokens+after.maxOutputTokens)/(beforeInput+2_048))*100,
    ) }));
}
