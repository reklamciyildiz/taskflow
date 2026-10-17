import type { NormalizedAIProviderError } from './contracts';

export class AIProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIProviderConfigurationError';
  }
}

export class AIProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs?: number,
    readonly upstreamRequestId?: string,
  ) {
    super(`AI provider request failed with HTTP ${status}`);
    this.name = 'AIProviderHttpError';
  }
}

export class AIProviderResponseError extends Error {
  constructor() {
    super('AI provider returned an invalid response');
    this.name = 'AIProviderResponseError';
  }
}

export class AIProviderInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIProviderInputError';
  }
}

export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(value);
  if (!Number.isNaN(at)) return Math.max(0, at - Date.now());
  return undefined;
}

export function normalizeProviderError(error: unknown): NormalizedAIProviderError {
  if (error instanceof AIProviderConfigurationError) {
    return { code: 'configuration', message: error.message, retryable: false };
  }
  if (error instanceof AIProviderHttpError) {
    const code = error.status === 401 || error.status === 403
      ? 'unauthorized'
      : error.status === 429
        ? 'rate_limited'
        : error.status >= 500
          ? 'unavailable'
          : 'invalid_request';
    return {
      code,
      message: code === 'rate_limited'
        ? 'AI provider rate limit exceeded'
        : code === 'unavailable'
          ? 'AI provider is temporarily unavailable'
          : code === 'unauthorized'
            ? 'AI provider credentials were rejected'
            : 'AI provider rejected the request',
      retryable: error.status === 429 || error.status >= 500,
      providerStatus: error.status,
      retryAfterMs: error.retryAfterMs,
      upstreamRequestId: error.upstreamRequestId,
    };
  }
  if (error instanceof AIProviderInputError) {
    return { code: 'invalid_request', message: error.message, retryable: false };
  }
  if (error instanceof AIProviderResponseError) {
    return { code: 'unavailable', message: error.message, retryable: true };
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'timeout', message: 'AI provider request was cancelled or timed out', retryable: true };
  }
  if (error instanceof TypeError) {
    return { code: 'unavailable', message: 'AI provider network request failed', retryable: true };
  }
  return { code: 'unknown', message: 'Unexpected AI provider failure', retryable: false };
}

export function createRequestSignal(timeoutMs: number, external?: AbortSignal) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw new AIProviderConfigurationError('AI provider timeout must be between 1 and 300000 ms');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  external?.addEventListener('abort', onAbort, { once: true });
  if (external?.aborted) controller.abort();
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      external?.removeEventListener('abort', onAbort);
    },
  };
}

export async function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  await new Promise<void>((resolve, reject) => {
    const onResolve = () => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
    const timer = setTimeout(onResolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
