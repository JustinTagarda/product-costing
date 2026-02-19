-- 20260219_account_share_access_levels.sql
-- Goals:
-- - Introduce account share access levels: editor, viewer.
-- - Enforce owner/editor write access and viewer read-only access across app data.
-- - Keep sharing management owner-only.
-- - Expose read-only sharing list for non-owners viewing shared datasets.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'account_shares'
      and column_name = 'access_level'
  ) then
    alter table public.account_shares
      add column access_level text not null default 'editor';
  end if;
end $$;

update public.account_shares
set access_level = lower(trim(coalesce(access_level, 'editor')));

update public.account_shares
set access_level = 'editor'
where access_level not in ('editor', 'viewer');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'account_shares_access_level_check'
      and conrelid = 'public.account_shares'::regclass
  ) then
    alter table public.account_shares
      add constraint account_shares_access_level_check
      check (access_level in ('editor', 'viewer'));
  end if;
end $$;

create index if not exists account_shares_owner_access_level_idx
  on public.account_shares (owner_user_id, access_level);

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

create or replace function public.has_account_write_access(p_owner_user_id uuid)
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
        and s.access_level = 'editor'
    );
$$;

drop policy if exists "cost_sheets_shared_select" on public.cost_sheets;
drop policy if exists "cost_sheets_shared_update" on public.cost_sheets;
drop policy if exists "cost_sheets_owner_all" on public.cost_sheets;
drop policy if exists "cost_sheets_account_access_all" on public.cost_sheets;
drop policy if exists "cost_sheets_account_access_select" on public.cost_sheets;
drop policy if exists "cost_sheets_account_access_insert" on public.cost_sheets;
drop policy if exists "cost_sheets_account_access_update" on public.cost_sheets;
drop policy if exists "cost_sheets_account_access_delete" on public.cost_sheets;

create policy "cost_sheets_account_access_select"
  on public.cost_sheets
  for select
  using (public.has_account_access(user_id));

create policy "cost_sheets_account_access_insert"
  on public.cost_sheets
  for insert
  with check (public.has_account_write_access(user_id));

create policy "cost_sheets_account_access_update"
  on public.cost_sheets
  for update
  using (public.has_account_write_access(user_id))
  with check (public.has_account_write_access(user_id));

create policy "cost_sheets_account_access_delete"
  on public.cost_sheets
  for delete
  using (public.has_account_write_access(user_id));

drop policy if exists "materials_owner_all" on public.materials;
drop policy if exists "materials_account_access_all" on public.materials;
drop policy if exists "materials_account_access_select" on public.materials;
drop policy if exists "materials_account_access_insert" on public.materials;
drop policy if exists "materials_account_access_update" on public.materials;
drop policy if exists "materials_account_access_delete" on public.materials;

create policy "materials_account_access_select"
  on public.materials
  for select
  using (public.has_account_access(user_id));

create policy "materials_account_access_insert"
  on public.materials
  for insert
  with check (public.has_account_write_access(user_id));

create policy "materials_account_access_update"
  on public.materials
  for update
  using (public.has_account_write_access(user_id))
  with check (public.has_account_write_access(user_id));

create policy "materials_account_access_delete"
  on public.materials
  for delete
  using (public.has_account_write_access(user_id));

drop policy if exists "purchases_owner_all" on public.purchases;
drop policy if exists "purchases_account_access_all" on public.purchases;
drop policy if exists "purchases_account_access_select" on public.purchases;
drop policy if exists "purchases_account_access_insert" on public.purchases;
drop policy if exists "purchases_account_access_update" on public.purchases;
drop policy if exists "purchases_account_access_delete" on public.purchases;

create policy "purchases_account_access_select"
  on public.purchases
  for select
  using (public.has_account_access(user_id));

create policy "purchases_account_access_insert"
  on public.purchases
  for insert
  with check (public.has_account_write_access(user_id));

create policy "purchases_account_access_update"
  on public.purchases
  for update
  using (public.has_account_write_access(user_id))
  with check (public.has_account_write_access(user_id));

create policy "purchases_account_access_delete"
  on public.purchases
  for delete
  using (public.has_account_write_access(user_id));

drop policy if exists "bom_items_owner_all" on public.bom_items;
drop policy if exists "bom_items_account_access_all" on public.bom_items;
drop policy if exists "bom_items_account_access_select" on public.bom_items;
drop policy if exists "bom_items_account_access_insert" on public.bom_items;
drop policy if exists "bom_items_account_access_update" on public.bom_items;
drop policy if exists "bom_items_account_access_delete" on public.bom_items;

create policy "bom_items_account_access_select"
  on public.bom_items
  for select
  using (public.has_account_access(user_id));

create policy "bom_items_account_access_insert"
  on public.bom_items
  for insert
  with check (public.has_account_write_access(user_id));

create policy "bom_items_account_access_update"
  on public.bom_items
  for update
  using (public.has_account_write_access(user_id))
  with check (public.has_account_write_access(user_id));

create policy "bom_items_account_access_delete"
  on public.bom_items
  for delete
  using (public.has_account_write_access(user_id));

drop policy if exists "bom_item_lines_owner_all" on public.bom_item_lines;
drop policy if exists "bom_item_lines_account_access_all" on public.bom_item_lines;
drop policy if exists "bom_item_lines_account_access_select" on public.bom_item_lines;
drop policy if exists "bom_item_lines_account_access_insert" on public.bom_item_lines;
drop policy if exists "bom_item_lines_account_access_update" on public.bom_item_lines;
drop policy if exists "bom_item_lines_account_access_delete" on public.bom_item_lines;

create policy "bom_item_lines_account_access_select"
  on public.bom_item_lines
  for select
  using (public.has_account_access(user_id));

create policy "bom_item_lines_account_access_insert"
  on public.bom_item_lines
  for insert
  with check (public.has_account_write_access(user_id));

create policy "bom_item_lines_account_access_update"
  on public.bom_item_lines
  for update
  using (public.has_account_write_access(user_id))
  with check (public.has_account_write_access(user_id));

create policy "bom_item_lines_account_access_delete"
  on public.bom_item_lines
  for delete
  using (public.has_account_write_access(user_id));

drop policy if exists "app_settings_owner_all" on public.app_settings;
drop policy if exists "app_settings_account_access_all" on public.app_settings;
drop policy if exists "app_settings_account_access_select" on public.app_settings;
drop policy if exists "app_settings_account_access_insert" on public.app_settings;
drop policy if exists "app_settings_account_access_update" on public.app_settings;
drop policy if exists "app_settings_account_access_delete" on public.app_settings;

create policy "app_settings_account_access_select"
  on public.app_settings
  for select
  using (public.has_account_access(user_id));

create policy "app_settings_account_access_insert"
  on public.app_settings
  for insert
  with check (public.has_account_write_access(user_id));

create policy "app_settings_account_access_update"
  on public.app_settings
  for update
  using (public.has_account_write_access(user_id))
  with check (public.has_account_write_access(user_id));

create policy "app_settings_account_access_delete"
  on public.app_settings
  for delete
  using (public.has_account_write_access(user_id));

drop function if exists public.share_account_with_email(text);
drop function if exists public.share_account_with_email(text, text);
create or replace function public.share_account_with_email(
  p_email text,
  p_access_level text default 'editor'
)
returns public.account_shares
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_access_level text;
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

  if v_email = public.current_user_email() then
    raise exception 'Cannot share with your own email';
  end if;

  v_access_level := lower(trim(coalesce(p_access_level, 'editor')));
  if v_access_level not in ('editor', 'viewer') then
    raise exception 'Access level must be editor or viewer';
  end if;

  insert into public.account_shares (
    owner_user_id,
    shared_with_email,
    access_level
  )
  values (
    auth.uid(),
    v_email,
    v_access_level
  )
  on conflict (owner_user_id, shared_with_email)
  do update
    set access_level = excluded.access_level,
        updated_at = now()
  returning *
    into v_row;

  return v_row;
end;
$$;

create or replace function public.update_account_share_access_level(
  p_email text,
  p_access_level text
)
returns public.account_shares
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_access_level text;
  v_row public.account_shares;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'Email is required';
  end if;

  v_access_level := lower(trim(coalesce(p_access_level, '')));
  if v_access_level not in ('editor', 'viewer') then
    raise exception 'Access level must be editor or viewer';
  end if;

  update public.account_shares s
    set access_level = v_access_level,
        updated_at = now()
    where s.owner_user_id = auth.uid()
      and lower(s.shared_with_email) = v_email
  returning *
    into v_row;

  if v_row is null then
    raise exception 'Share not found';
  end if;

  return v_row;
end;
$$;

drop function if exists public.list_shared_accounts_for_current_user();
create or replace function public.list_shared_accounts_for_current_user()
returns table (
  owner_user_id uuid,
  owner_email text,
  access_level text,
  shared_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    s.owner_user_id,
    lower(coalesce(u.email, '')) as owner_email,
    s.access_level,
    s.created_at as shared_at
  from public.account_shares s
  left join auth.users u
    on u.id = s.owner_user_id
  where lower(s.shared_with_email) = public.current_user_email()
  order by s.created_at desc, lower(coalesce(u.email, ''));
$$;

create or replace function public.list_account_shares_for_owner(
  p_owner_user_id uuid
)
returns table (
  owner_user_id uuid,
  owner_email text,
  shared_with_email text,
  access_level text,
  shared_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_owner_user_id is null then
    raise exception 'Owner user id is required';
  end if;

  if not public.has_account_access(p_owner_user_id) then
    raise exception 'Not authorized to view account shares';
  end if;

  return query
  select
    s.owner_user_id,
    lower(coalesce(u.email, '')) as owner_email,
    lower(s.shared_with_email) as shared_with_email,
    s.access_level,
    s.created_at as shared_at
  from public.account_shares s
  left join auth.users u
    on u.id = s.owner_user_id
  where s.owner_user_id = p_owner_user_id
  order by lower(s.shared_with_email);
end;
$$;

grant execute on function public.share_account_with_email(text, text) to authenticated;
grant execute on function public.unshare_account_by_email(text) to authenticated;
grant execute on function public.update_account_share_access_level(text, text) to authenticated;
grant execute on function public.list_shared_accounts_for_current_user() to authenticated;
grant execute on function public.list_account_shares_for_owner(uuid) to authenticated;
