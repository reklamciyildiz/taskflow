/** Public-facing errors and bounded retry decisions: no provider names or infrastructure jargon. */
export const AI_TEMPORARY_CAPACITY_MESSAGE =
  'Actiproc AI is experiencing higher demand right now. Your request was not completed. Please try again shortly.';
export const AI_TEMPORARY_SERVICE_MESSAGE =
  'Actiproc AI could not finish this response right now. Your request was not completed. Please try again.';
export const AI_RETRYING_MESSAGE = 'Temporary interruption detected. Retrying securely…';

export function safeAIErrorMessage(code: string, message?: string): string {
  if (code === 'PROVIDER_RATE_LIMITED' || code === 'PROVIDER_TOKEN_BUDGET'
    || code === 'TEMPORARY_CAPACITY') return AI_TEMPORARY_CAPACITY_MESSAGE;
  if (code === 'PROVIDER_TIMEOUT' || code === 'AI_UNAVAILABLE'
    || code === 'PROVIDER_CONFIGURATION') return AI_TEMPORARY_SERVICE_MESSAGE;
  // Historical failures may have persisted a raw provider-specific error.
  if (message && /\b(groq|429|tpm|rpm|rate.limit|provider.token|api\.groq)\b/i.test(message)) {
    return AI_TEMPORARY_CAPACITY_MESSAGE;
  }
  return message || AI_TEMPORARY_SERVICE_MESSAGE;
}

export function configuredTokenBudget(raw: string | undefined, fallback: number, ceiling: number): number {
  if (raw === undefined || !raw.trim()) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1_000 || parsed > ceiling) return fallback;
  return parsed;
}

/** Retry only before streaming content; never repeat tool effects or a partial answer. */
export function shortRetryDelayMs(retryAfterMs: number | undefined): number | null {
  if (retryAfterMs === undefined || !Number.isFinite(retryAfterMs)) return null;
  return retryAfterMs >= 0 && retryAfterMs <= 2_500
    ? Math.max(150, Math.ceil(retryAfterMs))
    : null;
}

export function mayFailOverBeforeResponse(input: {
  code: string;
  emittedText: boolean;
  aborted: boolean;
  fallbackAlreadyUsed: boolean;
  writeRequested: boolean;
}): boolean {
  return !input.emittedText && !input.aborted && !input.fallbackAlreadyUsed
    && !input.writeRequested
    && (input.code === 'rate_limited' || input.code === 'unavailable');
}
