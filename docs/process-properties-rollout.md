# Process single-select properties: manual rollout

No production database was accessed or changed during implementation. The reported
orphan repair is user-supplied; run the checks below against production. This work
does not migrate Stages, move Actions, or modify General/unscoped data.

## Gate 1 — verify A1 before any new production migration

1. Run `supabase/validation/a1_rollout_check.sql` (read-only).
   Both expected triggers must be installed, enabled for normal writes, attached to
   the expected functions, and have the definitions in the A1 migration. Inspect the
   returned function bodies as well; matching names alone are not proof of matching code.
2. Run `supabase/validation/stage_identity_preflight.sql` (read-only).
   Resolve scoped orphan, duplicate IDs, malformed configuration and scope mismatch
   findings before proceeding. The 16 previously reported General records are not
   automatically errors. Multiple/no terminal stages are review findings, not corruption.
3. If the A1 guard is absent, do not assume it was applied. Follow the A1 rollout
   procedure first, then repeat both queries. Do not reapply historical SQL blindly.

The new properties migration also fails before table creation when guards are absent
or inactive, configurations are invalid, or scoped Actions have invalid references/scope.
That guard is supplementary: it does not replace the manual verification/approval above.

## Gate 2 — staging and approved deployment

After successful checks and explicit operator approval:

1. Ensure a verified backup/recovery point and test with production-shaped staging data.
2. Apply `supabase/migrations/20261011120000_process_single_select_properties.sql` once.
   It is transaction-wrapped. It adds empty tables, indexes/FKs and trigger/RPC functions;
   no existing Action or Process data is backfilled. Adding the task composite unique key
   requires a database lock: use a low-traffic deployment window.
3. Deploy the matching application, then hard-refresh existing browser sessions.
4. In an accessible process, edit settings → Properties → add `Region` and options.
   Choose a value in Action Details; group Board by Region; reopen/refresh and verify.
   Return to Stage and verify the original columns and card order.
5. Rename property/option; archive an assigned option; verify its current assignments
   remain visible with an archived label. New assignments to it must fail.
6. Verify read-only team users, another team/organization and restricted/private Process
   non-members cannot mutate/read unauthorized data. Test an org admin who is not in a
   private Process ACL too (normal Process visibility is not bypassed).

SQL Editor manual execution may not populate Supabase CLI migration history. Record
the successful deployment through the project's migration tracking workflow so the
same migration is not applied twice. Do not use `IF NOT EXISTS` to hide schema drift.

Rollback: roll back the new UI/API while retaining these additive tables and all user
values. Do not drop tables once anyone has entered data. No Stage rollback is involved.

## Schema and ownership

- `process_properties`: stable UUID, parent project, name, single-select type, position,
  archived timestamp and created/updated timestamps.
- `process_property_options`: stable UUID, property/project ownership, label, six-color
  palette, position and timestamps. Composite FK prevents property/Process mismatch.
- `action_property_values`: one option per `(task_id, property_id)`; composite FKs bind
  Action and option to the same Process. The Action FK validates at transaction commit
  so existing Process deletion (SET NULL on Actions plus definition/value cascades) can
  finish without a transient constraint failure. Assignment triggers validate immediately.
  No field duplicates native Action metadata.
- Definition rename/reorder never changes identity. API deletion means archive, not
  hard deletion. Historical selections remain stored. Archived choices cannot be newly
  assigned; an existing selection can intentionally be cleared or replaced (for an
  active property). An archived property's value can be cleared, not reassigned.
- RLS is enabled with no direct anon/authenticated policies, matching the current Notes
  architecture. Direct table privileges and reorder RPC execution are revoked from
  clients. The server API uses NextAuth + organization/team role checks + existing
  Process visibility, including private/restricted ACLs. Definition management requires
  org admin/owner or the owning team's admin; Action values use existing task mutation
  permissions. Organization/team ownership is derived through the parent, not client input.
- Project-wide definitions can serve multiple teams only when the existing Process is
  itself unscoped to a team. Value retrieval is always filtered by the authorized team
  and organization through the parent tasks.
- Moving an Action with property values to a different Process is rejected by the
  composite FK rather than orphaning or silently discarding its values. A deliberate
  transfer/mapping feature is not included: clear values explicitly first. Deleting an
  Action/Process follows existing parent deletion semantics; dependent property records
  cascade only with that explicitly deleted parent.

`lib/database.types.ts` declarations were updated from the migration's defined schema,
not represented as generated from production. Live type regeneration should run only
against the verified post-migration schema. Domain DTOs are in `lib/process-properties.ts`.

## UI and runtime boundaries

- Existing Process edit dialog has an inline Properties manager. Property/option labels
  save on blur/Enter; color, up/down ordering and archive are explicit controls.
  These changes save separately from the Process/Stage form and say so in the UI.
- New Process creation keeps its existing workflow; properties are added from settings
  after the Process has a persisted ID.
- Action Details exposes fields only for its own Process. Failed saves retain the last
  authoritative value and show an error. No task-wide autosave payload is changed.
- Board Group by defaults to Stage. Single-select grouping is a read-only projection of
  the same Action objects, with Unassigned and referenced archived-option groups.
  No property-board drag/reorder is included. Stage drag/drop code remains unchanged;
  property changes never write `tasks.status`, `board_position`, or Action timestamps.
- Native fields, Checklist, Notes, Schedule, Planner and Knowledge retrieval are not
  redefined by properties. General Actions have no new property UI or writes.
- A small hook coalesces simultaneous reads using organization + user + team + Process
  keys. It stores no persistent second content source. Successful mutations revalidate
  mounted Board/Details/settings consumers, and request revisions ignore stale reads.
  Same-field concurrent writes in this browser are rejected until the prior save settles.

## Local tests versus production checks

- `npx tsx scripts/test-process-properties.ts`: name validation, identity, grouping,
  Unassigned/archive behavior, cross-process projection isolation, Stage rank invariance.
- `node scripts/test-process-properties-db.cjs <temporary-pglite-package-path>`:
  actual PostgreSQL execution of migrations, fail-fast A1 prerequisite, persisted values,
  rename/archive, invalid associations, atomic reorder and direct-client RLS denial.
- `npx tsx scripts/test-process-properties-api.ts`: actual API handlers/shared auth with
  isolated session/database doubles; unauthenticated, cross-org, non-member, viewer,
  private Process exclusion, definition-management roles and payload allowlists.
- Re-run Stage identity and scheduling/Planner tests, TypeScript, ESLint and production build.

These are not an authenticated browser E2E run or a live Supabase/RLS certification.
The staging/manual refresh, modal focus, mobile selection and real role/ACL smoke tests
above remain necessary before declaring the deployed feature verified.
