begin;
alter table public.crm_additionals add column if not exists value_created_at timestamptz;
alter table public.crm_additionals add column if not exists value_updated_at timestamptz;
alter table public.crm_additionals add column if not exists last_adjustment_month date;
update public.crm_additionals set value_created_at=updated_at,value_updated_at=updated_at where amount is not null and value_created_at is null;
create table if not exists public.crm_cost_adjustment_periods (
 period date primary key, factor numeric not null check(factor>0), updated_at timestamptz not null default now()
);
create table if not exists public.crm_additional_adjustments (
 additional_id text not null, period date not null, base_amount numeric not null,
 primary key(additional_id,period)
);
create table if not exists public.crm_additional_value_history (
 id bigint generated always as identity primary key, additional_id text not null,
 amount numeric, kind text not null, reason text not null, period date,
 created_at timestamptz not null default now(), actor uuid references auth.users(id)
);
alter table public.crm_cost_adjustment_periods enable row level security;
alter table public.crm_additional_adjustments enable row level security;
alter table public.crm_additional_value_history enable row level security;
revoke all on public.crm_cost_adjustment_periods,public.crm_additional_adjustments,public.crm_additional_value_history from public,anon,authenticated;

do $$ begin
 if to_regprocedure('public.crm_read_without_reference_dates()') is null then alter function public.crm_read() rename to crm_read_without_reference_dates; end if;
 if to_regprocedure('public.crm_save_costs_without_additionals(integer,integer,jsonb)') is null then alter function public.crm_save_costs(integer,integer,jsonb) rename to crm_save_costs_without_additionals; end if;
end $$;
revoke all on function public.crm_read_without_reference_dates(),public.crm_save_costs_without_additionals(integer,integer,jsonb) from public,anon,authenticated;
create or replace function public.crm_read() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.crm_read_without_reference_dates();
 return jsonb_set(result,'{additionals}',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'kind',kind,'amount',amount,
 'valueCreatedAt',value_created_at,'valueUpdatedAt',value_updated_at,'lastAdjustmentMonth',to_char(last_adjustment_month,'YYYY-MM')) order by sort_order) from public.crm_additionals),'[]'::jsonb));
end $$;

create or replace function public.crm_save_catalog(p_kind text,p_items jsonb,p_expected jsonb,p_rename jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare current_items jsonb; item jsonb; old public.crm_additionals; pos integer:=0; new_amount numeric;
 changed boolean; this_month date:=date_trunc('month',now() at time zone 'America/Argentina/Buenos_Aires')::date; factor numeric;
begin
 perform public.crm_require_admin();
 if p_kind<>'additionals' then perform public.crm_save_catalog_internal(p_kind,p_items,p_expected,p_rename); return; end if;
 perform pg_catalog.pg_advisory_xact_lock(7382101);
 if jsonb_typeof(p_items) is distinct from 'array' or p_expected is null then raise exception 'Catálogo inválido'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'kind',kind,'amount',amount) order by sort_order),'[]'::jsonb) into current_items from public.crm_additionals;
 if current_items<>p_expected then raise exception 'Otro usuario o la actualización de costos modificó los adicionales. Actualizá y volvé a intentar.'; end if;
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value->>'id') from jsonb_array_elements(p_items)) then raise exception 'Identificadores de adicionales inválidos.'; end if;
 delete from public.crm_additionals a where not exists(select 1 from jsonb_array_elements(p_items) i where i->>'id'=a.id);
 for item in select value from jsonb_array_elements(p_items) loop
  new_amount:=(item->>'amount')::numeric;
  if new_amount<0 or new_amount='NaN'::numeric then raise exception 'Valor referencial inválido.'; end if;
  select * into old from public.crm_additionals where id=item->>'id';
  changed:=not found or old.amount is distinct from new_amount or old.kind is distinct from item->>'kind';
  insert into public.crm_additionals(id,name,description,kind,amount,sort_order,value_created_at,value_updated_at)
  values(item->>'id',trim(item->>'name'),coalesce(item->>'description',''),item->>'kind',new_amount,pos,case when new_amount is not null then now() end,case when new_amount is not null then now() end)
  on conflict(id) do update set name=excluded.name,description=excluded.description,kind=excluded.kind,amount=excluded.amount,sort_order=excluded.sort_order,updated_at=now(),
   value_created_at=case when changed then excluded.value_created_at else public.crm_additionals.value_created_at end,
   value_updated_at=case when changed then excluded.value_updated_at else public.crm_additionals.value_updated_at end;
  if changed then
   insert into public.crm_additional_value_history(additional_id,amount,kind,reason,actor) values(item->>'id',new_amount,item->>'kind','manual',auth.uid());
   delete from public.crm_additional_adjustments where additional_id=item->>'id' and period=this_month;
   select p.factor into factor from public.crm_cost_adjustment_periods p where period=this_month;
   if factor is not null and new_amount is not null then
    insert into public.crm_additional_adjustments(additional_id,period,base_amount) values(item->>'id',this_month,new_amount/factor);
   end if;
  end if;
  pos:=pos+1;
 end loop;
end $$;

create or replace function public.crm_save_costs(p_month integer,p_year integer,p_lines jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare sid uuid; period_date date; current_period date:=date_trunc('month',now() at time zone 'America/Argentina/Buenos_Aires')::date;
 source_total numeric:=0; updated_total numeric:=0; factor numeric; item jsonb; entry public.crm_additionals; base numeric; new_amount numeric;
begin
 perform public.crm_require_member();
 -- Mismo orden de bloqueos que el catálogo; estructura y referencias se guardan juntas.
 perform pg_catalog.pg_advisory_xact_lock(7382101);
 sid:=public.crm_save_costs_without_additionals(p_month,p_year,p_lines);
 period_date:=make_date(p_year,p_month,1);
 -- Consultas/correcciones históricas no alteran las referencias actuales.
 if period_date<>current_period then return sid; end if;
 for item in select value from jsonb_array_elements(p_lines) loop
  if coalesce((item#>>'{allocation,perDay}')::boolean,false) then
   source_total:=source_total+(item->>'daySourceValue')::numeric;
   updated_total:=updated_total+(item->>'daySourceValue')::numeric*(1+(item->>'dayFadeeacIndex')::numeric/100);
  end if;
  if coalesce((item#>>'{allocation,perKm}')::boolean,false) then
   source_total:=source_total+(item->>'kmSourceValue')::numeric;
   updated_total:=updated_total+(item->>'kmSourceValue')::numeric*(1+(item->>'kmFadeeacIndex')::numeric/100);
  end if;
 end loop;
 factor:=case when source_total>0 then updated_total/source_total else 1 end;
 if factor is null or factor<=0 or factor='NaN'::numeric then raise exception 'El índice ponderado debe ser mayor que -100%%.'; end if;
 insert into public.crm_cost_adjustment_periods(period,factor) values(period_date,factor)
 on conflict(period) do update set factor=excluded.factor,updated_at=now();
 for entry in select * from public.crm_additionals where amount is not null and kind='fixed' loop
  insert into public.crm_additional_adjustments(additional_id,period,base_amount) values(entry.id,period_date,entry.amount) on conflict do nothing;
  select base_amount into base from public.crm_additional_adjustments where additional_id=entry.id and period=period_date;
  new_amount:=round(base*factor,2);
  update public.crm_additionals set amount=new_amount,last_adjustment_month=period_date,
   value_updated_at=case when amount is distinct from new_amount then now() else value_updated_at end,updated_at=case when amount is distinct from new_amount then now() else updated_at end where id=entry.id;
  if entry.amount is distinct from new_amount then
   insert into public.crm_additional_value_history(additional_id,amount,kind,reason,period,actor) values(entry.id,new_amount,entry.kind,'cost_index',period_date,auth.uid());
  end if;
 end loop;
 return sid;
end $$;
revoke all on function public.crm_read(),public.crm_save_catalog(text,jsonb,jsonb,jsonb),public.crm_save_costs(integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.crm_read(),public.crm_save_catalog(text,jsonb,jsonb,jsonb),public.crm_save_costs(integer,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
