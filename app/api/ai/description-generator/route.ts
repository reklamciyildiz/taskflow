import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateTaskDescription } from '@/lib/ai/services/description-generator';
import { getAIConfig } from '@/lib/ai/config';
import type { DescriptionGeneratorRequest } from '@/lib/ai/types/description-generator';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const config = getAIConfig();
    if (!config.enabled || !config.features.descriptionGenerator) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FEATURE_DISABLED',
            message: 'Description Generator feature is currently disabled',
          },
        },
        { status: 503 }
      );
    }

    const body = await request.json();

    const descriptionRequest: DescriptionGeneratorRequest = {
      taskTitle: body.taskTitle,
      taskId: body.taskId,
      organizationId: (session.user as any).organizationId,
      userId: (session.user as any).id,
      context: body.context,
    };

    const result = await generateTaskDescription(descriptionRequest);

    if (!result.success) {
      const statusCode = result.error?.code === 'RATE_LIMIT_EXCEEDED' ? 429 : 500;
      return NextResponse.json(result, { status: statusCode });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Description Generator API error:', error);

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
