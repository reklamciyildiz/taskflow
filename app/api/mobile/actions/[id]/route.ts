import { NextRequest } from 'next/server';
import { executeAIReadTool, AIReadToolError } from '@/lib/ai/agent/read-tools';
import { authenticateMobileRequest, MobileAuthError, mobileErrorResponse, mobileJson, mobileOptions } from '@/lib/mobile-auth/server';
import type { MobileActionDetail } from '@/shared/mobile-contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) { return mobileOptions(request); }

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user } = await authenticateMobileRequest(request);
    if (!user.organization_id) throw new MobileAuthError('NOT_FOUND', 404, 'Action was not found.');
    const result = await executeAIReadTool('get_action_details', { actionId: params.id }, {
      userId: String(user.id),
      organizationId: String(user.organization_id),
      role: user.role ? String(user.role) : null,
    });
    return mobileJson(request, { success: true, data: result.data as MobileActionDetail });
  } catch (error) {
    if (error instanceof AIReadToolError) {
      const status = error.code === 'forbidden' ? 403 : error.code === 'not_found' ? 404 : 503;
      return mobileErrorResponse(request, new MobileAuthError(error.code.toUpperCase(), status, error.message));
    }
    return mobileErrorResponse(request, error);
  }
}
