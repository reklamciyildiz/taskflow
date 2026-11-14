# Actiproc P1 — First-success onboarding and template gallery

## What shipped in this PR
1. **Process Center → Starter library**: eight curated Process templates with categories, search, safe previews of terminal stages. Templates are definition-only: no customer or Action data is automatically created.
2. **Real Process creation integration**: Gallery opens the existing CreateProjectModal prefilled with a template, but users can rename/reorder/add/remove stages and change permissions before saving. Each creation receives **fresh UUID stage IDs**. Existing server entitlement checks, organization/team authorization and Process limit handling remain authoritative.
3. **Getting started page**: `/get-started` offers a 3-step first-success guide and an interactive temporary sample workspace. Moving example Actions affects only local React state; no API/network/storage writes. A visible label makes the distinction explicit.
4. **First-success milestones**: derive three milestones from actual TaskContext data in the active team: at least one visible Process, one saved Action linked to a visible Process, and one Action in a configured terminal stage. Terminal is not equivalent to business success. No fabricated analytics or arbitrary success badges.
5. **Dashboard entry point**: first-success card appears while incomplete, with a per-user/per-team optional dismiss control; Dashboard header keeps a 'Start here' link. Creating a new organization leads to the new guide. Joining an existing team continues to Dashboard.

## Privacy, billing and safety
- Sample workspace uses fixed fictional cards and NEVER calls Supabase, task API, or localStorage.
- No auto-seeded real tasks, extra Process instances, organizations, AI requests or notes.
- Free and other plan Process limits are still enforced at `POST /api/projects` and existing paywall modal remains intact.
- Organization/team permissions are unchanged. Normal members cannot create processes via the Gallery; they may inspect a safe sample.
- P0 database migration is independent. P1 requires **no new migration or secrets**.
- English follows the authenticated app UI conventions; marketing EN/TR routes are unaffected.
- Automatic Vercel deployment remains OFF. Do not deploy during live P0 acceptance testing unless separately approved.

## Browser and QA checklist
- Open `/get-started` using a new organization and confirm 0/3, no fake Activity; expand and reset the sample workspace; switch workflows; leave and revisit to verify it is reset.
- Open Process Center. Search/filter templates and pick Product launch. In create modal verify name/stages and terminal marker, edit a stage and click Create.
- Create one Action in the new Process, verify guide 2/3, move to the terminal stage and verify 3/3. Reopen it and guide must return to 2/3.
- With existing Processes or completed Actions, the guide reflects the actual stored current team work, not staged demo data.
- Check role viewer/member cannot create Process; admin can. Free plan second Process attempt returns existing paywall and **does not** create Process.
- Run at 320px/375px/768px/1440px, test keyboard tab navigation, stage dropdown and dismiss/reopen.
- Review CI workflow `P1 first-success onboarding quality` for test and production build status.

## Limitations
- This is onboarding and a no-write sample, not a separate persistent sandbox organization. Persistent sandbox workspaces would need strict tenant isolation and deletion workflows.
- First-success milestones track **current state**. Reopening a completed Action returns progress to 2/3; there is no permanent historical graduation award.
- User dismissal is local per browser and team, not server-synchronized across devices.
- Templates define stages only. They do not create customer records, automations, invitations, or sample tasks.