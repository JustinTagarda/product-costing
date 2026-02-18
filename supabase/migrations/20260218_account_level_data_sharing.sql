-- 20260218_account_level_data_sharing.sql
-- Purpose:
-- - Replace sheet-level sharing with account-level sharing.
-- - Grant full account data access (all app tables) via shared email.
-- - Keep migration idempotent and safe for repeated execution.

begin;

-- Keep updated_at trigger helper available.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Resolve the currently authenticated user's email from JWT.
create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- Account-level sharing table.
create table if not exists public.account_shares (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  shared_with_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_shares_owner_email_key unique (owner_user_id, shared_with_email)
);

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'account_shares'
      and column_name = 'updated_at'
  ) then
    alter table public.account_shares add column updated_at timestamptz not null default now();
  end if;

  update public.account_shares
    set shared_with_email = lower(trim(shared_with_email))
    where shared_with_email is not null;

  -- Best-effort migration from legacy sheet-level shares.
  if to_regclass('public.cost_sheet_shares') is not null then
    insert into public.account_shares (owner_user_id, shared_with_email, created_at, updated_at)
    select
      css.owner_user_id,
      lower(trim(css.shared_with_email)),
      min(css.created_at),
      now()
    from public.cost_sheet_shares css
    where trim(coalesce(css.shared_with_email, '')) <> ''
    group by css.owner_user_id, lower(trim(css.shared_with_email))
    on conflict (owner_user_id, shared_with_email) do nothing;
  end if;
end $$;

create index if not exists account_shares_owner_user_id_idx
  on public.account_shares (owner_user_id);

create index if not exists account_shares_shared_with_email_idx
  on public.account_shares (shared_with_email);

alter table public.account_shares enable row level security;

drop policy if exists "account_shares_owner_all" on public.account_shares;
create policy "account_shares_owner_all"
  on public.account_shares
  for all
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

drop policy if exists "account_shares_recipient_read" on public.account_shares;
create policy "account_shares_recipient_read"
  on public.account_shares
  for select
  using (public.current_user_email() = lower(shared_with_email));

drop trigger if exists account_shares_set_updated_at on public.account_shares;
create trigger account_shares_set_updated_at
before update on public.account_shares
for each row execute function public.set_updated_at();

-- Central account access check used by table policies.
create or replace function public.has_account_access(p_owner_user_id uuid)
returns boolean
language sql
stable
as $$
  select
    auth.uid() = p_owner_user_id
    or exists (
      select 1
      from public.account_shares s
      where s.owner_user_id = p_owner_user_id
        and lower(s.shared_with_email) = public.current_user_email()
    );
$$;

-- Apply account-level access to all account-scoped tables.
drop policy if exists "cost_sheets_shared_select" on public.cost_sheets;
drop policy if exists "cost_sheets_shared_update" on public.cost_sheets;
drop policy if exists "cost_sheets_owner_all" on public.cost_sheets;
drop policy if exists "cost_sheets_account_access_all" on public.cost_sheets;
create policy "cost_sheets_account_access_all"
  on public.cost_sheets
  for all
  using (public.has_account_access(user_id))
  with check (public.has_account_access(user_id));

drop policy if exists "materials_owner_all" on public.materials;
drop policy if exists "materials_account_access_all" on public.materials;
create policy "materials_account_access_all"
  on public.materials
  for all
  using (public.has_account_access(user_id))
  with check (public.has_account_access(user_id));

drop policy if exists "purchases_owner_all" on public.purchases;
drop policy if exists "purchases_account_access_all" on public.purchases;
create policy "purchases_account_access_all"
  on public.purchases
  for all
  using (public.has_account_access(user_id))
  with check (public.has_account_access(user_id));

drop policy if exists "bom_items_owner_all" on public.bom_items;
drop policy if exists "bom_items_account_access_all" on public.bom_items;
create policy "bom_items_account_access_all"
  on public.bom_items
  for all
  using (public.has_account_access(user_id))
  with check (public.has_account_access(user_id));

drop policy if exists "bom_item_lines_owner_all" on public.bom_item_lines;
drop policy if exists "bom_item_lines_account_access_all" on public.bom_item_lines;
create policy "bom_item_lines_account_access_all"
  on public.bom_item_lines
  for all
  using (public.has_account_access(user_id))
  with check (public.has_account_access(user_id));

drop policy if exists "app_settings_owner_all" on public.app_settings;
drop policy if exists "app_settings_account_access_all" on public.app_settings;
create policy "app_settings_account_access_all"
  on public.app_settings
  for all
  using (public.has_account_access(user_id))
  with check (public.has_account_access(user_id));

-- RPCs used by app UI.
create or replace function public.share_account_with_email(
  p_email text
)
returns public.account_shares
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_row public.account_shares;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'Email is required';
  end if;

  if v_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
    raise exception 'Invalid email address';
  end if;

  insert into public.account_shares (
    owner_user_id,
    shared_with_email
  )
  values (
    auth.uid(),
    v_email
  )
  on conflict (owner_user_id, shared_with_email)
  do update
    set updated_at = now()
  returning *
    into v_row;

  return v_row;
end;
$$;

create or replace function public.unshare_account_by_email(
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'Email is required';
  end if;

  delete from public.account_shares s
  where s.owner_user_id = auth.uid()
    and lower(s.shared_with_email) = v_email;
end;
$$;

create or replace function public.list_shared_accounts_for_current_user()
returns table (
  owner_user_id uuid,
  owner_email text,
  shared_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    s.owner_user_id,
    lower(coalesce(u.email, '')) as owner_email,
    min(s.created_at) as shared_at
  from public.account_shares s
  left join auth.users u
    on u.id = s.owner_user_id
  where lower(s.shared_with_email) = public.current_user_email()
  group by s.owner_user_id, lower(coalesce(u.email, ''))
  order by min(s.created_at) desc, lower(coalesce(u.email, ''));
$$;

grant execute on function public.share_account_with_email(text) to authenticated;
grant execute on function public.unshare_account_by_email(text) to authenticated;
grant execute on function public.list_shared_accounts_for_current_user() to authenticated;

commit;
