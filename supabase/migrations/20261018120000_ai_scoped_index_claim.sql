-- Exact organization + Process + source-type claim scope for production beta.
-- Does not enqueue, claim, or mutate any existing job when applied.
BEGIN;

CREATE OR REPLACE FUNCTION public.claim_ai_index_jobs_for_scope(
  p_organization_ids uuid[],
  p_project_ids uuid[],
  p_source_types text[],
  p_limit integer DEFAULT 8,
  p_lease_seconds integer DEFAULT 120,
  p_max_attempts integer DEFAULT 8
) RETURNS SETOF public.ai_index_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF coalesce(cardinality(p_organization_ids),0) NOT BETWEEN 1 AND 100
     OR coalesce(cardinality(p_project_ids),0) NOT BETWEEN 1 AND 100
     OR coalesce(cardinality(p_source_types),0) NOT BETWEEN 1 AND 3
     OR array_position(p_organization_ids,NULL) IS NOT NULL
     OR array_position(p_project_ids,NULL) IS NOT NULL
     OR array_position(p_source_types,NULL) IS NOT NULL
     OR NOT (p_source_types <@ ARRAY['task','note','process']::text[])
     OR p_limit NOT BETWEEN 1 AND 50
     OR p_lease_seconds NOT BETWEEN 15 AND 300
     OR p_max_attempts NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Invalid scoped AI index claim settings';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
    FROM public.ai_index_jobs j
    WHERE j.organization_id=ANY(p_organization_ids)
      AND j.source_type=ANY(p_source_types)
      AND (
        (j.source_type='process' AND j.source_key IN (
          SELECT scoped.project_id::text FROM unnest(p_project_ids) AS scoped(project_id)
        )) OR
        (j.source_type<>'process' AND j.project_id=ANY(p_project_ids))
      )
      AND j.attempts<p_max_attempts
      AND (
        (j.status IN ('pending','retry') AND j.available_at<=now()) OR
        (j.status='processing' AND j.leased_until<now())
      )
    ORDER BY j.available_at,j.id
    LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  UPDATE public.ai_index_jobs j SET
    status='processing',attempts=j.attempts+1,
    lease_token=gen_random_uuid(),leased_until=now()+make_interval(secs=>p_lease_seconds),
    updated_at=now()
  FROM candidates c WHERE j.id=c.id RETURNING j.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_index_queue_health_for_scope(
  p_organization_ids uuid[],p_project_ids uuid[],p_source_types text[]
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF coalesce(cardinality(p_organization_ids),0) NOT BETWEEN 1 AND 100
     OR coalesce(cardinality(p_project_ids),0) NOT BETWEEN 1 AND 100
     OR coalesce(cardinality(p_source_types),0) NOT BETWEEN 1 AND 3
     OR array_position(p_organization_ids,NULL) IS NOT NULL
     OR array_position(p_project_ids,NULL) IS NOT NULL
     OR array_position(p_source_types,NULL) IS NOT NULL
     OR NOT (p_source_types <@ ARRAY['task','note','process']::text[]) THEN
    RAISE EXCEPTION 'Invalid scoped AI index health settings';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'pending',count(*) FILTER(WHERE status='pending'),
      'processing',count(*) FILTER(WHERE status='processing'),
      'retry',count(*) FILTER(WHERE status='retry'),
      'completed',count(*) FILTER(WHERE status='completed'),
      'deadLetter',count(*) FILTER(WHERE status='dead_letter'),
      'expiredLeases',count(*) FILTER(WHERE status='processing' AND leased_until<now()),
      'oldestReadyAt',min(available_at) FILTER(WHERE status IN ('pending','retry') AND available_at<=now())
    )
    FROM public.ai_index_jobs j
    WHERE j.organization_id=ANY(p_organization_ids)
      AND j.source_type=ANY(p_source_types)
      AND (
        (j.source_type='process' AND j.source_key IN (
          SELECT scoped.project_id::text FROM unnest(p_project_ids) AS scoped(project_id)
        )) OR
        (j.source_type<>'process' AND j.project_id=ANY(p_project_ids))
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_index_jobs_for_scope(uuid[],uuid[],text[],integer,integer,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_index_queue_health_for_scope(uuid[],uuid[],text[])
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_index_jobs_for_scope(uuid[],uuid[],text[],integer,integer,integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_index_queue_health_for_scope(uuid[],uuid[],text[])
  TO service_role;

COMMIT;
