import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';

export type ProviderTokenAdmission = {
  allowed:boolean; reservationId?:string; remainingTokens:number; retryAfterSeconds?:number;
};

export function groqTokenBudget() {
  const configured=Number(process.env.AI_GROQ_TPM_BUDGET ?? 7_200);
  return Math.min(8_000,Math.max(1_000,Number.isFinite(configured)?Math.floor(configured):7_200));
}

export async function reserveGroqTokens(input:{
  requestKey:string;userId:string;organizationId:string;model:string;estimatedInputTokens:number;maxOutputTokens:number;
}):Promise<ProviderTokenAdmission> {
  if (process.env.AI_GROQ_TPM_ADMISSION_ENABLED!=='true') {
    return { allowed:true,remainingTokens:groqTokenBudget() };
  }
  const requested=Math.max(1,Math.ceil(input.estimatedInputTokens+input.maxOutputTokens));
  try {
    const { data,error }=await supabaseAdmin.rpc('reserve_ai_provider_tokens',{
      p_request_key:input.requestKey,p_user_id:input.userId,p_organization_id:input.organizationId,
      p_provider:'groq',p_model:input.model,p_requested_tokens:requested,p_token_limit:groqTokenBudget(),
    });
    if (error) throw error;
    const row=Array.isArray(data)?data[0]:data;
    if (!row||typeof row.allowed!=='boolean') throw new Error('Invalid provider token admission response');
    return { allowed:row.allowed,reservationId:row.reservation_id??undefined,
      remainingTokens:Number(row.remaining_tokens??0),retryAfterSeconds:Number(row.retry_after_seconds??0)||undefined };
  } catch(error) {
    console.error(JSON.stringify({ event:'ai_provider_token_admission_failed',code:'database_unavailable' }));
    return { allowed:false,remainingTokens:0,retryAfterSeconds:60 };
  }
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
