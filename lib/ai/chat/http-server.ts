import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthedUser } from '@/lib/server-authz';
import { isAIChatEnabled, isAIChatRuntimeReady } from './config';
import { isAIBetaModeEnabled, isAIBetaScopeAllowed } from '@/lib/ai/beta-access';

export async function requireAIChatUser(request?: NextRequest) {
  if (!isAIChatEnabled()) {
    return NextResponse.json({ error:{ code:'FEATURE_DISABLED',message:'Actiproc AI is not enabled' } },{ status:503 });
  }
  // Public rollout is deliberately stricter than closed beta. A missing or
  // broken provider-token admission RPC must not expose unmetered public AI.
  if (!isAIBetaModeEnabled() &&
      (!isAIChatRuntimeReady() || process.env.AI_GROQ_TPM_ADMISSION_ENABLED !== 'true')) {
    return NextResponse.json({ error:{ code:'PUBLIC_ROLLOUT_NOT_READY',
      message:'Actiproc AI public access requires atomic quotas, provider credentials and provider token admission' } },
      { status:503 });
  }
  const authed=await requireAuthedUser(request);
  if (authed instanceof NextResponse) return authed;
  if (!authed.user.organization_id) {
    return NextResponse.json({ error:{ code:'FORBIDDEN',message:'Organization required' } },{ status:403 });
  }
  if (!isAIBetaScopeAllowed(authed.user.id,authed.user.organization_id)) {
    return NextResponse.json({ error:{ code:'BETA_ACCESS_REQUIRED',message:'Actiproc AI is currently available to approved beta accounts only' } },{ status:403 });
  }
  return { userId:authed.user.id,organizationId:authed.user.organization_id,role:authed.user.role??null };
}

export function chatErrorResponse(error:unknown) {
  const code=typeof error==='object' && error && 'code' in error ? String((error as any).code) : 'INTERNAL_ERROR';
  const message=error instanceof Error ? error.message : 'AI request failed';
  const status=code==='not_found' ? 404 : code==='conflict' ? 409 : code==='invalid_request' ? 400 : 500;
  return NextResponse.json({ error:{ code:code.toUpperCase(),message } },{ status });
}
