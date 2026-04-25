import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { webhookDb } from '@/lib/db';
import { generateWebhookSecret } from '@/lib/webhooks';
import { ApiResponse } from '@/lib/types';
import { getOrganizationEntitlements, getPlanLimits } from '@/lib/entitlements';

// GET /api/webhooks - List all webhooks for organization
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const organizationId = (session.user as any).organizationId;
    if (!organizationId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'No organization found' },
        { status: 400 }
      );
    }

    const ent = await getOrganizationEntitlements(organizationId);
    const limits = getPlanLimits(ent);
    if (!limits.canUseWebhooks) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Webhooks are available on the Team plan.' },
        { status: 402 }
      );
    }

    const webhooks = await webhookDb.getByOrganization(organizationId);

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: webhooks,
    });
  } catch (error: any) {
    console.error('Error fetching webhooks:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: error.message || 'Failed to fetch webhooks' },
      { status: 500 }
    );
  }
}

// POST /api/webhooks - Create new webhook
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = (session.user as any).id;
    const organizationId = (session.user as any).organizationId;
    const userRole = (session.user as any).role;

    if (!organizationId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'No organization found' },
        { status: 400 }
      );
    }

    const ent = await getOrganizationEntitlements(organizationId);
    const limits = getPlanLimits(ent);
    if (!limits.canUseWebhooks) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Webhooks are available on the Team plan.' },
        { status: 402 }
      );
    }

    // Check if user has permission to create webhooks (admin or owner)
    if (userRole !== 'admin' && userRole !== 'owner') {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, url, events } = body;

    // Validate input
    if (!name || !url || !events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Missing required fields: name, url, events' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Generate webhook secret
    const secret = generateWebhookSecret();

    const webhook = await webhookDb.create({
      name,
      url,
      events,
      secret,
      organization_id: organizationId,
      created_by: userId,
    });

    return NextResponse.json<ApiResponse<any>>(
      {
        success: true,
        data: webhook,
        message: 'Webhook created successfully',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating webhook:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: error.message || 'Failed to create webhook' },
      { status: 500 }
    );
  }
}
