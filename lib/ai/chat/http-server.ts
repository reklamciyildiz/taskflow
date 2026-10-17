import 'server-only';
import { NextResponse } from 'next/server';
import { requireAuthedUser } from '@/lib/server-authz';
import { isAIChatEnabled } from './config';
import { isAIBetaScopeAllowed } from '@/lib/ai/beta-access';

export async function requireAIChatUser() {
  if (!isAIChatEnabled()) {
    return NextResponse.json({ error:{ code:'FEATURE_DISABLED',message:'Axiom AI is not enabled' } },{ status:503 });
  }
  const authed=await requireAuthedUser();
  if (authed instanceof NextResponse) return authed;
  if (!authed.user.organization_id) {
    return NextResponse.json({ error:{ code:'FORBIDDEN',message:'Organization required' } },{ status:403 });
  }
  if (!isAIBetaScopeAllowed(authed.user.id,authed.user.organization_id)) {
    return NextResponse.json({ error:{ code:'BETA_ACCESS_REQUIRED',message:'Axiom AI is currently available to approved beta accounts only' } },{ status:403 });
  }
  return { userId:authed.user.id,organizationId:authed.user.organization_id };
}

export function chatErrorResponse(error:unknown) {
  const code=typeof error==='object' && error && 'code' in error ? String((error as any).code) : 'INTERNAL_ERROR';
  const message=error instanceof Error ? error.message : 'AI request failed';
  const status=code==='not_found' ? 404 : code==='conflict' ? 409 : code==='invalid_request' ? 400 : 500;
  return NextResponse.json({ error:{ code:code.toUpperCase(),message } },{ status });
}
