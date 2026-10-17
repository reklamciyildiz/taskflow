# Axiom AI chat rollout (Prompt 6)

The chat code is fail-closed and ships disabled. Do not enable it before the
conversation migration, retrieval/indexing rollout and provider smoke tests are
verified in staging.

## Supabase

1. Apply `supabase/migrations/20261017180000_ai_chat_conversations.sql` in staging.
2. Run `docs/ai-chat-preflight.sql` and verify all four tables exist.
3. Verify `anon_execute` and `authenticated_execute` are false and
   `service_execute` is true for all listed AI RPCs.
4. Verify RLS is enabled, browser roles cannot select, and service role can select.
5. Test two simultaneous requests, an idempotent duplicate request key, source
   access revocation, conversation ownership and expired run lease recovery.

## Vercel (server-only)

Keep `AXIOM_AI_CHAT_ENABLED=false` during the first deployment. Existing
provider/indexing variables remain required. After staging validation set:

For the controlled beta, keep `AXIOM_AI_BETA_MODE_ENABLED=true` and set both
`AXIOM_AI_BETA_USER_IDS` and `AXIOM_AI_BETA_ORGANIZATION_IDS` to approved
canonical UUIDs. Empty lists authorize nobody; do not use email addresses.

```text
AI_ATOMIC_QUOTA_ENABLED=true
AXIOM_AI_CHAT_ENABLED=true
AI_CHAT_MAX_OUTPUT_TOKENS=2048
AI_CHAT_TIMEOUT_MS=50000
AI_CHAT_USER_CONCURRENCY=2
AI_CHAT_ORG_CONCURRENCY=20
```

`GROQ_API_KEY`, `GROQ_CHAT_MODEL`, Cloudflare embedding variables and the
retrieval index version must already be configured server-side. No chat secret
uses a `NEXT_PUBLIC_` name.

## Before enabling production

- Complete the controlled indexing backfill and verify its freshness/failed-job queue.
- Run opt-in Groq/Cloudflare smoke tests with synthetic data.
- Exercise cross-organization, private/restricted Process and access-revocation tests
  against an isolated staging Supabase project.
- Confirm Vercel streaming behavior, disconnect cancellation, quota exhaustion and
  provider 429 handling under concurrency.
- Add retention/erasure operations for soft-deleted conversations before broad rollout.
