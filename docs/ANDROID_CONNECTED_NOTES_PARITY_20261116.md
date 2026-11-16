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

## Troubleshooting: production-beta build stops at OPTIONS HTTP 401

The `android:debug:production-beta` command intentionally checks the *live*
`https://www.actiproc.com` API **before** bundling the APK. A 401 from
`OPTIONS /api/tasks/:id/checklist-note-links` means the mobile CORS
preflight is being rejected. The deployed Production middleware may still be
old or `MOBILE_AUTH_ALLOWED_ORIGINS` may omit `https://localhost`. A
successful `git pull` does not deploy the Next.js API to Vercel.

Check the Production domain's preflight from PowerShell (no token needed):

```powershell
curl.exe -i -X OPTIONS "https://www.actiproc.com/api/tasks/00000000-0000-0000-0000-000000000000/checklist-note-links" -H "Origin: https://localhost" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: authorization,content-type"
```

Expected: `HTTP 204`, exact `Access-Control-Allow-Origin: https://localhost`,
`Access-Control-Allow-Methods` including `GET`,
`Access-Control-Allow-Headers` including `authorization` and `content-type`,
and `Vary: Origin`. Repeat with `POST` and `DELETE`. The API must
still reject a made-up Bearer token with `401`.

**Rollout order**:
1. Verify required database migrations in the selected Supabase Production
   project, including `20261109190000_connected_checklist_notes.sql`.
   Other changes in the chosen main commit may need migrations too, such as
   `20261115220000_task_dependencies_foundation.sql`.
2. Deploy a **new build of current main** to Vercel **Production**, not
   the Redeploy action for an older deployment. The repository currently
   specifies `git.deploymentEnabled=false` in `vercel.json`; a push or
   `git pull` alone will not publish the backend. Use the Vercel project
   deployment flow, or authenticated `vercel deploy --prod` from the updated
   and correctly linked project directory. Confirm the domain points to
   this new deployment.
3. Verify Vercel Production `MOBILE_AUTH_ALLOWED_ORIGINS` contains
   `https://localhost` (preserve other deliberately authorized origins).
   An env change requires a fresh deployment.
4. Run `npm --prefix mobile run verify:android-production-beta` and
   only if it passes, run
   `npm --prefix mobile run android:debug:production-beta`.
5. Install the new APK and perform the physical-device acceptance matrix
   above. A successful build alone is not evidence of device parity.

The production gate now rejects missing CORS methods, required headers,
wildcard origins and missing `Vary: Origin` in addition to wrong HTTP
statuses. Failure diagnostics never suppress or override the security gate.
`npm --prefix mobile run build` is a local UI-only build, **not** a verified
Production APK.

### Local regression test (no live backend)
```powershell
node --test mobile/scripts/test-production-preflight.mjs
npx tsx scripts/test-mobile-connected-notes.ts
```

The `npm ci --prefix mobile` audit warning is a separate dependency
maintenance concern. Do not blindly run `npm audit fix --force`; this can
introduce incompatible major-version changes. Triage actual dependency
paths with `npm audit --prefix mobile --omit=dev` and
`npm audit --prefix mobile`.
