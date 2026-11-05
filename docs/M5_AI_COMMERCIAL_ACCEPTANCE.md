# M5 — AI commercial readiness (code)
The code rollout does not turn on production AI automatically.

## Product rules
Free: 10/day and 30/month. Individual: 50/day and 300/month. Pro: 100/day and 800/month/verified paid seat. Team: 150/day and 1200/month/verified seat. Monthly pool is organization-shared and capped at 20 AI-funded seats. Expired, paused, payment-held and past-due memberships revert to Free.

AI Chat and legacy Description Generator now use the same authenticated beta/public access policy, paid plan quota reservation, and provider token-admission RPC. Denied pre-provider admissions release the user quota. Cached descriptions require no new model generation.

## Production acceptance — pending
1. Check Supabase AI migrations and RPCs including ai_public_burst_guard_ready() in the selected environment.
2. Check server-side flags AXIOM_AI_CHAT_ENABLED, AI_ATOMIC_QUOTA_ENABLED, AI_GROQ_TPM_ADMISSION_ENABLED, GROQ_API_KEY and current provider models; do not expose secrets.
3. Test ordinary Free, beta, Individual, Pro with three purchased seats, Team with five, past-due, expired and payment-held users.
4. Validate 12-per-minute SQL guard, daily/monthly quotas, cancellation/refunds, provider admission and fallback, no cross-tenant retrieval, and private cache.
5. Keep AXIOM_AI_BETA_MODE_ENABLED=true until live preflights and operator approval. Initial public release still explicitly disallows write tools and action mutation tools.

No real provider requests, database migration, Vercel environment mutation or deployment is performed in M5.
