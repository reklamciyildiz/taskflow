import { z } from 'zod';

export const DescriptionGeneratorRequestSchema = z.object({
  taskTitle: z.string().min(1),
  taskId: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  context: z.object({
    projectName: z.string().optional(),
    existingDescription: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    tags: z.array(z.string()).optional(),
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
