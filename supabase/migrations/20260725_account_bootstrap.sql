-- 20260725_account_bootstrap.sql
-- Purpose:
-- - Add a one-row-per-account marker recording whether sample onboarding
--   data has been seeded, so a new account is seeded exactly once.

begin;

create table if not exists public.account_bootstrap (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sample_data_seeded_at timestamptz not null default now()
);

alter table public.account_bootstrap enable row level security;

drop policy if exists "account_bootstrap_select" on public.account_bootstrap;
create policy "account_bootstrap_select"
  on public.account_bootstrap
  for select
  using (auth.uid() = user_id);

drop policy if exists "account_bootstrap_insert" on public.account_bootstrap;
create policy "account_bootstrap_insert"
  on public.account_bootstrap
  for insert
  with check (auth.uid() = user_id);

commit;
