export type AIQuotaDecision = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  reason?: string;
  reservationId?: string;
};

export function quotaBackendFailureDecision(now = Date.now()): AIQuotaDecision {
  return {
    allowed: false,
    remaining: 0,
    resetAt: new Date(now + 5 * 60 * 1000),
    reason: 'AI usage limits could not be verified. Please try again shortly.',
  };
}
