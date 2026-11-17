# Actiproc P2.3.2 — Premium dependency UI

## What ships

The P2.3.2 interface sits on top of the P2.3.1 relational DAG and its database-owned integrity triggers. **It does not change the completion invariant.**

- **Action Panel (updated 17 Nov 2026):** always-visible single-line Dependencies status dock with compact counts and Blocked alert. Opening it launches an independently scrolling responsive management dialog (bottom sheet on phones) rather than expanding two large cards inside the editor. The two directions, per-Action completion state, navigation, unlink and searchable Add picker are preserved.
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

## 17 November 2026 — compact Dependencies UI refinement

The first accordion design permanently occupied a multi-line strip and then
expanded inside the fixed-height Action Panel, reducing room for Notes and
Checklist. The replacement keeps only one discoverable 44px status row in the
panel. When linked, tiny counters identify prerequisite and dependent counts;
when blocked, the warning remains explicit even if the blocker is in a
restricted Process.

Opening the row does **not** expand or scroll the Action Panel. A responsive
dialog manages both relation directions using compact, divided rows and
44px-or-larger touch controls. On mobile the dialog anchors to the bottom
of the viewport and keeps its content independently scrollable. The searchable
Add picker is a second state inside the **same dialog**, so Back returns to
the relation overview without nested modal focus traps. Esc and the close
control exit the dialog. All new affordances reuse the existing translated
EN/TR catalog labels.

The client picker now excludes existing relations in *either* direction,
preventing users from offering an immediately invalid reverse edge.
Server-side ACL, cycle detection, completion enforcement, tenant isolation
and the hidden-blocker privacy guarantee are unchanged; the design is not
a permissions change.

Acceptance: 320px/360px/412px Android viewports, desktop and tablet;
empty/blocked/ready/mixed relations, restricted hidden blockers, read-only
accounts, network errors/retry, fast Action switching, keyboard Escape and
focus return, Add/Back/Remove navigation. Automated gates include the
dependency UI contract, Next.js build and bundled Android UI build; real
device verification remains separate.
