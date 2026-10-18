import type { SourceCitation } from '@/lib/ai/retrieval/types';
import type { AIReadReference } from '@/lib/ai/agent/types';

export type AIChatContext = {
  origin: 'global' | 'knowledge_hub';
  teamId?: string;
  processId?: string;
};

export type AIChatMessageStatus = 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled';

export type AIChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: AIChatMessageStatus;
  model: string | null;
  createdAt: string;
  sources: SourceCitation[];
  references?: AIReadReference[];
  activity?: string;
  sourceAccessRevoked?: boolean;
};

export type AIConversationSummary = {
  id: string;
  title: string;
  context: AIChatContext;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};

export type AIChatStreamEvent =
  | { type: 'meta'; conversationId: string; userMessageId: string; assistantMessageId: string }
  | { type: 'delta'; text: string }
  | { type: 'sources'; sources: SourceCitation[] }
  | { type: 'references'; references: AIReadReference[] }
  | { type: 'tool_status'; label: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { type: 'done'; finishReason: 'completed' | 'cancelled' }
  | { type: 'error'; code: string; message: string; retryable: boolean; retryAfterSeconds?: number };
