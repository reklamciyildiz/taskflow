import { NextRequest, NextResponse } from 'next/server';
import { requireAuthedUser } from '@/lib/server-authz';
import { generateTaskDescription } from '@/lib/ai/services/description-generator';
import { getAIConfig } from '@/lib/ai/config';
import {
  DescriptionGeneratorRequestSchema,
  type DescriptionGeneratorRequest,
} from '@/lib/ai/types/description-generator';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const authed = await requireAuthedUser();
    if (authed instanceof NextResponse) return authed;
    if (!authed.user.organization_id) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Organization required' } },
        { status: 403 },
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
    const parsed = DescriptionGeneratorRequestSchema.safeParse({
      taskTitle: body.taskTitle,
      taskId: body.taskId,
      organizationId: authed.user.organization_id,
      userId: authed.user.id,
      context: body.context,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'Invalid description request' } },
        { status: 400 },
      );
    }
    const descriptionRequest: DescriptionGeneratorRequest = parsed.data;

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
