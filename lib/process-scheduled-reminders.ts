import { parseDueDateFromApi } from '@/lib/due-date';
import { notificationDb } from '@/lib/db';
import { canUseAdvancedReminders, getOrganizationEntitlements, type Entitlements } from '@/lib/entitlements';
import { computeReminderInstantsUtcIso } from '@/lib/reminder-presets';
import { sendPushToUser } from '@/lib/push';
import { listActiveScheduledWorkForDates } from '@/lib/scheduling-runtime-server';
import { isWhenDueReminderRule, reminderInstantsForOccurrence, scheduleToLegacyDueValue } from '@/lib/scheduling-runtime';
import { addCalendarDays } from '@/lib/scheduling-domain';
import type { ReminderPresetId } from '@/lib/reminder-presets';

function boardLink(params: Record<string, string>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return `/board?${query.toString()}`;
}

function scheduledIsoAllowedForOrg(
  entitlements: Entitlements,
  dueRaw: string,
  iso: string,
  reminderRules: Parameters<typeof isWhenDueReminderRule>[0],
  preset: ReminderPresetId | null,
): boolean {
  if (canUseAdvancedReminders(entitlements)) return true;
  if (preset === 'when_due') return true;
  if (isWhenDueReminderRule(reminderRules, iso)) return true;
  const dueAt = parseDueDateFromApi(dueRaw);
  const allowed = dueAt
    ? computeReminderInstantsUtcIso({ dueAt, preset: 'when_due' })[0]
    : null;
  return Boolean(allowed && allowed === iso);
}

const FALLBACK_FREE_ENT: Entitlements = {
  plan: 'free',
  subscriptionStatus: 'active',
  seatLimit: 2,
};

async function entitlementsForOrg(
  organizationId: string,
  cache: Map<string, Entitlements>,
): Promise<Entitlements> {
  const cached = cache.get(organizationId);
  if (cached) return cached;
  const entitlements = organizationId
    ? await getOrganizationEntitlements(organizationId)
    : FALLBACK_FREE_ENT;
  cache.set(organizationId, entitlements);
  return entitlements;
}

export type ScheduledReminderRunStats = {
  taskRemindersFired: number;
  checklistRemindersFired: number;
};

/** Absolute reminder delivery sourced exclusively from work_schedules.reminder_rules. */
export async function processScheduledReminders(input?: {
  lookbackMs?: number;
}): Promise<ScheduledReminderRunStats> {
  const lookbackMs = Number.isFinite(input?.lookbackMs)
    ? Math.max(60_000, input!.lookbackMs!)
    : 24 * 60 * 60_000;
  const now = Date.now();
  const minimum = now - lookbackMs;
  let taskRemindersFired = 0;
  let checklistRemindersFired = 0;

  const utcToday = new Date(now).toISOString().slice(0, 10);
  const reminderDates = [-2, -1, 0, 1, 2].map((days) => addCalendarDays(utcToday, days));
  const scheduledWork = await listActiveScheduledWorkForDates(reminderDates);
  const entitlementsCache = new Map<string, Entitlements>();
  for (const work of scheduledWork) {
    if (!work.recipientId) continue;
    const entitlements = await entitlementsForOrg(work.organizationId, entitlementsCache);
    const dueValue = scheduleToLegacyDueValue(work.schedule);
    const isChecklist = work.sourceType === 'checklist_item';
    const baseParams: Record<string, string> = {
      task: work.taskId,
      ...(work.projectId ? { project: work.projectId } : {}),
      ...(work.checklistItemId ? { checklist: work.checklistItemId } : {}),
    };
    const openLink = boardLink(baseParams);

    const reminderCandidates = reminderInstantsForOccurrence(
      work.schedule,
      work.dueDate,
    );
    for (const candidate of reminderCandidates) {
      const iso = candidate.at;
      const instant = Date.parse(iso);
      if (!Number.isFinite(instant) || instant > now || instant < minimum) continue;
      if (!scheduledIsoAllowedForOrg(
        entitlements,
        dueValue,
        iso,
        work.schedule.reminderRules,
        candidate.preset,
      )) continue;

      const dedupeLink = boardLink({
        ...baseParams,
        r: isChecklist ? 'cRem' : 'tRem',
        schedule: work.schedule.id,
        occurrence: work.occurrenceDate,
        rule: candidate.ruleKey,
      });
      const legacyDedupeLink = boardLink({
        ...baseParams,
        r: isChecklist ? 'cRem' : 'tRem',
        at: iso,
      });
      const type = isChecklist ? 'checklist_reminder' : 'task_reminder';
      const [duplicate, legacyDuplicate] = await Promise.all([
        notificationDb.hasRecentDuplicate({
          user_id: work.recipientId,
          type,
          link: dedupeLink,
          withinHours: 48,
        }),
        notificationDb.hasRecentDuplicate({
          user_id: work.recipientId,
          type,
          link: legacyDedupeLink,
          withinHours: 48,
        }),
      ]);
      if (duplicate || legacyDuplicate) continue;

      const inserted = await notificationDb.tryInsert({
        user_id: work.recipientId,
        organization_id: work.organizationId,
        type,
        title: 'Reminder',
        message: isChecklist
          ? `"${work.taskTitle}" — ${work.checklistItemText}`
          : `"${work.taskTitle}"`,
        link: dedupeLink,
      });
      if (!inserted) continue;

      await sendPushToUser(work.recipientId, {
        title: 'Reminder',
        body: isChecklist
          ? String(work.checklistItemText).slice(0, 120)
          : work.taskTitle,
        url: openLink,
        tag: `schedule_reminder:${work.schedule.id}:${work.occurrenceDate}:${candidate.ruleKey}`,
      });
      if (isChecklist) checklistRemindersFired += 1;
      else taskRemindersFired += 1;
    }
  }

  return { taskRemindersFired, checklistRemindersFired };
}
