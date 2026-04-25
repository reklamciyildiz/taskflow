import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { webhookDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import { getOrganizationEntitlements, getPlanLimits } from '@/lib/entitlements';

// GET /api/webhooks/[id] - Get webhook by ID
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

    const webhook = await webhookDb.getById(params.id);

    if (!webhook) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Webhook not found' },
        { status: 404 }
      );
    }

    // Check if user has access to this webhook's organization
    if (webhook.organization_id !== organizationId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: webhook,
    });
  } catch (error: any) {
    console.error('Error fetching webhook:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: error.message || 'Failed to fetch webhook' },
      { status: 500 }
    );
  }
}

// PATCH /api/webhooks/[id] - Update webhook
export async function PATCH(
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

    const userRole = (session.user as any).role;
    const organizationId = (session.user as any).organizationId;
    const ent = await getOrganizationEntitlements(organizationId);
    const limits = getPlanLimits(ent);
    if (!limits.canUseWebhooks) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Webhooks are available on the Team plan.' },
        { status: 402 }
      );
    }

    // Check permissions
    if (userRole !== 'admin' && userRole !== 'owner') {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

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

    const body = await request.json();
    const { name, url, events, active } = body;

    // Validate URL if provided
    if (url) {
      try {
        new URL(url);
      } catch {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Invalid URL format' },
          { status: 400 }
        );
      }
    }

    const updatedWebhook = await webhookDb.update(params.id, {
      name,
      url,
      events,
      active,
    });

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: updatedWebhook,
      message: 'Webhook updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating webhook:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: error.message || 'Failed to update webhook' },
      { status: 500 }
    );
  }
}

// DELETE /api/webhooks/[id] - Delete webhook
export async function DELETE(
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

    const userRole = (session.user as any).role;
    const organizationId = (session.user as any).organizationId;
    const ent = await getOrganizationEntitlements(organizationId);
    const limits = getPlanLimits(ent);
    if (!limits.canUseWebhooks) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Webhooks are available on the Team plan.' },
        { status: 402 }
      );
    }

    // Check permissions
    if (userRole !== 'admin' && userRole !== 'owner') {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

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

    await webhookDb.delete(params.id);

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      message: 'Webhook deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting webhook:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: error.message || 'Failed to delete webhook' },
      { status: 500 }
    );
  }
}
