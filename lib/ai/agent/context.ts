import { estimateTokens,truncateToTokenLimit } from '@/lib/ai/utils/token-counter';
import type { AIReadToolExecution } from './types';

export function buildAIReadToolContext(executions:AIReadToolExecution[],maxTokens=2_300):string {
  if(!executions.length)return '';
  const payload=executions.map((execution)=>({tool:execution.name,result:execution.data}));
  const serialized=JSON.stringify(payload);
  return estimateTokens(serialized)<=maxTokens?serialized:truncateToTokenLimit(serialized,maxTokens);
}
