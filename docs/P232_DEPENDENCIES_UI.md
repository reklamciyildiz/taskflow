# Actiproc P2.3.2 — Premium dependency UI

## What ships

The P2.3.2 interface sits on top of the P2.3.1 relational DAG and its database-owned integrity triggers. **It does not change the completion invariant.**

- **Action Panel:** always-discoverable collapsible Dependencies strip. Expand to see two directions: **Waiting for** (prerequisites) and **Blocks** (dependents), with per-Action completion state, accessible navigation, unlink and a dedicated responsive search dialog.
- **Link picker:** searches only current-team Action data already visible to the authenticated user, excluding the Action itself, existing links, non-editable Actions and Action-level recurring schedules. Both Actions are re-authorized **again** by the backend.
- **Board:** compact **Blocked**, **Ready** and **Blocking** chips with a dependency filter. Mobile cards and property-grouped Board retain the same indicators; dragging an unfinished blocked Action into a terminal stage gives immediate feedback. SQL still prevents all bypasses.
- **List:** dependency chips, status filters, and disabled completion/terminal controls when a known prerequisite is unfinished. Unblocked editing is unchanged.
- **Locales:** English source strings and centralized Turkish translations, preserving user-entered Action titles.

## Privacy and performance

`GET /api/tasks/dependency-summary?teamId=<uuid>` authenticates the user and team membership, scans same-team dependencies in bounded pages, resolves Process/Inbox completion on the server, and emits **only visible Action IDs and boolean summary flags**.

- Does not return the identity, title, Process or stage of an inaccessible prerequisite.
- A visible Action may report `blocked: true` even when its unfinished prerequisite is inaccessible, so UI does not show false readiness.
- `ready` means **an unfinished Action with at least one prerequisite and every prerequisite complete**; unrelated Actions do not show Ready.
- No per-card N+1 queries; refresh on local stage updates, dependency events and tab focus.
- On API failure, clear the previous summary and disable dependency filters. Never turn unavailable data into an "all clear" state.
- The UI never relies on its own checks for data integrity. SQL rejects cyclical edges, cross-team links, recurring Actions and terminal transitions with unfinished prerequisites.

## QA / CI gates

`.github/workflows/p23-dependencies-foundation.yml` executes:

1. Domain and SQL precondition tests plus real PostgreSQL concurrency tests.
2. Actual pair API route with mocked services and private Process ACL scenarios.
3. Actual summary API route with viewer/member access, hidden blockers, terminal-stage resolution, error fallback and empty workspace.
4. P2.3.2 UI integration checks, dependency filter truth table and Turkish catalog keys.
5. Existing Board/scheduling regressions, TypeScript and a production Next.js build with inert credentials.

## Manual browser/device acceptance checklist

After deploying the branch to **staging** against a database with the P2.3.1 migration, sign in using normal team member, team viewer and restricted/private Process test accounts:

- Action Panel: search 0/1/100+ Actions, scroll, Escape, focus, keyboard selection, search in Turkish, narrow Android viewport, empty and network-failure states.
- Link A → B, duplicate link, remove link, try self-link and 3-node cycle, and verify reverse direction in B's panel.
- Complete blocker A and verify B becomes Ready; reopen A and verify B shows Blocked; try Board drag, List checkbox, inline List status, Action Panel status and a raw PATCH.
- Check that a non-member/viewer cannot mutate links; a member cannot select or view private Process tasks they cannot access. The hidden prerequisite must never expose its name or ID.
- Confirm mobile and desktop Board filters, property-grouped Board, List filter reset on Process/team switch, and refresh across two signed-in browsers.
- Validate the exact EN/TR labels and screen-reader announcements; verify custom terminal stages and unsynchronized Inbox errors.
- Confirm no affected Action attachments, Notes, Checklists, autosave and recurrence/scheduling behavior regressions.

**Not in P2.3.2:** no automatic stage changes, no automatically shifted dates, no unblock push notifications, no recurring occurrence-level dependencies and no dependency graph visualization. Those belong to later roadmap steps.

**Deployment caution:** A SQL success response only proves the migration completed; verify the branch in staging and obtain explicit deployment approval before merging the draft PR into `main`. The production SQL migration may already have been run manually by the project owner; do not rerun it blindly.
