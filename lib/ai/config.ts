/**
 * AI Configuration
 * Central configuration for all AI features
 */

import { AIConfig } from './types';

/**
 * Check if AI features are enabled
 */
export const isAIEnabled = (): boolean => {
  return process.env.AI_FEATURES_ENABLED === 'true';
};

/**
 * Check if OpenAI API key is configured
 */
export const hasOpenAIKey = (): boolean => {
  return !!process.env.OPENAI_API_KEY;
};

/**
 * Get AI configuration
 */
export const getAIConfig = (): AIConfig => {
  return {
    enabled: isAIEnabled() && hasOpenAIKey(),
    provider: 'openai',
    models: {
      text: process.env.OPENAI_TEXT_MODEL || 'gpt-4o',
      speech: process.env.OPENAI_SPEECH_MODEL || 'whisper-1',
    },
    features: {
      voiceToTask: process.env.AI_VOICE_TO_TASK_ENABLED !== 'false',
      descriptionGenerator: process.env.AI_DESCRIPTION_GENERATOR_ENABLED !== 'false',
      dailyStandup: process.env.AI_DAILY_STANDUP_ENABLED !== 'false',
      blockerDetector: process.env.AI_BLOCKER_DETECTOR_ENABLED !== 'false',
    },
    limits: {
      maxAudioDuration: parseInt(process.env.AI_MAX_AUDIO_DURATION || '300', 10), // 5 minutes
      maxAudioSize: parseInt(process.env.AI_MAX_AUDIO_SIZE || '26214400', 10), // 25MB
      dailyRequestsPerUser: parseInt(process.env.AI_DAILY_REQUESTS_PER_USER || '10', 10),
      monthlyRequestsPerOrg: parseInt(
        process.env.AI_MONTHLY_REQUESTS_PER_ORG || '100',
        10
      ),
    },
  };
};

/**
 * AI Feature flags
 */
export const AI_FEATURES = {
  VOICE_TO_TASK: 'voice-to-task',
  DESCRIPTION_GENERATOR: 'description-generator',
  DAILY_STANDUP: 'daily-standup',
  BLOCKER_DETECTOR: 'blocker-detector',
} as const;

/**
 * OpenAI Model Pricing (per 1M tokens)
 */
export const OPENAI_PRICING = {
  'gpt-4-turbo': {
    input: 10.0,
    output: 30.0,
  },
  'gpt-4o': {
    input: 5.0,
    output: 15.0,
  },
  'gpt-3.5-turbo': {
    input: 0.5,
    output: 1.5,
  },
  'whisper-1': {
    perMinute: 0.006,
  },
} as const;

/**
 * Calculate cost for text generation
 */
export const calculateTextCost = (
  model: string,
  inputTokens: number,
  outputTokens: number
): number => {
  const pricing = OPENAI_PRICING[model as keyof typeof OPENAI_PRICING];
  if (!pricing || !('input' in pricing)) return 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
};

/**
 * Calculate cost for audio transcription
 */
export const calculateAudioCost = (durationSeconds: number): number => {
  const durationMinutes = durationSeconds / 60;
  return durationMinutes * OPENAI_PRICING['whisper-1'].perMinute;
};

/**
 * Error messages
 */
export const AI_ERROR_MESSAGES = {
  DISABLED: 'AI features are currently disabled',
  NO_API_KEY: 'OpenAI API key is not configured',
  RATE_LIMIT: 'Rate limit exceeded. Please try again later',
  QUOTA_EXCEEDED: 'Monthly quota exceeded',
  AUDIO_TOO_LARGE: 'Audio file is too large',
  AUDIO_TOO_LONG: 'Audio duration exceeds maximum allowed',
  INVALID_FORMAT: 'Unsupported audio format',
  TRANSCRIPTION_FAILED: 'Failed to transcribe audio',
  EXTRACTION_FAILED: 'Failed to extract task information',
  NETWORK_ERROR: 'Network error occurred',
  UNKNOWN_ERROR: 'An unknown error occurred',
} as const;
