begin;

create table if not exists public.user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  email_notifications boolean not null default true,
  push_notifications boolean not null default false,
  team_activity boolean not null default false,
  compact_view boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_settings is
  'Server-managed per-user notification, appearance, scheduling, and workspace preferences.';

commit;
