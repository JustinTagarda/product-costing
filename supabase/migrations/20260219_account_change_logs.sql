-- 20260219_account_change_logs.sql
-- Purpose:
-- - Add account-level audit logging for all account-scoped tables.
-- - Track who changed data (owner/shared users) and what changed.
-- - Expose logs via RPC for UI consumption.

begin;

create table if not exists public.account_change_logs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text not null default '',
  table_name text not null default '',
  row_id uuid,
  action text not null default 'update' check (action in ('insert', 'update', 'delete')),
  changed_fields text[] not null default '{}'::text[],
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists account_change_logs_owner_created_idx
  on public.account_change_logs (owner_user_id, created_at desc);

create index if not exists account_change_logs_table_row_created_idx
  on public.account_change_logs (table_name, row_id, created_at desc);

alter table public.account_change_logs enable row level security;

drop policy if exists "account_change_logs_account_select" on public.account_change_logs;
create policy "account_change_logs_account_select"
  on public.account_change_logs
  for select
  using (public.has_account_access(owner_user_id));

create or replace function public.log_account_change_event()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_base_row jsonb;
  v_new jsonb;
  v_old jsonb;
  v_owner_user_id uuid;
  v_row_id uuid;
  v_actor_user_id uuid;
  v_actor_email text;
  v_changed_fields text[] := '{}'::text[];
  v_key text;
begin
  if tg_table_name = 'account_change_logs' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_base_row := to_jsonb(new);
    v_new := to_jsonb(new) - 'updated_at';
  elsif tg_op = 'UPDATE' then
    v_base_row := to_jsonb(new);
    v_new := to_jsonb(new) - 'updated_at';
    v_old := to_jsonb(old) - 'updated_at';

    for v_key in
      select key
      from (
        select jsonb_object_keys(coalesce(v_old, '{}'::jsonb) || coalesce(v_new, '{}'::jsonb)) as key
      ) as keys
    loop
      if v_old -> v_key is distinct from v_new -> v_key then
        v_changed_fields := array_append(v_changed_fields, v_key);
      end if;
    end loop;

    if coalesce(array_length(v_changed_fields, 1), 0) = 0 then
      return new;
    end if;
  else
    v_base_row := to_jsonb(old);
    v_old := to_jsonb(old) - 'updated_at';
  end if;

  v_owner_user_id := nullif(coalesce(v_base_row ->> 'user_id', v_base_row ->> 'owner_user_id'), '')::uuid;
  if v_owner_user_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  v_row_id := nullif(coalesce(v_base_row ->> 'id', v_base_row ->> 'user_id'), '')::uuid;
  v_actor_user_id := auth.uid();
  v_actor_email := public.current_user_email();

  if coalesce(v_actor_email, '') = '' and v_actor_user_id is not null then
    select lower(coalesce(u.email, ''))
      into v_actor_email
      from auth.users u
      where u.id = v_actor_user_id;
  end if;

  if coalesce(v_actor_email, '') = '' then
    v_actor_email := 'system';
  end if;

  insert into public.account_change_logs (
    owner_user_id,
    actor_user_id,
    actor_email,
    table_name,
    row_id,
    action,
    changed_fields,
    before_data,
    after_data
  )
  values (
    v_owner_user_id,
    v_actor_user_id,
    v_actor_email,
    tg_table_name,
    v_row_id,
    lower(tg_op),
    coalesce(v_changed_fields, '{}'::text[]),
    case when tg_op in ('UPDATE', 'DELETE') then v_old else null end,
    case when tg_op in ('INSERT', 'UPDATE') then v_new else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists cost_sheets_log_account_change on public.cost_sheets;
create trigger cost_sheets_log_account_change
after insert or update or delete on public.cost_sheets
for each row execute function public.log_account_change_event();

drop trigger if exists materials_log_account_change on public.materials;
create trigger materials_log_account_change
after insert or update or delete on public.materials
for each row execute function public.log_account_change_event();

drop trigger if exists purchases_log_account_change on public.purchases;
create trigger purchases_log_account_change
after insert or update or delete on public.purchases
for each row execute function public.log_account_change_event();

drop trigger if exists bom_items_log_account_change on public.bom_items;
create trigger bom_items_log_account_change
after insert or update or delete on public.bom_items
for each row execute function public.log_account_change_event();

drop trigger if exists bom_item_lines_log_account_change on public.bom_item_lines;
create trigger bom_item_lines_log_account_change
after insert or update or delete on public.bom_item_lines
for each row execute function public.log_account_change_event();

drop trigger if exists app_settings_log_account_change on public.app_settings;
create trigger app_settings_log_account_change
after insert or update or delete on public.app_settings
for each row execute function public.log_account_change_event();

drop trigger if exists account_shares_log_account_change on public.account_shares;
create trigger account_shares_log_account_change
after insert or update or delete on public.account_shares
for each row execute function public.log_account_change_event();

create or replace function public.list_account_change_logs(
  p_owner_user_id uuid,
  p_table_name text default null,
  p_row_id uuid default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  owner_user_id uuid,
  actor_user_id uuid,
  actor_email text,
  table_name text,
  row_id uuid,
  action text,
  changed_fields text[],
  created_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    l.id,
    l.owner_user_id,
    l.actor_user_id,
    l.actor_email,
    l.table_name,
    l.row_id,
    l.action,
    l.changed_fields,
    l.created_at
  from public.account_change_logs l
  where l.owner_user_id = p_owner_user_id
    and public.has_account_access(l.owner_user_id)
    and (p_table_name is null or l.table_name = p_table_name)
    and (p_row_id is null or l.row_id = p_row_id)
  order by l.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

grant execute on function public.list_account_change_logs(uuid, text, uuid, integer) to authenticated;

commit;
