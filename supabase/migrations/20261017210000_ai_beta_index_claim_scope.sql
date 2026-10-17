begin;

-- During the controlled beta the service-role worker must not claim another
-- organization's outbox job and only discover its scope after the lease.
create or replace function public.claim_ai_index_jobs_for_organizations(
  p_organization_ids uuid[],
  p_limit integer default 8,
  p_lease_seconds integer default 120,
  p_max_attempts integer default 8
) returns setof public.ai_index_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(cardinality(p_organization_ids),0) < 1
     or cardinality(p_organization_ids) > 100
     or array_position(p_organization_ids,null) is not null
     or p_limit not between 1 and 50
     or p_lease_seconds not between 15 and 300
     or p_max_attempts not between 1 and 20 then
    raise exception 'Invalid scoped AI index claim settings';
  end if;

  return query
  with candidates as (
    select j.id
    from public.ai_index_jobs j
    where j.organization_id=any(p_organization_ids)
      and j.attempts<p_max_attempts
      and (
        (j.status in ('pending','retry') and j.available_at<=now()) or
        (j.status='processing' and j.leased_until<now())
      )
    order by j.available_at,j.id
    limit p_limit for update skip locked
  )
  update public.ai_index_jobs j set
    status='processing',attempts=j.attempts+1,
    lease_token=gen_random_uuid(),leased_until=now()+make_interval(secs=>p_lease_seconds),
    updated_at=now()
  from candidates c where j.id=c.id returning j.*;
end;
$$;

revoke all on function public.claim_ai_index_jobs_for_organizations(uuid[],integer,integer,integer)
  from public,anon,authenticated;
grant execute on function public.claim_ai_index_jobs_for_organizations(uuid[],integer,integer,integer)
  to service_role;

commit;
