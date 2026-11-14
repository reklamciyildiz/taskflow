# Actiproc P0 — Security honesty, completion chronology, and error monitoring

## 1. Security features
- Removed simulated Two-Factor Authentication and fictional Active Sessions interfaces from both the new Account page and legacy Settings.
- Deleted unused mock modal components. The actual Change Password functionality remains untouched.
- OAuth/NextAuth are unchanged. Google users can manage provider MFA in their Google Account.
- Product does **not** currently provide app-specific TOTP or remotely revoke sessions across devices. Do not claim otherwise.

## 2. Verified completion times
- SQL migration: supabase/migrations/20261114120000_p0_task_completion_timestamp.sql
- Nullable tasks.completed_at is managed by an authoritative PostgreSQL trigger, not a browser timestamp.
- For Project Actions, terminal stages are determined by projects.column_config with isTerminal=true.
- The canonical General Action default terminal ID is done. Custom General board stages live client-side and cannot be inferred at the DB layer.
- Open→terminal sets database time; terminal→terminal or metadata edits preserve it; terminal→open clears it; completing again stamps a new time.
- Historical completed Actions keep completed_at=NULL. Their original completion times cannot be reliably deduced from updated_at.
- Analytics velocity / completion duration and Achievements streaks use only verified timestamps. State-based completion totals continue to include legacy completed Actions.
- These are metrics of currently completed Actions, not immutable completion events; reopened historical cycles are outside this version's scope.
- DB schema migration is required before deploying code that reads completed_at.

## 3. Monitoring baseline
- App route-segment error boundary offers retry and sends only a fixed event code plus a bounded, sanitized Next digest.
- The monitoring ingest API requires a real authenticated session, a same-origin request, strict JSON sizes and best-effort in-memory per-user event throttling.
- Vercel Function Logs can be filtered by [actiproc-monitor]. It logs random event ID and timestamp, not user content, emails, URLs, raw errors, stacks or access tokens.
- This is a first-party baseline; external APM, durable centralized incident retention, distributed rate limits and proactive alerting are not yet installed.

## Mandatory controlled release sequence
1. Code review and successful CI in PR. Do not run Git auto-deploy.
2. Apply the completion migration on **isolated staging** first; verify project terminal stages, General done, reopen, re-complete, old unknown dates and no fake timestamps.
3. After authorizing the Production database change, run the additive migration in Production BEFORE deploying the new app code. Without it, task SELECT completed_at fails.
4. Check in Production that the completed_at column and actiproc_tasks_completed_at_guard trigger exist.
5. Manually deploy the matching main commit with automatic Git deploy still disabled.
6. Verify Project Action create→review→reopen, General Action done, Analytics weekly counters, Achievements streaks, account password change, OAuth login and authenticated error-boundary telemetry.
7. Review monitoring logs and establish log alerts/drains for on-call follow-up; observability is not complete until that is done.

### Read-only DB checks
SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='completed_at';
SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid='public.tasks'::regclass AND tgname='actiproc_tasks_completed_at_guard';

**Do not backfill from updated_at or created_at.**