# Foundation A1: Stage identity and lifecycle

## Canonical state and changes

`projects.column_config` remains the sole process-stage configuration; `tasks.status`
remains a process-scoped identifier. No relational stage table, status backfill,
completion timestamp backfill or schema cutover is introduced.

Confirmed bugs fixed:

- Both process/general editors slugged titles into IDs during every save, including
  rename/color/order changes. Existing IDs are now copied unchanged; new columns
  get a UUID once, at creation. New process presets also allocate fresh IDs.
- Saves silently dropped blank-titled columns and selected a terminal column when
  none was selected. Invalid configuration now fails; zero/multiple terminal stages
  are permitted. Category columns are not automatically closed stages.
- Unrecognized statuses were rendered in the first/default stage without changing
  stored status. They now remain unresolved; Board exposes the Action for explicit
  repair instead of silently moving or hiding it.
- Task create/update and process config update accepted invalid references. Shared
  server validation and PostgreSQL triggers now reject these writes, including
  concurrent config/assignment writes (project row lock). Referenced columns cannot
  be removed. There is no existing archive field; A1 does not simulate archiving by
  removing columns. Move Actions explicitly first; archive is a future stage concern.
- ActionPanel used the selected Board's columns even when opened for another process
  from Planner/Knowledge. It now resolves its own Action's process.
- List completion fabricated `done`/`todo` if no matching stage existed. It now fails
  visibly without a write. Quick Capture lets the server choose the configured initial
  stage for a new Action, rather than writing an invalid literal `todo`.

`lib/stage-lifecycle.ts` supplies the shared contract:
`projectId`, `stageId`, `stage`, `resolved`, `isTerminal`, `isActionable`, `outcome`.
Unresolved/duplicate references are neither known actionable nor terminal.
`outcome` is always unknown in A1. Terminal does **not** mean successful.
`isTerminalBoardColumn` delegates to this resolver, so existing consumers reuse it.
Planner, scheduled reminder exclusion, Board/List, ActionPanel, Sidebar, client task
statistics, export filtering, Profile/Leaderboard and completion webhooks share the
explicit terminal flag. Analytics/Achievements no longer fall back to unrelated
default columns for a missing/malformed process configuration.

## Production preflight and rollout

Production data has **not** been accessed or validated by this implementation.

1. Run `supabase/validation/stage_identity_preflight.sql` in the Supabase SQL editor.
   It is read-only and returns issue counts plus process/Action IDs. Save its output.
2. Investigate duplicate/invalid IDs, malformed/empty configs, orphan statuses and
   scope mismatches. Recover original IDs from a verified backup or obtain an explicit
   user mapping. Never infer a mapping from names, position or a default column.
3. Multiple/no terminal columns and General Actions are review findings, not automatically
   corruption. An old `done` ID without explicit `isTerminal:true` is no longer interpreted
   as closed merely by its spelling: confirm intended semantics with the owner.
4. Apply `20261010120000_stage_identity_guards.sql` before deploying the application.
   It installs write guards only, with no conversion or deletion. It deliberately allows
   unchanged legacy status/config on content-only edits; new assignments/config mutations
   fail fast. Existing malformed processes must be repaired explicitly before new work
   can be assigned. Existing RLS and authorization remain in place; service-role writes
   are also subject to the triggers.
5. Repeat the preflight, then smoke-test authenticated create, rename, drag/drop/reopen,
   process switching, Planner completion and webhook delivery against staging/production.
   Do not interpret local tests or a successful guard installation as a clean-data report.

## Explicit remaining boundaries

- General board configuration is browser-local, per-team, not a shared database object.
  A1 preserves that storage and unscoped assignments. Its editor checks loaded Action
  references, but server-side General lifecycle still uses built-in defaults; custom
  General semantics cannot be guaranteed across devices/server surfaces yet. Relational
  migration requires an explicit General ownership/persistence decision. Unrecognized
  historical statuses (including `review` when not configured) remain visible for repair,
  not projected into another stage.
- Legacy IDs can repeat across different processes. They are valid only as
  `(project_id, status)` pairs; membership checks cannot distinguish identical legacy
  strings originating in two processes. New UI-created IDs are UUIDs. Do not globally
  deduplicate historical IDs before the relational mapping is approved.
- Analytics/Achievements/Leaderboard and Planner's historical completion display still
  contain existing `updatedAt`/`updated_at` proxies. Those are **not** trustworthy execution
  history. A1 does not write or invent historical completion timestamps. Profile's literal
  `progress` metric and Header's progress color remain display-only legacy indicators;
  there is not yet a semantic 'active' classifier. `lib/store.ts` contains demo statuses.
- No browser E2E session, live Supabase RLS test or real concurrent PostgreSQL session test
  was run. The isolated PostgreSQL tests exercise the actual migration and persistence
  guards, not the full production schema/authentication stack.

## Future relational contract (not implemented)

`process_stages`:

- `id uuid` stable primary key; `project_id uuid` parent ownership.
- `display_name text`, `color text`, `position integer` (deterministic order).
- `archived_at timestamptz null`; referenced stages archive, never cascade-delete Actions.
- `is_terminal boolean` independent of optional `outcome` (`successful`, `unsuccessful`,
  or null). Optional nonterminal classification (`backlog`, `active`, `waiting`, `neutral`)
  must be user-selected, never inferred from names.
- `created_at`, `updated_at`; organization/team access inherited from the parent process.
- Unique `(project_id, id)` plus composite FK from `tasks(project_id, stage_id)` to enforce
  same-process membership in PostgreSQL. Require `stage_id` for scoped Actions; resolve
  General representation explicitly. Reject new assignments to archived stages while
  retaining historical references and visibility.

Migration mapping must be explicit `(project_id, legacy_id) -> stage_uuid`, one transactional
backfill after a clean preflight, followed by a controlled runtime cutover. No parallel
canonical JSON/relational writes. Display-name edits must never touch either identity.

Future `closed_at timestamptz` is set server-side on **known open -> terminal** transitions,
cleared on terminal -> open, and retained on terminal -> terminal transitions regardless
of business outcome. Existing terminal rows with no verified timestamp stay unknown/null;
never backfill from `updated_at`. Changing a stage's terminal flag requires an explicit
bulk lifecycle policy (configuration time is not historical completion time).

## Reproducible local checks

- `npx tsx scripts/test-stage-identity.ts`: identity, validation, lifecycle, General defaults,
  unresolved references and actual Board drag/drop patch order.
- `node scripts/test-stage-persistence.cjs <path-to-temporary-@electric-sql/pglite>`:
  isolated PostgreSQL engine, actual guard migration + read-only preflight, persisted
  rename/reorder/color, assignment/deletion/scope constraints and General/content edits.
  Install the test engine in a temporary directory; no application dependency is added.
- `npm run test:scheduling`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Changed production code

- Identity: `CreateProjectModal`, `EditGeneralBoardModal`, `lib/stage-lifecycle.ts`.
- Integrity/persistence: `lib/stage-server.ts`, `lib/db.ts`, projects/tasks API routes,
  guard migration and read-only preflight.
- Reference/feedback fixes: `TaskContext`, `CreateTaskModal`, `QuickCapture`, `ActionPanel`,
  `TaskBoard`, `TaskCard`, `TaskList`, `PlannerToday`.
- Shared lifecycle consumers: `lib/types.ts`, `planner-retrieval-server`,
  `scheduling-runtime-server`, `Analytics`, `Achievements`, `DashboardInsights`,
  `ExportModal`, `Header`, `Leaderboard`, `Profile`.
