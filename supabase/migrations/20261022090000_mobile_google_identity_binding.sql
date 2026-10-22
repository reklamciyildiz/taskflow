-- Verified provider identities for mobile authentication. These mappings are
-- bootstrapped only by the existing server-side NextAuth Google callback and
-- are never inferred from an email supplied by a mobile client.

create table if not exists public.mobile_auth_provider_identities (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google')),
  provider_subject text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subject),
  unique (provider, user_id)
);

alter table public.mobile_auth_provider_identities enable row level security;
revoke all on public.mobile_auth_provider_identities from anon, authenticated;
grant all on public.mobile_auth_provider_identities to service_role;
