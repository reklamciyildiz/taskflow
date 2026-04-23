import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { taskDb, notificationDb, userDb, teamMemberDb, projectDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import { canMutateTeamTasks, viewerCannotMutateTasksResponse } from '@/lib/server-authz';
import { triggerWebhook } from '@/lib/webhook-trigger';
import { TaskCreatedPayload, TaskAssignedPayload } from '@/lib/webhooks';
import { sendPushToUser } from '@/lib/push';
import { syncGoogleCalendarForTaskForRelevantUsers } from '@/lib/google-calendar-sync';
import { canUseAdvancedReminders, getOrganizationEntitlements } from '@/lib/entitlements';
import { computeReminderInstantsUtcIso } from '@/lib/reminder-presets';
import { parseDueDateFromApi } from '@/lib/due-date';

// GET /api/tasks - Get all tasks (optionally filtered by teamId or organizationId)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const organizationId = searchParams.get('organizationId');

    let tasks;
    if (teamId) {
      if (!session?.user?.email) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Authentication required' },
          { status: 401 }
        );
      }
      const user: any = await userDb.getByEmail(session.user.email);
      if (!user) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'User not found' },
          { status: 404 }
        );
      }
      // Must be a team member (or org admin) to view team tasks.
      const isOrgAdmin = user.role === 'admin' || user.role === 'owner';
      const membership = await teamMemberDb.getMembership(teamId, user.id);
      if (!membership && !isOrgAdmin) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }

      // Filter tasks by visible projects for this user (team scope).
      const visibleProjects = await projectDb.getVisibleForUser({
        organizationId: user.organization_id,
        teamId,
        userId: user.id,
      });
      const visibleProjectIds = new Set<string>(visibleProjects.map((p: any) => p.id));

      const raw = await taskDb.getByTeam(teamId);
      tasks = (raw ?? []).filter((t: any) => {
        const pid = t.project_id ?? null;
        if (!pid) return true; // General actions remain team-wide in v1
        return visibleProjectIds.has(pid);
      });
    } else if (organizationId) {
      // Only org admins can list an entire organization across teams.
      if (!session?.user?.email) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Authentication required' },
          { status: 401 }
        );
      }
      const user: any = await userDb.getByEmail(session.user.email);
      if (!user?.organization_id || user.organization_id !== organizationId) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
      if (user.role !== 'admin' && user.role !== 'owner') {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
      tasks = await taskDb.getByOrganization(organizationId);
    } else {
      // No filter: do NOT return cross-team org data. Require a teamId for normal operation.
      tasks = [];
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

    // Server-side paywall: Free cannot set advanced scheduled reminders.
    // Allow only the basic "when due" reminder (exact instant) and only when a due date is present.
    {
      const ent = await getOrganizationEntitlements(String(organizationId));
      const wantsReminders = Array.isArray(body.reminders) && body.reminders.length > 0;
      if (wantsReminders && !canUseAdvancedReminders(ent)) {
        const dueAt = parseDueDateFromApi(body.dueDate ?? null);
        const allowed = dueAt ? computeReminderInstantsUtcIso({ dueAt, preset: 'when_due' })[0] : null;
        const first = typeof body.reminders?.[0] === 'string' ? String(body.reminders[0]) : '';
        if (!allowed || first !== allowed) {
          return NextResponse.json<ApiResponse<null>>(
            {
              success: false,
              error: 'Advanced reminders are available on the Pro plan.',
              // Client can treat 402 as paywall and show upgrade UI.
              code: 'PAYWALL_PRO_REMINDERS' as any,
            } as any,
            { status: 402 }
          );
        }
      }
    }

    // Require that the actor is a member of the team they are creating a task in (or org admin).
    const actor: any = session?.user?.email ? await userDb.getByEmail(session.user.email) : null;
    if (actor) {
      const isOrgAdmin = actor.role === 'admin' || actor.role === 'owner';
      const mem = await teamMemberDb.getMembership(body.teamId, actor.id);
      if (!mem && !isOrgAdmin) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
      if (!canMutateTeamTasks(mem, isOrgAdmin)) {
        return viewerCannotMutateTasksResponse();
      }
    }

    const task = await taskDb.create({
      title: body.title,
      description: body.description || null,
      status: body.status || 'todo',
      priority: body.priority || 'medium',
      due_date: body.dueDate || null,
      reminders: Array.isArray(body.reminders) ? body.reminders : [],
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

    // Google Calendar sync (best-effort, per-user)
    void syncGoogleCalendarForTaskForRelevantUsers({
      actorUserId: userId,
      assigneeId: task.assignee_id,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        due_date: task.due_date,
      },
    });

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
