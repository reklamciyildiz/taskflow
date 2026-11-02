import type { Entitlements, PlanName } from '@/lib/entitlements';
import { isPaidActive } from '@/lib/subscription-access';
import { AI_PLAN_LIMITS, aiPlanMonthlyLimit, AI_MAX_FUNDED_SEATS } from '@/lib/ai/ai-plan-catalog';

export type AIPlanAllowance = {
  plan: PlanName;
  dailyRequestsPerUser: number;
  monthlyRequestsPerOrg: number;
  includedSeats: number;
  /** This is a shared organization pool, not a separate subscription charge. */
  period: 'calendar_month_utc';
};

/** Generous introductory caps; monitor real model and retrieval costs before revising. Do not treat messages as free compute. */
export function aiAllowanceForOrganization(ent: Pick<Entitlements,
  'plan' | 'subscriptionStatus' | 'endsAt' | 'seatLimit'>): AIPlanAllowance {
  const paid = isPaidActive(ent.subscriptionStatus, ent.endsAt);
  const plan: PlanName = paid && ent.plan !== 'free' ? ent.plan : 'free';
  // A non-finite seat entitlement is intentionally not an unlimited AI pool.
  const seats = Number.isFinite(ent.seatLimit)
    ? Math.min(AI_MAX_FUNDED_SEATS, Math.max(1, Math.floor(ent.seatLimit)))
    : 1;
  const limits = AI_PLAN_LIMITS[plan];
  return {
    plan,
    dailyRequestsPerUser: limits.dailyPerUser,
    monthlyRequestsPerOrg: aiPlanMonthlyLimit(plan, seats),
    includedSeats: limits.perSeat ? seats : 1,
    period: 'calendar_month_utc',
  };
}

/**
 * Groq published USD per million token rates, subject to model/pricing changes.
 * Unlisted models are deliberately estimated conservatively, never recorded as free.
 * This is accounting telemetry, NOT an authorization or spend-limit guarantee.
 */
export function estimateGroqChatCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing: Record<string, readonly [number, number]> = {
    'openai/gpt-oss-20b': [0.075, 0.30],
    'openai/gpt-oss-120b': [0.15, 0.60],
    'qwen/qwen3.8-27b': [0.80, 4.00],
    'llama-3.1-8b-instant': [0.05, 0.08],
  };
  const [inputRate, outputRate] = pricing[model] ?? [2.0, 8.0];
  const safeInput = Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0;
  const safeOutput = Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0;
  return Math.round((safeInput * inputRate + safeOutput * outputRate) / 1_000_000 * 1e8) / 1e8;
}
