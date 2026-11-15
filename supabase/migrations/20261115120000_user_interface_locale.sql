begin;

-- A single authenticated user can choose their own UI language across devices.
alter table public.user_settings
  add column if not exists locale text not null default 'en';

alter table public.user_settings
  drop constraint if exists user_settings_locale_supported_check;
alter table public.user_settings
  add constraint user_settings_locale_supported_check
    check (locale in ('en', 'tr'));

comment on column public.user_settings.locale is
  'Preferred Actiproc application interface locale; user-created content is never translated.';

commit;
