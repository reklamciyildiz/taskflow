# AI indexing rollout

Do not enable indexing or backfill before the migration and provider smoke tests
have been verified.

1. Run `docs/ai-indexing-preflight.sql` in Supabase SQL Editor.
2. Apply `20261017160000_ai_rag_index_foundation.sql` manually.
3. Run the preflight again and verify the service-role-only grants.
4. Deploy with `AI_INDEXING_ENABLED=false` and run both provider smoke tests.
   During the controlled beta keep `AXIOM_AI_BETA_MODE_ENABLED=true` and set
   only approved organization UUIDs in `AXIOM_AI_BETA_ORGANIZATION_IDS`; the
   scoped claim RPC will not lease other organizations' queued jobs.
5. Enable `AI_INDEXING_ENABLED=true`, then invoke `/api/cron/ai-index` manually
   with the existing `CRON_SECRET` before adding a Vercel schedule.
6. Backfill one small dry-run page, then explicitly enable enqueue:

```powershell
npx tsx scripts/backfill-ai-index.ts --source=task --limit=25
$env:AI_INDEX_BACKFILL_ENABLED='true'
npx tsx scripts/backfill-ai-index.ts --source=task --limit=25 --enqueue
```

Use the emitted `nextCursor` as `--cursor=<uuid>` to resume. Repeat separately
for `task`, `note`, `process`, and `attachment`. Enqueueing never calls
Cloudflare; the protected worker consumes the durable jobs later.

After a controlled backfill, add a Vercel cron for `/api/cron/ai-index`. Start
at five-minute intervals and tune only from queue depth, provider limits and
observed function duration. The route is fail-disabled unless
`AI_INDEXING_ENABLED=true`. The worker claims one job at a time inside a
50-second execution budget; `AI_INDEX_BATCH_SIZE` is a per-invocation maximum,
not a pre-claimed batch.


### Existing cron-job.org indexing job

Keep the existing `GET /api/cron/ai-index` job if it points to the
current Production deployment. Set the custom `Authorization` header to
`Bearer <CRON_SECRET>` (the same secret as Vercel Production); external
cron-job.org requests never inherit Vercel secrets automatically.
The worker is designed for cron-job.org's normal 30-second timeout:
`maxDuration = 30`, two jobs per tick and a 20-second internal budget.

The indexing endpoint now returns HTTP 503 and `ok:false` when one or
more items failed in the batch, rather than always reporting HTTP 200.
When indexing is deliberately disabled, HTTP 200 with `enabled:false`
means the timer worked but indexing did **not** run. Do not interpret
a green scheduler history as evidence of successfully indexed content.
For unexpected 503, inspect Vercel logs and queue health before enabling
retries, increasing the batch or turning on public indexing.
