-- Product Costing: Supabase schema
-- Run this in the Supabase SQL editor.

create table if not exists public.cost_sheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null default 'Untitled',
  sku text not null default '',
  currency text not null default 'USD',
  unit_name text not null default 'unit',
  batch_size integer not null default 1,
  waste_pct double precision not null default 0,
  markup_pct double precision not null default 40,
  tax_pct double precision not null default 0,

  materials jsonb not null default '[]'::jsonb,
  labor jsonb not null default '[]'::jsonb,
  overhead jsonb not null default '[]'::jsonb,
  notes text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cost_sheets_user_id_updated_at_idx
  on public.cost_sheets (user_id, updated_at desc);

alter table public.cost_sheets enable row level security;

drop policy if exists "cost_sheets_owner_all" on public.cost_sheets;
create policy "cost_sheets_owner_all"
  on public.cost_sheets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep updated_at fresh on updates.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cost_sheets_set_updated_at on public.cost_sheets;
create trigger cost_sheets_set_updated_at
before update on public.cost_sheets
for each row execute function public.set_updated_at();

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null default '',
  code text not null default '',
  category text not null default '',
  unit text not null default 'ea',
  weighted_average_cost_cents integer not null default 0 check (weighted_average_cost_cents >= 0),
  supplier text not null default '',
  last_purchase_cost_cents integer not null default 0 check (last_purchase_cost_cents >= 0),
  last_purchase_date date,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'materials'
      and column_name = 'usable_unit'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'materials'
      and column_name = 'unit'
  ) then
    alter table public.materials rename column usable_unit to unit;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'materials'
      and column_name = 'unit'
  ) then
    alter table public.materials add column unit text not null default 'ea';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'materials'
      and column_name = 'usable_unit'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'materials'
      and column_name = 'unit'
  ) then
    update public.materials
      set unit = coalesce(nullif(unit, ''), usable_unit, 'ea');
    alter table public.materials drop column usable_unit;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'materials'
      and column_name = 'unit_cost_cents'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'materials'
      and column_name = 'weighted_average_cost_cents'
  ) then
    alter table public.materials rename column unit_cost_cents to weighted_average_cost_cents;
  end if;
end $$;

comment on column public.materials.unit is 'UI: Unit';
comment on column public.materials.weighted_average_cost_cents is 'Computed from purchases as total cost divided by total usable quantity.';

create index if not exists materials_user_id_updated_at_idx
  on public.materials (user_id, updated_at desc);

create index if not exists materials_user_id_active_name_idx
  on public.materials (user_id, is_active, name);

alter table public.materials enable row level security;

drop policy if exists "materials_owner_all" on public.materials;
create policy "materials_owner_all"
  on public.materials
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists materials_set_updated_at on public.materials;
create trigger materials_set_updated_at
before update on public.materials
for each row execute function public.set_updated_at();

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_date date not null default current_date,
  material_id uuid references public.materials(id) on delete set null,

  material_name text not null default '',
  description text not null default '',
  variation text not null default '',
  supplier text not null default '',
  store text not null default '',
  quantity numeric(14,4) not null default 0 check (quantity >= 0),
  usable_quantity numeric(14,4) not null default 0 check (usable_quantity >= 0),
  unit text not null default 'ea',
  unit_cost_cents integer not null default 0 check (unit_cost_cents >= 0),
  total_cost_cents bigint not null default 0 check (total_cost_cents >= 0),
  cost_cents bigint not null default 0 check (cost_cents >= 0),
  currency text not null default 'USD',
  marketplace text not null default 'other',
  reference_no text not null default '',
  notes text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'purchases'
      and column_name = 'description'
  ) then
    alter table public.purchases add column description text not null default '';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'purchases'
      and column_name = 'variation'
  ) then
    alter table public.purchases add column variation text not null default '';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'purchases'
      and column_name = 'store'
  ) then
    alter table public.purchases add column store text not null default '';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'purchases'
      and column_name = 'usable_quantity'
  ) then
    alter table public.purchases add column usable_quantity numeric(14,4) not null default 0 check (usable_quantity >= 0);
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'purchases'
      and column_name = 'cost_cents'
  ) then
    alter table public.purchases add column cost_cents bigint not null default 0 check (cost_cents >= 0);
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'purchases'
      and column_name = 'marketplace'
  ) then
    alter table public.purchases add column marketplace text not null default 'other';
  end if;

  update public.purchases
    set marketplace = lower(trim(marketplace))
    where marketplace is not null;

  update public.purchases
    set marketplace = 'other'
    where marketplace not in ('shopee', 'lazada', 'local', 'other');

  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchases_marketplace_check'
      and conrelid = 'public.purchases'::regclass
  ) then
    alter table public.purchases
      add constraint purchases_marketplace_check
      check (marketplace in ('shopee', 'lazada', 'local', 'other'));
  end if;

  update public.purchases
    set store = supplier
    where trim(coalesce(store, '')) = ''
      and trim(coalesce(supplier, '')) <> '';

  update public.purchases
    set usable_quantity = quantity
    where coalesce(usable_quantity, 0) = 0
      and coalesce(quantity, 0) > 0;

  update public.purchases
    set cost_cents = greatest(0, coalesce(total_cost_cents, 0))
    where coalesce(cost_cents, 0) = 0
      and coalesce(total_cost_cents, 0) > 0;
end $$;

create index if not exists purchases_user_id_purchase_date_idx
  on public.purchases (user_id, purchase_date desc, updated_at desc);

create index if not exists purchases_user_id_material_id_idx
  on public.purchases (user_id, material_id);

alter table public.purchases enable row level security;

drop policy if exists "purchases_owner_all" on public.purchases;
create policy "purchases_owner_all"
  on public.purchases
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists purchases_set_updated_at on public.purchases;
create trigger purchases_set_updated_at
before update on public.purchases
for each row execute function public.set_updated_at();

create or replace function public.compute_material_weighted_average_cost_cents(
  p_user_id uuid,
  p_material_id uuid
)
returns integer
language plpgsql
as $$
declare
  v_weighted_average_cost_cents integer := 0;
begin
  if p_user_id is null or p_material_id is null then
    return 0;
  end if;

  select coalesce(
    round(
      sum(greatest(0, coalesce(p.cost_cents, p.total_cost_cents, 0)))::numeric
      /
      nullif(
        sum(
          case
            when coalesce(p.usable_quantity, 0) > 0 then p.usable_quantity
            when coalesce(p.quantity, 0) > 0 then p.quantity
            else 0
          end
        ),
        0
      )
    ),
    0
  )::integer
  into v_weighted_average_cost_cents
  from public.purchases p
  where p.user_id = p_user_id
    and p.material_id = p_material_id
    and (
      coalesce(p.usable_quantity, 0) > 0
      or coalesce(p.quantity, 0) > 0
    );

  return greatest(0, v_weighted_average_cost_cents);
end;
$$;

create or replace function public.refresh_material_weighted_average_cost(
  p_user_id uuid,
  p_material_id uuid
)
returns void
language plpgsql
as $$
begin
  if p_user_id is null or p_material_id is null then
    return;
  end if;

  update public.materials m
    set weighted_average_cost_cents = public.compute_material_weighted_average_cost_cents(p_user_id, p_material_id)
    where m.user_id = p_user_id
      and m.id = p_material_id;
end;
$$;

create or replace function public.purchases_refresh_material_weighted_average_cost()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.refresh_material_weighted_average_cost(new.user_id, new.material_id);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.user_id is distinct from new.user_id
       or old.material_id is distinct from new.material_id then
      perform public.refresh_material_weighted_average_cost(old.user_id, old.material_id);
    end if;
    perform public.refresh_material_weighted_average_cost(new.user_id, new.material_id);
    return new;
  end if;

  perform public.refresh_material_weighted_average_cost(old.user_id, old.material_id);
  return old;
end;
$$;

drop trigger if exists purchases_refresh_material_weighted_average_cost on public.purchases;
create trigger purchases_refresh_material_weighted_average_cost
after insert or update or delete on public.purchases
for each row execute function public.purchases_refresh_material_weighted_average_cost();

update public.materials m
  set weighted_average_cost_cents = public.compute_material_weighted_average_cost_cents(m.user_id, m.id);

create table if not exists public.bom_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null default '',
  code text not null default '',
  item_type text not null default 'part' check (item_type in ('part', 'product')),
  output_qty numeric(14,4) not null default 1 check (output_qty >= 0),
  output_unit text not null default 'ea',
  is_active boolean not null default true,
  notes text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bom_items_user_id_updated_at_idx
  on public.bom_items (user_id, updated_at desc);

create index if not exists bom_items_user_id_type_active_name_idx
  on public.bom_items (user_id, item_type, is_active, name);

alter table public.bom_items enable row level security;

drop policy if exists "bom_items_owner_all" on public.bom_items;
create policy "bom_items_owner_all"
  on public.bom_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists bom_items_set_updated_at on public.bom_items;
create trigger bom_items_set_updated_at
before update on public.bom_items
for each row execute function public.set_updated_at();

create table if not exists public.bom_item_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bom_item_id uuid not null references public.bom_items(id) on delete cascade,

  sort_order integer not null default 0 check (sort_order >= 0),
  component_type text not null default 'material' check (component_type in ('material', 'bom_item')),
  material_id uuid references public.materials(id) on delete set null,
  component_bom_item_id uuid references public.bom_items(id) on delete set null,
  component_name text not null default '',
  quantity numeric(14,4) not null default 1 check (quantity >= 0),
  unit text not null default 'ea',
  unit_cost_cents integer not null default 0 check (unit_cost_cents >= 0),
  notes text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bom_item_lines_user_id_bom_item_sort_idx
  on public.bom_item_lines (user_id, bom_item_id, sort_order, created_at);

create index if not exists bom_item_lines_user_id_material_id_idx
  on public.bom_item_lines (user_id, material_id);

create index if not exists bom_item_lines_user_id_component_bom_item_id_idx
  on public.bom_item_lines (user_id, component_bom_item_id);

alter table public.bom_item_lines enable row level security;

drop policy if exists "bom_item_lines_owner_all" on public.bom_item_lines;
create policy "bom_item_lines_owner_all"
  on public.bom_item_lines
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists bom_item_lines_set_updated_at on public.bom_item_lines;
create trigger bom_item_lines_set_updated_at
before update on public.bom_item_lines
for each row execute function public.set_updated_at();

create table if not exists public.app_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,

  country_code text not null default 'US',
  timezone text not null default 'America/New_York',
  date_format text not null default 'MM/dd/yyyy',

  base_currency text not null default 'USD',
  currency_display text not null default 'symbol',
  currency_rounding_increment integer not null default 1 check (currency_rounding_increment >= 1),
  currency_rounding_mode text not null default 'nearest',

  unit_system text not null default 'metric',
  default_material_unit text not null default 'ea',
  uom_conversions jsonb not null default '[]'::jsonb,

  costing_method text not null default 'standard',
  default_waste_pct double precision not null default 0,
  default_markup_pct double precision not null default 40,
  default_tax_pct double precision not null default 0,
  price_includes_tax boolean not null default false,

  quantity_precision integer not null default 3 check (quantity_precision between 0 and 6),
  price_precision integer not null default 2 check (price_precision between 0 and 6),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_settings_updated_at_idx
  on public.app_settings (updated_at desc);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_owner_all" on public.app_settings;
create policy "app_settings_owner_all"
  on public.app_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();
