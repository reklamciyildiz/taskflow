import { NextRequest, NextResponse } from 'next/server';
import { requireAIChatUser } from '@/lib/ai/chat/http-server';
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
    const scope = await requireAIChatUser(request);
    if (scope instanceof NextResponse) return scope;

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
      organizationId: scope.organizationId,
      userId: scope.userId,
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
      const statusCode = result.error?.code === 'RATE_LIMIT_EXCEEDED' || result.error?.code === 'PROVIDER_CAPACITY' ? 429 : 503;
      return NextResponse.json(result, { status: statusCode });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Description Generator API error:', error);

    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'AI description is unavailable. Please try again.' },
      },
      { status: 500 }
    );
  }
}
