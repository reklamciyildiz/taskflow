# Actiproc P2.3.1 — Smart Dependencies Foundation

## Scope and release gate

This is the **backend foundation**, not the P2.3.2 user interface. A dependency means **blocker Action must reach a terminal stage before the blocked Action can newly complete**. Normal editing, assignment, comments and scheduling remain permitted while blocked.

- Feature branch: `feat/p23-dependency-foundation-20261115`; PR #48.
- Migration: `supabase/migrations/20261115220000_task_dependencies_foundation.sql`.
- The migration **requires** `20261114120000_p0_task_completion_timestamp.sql` and the canonical `team_inbox_boards` migration.
- Apply to a dedicated staging Supabase project **first**, verify live authenticated API and security flows, and only then consider a separate, explicitly approved production migration and deployment.
- No production database changes, main merge or Vercel deployment belong to P2.3.1 development.

## Data and consistency

`public.task_dependencies` stores `blocker_task_id → blocked_task_id`; the table is RLS-enabled, direct client roles are denied access, and only trusted server APIs use the service role. Immutable links are unique; both Actions must belong to the **same organization and team**. Foreign keys cascade links when an Action is deleted; they never delete another Action.

Database triggers enforce the following even when writes originate from existing Board, List, Planner, mobile, or AI paths:

1. No self-dependencies, cross-team links, duplicate edges or directed cycles.
2. No attaching an unfinished blocker to an already-completed Action.
3. No new terminal-stage transition if a prerequisite remains unfinished. The database's canonical Process `isTerminal` flag determines completion, not a hardcoded status name.
4. General Actions are eligible **only after** the team's Inbox board has been synchronized server-side. In that case the canonical `team_inbox_boards.stages[].isTerminal` flag is used. Legacy browser-local Inbox stage definitions do not qualify.
5. Existing dependency edges prevent changing the completion semantics of their referenced Process/Inbox stages or removing the canonical Inbox board.
6. Action-level recurring schedules cannot participate yet. Recurring checklist items are separate and remain allowed. Archived recurring Action schedules do not prevent linking.
7. Dependency graph mutation, completion, and recurrence mutation share a PostgreSQL transaction advisory lock per organization. PostgreSQL READ COMMITTED is assumed (standard PostgREST behavior).

**Reopening semantics:** Reopening a previously finished blocker does **not** silently reopen, move or erase the historical completion of its downstream Actions. Those downstream Actions can appear blocked again for future completion attempts. P2.3.3 will define a user-facing review state and notifications. No automatic stage moves or date changes occur in P2.3.1.

**Current P0 limitation:** P0 `completed_at` historically treats `done` as the fallback for General Actions without a Process. Dependency correctness uses the canonical Inbox stage config, but the legacy completion timestamp for a custom Inbox terminal stage may still be missing. P2.3.2/3 should coordinate any completion metrics unification separately; do not infer historic timestamps.

## API contract

`GET /api/tasks/{id}/dependencies`

Returns `{taskId, blocked, blockedBy, blocking}`. Accessible related Actions contain `{id,taskId,title,status,projectId,isTerminal,createdAt}`. A hidden Process's task **identity/title/metadata is never returned**, although the boolean `blocked` can still reflect its canonical status.

`POST /api/tasks/{id}/dependencies` and `DELETE /api/tasks/{id}/dependencies`

Bodies contain exactly **one** of `{"blockerTaskId":"<uuid>"}` (current Action is blocked by that task) or `{"blockedTaskId":"<uuid>"}` (current Action blocks that task). Both Actions require active editable access and identical team/org. POST is idempotent for an existing identical pair; DELETE is idempotent. Source identity is session-derived, not taken from request fields.

Expected domain conflict codes include `DEPENDENCY_BLOCKED`, `DEPENDENCY_CYCLE`, `DEPENDENCY_RECURRING`, `DEPENDENCY_INBOX_UNSYNCED`, `DEPENDENCY_STAGE_CHANGE`, and `DEPENDENCY_TERMINAL_TARGET`. The existing `PATCH /api/tasks/{id}` maps a forbidden completion to `409` rather than a generic `500`.

`lib/api.ts` exposes the typed `taskDependencyApi.get/link/unlink` for P2.3.2.

## Tests and QA

CI checks a PostgreSQL 16 container, RLS/grants, canonical scope, custom Process and Inbox terminal stages, cycle creation, FK cascades, recurrence exclusion, and **two actual concurrent PostgreSQL sessions** racing link creation against completion. It also checks prior Board/scheduling behavior, TypeScript, and a production build with inert credentials.

Required staging tests after applying the migration:
- Authenticated owner/admin/member/viewer across normal/restricted/private Processes.
- Same-team links, cross-team and cross-tenant denials, cyclic links and duplicate submissions.
- Board/List/Action Panel and mobile writes, including blocked completion after a concurrent mutation.
- Existing Action-level recurring schedule and changes to scheduling.
- Process/Inbox terminal-stage configuration changes, Action deletion and reopening.
- Switching between Turkish/English after P2.3.2 exposes dependency controls.

## Follow-on: P2.3.2 Premium UI

Add the compact Action Panel dependency selector, accessible search limited to the current team and visible Processes, Board/List blocked indicators and filters, and EN/TR error descriptions. Avoid graph visualization and automated unblock notifications here; those belong to P2.3.3/P2.3.4.
