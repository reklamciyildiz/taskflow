export function isAIChatEnabled(): boolean {
  return process.env.AXIOM_AI_CHAT_ENABLED === 'true';
}

export function areAIReadToolsEnabled(): boolean {
  return process.env.AXIOM_AI_READ_TOOLS_ENABLED === 'true';
}

export function isAIChatRuntimeReady(): boolean {
  return isAIChatEnabled()
    && process.env.AI_ATOMIC_QUOTA_ENABLED === 'true'
    && Boolean(process.env.GROQ_API_KEY);
}

export const aiChatLimits = {
  maxMessageChars: 8_000,
  maxHistoryChars: 24_000,
  maxHistoryMessages: 16,
  maxOutputTokens: Math.min(4_096, Math.max(256, Number(process.env.AI_CHAT_MAX_OUTPUT_TOKENS ?? 2_048))),
  timeoutMs: Math.min(55_000, Math.max(10_000, Number(process.env.AI_CHAT_TIMEOUT_MS ?? 50_000))),
  userConcurrency: Math.min(10, Math.max(1, Number(process.env.AI_CHAT_USER_CONCURRENCY ?? 2))),
  organizationConcurrency: Math.min(200, Math.max(1, Number(process.env.AI_CHAT_ORG_CONCURRENCY ?? 20))),
};
