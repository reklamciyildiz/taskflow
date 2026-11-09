# Connected Notes V1 — Release and QA

## User experience
- Each checklist item carries a small, unobtrusive Note icon. A count appears only when Notes are linked. **Note bodies never render in checklist rows.**
- Clicking opens a compact popover to open a linked Note, add an existing Action Note, create a new connected Note, or unlink without deleting the Note.
- The Note editor shows linked checklist items. Selecting one returns to the checklist, unhides completed items, and focuses the stable item ID.
- A Note can link to several checklist items in its parent Action, and a checklist item can link to several Notes. Cross-Action links are prohibited in V1.

## Deployment order
1. Review and test PR #33 on a staging branch.
2. Apply supabase/migrations/20261109190000_connected_checklist_notes.sql to staging first, using the normal controlled migration procedure. Do not run it on Production without explicit approval.
3. Run CI and manual tests against real staging Supabase. React UI expects the new table to exist; otherwise it reports unavailable connections instead of silently discarding data.
4. Only after QA, separately approve a Production migration and deployment. Keep the current Vercel Git auto-deployment setting; this PR never changes it.

## Manual acceptance matrix
- Create 2 Notes on one checklist item. Verify only a compact 2 notes control is visible until clicked.
- Click each Note, edit rich TipTap content, return to the exact checklist item; verify autosave and existing Note search/filters.
- Link 1 Note to 2 checklist items, unlink one, verify Note content remains.
- Delete a linked Note; verify its links disappear. Delete a checklist item and confirm the Note survives. Reorder and rename an item without changing its ID; links survive.
- While checklist autosave is pending, create/link a Note; verify the association is committed after the checklist ID is persisted.
- Verify that viewers can open linked Notes but cannot link/unlink/create them.
- Try to link a Note to another Action, Team or organization using the API. Expect 404/403/409, never a record leak.
- Test mobile touch widths (320px, 375px, 768px), long Note titles, keyboard Tab/Escape, screen reader labels and reduced-motion settings.
- Test separate user accounts, including users with no Team membership and admins.

## Operational constraints
- Additive table; existing Notes/Checklist data is not migrated, rewritten or duplicated.
- DB triggers independently enforce same-Action identity and current JSON checklist IDs. The task update trigger removes stale links on deletion, and Note deletion cascades to its links.
- API access checks enforce Team/Process visibility and task mutation permissions. Never query this table from the browser Supabase client.
- AI/RAG awareness of this relationship is a separate feature. Do not claim that all relationship questions are answerable by AI until indexed/read-tool support is added.
- This PR has not been deployed. Do not merge before staging verification.
