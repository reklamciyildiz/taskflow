# Actiproc P3.1 — Advanced Operational Reporting

## Release scope

Adds a separate **Advanced reports** view within the existing Analytics page, leaving the existing Overview, charts and CSV export intact. No production migration or new server endpoint is required in this first slice.

- Filters: current team, visible Process/Inbox, assigned member/unassigned, past 7/30/90 local-calendar days.
- Snapshot KPIs: open Actions, current completion ratio, calendar-day overdue, due in next 7 calendar days, unassigned work and lack of updates for 14 days.
- Period KPIs: verified last-completions, created Actions, mean creation-to-completion time with an explicit verified sample count.
- Daily activity chart for 7/30-day windows and 7-day buckets for 90-day windows.
- Process-level health cards, sorted by overdue work, and clickable Action watchlist.
- Scoped UTF-8 CSV: metrics, Process health, date buckets and up to ten at-risk Actions, with spreadsheet formula-injection neutralization.
- Centralized English/Turkish labels and responsive, accessible controls.

## Accuracy contract

**Current state vs history are different concepts.** The Process filter and assignee filter affect both, but the time filter affects *only verified historical activity*, not today's backlog or completion ratio. Existing `lib/metrics/completions.ts` provides the canonical validity checks for timestamps.

- `tasks.completedAt` is accepted for history only if it is a valid date at or after the valid `createdAt` and the Action is currently in a recognized terminal stage.
- A completed Action missing a valid timestamp contributes to today's completion ratio but is **excluded** from historical velocity and mean duration; the missing-date count is explicit.
- Overdue means the due **calendar day** is before today's local calendar day. An Action due today at 00:00 is not already overdue.
- A 14-day inactivity signal means `updatedAt` is more than 14 *local calendar days* behind the current day. It is not proof of true workflow blockage.
- Custom Process terminal stages are evaluated using `columnConfig[].isTerminal`, never the default `done` string. Unrecognized stage IDs are counted as unresolved, never silently reclassified.
- The current task projection contains **only surviving Actions and their latest completion transition**. It cannot reconstruct deleted Actions or earlier completion/reopen cycles; this is not an immutable event ledger, audit log or historical backlog snapshot.

## Security and access contract

The view uses the existing authenticated `useTaskContext()` dataset, scoped again by the active team and the visible Process IDs before calculations/CSV. It does not query private Process rows through the service role or introduce new grants, RLS, export API or cross-team aggregation.

A member must not see tasks/Process names they cannot access. Switching teams resets Process/assignee filters. Unknown Process IDs are excluded, not inferred or auto-mapped.

**Important:** this phase cannot claim a full historical organizational report or organization-wide snapshots without introducing a permission-controlled server-side aggregated read model and an event history.

## Automated verification

`.github/workflows/p31-advanced-reporting.yml` runs:
1. `npx tsx scripts/test-p31-advanced-reporting.ts` — isolation, custom stages, period boundaries, missing history, calendar dates, group filters and CSV injection.
2. Existing P0 completion-history/security and scheduling regression suites.
3. `npx tsc --noEmit` and Next.js production build with **inert** CI credentials.

## Manual acceptance before production

- Check desktop, tablet and Android narrow widths; dark/light contrast and filters in both TR/EN.
- Use test accounts in different teams with restricted/private Process access and confirm neither UI nor exported CSV includes invisible Actions.
- Validate midnight/due-today and 7/30/90-day boundary examples, local time-zone interpretation and pre-existing historic null `completedAt`.
- Switch from General Overview to Reports and back, with export modal, Leaderboard and other Analytics content intact.
- Test CSV in Excel/Google Sheets with formula-prefixed Action names, quoted names and Turkish characters.
- Verify Action watchlist opens the intended Action Panel; verify team switch resets saved selections.
- Confirm there is no production database change, merge or deployment without approval.

## Next P3 stages

- **P3.2 Portfolios:** an explicit membership/ACL-aware grouping of multiple Processes (not a fake project count).
- **P3.3 Goals:** Objectives, measurable Key Results and Process/Action links backed by explicit data models.
- **P3.4 Gantt:** scheduling and dependencies displayed from canonical Planner and task linkage.

This is a standalone first increment, not a claim that all P3 features are complete.
