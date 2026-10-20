/**
 * AI Request Types
 * Type definitions for AI API requests
 */

import { z } from 'zod';

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
  | 'API_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';
