export type AIProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  audioSeconds?: number;
};

export type AIProviderContext = {
  requestId: string;
  timeoutMs: number;
  signal?: AbortSignal;
};

export type NormalizedAIProviderError = {
  code: 'configuration' | 'invalid_request' | 'unauthorized' | 'rate_limited' | 'timeout' | 'unavailable' | 'unknown';
  message: string;
  retryable: boolean;
  providerStatus?: number;
  retryAfterMs?: number;
  upstreamRequestId?: string;
  rateLimit?: {
    limitRequests?: number;
    remainingRequests?: number;
    resetRequests?: string;
    limitTokens?: number;
    remainingTokens?: number;
    resetTokens?: string;
  };
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ChatToolCall[];
};

export type ChatToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ChatToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export type ChatRequest = {
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
  temperature?: number;
  maxOutputTokens?: number;
  reasoning?: {
    effort?: 'none' | 'default' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
    format?: 'hidden' | 'raw' | 'parsed';
  };
};

export type ChatResponse = {
  text: string;
  toolCalls: ChatToolCall[];
  usage: AIProviderUsage;
  model: string;
  latencyMs: number;
};

export type ChatStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; toolCall: ChatToolCall }
  | { type: 'usage'; usage: AIProviderUsage }
  | { type: 'done'; model: string; latencyMs: number };

export interface ChatProvider {
  readonly providerId: string;
  readonly modelId: string;
  complete(request: ChatRequest, context: AIProviderContext): Promise<ChatResponse>;
  stream(request: ChatRequest, context: AIProviderContext): AsyncIterable<ChatStreamEvent>;
  normalizeError(error: unknown): NormalizedAIProviderError;
}

export type EmbeddingRequest = { texts: string[] };
export type EmbeddingResponse = {
  vectors: number[][];
  dimensions: number;
  usage: AIProviderUsage;
  model: string;
  latencyMs: number;
};

export interface EmbeddingProvider {
  readonly providerId: string;
  readonly modelId: string;
  readonly dimensions: number;
  embed(request: EmbeddingRequest, context: AIProviderContext): Promise<EmbeddingResponse>;
  normalizeError(error: unknown): NormalizedAIProviderError;
}

export type SpeechRequest = {
  audio: Blob;
  language?: string;
};

export type SpeechResponse = {
  text: string;
  language?: string;
  durationSeconds?: number;
  usage: AIProviderUsage;
  model: string;
};

export interface SpeechProvider {
  readonly providerId: string;
  readonly modelId: string;
  transcribe(request: SpeechRequest, context: AIProviderContext): Promise<SpeechResponse>;
  normalizeError(error: unknown): NormalizedAIProviderError;
}
