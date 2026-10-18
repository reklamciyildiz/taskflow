import type { ChatMessage } from '@/lib/ai/providers/contracts';
import type { SourceCitation } from '@/lib/ai/retrieval/types';
import { estimateMessagesTokens,estimateTokens,truncateToTokenLimit } from '@/lib/ai/utils/token-counter';
import type { ChatIntent } from './intent';
import { buildChatMessages } from './prompt';

type ContextProfile = 'general'|'rag_narrow'|'rag_broad'|'structured';

export type PlannedChatContext = {
  profile: ContextProfile;
  history: ChatMessage[];
  citations: SourceCitation[];
  messages: ChatMessage[];
  estimatedInputTokens: number;
  maxOutputTokens: number;
  droppedHistoryMessages: number;
  droppedCitations: number;
  droppedStructuredActions: number;
};

const BROAD_QUERY = /\b(ozet|özet|summary|summarize|tum|tüm|hepsi|all|across|karsilastir|karşılaştır|analiz|analysis|genel bakis|genel bakış)\b/i;

export function chatRetrievalLimit(question:string) {
  return BROAD_QUERY.test(question) ? 8 : 4;
}

function profileFor(intent: ChatIntent,question: string,citationCount: number): ContextProfile {
  if (intent==='structured') return 'structured';
  if (citationCount>0) return BROAD_QUERY.test(question) ? 'rag_broad' : 'rag_narrow';
  return 'general';
}

function limits(profile:ContextProfile,configuredOutput:number) {
  const values = profile==='rag_broad'
    ? { input:4_600,history:700,sources:3_200,output:1_000,maxSources:7 }
    : profile==='rag_narrow'
      ? { input:3_500,history:650,sources:2_300,output:800,maxSources:4 }
      : profile==='structured'
        ? { input:3_800,history:700,sources:0,output:800,maxSources:0 }
        : { input:1_900,history:1_100,sources:0,output:600,maxSources:0 };
  return { ...values,output:Math.min(configuredOutput,values.output) };
}

function recentHistory(history:ChatMessage[],budget:number) {
  let used=0; const selected:ChatMessage[]=[];
  for (const message of [...history].reverse()) {
    const cost=estimateTokens(message.content)+4;
    if (selected.length>0 && used+cost>budget) break;
    if (cost>budget) continue;
    selected.unshift(message);used+=cost;
  }
  return selected;
}

function uniqueCitations(citations:SourceCitation[]) {
  const seen=new Set<string>();
  return citations.filter((citation)=>{
    const normalized=citation.snippet.toLocaleLowerCase('tr-TR').replace(/\s+/g,' ').trim();
    const key=`${citation.sourceDocumentId}:${normalized}`;
    if (seen.has(key)) return false;
    seen.add(key);return true;
  });
}

function diverseCitations(citations:SourceCitation[],maxSources:number,broad:boolean) {
  const unique=uniqueCitations(citations);
  if (!broad) return unique.slice(0,maxSources);
  const selected:SourceCitation[]=[]; const used=new Set<string>(); const usedTypes=new Set<string>();
  for (const citation of unique) {
    if (usedTypes.has(citation.sourceType)) continue;
    selected.push(citation);used.add(citation.citationId);usedTypes.add(citation.sourceType);
    if (selected.length===maxSources) return selected;
  }
  for (const citation of unique) {
    if (used.has(citation.citationId)) continue;
    selected.push(citation);
    if (selected.length===maxSources) break;
  }
  return selected;
}

function fitCitationText(citations:SourceCitation[],budget:number) {
  if (!citations.length) return citations;
  const perSource=Math.max(100,Math.floor(budget/citations.length)-45);
  return citations.map((citation)=>({ ...citation,snippet:truncateToTokenLimit(citation.snippet,perSource) }));
}

export function planChatContext(input:{
  intent:ChatIntent; question:string; history:ChatMessage[]; citations:SourceCitation[];
  structured?: Parameters<typeof buildChatMessages>[0]['structured']; configuredMaxOutputTokens:number;
}):PlannedChatContext {
  const profile=profileFor(input.intent,input.question,input.citations.length);
  const budget=limits(profile,input.configuredMaxOutputTokens);
  let history=recentHistory(input.history,budget.history);
  let citations=fitCitationText(
    diverseCitations(input.citations,budget.maxSources,profile==='rag_broad'),budget.sources,
  );
  let structured=input.structured;
  let messages=buildChatMessages({ history,question:input.question,citations,structured });
  let estimatedInputTokens=estimateMessagesTokens(messages);

  // Preserve verified evidence before conversational history. If the complete
  // payload still exceeds the profile, remove oldest history and then the
  // lowest-ranked source. Explicit knowledge always keeps at least one source.
  while (estimatedInputTokens>budget.input && history.length) {
    history=history.slice(1);
    messages=buildChatMessages({ history,question:input.question,citations,structured });
    estimatedInputTokens=estimateMessagesTokens(messages);
  }
  while (estimatedInputTokens>budget.input && citations.length>1) {
    citations=citations.slice(0,-1);
    messages=buildChatMessages({ history,question:input.question,citations,structured });
    estimatedInputTokens=estimateMessagesTokens(messages);
  }
  while (estimatedInputTokens>budget.input && structured && structured.actions.length>1) {
    structured={ actions:structured.actions.slice(0,-1),hasMore:true };
    messages=buildChatMessages({ history,question:input.question,citations,structured });
    estimatedInputTokens=estimateMessagesTokens(messages);
  }
  return {
    profile,history,citations,messages,estimatedInputTokens,maxOutputTokens:budget.output,
    droppedHistoryMessages:input.history.length-history.length,
    droppedCitations:input.citations.length-citations.length,
    droppedStructuredActions:(input.structured?.actions.length??0)-(structured?.actions.length??0),
  };
}
