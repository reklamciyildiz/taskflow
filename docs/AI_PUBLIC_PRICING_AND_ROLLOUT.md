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
