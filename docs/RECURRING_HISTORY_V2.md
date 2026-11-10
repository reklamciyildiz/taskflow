# Recurring History V2 — release notes

## Feature
- Planner Today/Upcoming and Routines expose a History & insights option on recurring Actions and checklist items.
- Responsive 7/30-day calendar shows scheduled dates, completed, missed (implicit historical pending), deliberately skipped, rescheduled and today's pending slots.
- Clicking an eligible day lets permitted editors mark it complete, skip it, or restore completion/skip to pending. Historical corrections target the original schedule date without rewriting the parent Action.
- Completion rate is completed / (completed + missed). Skipped, rescheduled-to-future, today's pending slots and non-scheduled weekdays are excluded.
- Recurrences remain virtual. Reading history never creates another Action or materializes pending occurrence rows.
- Users opt in to weekly missed-work check-ins at Settings > Notifications. Thresholds 2/3/5 consecutive missed scheduled occurrences, maximum one per ISO week, in-app plus optional browser push. OFF by default.
- Read and write operations retain Team, Process and Action permissions.

## Release order
1. Merge after GitHub Actions passes.
2. Apply supabase/migrations/20261110213000_missed_recurrence_preferences.sql to the intended Supabase database by a separately approved operator. It adds two columns to existing user_settings; additive and idempotent.
3. Deploy separately. Vercel auto-deployment remains disabled by default.
4. Test new preferences using a real user, reload to confirm persistence; a database lacking the migration cannot enable check-ins, and existing reminders continue.
5. Test daily misses, Mon–Fri weekend gaps, weekly recurrences, explicit skips, reschedules and retroactive completion in both Action and Checklist contexts.

## Cron
- Authenticated GET /api/cron/reminders-tick has a third isolated worker for missed recurrence follow-ups.
- Checks happen at minute 00–09 UTC during the recipient's 09:00–12:59 local hours (IANA timezone). Scheduling is best-effort.
- Only opted-in recipients are considered. Virtual streak inference uses 180-day sparse exception lookback.
- Existing notification dedupe prevents more than one alert per schedule per ISO week. Browser push honors user subscription/settings; email is never sent.
- If the migration is absent, missing preference fields mean alerts remain OFF. Existing explicit and due-date processors still run.

## Regression suite
- npx tsx scripts/test-recurring-history.ts
- npm run test:scheduling
- npm run test:planner:drag
- bash scripts/test-recurring-history-sql.sh (isolated PostgreSQL, NEVER production)
- npx tsc --noEmit, npm run lint, npm run build

## Explicit limitations
- Backdated completion captures when the correction was saved, not proof of the actual execution time.
- A history view only covers 7/30 days, not an enterprise audit-log export.
- Very infrequent recurrence intervals exceeding the 180-day lookback may not trigger a streak alert.
- Passing CI does not confirm real-user live push delivery or scheduler cadence.
