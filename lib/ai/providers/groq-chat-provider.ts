import { z } from 'zod';
import { estimateMessagesTokens, estimateTokens } from '@/lib/ai/utils/token-counter';
import type {
  AIProviderContext,
  AIProviderUsage,
  ChatMessage,
  ChatProvider,
  ChatRequest,
  ChatResponse,
  ChatStreamEvent,
  ChatToolCall,
  NormalizedAIProviderError,
} from './contracts';
import {
  AIProviderConfigurationError,
  AIProviderHttpError,
  AIProviderInputError,
  AIProviderResponseError,
  createRequestSignal,
  normalizeProviderError,
  parseRetryAfter,
} from './provider-http';

const toolCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal('function').optional(),
  function: z.object({
    name: z.string().min(1),
    arguments: z.string(),
  }),
});

const usageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative().optional(),
  completion_tokens: z.number().int().nonnegative().optional(),
  total_tokens: z.number().int().nonnegative().optional(),
}).optional().nullable();

const completionSchema = z.object({
  model: z.string().min(1),
  choices: z.array(z.object({
    message: z.object({
      content: z.string().nullable().optional(),
      tool_calls: z.array(toolCallSchema).optional(),
    }),
  })).min(1),
  usage: usageSchema,
});

const streamChunkSchema = z.object({
  model: z.string().min(1).optional(),
  choices: z.array(z.object({
    delta: z.object({
      content: z.string().nullable().optional(),
      tool_calls: z.array(z.object({
        index: z.number().int().nonnegative(),
        id: z.string().optional(),
        function: z.object({
          name: z.string().optional(),
          arguments: z.string().optional(),
        }).optional(),
      })).optional(),
    }),
  })).optional(),
  usage: usageSchema,
});

type FetchLike = typeof fetch;

export type GroqChatProviderOptions = {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  fetch?: FetchLike;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  parallelToolCalls?: boolean;
};

function parseToolArguments(value: string): unknown {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    throw new AIProviderResponseError();
  }
}

function toUsage(value: z.infer<typeof usageSchema>): AIProviderUsage {
  return {
    inputTokens: value?.prompt_tokens,
    outputTokens: value?.completion_tokens,
    totalTokens: value?.total_tokens,
  };
}

export class GroqChatProvider implements ChatProvider {
  readonly providerId = 'groq';
  readonly modelId: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly fetchImpl: FetchLike;
  private readonly maxInputTokens: number;
  private readonly maxOutputTokens: number;
  private readonly parallelToolCalls: boolean;

  constructor(options: GroqChatProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.GROQ_API_KEY ?? '';
    this.modelId = options.model ?? process.env.GROQ_CHAT_MODEL ?? 'qwen/qwen3.8-27b';
    this.endpoint = options.endpoint ?? 'https://api.groq.com/openai/v1/chat/completions';
    this.fetchImpl = options.fetch ?? fetch;
    this.maxInputTokens = options.maxInputTokens ?? 120_000;
    this.maxOutputTokens = options.maxOutputTokens ?? 16_384;
    this.parallelToolCalls = options.parallelToolCalls ?? false;
    if (!this.apiKey) throw new AIProviderConfigurationError('GROQ_API_KEY is not configured');
    if (!this.modelId) throw new AIProviderConfigurationError('GROQ_CHAT_MODEL is not configured');
  }

  normalizeError(error: unknown): NormalizedAIProviderError {
    return normalizeProviderError(error);
  }

  private validateRequest(request: ChatRequest): number {
    if (!request.messages.length) throw new AIProviderInputError('At least one chat message is required');
    if (request.temperature !== undefined && (request.temperature < 0 || request.temperature > 2)) {
      throw new AIProviderInputError('Temperature must be between 0 and 2');
    }
    if (this.modelId === 'qwen/qwen3.8-27b' && request.reasoning?.effort) {
      const supported = new Set(['none', 'default', 'low', 'medium', 'high']);
      if (!supported.has(request.reasoning.effort)) {
        throw new AIProviderInputError('qwen/qwen3.8-27b supports reasoning effort none, default, low, medium, or high');
      }
    }
    const maxOutputTokens = request.maxOutputTokens ?? Math.min(4_096, this.maxOutputTokens);
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > this.maxOutputTokens) {
      throw new AIProviderInputError(`maxOutputTokens must be between 1 and ${this.maxOutputTokens}`);
    }
    const toolText = request.tools ? JSON.stringify(request.tools) : '';
    const estimatedInputTokens = estimateMessagesTokens(request.messages) + estimateTokens(toolText);
    if (estimatedInputTokens > this.maxInputTokens) {
      throw new AIProviderInputError(`Estimated input exceeds the ${this.maxInputTokens} token safety limit`);
    }
    return maxOutputTokens;
  }

  private toMessages(messages: ChatMessage[]) {
    return messages.map((message) => {
      if (message.role === 'tool') {
        if (!message.toolCallId) throw new AIProviderInputError('Tool messages require toolCallId');
        return { role: 'tool', content: message.content, tool_call_id: message.toolCallId };
      }
      if (message.role === 'assistant' && message.toolCalls?.length) {
        return {
          role: 'assistant',
          content: message.content || null,
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) },
          })),
        };
      }
      return { role: message.role, content: message.content };
    });
  }

  private buildBody(request: ChatRequest, stream: boolean) {
    const maxOutputTokens = this.validateRequest(request);
    return {
      model: this.modelId,
      messages: this.toMessages(request.messages),
      ...(request.tools?.length ? {
        tools: request.tools.map((tool) => ({
          type: 'function',
          function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
        })),
        tool_choice: 'auto',
        parallel_tool_calls: this.parallelToolCalls,
      } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.reasoning?.effort ? { reasoning_effort: request.reasoning.effort } : {}),
      ...(request.reasoning?.format ? { reasoning_format: request.reasoning.format } : {}),
      max_completion_tokens: maxOutputTokens,
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
    };
  }

  private async fetchResponse(body: object, context: AIProviderContext, signal: AbortSignal) {
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-Client-Request-Id': context.requestId,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      throw new AIProviderHttpError(
        response.status,
        parseRetryAfter(response.headers.get('retry-after')),
        response.headers.get('x-request-id') ?? undefined,
      );
    }
    return response;
  }

  async complete(request: ChatRequest, context: AIProviderContext): Promise<ChatResponse> {
    const startedAt = performance.now();
    const requestSignal = createRequestSignal(context.timeoutMs, context.signal);
    try {
      const response = await this.fetchResponse(this.buildBody(request, false), context, requestSignal.signal);
      const parsed = completionSchema.safeParse(await response.json());
      if (!parsed.success) throw new AIProviderResponseError();
      const message = parsed.data.choices[0].message;
      if (message.content == null && !message.tool_calls?.length) throw new AIProviderResponseError();
      const toolCalls: ChatToolCall[] = (message.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: parseToolArguments(call.function.arguments),
      }));
      return {
        text: message.content ?? '',
        toolCalls,
        usage: toUsage(parsed.data.usage),
        model: parsed.data.model,
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } finally {
      requestSignal.cleanup();
    }
  }

  async *stream(request: ChatRequest, context: AIProviderContext): AsyncIterable<ChatStreamEvent> {
    const startedAt = performance.now();
    const requestSignal = createRequestSignal(context.timeoutMs, context.signal);
    const pendingTools = new Map<number, { id: string; name: string; arguments: string }>();
    let responseModel = this.modelId;
    try {
      const response = await this.fetchResponse(this.buildBody(request, true), context, requestSignal.signal);
      if (!response.body) throw new AIProviderResponseError();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;
      while (!finished) {
        const next = await reader.read();
        buffer += decoder.decode(next.value, { stream: !next.done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          if (data === '[DONE]') {
            finished = true;
            break;
          }
          let json: unknown;
          try { json = JSON.parse(data); } catch { throw new AIProviderResponseError(); }
          const parsed = streamChunkSchema.safeParse(json);
          if (!parsed.success) throw new AIProviderResponseError();
          if (parsed.data.model) responseModel = parsed.data.model;
          if (parsed.data.usage) yield { type: 'usage', usage: toUsage(parsed.data.usage) };
          for (const choice of parsed.data.choices ?? []) {
            if (choice.delta.content) yield { type: 'text_delta', text: choice.delta.content };
            for (const delta of choice.delta.tool_calls ?? []) {
              const current = pendingTools.get(delta.index) ?? { id: '', name: '', arguments: '' };
              if (delta.id) current.id = delta.id;
              if (delta.function?.name) current.name += delta.function.name;
              if (delta.function?.arguments) current.arguments += delta.function.arguments;
              pendingTools.set(delta.index, current);
            }
          }
        }
        if (next.done) finished = true;
      }
      for (const tool of [...pendingTools.entries()].sort(([a], [b]) => a - b).map(([, value]) => value)) {
        if (!tool.id || !tool.name) throw new AIProviderResponseError();
        yield {
          type: 'tool_call',
          toolCall: { id: tool.id, name: tool.name, arguments: parseToolArguments(tool.arguments) },
        };
      }
      yield { type: 'done', model: responseModel, latencyMs: Math.round(performance.now() - startedAt) };
    } finally {
      requestSignal.cleanup();
    }
  }
}
