-- Repairs production drift found during the first targeted RAG canary.
-- This migration does not enqueue, index, delete, or mutate canonical data.
BEGIN;

-- Older deployed copies of this function use an unqualified pgvector cosine
-- operator. Keep the SECURITY DEFINER search path restricted while making the
-- trusted extensions schema available for runtime operator resolution.
ALTER FUNCTION public.ai_retrieve_chunks(
  uuid,text,extensions.vector,text,integer,integer,integer,real,integer,
  real,real,text,text[],uuid,uuid
) SET search_path = public, extensions, pg_temp;

-- Some manually-applied production schemas are missing this final helper even
-- though the main retrieval RPC exists. Recreate it idempotently.
CREATE OR REPLACE FUNCTION public.ai_retrieval_index_available(
  p_user_id uuid,p_index_version text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.ai_source_documents d
    JOIN public.ai_chunks c ON c.source_document_id=d.id
      AND c.index_version=d.active_index_version
      AND c.embedding_model=d.active_embedding_model
    WHERE d.active_index_version=p_index_version
      AND public.ai_user_can_access_source(p_user_id,d.id)
    LIMIT 1
  )
$$;

REVOKE ALL ON FUNCTION public.ai_retrieval_index_available(uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_retrieval_index_available(uuid,text)
  TO service_role;

COMMENT ON FUNCTION public.ai_retrieval_index_available IS
  'ACL-aware active index check used to avoid unnecessary embedding calls on an empty index.';

NOTIFY pgrst, 'reload schema';

COMMIT;
