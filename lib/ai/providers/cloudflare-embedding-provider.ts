import { z } from 'zod';
import type {
  AIProviderContext,
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResponse,
  NormalizedAIProviderError,
} from './contracts';
import {
  AIProviderConfigurationError,
  AIProviderHttpError,
  AIProviderInputError,
  AIProviderResponseError,
  abortableDelay,
  createRequestSignal,
  normalizeProviderError,
  parseRetryAfter,
} from './provider-http';

const cloudflareEmbeddingSchema = z.object({
  success: z.literal(true),
  result: z.object({
    data: z.array(z.array(z.number())),
    shape: z.array(z.number().int().nonnegative()).optional(),
  }),
});

type FetchLike = typeof fetch;

export type CloudflareEmbeddingProviderOptions = {
  accountId?: string;
  apiToken?: string;
  model?: string;
  fetch?: FetchLike;
  baseUrl?: string;
  dimensions?: number;
  maxBatchSize?: number;
  maxTextCharacters?: number;
  maxRetries?: number;
  maxRetryDelayMs?: number;
};

export class CloudflareEmbeddingProvider implements EmbeddingProvider {
  readonly providerId = 'cloudflare-workers-ai';
  readonly modelId: string;
  readonly dimensions: number;
  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;
  private readonly maxBatchSize: number;
  private readonly maxTextCharacters: number;
  private readonly maxRetries: number;
  private readonly maxRetryDelayMs: number;

  constructor(options: CloudflareEmbeddingProviderOptions = {}) {
    this.accountId = options.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
    this.apiToken = options.apiToken ?? process.env.CLOUDFLARE_AI_API_TOKEN ?? '';
    this.modelId = options.model ?? process.env.CLOUDFLARE_EMBEDDING_MODEL ?? '@cf/baai/bge-m3';
    this.fetchImpl = options.fetch ?? fetch;
    this.baseUrl = (options.baseUrl ?? 'https://api.cloudflare.com/client/v4').replace(/\/$/, '');
    this.dimensions = options.dimensions ?? 1_024;
    this.maxBatchSize = options.maxBatchSize ?? 32;
    this.maxTextCharacters = options.maxTextCharacters ?? 200_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 2_000;
    if (!this.accountId) throw new AIProviderConfigurationError('CLOUDFLARE_ACCOUNT_ID is not configured');
    if (!this.apiToken) throw new AIProviderConfigurationError('CLOUDFLARE_AI_API_TOKEN is not configured');
    if (!this.modelId) throw new AIProviderConfigurationError('CLOUDFLARE_EMBEDDING_MODEL is not configured');
  }

  normalizeError(error: unknown): NormalizedAIProviderError {
    return normalizeProviderError(error);
  }

  private validateInput(request: EmbeddingRequest) {
    if (!Array.isArray(request.texts) || request.texts.length < 1) {
      throw new AIProviderInputError('At least one embedding text is required');
    }
    if (request.texts.length > this.maxBatchSize) {
      throw new AIProviderInputError(`Embedding batch exceeds the ${this.maxBatchSize} item limit`);
    }
    for (const text of request.texts) {
      if (typeof text !== 'string' || !text.trim()) {
        throw new AIProviderInputError('Embedding texts must be non-empty strings');
      }
      if (text.length > this.maxTextCharacters) {
        throw new AIProviderInputError(`Embedding text exceeds the ${this.maxTextCharacters} character limit`);
      }
    }
  }

  private get endpoint() {
    const modelPath = this.modelId.split('/').map(encodeURIComponent).join('/');
    return `${this.baseUrl}/accounts/${encodeURIComponent(this.accountId)}/ai/run/${modelPath}`;
  }

  async embed(request: EmbeddingRequest, context: AIProviderContext): Promise<EmbeddingResponse> {
    this.validateInput(request);
    const startedAt = performance.now();
    const requestSignal = createRequestSignal(context.timeoutMs, context.signal);
    try {
      let response: Response | undefined;
      for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
        try {
          response = await this.fetchImpl(this.endpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.apiToken}`,
              'Content-Type': 'application/json',
              'X-Client-Request-Id': context.requestId,
            },
            body: JSON.stringify({ text: request.texts }),
            signal: requestSignal.signal,
          });
        } catch (error) {
          if (requestSignal.signal.aborted || attempt === this.maxRetries) throw error;
          await abortableDelay(
            Math.min(this.maxRetryDelayMs, 250 * (2 ** attempt)),
            requestSignal.signal,
          );
          continue;
        }
        if (response.ok) break;
        const retryable = response.status === 429 || response.status >= 500;
        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
        if (!retryable || attempt === this.maxRetries) {
          throw new AIProviderHttpError(
            response.status,
            retryAfterMs,
            response.headers.get('cf-ray') ?? undefined,
          );
        }
        const backoffMs = Math.min(
          this.maxRetryDelayMs,
          retryAfterMs ?? 250 * (2 ** attempt),
        );
        await abortableDelay(backoffMs, requestSignal.signal);
      }
      if (!response?.ok) throw new AIProviderResponseError();
      const parsed = cloudflareEmbeddingSchema.safeParse(await response.json());
      if (!parsed.success) throw new AIProviderResponseError();
      const vectors = parsed.data.result.data;
      if (vectors.length !== request.texts.length) throw new AIProviderResponseError();
      if (parsed.data.result.shape) {
        const [rows, columns] = parsed.data.result.shape;
        if (rows !== request.texts.length || columns !== this.dimensions) {
          throw new AIProviderResponseError();
        }
      }
      for (const vector of vectors) {
        if (vector.length !== this.dimensions || vector.some((value) => !Number.isFinite(value))) {
          throw new AIProviderResponseError();
        }
      }
      return {
        vectors,
        dimensions: this.dimensions,
        usage: {},
        model: this.modelId,
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } finally {
      requestSignal.cleanup();
    }
  }
}
