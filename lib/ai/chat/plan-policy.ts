import type { Entitlements, PlanName } from '@/lib/entitlements';
import { isPaidActive } from '@/lib/subscription-access';

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
  // Always derive purchased capacity from server-side entitlements. Developer
  // accounts with Infinity are not allowed unlimited AI; stop scaling at 20
  // paid seats pending a separately-priced enterprise agreement.
  const seats = Number.isFinite(ent.seatLimit)
    ? Math.min(20, Math.max(1, Math.floor(ent.seatLimit)))
    : 1;
  if (plan === 'individual') return {
    plan, dailyRequestsPerUser: 50, monthlyRequestsPerOrg: 300, includedSeats: 1, period: 'calendar_month_utc',
  };
  if (plan === 'pro') return {
    plan, dailyRequestsPerUser: 100, monthlyRequestsPerOrg: 800 * seats, includedSeats: seats,
    period: 'calendar_month_utc',
  };
  if (plan === 'team') return {
    plan, dailyRequestsPerUser: 150, monthlyRequestsPerOrg: 1200 * seats, includedSeats: seats,
    period: 'calendar_month_utc',
  };
  return { plan: 'free', dailyRequestsPerUser: 10, monthlyRequestsPerOrg: 30, includedSeats: 1,
    period: 'calendar_month_utc' };
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
