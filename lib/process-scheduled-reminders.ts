import { notificationDb, taskDb } from '@/lib/db';
import { sendPushToUser } from '@/lib/push';

type JournalRow = Record<string, unknown>;

function normalizeRows(raw: unknown): JournalRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === 'object') as JournalRow[];
}

function isoToMs(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function boardLink(params: Record<string, string>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  return `/board?${qs.toString()}`;
}

function rowReminders(row: JournalRow): string[] {
  const raw = row.reminders;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

function taskReminders(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

export type ScheduledReminderRunStats = {
  taskRemindersFired: number;
  checklistRemindersFired: number;
};

/**
 * Frequent cron entrypoint: fire scheduled reminders (absolute instants).
 *
 * Design:
 * - Reminders are stored as UTC ISO timestamps on the task row (`tasks.reminders`)
 *   and optionally per checklist row inside `journal_logs[*].reminders`.
 * - This job is idempotent via `notificationDb.hasRecentDuplicate` using a
 *   dedupe link containing the reminder ISO string.
 *
 * Note: We intentionally do NOT mutate tasks to delete fired reminders in v1.
 * Windowing + dedupe prevents repeats while keeping the feature low-risk.
 *
 * Task-level reminders notify `assignee_id` when set; otherwise `created_by`
 * (the user who created the action) so "Remind me" works for unassigned tasks.
 */
export async function processScheduledReminders(input?: {
  /** Sliding window to consider reminders as "due" (missed cron / deploy gaps). Default: 24h. */
  lookbackMs?: number;
}): Promise<ScheduledReminderRunStats> {
  const lookbackMs = Number.isFinite(input?.lookbackMs) ? Math.max(60_000, input!.lookbackMs!) : 24 * 60 * 60_000;
  const now = Date.now();
  const minMs = now - lookbackMs;

  let taskRemindersFired = 0;
  let checklistRemindersFired = 0;

  const tasks = await taskDb.listForDueReminders();

  for (const t of tasks as any[]) {
    const orgId = String(t.organization_id ?? '');
    const taskId = String(t.id ?? '');
    const title = String(t.title ?? 'Action');
    const projectId = t.project_id ? String(t.project_id) : null;
    const taskAssignee = t.assignee_id ? String(t.assignee_id) : null;
    const taskCreator = t.created_by ? String(t.created_by) : null;
    const taskReminderRecipient = taskAssignee || taskCreator;

    // Task-level scheduled reminders (assignee, else creator of the action).
    if (taskReminderRecipient) {
      for (const iso of taskReminders(t.reminders)) {
        const ms = isoToMs(iso);
        if (ms == null) continue;
        if (ms > now || ms < minMs) continue;

        const openLink = boardLink({ task: taskId, ...(projectId ? { project: projectId } : {}) });
        const dedupeLink = boardLink({
          task: taskId,
          ...(projectId ? { project: projectId } : {}),
          r: 'tRem',
          at: iso,
        });

        const dup = await notificationDb.hasRecentDuplicate({
          user_id: taskReminderRecipient,
          type: 'task_reminder',
          link: dedupeLink,
          withinHours: 48,
        });
        if (dup) continue;

        await notificationDb.create({
          user_id: taskReminderRecipient,
          organization_id: orgId,
          type: 'task_reminder',
          title: 'Reminder',
          message: `"${title}"`,
          link: openLink,
        });
        await sendPushToUser(taskReminderRecipient, {
          title: 'Reminder',
          body: title,
          url: openLink,
          tag: `task_reminder:${taskId}:${iso}`,
        });
        taskRemindersFired += 1;
      }
    }

    // Checklist-row scheduled reminders.
    for (const row of normalizeRows(t.journal_logs)) {
      if (row.done === true) continue;
      const text = String(row.text ?? '').trim();
      if (!text) continue;
      const rowId = String(row.id ?? '');
      if (!rowId || rowId.startsWith('__')) continue;

      const rowAssigneeRaw = row.assignee_id ?? row.assigneeId;
      const assignee =
        typeof rowAssigneeRaw === 'string' && rowAssigneeRaw
          ? rowAssigneeRaw
          : taskAssignee || taskCreator;
      if (!assignee) continue;

      for (const iso of rowReminders(row)) {
        const ms = isoToMs(iso);
        if (ms == null) continue;
        if (ms > now || ms < minMs) continue;

        const openLink = boardLink({
          task: taskId,
          checklist: rowId,
          ...(projectId ? { project: projectId } : {}),
        });
        const dedupeLink = boardLink({
          task: taskId,
          checklist: rowId,
          ...(projectId ? { project: projectId } : {}),
          r: 'cRem',
          at: iso,
        });

        const dup = await notificationDb.hasRecentDuplicate({
          user_id: assignee,
          type: 'checklist_reminder',
          link: dedupeLink,
          withinHours: 48,
        });
        if (dup) continue;

        await notificationDb.create({
          user_id: assignee,
          organization_id: orgId,
          type: 'checklist_reminder',
          title: 'Reminder',
          message: `"${title}" — ${text}`,
          link: openLink,
        });
        await sendPushToUser(assignee, {
          title: 'Reminder',
          body: text.slice(0, 120),
          url: openLink,
          tag: `checklist_reminder:${taskId}:${rowId}:${iso}`,
        });
        checklistRemindersFired += 1;
      }
    }
  }

  return { taskRemindersFired, checklistRemindersFired };
}

