-- Proveedores y versiones inmutables de precios fleteros. No modifica clientes.
begin;
create table if not exists public.crm_suppliers (
 id text primary key,
 profile jsonb not null,
 cuit text generated always as (regexp_replace(profile->>'cuit','[^0-9]','','g')) stored,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 check(public.crm_valid_cuit(profile->>'cuit')),
 check(length(trim(profile->>'alias'))>0 and length(trim(profile->>'businessName'))>0)
);
create unique index if not exists crm_suppliers_active_cuit on public.crm_suppliers(cuit) where deleted_at is null;
create table if not exists public.crm_supplier_prices (
 id uuid primary key,
 supplier_id text not null references public.crm_suppliers(id),
 established_on date not null,
 currency text not null check(currency in ('ARS','USD')),
 lines jsonb not null check(jsonb_typeof(lines)='array' and jsonb_array_length(lines)>0),
 notes text not null default '',
 created_at timestamptz not null default clock_timestamp(),
 created_by uuid references auth.users(id)
);
create index if not exists crm_supplier_prices_history on public.crm_supplier_prices(supplier_id,established_on desc,created_at desc);
alter table public.crm_suppliers enable row level security;
alter table public.crm_supplier_prices enable row level security;
revoke all on public.crm_suppliers,public.crm_supplier_prices from public,anon,authenticated;
grant select on public.crm_suppliers,public.crm_supplier_prices to authenticated;
drop policy if exists crm_supplier_read on public.crm_suppliers;
create policy crm_supplier_read on public.crm_suppliers for select to authenticated using(public.crm_is_member());
drop policy if exists crm_supplier_prices_read on public.crm_supplier_prices;
create policy crm_supplier_prices_read on public.crm_supplier_prices for select to authenticated using(public.crm_is_member());

create or replace function public.crm_read_suppliers() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform public.crm_require_member();
 return jsonb_build_object('suppliers',coalesce((select jsonb_agg(profile||jsonb_build_object('id',id,'createdAt',created_at,'deletedAt',deleted_at) order by profile->>'alias') from public.crm_suppliers),'[]'::jsonb),
 'prices',coalesce((select jsonb_agg(jsonb_build_object('id',id,'supplierId',supplier_id,'establishedOn',established_on,'currency',currency,'lines',lines,'notes',notes,'createdAt',created_at) order by established_on desc,created_at desc,id desc) from public.crm_supplier_prices),'[]'::jsonb));
end $$;
create or replace function public.crm_save_supplier(p_supplier jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.crm_require_member();
 if coalesce(p_supplier->>'id','')='' or coalesce(trim(p_supplier->>'alias'),'')='' or coalesce(trim(p_supplier->>'businessName'),'')='' or not public.crm_valid_cuit(p_supplier->>'cuit') then raise exception 'Datos del proveedor o CUIT inválidos.'; end if;
 insert into public.crm_suppliers(id,profile) values(p_supplier->>'id',p_supplier-'purchasingContact')
 on conflict(id) do update set profile=excluded.profile,updated_at=now(),deleted_at=null;
end $$;
create or replace function public.crm_delete_supplier(p_id text) returns void
language plpgsql security definer set search_path='' as $$
begin perform public.crm_require_member(); update public.crm_suppliers set deleted_at=now(),updated_at=now() where id=p_id; end $$;
create or replace function public.crm_save_supplier_prices(p_list jsonb,p_expected_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare prior public.crm_supplier_prices; latest uuid; item jsonb; day date; amount numeric;
begin
 perform public.crm_require_member();
 perform 1 from public.crm_suppliers where id=p_list->>'supplierId' and deleted_at is null and coalesce((profile->>'active')::boolean,true) for update;
 if not found then raise exception 'Seleccioná un proveedor activo.'; end if;
 select * into prior from public.crm_supplier_prices where id=(p_list->>'id')::uuid;
 if found then
  if prior.supplier_id is distinct from p_list->>'supplierId' or prior.established_on is distinct from (p_list->>'establishedOn')::date or prior.currency is distinct from p_list->>'currency' or prior.lines is distinct from p_list->'lines' or prior.notes is distinct from coalesce(p_list->>'notes','') then raise exception 'El contenido de la lista cambió. Creá una nueva versión.'; end if;
  return prior.id;
 end if;
 select id into latest from public.crm_supplier_prices where supplier_id=p_list->>'supplierId' order by established_on desc,created_at desc,id desc limit 1;
 if latest is distinct from p_expected_id then raise exception 'Otro usuario actualizó los precios. Recargá antes de guardar.'; end if;
 day:=(p_list->>'establishedOn')::date;
 if day is null or day>(now() at time zone 'America/Argentina/Buenos_Aires')::date or day<date '2000-01-01' then raise exception 'Fecha de vigencia inválida.'; end if;
 if exists(select 1 from public.crm_supplier_prices where id=latest and established_on>day) then raise exception 'La actualización no puede ser anterior a la lista vigente.'; end if;
 if jsonb_typeof(p_list->'lines') is distinct from 'array' or jsonb_array_length(p_list->'lines')=0 then raise exception 'Agregá al menos una tarifa.'; end if;
 for item in select value from jsonb_array_elements(p_list->'lines') loop
  if coalesce(trim(item->>'service'),'')='' or coalesce(trim(item->>'unit'),'')='' or jsonb_typeof(item->'amount') is distinct from 'number' then raise exception 'Completá servicio, unidad e importe en cada tarifa.'; end if;
  amount:=(item->>'amount')::numeric;
  if amount<0 or amount>999999999999 or amount<>round(amount,2) then raise exception 'Importe inválido. Usá hasta dos decimales.'; end if;
 end loop;
 insert into public.crm_supplier_prices(id,supplier_id,established_on,currency,lines,notes,created_by)
 values((p_list->>'id')::uuid,p_list->>'supplierId',day,p_list->>'currency',p_list->'lines',coalesce(p_list->>'notes',''),auth.uid());
 return (p_list->>'id')::uuid;
end $$;
revoke all on function public.crm_read_suppliers(),public.crm_save_supplier(jsonb),public.crm_delete_supplier(text),public.crm_save_supplier_prices(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.crm_read_suppliers(),public.crm_save_supplier(jsonb),public.crm_delete_supplier(text),public.crm_save_supplier_prices(jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
