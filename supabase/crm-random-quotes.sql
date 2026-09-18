-- Ejecutar después de crm-complete.sql y crm-admin-access.sql.
-- Consultas independientes: no crean clientes ni alteran cotizaciones comerciales.
begin;
create table if not exists public.crm_random_quotes (
 id uuid primary key,
 owner_id uuid not null references auth.users(id),
 sequence bigint generated always as identity unique,
 created_at timestamptz not null default now(),
 data jsonb not null check (jsonb_typeof(data)='object')
);
alter table public.crm_random_quotes enable row level security;
revoke all on public.crm_random_quotes from public, anon, authenticated;

create or replace function public.crm_read_random_quotes() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform public.crm_require_member();
 return coalesce((select jsonb_agg(data order by created_at desc, sequence desc)
   from public.crm_random_quotes where owner_id=auth.uid() or public.crm_is_admin()), '[]'::jsonb);
end $$;

create or replace function public.crm_create_random_quote(p_quote jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 qid uuid := (p_quote->>'id')::uuid;
 saved public.crm_random_quotes;
 draft jsonb := p_quote->'draft';
 num text;
begin
 perform public.crm_require_member();
 if qid is null then raise exception 'Consulta sin identificador.'; end if;
 -- Serializar reintentos concurrentes del mismo guardado.
 perform pg_advisory_xact_lock(hashtextextended(qid::text,0));
 select * into saved from public.crm_random_quotes where id=qid;
 if found then
   if saved.owner_id<>auth.uid() then raise exception 'Consulta no autorizada.' using errcode='42501'; end if;
   return saved.data;
 end if;
 if jsonb_typeof(draft) is distinct from 'object'
   or p_quote->>'random' is distinct from 'true' or draft->>'random' is distinct from 'true'
   or coalesce(p_quote->>'clientId','')<>'' or coalesce(draft->>'clientId','')<>''
   or jsonb_typeof(p_quote->'amount') is distinct from 'number'
   or coalesce((p_quote->>'amount')::numeric,-1)<0
   or coalesce(trim(p_quote->>'text'),'')=''
   or coalesce(trim(p_quote->>'summary'),'')=''
   or coalesce((draft->>'distanceKm')::numeric,0)<=0
   or coalesce((draft->>'requiredDays')::numeric,0)<1
   or coalesce((draft->>'utilityPercent')::numeric,-1)<0
   or (draft->>'utilityPercent')::numeric>=100
   or coalesce(draft->>'tollListStatus','pending') not in ('manual','detected')
   or coalesce(draft->>'tollRouteKey','')=''
   or jsonb_typeof(draft->'tolls') is distinct from 'array'
   or coalesce((draft->>'roundingUnit')::integer,0) not in (0,1,100,1000)
 then raise exception 'Completá el cálculo de la tarifa antes de guardar la consulta.'; end if;
 if exists(select 1 from jsonb_array_elements(draft->'tolls') toll
   where jsonb_typeof(toll->'amount') is distinct from 'number' or (toll->>'amount')::numeric<0)
 then raise exception 'Completá los importes de todos los peajes.'; end if;
 insert into public.crm_random_quotes(id,owner_id,data)
 values(qid,auth.uid(),'{}'::jsonb) returning * into saved;
 num := 'CR-' || lpad(saved.sequence::text,greatest(5,length(saved.sequence::text)),'0');
 update public.crm_random_quotes set data=
   (p_quote - array['clientSnapshot','contact','sentAt','sentTo','approvedAt','parentId','rootId','revision']) ||
   jsonb_build_object('id',qid,'random',true,'clientId','','clientName','Consulta sin cliente',
     'number',num,'sequence',saved.sequence,'createdAt',saved.created_at,
     'state','Consulta','requiredAction','','text',num||E'\n'||(p_quote->>'text'))
 where id=qid returning * into saved;
 return saved.data;
end $$;
revoke all on function public.crm_read_random_quotes(), public.crm_create_random_quote(jsonb) from public, anon;
grant execute on function public.crm_read_random_quotes(), public.crm_create_random_quote(jsonb) to authenticated;
commit;
