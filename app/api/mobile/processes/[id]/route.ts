import { NextRequest } from 'next/server';
import { executeAIReadTool, AIReadToolError } from '@/lib/ai/agent/read-tools';
import { authenticateMobileRequest, MobileAuthError, mobileErrorResponse, mobileJson, mobileOptions } from '@/lib/mobile-auth/server';
import type { MobileProcessDetail } from '@/shared/mobile-contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) { return mobileOptions(request); }

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user } = await authenticateMobileRequest(request);
    if (!user.organization_id) throw new MobileAuthError('NOT_FOUND', 404, 'Process was not found.');
    const actor = {
      userId: String(user.id),
      organizationId: String(user.organization_id),
      role: user.role ? String(user.role) : null,
    };
    const [overview, actionList] = await Promise.all([
      executeAIReadTool('get_process_overview', { processId: params.id }, actor),
      executeAIReadTool('list_actions', { processId: params.id, completion: 'all', assignedToMe: false, limit: 50, offset: 0 }, actor),
    ]);
    const process = (overview.data as any).process;
    const list = actionList.data as any;
    const data: MobileProcessDetail = {
      process: {
        id: String(process.id),
        name: String(process.name),
        teamId: null,
        visibility: process.visibility ?? 'team',
        activeActionCount: Number((overview.data as any).actions?.incomplete ?? 0),
      },
      totalActions: Number(list.total ?? 0),
      hasMore: Boolean(list.hasMore),
      actions: (list.actions ?? []).map((action: any) => ({
        id: String(action.id),
        title: String(action.title),
        description: String(action.description ?? ''),
        projectId: String(action.processId ?? params.id),
        projectName: String(action.processName ?? process.name),
        priority: action.priority ? String(action.priority) : null,
        status: action.stageId ? String(action.stageId) : null,
        stageLabel: String(action.stageLabel ?? action.stageId ?? ''),
        completed: Boolean(action.completed),
        checklist: {
          total: Number(action.checklist?.total ?? 0),
          completed: Number(action.checklist?.completed ?? 0),
        },
        updatedAt: String(action.updatedAt ?? ''),
      })),
    };
    return mobileJson(request, { success: true, data });
  } catch (error) {
    if (error instanceof AIReadToolError) {
      const status = error.code === 'forbidden' ? 403 : error.code === 'not_found' ? 404 : 503;
      return mobileErrorResponse(request, new MobileAuthError(error.code.toUpperCase(), status, error.message));
    }
    return mobileErrorResponse(request, error);
  }
}
