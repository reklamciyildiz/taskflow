import type { ChatRequest } from './contracts';
import { AIProviderInputError } from './provider-http';

type Reasoning = ChatRequest['reasoning'];

const GPT_OSS_MODELS=new Set(['openai/gpt-oss-20b','openai/gpt-oss-120b']);
const QWEN_MODELS=new Set(['qwen/qwen3.8-27b']);

/**
 * Groq accepts different reasoning parameters per model family. In
 * particular GPT-OSS supports neither reasoning_effort=none nor
 * reasoning_format=hidden; silently forwarding those causes HTTP 400.
 *
 * This applies to both tool selection (non-streaming) and generation.
 * Independent non-Groq fallback providers retain their existing options.
 */
export function groqReasoningBodyOptions(input:{
  providerId:'groq'|'openai';
  modelId:string;
  supportsGroqReasoning:boolean;
  reasoning?:Reasoning;
}):Record<string, string|boolean>{
  const {providerId,modelId,supportsGroqReasoning,reasoning}=input;
  if(!supportsGroqReasoning||providerId!=='groq'||!reasoning)return {};
  if(GPT_OSS_MODELS.has(modelId)){
    const requested=reasoning.effort;
    const effort=requested==='none'?'low':requested==='default'?'medium':requested;
    if(effort && !['low','medium','high'].includes(effort)){
      throw new AIProviderInputError('Unsupported reasoning effort for GPT-OSS');
    }
    // GPT-OSS uses include_reasoning, NOT reasoning_format.
    return {
      ...(effort?{reasoning_effort:effort}:{}),
      ...(reasoning.format==='hidden'?{include_reasoning:false}:{}),
    };
  }
  if(QWEN_MODELS.has(modelId)){
    if(reasoning.effort&&!['none','default','low','medium','high'].includes(reasoning.effort))
      throw new AIProviderInputError('Unsupported reasoning effort for Qwen');
    return {
      ...(reasoning.effort?{reasoning_effort:reasoning.effort}:{}),
      ...(reasoning.format?{reasoning_format:reasoning.format}:{}),
    };
  }
  // For unknown Groq model families, omit unsupported optional tuning
  // rather than making a possibly invalid request.
  return {};
}

export function readToolSelectorMaxOutputTokens(modelId:string):number {
  // GPT-OSS's completion budget includes hidden reasoning tokens. A 280
  // token cap may end before it emits any usable function call.
  return GPT_OSS_MODELS.has(modelId)?640:280;
}
