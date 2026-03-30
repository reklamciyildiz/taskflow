/**
 * AI Request Types
 * Type definitions for AI API requests
 */

import { z } from 'zod';

/**
 * Voice-to-Task Request
 */
export const VoiceToTaskRequestSchema = z.object({
  audioFile: z.instanceof(File).or(z.instanceof(Blob)),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  language: z.string().optional().default('tr'),
});

export type VoiceToTaskRequest = z.infer<typeof VoiceToTaskRequestSchema>;

/**
 * Voice-to-Task Response
 */
export interface VoiceToTaskResponse {
  success: boolean;
  data?: {
    transcription: string;
    extractedTask: {
      title: string;
      description: string;
      priority?: 'low' | 'medium' | 'high';
      dueDate?: string;
      assignees?: string[];
      tags?: string[];
    };
    metadata: {
      audioLengthSeconds: number;
      processingTimeMs: number;
      tokensUsed: {
        whisper: number;
        gpt4: {
          input: number;
          output: number;
        };
      };
      costUsd: number;
    };
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Description Generator Request
 */
export const DescriptionGeneratorRequestSchema = z.object({
  title: z.string().min(1).max(200),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  context: z
    .object({
      projectName: z.string().optional(),
      teamMembers: z.array(z.string()).optional(),
      existingTasks: z.array(z.string()).optional(),
    })
    .optional(),
});

export type DescriptionGeneratorRequest = z.infer<
  typeof DescriptionGeneratorRequestSchema
>;

/**
 * Daily Standup Request
 */
export const DailyStandupRequestSchema = z.object({
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  date: z.string().datetime().optional(),
  includeStats: z.boolean().optional().default(true),
});

export type DailyStandupRequest = z.infer<typeof DailyStandupRequestSchema>;

/**
 * Blocker Detector Request
 */
export const BlockerDetectorRequestSchema = z.object({
  taskId: z.string().uuid(),
  taskTitle: z.string(),
  taskDescription: z.string().optional(),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  context: z
    .object({
      relatedTasks: z.array(z.string()).optional(),
      teamSize: z.number().optional(),
      deadline: z.string().datetime().optional(),
    })
    .optional(),
});

export type BlockerDetectorRequest = z.infer<typeof BlockerDetectorRequestSchema>;

/**
 * Generic AI Error
 */
export interface AIError {
  code: AIErrorCode;
  message: string;
  details?: unknown;
  retryable: boolean;
}

export type AIErrorCode =
  | 'DISABLED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'QUOTA_EXCEEDED'
  | 'INVALID_REQUEST'
  | 'AUDIO_TOO_LARGE'
  | 'AUDIO_TOO_LONG'
  | 'UNSUPPORTED_FORMAT'
  | 'TRANSCRIPTION_FAILED'
  | 'EXTRACTION_FAILED'
  | 'API_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';
