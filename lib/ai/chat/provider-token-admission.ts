import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { configuredTokenBudget } from './reliability-policy';
import { providerCapacityPolicy } from './provider-capacity-policy';

export type ProviderTokenAdmission = {
  allowed:boolean; reservationId?:string; remainingTokens:number; retryAfterSeconds?:number;
  reason?:'oversized'|'capacity'|'disabled'|'unavailable';requestedTokens?:number;
};

/** The configured admission cap must be at or below the *actual* account/model
 * capacity. The default remains deliberately conservative until measured.
 * No arbitrary 8k cap stops a verified paid account from using its capacity. */
export function groqTokenBudget(model?:string) {
  const accountBase=configuredTokenBudget(process.env.AI_GROQ_TPM_BUDGET,7_200,250_000);
  // A model-specific cap cannot override an unverified account ceiling.
  const specific=model==='qwen/qwen3.8-27b'?process.env.AI_GROQ_QWEN_TPM_BUDGET
    :model==='openai/gpt-oss-120b'||model==='openai/gpt-oss-20b'
      ?process.env.AI_GROQ_GPT_OSS_TPM_BUDGET :undefined;
  return specific?Math.min(accountBase,configuredTokenBudget(specific,accountBase,250_000)):accountBase;
}

export function backupTokenBudget() {
  return configuredTokenBudget(process.env.AI_FALLBACK_TPM_BUDGET,7_200,250_000);
}

export async function reserveProviderTokens(input:{
  requestKey:string;userId:string;organizationId:string;model:string;estimatedInputTokens:number;maxOutputTokens:number;
  provider:'groq'|'openai';tokenLimit:number;
}):Promise<ProviderTokenAdmission> {
  // Production AI must fail closed when admission is not configured.
  if (process.env.AI_GROQ_TPM_ADMISSION_ENABLED!=='true') {
    return { allowed:false,remainingTokens:0,reason:'disabled' };
  }
  const requested=Math.max(1,Math.ceil(input.estimatedInputTokens+input.maxOutputTokens));
  if (requested>input.tokenLimit) {
    return { allowed:false,remainingTokens:0,reason:'oversized',requestedTokens:requested };
  }
  try {
    const useV2=process.env.AI_PROVIDER_ADMISSION_V2_ENABLED==='true';
    const policy=providerCapacityPolicy({provider:input.provider,modelTokenLimit:input.tokenLimit});
    const { data,error }=useV2
      ?await supabaseAdmin.rpc('reserve_ai_provider_tokens_v2',{
        p_request_key:input.requestKey,p_user_id:input.userId,p_organization_id:input.organizationId,
        p_provider:input.provider,p_model:input.model,p_requested_tokens:requested,
        p_model_token_limit:policy.modelTokenLimit,
        p_provider_token_limit:policy.providerTokenLimit,
        p_model_request_limit:policy.modelRequestLimit,
        p_provider_request_limit:policy.providerRequestLimit,
      })
      :await supabaseAdmin.rpc('reserve_ai_provider_tokens',{
        p_request_key:input.requestKey,p_user_id:input.userId,p_organization_id:input.organizationId,
        p_provider:input.provider,p_model:input.model,p_requested_tokens:requested,p_token_limit:input.tokenLimit,
      });
    if (error) throw error;
    const row=Array.isArray(data)?data[0]:data;
    if (!row||typeof row.allowed!=='boolean') throw new Error('Invalid provider token admission response');
    return { allowed:row.allowed,reservationId:row.reservation_id??undefined,
      remainingTokens:Number(row.remaining_tokens??0),retryAfterSeconds:Number(row.retry_after_seconds??0)||undefined,
      requestedTokens:requested,reason:row.allowed?undefined:'capacity' };
  } catch(error) {
    console.error(JSON.stringify({ event:'ai_provider_token_admission_failed',code:'database_unavailable' }));
    return { allowed:false,remainingTokens:0,reason:'unavailable',requestedTokens:requested };
  }
}

export async function reserveGroqTokens(input:{
  requestKey:string;userId:string;organizationId:string;model:string;estimatedInputTokens:number;maxOutputTokens:number;
}):Promise<ProviderTokenAdmission> {
  return reserveProviderTokens({ ...input, provider:'groq', tokenLimit:groqTokenBudget(input.model) });
}

export async function finalizeGroqTokens(input:{
  reservationId?:string;userId:string;status:'completed'|'failed'|'cancelled';actualTokens?:number;
}) {
  if (!input.reservationId) return;
  const { error }=await supabaseAdmin.rpc('finalize_ai_provider_tokens',{
    p_reservation_id:input.reservationId,p_user_id:input.userId,p_status:input.status,
    p_actual_tokens:input.actualTokens??null,
  });
  if (error) console.error(JSON.stringify({ event:'ai_provider_token_finalization_failed',code:'database_unavailable' }));
}
