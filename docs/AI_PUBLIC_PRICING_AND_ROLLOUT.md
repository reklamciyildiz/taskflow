# Actiproc AI — controlled public launch and plan allowances

Status: **generous AI allowance policy is prepared; production activation still requires the verified database migration and environment configuration.**
Do not interpret a green CI run as proof that live Supabase/RPCs, Groq account limits,
cross-tenant ACLs or retention are ready.

## Included v1 offering (all are per UTC calendar month)

| Plan | Daily per user | Monthly shared organization pool | Commercial interpretation |
| --- | ---: | ---: | --- |
| Free | 10 | 30 | Meaningful product trial with fair-use protection |
| Individual ($12/year) | 50 | 300 | Useful personal AI without unlimited costs |
| Pro ($4/seat/month) | 100 | 800 per verified seat | Larger shared AI pool for deeper product use |
| Team ($6/seat/month) | 150 | 1,200 per verified seat | Organization shared pool; max 20 AI-funded seats in launch policy |

- Pro and Team allowances are **shared** across organization users, not individually
  issued to each member. Pro with 3 verified seats = **2,400 requests/month**;
  Team with 5 verified seats = **6,000 requests/month** (each user max 150/day).
  AI pool growth stops at **20 seats** in the introductory release, even if more
  than 20 seats are purchased; do not imply that seat 21 automatically adds AI
  allowance. A separate enterprise policy is needed for larger deployments.
- Existing active/trialing paid subscription determines plan. Payment hold,
  past-due, paused, expired and unverified plan upgrades revert to Free caps.
  A valid paid period after cancellation remains paid until the period expires.
- No unlimited AI for special organization accounts with unlimited seat entitlement:
  non-finite seat allowance maps to one AI seat pending an explicit commercial contract.
- A **successful quota reservation for a model attempt** counts as one AI request,
  even when it invokes helper tools internally. Each chat request can still use
  multiple provider calls; the quota is by request, not by underlying token or API
  call. A **12 requests / rolling 60 seconds per user** anti-spam limit is
  enforced atomically under the same quota locks. Refunded failures do not
  consume the minute allowance. Static product-help responses and failed provider
  admissions can be free according to current reservation logic.
- The same atomic org counter can include other AI features such as the legacy
  description generator. Only chat requests use the 12/minute burst guard. UI intentionally describes **AI requests**, not messages.
- Usage shown to the user comes from `ai_quota_counters`; this is **not** a
  billing meter and must never affect Creem invoices.
- This introductory AI entitlement is included in existing list prices.
  **No usage-based overages, auto top-ups or unexpected card charges** are created.

## Access safety

- `AXIOM_AI_BETA_MODE_ENABLED` still defaults to enabled and requires both
  existing UUID allowlists. Setting it to `false` authorizes non-beta users
  only if all public readiness conditions also pass:
  `AXIOM_AI_CHAT_ENABLED=true`,
  `AI_ATOMIC_QUOTA_ENABLED=true`,
  `GROQ_API_KEY` exists,
  `AI_GROQ_TPM_ADMISSION_ENABLED=true`,
  `AXIOM_AI_WRITE_TOOLS_ENABLED=false`, and
  `AXIOM_AI_ACTION_MUTATION_TOOLS_ENABLED=false`.
- The quota RPC and token admission RPC must be installed, service-only and
  fail closed on errors. Required migration:
  `supabase/migrations/20261018180000_ai_provider_token_admission.sql`
  and `supabase/migrations/20261102210000_ai_public_fair_use_burst_guard.sql`.
  The latter replaces the quota RPC *in place*, retains all usage data and
  registers `ai_public_burst_guard_ready()`. Public access fails with 503
  until this function returns `true` through the service role.
- Public v1 is read-only AI assistance; write proposals and automated action
  changes remain separately disabled, **not** a paid plan entitlement yet.
- Retrieval stays scoped to the actual authenticated organization/team/Process.
  Never accept a client-supplied plan, seat count or org ID for entitlements.
- AI Chat token telemetry now records **estimated** Groq model costs in
  `ai_requests.cost_usd`; current prices may change, not every provider
  invocation produces complete usage, and unrecognized models use a
  conservative estimate. **Not an exact billing invoice or hard spend cap**.

## Operator release checklist

1. Apply `supabase/migrations/20261102210000_ai_public_fair_use_burst_guard.sql`
   **after reviewing it**, using the primary Supabase SQL editor. No old data is
   deleted. Then verify the AI migrations/RLS/RPC privileges using read-only
   preflights, especially `docs/ai-production-readiness-preflight.sql` and:
   `SELECT public.ai_public_burst_guard_ready();` (must return true). Verify
   the existing provider-token admission RPC as well.
2. Verify the Groq model ID with the live `/models` endpoint. Do not use an
   obsolete/preview model without explicit risk acceptance. Configure
   account-level spending alerts/caps in Groq where supported.
3. Test a new ordinary Free organization, active Individual, active Pro,
   Team with 2+ paid seats, expired subscriber, paused payment and no permissions.
   Verify no cross-tenant content in prompts, citations or history.
4. Verify indexing freshness, citations, deletion/retention/erasure workflows,
   prompt-injection defenses and mobile streaming/cancellation.
5. Begin in a non-production or limited cohort. Keep
   `AXIOM_AI_BETA_MODE_ENABLED=true` until those checks pass.
6. Before opening to non-beta users, set the server-side Vercel flags to:
   ```text
   AXIOM_AI_CHAT_ENABLED=true
   AI_ATOMIC_QUOTA_ENABLED=true
   AI_GROQ_TPM_ADMISSION_ENABLED=true
   AXIOM_AI_WRITE_TOOLS_ENABLED=false
   AXIOM_AI_ACTION_MUTATION_TOOLS_ENABLED=false
   AXIOM_AI_BETA_MODE_ENABLED=false
   ```
   Keep `GROQ_API_KEY`, `GROQ_CHAT_MODEL`, provider/indexing secrets server-only.
   Confirm model, index, and access controls in production. No SQL change is
   introduced in this PR, but the prior migrations **must** already exist.
7. Smoke test ordinary user chat, quota consumption, 429/failure handling,
   model-price telemetry, and request concurrency on the deployed origin.
8. Monitor request, token, retrieval and index spending daily in the first week.
   Set `AXIOM_AI_BETA_MODE_ENABLED=true` to halt non-beta access if an issue is
   discovered. Full kill switch: `AXIOM_AI_CHAT_ENABLED=false`.

## Commercial follow-ups (not part of this release)

- Use observed p50/p95 input/output tokens, provider invoice and churn to
  revisit request limits. AI should not consume a majority of gross plan revenue.
- Continue to track provider usage and approximate USD costs, with alerting and
  separate account-level provider caps where available. The existing Groq TPM
  reservation plus 12/minute/user gate limit bursts, but request caps alone
  are **not** a hard monthly USD ceiling. Before raising limits further, add
  an atomic per-org USD/month guard that includes retrieval, embedding and
  multi-call tool cost. Do not present estimated `cost_usd` as invoiced cost.
- Build a secure first-party plan/seat change and AI-usage analytics dashboard.
- Review whether a higher-priced AI add-on or separate advanced model tier is
  justified by cost and adoption. Do not promise unlimited usage.
- Publish precise allowances on MarketingPricing only after production
  activation and successful payment-status downgrade QA.

## Premium AI product UI — acceptance (2026-11-02)

Marketing Pricing, billing plan comparison, and Upgrade Plan Modal all derive their
numbers from `lib/ai/ai-plan-catalog.ts`, which the server policy also imports:
- Free: 10/day/user, 30/month/org.
- Individual: 50/day/user, 300/month/org, annual subscription.
- Pro: 100/day/user, 800/month **per verified paid seat**.
- Team: 150/day/user, 1,200/month **per verified paid seat**.
- Shared Pro/Team allowances fund a maximum of 20 paid seats until a separate
  enterprise contract is implemented. There is no per-request Creem charge.

The AI Chat header shows remaining requests and daily cap, turns amber above
80%, and surfaces beta-only/not-ready status. The owner/admin Billing view
shows a larger, authenticated AI usage panel with monthly used/remaining,
UTC reset, daily remaining, 80%/100% warnings, paid-seat pooling and plan
comparison. Native Capacitor views preserve existing no-purchase rules.

The `GET /api/ai/usage` endpoint deliberately allows **authenticated members**
to read only their own daily count and the shared organization monthly
count, even while beta gating is active. This enables Billing to show an
accurate entitlement before chat is made available. Neither the endpoint
nor the UI grants AI access; only `requireAIChatUser` does. The response
includes `access: 'available' | 'beta_only' | 'not_ready'` and is marked
`private, no-store`. On verification failures, clients hide stale usage.

### Launch acceptance matrix — do not skip

1. With beta mode still on, sign in as a **non-beta Free user**. Pricing must
   state staged access; Billing can display verified 30/month and
   `beta_only`; Chat must continue to reject unauthorized beta access.
2. As an approved beta user, issue an AI prompt and confirm `/api/ai/usage`
   increments. Check retry/rollback and a monthly allowance of the actual
   organization's active plan.
3. Use a paid Individual user (300/month), Pro organization with 3 verified
   seats (2,400/month), and Team organization with 5 paid seats
   (6,000/month). Check both the per-user daily value and org shared pool.
4. Check expired/past-due plan falls back to Free. Usage may exceed its now
   smaller allowance: display `0 remaining`, never a negative balance.
5. Verify an 80% usage sample and full quota sample in UI. The warning must
   appear, without checkout side effects or auto top-ups.
6. Test a mobile Capacitor app session. It must show its allowance but not
   offer an in-app payment path.
7. Confirm write/mutation tools remain off, atomic quota and provider token
   admission remain enabled, and the 12-per-minute SQL guard is installed.
8. **Only after all tests pass**, in Vercel Production set
   `AXIOM_AI_BETA_MODE_ENABLED=false`, redeploy, and run a real ordinary-user
   chat smoke test. Revert the flag to `true` if any guard or request fails.

Implementation note: No Vercel environment mutation or production smoke
test is performed merely by merging this PR. The marketing cards are honest
about staged access until the beta flag is changed.
