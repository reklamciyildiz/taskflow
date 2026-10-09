import { notificationDb } from '@/lib/db';
import { sendPushToUser } from '@/lib/push';
import { listActiveOneOffScheduledWork } from '@/lib/scheduling-runtime-server';
import { calendarDateInTimeZone, scheduleDueInstantIso } from '@/lib/scheduling-runtime';

const OVERDUE_FIRST_NOTIFY_AFTER_HOURS = 0;
const OVERDUE_SECOND_NOTIFY_AFTER_HOURS = 48;

function addUtcDaysFromYmd(ymd: string, deltaDays: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  if (!year || !month || !day) return ymd;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function boardLink(params: Record<string, string>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return `/board?${query.toString()}`;
}

export type ReminderRunStats = {
  taskReminders: number;
  checklistReminders: number;
};

/** Due/overdue notifications projected exclusively from canonical one-off schedules. */
export async function processTaskDueReminders(): Promise<ReminderRunStats> {
  const nowInstant = new Date();
  let taskReminders = 0;
  let checklistReminders = 0;

  const scheduledWork = await listActiveOneOffScheduledWork();
  for (const work of scheduledWork) {
    const recipient = work.recipientId;
    if (!recipient) continue;
    const isChecklist = work.sourceType === 'checklist_item';
    const sourceParams: Record<string, string> = {
      task: work.taskId,
      ...(work.projectId ? { project: work.projectId } : {}),
      ...(work.checklistItemId ? { checklist: work.checklistItemId } : {}),
    };
    const openLink = boardLink(sourceParams);
    const message = isChecklist
      ? `"${work.taskTitle}" — ${work.checklistItemText}`
      : `"${work.taskTitle}"`;
    const notificationType = isChecklist ? 'checklist_due_reminder' : 'task_due_reminder';
    const countNotification = () => {
      if (isChecklist) checklistReminders += 1;
      else taskReminders += 1;
    };
    const today = calendarDateInTimeZone(nowInstant, work.recipientTimeZone);
    const tomorrow = addUtcDaysFromYmd(today, 1);

    if (work.dueDate < today) {
      const overdueStartMs = Date.parse(scheduleDueInstantIso({
        scheduleDate: addUtcDaysFromYmd(work.dueDate, 1),
        scheduleTime: '00:00:00',
        timeZone: work.recipientTimeZone,
      }, work.recipientTimeZone));
      if (!overdueStartMs) continue;
      const now = Date.now();
      const firstAt = overdueStartMs + OVERDUE_FIRST_NOTIFY_AFTER_HOURS * 3_600_000;
      const secondAt = firstAt + OVERDUE_SECOND_NOTIFY_AFTER_HOURS * 3_600_000;
      const prefix = isChecklist ? 'chkOverdue' : 'taskOverdue';
      const firstLink = boardLink({ ...sourceParams, r: prefix, w: '1' });
      const secondLink = boardLink({ ...sourceParams, r: prefix, w: '2' });
      if (now < firstAt) continue;

      const first = await notificationDb.tryInsert({
        user_id: recipient,
        organization_id: work.organizationId,
        type: notificationType,
        title: isChecklist ? 'Checklist item is overdue' : 'Action is overdue',
        message,
        link: firstLink,
      });
      if (first) {
        countNotification();
        await sendPushToUser(recipient, {
          title: isChecklist ? 'Checklist overdue' : 'Action overdue',
          body: isChecklist ? String(work.checklistItemText).slice(0, 120) : work.taskTitle,
          url: openLink,
          tag: `schedule_overdue:${work.schedule.id}:w1`,
        });
      } else if (now >= secondAt) {
        const second = await notificationDb.tryInsert({
          user_id: recipient,
          organization_id: work.organizationId,
          type: notificationType,
          title: isChecklist ? 'Checklist item still overdue' : 'Action still overdue',
          message,
          link: secondLink,
        });
        if (second) {
          countNotification();
          await sendPushToUser(recipient, {
            title: isChecklist ? 'Checklist still overdue' : 'Action still overdue',
            body: isChecklist ? String(work.checklistItemText).slice(0, 120) : work.taskTitle,
            url: openLink,
            tag: `schedule_overdue:${work.schedule.id}:w2`,
          });
        }
      }
      continue;
    }

    const label = work.dueDate === today
      ? 'due_today'
      : work.dueDate === tomorrow
        ? 'due_tomorrow'
        : null;
    if (!label) continue;
    const dedupeLink = boardLink({
      ...sourceParams,
      r: isChecklist ? 'chkDue' : 'taskDue',
      b: `${label}:${today}`,
    });
    const inserted = await notificationDb.tryInsert({
      user_id: recipient,
      organization_id: work.organizationId,
      type: notificationType,
      title: label === 'due_today'
        ? isChecklist ? 'Checklist item due today' : 'Action due today'
        : isChecklist ? 'Checklist item due tomorrow' : 'Action due tomorrow',
      message,
      link: dedupeLink,
    });
    if (!inserted) continue;
    countNotification();
    await sendPushToUser(recipient, {
      title: label === 'due_today'
        ? isChecklist ? 'Checklist due today' : 'Action due today'
        : isChecklist ? 'Checklist due tomorrow' : 'Action due tomorrow',
      body: isChecklist ? String(work.checklistItemText).slice(0, 120) : work.taskTitle,
      url: openLink,
      tag: `schedule_due:${work.schedule.id}:${label}:${today}`,
    });
  }

  return { taskReminders, checklistReminders };
}
