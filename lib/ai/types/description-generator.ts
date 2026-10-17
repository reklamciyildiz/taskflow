import { z } from 'zod';

export const DescriptionGeneratorRequestSchema = z.object({
  taskTitle: z.string().trim().min(1).max(500),
  taskId: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  context: z.object({
    projectName: z.string().max(240).optional(),
    existingDescription: z.string().max(10000).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    tags: z.array(z.string().max(80)).max(50).optional(),
  }).optional(),
});

export type DescriptionGeneratorRequest = z.infer<typeof DescriptionGeneratorRequestSchema>;

export interface DescriptionGeneratorResponse {
  success: boolean;
  data?: {
    generatedDescription: string;
    sections: {
      overview: string;
      acceptanceCriteria: string[];
      technicalRequirements: string[];
      potentialBlockers: string[];
    };
    metadata: {
      tokensUsed: number;
      costUsd: number;
      latencyMs: number;
      cached: boolean;
    };
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
