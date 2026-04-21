import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { taskDb, userDb, notificationDb, teamMemberDb, projectDb } from '@/lib/db';
import { ApiResponse } from '@/lib/types';
import { canMutateTeamTasks, viewerCannotMutateTasksResponse } from '@/lib/server-authz';
import { triggerWebhook } from '@/lib/webhook-trigger';
import { TaskUpdatedPayload, TaskDeletedPayload, TaskCompletedPayload, TaskAssignedPayload } from '@/lib/webhooks';
import { sendPushToUser } from '@/lib/push';
import { createServerClient } from '@/lib/supabase';
import {
  deleteGoogleCalendarEventsForTaskEverywhere,
  removeGoogleCalendarForUserTask,
  syncGoogleCalendarForTaskForRelevantUsers,
} from '@/lib/google-calendar-sync';

// GET /api/tasks/[id] - Get a specific task
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
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

    const task = await taskDb.getById(params.id);

    if (!task) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    // Org boundary
    if (user.organization_id !== (task as any).organization_id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const isOrgAdmin = user.role === 'admin' || user.role === 'owner';
    const membership = await teamMemberDb.getMembership((task as any).team_id, user.id);
    if (!membership && !isOrgAdmin) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Project visibility (v1: project_id null remains team-wide)
    const projectId = (task as any).project_id ?? null;
    if (projectId) {
      const visibleProjects = await projectDb.getVisibleForUser({
        organizationId: user.organization_id,
        teamId: (task as any).team_id,
        userId: user.id,
      });
      if (!visibleProjects.some((p: any) => p.id === projectId)) {
        // Don't leak existence
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Task not found' },
          { status: 404 }
        );
      }
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

    if (!session?.user?.email) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const actor: any = await userDb.getByEmail(session.user.email);
    if (!actor) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Get original task for comparison
    const originalTask = await taskDb.getById(params.id);
    if (!originalTask) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    // Org boundary + team membership
    if (actor.organization_id !== (originalTask as any).organization_id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const isOrgAdmin = actor.role === 'admin' || actor.role === 'owner';
    const membership = await teamMemberDb.getMembership((originalTask as any).team_id, actor.id);
    if (!membership && !isOrgAdmin) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }
    if (!canMutateTeamTasks(membership, isOrgAdmin)) {
      return viewerCannotMutateTasksResponse();
    }

    // If this task belongs to a restricted/private project, require visibility to edit.
    const currentProjectId = (originalTask as any).project_id ?? null;
    if (currentProjectId) {
      const visibleProjects = await projectDb.getVisibleForUser({
        organizationId: actor.organization_id,
        teamId: (originalTask as any).team_id,
        userId: actor.id,
      });
      if (!visibleProjects.some((p: any) => p.id === currentProjectId)) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Task not found' },
          { status: 404 }
        );
      }
    }

    // If the update attempts to move the task to a new project, enforce visibility on the target.
    const nextProjectId =
      body && Object.prototype.hasOwnProperty.call(body, 'projectId')
        ? (body.projectId || null)
        : undefined;
    if (nextProjectId !== undefined && nextProjectId !== null) {
      const visibleProjects = await projectDb.getVisibleForUser({
        organizationId: actor.organization_id,
        teamId: (originalTask as any).team_id,
        userId: actor.id,
      });
      if (!visibleProjects.some((p: any) => p.id === nextProjectId)) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
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
                assigneeId?: string | null;
                assignee_id?: string | null;
                dueDate?: string | null;
                due_date?: string | null;
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
                if (Object.prototype.hasOwnProperty.call(e, 'assigneeId') || Object.prototype.hasOwnProperty.call(e, 'assignee_id')) {
                  const a = e.assigneeId ?? e.assignee_id;
                  row.assignee_id = typeof a === 'string' && a ? a : null;
                }
                if (Object.prototype.hasOwnProperty.call(e, 'dueDate') || Object.prototype.hasOwnProperty.call(e, 'due_date')) {
                  const d = e.dueDate ?? e.due_date;
                  row.due_date = typeof d === 'string' && d ? d : null;
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

    // Checklist row assignee changes → in-app + push (deduped).
    if (Array.isArray(body.journalLogs) && actor?.id) {
      const oldArr = Array.isArray((originalTask as any).journal_logs)
        ? ((originalTask as any).journal_logs as any[])
        : [];
      const oldMap = new Map<string, any>(oldArr.map((r) => [String(r?.id ?? ''), r]));
      const orgId = String(actor.organization_id ?? '');
      const actorUserId = String(actor.id);
      const actorName = String(actor.name ?? 'Someone');
      const projectId = (updatedTask as any).project_id ? String((updatedTask as any).project_id) : null;
      const taskTitle = String(updatedTask.title ?? 'Action');

      for (const e of body.journalLogs as any[]) {
        const id = String(e?.id ?? '');
        if (!id || id.startsWith('__')) continue;
        const prev = oldMap.get(id);
        const nextAssignee =
          e && Object.prototype.hasOwnProperty.call(e, 'assigneeId')
            ? (e.assigneeId as string | null) ?? null
            : e && Object.prototype.hasOwnProperty.call(e, 'assignee_id')
              ? (e.assignee_id as string | null) ?? null
              : undefined;
        if (nextAssignee === undefined) continue;
        const prevAssignee =
          prev == null
            ? null
            : typeof (prev as any).assignee_id === 'string' && (prev as any).assignee_id
              ? String((prev as any).assignee_id)
              : typeof (prev as any).assigneeId === 'string' && (prev as any).assigneeId
                ? String((prev as any).assigneeId)
                : null;
        const nextNorm = nextAssignee || null;
        const prevNorm = prevAssignee || null;
        if (!nextNorm || nextNorm === prevNorm || nextNorm === actorUserId) continue;

        const openLink = `/board?${new URLSearchParams({
          task: String(updatedTask.id),
          checklist: id,
          ...(projectId ? { project: projectId } : {}),
        }).toString()}`;
        const dedupeLink = `/board?${new URLSearchParams({
          task: String(updatedTask.id),
          checklist: id,
          ...(projectId ? { project: projectId } : {}),
          r: 'chkAssign',
          from: actorUserId,
        }).toString()}`;

        try {
          const dup = await notificationDb.hasRecentDuplicate({
            user_id: nextNorm,
            type: 'checklist_assigned',
            link: dedupeLink,
            withinHours: 24,
          });
          if (dup) continue;
          const snippet = String(e?.text ?? '').trim().slice(0, 140);
          await notificationDb.create({
            user_id: nextNorm,
            organization_id: orgId,
            type: 'checklist_assigned',
            title: 'Checklist item assigned to you',
            message: `${actorName} assigned you in “${taskTitle}”${snippet ? `: ${snippet}` : ''}`,
            link: openLink,
          });
          await sendPushToUser(nextNorm, {
            title: 'Checklist item assigned',
            body: `${actorName}: ${taskTitle}`,
            url: openLink,
            tag: `checklist_assigned:${updatedTask.id}:${id}:${actorUserId}`,
          });
        } catch (err) {
          console.error('checklist assign notify failed', err);
        }
      }
    }

    // Trigger webhooks
    try {
      // Get user info for organizationId
      let organizationId = originalTask.organization_id;
      let actorUserId: string | null = null;
      let actorName: string | null = null;
      if (session?.user?.email) {
        const user: any = await userDb.getByEmail(session.user.email);
        if (user) {
          organizationId = user.organization_id;
          actorUserId = user.id ?? null;
          actorName = user.name ?? null;
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
      const assigneePatched = body.assigneeId !== undefined;
      const nextAssigneeId =
        body.assigneeId === undefined ? undefined : (body.assigneeId || null);
      const assigneeChanged =
        assigneePatched && nextAssigneeId !== originalTask.assignee_id;

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

      // Task assigned notification + webhook (when assignee changes)
      if (assigneeChanged && nextAssigneeId) {
        const assignedTo = nextAssigneeId;
        const assignedBy = actorUserId ?? originalTask.created_by;

        // In-app notification for the assignee (avoid notifying self)
        if (assignedTo !== assignedBy) {
          try {
            const projectId = updatedTask.project_id ?? null;
            const qs = new URLSearchParams();
            if (projectId) qs.set('project', projectId);
            qs.set('task', updatedTask.id);
            const link = `/board?${qs.toString()}`;

            await notificationDb.create({
              user_id: assignedTo,
              organization_id: organizationId,
              type: 'task_assigned',
              title: 'New action assigned to you',
              message: `${actorName || 'Someone'} assigned you: "${updatedTask.title}"`,
              link,
            });
            await sendPushToUser(assignedTo, {
              title: 'New action assigned to you',
              body: `${actorName || 'Someone'} assigned you: "${updatedTask.title}"`,
              url: link,
              tag: `task_assigned:${updatedTask.id}`,
            });
          } catch (notifError) {
            console.error('Failed to create assignment notification:', notifError);
          }
        }

        // Webhook
        const taskAssignedPayload: TaskAssignedPayload = {
          task: {
            id: updatedTask.id,
            title: updatedTask.title,
            assigneeId: assignedTo,
            assignedBy,
          },
        };
        await triggerWebhook(organizationId, 'task.assigned', taskAssignedPayload);
      }

      // Task completed webhook (if status changed to done)
      if (body.status === 'done' && originalTask.status !== 'done') {
        const completedByUserId = session?.user ? (session.user as any).id : originalTask.created_by;
        const completedByName = actorName || 'Someone';
        const taskCompletedPayload: TaskCompletedPayload = {
          task: {
            id: updatedTask.id,
            title: updatedTask.title,
            completedBy: completedByUserId,
            completedAt: new Date().toISOString(),
          },
        };
        await triggerWebhook(organizationId, 'task.completed', taskCompletedPayload);

        // Team activity notifications (opt-in): notify teammates when a member completes an action.
        // Best-effort: if `user_settings` table doesn't exist, we silently skip.
        const teamId = updatedTask.team_id ?? originalTask.team_id;
        if (teamId) {
          try {
            const members = await teamMemberDb.getByTeam(teamId);
            const teammateIds = members
              .map((m: any) => m.user_id as string)
              .filter((id) => id && id !== completedByUserId);

            if (teammateIds.length > 0) {
              const sb = createServerClient();
              const { data: prefs, error: prefsError } = await sb
                .from('user_settings')
                .select('user_id, team_activity, push_notifications')
                .in('user_id', teammateIds)
                .eq('team_activity', true);

              if (!prefsError && prefs?.length) {
                const projectId = updatedTask.project_id ?? null;
                const qs = new URLSearchParams();
                if (projectId) qs.set('project', projectId);
                qs.set('task', updatedTask.id);
                const link = `/board?${qs.toString()}`;

                await Promise.all(
                  prefs.map(async (p: any) => {
                    const toUserId = p.user_id as string;
                    await notificationDb.create({
                      user_id: toUserId,
                      organization_id: organizationId,
                      type: 'task_completed',
                      title: 'Team activity',
                      message: `${completedByName} completed: "${updatedTask.title}"`,
                      link,
                    });

                    if (p.push_notifications === true) {
                      await sendPushToUser(toUserId, {
                        title: 'Team activity',
                        body: `${completedByName} completed: "${updatedTask.title}"`,
                        url: link,
                        tag: `team_activity:task_completed:${updatedTask.id}`,
                      });
                    }
                  })
                );
              }
            }
          } catch (teamActivityError) {
            console.error('Failed to create team activity notifications:', teamActivityError);
          }
        }
      }
    } catch (webhookError) {
      console.error('Failed to trigger webhooks:', webhookError);
    }

    // Google Calendar sync (best-effort, per-user)
    try {
      let actorUserId: string | null = null;
      if (session?.user?.email) {
        const u: any = await userDb.getByEmail(session.user.email);
        actorUserId = u?.id ?? null;
      }
      actorUserId = actorUserId ?? (originalTask.created_by as any) ?? null;

      const assigneePatched = body.assigneeId !== undefined;
      const nextAssigneeId = body.assigneeId === undefined ? undefined : (body.assigneeId || null);
      const assigneeChanged = assigneePatched && nextAssigneeId !== originalTask.assignee_id;

      if (assigneeChanged && originalTask.assignee_id && originalTask.assignee_id !== nextAssigneeId) {
        void removeGoogleCalendarForUserTask({ userId: originalTask.assignee_id, taskId: updatedTask.id });
      }

      if (actorUserId) {
        void syncGoogleCalendarForTaskForRelevantUsers({
          actorUserId,
          assigneeId: updatedTask.assignee_id,
          task: {
            id: updatedTask.id,
            title: updatedTask.title,
            description: updatedTask.description,
            due_date: updatedTask.due_date,
          },
        });
      }
    } catch (gcalError) {
      console.error('Google Calendar sync (update) failed:', gcalError);
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
    if (!session?.user?.email) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const actor: any = await userDb.getByEmail(session.user.email);
    if (!actor) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Get task before deletion for webhook
    const task = await taskDb.getById(params.id);
    if (!task) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    if (actor.organization_id !== (task as any).organization_id) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const isOrgAdmin = actor.role === 'admin' || actor.role === 'owner';
    const membership = await teamMemberDb.getMembership((task as any).team_id, actor.id);
    if (!membership && !isOrgAdmin) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }
    if (!canMutateTeamTasks(membership, isOrgAdmin)) {
      return viewerCannotMutateTasksResponse();
    }

    const projectId = (task as any).project_id ?? null;
    if (projectId) {
      const visibleProjects = await projectDb.getVisibleForUser({
        organizationId: actor.organization_id,
        teamId: (task as any).team_id,
        userId: actor.id,
      });
      if (!visibleProjects.some((p: any) => p.id === projectId)) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Task not found' },
          { status: 404 }
        );
      }
    }

    await deleteGoogleCalendarEventsForTaskEverywhere(params.id);

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
