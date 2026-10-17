-- Prompt 5: service-role-only hybrid retrieval with ACL filtering before rank/limit.
-- Manual rollout only. Does not enable indexing, backfill, or any public AI route.
BEGIN;

CREATE OR REPLACE FUNCTION public.ai_user_can_access_source(
  p_user_id uuid,p_source_document_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.ai_source_documents d
    JOIN public.users u ON u.id=p_user_id AND u.organization_id=d.organization_id
    LEFT JOIN public.projects p ON p.id=d.project_id
    WHERE d.id=p_source_document_id
      AND d.stale_at IS NULL
      AND d.active_index_version IS NOT NULL
      AND d.active_embedding_model IS NOT NULL
      AND (
        d.team_id IS NULL OR u.role IN ('owner','admin') OR EXISTS(
          SELECT 1 FROM public.team_members tm
          WHERE tm.team_id=d.team_id AND tm.user_id=u.id
        )
      )
      AND (
        d.project_id IS NULL OR
        (p.organization_id=d.organization_id
          AND (p.team_id IS NULL OR p.team_id=d.team_id)
          AND (
            p.visibility='team' OR
            (p.visibility='restricted' AND EXISTS(
              SELECT 1 FROM public.project_members pm
              WHERE pm.project_id=p.id AND pm.user_id=u.id
            )) OR
            (p.visibility='private' AND (
              p.created_by=u.id OR EXISTS(
                SELECT 1 FROM public.project_members pm
                WHERE pm.project_id=p.id AND pm.user_id=u.id
              )
            ))
          )
        )
      )
      AND CASE d.source_type
        WHEN 'action' THEN EXISTS(
          SELECT 1 FROM public.tasks t WHERE t.id=d.task_id
            AND t.organization_id=d.organization_id
            AND t.team_id IS NOT DISTINCT FROM d.team_id
            AND t.project_id IS NOT DISTINCT FROM d.project_id
        )
        WHEN 'checklist' THEN EXISTS(
          SELECT 1 FROM public.tasks t WHERE t.id=d.task_id
            AND t.organization_id=d.organization_id
            AND t.team_id IS NOT DISTINCT FROM d.team_id
            AND t.project_id IS NOT DISTINCT FROM d.project_id
        )
        WHEN 'note' THEN EXISTS(
          SELECT 1 FROM public.notes n JOIN public.tasks t ON t.id=n.task_id
          WHERE n.id=d.note_id AND t.id=d.task_id
            AND n.organization_id=d.organization_id
            AND n.team_id IS NOT DISTINCT FROM d.team_id
            AND t.organization_id=d.organization_id
            AND t.team_id IS NOT DISTINCT FROM d.team_id
            AND t.project_id IS NOT DISTINCT FROM d.project_id
        )
        WHEN 'process' THEN p.id=d.project_id
        WHEN 'attachment' THEN EXISTS(
          SELECT 1 FROM public.attachments a JOIN public.tasks t ON t.id=a.task_id
          WHERE a.id=d.attachment_id AND a.status='ready' AND t.id=d.task_id
            AND a.organization_id=d.organization_id
            AND a.team_id IS NOT DISTINCT FROM d.team_id
            AND t.organization_id=d.organization_id
            AND t.team_id IS NOT DISTINCT FROM d.team_id
            AND t.project_id IS NOT DISTINCT FROM d.project_id
        )
        ELSE false
      END
  )
$$;

CREATE OR REPLACE FUNCTION public.ai_retrieve_chunks(
  p_user_id uuid,
  p_query_text text,
  p_query_embedding extensions.vector(1024),
  p_mode text DEFAULT 'hybrid',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_candidate_limit integer DEFAULT 80,
  p_similarity_threshold real DEFAULT 0.20,
  p_rrf_k integer DEFAULT 60,
  p_semantic_weight real DEFAULT 1.0,
  p_keyword_weight real DEFAULT 1.0,
  p_index_version text DEFAULT NULL,
  p_source_types text[] DEFAULT NULL,
  p_team_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL
) RETURNS TABLE(
  chunk_id text,
  source_document_id uuid,
  source_type text,
  source_key text,
  task_id uuid,
  note_id uuid,
  attachment_id uuid,
  project_id uuid,
  process_name text,
  title text,
  snippet text,
  source_updated_at timestamptz,
  chunk_ordinal integer,
  index_version text,
  embedding_model text,
  semantic_score real,
  keyword_score real,
  fused_score real,
  semantic_rank bigint,
  keyword_rank bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_mode NOT IN ('semantic','keyword','hybrid') THEN
    RAISE EXCEPTION 'Invalid retrieval mode';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 100 OR p_offset NOT BETWEEN 0 AND 500
     OR p_candidate_limit NOT BETWEEN p_limit+p_offset AND 500
     OR p_rrf_k NOT BETWEEN 1 AND 1000
     OR p_similarity_threshold NOT BETWEEN -1 AND 1
     OR p_semantic_weight < 0 OR p_semantic_weight > 10
     OR p_keyword_weight < 0 OR p_keyword_weight > 10 THEN
    RAISE EXCEPTION 'Invalid retrieval settings';
  END IF;
  IF length(btrim(coalesce(p_query_text,''))) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Invalid retrieval query';
  END IF;
  IF p_mode IN ('semantic','hybrid') AND p_query_embedding IS NULL THEN
    RAISE EXCEPTION 'Semantic retrieval requires an embedding';
  END IF;
  IF p_source_types IS NOT NULL AND NOT(p_source_types <@ ARRAY['action','checklist','note','process','attachment']::text[]) THEN
    RAISE EXCEPTION 'Invalid source type filter';
  END IF;

  RETURN QUERY
  WITH actor AS MATERIALIZED (
    SELECT u.id,u.organization_id,u.role FROM public.users u WHERE u.id=p_user_id
  ),
  query_data AS MATERIALIZED (
    SELECT websearch_to_tsquery('simple'::regconfig,btrim(p_query_text)) AS tsq
  ),
  authorized_documents AS MATERIALIZED (
    SELECT
      d.id AS source_document_id,d.source_type,d.source_key,
      d.task_id,d.note_id,d.attachment_id,d.project_id,p.name AS process_name,
      d.title,d.source_updated_at,d.active_index_version,d.active_embedding_model
    FROM public.ai_source_documents d
    JOIN actor u ON u.organization_id=d.organization_id
    LEFT JOIN public.projects p ON p.id=d.project_id
    WHERE d.stale_at IS NULL
      AND d.active_index_version IS NOT NULL
      AND d.active_embedding_model IS NOT NULL
      AND (p_index_version IS NULL OR d.active_index_version=p_index_version)
      AND (p_source_types IS NULL OR d.source_type=ANY(p_source_types))
      AND (p_team_id IS NULL OR d.team_id=p_team_id)
      AND (p_project_id IS NULL OR d.project_id=p_project_id)
      AND (
        d.team_id IS NULL OR u.role IN ('owner','admin') OR EXISTS(
          SELECT 1 FROM public.team_members tm
          WHERE tm.team_id=d.team_id AND tm.user_id=u.id
        )
      )
      AND (
        d.project_id IS NULL OR
        (p.organization_id=d.organization_id
          AND (p.team_id IS NULL OR p.team_id=d.team_id)
          AND (
            p.visibility='team' OR
            (p.visibility='restricted' AND EXISTS(
              SELECT 1 FROM public.project_members pm
              WHERE pm.project_id=p.id AND pm.user_id=u.id
            )) OR
            (p.visibility='private' AND (
              p.created_by=u.id OR EXISTS(
                SELECT 1 FROM public.project_members pm
                WHERE pm.project_id=p.id AND pm.user_id=u.id
              )
            ))
          )
        )
      )
      AND CASE d.source_type
        WHEN 'action' THEN EXISTS(
          SELECT 1 FROM public.tasks t WHERE t.id=d.task_id
            AND t.organization_id=d.organization_id
            AND t.team_id IS NOT DISTINCT FROM d.team_id
            AND t.project_id IS NOT DISTINCT FROM d.project_id
        )
        WHEN 'checklist' THEN EXISTS(
          SELECT 1 FROM public.tasks t WHERE t.id=d.task_id
            AND t.organization_id=d.organization_id
            AND t.team_id IS NOT DISTINCT FROM d.team_id
            AND t.project_id IS NOT DISTINCT FROM d.project_id
        )
        WHEN 'note' THEN EXISTS(
          SELECT 1 FROM public.notes n JOIN public.tasks t ON t.id=n.task_id
          WHERE n.id=d.note_id AND t.id=d.task_id
            AND n.organization_id=d.organization_id
            AND n.team_id IS NOT DISTINCT FROM d.team_id
            AND t.organization_id=d.organization_id
            AND t.team_id IS NOT DISTINCT FROM d.team_id
            AND t.project_id IS NOT DISTINCT FROM d.project_id
        )
        WHEN 'process' THEN p.id=d.project_id
        WHEN 'attachment' THEN EXISTS(
          SELECT 1 FROM public.attachments a JOIN public.tasks t ON t.id=a.task_id
          WHERE a.id=d.attachment_id AND a.status='ready' AND t.id=d.task_id
            AND a.organization_id=d.organization_id
            AND a.team_id IS NOT DISTINCT FROM d.team_id
            AND t.organization_id=d.organization_id
            AND t.team_id IS NOT DISTINCT FROM d.team_id
            AND t.project_id IS NOT DISTINCT FROM d.project_id
        )
        ELSE false
      END
  ),
  eligible AS NOT MATERIALIZED (
    SELECT
      c.id AS chunk_id,c.source_document_id,d.source_type,d.source_key,
      d.task_id,d.note_id,d.attachment_id,d.project_id,d.process_name,
      d.title,c.content,d.source_updated_at,c.chunk_ordinal,c.index_version,c.embedding_model,
      c.embedding,c.search_vector
    FROM public.ai_chunks c
    JOIN authorized_documents d ON d.source_document_id=c.source_document_id
    WHERE c.index_version=d.active_index_version
      AND c.embedding_model=d.active_embedding_model
  ),
  semantic_candidates AS MATERIALIZED (
    SELECT e.*, (1-(e.embedding OPERATOR(extensions.<=>) p_query_embedding))::real AS score
    FROM eligible e
    WHERE p_mode IN ('semantic','hybrid')
      AND (1-(e.embedding OPERATOR(extensions.<=>) p_query_embedding)) >= p_similarity_threshold
    ORDER BY e.embedding OPERATOR(extensions.<=>) p_query_embedding,e.chunk_id
    LIMIT p_candidate_limit
  ),
  semantic_results AS (
    SELECT s.*,row_number() OVER(ORDER BY s.score DESC,s.chunk_id) AS rank
    FROM semantic_candidates s
  ),
  keyword_candidates AS MATERIALIZED (
    SELECT e.*,ts_rank_cd(e.search_vector,q.tsq,32)::real AS score
    FROM eligible e CROSS JOIN query_data q
    WHERE p_mode IN ('keyword','hybrid') AND e.search_vector @@ q.tsq
    ORDER BY ts_rank_cd(e.search_vector,q.tsq,32) DESC,e.chunk_id
    LIMIT p_candidate_limit
  ),
  keyword_results AS (
    SELECT k.*,row_number() OVER(ORDER BY k.score DESC,k.chunk_id) AS rank
    FROM keyword_candidates k
  ),
  fused AS (
    SELECT
      coalesce(s.chunk_id,k.chunk_id) AS matched_chunk_id,
      s.score AS semantic_score,k.score AS keyword_score,
      s.rank AS semantic_rank,k.rank AS keyword_rank,
      CASE p_mode
        WHEN 'semantic' THEN coalesce(s.score,0)
        WHEN 'keyword' THEN coalesce(k.score/(1+k.score),0)
        ELSE (CASE WHEN s.rank IS NULL THEN 0 ELSE p_semantic_weight/(p_rrf_k+s.rank) END)
          +(CASE WHEN k.rank IS NULL THEN 0 ELSE p_keyword_weight/(p_rrf_k+k.rank) END)
      END::real AS fused_score
    FROM semantic_results s FULL OUTER JOIN keyword_results k USING(chunk_id)
  )
  SELECT
    e.chunk_id,e.source_document_id,e.source_type,e.source_key,e.task_id,e.note_id,e.attachment_id,
    e.project_id,e.process_name,e.title,
    CASE WHEN length(e.content)<=480 THEN e.content ELSE left(e.content,477)||'...' END AS snippet,
    e.source_updated_at,e.chunk_ordinal,e.index_version,e.embedding_model,
    f.semantic_score,f.keyword_score,f.fused_score,f.semantic_rank,f.keyword_rank
  FROM fused f JOIN eligible e ON e.chunk_id=f.matched_chunk_id
  ORDER BY f.fused_score DESC,e.source_updated_at DESC,e.chunk_id
  OFFSET p_offset
  LIMIT p_limit;
END $$;

CREATE OR REPLACE FUNCTION public.ai_validate_retrieval_chunks(
  p_user_id uuid,p_chunk_ids text[],p_index_version text DEFAULT NULL
) RETURNS TABLE(chunk_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT c.id
  FROM unnest(coalesce(p_chunk_ids,ARRAY[]::text[])) requested(id)
  JOIN public.ai_chunks c ON c.id=requested.id
  JOIN public.ai_source_documents d ON d.id=c.source_document_id
  WHERE cardinality(p_chunk_ids)<=200
    AND d.active_index_version=c.index_version
    AND d.active_embedding_model=c.embedding_model
    AND (p_index_version IS NULL OR c.index_version=p_index_version)
    AND public.ai_user_can_access_source(p_user_id,d.id)
$$;

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

REVOKE ALL ON FUNCTION public.ai_retrieve_chunks(uuid,text,extensions.vector,text,integer,integer,integer,real,integer,real,real,text,text[],uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_validate_retrieval_chunks(uuid,text[],text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_retrieval_index_available(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_user_can_access_source(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_retrieve_chunks(uuid,text,extensions.vector,text,integer,integer,integer,real,integer,real,real,text,text[],uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_validate_retrieval_chunks(uuid,text[],text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_retrieval_index_available(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_user_can_access_source(uuid,uuid) TO service_role;

COMMENT ON FUNCTION public.ai_retrieve_chunks IS 'ACL-first exact semantic/keyword/hybrid retrieval. Browser roles cannot execute it.';
COMMENT ON FUNCTION public.ai_validate_retrieval_chunks IS 'Second live ACL and canonical-source validation before citations leave the server.';
COMMENT ON FUNCTION public.ai_retrieval_index_available IS 'ACL-aware active index check used to avoid unnecessary embedding calls on an empty index.';

COMMIT;
