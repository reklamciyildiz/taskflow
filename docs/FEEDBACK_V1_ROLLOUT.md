# Actiproc — Fikirler & Öneriler (Community Feedback V1)

## Product design

- Sidebar entry and responsive /feedback page for all active Free / Individual / Pro / Team users.
- Suggestions by category and product area; full text of the suggestion is globally visible to signed-in users ONLY after platform review.
- A submitter sees their own pending or rejected proposals in **Önerilerim**. Public board never exposes author email, organization ID or workspace contents.
- One vote per user per idea; comments are moderated; all state transitions are traceable from status.
- **Güncellemeler** is a private per-user in-app updates tab for status changes. It is not yet integrated with the global notification bell or native push.
- Moderation requires ACTIPROC_FEEDBACK_ADMIN_EMAILS, a server-only comma-separated allowlist. A customer organization's owner/admin role DOES NOT confer global moderation.
- Staff moderation covers approval/rejection, roadmap status, comment approval/rejection and transaction-safe merging. Merge transfers unique supporter votes and comments to the destination. Repeated supporter votes are deduplicated.
- Privacy: public content must not contain secrets or private organization details. A human moderator must review text before release. Version 1 intentionally does not accept user-uploaded screenshots, HTML, or rich text.
- Database guard limits submissions to five suggestions and twenty comments per user per 24 hours. Do not rely on the client for limiting.

## Deploy safely

1. No production database changes, Vercel environment edits, Git auto-deployment or live release are performed by this GitHub implementation.
2. Review and apply supabase/migrations/20261113110000_actiproc_feedback_hub.sql in **isolated staging** first. It is additive; it creates four tables, service-role-only RPC, indexes and triggers. RLS is enabled with no direct anon/authenticated policies. The API uses the server-side service role AFTER checking the authenticated canonical user.
3. Configure ACTIPROC_FEEDBACK_ADMIN_EMAILS with explicit authorized Actiproc staff email addresses in staging. Never expose that value as NEXT_PUBLIC.
4. Run node-based contracts and typecheck: npx tsx scripts/test-feedback-contract.ts and npx tsc --noEmit, then npm run build. Confirm CI in PR.
5. Staging E2E cases: no auth (401), organization onboarding (403), two distinct tenants cannot read pending suggestions, public approved suggestion visible to both tenants without author PII, tenant owner cannot moderate, allowlisted staff can moderate, 5-post and 20-comment daily limits, concurrent duplicate vote, unlike after like, vote counts, pending comment visibility, merged vote dedupe and comment transfer, comments approved only on published posts, negative UUID/rule cases, pagination/search, notifications isolation and read-only, mobile touch and narrow viewport.
6. Once **staging evidence** is recorded and explicit Production approval is given, run the migration in Production and verify it manually BEFORE deploying the new web code. Confirm server-only staff allowlist is set in Vercel Production. With migration missing the API intentionally fails closed (503).
7. Verify production smoke tests with a fresh Free account and a platform-staff account before inviting users. Keep Git auto-deploy disabled according to existing release policy.

## Operational and product choices

- Platform-global community board (not tenant-specific); therefore public suggestions must not include internal business data. This visibility model must be communicated to users and enforced with moderation.
- A status of "planned" is a decision, not an implicit SLA or promised delivery date.
- Published roadmap is **not** a separate route in V1: status filters in the main feedback board are the transparent lightweight roadmap.
- To reduce noise and abuse, author display is intentionally anonymous to other users; moderators receive IDs, not private email records.
- New status updates are stored as private feedback_updates; global notification integration and email/push require separate provider-specific release validation.
- The admin merge action includes a searchable approved-suggestion picker, preventing manual UUID entry.

## Schema/RLS verification (read-only, after staging migration)

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname='public' AND tablename IN
 ('feedback_posts','feedback_votes','feedback_comments','feedback_updates');

SELECT tablename, policyname FROM pg_policies
WHERE schemaname='public' AND tablename LIKE 'feedback_%';

-- Expected: all four tables rowsecurity=true and no anon/authenticated RLS policies.
-- Verify RPC privileges and rate/trigger behavior with disposable test users.
