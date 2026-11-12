import { estimateTokens } from '@/lib/ai/utils/token-counter';
import type { AIReadToolExecution } from './types';

/**
 * Never cut serialized JSON in the middle of a field. That destroys structural
 * meaning and hides pagination flags, which can make partial Process results
 * appear complete. Remove whole result entries instead and disclose the loss.
 */
export function buildAIReadToolContext(executions:AIReadToolExecution[],maxTokens=2_300):string {
  if(!executions.length)return '';
  const payload=executions.map((execution)=>({
    tool:execution.name,result:JSON.parse(JSON.stringify(execution.data??null)) as any,
  }));
  const serialize=()=>JSON.stringify(payload);
  if(estimateTokens(serialize())<=maxTokens)return serialize();

  const keys=['notes','latestNotes','latestActions','actions','processes','items','stages','sources'] as const;
  while(estimateTokens(serialize())>maxTokens){
    let removed=false;
    // Removing from the end preserves the highest-ranked/recent page results.
    for(const entry of [...payload].reverse()){
      const result=entry.result;
      if(!result||typeof result!=='object')continue;
      for(const key of keys){
        const values=result[key];
        if(Array.isArray(values)&&values.length){
          values.pop();result.contextWindowLimited=true;
          result.contextOmittedItems=(result.contextOmittedItems??0)+1;
          removed=true;break;
        }
      }
      if(removed)break;
    }
    if(!removed)break;
  }
  if(estimateTokens(serialize())<=maxTokens)return serialize();
  // Preserve truthful metadata; never return an invalid/truncated JSON prefix.
  const summary=payload.map((entry)=>({
    tool:entry.tool,result:{
      contextWindowLimited:true,
      message:'The authorized result exceeded the model context budget; do not infer missing contents or exact distributions.',
      ...(entry.result?.pagination?{pagination:entry.result.pagination}:{}),
      ...(entry.result?.completeness?{completeness:entry.result.completeness}:{}),
    },
  }));
  const serialized=JSON.stringify(summary);
  return estimateTokens(serialized)<=maxTokens
    ?serialized
    :JSON.stringify([{contextWindowLimited:true,message:'Process data exceeded context limit; ask for a narrower scope.'}]);
}
