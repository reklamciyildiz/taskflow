begin;

-- Axiom's server-only data layer uses the Supabase service role for canonical
-- authorization checks and mutations. Fresh PostgreSQL bootstraps do not
-- necessarily inherit the Dashboard-created default grants.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Keep future server-owned application tables usable without widening browser
-- roles. RLS and explicit revokes on anon/authenticated remain unchanged.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;

commit;
