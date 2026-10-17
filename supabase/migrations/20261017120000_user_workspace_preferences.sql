begin;

alter table public.user_settings
  add column if not exists action_panel_tab_order text not null default 'checklist_first',
  add column if not exists process_order_by_team jsonb not null default '{}'::jsonb;

alter table public.user_settings enable row level security;

alter table public.user_settings
  drop constraint if exists user_settings_action_panel_tab_order_check;
alter table public.user_settings
  add constraint user_settings_action_panel_tab_order_check
  check (action_panel_tab_order in ('checklist_first', 'notes_first'));

alter table public.user_settings
  drop constraint if exists user_settings_process_order_by_team_object_check;
alter table public.user_settings
  add constraint user_settings_process_order_by_team_object_check
  check (jsonb_typeof(process_order_by_team) = 'object');

comment on column public.user_settings.action_panel_tab_order is
  'Per-user ActionPanel work-tab order. Does not change the active tab.';
comment on column public.user_settings.process_order_by_team is
  'Per-user map of team UUID to ordered visible process UUIDs.';

commit;
