/**
 * Rate Limiter Utility
 * Handles rate limiting for AI features
 */

import { db } from '@/lib/supabase-admin';
import { getAIConfig } from '../config';

/**
 * Check if user has exceeded rate limit
 */
export const checkRateLimit = async (
  userId: string,
  organizationId: string,
  feature: string
): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  reason?: string;
}> => {
  const config = getAIConfig();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    // Check daily user limit
    const { count: dailyCount } = await db
      .from('ai_requests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', todayStart.toISOString());

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
    const { count: monthlyCount } = await db
      .from('ai_requests')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', monthStart.toISOString());

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
    // On error, allow the request (fail open)
    return {
      allowed: true,
      remaining: config.limits.dailyRequestsPerUser,
      resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
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
