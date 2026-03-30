/**
 * AI Configuration Types
 * Centralized type definitions for AI features
 */

export interface AIConfig {
  enabled: boolean;
  provider: 'openai' | 'claude';
  models: {
    text: string;
    speech: string;
  };
  features: {
    voiceToTask: boolean;
    descriptionGenerator: boolean;
    dailyStandup: boolean;
    blockerDetector: boolean;
  };
  limits: {
    maxAudioDuration: number; // seconds
    maxAudioSize: number; // bytes
    dailyRequestsPerUser: number;
    monthlyRequestsPerOrg: number;
  };
}

export interface AIRequestMetadata {
  organizationId: string;
  userId: string;
  feature: AIFeatureType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
}

export type AIFeatureType =
  | 'voice-to-task'
  | 'description-generator'
  | 'daily-standup'
  | 'blocker-detector'
  | 'suggest-subtasks'
  | 'smart-assign'
  | 'prioritization'
  | 'categorization';

export interface AIUsageStats {
  totalRequests: number;
  totalCost: number;
  successRate: number;
  averageLatency: number;
  featureBreakdown: Record<AIFeatureType, number>;
}
