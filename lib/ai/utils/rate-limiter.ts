/**
 * Rate Limiter Utility
 * Handles rate limiting for AI features
 */

import { db } from '@/lib/supabase-admin';
import { getAIConfig } from '../config';
import { randomUUID } from 'crypto';
import {
  quotaBackendFailureDecision,
  type AIQuotaDecision,
} from './quota-decision';

export { quotaBackendFailureDecision } from './quota-decision';
export type { AIQuotaDecision } from './quota-decision';

/**
 * Check if user has exceeded rate limit
 */
export const checkRateLimit = async (
  userId: string,
  organizationId: string,
  feature: string
): Promise<AIQuotaDecision> => {
  const config = getAIConfig();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    // Check daily user limit
    const { count: dailyCount, error: dailyError } = await db
      .from('ai_requests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', todayStart.toISOString());
    if (dailyError) throw dailyError;

    if ((dailyCount || 0) >= config.limits.dailyRequestsPerUser) {
      const resetAt = new Date(todayStart);
      resetAt.setDate(resetAt.getDate() + 1);

      return {
        allowed: false,
        remaining: 0,
        resetAt,
        reason: `Daily limit of ${config.limits.dailyRequestsPerUser} requests exceeded`,
      };
    }

    // Check monthly organization limit
    const { count: monthlyCount, error: monthlyError } = await db
      .from('ai_requests')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', monthStart.toISOString());
    if (monthlyError) throw monthlyError;

    if ((monthlyCount || 0) >= config.limits.monthlyRequestsPerOrg) {
      const resetAt = new Date(monthStart);
      resetAt.setMonth(resetAt.getMonth() + 1);

      return {
        allowed: false,
        remaining: 0,
        resetAt,
        reason: `Monthly organization limit of ${config.limits.monthlyRequestsPerOrg} requests exceeded`,
      };
    }

    // Calculate remaining requests
    const dailyRemaining = config.limits.dailyRequestsPerUser - (dailyCount || 0);
    const monthlyRemaining = config.limits.monthlyRequestsPerOrg - (monthlyCount || 0);
    const remaining = Math.min(dailyRemaining, monthlyRemaining);

    const resetAt = new Date(todayStart);
    resetAt.setDate(resetAt.getDate() + 1);

    return {
      allowed: true,
      remaining,
      resetAt,
    };
  } catch (error) {
    console.error('Rate limit check error:', error);
    // Provider calls are billable and may later execute tools. Never fail open.
    return quotaBackendFailureDecision();
  }
};

/**
 * Uses the transactional PostgreSQL reservation RPC when explicitly enabled.
 * The flag defaults off so deploying application code before the migration does
 * not break the existing legacy AI features. A missing/broken RPC fails closed.
 */
export const reserveAIQuota = async (
  userId: string,
  organizationId: string,
  feature: string,
  requestKey: string = randomUUID(),
): Promise<AIQuotaDecision> => {
  if (process.env.AI_ATOMIC_QUOTA_ENABLED !== 'true') {
    return checkRateLimit(userId, organizationId, feature);
  }

  const config = getAIConfig();
  try {
    const { data, error } = await db.rpc('reserve_ai_quota', {
      p_request_key: requestKey,
      p_user_id: userId,
      p_organization_id: organizationId,
      p_feature: feature,
      p_daily_user_limit: config.limits.dailyRequestsPerUser,
      p_monthly_org_limit: config.limits.monthlyRequestsPerOrg,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== 'boolean') {
      throw new Error('Invalid quota reservation response');
    }
    return {
      allowed: row.allowed,
      remaining: Number(row.remaining ?? 0),
      resetAt: new Date(row.reset_at),
      reason: row.reason ?? undefined,
      reservationId: row.reservation_id ?? undefined,
    };
  } catch (error) {
    console.error('Atomic AI quota reservation failed:', error instanceof Error ? error.message : 'unknown');
    return quotaBackendFailureDecision();
  }
};

export const releaseAIQuotaReservation = async (
  requestKey: string,userId: string,organizationId: string,
): Promise<boolean> => {
  if (process.env.AI_ATOMIC_QUOTA_ENABLED!=='true') return false;
  try {
    const { data,error }=await db.rpc('release_ai_quota_reservation',{
      p_request_key:requestKey,p_user_id:userId,p_organization_id:organizationId,
    });
    if (error) throw error;
    return data===true;
  } catch {
    console.error(JSON.stringify({ event:'ai_quota_release_failed',code:'database_unavailable' }));
    return false;
  }
};

/**
 * Get usage statistics for user
 */
export const getUserUsageStats = async (
  userId: string,
  organizationId: string
): Promise<{
  daily: {
    used: number;
    limit: number;
    remaining: number;
  };
  monthly: {
    used: number;
    limit: number;
    remaining: number;
  };
  totalCost: number;
}> => {
  const config = getAIConfig();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    // Daily stats
    const { count: dailyCount } = await db
      .from('ai_requests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', todayStart.toISOString());

    // Monthly stats
    const { data: monthlyData } = await db
      .from('ai_requests')
      .select('cost_usd')
      .eq('organization_id', organizationId)
      .gte('created_at', monthStart.toISOString());

    const monthlyCount = monthlyData?.length || 0;
    const totalCost = monthlyData?.reduce((sum: number, req: any) => sum + Number(req.cost_usd), 0) || 0;

    return {
      daily: {
        used: dailyCount || 0,
        limit: config.limits.dailyRequestsPerUser,
        remaining: Math.max(0, config.limits.dailyRequestsPerUser - (dailyCount || 0)),
      },
      monthly: {
        used: monthlyCount,
        limit: config.limits.monthlyRequestsPerOrg,
        remaining: Math.max(0, config.limits.monthlyRequestsPerOrg - monthlyCount),
      },
      totalCost,
    };
  } catch (error) {
    console.error('Usage stats error:', error);
    return {
      daily: {
        used: 0,
        limit: config.limits.dailyRequestsPerUser,
        remaining: config.limits.dailyRequestsPerUser,
      },
      monthly: {
        used: 0,
        limit: config.limits.monthlyRequestsPerOrg,
        remaining: config.limits.monthlyRequestsPerOrg,
      },
      totalCost: 0,
    };
  }
};

/**
 * Record AI request for rate limiting
 */
export const recordAIRequest = async (
  userId: string,
  organizationId: string,
  feature: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  latencyMs: number,
  success: boolean,
  errorMessage?: string,
  metadata?: Record<string, unknown>
): Promise<void> => {
  try {
    await db.from('ai_requests').insert({
      user_id: userId,
      organization_id: organizationId,
      feature,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      latency_ms: latencyMs,
      success,
      error_message: errorMessage,
      request_metadata: metadata,
    });
  } catch (error) {
    console.error('Record AI request error:', error);
  }
};
