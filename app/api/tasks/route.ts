import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { taskDb, notificationDb, userDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import { triggerWebhook } from '@/lib/webhook-trigger';
import { TaskCreatedPayload, TaskAssignedPayload } from '@/lib/webhooks';
import { sendPushToUser } from '@/lib/push';

// GET /api/tasks - Get all tasks (optionally filtered by teamId or organizationId)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const organizationId = searchParams.get('organizationId');

    let tasks;
    if (teamId) {
      tasks = await taskDb.getByTeam(teamId);
    } else if (organizationId) {
      tasks = await taskDb.getByOrganization(organizationId);
    } else {
      // If no filter, try to get user's organization tasks
      if (session?.user?.email) {
        const user: any = await userDb.getByEmail(session.user.email);
        if (user) {
          tasks = await taskDb.getByOrganization(user.organization_id);
        }
      }
      tasks = tasks || [];
    }

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: tasks,
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/tasks - Create a new task
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();

    if (!body.title || !body.teamId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Title and teamId are required' },
        { status: 400 }
      );
    }

    // Get user from session or use provided userId
    let userId = body.createdBy;
    let organizationId = body.organizationId;

    if (session?.user?.email) {
      const user: any = await userDb.getByEmail(session.user.email);
      if (user) {
        userId = user.id;
        organizationId = user.organization_id;
      }
    }

    if (!userId || !organizationId) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'User authentication required' },
        { status: 401 }
      );
    }

    const task = await taskDb.create({
      title: body.title,
      description: body.description || null,
      status: body.status || 'todo',
      priority: body.priority || 'medium',
      due_date: body.dueDate || null,
      assignee_id: body.assigneeId || null,
      customer_id: body.customerId || null,
      project_id: body.projectId ?? null,
      journal_logs: [],
      team_id: body.teamId,
      organization_id: organizationId,
      created_by: userId,
    });

    // Send notification if task is assigned to someone
    if (body.assigneeId && body.assigneeId !== userId) {
      try {
        const creator = await userDb.getById(userId);
        const projectId = task.project_id ?? null;
        const qs = new URLSearchParams();
        if (projectId) qs.set('project', projectId);
        qs.set('task', task.id);
        const link = `/board?${qs.toString()}`;
        await notificationDb.create({
          user_id: body.assigneeId,
          organization_id: organizationId,
          type: 'task_assigned',
          title: 'New action assigned to you',
          message: `${creator?.name || 'Someone'} assigned you: "${body.title}"`,
          link,
        });
        await sendPushToUser(body.assigneeId, {
          title: 'New action assigned to you',
          body: `${creator?.name || 'Someone'} assigned you: "${body.title}"`,
          url: link,
          tag: `task_assigned:${task.id}`,
        });
      } catch (notifError) {
        console.error('Failed to create notification:', notifError);
      }
    }

    // Trigger webhooks (non-blocking)
    try {
      // Task created webhook
      const taskCreatedPayload: TaskCreatedPayload = {
        task: {
          id: task.id,
          title: task.title,
          description: task.description || '',
          status: task.status,
          priority: task.priority,
          dueDate: task.due_date,
          assigneeId: task.assignee_id,
          customerId: task.customer_id,
          teamId: task.team_id,
          createdBy: task.created_by,
        },
      };

      await triggerWebhook(organizationId, 'task.created', taskCreatedPayload);

      // Task assigned webhook (if assigned)
      if (body.assigneeId) {
        const taskAssignedPayload: TaskAssignedPayload = {
          task: {
            id: task.id,
            title: task.title,
            assigneeId: body.assigneeId,
            assignedBy: userId,
          },
        };
        await triggerWebhook(organizationId, 'task.assigned', taskAssignedPayload);
      }
    } catch (webhookError) {
      console.error('[Webhook] Failed to trigger webhooks:', webhookError);
    }

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: task,
      message: 'Task created successfully',
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
