import { notificationDb, taskDb } from '@/lib/db';
import { sendPushToUser } from '@/lib/push';
import { tryYmdFromStoredDue, utcYmdToday } from '@/lib/due-date';

/** UTC instant at 00:00:00 of the calendar day *after* `ymd` (first moment the item is overdue). */
function utcMsFirstOverdueInstant(ymd: string): number {
  const [y, m, d] = ymd.split('-').map((x) => Number(x));
  if (!y || !m || !d) return 0;
  return Date.UTC(y, m - 1, d + 1);
}

/**
 * Overdue nudges: at most two lifetime notifications per task / checklist row.
 * 1) First after OVERDUE_FIRST_NOTIFY_AFTER_HOURS from first overdue instant.
 * 2) Second after OVERDUE_SECOND_NOTIFY_AFTER_HOURS more hours (then never again).
 */
const OVERDUE_FIRST_NOTIFY_AFTER_HOURS = 24;
const OVERDUE_SECOND_NOTIFY_AFTER_HOURS = 48;

function addUtcDaysFromYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map((x) => Number(x));
  if (!y || !m || !d) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

/** Build /board URL; `params` must include `task`. */
function boardLink(params: Record<string, string>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  return `/board?${qs.toString()}`;
}

type JournalRow = Record<string, unknown>;

function normalizeChecklistRows(raw: unknown): JournalRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === 'object') as JournalRow[];
}

function rowYmd(row: JournalRow): string | null {
  const v = row.due_date ?? row.dueDate;
  if (typeof v !== 'string' || !v.trim()) return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return tryYmdFromStoredDue(s);
}

function rowAssignee(row: JournalRow, taskAssignee: string | null): string | null {
  const a = row.assignee_id ?? row.assigneeId;
  if (typeof a === 'string' && a) return a;
  if (typeof taskAssignee === 'string' && taskAssignee) return taskAssignee;
  return null;
}

function rowDone(row: JournalRow): boolean {
  return row.done === true;
}

export type ReminderRunStats = {
  taskReminders: number;
  checklistReminders: number;
};

/**
 * Cron entrypoint: in-app (+ push) reminders for task due dates and checklist row due dates.
 * Bucketing uses UTC `YYYY-MM-DD` (`utcYmdToday`) for stable server behavior.
 *
 * Overdue (task + checklist): at most **two** lifetime notifications per item, after
 * `OVERDUE_FIRST_NOTIFY_AFTER_HOURS` and then `OVERDUE_SECOND_NOTIFY_AFTER_HOURS` from the first
 * overdue instant (UTC midnight after the due date). No further overdue nags after that.
 */
export async function processTaskDueReminders(): Promise<ReminderRunStats> {
  const today = utcYmdToday();
  const tomorrow = addUtcDaysFromYmd(today, 1);
  let taskReminders = 0;
  let checklistReminders = 0;

  const tasks = await taskDb.listForDueReminders();

  for (const t of tasks as any[]) {
    const orgId = String(t.organization_id ?? '');
    const taskId = String(t.id ?? '');
    const title = String(t.title ?? 'Action');
    const projectId = t.project_id ? String(t.project_id) : null;
    const taskAssignee = t.assignee_id ? String(t.assignee_id) : null;

    const taskYmd = tryYmdFromStoredDue(t.due_date);
    if (taskYmd && taskAssignee) {
      const baseQs: Record<string, string> = {
        task: taskId,
        ...(projectId ? { project: projectId } : {}),
      };
      const openLink = boardLink(baseQs);

      if (taskYmd < today) {
        // Overdue: max two lifetime nudges (stable links), spaced by configured hours after first overdue instant.
        const overdueStartMs = utcMsFirstOverdueInstant(taskYmd);
        if (overdueStartMs > 0) {
          const now = Date.now();
          const firstAt = overdueStartMs + OVERDUE_FIRST_NOTIFY_AFTER_HOURS * 3600000;
          const secondAt = firstAt + OVERDUE_SECOND_NOTIFY_AFTER_HOURS * 3600000;
          const n1Link = boardLink({ ...baseQs, r: 'taskOverdue', w: '1' });
          const n2Link = boardLink({ ...baseQs, r: 'taskOverdue', w: '2' });
          const has1 = await notificationDb.existsWithLink({
            user_id: taskAssignee,
            type: 'task_due_reminder',
            link: n1Link,
          });
          const has2 = await notificationDb.existsWithLink({
            user_id: taskAssignee,
            type: 'task_due_reminder',
            link: n2Link,
          });
          if (!has2) {
            if (!has1 && now >= firstAt) {
              await notificationDb.create({
                user_id: taskAssignee,
                organization_id: orgId,
                type: 'task_due_reminder',
                title: 'Action is overdue',
                message: `"${title}"`,
                link: openLink,
              });
              await sendPushToUser(taskAssignee, {
                title: 'Action overdue',
                body: title,
                url: openLink,
                tag: `task_overdue:${taskId}:w1`,
              });
              taskReminders += 1;
            } else if (has1 && now >= secondAt) {
              await notificationDb.create({
                user_id: taskAssignee,
                organization_id: orgId,
                type: 'task_due_reminder',
                title: 'Action still overdue',
                message: `"${title}"`,
                link: openLink,
              });
              await sendPushToUser(taskAssignee, {
                title: 'Action still overdue',
                body: title,
                url: openLink,
                tag: `task_overdue:${taskId}:w2`,
              });
              taskReminders += 1;
            }
          }
        }
      } else {
        let label: 'due_today' | 'due_tomorrow' | null = null;
        if (taskYmd === today) label = 'due_today';
        else if (taskYmd === tomorrow) label = 'due_tomorrow';
        if (label) {
          const dedupeLink = boardLink({
            ...baseQs,
            r: 'taskDue',
            b: `${label}:${today}`,
          });
          const dup = await notificationDb.hasRecentDuplicate({
            user_id: taskAssignee,
            type: 'task_due_reminder',
            link: dedupeLink,
            withinHours: 22,
          });
          if (!dup) {
            await notificationDb.create({
              user_id: taskAssignee,
              organization_id: orgId,
              type: 'task_due_reminder',
              title: label === 'due_today' ? 'Action due today' : 'Action due tomorrow',
              message: `"${title}"`,
              link: openLink,
            });
            await sendPushToUser(taskAssignee, {
              title: label === 'due_today' ? 'Action due today' : 'Action due tomorrow',
              body: title,
              url: openLink,
              tag: `task_due:${taskId}:${label}:${today}`,
            });
            taskReminders += 1;
          }
        }
      }
    }

    for (const row of normalizeChecklistRows(t.journal_logs)) {
      if (rowDone(row)) continue;
      const text = String(row.text ?? '').trim();
      if (!text) continue;
      const rowId = String(row.id ?? '');
      if (!rowId || rowId.startsWith('__')) continue;
      const ymd = rowYmd(row);
      if (!ymd) continue;
      const assignee = rowAssignee(row, taskAssignee);
      if (!assignee) continue;

      const rowQs: Record<string, string> = {
        task: taskId,
        checklist: rowId,
        ...(projectId ? { project: projectId } : {}),
      };
      const openLink = boardLink(rowQs);

      if (ymd < today) {
        const overdueStartMs = utcMsFirstOverdueInstant(ymd);
        if (overdueStartMs > 0) {
          const now = Date.now();
          const firstAt = overdueStartMs + OVERDUE_FIRST_NOTIFY_AFTER_HOURS * 3600000;
          const secondAt = firstAt + OVERDUE_SECOND_NOTIFY_AFTER_HOURS * 3600000;
          const n1Link = boardLink({ ...rowQs, r: 'chkOverdue', w: '1' });
          const n2Link = boardLink({ ...rowQs, r: 'chkOverdue', w: '2' });
          const has1 = await notificationDb.existsWithLink({
            user_id: assignee,
            type: 'checklist_due_reminder',
            link: n1Link,
          });
          const has2 = await notificationDb.existsWithLink({
            user_id: assignee,
            type: 'checklist_due_reminder',
            link: n2Link,
          });
          if (!has2) {
            if (!has1 && now >= firstAt) {
              await notificationDb.create({
                user_id: assignee,
                organization_id: orgId,
                type: 'checklist_due_reminder',
                title: 'Checklist item is overdue',
                message: `"${title}" — ${text}`,
                link: openLink,
              });
              await sendPushToUser(assignee, {
                title: 'Checklist overdue',
                body: text.slice(0, 120),
                url: openLink,
                tag: `chk_overdue:${taskId}:${rowId}:w1`,
              });
              checklistReminders += 1;
            } else if (has1 && now >= secondAt) {
              await notificationDb.create({
                user_id: assignee,
                organization_id: orgId,
                type: 'checklist_due_reminder',
                title: 'Checklist item still overdue',
                message: `"${title}" — ${text}`,
                link: openLink,
              });
              await sendPushToUser(assignee, {
                title: 'Checklist still overdue',
                body: text.slice(0, 120),
                url: openLink,
                tag: `chk_overdue:${taskId}:${rowId}:w2`,
              });
              checklistReminders += 1;
            }
          }
        }
        continue;
      }

      let label: 'due_today' | 'due_tomorrow' | null = null;
      if (ymd === today) label = 'due_today';
      else if (ymd === tomorrow) label = 'due_tomorrow';
      if (!label) continue;

      const dedupeLink = boardLink({
        ...rowQs,
        r: 'chkDue',
        b: `${label}:${today}`,
      });
      const dup = await notificationDb.hasRecentDuplicate({
        user_id: assignee,
        type: 'checklist_due_reminder',
        link: dedupeLink,
        withinHours: 22,
      });
      if (dup) continue;

      await notificationDb.create({
        user_id: assignee,
        organization_id: orgId,
        type: 'checklist_due_reminder',
        title: label === 'due_today' ? 'Checklist item due today' : 'Checklist item due tomorrow',
        message: `"${title}" — ${text}`,
        link: openLink,
      });
      await sendPushToUser(assignee, {
        title: label === 'due_today' ? 'Checklist due today' : 'Checklist due tomorrow',
        body: text.slice(0, 120),
        url: openLink,
        tag: `chk_due:${taskId}:${rowId}:${label}:${today}`,
      });
      checklistReminders += 1;
    }
  }

  return { taskReminders, checklistReminders };
}
