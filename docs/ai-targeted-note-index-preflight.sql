-- READ ONLY. Run after 20261017220000_ai_targeted_note_index_claim.sql.
select
  p.proname,
  p.prosecdef as security_definer,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='claim_ai_note_index_job_by_id_for_organization';

select status,count(*) as jobs,max(attempts) as max_attempts
from public.ai_index_jobs
group by status
order by status;
