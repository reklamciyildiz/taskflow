import type { Entitlements } from '@/lib/entitlements';
import type { WorkSchedule } from '@/lib/scheduling-domain';
import { canUsePaidFeature } from '@/lib/paid-feature-policy';
import { scheduleDueInstantIso } from '@/lib/scheduling-runtime';

/** An unverified/expired subscription can only deliver an explicit reminder
 * exactly when the event is due. An arbitrary "when_due" label cannot bypass
 * the paid-plan check for earlier absolute or shifted reminders.
 */
export function mayDeliverScheduledReminder(
  entitlement: Pick<Entitlements, 'plan' | 'subscriptionStatus' | 'endsAt'>,
  schedule: Pick<WorkSchedule, 'scheduleTime' | 'timeZone'>,
  occurrenceDate: string,
  candidateInstant: string,
): boolean {
  if (canUsePaidFeature(entitlement, 'advanced_reminders')) return true;
  const instant = Date.parse(candidateInstant);
  if (!Number.isFinite(instant)) return false;
  const canonical = scheduleDueInstantIso({
    scheduleDate: occurrenceDate,
    scheduleTime: schedule.scheduleTime ?? null,
    timeZone: schedule.timeZone ?? null,
  }, schedule.timeZone ?? 'UTC');
  return instant === Date.parse(canonical);
}
