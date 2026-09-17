begin;
create table if not exists public.crm_allowed_emails (
 email text primary key check(email=lower(trim(email))),
 created_at timestamptz not null default now()
);
alter table public.crm_allowed_emails enable row level security;
revoke all on public.crm_allowed_emails from anon,authenticated;
create or replace function public.crm_claim_access() returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return false; end if;
 if exists(select 1 from auth.users u join public.crm_allowed_emails a on a.email=lower(u.email) where u.id=auth.uid() and u.email_confirmed_at is not null) then
  insert into public.crm_members(user_id) values(auth.uid()) on conflict do nothing;
 end if;
 return public.crm_is_member();
end;
$$;
revoke all on function public.crm_claim_access() from public,anon;
grant execute on function public.crm_claim_access() to authenticated;

create table if not exists public.crm_import_batches (
 id uuid primary key,
 actor uuid references auth.users(id),
 imported_at timestamptz not null default now(),
 fingerprint text not null,
 result jsonb not null
);
alter table public.crm_import_batches enable row level security;
revoke all on public.crm_import_batches from anon,authenticated;
create or replace function public.crm_import_local(p_batch_id uuid,p_bundle jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.crm_import_batches; item jsonb; local_quote jsonb; local_profile jsonb; imported jsonb;
 qid uuid; root uuid; parent uuid; seq integer; rev integer; expected_number text; quote_state text;
 old_id text; client_count integer:=0; quote_count integer:=0; fingerprint text:=md5(p_bundle::text);
 max_sequence integer; created timestamptz; sent timestamptz; approved timestamptz;
begin
 perform public.crm_require_member();
 perform pg_catalog.pg_advisory_xact_lock(7382101);
 perform 1 from public.crm_numbering where id for update;
 select * into previous from public.crm_import_batches where id=p_batch_id;
 if found then
  if previous.fingerprint<>fingerprint then raise exception 'La importación cambió. Prepará una nueva revisión.'; end if;
  return previous.result;
 end if;
 if p_batch_id is null or jsonb_typeof(p_bundle->'clients') is distinct from 'array' or jsonb_typeof(p_bundle->'quotes') is distinct from 'array' then raise exception 'Copia local inválida'; end if;
 -- Se agregan catálogos faltantes; los existentes se conservan.
 for item in select value from jsonb_array_elements(coalesce(p_bundle->'clientTypes','[]'::jsonb)) loop
  insert into public.crm_client_types(name,sort_order) values(trim(item#>>'{}'),1000) on conflict do nothing;
 end loop;
 for item in select value from jsonb_array_elements(coalesce(p_bundle->'additionals','[]'::jsonb)) loop
  insert into public.crm_additionals(id,name,description,kind,amount,sort_order)
  values(item->>'id',trim(item->>'name'),coalesce(item->>'description',''),item->>'kind',(item->>'amount')::numeric,1000) on conflict do nothing;
 end loop;
 for local_profile in select value from jsonb_array_elements(p_bundle->'clients') loop
  if local_profile->>'id'='cliente-servintar-demo' then raise exception 'No se importan registros de demostración'; end if;
  if not exists(select 1 from public.crm_clients where id=local_profile->>'id') then
   if coalesce(local_profile->>'type','')<>'' then insert into public.crm_client_types(name,sort_order) values(local_profile->>'type',1000) on conflict do nothing; end if;
   perform public.crm_save_client(local_profile);
   update public.crm_clients set created_at=coalesce(nullif(local_profile->>'createdAt','')::timestamptz,created_at) where id=local_profile->>'id';
   client_count:=client_count+1;
  end if;
 end loop;
 for local_quote in select value from jsonb_array_elements(p_bundle->'quotes') order by coalesce((value->>'revision')::integer,0),value->>'createdAt' loop
  old_id:=local_quote->>'id';
  qid:=case when old_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then old_id::uuid else md5('servintar-legacy:'||old_id)::uuid end;
  if exists(select 1 from public.crm_quotes where id=qid) then continue; end if;
  seq:=(local_quote->>'sequence')::integer;rev:=coalesce((local_quote->>'revision')::integer,0);
  expected_number:='C-'||lpad(seq::text,5,'0')||case when rev>0 then '-R-'||lpad(rev::text,greatest(2,length(rev::text)),'0') else '' end;
  if seq is null or seq not between 1 and 99999 or rev<0 or local_quote->>'number' is distinct from expected_number then raise exception 'Número local inválido: %',local_quote->>'number'; end if;
  if exists(select 1 from public.crm_quotes where number=expected_number) then raise exception 'El número % ya existe en Supabase. No se importó ningún registro.',expected_number; end if;
  old_id:=coalesce(local_quote->>'rootId',local_quote->>'id');
  root:=case when old_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then old_id::uuid else md5('servintar-legacy:'||old_id)::uuid end;
  old_id:=local_quote->>'parentId';parent:=case when old_id is null then null when old_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then old_id::uuid else md5('servintar-legacy:'||old_id)::uuid end;
  quote_state:=local_quote->>'state';
  if quote_state in ('Borrador','Rechazada') then quote_state:='Pendiente de envio'; end if;
  if quote_state='Enviada' then quote_state:='Enviada / pendiente'; end if;
  created:=coalesce((local_quote->>'createdAt')::timestamptz,(local_quote->>'quoteDate')::date::timestamptz);
  sent:=(local_quote->>'sentAt')::timestamptz;approved:=(local_quote->>'approvedAt')::timestamptz;
  if quote_state<>'Pendiente de envio' and (sent is null or coalesce(trim(local_quote#>>'{sentTo,fullName}'),'')='') then raise exception 'La cotización % no conserva el contacto de envío. Revisá su historial antes de importarla.',expected_number; end if;
  if not exists(select 1 from public.crm_clients where id=local_quote->>'clientId') then raise exception 'Falta el cliente de %',expected_number; end if;
  if rev>0 and not exists(select 1 from public.crm_quotes where id=parent and root_id=root and sequence=seq and client_id=local_quote->>'clientId') then raise exception 'Vínculo de recotización inválido: %',expected_number; end if;
  insert into public.crm_quotes(id,client_id,sequence,revision,number,root_id,parent_id,created_at,state,sent_at,sent_to,approved_at,data)
  values(qid,local_quote->>'clientId',seq,rev,expected_number,root,parent,created,quote_state,sent,local_quote->'sentTo',approved,local_quote || jsonb_build_object('legacyId',local_quote->>'id'));
  insert into public.crm_quote_events(quote_id,action,actor,detail) values(qid,'Importada',auth.uid(),jsonb_build_object('batchId',p_batch_id));
  quote_count:=quote_count+1;
 end loop;
 select coalesce(max(sequence),0) into max_sequence from public.crm_quotes;
 update public.crm_numbering set last_sequence=greatest(last_sequence,max_sequence) where id;
 imported:=jsonb_build_object('clients',client_count,'quotes',quote_count,'batchId',p_batch_id);
 insert into public.crm_import_batches(id,actor,fingerprint,result) values(p_batch_id,auth.uid(),fingerprint,imported);
 return imported;
end;
$$;
revoke all on function public.crm_import_local(uuid,jsonb) from public,anon;
grant execute on function public.crm_import_local(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
