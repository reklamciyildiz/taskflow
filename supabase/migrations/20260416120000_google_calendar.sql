-- Google Calendar integration (per-user OAuth + task→event mapping)

create table if not exists public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  google_user_id text,
  email text,
  refresh_token_enc text not null,
  selected_calendar_id text,
  sync_enabled boolean not null default true,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists google_calendar_connections_user_id_idx
  on public.google_calendar_connections(user_id);

create table if not exists public.google_calendar_event_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  calendar_id text not null,
  google_event_id text not null,
  etag text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, task_id)
);

create index if not exists google_calendar_event_links_task_id_idx
  on public.google_calendar_event_links(task_id);

-- User timezone preference (IANA), used for interpreting due dates into calendar all-day events
alter table public.user_settings
  add column if not exists time_zone text;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_google_calendar_connections_updated_at on public.google_calendar_connections;
create trigger trg_google_calendar_connections_updated_at
before update on public.google_calendar_connections
for each row execute function public.set_updated_at();

drop trigger if exists trg_google_calendar_event_links_updated_at on public.google_calendar_event_links;
create trigger trg_google_calendar_event_links_updated_at
before update on public.google_calendar_event_links
for each row execute function public.set_updated_at();
