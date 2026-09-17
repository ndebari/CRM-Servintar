-- Aplicar después de crm-cloud-activation.sql. Requiere el correo del administrador confirmado.
begin;
create table if not exists public.crm_admins (
 user_id uuid primary key references auth.users(id) on delete restrict
);
alter table public.crm_admins enable row level security;
revoke all on public.crm_admins from public, anon, authenticated;
alter table public.crm_allowed_emails add column if not exists approved_by uuid references auth.users(id);
create table if not exists public.crm_access_events (
 id bigint generated always as identity primary key,
 actor uuid references auth.users(id), email text not null,
 action text not null, created_at timestamptz not null default now()
);
alter table public.crm_access_events enable row level security;
revoke all on public.crm_access_events from public, anon, authenticated;

do $$
declare owner_id uuid;
begin
 select id into owner_id from auth.users where lower(email)='ndebari@servintar.com.ar' and email_confirmed_at is not null;
 if owner_id is null then raise exception 'El administrador debe tener su correo confirmado antes de instalar.'; end if;
 insert into public.crm_admins(user_id) values(owner_id) on conflict do nothing;
 insert into public.crm_allowed_emails(email,approved_by) values('ndebari@servintar.com.ar',owner_id) on conflict(email) do update set approved_by=excluded.approved_by;
 insert into public.crm_members(user_id) values(owner_id) on conflict do nothing;
end $$;

create or replace function public.crm_is_member() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.crm_members m join auth.users u on u.id=m.user_id
 join public.crm_allowed_emails a on a.email=lower(u.email)
 where m.user_id=auth.uid() and u.email_confirmed_at is not null);
$$;
create or replace function public.crm_is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select public.crm_is_member() and exists(select 1 from public.crm_admins where user_id=auth.uid());
$$;

-- La restricción vive en la base: también cubre llamadas directas a Auth.
create or replace function public.crm_guard_signup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.email is not distinct from old.email then return new; end if;
 if tg_op='UPDATE' and exists(select 1 from public.crm_admins where user_id=old.id) then
  raise exception 'El correo del administrador no puede cambiarse desde el registro.' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('crm-access:'||coalesce(lower(new.email),''),0));
 if not exists(select 1 from public.crm_allowed_emails where email=lower(new.email)) then
  raise exception 'El administrador debe autorizar este correo antes de crear el usuario.' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists crm_signup_approval on auth.users;
create trigger crm_signup_approval before insert or update of email on auth.users
 for each row execute function public.crm_guard_signup();

create or replace function public.crm_admin_users() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.crm_is_admin() then raise exception 'Solo el administrador puede administrar usuarios.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('email',a.email,'approvedAt',a.created_at,
 'registered',u.id is not null,'confirmed',u.email_confirmed_at is not null,
 'admin',exists(select 1 from public.crm_admins ad where ad.user_id=u.id)) order by a.email)
 from public.crm_allowed_emails a left join auth.users u on lower(u.email)=a.email),'[]'::jsonb);
end $$;
create or replace function public.crm_admin_authorize(p_email text,p_allowed boolean) returns void
language plpgsql security definer set search_path='' as $$
declare normalized text:=lower(trim(p_email));
begin
 if not public.crm_is_admin() then raise exception 'Solo el administrador puede autorizar usuarios.' using errcode='42501'; end if;
 if normalized is null or length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_allowed is null then raise exception 'Ingresá un correo válido.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('crm-access:'||normalized,0));
 if exists(select 1 from public.crm_admins ad join auth.users u on u.id=ad.user_id where lower(u.email)=normalized) then
  raise exception 'No se puede revocar ni modificar al administrador.';
 end if;
 if p_allowed then
  insert into public.crm_allowed_emails(email,approved_by) values(normalized,auth.uid()) on conflict do nothing;
 else
  delete from public.crm_allowed_emails where email=normalized;
  delete from public.crm_members where user_id in(select id from auth.users where lower(email)=normalized);
 end if;
 insert into public.crm_access_events(actor,email,action) values(auth.uid(),normalized,case when p_allowed then 'approved' else 'revoked' end);
end $$;
revoke all on function public.crm_is_admin(),public.crm_guard_signup(),public.crm_admin_users(),public.crm_admin_authorize(text,boolean) from public,anon,authenticated;
grant execute on function public.crm_is_admin(),public.crm_admin_users(),public.crm_admin_authorize(text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
