# Actiproc AI — provider reliability rollout

## What changed
- Capacity errors are Actiproc-branded: users never see model-provider names or raw HTTP/TPM error text.
- The local 8k TPM ceiling was removed. `AI_GROQ_TPM_BUDGET` now accepts explicit 1,000–250,000 TPM values, while the unchanged default remains 7,200 TPM. Never configure above your actual model/account limit.
- Read tool selector admission estimates its own prompt and tool JSON rather than allocating an arbitrary 3,500 output tokens.
- Known pre-inference provider 429 failures free their unused token reservation; uncertain failures retain conservative estimates.
- A single bounded <=2.5 second retry may occur before first answer text. No infinite queues, no partial-response restarts.
- An independent OpenAI Chat Completions-compatible backup is optionally available for read-only requests when primary capacity is unavailable. Write-proposal requests never automatically fall back.
- Retry of a failed answer reclaims the same authorized, failed assistant message and does not duplicate persisted user messages. A fresh request/run/quota ID is still required.
- Internal logs retain sanitized request IDs/status/usage, without raw prompts, keys, or source text.

## Mandatory rollout sequence
1. Apply `supabase/migrations/20261104190000_ai_provider_zero_usage_finalization.sql` to staging, test it, then apply to production in a separately approved database operation. Git commits do not apply migrations.
2. Verify exact account, project and model rate limits at https://console.groq.com/docs/rate-limits. TPM is only one limit; RPM, RPD, OTPM/ITPM and vendor capacity can be lower.
3. Choose `AI_GROQ_TPM_BUDGET` below your verified account/model TPM with headroom. Example: `AI_GROQ_TPM_BUDGET=100000` **only if** your verified limit exceeds that. The built-in default is deliberately unchanged.
4. Preserve public guard settings: `AXIOM_AI_CHAT_ENABLED=true`, `AI_GROQ_TPM_ADMISSION_ENABLED=true`, `AI_ATOMIC_QUOTA_ENABLED=true`, authorized read-tool configuration and server secrets. A Vercel environment update affects only newly deployed builds.
5. Test normal non-beta user access to Process, Action, Checklist and Notes in staging, plus failure/retry and cross-organization denial.

## Optional separate OpenAI backup (OFF by default)

| Variable | Role |
|---|---|
| `AI_FALLBACK_OPENAI_ENABLED` | Explicit `true` opt-in |
| `AI_FALLBACK_OPENAI_API_KEY` | Server-only dedicated API key |
| `AI_FALLBACK_OPENAI_MODEL` | Explicit tested Chat Completions model ID |
| `AI_FALLBACK_TPM_BUDGET` | Measured provider/model TPM, 1,000–250,000; required |

Endpoint is fixed to `https://api.openai.com/v1/chat/completions`. No arbitrary URLs, client secrets or user-selected provider routes. Verify model stream/tool compatibility before enabling. The fallback is **independently billed** and may receive the same authorized workspace excerpts, with separate retention/privacy terms. Confirm consent/disclosures, DPA, data handling, spending limits and availability before enabling. This repository change does not activate it or change the customer's vendor automatically.

Fallback and automatic retry only occur before response text starts. An explicit write operation is never automatically replayed. A provider outage after a partial answer returns an error; a clean new response cannot be guaranteed. Both providers can be unavailable simultaneously.

## Commands

    npm ci
    npm run test:ai:reliability
    npm run test:ai:public
    npx tsx scripts/test-ai-providers.ts
    npx tsx scripts/test-ai-chat.ts
    npx tsc --noEmit

## Production observability
Monitor `ai_safe_retry` / `ai_fallback_selected` counts, provider-admission denials, normalized `ai_chat_failed` errors, upstream retry-after, error-to-success recovery, completion latency p50/p95, failed quota refunds, known-zero token finalizations and estimated per-provider cost. Never log user note content, credentials or actual prompts.

Failure of quota or admission database RPC remains fail-closed. Do not raise the TPM threshold merely to suppress errors. This PR does not deploy, apply SQL or activate a paid service.
