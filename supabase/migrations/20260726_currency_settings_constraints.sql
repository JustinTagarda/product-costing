-- 20260726_currency_settings_constraints.sql
-- Purpose:
-- - Close the gap where app_settings currency columns had no DB-level
--   validation at all, while the app itself enforced shape/range rules.
-- - Normalize any existing out-of-range rows before adding matching
--   check constraints, so this migration is safe to run on data that
--   predates the client-side validation.

begin;

update public.app_settings set base_currency = 'USD' where base_currency !~ '^[A-Z]{3}$';
update public.app_settings set currency_display = 'symbol' where currency_display <> 'code';
update public.app_settings set currency_rounding_mode = 'nearest' where currency_rounding_mode not in ('up', 'down');
update public.app_settings set currency_rounding_increment = 100 where currency_rounding_increment > 100;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_settings_base_currency_format'
      and conrelid = 'public.app_settings'::regclass
  ) then
    alter table public.app_settings
      add constraint app_settings_base_currency_format check (base_currency ~ '^[A-Z]{3}$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_settings_currency_display_check'
      and conrelid = 'public.app_settings'::regclass
  ) then
    alter table public.app_settings
      add constraint app_settings_currency_display_check check (currency_display in ('symbol', 'code'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_settings_currency_rounding_mode_check'
      and conrelid = 'public.app_settings'::regclass
  ) then
    alter table public.app_settings
      add constraint app_settings_currency_rounding_mode_check check (currency_rounding_mode in ('nearest', 'up', 'down'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_settings_currency_rounding_increment_max'
      and conrelid = 'public.app_settings'::regclass
  ) then
    alter table public.app_settings
      add constraint app_settings_currency_rounding_increment_max check (currency_rounding_increment <= 100);
  end if;
end $$;

commit;
