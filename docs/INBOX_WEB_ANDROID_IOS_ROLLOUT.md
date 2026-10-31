# Actiproc Inbox — web, Android, later iOS

## Canonical behavior

Inbox is **not** a billable Process and has no project row. It is the team-scoped
view of Actions with `tasks.project_id IS NULL`. Newly captured Actions land here
without creating a Process or consuming the Process subscription limit.
A genuine existing Process named "Inbox" is a distinct entity and **must not be
deleted or silently moved** by this feature.

Stage identities are immutable strings; a display title is not an ID. Existing
general stage configuration lives in browser `localStorage`, key
`taskflow:generalBoardColumns:<teamId>`. A fresh Android/iOS install has not
seen those custom IDs. Never assign a new ID based on an index or a label.

## Single source of truth

- Additive table `team_inbox_boards`: per-team JSON stage definitions,
  optimistic version, tenant ownership, status integrity guards.
- Next.js API `GET /api/inbox/board?teamId=...` and `PUT /api/inbox/board`
  (payload `{teamId,stages,expectedVersion}`); NextAuth or mobile bearer token,
  verified team scope to read, team admin or organization admin to mutate.
- Android receives the same stage snapshot in
  `GET /api/mobile/planner/context?teamId=...`; iOS should use the same endpoint
  and contracts when developed. Neither client should rely on device-local
  `localStorage` stage definitions once a team is configured.
- Before migration, GET reports `available:false` and existing clients retain
  local behavior. No automatic task/backfill mutation or silent migration.

## Safe rollout sequence — manual, **not executed**

1. Inventory `tasks` where `project_id IS NULL` by team and distinct `status`.
   Export the original stage definitions (including stable IDs and isTerminal)
   from each affected user's original web browser, especially the five legacy
   Actions visible as unresolved on a fresh Android install.
2. Test migration `supabase/migrations/20261031180000_team_inbox_board_canonical.sql`
   on a staging DB snapshot with the prior A1 stage identity migration installed.
   Verify 403 cross-team, 403 non-admin, 409 stale-version, 409 missing stage,
   concurrent task/config updates, browser refresh and Android OAuth.
3. Apply the reviewed additive migration through the user's usual authorized
   migration process. Do not run it blindly in production.
4. Deploy web/API server code before distributing the new Android bundle. Until
   the new API is present, the mobile context must not be considered migrated.
5. On the **original browser** for each team, open Inbox and press
   **Sync Inbox stages**. Only perform this where all existing Action status IDs
   are present. The server rejects incomplete imports; no Action gets renamed,
   deleted, or reassigned. If the original browser is unavailable, reconstruct
   stage identities from backups/admin review before onboarding the team.
6. Verify identical stage titles/IDs/order and Action counts on web and Android
   for every team. Exercise task creation, moves to a Process, stage editing,
   viewer restrictions, team switches, offline mode and reauthentication.
7. Only then consider Play Store AAB. iOS later needs native bundle/Xcode signing,
   OAuth callback/App Links verification, Apple Keychain storage and App Store
   policy review; none of those are implicitly proven by Android checks.

## Rollback

Before a team imports stages, old unconfigured behavior remains available.
After team import, do **not** delete `team_inbox_boards` or revert to stale
localStorage; doing so can change stage semantics across devices. Roll back
clients with a data-preserving compatibility adapter, keep the canonical table
and its stage integrity guards, and resolve discrepancies before re-enabling
writes. Legacy Process rows named "Inbox" remain untouched.

No production DB migration, Play Store/App Store submission, or `main` merge
is performed by this branch.
