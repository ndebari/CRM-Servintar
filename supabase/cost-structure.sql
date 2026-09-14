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
  source_value numeric(14, 2) not null default 0,
  fadeeac_index numeric(8, 4) not null default 0,
  updated_value numeric(14, 2) not null default 0,
  applies_per_day boolean not null default false,
  applies_per_km boolean not null default false,
  created_at timestamptz not null default now(),
  unique (structure_id, category_id)
);

alter table public.cost_categories enable row level security;
alter table public.monthly_cost_structures enable row level security;
alter table public.monthly_cost_items enable row level security;
