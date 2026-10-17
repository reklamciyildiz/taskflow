# AI staging validation runbook

Use an isolated Supabase project and synthetic records only. Never point these
steps at production unless a step is explicitly read-only.

## Safe rollout order

1. Deploy with `AI_INDEXING_ENABLED=false`, `AI_INDEX_BACKFILL_ENABLED=false`
   and `AXIOM_AI_CHAT_ENABLED=false`.
2. Apply migrations `140000`, `160000`, `170000`, `180000`, then `190000`.
3. Run every AI preflight plus `ai-production-readiness-preflight.sql`.
4. Run mock regression tests and the synthetic provider smoke tests.
5. Create a staging-only organization, two users, two teams, a team/restricted/private
   Process, one Action, one stable-ID Checklist item and one Note.
6. Enable only `AI_INDEXING_ENABLED=true`; leave backfill/chat disabled.
7. Invoke the protected index route once and require `claimed>0`, `completed>0`,
   `failed=0`, `health.deadLetter=0` in its JSON response.
8. Verify `ai_source_documents` and `ai_chunks` contain only the synthetic tenant,
   version/model match, vectors have 1024 dimensions and duplicate worker calls do
   not add duplicate chunks.
9. Exercise keyword/semantic/hybrid retrieval as each synthetic user. Assert zero
   cross-organization results and correct team/restricted/private behavior.
10. Rename the parent Action and Process. Verify Note/Attachment jobs are enqueued,
    stale content is hidden immediately, and the worker restores fresh results.
11. Revoke Process membership and verify both retrieval and prior grounded chat
    messages are denied/redacted immediately.
12. Set `AI_ATOMIC_QUOTA_ENABLED=true`, then `AXIOM_AI_CHAT_ENABLED=true` only in
    staging. Exercise streaming, cancel, retry, duplicate request IDs, 429/timeout,
    conversation ownership and mobile/desktop UI.
13. Keep `AI_INDEX_BACKFILL_ENABLED=false` until a small dry-run page has been reviewed.

## Provider smoke tests

```powershell
cmd /c npx tsx scripts/smoke-ai-providers.ts --live --provider=groq
cmd /c npx tsx scripts/smoke-ai-providers.ts --live --provider=groq --stream
cmd /c npx tsx scripts/smoke-ai-providers.ts --live --provider=cloudflare
```

Expected: Groq exits zero only after the exact synthetic response is received;
Cloudflare exits zero only for one finite 1024-dimensional vector. The script
loads `.env.local`, requires `--live`, and never sends product data.

## Worker invocation

```powershell
$headers = @{ Authorization = "Bearer $env:CRON_SECRET" }
Invoke-RestMethod -Headers $headers -Uri "$env:AI_STAGING_BASE_URL/api/cron/ai-index"
```

Do not accept HTTP 200 alone. Inspect `claimed`, `completed`, `failed`,
`superseded` and `health`. Repeated `failed>0`, any `deadLetter>0`, growing retry
depth or expired leases blocks rollout.

## Backfill

Dry-run first, then explicitly set the backfill flag only in the current staging shell:

```powershell
cmd /c npx tsx scripts/backfill-ai-index.ts --source=task --limit=10
$env:AI_INDEX_BACKFILL_ENABLED='true'
cmd /c npx tsx scripts/backfill-ai-index.ts --source=task --limit=10 --enqueue
```

Repeat independently for `note`, `process` and `attachment`, carrying the emitted
cursor. Disable the flag immediately after the controlled enqueue.
