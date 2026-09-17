-- Preparación para la base compartida. NO ejecutado desde la app.
-- Requiere usuarios autenticados y alta explícita en crm_members por el administrador.
-- El adaptador activo de esta versión sigue siendo IndexedDB (por navegador).
begin;
create table if not exists public.crm_members (user_id uuid primary key references auth.users(id));
alter table public.crm_members enable row level security;
create policy crm_members_self on public.crm_members for select to authenticated using (user_id = auth.uid());
create table if not exists public.crm_quote_clients (
 id text primary key,
 data jsonb not null,
 created_at timestamptz not null default now()
);
create table if not exists public.crm_quote_counter (
 id boolean primary key default true check (id),
 value integer not null default 0 check (value between 0 and 99999)
);
insert into public.crm_quote_counter (id,value) values (true,0) on conflict do nothing;
create table if not exists public.crm_quote_register (
 id uuid primary key default gen_random_uuid(),
 client_id text not null references public.crm_quote_clients(id),
 sequence integer not null check (sequence between 1 and 99999),
 revision integer not null default 0 check (revision >= 0),
 number text not null unique,
 root_id uuid not null references public.crm_quote_register(id) deferrable initially deferred,
 parent_id uuid references public.crm_quote_register(id),
 created_at timestamptz not null default now(),
 state text not null default 'Pendiente de envio' check (state in ('Pendiente de envio','Enviada / pendiente','Aprobada','Recotizada')),
 sent_at timestamptz,
 sent_to jsonb,
 approved_at timestamptz,
 data jsonb not null,
 unique (sequence,revision),
 check ((revision = 0 and parent_id is null) or (revision > 0 and parent_id is not null)),
 check (state not in ('Enviada / pendiente','Aprobada') or (sent_at is not null and sent_to is not null))
);
create index if not exists crm_quote_client_date on public.crm_quote_register(client_id,created_at desc);
alter table public.crm_quote_clients enable row level security;
alter table public.crm_quote_counter enable row level security;
alter table public.crm_quote_register enable row level security;
create policy crm_client_team on public.crm_quote_clients for all to authenticated
 using (exists(select 1 from public.crm_members where user_id=auth.uid()))
 with check (exists(select 1 from public.crm_members where user_id=auth.uid()));
create policy crm_quote_team on public.crm_quote_register for all to authenticated
 using (exists(select 1 from public.crm_members where user_id=auth.uid()))
 with check (exists(select 1 from public.crm_members where user_id=auth.uid()));
create policy crm_counter_team on public.crm_quote_counter for all to authenticated
 using (exists(select 1 from public.crm_members where user_id=auth.uid()))
 with check (exists(select 1 from public.crm_members where user_id=auth.uid()));
-- La asignación de números compartidos se debe realizar en una única transacción
-- bloqueando crm_quote_counter (SELECT ... FOR UPDATE), nunca desde el navegador.
commit;
