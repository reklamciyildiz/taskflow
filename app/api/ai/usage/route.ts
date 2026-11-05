import { NextRequest, NextResponse } from 'next/server';
import { requireAuthedUser } from '@/lib/server-authz';
import { aiAllowanceForAuthenticatedOrganization } from '@/lib/ai/chat/plan-access-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isAIBetaModeEnabled, isAIBetaScopeAllowed } from '@/lib/ai/beta-access';
import { isAIChatRuntimeReady } from '@/lib/ai/chat/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type AIUsageAccess = 'available' | 'beta_only' | 'not_ready';

async function aiUsageAccess(userId: string, organizationId: string): Promise<AIUsageAccess> {
  if (!isAIChatRuntimeReady() || process.env.AI_GROQ_TPM_ADMISSION_ENABLED !== 'true') return 'not_ready';
  if (isAIBetaModeEnabled()) {
    return isAIBetaScopeAllowed(userId, organizationId) ? 'available' : 'beta_only';
  }
  // Match the public chat gate. Never call an unverified rollout "available".
  if (process.env.AI_GROQ_TPM_ADMISSION_ENABLED !== 'true' ||
      process.env.AXIOM_AI_WRITE_TOOLS_ENABLED === 'true' ||
      process.env.AXIOM_AI_ACTION_MUTATION_TOOLS_ENABLED === 'true') return 'not_ready';
  const { data, error } = await supabaseAdmin.rpc('ai_public_burst_guard_ready');
  return !error && data === true ? 'available' : 'not_ready';
}

/**
 * User-authenticated, organization-scoped allowance summary.
 * This endpoint intentionally remains readable by non-beta users, so the
 * Billing page can display purchased plan rights BEFORE public activation.
 * Chat itself still uses the separate, stricter requireAIChatUser gate.
 */
export async function GET(request: NextRequest) {
  const authed = await requireAuthedUser(request);
  if (authed instanceof NextResponse) return authed;
  const userId = authed.user.id;
  const organizationId = authed.user.organization_id;
  if (!organizationId) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Organization required' } },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  }
  try {
    const allowance = await aiAllowanceForAuthenticatedOrganization(organizationId);
    const utcNow = new Date().toISOString();
    const userDate = utcNow.slice(0, 10);
    const orgMonth = utcNow.slice(0, 7) + '-01';
    const [userResult, orgResult, access] = await Promise.all([
      supabaseAdmin.from('ai_quota_counters').select('request_count')
        .eq('scope_type', 'user_day').eq('scope_id', userId)
        .eq('bucket_start', userDate).maybeSingle(),
      supabaseAdmin.from('ai_quota_counters').select('request_count')
        .eq('scope_type', 'organization_month').eq('scope_id', organizationId)
        .eq('bucket_start', orgMonth).maybeSingle(),
      aiUsageAccess(userId, organizationId),
    ]);
    if (userResult.error || orgResult.error) throw new Error('Quota counters unavailable');
    const usedDay = Math.max(0, Number(userResult.data?.request_count ?? 0));
    const usedMonth = Math.max(0, Number(orgResult.data?.request_count ?? 0));
    if (!Number.isFinite(usedDay) || !Number.isFinite(usedMonth)) throw new Error('Invalid quota counts');
    return NextResponse.json({
      plan: allowance.plan, access, period: allowance.period,
      includedSeats: allowance.includedSeats,
      daily: { used: usedDay, limit: allowance.dailyRequestsPerUser,
        remaining: Math.max(0, allowance.dailyRequestsPerUser - usedDay) },
      monthly: { used: usedMonth, limit: allowance.monthlyRequestsPerOrg,
        remaining: Math.max(0, allowance.monthlyRequestsPerOrg - usedMonth) },
      asOf: utcNow,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: { code: 'USAGE_UNAVAILABLE',
      message: 'AI allowance could not be verified' } }, { status: 503,
      headers: { 'Cache-Control': 'private, no-store' } });
  }
}
