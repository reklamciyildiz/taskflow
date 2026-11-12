# Actiproc AI Architecture V2 — Phase A (opt-in canary)

This is an **additive, reversible** upgrade. It keeps existing auth, RLS, chat history, Action/Note grounding, quota, streaming and write approvals. It does not require Redis, a background worker or a new GPU instance.

## Feature flags: defaults remain OFF

| Key | Default/effect |
| --- | --- |
| `AI_PROVIDER_ADMISSION_V2_ENABLED` | **false**. All provider reservations use the original atomic `reserve_ai_provider_tokens` until the new SQL is installed and validated. |
| `AI_MODEL_ROUTING_ENABLED` | **false**. Model remains `GROQ_CHAT_MODEL` (Qwen by default). |
| `AI_MODEL_ROUTING_ROLLOUT_PERCENT` | **0**. Stable 0–100% of organizations. Only selected organizations route read-only model calls. |
| `AI_MODEL_GENERAL` | `openai/gpt-oss-120b`; can be `openai/gpt-oss-20b` or `qwen/qwen3.8-27b`. |
| `AI_MODEL_DEEP` | `qwen/qwen3.8-27b`; same three safe model IDs. |
| `AI_GROQ_TPM_BUDGET` | 7,200, conservative. Must be <= verified model TPM. |
| `AI_GROQ_QWEN_TPM_BUDGET` | Optional per-model ceiling, capped at `AI_GROQ_TPM_BUDGET`. |
| `AI_GROQ_GPT_OSS_TPM_BUDGET` | Optional per-model ceiling, capped at `AI_GROQ_TPM_BUDGET`. |
| `AI_GROQ_ACCOUNT_TPM_BUDGET` | Per-provider aggregate TPM ceiling; defaults to the model admission limit. Confirm the actual account limit before increasing. |
| `AI_GROQ_MODEL_RPM_BUDGET` | 24 RPM per model, conservative. |
| `AI_GROQ_ACCOUNT_RPM_BUDGET` | 24 RPM across ALL models on the same provider account. |
| `AI_CAPACITY_SHORT_WAIT_ENABLED` | **false**. When enabled only waits once for a verified reset <=1.2 seconds and with >=5 seconds remaining. |
| `AI_FALLBACK_OPENAI_ENABLED` | Existing opt-in independent provider fallback; remains disabled unless its key, model and TPM budget are explicitly supplied. |

The independent fallback's TPM and RPM limits can also be set with `AI_FALLBACK_TPM_BUDGET`, `AI_FALLBACK_ACCOUNT_TPM_BUDGET`, `AI_FALLBACK_MODEL_RPM_BUDGET`, and `AI_FALLBACK_ACCOUNT_RPM_BUDGET`. Set **actual** account limits, not optimistic guesses. Misconfigured values cannot confer more paid capacity.

**Do not enable V2 with missing SQL**: `AI_PROVIDER_ADMISSION_V2_ENABLED=true` switches ALL provider admissions to the new RPC. With the function missing, requests will fail closed and users will receive temporary capacity errors.

## Controlled rollout and rollback

1. Review and run `supabase/migrations/20261112183000_ai_provider_capacity_v2.sql` **only on a separate staging database** first; validate with the included isolated PostgreSQL tests.
2. Deploy code with both flags OFF. Verify existing Qwen flow, read-only lookups, retries, explicit write proposals and billing quotas are unchanged.
3. After separately approving the Production migration, apply the SQL from a privileged session. The table and original V1 function are unchanged; the migration adds only a service-role-only RPC.
4. Read the **actual limits** from the Groq Console (account/organization, model, RPM/TPM and any ITPM/OTPM). The V2 guard covers RPM and combined TPM; it does not by itself enforce separate input/output or daily token limits. Set conservative per-model and provider budgets.
5. Enable **only** `AI_PROVIDER_ADMISSION_V2_ENABLED=true`. Check request-denial logs, costs and legacy model response rate. V2 admission covers every conversation regardless of canary group.
6. Enable `AI_MODEL_ROUTING_ENABLED=true` and `AI_MODEL_ROUTING_ROLLOUT_PERCENT=5` (then 10, 25, 50, 100 as metrics warrant). The exact share is a deterministic hash of organization ID, not a randomized per-request lottery.
7. Observe `ai_model_v2_routed`, `ai_provider_admission_denied`, existing `ai_chat_failed` and `ai_fallback_selected` events. No message body, API key, Notes content or user identity is logged in the new events. Cross-model models remain subject to the shared provider account budget.
8. **Rollback immediately** with `AI_MODEL_ROUTING_ENABLED=false`; routing returns to the configured legacy model without changing any chat history. For a full V2 rollback, also set `AI_PROVIDER_ADMISSION_V2_ENABLED=false` (original RPC remains available). Do not remove the SQL function during an incident.

### Rollback caveat

The V1 RPC lacks account-wide RPM safeguards. Returning to V1 restores *legacy behavior*, not V2 capacity protection. Re-enable only after any V2 incident is resolved.

## Quality gate (never assume a cheaper model is better)

Before making GPT-OSS the default, compare it against Qwen with authorized Turkish and English:
- Rich Note synthesis and multi-source relevance/citations
- Actual Action/Process names and no unauthorized information leaks
- Structured tool selection (both read-only and proposal paths)
- P50/P95 first-token and total latency, provider 429 and timeouts
- Measured token usage, request cost, daily and monthly spend

The current routing heuristic deliberately leaves **all write/proposal flows pinned to the original model**. General read-only conversations may choose GPT-OSS; knowledge retrieval or analytical prompts choose Qwen. The original independent OpenAI fallback is still used only for safe read-only pre-response errors.

A test suite passing is not evidence of live provider quality or real multi-account load. Use a staging test account and actual concurrent synthetic load (1/5/20/50 users), under paid and explicitly verified limits. Do not blast the free Groq tier with an uncontrolled benchmark.

## Tests

- `npx tsx scripts/test-ai-architecture-v2.ts`
- `bash scripts/test-ai-architecture-v2-sql.sh` in **isolated PostgreSQL only**
- `npx tsx scripts/test-ai-providers.ts`
- `npx tsx scripts/test-ai-reliability.ts`
- `npx tsx scripts/test-ai-workspace-grounding.ts`
- `npx tsc --noEmit && npm run lint && npm run build`

## Next optional phases

- Evidence-based model-quality benchmark with private test tenants, then guarded paid-plan default routing.
- Separate ITPM/OTPM and RPD/TPD admission once actual provider limits are known.
- Durable job queue for long analyses, explicit cancellation and user notification; **do not** keep Vercel streaming connections open in a persistent queue.
- Per-plan observability and spend-limit dashboards, with company-wide cost alerts.

**Production settings or migrations are not modified by this PR. Vercel auto-deployment remains disabled.**
