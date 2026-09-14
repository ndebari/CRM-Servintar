create table if not exists public.cost_categories (
  id text primary key,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.cost_categories (id, name, sort_order)
values
  ('combustible', 'Combustible', 10),
  ('lubricantes', 'Lubricantes', 20),
  ('neumaticos', 'Neumaticos', 30),
  ('reparaciones', 'Reparaciones', 40),
  ('material-rodante', 'Material Rodante', 50),
  ('personal', 'Personal', 60),
  ('seguros', 'Seguros', 70),
  ('patentes-tasas', 'Patentes y tasas', 80),
  ('costo-financiero', 'Costo Financiero', 90),
  ('gastos-generales', 'Gastos Generales', 100)
on conflict (id) do update
set name = excluded.name,
    sort_order = excluded.sort_order;

create table if not exists public.monthly_cost_structures (
  id uuid primary key default gen_random_uuid(),
  month integer not null check (month between 1 and 12),
  year integer not null check (year >= 2000),
  saved_at timestamptz not null default now(),
  notes text,
  unique (month, year)
);

create table if not exists public.monthly_cost_items (
  id uuid primary key default gen_random_uuid(),
  structure_id uuid not null references public.monthly_cost_structures(id) on delete cascade,
  category_id text not null references public.cost_categories(id),
  applies_per_day boolean not null default false,
  applies_per_km boolean not null default false,
  created_at timestamptz not null default now(),
  unique (structure_id, category_id)
);

alter table public.monthly_cost_items
add column if not exists day_source_value numeric(14, 2) not null default 0,
add column if not exists day_fadeeac_index numeric(8, 4) not null default 0,
add column if not exists day_updated_value numeric(14, 2) not null default 0,
add column if not exists km_source_value numeric(14, 2) not null default 0,
add column if not exists km_fadeeac_index numeric(8, 4) not null default 0,
add column if not exists km_updated_value numeric(14, 2) not null default 0,
add column if not exists sort_order integer not null default 0;

alter table public.monthly_cost_items
add column if not exists source_value numeric(14, 2) not null default 0,
add column if not exists fadeeac_index numeric(8, 4) not null default 0,
add column if not exists updated_value numeric(14, 2) not null default 0;

update public.monthly_cost_items
set
  day_source_value = case when applies_per_day then source_value else day_source_value end,
  day_fadeeac_index = case when applies_per_day then fadeeac_index else day_fadeeac_index end,
  day_updated_value = case when applies_per_day then updated_value else day_updated_value end,
  km_source_value = case when applies_per_km then source_value else km_source_value end,
  km_fadeeac_index = case when applies_per_km then fadeeac_index else km_fadeeac_index end,
  km_updated_value = case when applies_per_km then updated_value else km_updated_value end
where
  (day_source_value = 0 and km_source_value = 0)
  and (source_value <> 0 or fadeeac_index <> 0 or updated_value <> 0);

update public.monthly_cost_items item
set sort_order = category.sort_order
from public.cost_categories category
where item.category_id = category.id
  and item.sort_order = 0;

alter table public.cost_categories enable row level security;
alter table public.monthly_cost_structures enable row level security;
alter table public.monthly_cost_items enable row level security;

drop policy if exists "Allow public cost category reads" on public.cost_categories;
drop policy if exists "Allow public cost category access" on public.cost_categories;
drop policy if exists "Allow public monthly cost structure access" on public.monthly_cost_structures;
drop policy if exists "Allow public monthly cost item access" on public.monthly_cost_items;

create policy "Allow public cost category access"
on public.cost_categories
for all
to anon
using (true)
with check (true);

create policy "Allow public monthly cost structure access"
on public.monthly_cost_structures
for all
to anon
using (true)
with check (true);

create policy "Allow public monthly cost item access"
on public.monthly_cost_items
for all
to anon
using (true)
with check (true);
