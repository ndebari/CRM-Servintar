begin;
create table if not exists public.crm_historical_tariffs (
 id uuid primary key,
 client_id text not null references public.crm_clients(id),
 effective_on date not null,
 data jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 created_by uuid not null references auth.users(id)
);
alter table public.crm_historical_tariffs enable row level security;
revoke all on public.crm_historical_tariffs from public,anon,authenticated;
grant select on public.crm_historical_tariffs to authenticated;
drop policy if exists client_read on public.crm_historical_tariffs;
create policy client_read on public.crm_historical_tariffs for select to authenticated using(public.crm_can_access_client(client_id));
create or replace function public.crm_read_historical_tariffs() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform public.crm_require_member();
 return coalesce((select jsonb_agg(data order by effective_on desc,created_at desc) from public.crm_historical_tariffs where public.crm_can_access_client(client_id)),'[]'::jsonb);
end $$;
create or replace function public.crm_save_historical_tariff(p_quote jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tariff_id uuid:=(p_quote->>'id')::uuid; client text:=p_quote->>'clientId'; existing public.crm_historical_tariffs; result jsonb; effective date; amount numeric;
begin
 perform public.crm_require_client(client);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tariff_id::text,0));
 select * into existing from public.crm_historical_tariffs where id=tariff_id;
 if found then
  perform public.crm_require_client(existing.client_id);
  if existing.client_id<>client or existing.data->'draft' is distinct from p_quote->'draft' or existing.data->'amount' is distinct from p_quote->'amount' or existing.data->>'effectiveOn' is distinct from p_quote->>'effectiveOn' then raise exception 'El registro ya existe con otros datos.'; end if;
  return existing.data;
 end if;
 if not exists(select 1 from public.crm_clients where id=client and deleted_at is null) then raise exception 'Cliente no disponible.'; end if;
 effective:=(p_quote->>'effectiveOn')::date;
 amount:=(p_quote->>'amount')::numeric;
 if tariff_id is null or effective is null or not isfinite(effective) or amount is null or amount<=0 or amount::text in ('NaN','Infinity','-Infinity') or jsonb_typeof(p_quote->'draft') is distinct from 'object' or p_quote->'draft'->>'clientId' is distinct from client or nullif(trim(p_quote->>'text'),'') is null then raise exception 'Completá los datos de la tarifa, el importe y la vigencia.'; end if;
 result:=(p_quote - 'sentAt' - 'sentTo' - 'approvedAt' - 'sequence' - 'revision' - 'rootId' - 'parentId') || jsonb_build_object('historical',true,'random',false,'state','Aprobada','requiredAction','','number','H-'||tariff_id::text,'createdAt',clock_timestamp(),'effectiveOn',effective);
 insert into public.crm_historical_tariffs(id,client_id,effective_on,data,created_by) values(tariff_id,client,effective,result,auth.uid());
 return result;
end $$;
revoke all on function public.crm_read_historical_tariffs(),public.crm_save_historical_tariff(jsonb) from public,anon,authenticated;
grant execute on function public.crm_read_historical_tariffs(),public.crm_save_historical_tariff(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
