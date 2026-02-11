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

