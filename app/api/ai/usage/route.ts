import { NextRequest, NextResponse } from 'next/server';
import { requireAIChatUser } from '@/lib/ai/chat/http-server';
import { aiAllowanceForAuthenticatedOrganization } from '@/lib/ai/chat/plan-access-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Private current-month usage from the same atomic counters as the chat admission RPC. */
export async function GET(request: NextRequest) {
  const scope = await requireAIChatUser(request);
  if (scope instanceof NextResponse) return scope;
  try {
    const allowance = await aiAllowanceForAuthenticatedOrganization(scope.organizationId);
    const utcNow = new Date().toISOString();
    const userDate = utcNow.slice(0, 10);
    const orgMonth = utcNow.slice(0, 7) + '-01';
    const [userResult, orgResult] = await Promise.all([
      supabaseAdmin.from('ai_quota_counters').select('request_count')
        .eq('scope_type', 'user_day').eq('scope_id', scope.userId)
        .eq('bucket_start', userDate).maybeSingle(),
      supabaseAdmin.from('ai_quota_counters').select('request_count')
        .eq('scope_type', 'organization_month').eq('scope_id', scope.organizationId)
        .eq('bucket_start', orgMonth).maybeSingle(),
    ]);
    if (userResult.error || orgResult.error) throw new Error('Quota counters unavailable');
    const usedDay = Math.max(0, Number(userResult.data?.request_count ?? 0));
    const usedMonth = Math.max(0, Number(orgResult.data?.request_count ?? 0));
    return NextResponse.json({
      plan: allowance.plan,
      period: allowance.period,
      includedSeats: allowance.includedSeats,
      daily: { used: usedDay, limit: allowance.dailyRequestsPerUser,
        remaining: Math.max(0, allowance.dailyRequestsPerUser - usedDay) },
      monthly: { used: usedMonth, limit: allowance.monthlyRequestsPerOrg,
        remaining: Math.max(0, allowance.monthlyRequestsPerOrg - usedMonth) },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: { code: 'USAGE_UNAVAILABLE',
      message: 'AI allowance could not be verified' } }, { status: 503,
      headers: { 'Cache-Control': 'private, no-store' } });
  }
}
