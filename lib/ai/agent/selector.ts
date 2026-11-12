import { randomUUID } from 'node:crypto';
import type { ChatMessage,ChatProvider } from '@/lib/ai/providers/contracts';
import { AI_READ_TOOL_DEFINITIONS } from './definitions';
import { estimateMessagesTokens, estimateTokens } from '@/lib/ai/utils/token-counter';
import type { AIReadToolCall } from './types';
import type { AIChatContext } from '@/lib/ai/chat/types';

const SELECTOR_SYSTEM=`You are Actiproc's read-only data tool planner. Select at most two tools ONLY if the user's question needs current, authorized workspace information.
Use semantic intent recognition across Turkish and English, informal wording, inflections, spelling errors, pronouns and the last turns. Do not rely on exact keywords. Ordinary general questions need no tool.
When asked for the most recent written/added Note or "last note", choose get_notes with sort=created_desc, authorScope=mine and limit=1; for last edited Note, choose sort=updated_desc. Team-wide Notes require authorScope=accessible.
For Notes topic searches use get_notes for live canonical title/content matching or search_knowledge for semantic RAG. For complex comparisons use the relevant Notes/Process tools. "No tool" is not appropriate if a user clearly asks about their stored data.
Never invent a Team ID, Process ID or Process name. Only use a name explicitly supplied by the user, or the authorized context provided by the request. Do not answer the question. You have no write tools.`;

/** Budget for actual selector prompt + registered tool schemas, not an
 * arbitrary 3,500-token padding on every ambiguous question. */
export function estimateAIReadToolSelectionTokens(question:string,history:ChatMessage[],context?:AIChatContext):number {
  return estimateMessagesTokens([
    {role:'system',content:SELECTOR_SYSTEM},...(context?[{role:'system' as const,content:selectionContext(context)}]:[]),
    ...history.slice(-2),{role:'user',content:question},
  ]) + estimateTokens(JSON.stringify(AI_READ_TOOL_DEFINITIONS));
}

function selectionContext(context:AIChatContext):string {
  return 'Server-provided conversation scope (IDs are not user text): '+
    JSON.stringify({teamId:context.teamId??null,processId:context.processId??null})+
    '. Use these IDs only when relevant; the server revalidates ACL.';
}

export async function selectAIReadTools(input:{
  provider:ChatProvider;question:string;history:ChatMessage[];signal:AbortSignal;timeoutMs:number;context?:AIChatContext;
}):Promise<{ calls:AIReadToolCall[];inputTokens:number;outputTokens:number }> {
  const response=await input.provider.complete({
    messages:[{role:'system',content:SELECTOR_SYSTEM},...(input.context?[{role:'system' as const,content:selectionContext(input.context)}]:[]),
      ...input.history.slice(-2),{role:'user',content:input.question}],
    tools:AI_READ_TOOL_DEFINITIONS,temperature:0,maxOutputTokens:280,reasoning:{effort:'none',format:'hidden'},
  },{requestId:randomUUID(),timeoutMs:Math.min(input.timeoutMs,10_000),signal:input.signal});
  const allowed=new Set(AI_READ_TOOL_DEFINITIONS.map((tool)=>tool.name));
  const calls=response.toolCalls.filter((tool)=>allowed.has(tool.name)).slice(0,2).map((tool)=>({
    id:tool.id,name:tool.name as AIReadToolCall['name'],arguments:tool.arguments,
  }));
  return {calls,inputTokens:response.usage.inputTokens??0,outputTokens:response.usage.outputTokens??0};
}
