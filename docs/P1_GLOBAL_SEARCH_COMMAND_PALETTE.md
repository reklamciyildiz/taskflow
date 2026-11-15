# P1 — Global Search & Command Center (November 2026)

## Capabilities
- Use **Ctrl+K** / **⌘K** throughout the authenticated app to open the searchable command palette.
- Search: Actions (title and description), Processes, Notes (rich-text title/body), Checklist items inside Actions, Teams, and Customers. Search supports Turkish accent/case normalization.
- Press **↑/↓** and **Enter** to select, **Escape** to close.
- **Ctrl/⌘ + Shift + A** creates an Action when not typing and user is not a viewer. Quick navigation commands access Planner, Process Center, Knowledge Hub, Dashboard, Settings and Customers.
- Top-bar search is one compact trigger; no competing drop-down.
- Scope switch: *All accessible teams* or *Current team*.
- Results link directly to the Action panel, specific Note/Checklist focus using existing `/board?task=...&note=...` or `checklist=...` deep link flow, Process board, Team, or chosen Customer card.
- Requests debounce (190 ms), cancel stale requests, and send no query to localStorage. No query logging.

## Authorization / privacy (release blockers)
- API `/api/search` resolves the canonical user from NextAuth or authenticated mobile token. It obtains the org and teams from the database and intersects with actual team membership (or org-admin access).
- It fetches allowed Process IDs from the existing `projectDb.getVisibleForUser` ACL logic. Restricted/private Process names and all their Actions, Notes and Checklists are excluded **after authorization**.
- Note visibility requires its parent Action to be both in the authorized team and visible Process. A Note whose task doesn't match is never returned.
- Customers follow the existing organization-wide directory visibility. No note content or tasks from other organizations or non-member teams may leak.
- API uses service-role access **only on the server** and returns small result projections, not raw record bodies. `Cache-Control: private, no-store`. Authenticated rate limit: best-effort 20 searches per 10 seconds per process; for distributed protection install a shared rate-limit store later.

## Performance / honest limits
- Bounded search rather than entire-table JSON downloads: 450 recently updated Action records, 320 recent Note records, plus additional database-matched title/description candidates and canonical note-parent validation. Process ACL and eligible team list are computed server-side.
- Old notes/Checklist text outside the recent windows may be missed even though old Action and Note titles are additionally matched. When any source reaches its scan cap, the UI states that results can be partial. This is a known limitation, not full database full-text indexing.
- A future larger-scale iteration should add a materialized/indexed search document (FTS + Turkish search dictionary as appropriate), real distributed throttling, and measured p95 query latency. Do not misrepresent this first step as exhaustive over unlimited workspaces.
- Team list capped at 120; additional organizations return an explicit error instead of silent cross-scope behavior.
- Requests do not mutate business records and require no new Supabase migration or environment variables.

## Manual acceptance checks
1. Ctrl+K/⌘K from Dashboard, Board, Knowledge Hub and Planner; ensure only one modal, Escape and keyboard selection work.
2. Search matching Process, Action description, Note body, Checklist text, Turkish `İ/ı/ş/ğ` and customer.
3. Click Note result: Action editor should focus the canonical Note. Checklist result should focus the Checklist item. Team switching then navigation to another team should keep the correct result.
4. Test viewer/member, org-admin and project restricted/private profiles: invisible content must never appear in results, network payload or browser cache.
5. Check rapid typing, online/offline errors, 320/375/768/1440px widths and mobile keyboard. Create Action shortcut should not open when typing or for viewers.
6. On a very large workspace, verify the partial-content caveat. Use Vercel function logs for errors without logging private search strings.
7. Vercel Git deployments remain disabled; P0 and previous production deployment are not changed.

## Release
- Merge only after CI type/build and source ACL tests pass.
- No DB migration. Manual Production deployment after separate review. Do not claim the CI source tests replace cross-tenant database E2E acceptance.
