# AI retrieval rollout

The retrieval service has no public route and does not enable indexing or
backfill. Apply and verify it independently from Prompt 6.

1. Confirm Prompt 4 indexing tables and triggers are healthy.
2. Apply `20261017170000_ai_hybrid_retrieval.sql` in Supabase SQL Editor.
3. Run `docs/ai-retrieval-preflight.sql`.
4. Verify `anon_execute=false`, `authenticated_execute=false`, and
   `service_role_execute=true` for all three retrieval functions.
5. Keep `AI_INDEXING_ENABLED=false` and `AI_INDEX_BACKFILL_ENABLED=false`
   until a controlled indexing rollout is approved.
6. In an isolated staging project, create users covering team, restricted,
   private, removed-membership, stale, and deleted-source cases. Run the RPC
   as the server service role with each canonical user id and verify that ACL
   filtering happens before ranking and limit.
7. Compare keyword, semantic, and hybrid results on an adjudicated Turkish,
   English, and mixed-language evaluation set before tuning threshold, RRF
   weights, or adding an approximate vector index.

`AI_RETRIEVAL_INDEX_VERSION` is optional. When omitted, retrieval uses
`AI_INDEX_VERSION`, then `bge-m3-v1`. During rollout, set both values to the
same version.

Do not add HNSW until chunk volume and `EXPLAIN (ANALYZE, BUFFERS)` show exact
cosine search is a bottleneck after ACL/scope filtering.
