-- CRM Servintar: instalación completa, repetible y sin borrar datos existentes.
-- Ejecutar en SQL Editor como postgres. No habilita acceso anónimo al CRM.
begin;

create table if not exists public.crm_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.crm_members enable row level security;
drop policy if exists crm_members_self on public.crm_members;
create policy crm_members_self on public.crm_members for select to authenticated using (user_id = auth.uid());
grant select on public.crm_members to authenticated;
revoke all on public.crm_members from anon;

create or replace function public.crm_is_member() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.crm_members where user_id = auth.uid());
$$;
create or replace function public.crm_require_member() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.crm_is_member() then raise exception 'Acceso al CRM no autorizado' using errcode='42501'; end if;
end;
$$;

create or replace function public.crm_valid_cuit(cuit text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare digits text := replace(cuit,'-',''); weights integer[] := array[5,4,3,2,7,6,5,4,3,2]; total integer:=0; i integer;
begin
 if cuit is null or cuit !~ '^(\d{11}|\d{2}-\d{8}-\d)$' or digits='00000000000' then return false; end if;
 for i in 1..10 loop total:=total+substring(digits,i,1)::integer*weights[i]; end loop;
 return (11-total%11)%11=substring(digits,11,1)::integer;
end;
$$;

create table if not exists public.crm_client_types (
 name text primary key check(length(trim(name)) between 1 and 100),
 sort_order integer not null default 0
);
create unique index if not exists crm_client_types_name_ci on public.crm_client_types(lower(trim(name)));
insert into public.crm_client_types(name,sort_order) values ('Carga general',0),('Importador',1),('Exportador',2),('Forwarder',3) on conflict do nothing;

create table if not exists public.crm_clients (
 id text primary key,
 profile jsonb not null check(jsonb_typeof(profile)='object'),
 client_type text references public.crm_client_types(name) on update cascade,
 cuit text generated always as (replace(profile->>'cuit','-','')) stored,
 business_name text generated always as (profile->>'businessName') stored,
 alias text generated always as (profile->>'alias') stored,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 check(public.crm_valid_cuit(profile->>'cuit')),
 check(length(trim(profile->>'businessName'))>0),
 check(length(trim(profile->>'alias'))>0)
);
create unique index if not exists crm_clients_cuit_live on public.crm_clients(cuit) where deleted_at is null;
create index if not exists crm_clients_name on public.crm_clients(lower(alias));

create table if not exists public.crm_additionals (
 id text primary key,
 name text not null check(length(trim(name)) between 1 and 100),
 description text not null default '',
 kind text not null check(kind in ('fixed','percent')),
 amount numeric(16,4) check(amount>=0),
 sort_order integer not null default 0,
 updated_at timestamptz not null default now()
);
create unique index if not exists crm_additionals_name_ci on public.crm_additionals(lower(trim(name)));
insert into public.crm_additionals(id,name,kind,sort_order) values
 ('adicional-base-0','Devolucion de vacio dia siguiente','fixed',0),
 ('adicional-base-1','Demora en la carga','fixed',1),
 ('adicional-base-2','Demora en la descarga','fixed',2),
 ('adicional-base-3','Pernocte','fixed',3),('adicional-base-4','Inhabil','fixed',4)
on conflict do nothing;

create table if not exists public.crm_numbering (
 id boolean primary key default true check(id),
 last_sequence integer not null default 0 check(last_sequence between 0 and 99999)
);
insert into public.crm_numbering values(true,0) on conflict do nothing;
create table if not exists public.crm_quotes (
 id uuid primary key,
 client_id text not null references public.crm_clients(id),
 sequence integer not null check(sequence between 1 and 99999),
 revision integer not null default 0 check(revision>=0),
 number text not null unique,
 root_id uuid not null references public.crm_quotes(id) deferrable initially deferred,
 parent_id uuid references public.crm_quotes(id),
 created_at timestamptz not null default now(),
 state text not null default 'Pendiente de envio' check(state in ('Pendiente de envio','Enviada / pendiente','Aprobada','Recotizada')),
 sent_at timestamptz,
 sent_to jsonb,
 approved_at timestamptz,
 data jsonb not null check(jsonb_typeof(data)='object'),
 unique(sequence,revision),
 check((revision=0 and parent_id is null and root_id=id) or (revision>0 and parent_id is not null)),
 check(state not in ('Enviada / pendiente','Aprobada','Recotizada') or (sent_at is not null and length(trim(sent_to->>'fullName'))>0))
);
create index if not exists crm_quotes_client_date on public.crm_quotes(client_id,created_at desc);
create index if not exists crm_quotes_root on public.crm_quotes(root_id,revision);
create table if not exists public.crm_quote_events (
 id bigint generated always as identity primary key,
 quote_id uuid not null references public.crm_quotes(id),
 action text not null,
 happened_at timestamptz not null default now(),
 actor uuid references auth.users(id),
 detail jsonb not null default '{}'::jsonb
);

-- Costos mensuales: conserva el esquema y los datos utilizados por la app.
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



-- Sólo los miembros del CRM pueden leer las tablas nuevas. Las escrituras
-- comerciales se realizan mediante funciones, no por cambios directos de estado.
do $$ declare t text; begin
 foreach t in array array['crm_client_types','crm_clients','crm_additionals','crm_numbering','crm_quotes','crm_quote_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('drop policy if exists crm_team_read on public.%I',t);
  execute format('create policy crm_team_read on public.%I for select to authenticated using ((select public.crm_is_member()))',t);
 end loop;
 foreach t in array array['cost_categories','monthly_cost_structures','monthly_cost_items'] loop
  execute format('drop policy if exists crm_team_costs on public.%I',t);
  execute format('create policy crm_team_costs on public.%I for all to authenticated using ((select public.crm_is_member())) with check ((select public.crm_is_member()))',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

-- Vistas: contactos, peajes y adicionales conservados con cada cotización.
-- Usan la seguridad de las tablas; no duplican el historial ni las tarifas.
create or replace view public.crm_contacts with (security_invoker=true) as
 select c.id as client_id, x.key as contact_key, x.value->>'fullName' as full_name,
 x.value->>'role' as role, x.value->>'email' as email, x.value->>'phone' as phone
 from public.crm_clients c cross join lateral jsonb_each(c.profile) x
 where c.deleted_at is null and x.key in ('commercialContact','operationalContact','purchasingContact');
create or replace view public.crm_quote_tolls with (security_invoker=true) as
 select q.id as quote_id,t.ordinality as position,t.value as toll
 from public.crm_quotes q cross join lateral jsonb_array_elements(coalesce(q.data#>'{draft,tolls}','[]'::jsonb)) with ordinality t;
create or replace view public.crm_quote_additionals with (security_invoker=true) as
 select q.id as quote_id,a.ordinality as position,a.value as additional
 from public.crm_quotes q cross join lateral jsonb_array_elements(coalesce(q.data#>'{draft,additionals}','[]'::jsonb)) with ordinality a;
create or replace view public.crm_price_list with (security_invoker=true) as
 select * from public.crm_quotes where state='Aprobada';
grant select on public.crm_contacts,public.crm_quote_tolls,public.crm_quote_additionals,public.crm_price_list to authenticated;
revoke all on public.crm_contacts,public.crm_quote_tolls,public.crm_quote_additionals,public.crm_price_list from anon;

create or replace function public.crm_quote_json(q public.crm_quotes) returns jsonb
language sql stable set search_path='' as $$
 select q.data || jsonb_build_object('id',q.id,'clientId',q.client_id,'number',q.number,'sequence',q.sequence,
 'revision',q.revision,'rootId',q.root_id,'parentId',q.parent_id,'createdAt',q.created_at,'state',q.state,
 'sentAt',q.sent_at,'sentTo',q.sent_to,'approvedAt',q.approved_at,
 'requiredAction',case q.state when 'Pendiente de envio' then 'Enviar al cliente' when 'Enviada / pendiente' then 'Esperar aprobación' when 'Recotizada' then 'Consultar recotización' else '' end);
$$;

create or replace function public.crm_read() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform public.crm_require_member();
 return jsonb_build_object('schemaVersion',1,
 'clients',coalesce((select jsonb_agg(profile || jsonb_build_object('id',id,'createdAt',created_at,'type',coalesce(client_type,'')) order by created_at desc) from public.crm_clients where deleted_at is null),'[]'::jsonb),
 'quotes',coalesce((select jsonb_agg(public.crm_quote_json(q) order by created_at desc) from public.crm_quotes q),'[]'::jsonb),
 'clientTypes',coalesce((select jsonb_agg(name order by sort_order,name) from public.crm_client_types),'[]'::jsonb),
 'additionals',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'kind',kind,'amount',amount) order by sort_order) from public.crm_additionals),'[]'::jsonb));
end;
$$;

create or replace function public.crm_save_client(p_client jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved public.crm_clients;
begin
 perform public.crm_require_member();
 if coalesce(p_client->>'id','')='' or not public.crm_valid_cuit(p_client->>'cuit') or coalesce(trim(p_client->>'alias'),'')='' or coalesce(trim(p_client->>'businessName'),'')='' then raise exception 'Datos del cliente o CUIT inválidos'; end if;
 insert into public.crm_clients(id,profile,client_type) values(p_client->>'id',p_client,nullif(p_client->>'type',''))
 on conflict(id) do update set profile=excluded.profile,client_type=excluded.client_type,updated_at=now(),deleted_at=null returning * into saved;
 return saved.profile || jsonb_build_object('id',saved.id,'createdAt',saved.created_at);
end;
$$;
create or replace function public.crm_delete_client(p_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.crm_require_member();
 update public.crm_clients set deleted_at=now(),updated_at=now() where id=p_id;
end;
$$;

create or replace function public.crm_create_quote(p_quote jsonb,p_parent_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.crm_quotes; parent public.crm_quotes; client public.crm_clients;
 qid uuid:=(p_quote->>'id')::uuid; seq integer; rev integer:=0; root uuid; num text; payload jsonb;
begin
 perform public.crm_require_member();
 -- Serializa la asignación global y permite reintentos con el mismo UUID.
 perform 1 from public.crm_numbering where id=true for update;
 select * into q from public.crm_quotes where id=qid;
 if found then return public.crm_quote_json(q); end if;
 select * into client from public.crm_clients where id=p_quote->>'clientId' and deleted_at is null;
 if not found then raise exception 'Cliente no encontrado'; end if;
 if jsonb_typeof(p_quote->'amount') is distinct from 'number' then raise exception 'Importe inválido'; end if;
 if qid is null or jsonb_typeof(p_quote->'draft') is distinct from 'object' or coalesce(p_quote->>'text','')='' or coalesce((p_quote->>'amount')::numeric,-1)<0 then raise exception 'Cotización incompleta'; end if;
 if p_quote#>>'{draft,clientId}' is distinct from client.id then raise exception 'Cliente inconsistente'; end if;
 if p_parent_id is not null then
  select * into parent from public.crm_quotes where id=p_parent_id for update;
  if not found or parent.state<>'Enviada / pendiente' or parent.client_id<>client.id then raise exception 'La original no está pendiente o pertenece a otro cliente'; end if;
  seq:=parent.sequence;root:=parent.root_id;
  select coalesce(max(revision),0)+1 into rev from public.crm_quotes where root_id=root;
 else
  update public.crm_numbering set last_sequence=last_sequence+1 where id=true returning last_sequence into seq;
  root:=qid;
 end if;
 num:='C-'||lpad(seq::text,5,'0')||case when rev>0 then '-R-'||lpad(rev::text,greatest(2,length(rev::text)),'0') else '' end;
 payload:=(p_quote - array['number','sequence','revision','rootId','parentId','createdAt','state','sentAt','sentTo','approvedAt']) ||
 jsonb_build_object('clientSnapshot',client.profile,'clientName',coalesce(client.alias,client.business_name),'requiredAction','Enviar al cliente','text',num||E'\n'||(p_quote->>'text'));
 if p_parent_id is not null then payload:=payload || jsonb_build_object('quoteDate',(now() at time zone 'America/Argentina/Buenos_Aires')::date); end if;
 insert into public.crm_quotes(id,client_id,sequence,revision,number,root_id,parent_id,data)
 values(qid,client.id,seq,rev,num,root,p_parent_id,payload) returning * into q;
 if p_parent_id is not null then
  update public.crm_quotes set state='Recotizada' where id=p_parent_id;
  insert into public.crm_quote_events(quote_id,action,actor,detail) values(p_parent_id,'Recotizada',auth.uid(),jsonb_build_object('revisionId',qid));
 end if;
 insert into public.crm_quote_events(quote_id,action,actor) values(qid,'Creada',auth.uid());
 return public.crm_quote_json(q);
end;
$$;

create or replace function public.crm_transition_quote(p_id uuid,p_action text,p_contact_key text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.crm_quotes; contact jsonb;
begin
 perform public.crm_require_member();
 select * into q from public.crm_quotes where id=p_id for update;
 if not found then raise exception 'Cotización no encontrada'; end if;
 if p_action='send' then
  if q.state<>'Pendiente de envio' or p_contact_key is null or p_contact_key not in ('commercialContact','operationalContact','purchasingContact') then raise exception 'Envío inválido'; end if;
  select profile->p_contact_key into contact from public.crm_clients where id=q.client_id;
  if coalesce(trim(contact->>'fullName'),'')='' then raise exception 'Seleccioná un contacto de la empresa'; end if;
  update public.crm_quotes set state='Enviada / pendiente',sent_at=now(),sent_to=contact where id=p_id returning * into q;
 elsif p_action='approve' then
  if q.state<>'Enviada / pendiente' or q.sent_to is null then raise exception 'Primero registrá el envío'; end if;
  update public.crm_quotes set state='Aprobada',approved_at=now() where id=p_id returning * into q;
 else raise exception 'Acción no permitida'; end if;
 insert into public.crm_quote_events(quote_id,action,actor,detail) values(p_id,q.state,auth.uid(),jsonb_build_object('contact',q.sent_to));
 return public.crm_quote_json(q);
end;
$$;

create or replace function public.crm_save_catalog(p_kind text,p_items jsonb,p_expected jsonb,p_rename jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare current_items jsonb; item jsonb; pos integer:=0;
begin
 perform public.crm_require_member();
 perform pg_catalog.pg_advisory_xact_lock(7382101);
 if jsonb_typeof(p_items) is distinct from 'array' or p_expected is null then raise exception 'Catálogo inválido'; end if;
 if p_kind='types' then
  select coalesce(jsonb_agg(name order by sort_order,name),'[]'::jsonb) into current_items from public.crm_client_types;
  if current_items<>p_expected then raise exception 'Otro usuario modificó los tipos. Actualizá y volvé a intentar.'; end if;
  if p_rename is not null then
   update public.crm_client_types set name=trim(p_rename->>'to') where name=p_rename->>'from';
   update public.crm_clients set profile=jsonb_set(profile,'{type}',to_jsonb(client_type)),updated_at=now() where client_type=p_rename->>'to';
  end if;
  if exists(select 1 from public.crm_clients where client_type is not null and not (p_items ? client_type)) then raise exception 'Hay clientes que usan un tipo que se intenta eliminar'; end if;
  delete from public.crm_client_types where not(p_items ? name);
  for item in select value from jsonb_array_elements(p_items) loop
   if jsonb_typeof(item)<>'string' then raise exception 'Nombre de tipo inválido'; end if;
   insert into public.crm_client_types(name,sort_order) values(trim(item#>>'{}'),pos) on conflict(name) do update set sort_order=excluded.sort_order;
   pos:=pos+1;
  end loop;
 elsif p_kind='additionals' then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'kind',kind,'amount',amount) order by sort_order),'[]'::jsonb) into current_items from public.crm_additionals;
  if current_items<>p_expected then raise exception 'Otro usuario modificó los adicionales. Actualizá y volvé a intentar.'; end if;
  delete from public.crm_additionals;
  for item in select value from jsonb_array_elements(p_items) loop
   insert into public.crm_additionals(id,name,description,kind,amount,sort_order) values(item->>'id',trim(item->>'name'),coalesce(item->>'description',''),item->>'kind',(item->>'amount')::numeric,pos);
   pos:=pos+1;
  end loop;
 else raise exception 'Catálogo desconocido'; end if;
end;
$$;

create or replace function public.crm_save_costs(p_month integer,p_year integer,p_lines jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare sid uuid; line jsonb; pos integer:=0;
begin
 perform public.crm_require_member();
 if p_month not between 1 and 12 or p_year<2000 or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)=0 then raise exception 'Estructura mensual inválida'; end if;
 perform pg_catalog.pg_advisory_xact_lock(7382102);
 insert into public.monthly_cost_structures(month,year,saved_at) values(p_month,p_year,now())
 on conflict(month,year) do update set saved_at=excluded.saved_at returning id into sid;
 delete from public.monthly_cost_items where structure_id=sid;
 for line in select value from jsonb_array_elements(p_lines) loop
  if coalesce(trim(line->>'id'),'')='' or coalesce(trim(line->>'name'),'')='' or (line->>'daySourceValue')::numeric<0 or (line->>'kmSourceValue')::numeric<0 then raise exception 'Rubro de costo inválido'; end if;
  insert into public.cost_categories(id,name,sort_order) values(line->>'id',line->>'name',pos)
  on conflict(id) do update set name=excluded.name,sort_order=excluded.sort_order;
  insert into public.monthly_cost_items(structure_id,category_id,applies_per_day,applies_per_km,day_source_value,day_fadeeac_index,day_updated_value,km_source_value,km_fadeeac_index,km_updated_value,sort_order)
  values(sid,line->>'id',coalesce((line#>>'{allocation,perDay}')::boolean,false),coalesce((line#>>'{allocation,perKm}')::boolean,false),
  (line->>'daySourceValue')::numeric,(line->>'dayFadeeacIndex')::numeric,(line->>'daySourceValue')::numeric*(1+(line->>'dayFadeeacIndex')::numeric/100),
  (line->>'kmSourceValue')::numeric,(line->>'kmFadeeacIndex')::numeric,(line->>'kmSourceValue')::numeric*(1+(line->>'kmFadeeacIndex')::numeric/100),pos);
  pos:=pos+1;
 end loop;
 return sid;
end;
$$;

-- Privilegios explícitos: ninguna función de escritura queda ejecutable por anon/PUBLIC.
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('crm_is_member','crm_require_member','crm_valid_cuit','crm_quote_json','crm_read','crm_save_client','crm_delete_client','crm_create_quote','crm_transition_quote','crm_save_catalog','crm_save_costs') loop
  execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
 end loop;
end $$;
grant execute on function public.crm_is_member(),public.crm_read(),public.crm_save_client(jsonb),public.crm_delete_client(text),public.crm_create_quote(jsonb,uuid),public.crm_transition_quote(uuid,text,text),public.crm_save_catalog(text,jsonb,jsonb,jsonb),public.crm_save_costs(integer,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
