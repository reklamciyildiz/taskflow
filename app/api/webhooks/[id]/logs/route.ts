import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { webhookDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import { getOrganizationEntitlements, getPlanLimits } from '@/lib/entitlements';

// GET /api/webhooks/[id]/logs - Get webhook logs
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const organizationId = (session.user as any).organizationId;
    const ent = await getOrganizationEntitlements(organizationId);
    const limits = getPlanLimits(ent);
    if (!limits.canUseWebhooks) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Webhooks are available on the Team plan.' },
        { status: 402 }
      );
    }

    // Verify webhook belongs to user's organization
    const webhook = await webhookDb.getById(params.id);

    if (!webhook) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Webhook not found' },
        { status: 404 }
      );
    }

    if (webhook.organization_id !== organizationId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Get limit from query params
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const logs = await webhookDb.getLogs(params.id, limit);

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: logs,
    });
  } catch (error: any) {
    console.error('Error fetching webhook logs:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: error.message || 'Failed to fetch webhook logs' },
      { status: 500 }
    );
  }
}
