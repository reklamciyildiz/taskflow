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
          // Persist `link` = stable dedupe URL (must match DB unique index). Push still uses `openLink` for UX.
          if (now >= firstAt) {
            const ins1 = await notificationDb.tryInsert({
              user_id: taskAssignee,
              organization_id: orgId,
              type: 'task_due_reminder',
              title: 'Action is overdue',
              message: `"${title}"`,
              link: n1Link,
            });
            if (ins1) {
              taskReminders += 1;
              await sendPushToUser(taskAssignee, {
                title: 'Action overdue',
                body: title,
                url: openLink,
                tag: `task_overdue:${taskId}:w1`,
              });
            } else if (now >= secondAt) {
              const ins2 = await notificationDb.tryInsert({
                user_id: taskAssignee,
                organization_id: orgId,
                type: 'task_due_reminder',
                title: 'Action still overdue',
                message: `"${title}"`,
                link: n2Link,
              });
              if (ins2) {
                taskReminders += 1;
                await sendPushToUser(taskAssignee, {
                  title: 'Action still overdue',
                  body: title,
                  url: openLink,
                  tag: `task_overdue:${taskId}:w2`,
                });
              }
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
          const inserted = await notificationDb.tryInsert({
            user_id: taskAssignee,
            organization_id: orgId,
            type: 'task_due_reminder',
            title: label === 'due_today' ? 'Action due today' : 'Action due tomorrow',
            message: `"${title}"`,
            link: dedupeLink,
          });
          if (inserted) {
            taskReminders += 1;
            await sendPushToUser(taskAssignee, {
              title: label === 'due_today' ? 'Action due today' : 'Action due tomorrow',
              body: title,
              url: openLink,
              tag: `task_due:${taskId}:${label}:${today}`,
            });
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
          if (now >= firstAt) {
            const ins1 = await notificationDb.tryInsert({
              user_id: assignee,
              organization_id: orgId,
              type: 'checklist_due_reminder',
              title: 'Checklist item is overdue',
              message: `"${title}" — ${text}`,
              link: n1Link,
            });
            if (ins1) {
              checklistReminders += 1;
              await sendPushToUser(assignee, {
                title: 'Checklist overdue',
                body: text.slice(0, 120),
                url: openLink,
                tag: `chk_overdue:${taskId}:${rowId}:w1`,
              });
            } else if (now >= secondAt) {
              const ins2 = await notificationDb.tryInsert({
                user_id: assignee,
                organization_id: orgId,
                type: 'checklist_due_reminder',
                title: 'Checklist item still overdue',
                message: `"${title}" — ${text}`,
                link: n2Link,
              });
              if (ins2) {
                checklistReminders += 1;
                await sendPushToUser(assignee, {
                  title: 'Checklist still overdue',
                  body: text.slice(0, 120),
                  url: openLink,
                  tag: `chk_overdue:${taskId}:${rowId}:w2`,
                });
              }
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
      const inserted = await notificationDb.tryInsert({
        user_id: assignee,
        organization_id: orgId,
        type: 'checklist_due_reminder',
        title: label === 'due_today' ? 'Checklist item due today' : 'Checklist item due tomorrow',
        message: `"${title}" — ${text}`,
        link: dedupeLink,
      });
      if (!inserted) continue;

      checklistReminders += 1;
      await sendPushToUser(assignee, {
        title: label === 'due_today' ? 'Checklist due today' : 'Checklist due tomorrow',
        body: text.slice(0, 120),
        url: openLink,
        tag: `chk_due:${taskId}:${rowId}:${label}:${today}`,
      });
    }
  }

  return { taskReminders, checklistReminders };
}
