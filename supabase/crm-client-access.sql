-- Ejecutar después de crm-admin-access.sql. Los usuarios empiezan sin clientes asignados.
begin;
create table if not exists public.crm_user_clients (
 email text references public.crm_allowed_emails(email) on delete cascade,
 client_id text references public.crm_clients(id) on delete cascade,
 primary key(email,client_id)
);
alter table public.crm_user_clients enable row level security;
revoke all on public.crm_user_clients from public,anon,authenticated;

create or replace function public.crm_can_access_client(p_id text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.crm_is_member() and (public.crm_is_admin() or exists(
 select 1 from public.crm_user_clients a join auth.users u on lower(u.email)=a.email
 where u.id=auth.uid() and a.client_id=p_id));
$$;
create or replace function public.crm_require_client(p_id text) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.crm_can_access_client(p_id) then raise exception 'Cliente no autorizado.' using errcode='42501'; end if;
end $$;
create or replace function public.crm_require_admin() returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.crm_is_admin() then raise exception 'Solo el administrador puede realizar esta operación.' using errcode='42501'; end if;
end $$;

drop policy if exists crm_team_read on public.crm_clients;
create policy crm_team_read on public.crm_clients for select to authenticated using(public.crm_can_access_client(id));
drop policy if exists crm_team_read on public.crm_quotes;
create policy crm_team_read on public.crm_quotes for select to authenticated using(public.crm_can_access_client(client_id));
drop policy if exists crm_team_read on public.crm_quote_events;
create policy crm_team_read on public.crm_quote_events for select to authenticated using(exists(select 1 from public.crm_quotes q where q.id=quote_id and public.crm_can_access_client(q.client_id)));

create or replace function public.crm_admin_set_clients(p_email text,p_client_ids text[]) returns void
language plpgsql security definer set search_path='' as $$
declare normalized text:=lower(trim(p_email));
begin
 perform public.crm_require_admin();
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('crm-access:'||normalized,0));
 if not exists(select 1 from public.crm_allowed_emails where email=normalized) then raise exception 'Primero autorizá al usuario.'; end if;
 if exists(select 1 from public.crm_admins a join auth.users u on u.id=a.user_id where lower(u.email)=normalized) then raise exception 'El administrador tiene acceso a todos los clientes.'; end if;
 if p_client_ids is null or exists(select 1 from unnest(p_client_ids) as requested(client_id) where requested.client_id is null or not exists(select 1 from public.crm_clients c where c.id=requested.client_id and c.deleted_at is null)) then raise exception 'Listado de clientes inválido.'; end if;
 delete from public.crm_user_clients where email=normalized;
 insert into public.crm_user_clients(email,client_id) select normalized,id from unnest(p_client_ids) id on conflict do nothing;
 insert into public.crm_access_events(actor,email,action) values(auth.uid(),normalized,'clients_updated');
end $$;

create or replace function public.crm_admin_users() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform public.crm_require_admin();
 return coalesce((select jsonb_agg(jsonb_build_object('email',a.email,'approvedAt',a.created_at,
 'registered',u.id is not null,'confirmed',u.email_confirmed_at is not null,
 'clientIds',coalesce((select jsonb_agg(ac.client_id order by ac.client_id) from public.crm_user_clients ac where ac.email=a.email),'[]'::jsonb),
 'admin',exists(select 1 from public.crm_admins ad where ad.user_id=u.id)) order by a.email)
 from public.crm_allowed_emails a left join auth.users u on lower(u.email)=a.email),'[]'::jsonb);
end $$;

-- Las implementaciones anteriores quedan privadas; las entradas RPC validan el cliente.
do $$ declare signature text; original text; begin
 foreach signature in array array['crm_save_client(jsonb)','crm_delete_client(text)','crm_create_quote(jsonb,uuid)','crm_transition_quote(uuid,text,text)','crm_save_catalog(text,jsonb,jsonb,jsonb)','crm_import_local(uuid,jsonb)'] loop
  original:=split_part(signature,'(',1);
  if to_regprocedure('public.'||replace(signature,original,original||'_internal')) is null then
   execute format('alter function public.%s rename to %I',signature,original||'_internal');
  end if;
  execute format('revoke all on function public.%s from public,anon,authenticated',replace(signature,original,original||'_internal'));
 end loop;
end $$;

create or replace function public.crm_save_client(p_client jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.crm_require_client(p_client->>'id');
 return public.crm_save_client_internal(p_client);
end $$;
create or replace function public.crm_delete_client(p_id text) returns void
language plpgsql security definer set search_path='' as $$
begin perform public.crm_require_client(p_id); perform public.crm_delete_client_internal(p_id); end $$;
create or replace function public.crm_create_quote(p_quote jsonb,p_parent_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing_client text;
begin
 perform public.crm_require_client(p_quote->>'clientId');
 select client_id into existing_client from public.crm_quotes where id=(p_quote->>'id')::uuid;
 if found then perform public.crm_require_client(existing_client); end if;
 if p_parent_id is not null then
  select client_id into existing_client from public.crm_quotes where id=p_parent_id;
  perform public.crm_require_client(existing_client);
 end if;
 return public.crm_create_quote_internal(p_quote,p_parent_id);
end $$;
create or replace function public.crm_transition_quote(p_id uuid,p_action text,p_contact_key text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare client text;
begin
 select client_id into client from public.crm_quotes where id=p_id;
 perform public.crm_require_client(client);
 return public.crm_transition_quote_internal(p_id,p_action,p_contact_key);
end $$;
create or replace function public.crm_save_catalog(p_kind text,p_items jsonb,p_expected jsonb,p_rename jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
begin perform public.crm_require_admin(); perform public.crm_save_catalog_internal(p_kind,p_items,p_expected,p_rename); end $$;
create or replace function public.crm_import_local(p_batch_id uuid,p_bundle jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin perform public.crm_require_admin(); return public.crm_import_local_internal(p_batch_id,p_bundle); end $$;

create or replace function public.crm_read() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform public.crm_require_member();
 return jsonb_build_object('schemaVersion',1,
 'clients',coalesce((select jsonb_agg(profile || jsonb_build_object('id',id,'createdAt',created_at,'type',coalesce(client_type,'')) order by created_at desc) from public.crm_clients where deleted_at is null and public.crm_can_access_client(id)),'[]'::jsonb),
 'quotes',coalesce((select jsonb_agg(public.crm_quote_json(q) order by created_at desc) from public.crm_quotes q where public.crm_can_access_client(q.client_id)),'[]'::jsonb),
 'clientTypes',coalesce((select jsonb_agg(name order by sort_order,name) from public.crm_client_types),'[]'::jsonb),
 'additionals',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'kind',kind,'amount',amount) order by sort_order) from public.crm_additionals),'[]'::jsonb));
end $$;
revoke all on function public.crm_require_client(text),public.crm_require_admin() from public,anon,authenticated;
do $$ declare signature text; begin
 foreach signature in array array['crm_can_access_client(text)','crm_admin_set_clients(text,text[])','crm_save_client(jsonb)','crm_delete_client(text)','crm_create_quote(jsonb,uuid)','crm_transition_quote(uuid,text,text)','crm_save_catalog(text,jsonb,jsonb,jsonb)','crm_import_local(uuid,jsonb)'] loop
  execute format('revoke all on function public.%s from public,anon,authenticated',signature);
  execute format('grant execute on function public.%s to authenticated',signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
