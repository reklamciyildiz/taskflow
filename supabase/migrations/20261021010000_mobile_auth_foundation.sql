-- Mobile auth foundation: opaque access tokens, rotating refresh sessions, one-time
-- authorization codes and short-lived OAuth attempts. Service-role only by design.

create table if not exists public.mobile_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  access_token_hash text not null unique,
  refresh_token_hash text not null unique,
  device_id_hash text,
  platform text not null check (platform in ('android', 'ios')),
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  rotated_from_id uuid references public.mobile_auth_sessions(id) on delete set null,
  replaced_by_id uuid references public.mobile_auth_sessions(id) on delete set null,
  revoked_at timestamptz,
  replay_detected_at timestamptz,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists mobile_auth_sessions_user_active_idx
  on public.mobile_auth_sessions(user_id, refresh_expires_at desc)
  where revoked_at is null;
create index if not exists mobile_auth_sessions_family_idx
  on public.mobile_auth_sessions(family_id);

create table if not exists public.mobile_auth_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  user_id uuid not null references public.users(id) on delete cascade,
  code_challenge text not null,
  redirect_uri text not null,
  platform text not null check (platform in ('android', 'ios')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mobile_auth_codes_pending_idx
  on public.mobile_auth_codes(expires_at) where consumed_at is null;

create table if not exists public.mobile_auth_oauth_attempts (
  state_hash text primary key,
  client_state text not null,
  code_challenge text not null,
  redirect_uri text not null,
  platform text not null check (platform in ('android', 'ios')),
  google_verifier_cipher text not null,
  nonce_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.mobile_auth_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.mobile_auth_sessions enable row level security;
alter table public.mobile_auth_codes enable row level security;
alter table public.mobile_auth_oauth_attempts enable row level security;
alter table public.mobile_auth_rate_limits enable row level security;

revoke all on public.mobile_auth_sessions from anon, authenticated;
revoke all on public.mobile_auth_codes from anon, authenticated;
revoke all on public.mobile_auth_oauth_attempts from anon, authenticated;
revoke all on public.mobile_auth_rate_limits from anon, authenticated;
grant all on public.mobile_auth_sessions to service_role;
grant all on public.mobile_auth_codes to service_role;
grant all on public.mobile_auth_oauth_attempts to service_role;
grant all on public.mobile_auth_rate_limits to service_role;

create or replace function public.consume_mobile_auth_rate_limit(
  p_bucket_key text,
  p_window_seconds integer,
  p_limit integer
) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
begin
  if p_window_seconds < 1 or p_limit < 1 then return false; end if;
  insert into public.mobile_auth_rate_limits(bucket_key, window_started_at, request_count, updated_at)
  values (p_bucket_key, v_now, 1, v_now)
  on conflict (bucket_key) do update set
    window_started_at = case when public.mobile_auth_rate_limits.window_started_at <= v_now - make_interval(secs => p_window_seconds) then v_now else public.mobile_auth_rate_limits.window_started_at end,
    request_count = case when public.mobile_auth_rate_limits.window_started_at <= v_now - make_interval(secs => p_window_seconds) then 1 else public.mobile_auth_rate_limits.request_count + 1 end,
    updated_at = v_now
  returning request_count into v_count;
  return v_count <= p_limit;
end $$;

create or replace function public.claim_mobile_auth_code(
  p_code_hash text,
  p_code_verifier_challenge text,
  p_access_token_hash text,
  p_refresh_token_hash text,
  p_access_expires_at timestamptz,
  p_refresh_expires_at timestamptz,
  p_device_id_hash text,
  p_platform text
) returns table(session_id uuid, user_id uuid)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_code public.mobile_auth_codes%rowtype; v_session uuid;
begin
  select * into v_code from public.mobile_auth_codes
    where code_hash=p_code_hash and consumed_at is null and expires_at > clock_timestamp()
    for update;
  if not found or v_code.code_challenge <> p_code_verifier_challenge or v_code.platform <> p_platform then return; end if;
  update public.mobile_auth_codes set consumed_at=clock_timestamp() where id=v_code.id;
  insert into public.mobile_auth_sessions(user_id,access_token_hash,refresh_token_hash,device_id_hash,platform,access_expires_at,refresh_expires_at)
    values(v_code.user_id,p_access_token_hash,p_refresh_token_hash,p_device_id_hash,p_platform,p_access_expires_at,p_refresh_expires_at)
    returning id into v_session;
  return query select v_session, v_code.user_id;
end $$;

create or replace function public.rotate_mobile_auth_session(
  p_refresh_token_hash text,
  p_new_access_token_hash text,
  p_new_refresh_token_hash text,
  p_access_expires_at timestamptz,
  p_refresh_expires_at timestamptz
) returns table(status text, session_id uuid, user_id uuid)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_old public.mobile_auth_sessions%rowtype; v_new uuid;
begin
  select * into v_old from public.mobile_auth_sessions where refresh_token_hash=p_refresh_token_hash for update;
  if not found then return query select 'invalid'::text, null::uuid, null::uuid; return; end if;
  if v_old.replaced_by_id is not null then
    update public.mobile_auth_sessions set revoked_at=coalesce(revoked_at,clock_timestamp()), replay_detected_at=clock_timestamp() where family_id=v_old.family_id;
    return query select 'replayed'::text, null::uuid, v_old.user_id; return;
  end if;
  if v_old.revoked_at is not null or v_old.refresh_expires_at <= clock_timestamp() then
    return query select 'expired'::text, null::uuid, v_old.user_id; return;
  end if;
  insert into public.mobile_auth_sessions(family_id,user_id,access_token_hash,refresh_token_hash,device_id_hash,platform,access_expires_at,refresh_expires_at,rotated_from_id)
    values(v_old.family_id,v_old.user_id,p_new_access_token_hash,p_new_refresh_token_hash,v_old.device_id_hash,v_old.platform,p_access_expires_at,p_refresh_expires_at,v_old.id)
    returning id into v_new;
  update public.mobile_auth_sessions set revoked_at=clock_timestamp(),replaced_by_id=v_new,last_used_at=clock_timestamp() where id=v_old.id;
  return query select 'ok'::text, v_new, v_old.user_id;
end $$;

create or replace function public.revoke_mobile_auth_session(p_access_token_hash text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_family uuid;
begin
  select family_id into v_family from public.mobile_auth_sessions where access_token_hash=p_access_token_hash;
  if not found then return false; end if;
  update public.mobile_auth_sessions set revoked_at=coalesce(revoked_at,clock_timestamp()) where family_id=v_family;
  return true;
end $$;

revoke all on function public.consume_mobile_auth_rate_limit(text,integer,integer) from public, anon, authenticated;
revoke all on function public.claim_mobile_auth_code(text,text,text,text,timestamptz,timestamptz,text,text) from public, anon, authenticated;
revoke all on function public.rotate_mobile_auth_session(text,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.revoke_mobile_auth_session(text) from public, anon, authenticated;
grant execute on function public.consume_mobile_auth_rate_limit(text,integer,integer) to service_role;
grant execute on function public.claim_mobile_auth_code(text,text,text,text,timestamptz,timestamptz,text,text) to service_role;
grant execute on function public.rotate_mobile_auth_session(text,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.revoke_mobile_auth_session(text) to service_role;
