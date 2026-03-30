/**
 * Voice-to-Task API Endpoint
 * POST /api/ai/voice-to-task
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { processVoiceToTask, validateAudioFile } from '@/lib/ai/services/voice-to-task';
import { getAIConfig } from '@/lib/ai/config';
import type { VoiceToTaskRequest } from '@/lib/ai/types';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds max

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    // Check if AI features are enabled
    const config = getAIConfig();
    if (!config.enabled || !config.features.voiceToTask) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FEATURE_DISABLED',
            message: 'Voice-to-Task feature is currently disabled',
          },
        },
        { status: 503 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const language = (formData.get('language') as string) || 'tr';

    if (!audioFile) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Audio file is required',
          },
        },
        { status: 400 }
      );
    }

    // Validate audio file
    const validation = validateAudioFile(audioFile);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_AUDIO',
            message: validation.error,
          },
        },
        { status: 400 }
      );
    }

    // Prepare request
    const voiceToTaskRequest: VoiceToTaskRequest = {
      audioFile,
      organizationId: (session.user as any).organizationId,
      userId: (session.user as any).id,
      language,
    };

    // Process voice-to-task
    const result = await processVoiceToTask(voiceToTaskRequest);

    if (!result.success) {
      console.error('Voice-to-task failed:', result.error);
      const statusCode = result.error?.code === 'RATE_LIMIT_EXCEEDED' ? 429 : 500;
      return NextResponse.json(result, { status: statusCode });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Voice-to-Task API error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for feature status
 */
export async function GET() {
  const config = getAIConfig();

  return NextResponse.json({
    enabled: config.enabled && config.features.voiceToTask,
    limits: {
      maxAudioDuration: config.limits.maxAudioDuration,
      maxAudioSize: config.limits.maxAudioSize,
      dailyRequestsPerUser: config.limits.dailyRequestsPerUser,
    },
  });
}
