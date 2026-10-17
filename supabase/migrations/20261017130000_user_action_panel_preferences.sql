begin;

create table if not exists public.user_action_preferences (
  user_id uuid not null references public.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  action_panel_tab_order text not null default 'checklist_first',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, task_id),
  constraint user_action_preferences_tab_order_check
    check (action_panel_tab_order in ('checklist_first', 'notes_first'))
);

create index if not exists user_action_preferences_task_id_idx
  on public.user_action_preferences(task_id);

alter table public.user_action_preferences enable row level security;

comment on table public.user_action_preferences is
  'Per-user presentation preferences for a specific Action. Access is mediated by authorized server routes.';
comment on column public.user_action_preferences.action_panel_tab_order is
  'Left-to-right Checklist/Notes order for this user and Action.';

commit;
