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
  unit_cost_cents integer not null default 0 check (unit_cost_cents >= 0),
  supplier text not null default '',
  last_purchase_cost_cents integer not null default 0 check (last_purchase_cost_cents >= 0),
  last_purchase_date date,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  supplier text not null default '',
  quantity numeric(14,4) not null default 0 check (quantity >= 0),
  unit text not null default 'ea',
  unit_cost_cents integer not null default 0 check (unit_cost_cents >= 0),
  total_cost_cents bigint not null default 0 check (total_cost_cents >= 0),
  currency text not null default 'USD',
  reference_no text not null default '',
  notes text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
