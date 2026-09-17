-- HISTÓRICO: para instalaciones nuevas usar crm-complete.sql.
create type customer_status as enum ('Activo', 'Potencial', 'Dormido');
create type deal_stage as enum ('nuevo', 'contactado', 'cotizando', 'ganado');

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text not null,
  email text not null,
  phone text,
  status customer_status not null default 'Potencial',
  value numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  title text not null,
  stage deal_stage not null default 'nuevo',
  amount numeric(14, 2) not null default 0,
  next_step text,
  created_at timestamptz not null default now()
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  valid_until date not null,
  discount_percent numeric(5, 2) not null default 0,
  tax_percent numeric(5, 2) not null default 21,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  description text not null,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(14, 2) not null default 0,
  sort_order integer not null default 0
);

alter table public.customers enable row level security;
alter table public.deals enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
