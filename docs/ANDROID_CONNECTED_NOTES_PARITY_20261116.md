# Android Connected Notes (Note ↔ Checklist) parity — 16 November 2026

## Findings

The shipped bundled Capacitor Android shell renders the shared React `ActionPanel`,
`ActionNotes`, `TaskItemNodeView`, and `ChecklistNotesContext`; these already
implement bidirectional links in the desktop web app. It was therefore **not**
necessary or safe to fork a separate Android note-link database, or duplicate the
editors. Both clients must operate on the existing `note_checklist_links` table.

The confirmed Android transport blocker was `middleware.ts`:
`/api/tasks/:id/checklist-note-links` was absent from the narrowly enumerated
mobile shared API routes. Unlike the already-allowed `/api/tasks/:id/notes`,
mobile Bearer requests got rejected by the NextAuth cookie gate and the CORS
preflight from the Android `https://localhost` WebView could not complete.
This manifests as missing linked notes and failed connect/disconnect actions.

An initial audit concern around `requireNoteAccess` was **not** a real bug:
it already accepts the mobile `NextRequest`, authenticates Bearer once and
passes the verified `AuthedContext` into `requireTaskNoteAccess`.
This code is intentionally unchanged.

## Implementation

- Add precisely the `/api/tasks/:id/checklist-note-links` pattern to
  `mobileSharedApi`; existing strict Bearer verification and the endpoint's
  organization/team/project ACL checks remain mandatory. This is **not** a new
  anonymous or public route.
- Reuse the existing mobile fetch adapter: remote HTTPS API plus short-lived
  Bearer, 401 refresh, and allowed-origin CORS. No new mobile token storage.
- Checklist -> Note: visible touch target; create a linked Note or find another
  Note in the same Action; open Note; unlink without deleting content.
- Note -> Checklist: touch-friendly add/search/attach, visit linked item,
  remove relation without deleting the Note or checklist.
- An API error must **not** silently appear as "No linked items". Loading/error
  states and Retry work from both directions.
- All new visible labels and recovery messages use the centralized EN/TR
  catalog, consistent with per-user language preference.
- No schema migration added; the previously created
  `20261109190000_connected_checklist_notes.sql` must already be applied
  on the target backend before links can work.

## Automated gates

```powershell
npx tsx scripts/test-mobile-connected-notes.ts
npx tsx scripts/test-connected-notes.ts
npm run test:action-notes
npm run test:mobile-web
node scripts/test-capacitor-mobile-shell.mjs
npx tsc --noEmit
npm --prefix mobile run build
npm run build
```

The Android parity workflow validates both the API and the **locally bundled
Capacitor/Vite UI**; a web-only Next.js build is not evidence that the installed
APK contains the change. These gates are source/unit/build checks, **not**
device interaction or live Supabase acceptance.

## Manual acceptance matrix — real backend, real Android device

1. Confirm the target Supabase has the `note_checklist_links` table and
   correct migration, without reapplying the production migration blindly.
2. Deploy matching Next.js backend to Vercel Production first; simply
   rebuilding an APK against the old backend leaves the 401/CORS defect.
3. Rebuild/sync and install the **new** bundled Android APK. Changing code in
   GitHub or deploying Vercel alone will not update the already-installed
   locally bundled Android UI.
4. Open a permitted Action with at least two checklist items. Tap the visible
   "Link note" control; create a new linked Note; verify Note tab opens.
5. From checklist, connect an existing Note; check its title and link count.
6. From Note, link another checklist item; return to Checklist; tap either
   linked Note and verify navigation/focus. Refresh and confirm persistence.
7. Unlink both directions; verify Note content and checklist item text remain.
8. Test searching with non-ASCII/Turkish text, long titles, keyboard and
   touch targets at 320, 360 and 412 logical pixels. Dark/light mode and
   keyboard-open bottom sheet should not hide the popovers.
9. Change user to Turkish and English; verify core new labels, errors and
   keyboard accessibility. Do not translate user-owned content.
10. Sign in as a team viewer, separate organization member and a member
    lacking Process access. Read-only user may only see authorized links.
    Server must reject writes and cross-Action/cross-tenant note IDs.
11. Simulate network/offline failure, wait for error and retry; existing link
    data must never be replaced by a fabricated empty set. Failed mutation
    must leave data unchanged.
12. Test reopening an Action after checklist edit, switching tasks quickly,
    and reloading note links (stale fetch responses cannot overwrite the
    current Action's links).

## Rollout

Main-branch merge is permitted after green checks. Vercel automatic deployment
is not enabled by this work. Backend and APK rollout are **two distinct steps**;
roll back the APK to the preceding build if touch UI regressions occur, and
restore a previous Vercel deployment if the authorized endpoint misbehaves.

Do not claim complete device parity without the manual acceptance matrix.
