import 'server-only';
import { GroqChatProvider } from '@/lib/ai/providers/groq-chat-provider';

/**
 * Optional, independently billed backup for read-only requests.
 *
 * Does not activate unless ALL settings are explicitly present. The endpoint
 * is fixed (no arbitrary-URL configuration or SSRF); API keys never enter
 * request JSON, browser code, chat history, logs or telemetry.
 *
 * Only invoke after a primary pre-response 429/5xx or primary admission deny.
 * Do not automatically repeat mutation/proposal requests or partial streams.
 */
export function createOptionalOpenAIBackup(): GroqChatProvider | null {
  if (process.env.AI_FALLBACK_OPENAI_ENABLED !== 'true') return null;
  const key = process.env.AI_FALLBACK_OPENAI_API_KEY?.trim();
  const model = process.env.AI_FALLBACK_OPENAI_MODEL?.trim();
  if (!key || !model || !/^[a-z0-9][a-z0-9_.:/-]{1,95}$/i.test(model)) return null;
  if (!process.env.AI_FALLBACK_TPM_BUDGET) return null;

  return new GroqChatProvider({
    providerId: 'openai',
    supportsGroqReasoning: false,
    apiKey: key,
    model,
    endpoint: 'https://api.openai.com/v1/chat/completions',
    maxInputTokens: 120_000,
    maxOutputTokens: 4_096,
    parallelToolCalls: false,
  });
}
