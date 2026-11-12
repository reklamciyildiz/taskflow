import type { ChatIntent } from './intent';

export const ROUTED_GROQ_MODELS = [
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
] as const;

export type RoutedGroqModel = (typeof ROUTED_GROQ_MODELS)[number];
export type ModelRoute = 'legacy' | 'general' | 'deep';

export interface ChatModelDecision {
  model: string;
  route: ModelRoute;
  routed: boolean;
  maxOutputTokens: number;
  rolloutBucket: number;
  reason: 'disabled' | 'write_pinned' | 'canary_not_selected' | 'deep_analysis' | 'general_conversation';
}

export interface ModelRouterEnv {
  AI_MODEL_ROUTING_ENABLED?: string;
  AI_MODEL_ROUTING_ROLLOUT_PERCENT?: string;
  AI_PROVIDER_ADMISSION_V2_ENABLED?: string;
  AI_MODEL_GENERAL?: string;
  AI_MODEL_DEEP?: string;
  GROQ_CHAT_MODEL?: string;
}

function parsePercent(raw: string | undefined): number {
  if (!raw || !/^(?:0|[1-9]\d?|100)$/.test(raw)) return 0;
  return Number(raw);
}

export function isSupportedRoutedModel(value: string): value is RoutedGroqModel {
  return (ROUTED_GROQ_MODELS as readonly string[]).includes(value);
}

function configuredModel(raw: string | undefined, fallback: RoutedGroqModel): RoutedGroqModel {
  return raw && isSupportedRoutedModel(raw) ? raw : fallback;
}

/** Stable, deterministic organization-level canary. No PII, network or DB lookup. */
export function modelRoutingBucket(organizationId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < organizationId.length; i += 1) {
    hash ^= organizationId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

const deepSignals =
  /\b(analy[sz]\w*|analyse|analysis|compare|comparison|evaluate|reason\w*|insights?|strateg\w*|conclusion\w*|recommend\w*|infer\w*|summari[sz]\w*|synthesize|degerlendir\w*|karsilastir\w*|cikarim\w*|analiz\w*|ozetle\w*|stratej\w*|oner\w*|neden\w*|detayli\w*)\b/u;

export function selectChatModel(input: {
  intent: ChatIntent;
  question: string;
  profile: 'general' | 'structured' | 'rag_narrow' | 'rag_broad';
  writeRequested: boolean;
  organizationId: string;
  configuredMaxOutputTokens: number;
  env?: ModelRouterEnv;
}): ChatModelDecision {
  const env = input.env ?? process.env;
  const original = env.GROQ_CHAT_MODEL || 'qwen/qwen3.8-27b';
  const bucket = modelRoutingBucket(input.organizationId);
  const base = {
    model: original,
    route: 'legacy' as ModelRoute,
    routed: false,
    maxOutputTokens: input.configuredMaxOutputTokens,
    rolloutBucket: bucket,
  };
  if (input.writeRequested) return { ...base, reason: 'write_pinned' };
  // Model routing is deliberately coupled to the cross-model atomic admission
  // RPC so new traffic cannot evade a provider-wide RPM/TPM ceiling.
  if (env.AI_MODEL_ROUTING_ENABLED !== 'true' || env.AI_PROVIDER_ADMISSION_V2_ENABLED !== 'true') {
    return { ...base, reason: 'disabled' };
  }
  if (bucket >= parsePercent(env.AI_MODEL_ROUTING_ROLLOUT_PERCENT)) {
    return { ...base, reason: 'canary_not_selected' };
  }
  const normalized = input.question.toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').normalize('NFKD').replace(/\p{M}/gu, '');
  const deep = input.profile === 'rag_broad' || input.profile === 'rag_narrow'
    || input.intent === 'knowledge' || deepSignals.test(normalized);
  const model = deep
    ? configuredModel(env.AI_MODEL_DEEP, 'qwen/qwen3.8-27b')
    : configuredModel(env.AI_MODEL_GENERAL, 'openai/gpt-oss-120b');
  return {
    model, route: deep ? 'deep' : 'general', routed: true,
    maxOutputTokens: Math.min(input.configuredMaxOutputTokens, deep ? 1_000 : 600),
    rolloutBucket: bucket,
    reason: deep ? 'deep_analysis' : 'general_conversation',
  };
}
