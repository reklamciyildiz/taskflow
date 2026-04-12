import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { taskDb, userDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import { triggerWebhook } from '@/lib/webhook-trigger';
import { TaskUpdatedPayload, TaskDeletedPayload, TaskCompletedPayload } from '@/lib/webhooks';

// GET /api/tasks/[id] - Get a specific task
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const task = await taskDb.getById(params.id);

    if (!task) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error('Error fetching task:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/tasks/[id] - Update a task
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();

    // Get original task for comparison
    const originalTask = await taskDb.getById(params.id);
    if (!originalTask) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    const journalPayload =
      body.journalLogs === undefined
        ? undefined
        : Array.isArray(body.journalLogs)
          ? body.journalLogs.map(
              (e: {
                id?: string;
                text?: string;
                createdAt?: string;
                created_at?: string;
                updatedAt?: string;
                updated_at?: string;
                done?: boolean;
              }) => {
                const created_at = e.createdAt ?? e.created_at;
                const updated_at = e.updatedAt ?? e.updated_at;
                const row: Record<string, unknown> = {
                  id: e.id,
                  text: e.text,
                  created_at,
                };
                if (e.done === true) {
                  row.done = true;
                }
                if (typeof updated_at === 'string' && updated_at.length > 0) {
                  row.updated_at = updated_at;
                }
                return row;
              }
            )
          : undefined;

    const updatedTask = await taskDb.update(params.id, {
      title: body.title,
      description: body.description,
      status: body.status,
      priority: body.priority,
      due_date: body.dueDate,
      assignee_id: body.assigneeId === undefined ? undefined : (body.assigneeId || null),
      customer_id: body.customerId === undefined ? undefined : (body.customerId || null),
      project_id: body.projectId === undefined ? undefined : (body.projectId || null),
      learnings: body.learnings,
      journal_logs: journalPayload,
      board_position: body.boardPosition,
    });

    if (!updatedTask) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    // Trigger webhooks
    try {
      // Get user info for organizationId
      let organizationId = originalTask.organization_id;
      if (session?.user?.email) {
        const user: any = await userDb.getByEmail(session.user.email);
        if (user) {
          organizationId = user.organization_id;
        }
      }

      // Detect changes
      const changes: { field: string; oldValue: any; newValue: any }[] = [];
      if (body.title !== undefined && body.title !== originalTask.title) {
        changes.push({ field: 'title', oldValue: originalTask.title, newValue: body.title });
      }
      if (body.description !== undefined && body.description !== originalTask.description) {
        changes.push({ field: 'description', oldValue: originalTask.description, newValue: body.description });
      }
      if (body.status !== undefined && body.status !== originalTask.status) {
        changes.push({ field: 'status', oldValue: originalTask.status, newValue: body.status });
      }
      if (body.priority !== undefined && body.priority !== originalTask.priority) {
        changes.push({ field: 'priority', oldValue: originalTask.priority, newValue: body.priority });
      }

      // Task updated webhook
      if (changes.length > 0) {
        const taskUpdatedPayload: TaskUpdatedPayload = {
          task: {
            id: updatedTask.id,
            title: updatedTask.title,
            description: updatedTask.description || '',
            status: updatedTask.status,
            priority: updatedTask.priority,
            dueDate: updatedTask.due_date,
            assigneeId: updatedTask.assignee_id,
            customerId: updatedTask.customer_id,
            teamId: updatedTask.team_id,
          },
          changes,
        };
        await triggerWebhook(organizationId, 'task.updated', taskUpdatedPayload);
      }

      // Task completed webhook (if status changed to done)
      if (body.status === 'done' && originalTask.status !== 'done') {
        const userId = session?.user ? (session.user as any).id : originalTask.created_by;
        const taskCompletedPayload: TaskCompletedPayload = {
          task: {
            id: updatedTask.id,
            title: updatedTask.title,
            completedBy: userId,
            completedAt: new Date().toISOString(),
          },
        };
        await triggerWebhook(organizationId, 'task.completed', taskCompletedPayload);
      }
    } catch (webhookError) {
      console.error('Failed to trigger webhooks:', webhookError);
    }

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: updatedTask,
      message: 'Task updated successfully',
    });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/tasks/[id] - Delete a task
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    // Get task before deletion for webhook
    const task = await taskDb.getById(params.id);
    if (!task) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    await taskDb.delete(params.id);

    // Trigger webhook
    try {
      let organizationId = task.organization_id;
      if (session?.user?.email) {
        const user: any = await userDb.getByEmail(session.user.email);
        if (user) {
          organizationId = user.organization_id;
        }
      }

      const taskDeletedPayload: TaskDeletedPayload = {
        taskId: params.id,
        teamId: task.team_id,
      };
      await triggerWebhook(organizationId, 'task.deleted', taskDeletedPayload);
    } catch (webhookError) {
      console.error('Failed to trigger webhook:', webhookError);
    }

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      message: 'Task deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
