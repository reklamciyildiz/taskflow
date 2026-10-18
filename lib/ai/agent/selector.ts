import { randomUUID } from 'node:crypto';
import type { ChatMessage,ChatProvider } from '@/lib/ai/providers/contracts';
import { AI_READ_TOOL_DEFINITIONS } from './definitions';
import type { AIReadToolCall } from './types';

const SELECTOR_SYSTEM=`Select at most two read-only Axiom tools needed for the user's question.
Use no tool for ordinary conversation. Never invent IDs. Prefer processName when the user supplied a name.
Do not answer the question. You have no write tools.`;

export async function selectAIReadTools(input:{
  provider:ChatProvider;question:string;history:ChatMessage[];signal:AbortSignal;timeoutMs:number;
}):Promise<{ calls:AIReadToolCall[];inputTokens:number;outputTokens:number }> {
  const response=await input.provider.complete({
    messages:[{role:'system',content:SELECTOR_SYSTEM},...input.history.slice(-2),{role:'user',content:input.question}],
    tools:AI_READ_TOOL_DEFINITIONS,temperature:0,maxOutputTokens:280,reasoning:{effort:'none',format:'hidden'},
  },{requestId:randomUUID(),timeoutMs:Math.min(input.timeoutMs,10_000),signal:input.signal});
  const allowed=new Set(AI_READ_TOOL_DEFINITIONS.map((tool)=>tool.name));
  const calls=response.toolCalls.filter((tool)=>allowed.has(tool.name)).slice(0,2).map((tool)=>({
    id:tool.id,name:tool.name as AIReadToolCall['name'],arguments:tool.arguments,
  }));
  return {calls,inputTokens:response.usage.inputTokens??0,outputTokens:response.usage.outputTokens??0};
}
