begin;

-- One-shot production validation path. This function can lease exactly one
-- explicitly named Note job and cannot fall through to another queued source.
create or replace function public.claim_ai_note_index_job_by_id_for_organization(
  p_job_id bigint,
  p_organization_id uuid,
  p_note_id uuid,
  p_lease_seconds integer default 180,
  p_max_attempts integer default 8
) returns setof public.ai_index_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_job_id is null or p_job_id < 1
     or p_organization_id is null
     or p_note_id is null
     or p_lease_seconds not between 15 and 300
     or p_max_attempts not between 1 and 20 then
    raise exception 'Invalid targeted AI Note claim settings';
  end if;

  return query
  with candidate as (
    select j.id
    from public.ai_index_jobs j
    where j.id=p_job_id
      and j.organization_id=p_organization_id
      and j.source_type='note'
      and j.source_key=p_note_id::text
      and j.operation='upsert'
      and j.attempts<p_max_attempts
      and (
        (j.status in ('pending','retry') and j.available_at<=now()) or
        (j.status='processing' and j.leased_until<now())
      )
    for update skip locked
  )
  update public.ai_index_jobs j set
    status='processing',attempts=j.attempts+1,
    lease_token=gen_random_uuid(),leased_until=now()+make_interval(secs=>p_lease_seconds),
    updated_at=now()
  from candidate c where j.id=c.id returning j.*;
end;
$$;

revoke all on function public.claim_ai_note_index_job_by_id_for_organization(bigint,uuid,uuid,integer,integer)
  from public,anon,authenticated;
grant execute on function public.claim_ai_note_index_job_by_id_for_organization(bigint,uuid,uuid,integer,integer)
  to service_role;

commit;
