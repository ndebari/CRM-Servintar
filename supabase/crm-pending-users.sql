-- Aplicar después de crm-client-access.sql.
-- El registro crea una cuenta, nunca una autorización ni una membresía.
begin;
create or replace function public.crm_guard_signup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then return new; end if;
 if new.email is not distinct from old.email then return new; end if;
 if exists(select 1 from public.crm_admins where user_id=old.id) then
  raise exception 'El correo del administrador no puede cambiarse desde el registro.';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('crm-access:'||coalesce(lower(new.email),''),0));
 if not exists(select 1 from public.crm_allowed_emails where email=lower(new.email)) then
  raise exception 'El administrador debe autorizar este correo antes de cambiarlo.' using errcode='42501';
 end if;
 return new;
end $$;

create or replace function public.crm_admin_users() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform public.crm_require_admin();
 return coalesce((select jsonb_agg(jsonb_build_object(
  'email',coalesce(a.email,lower(u.email)),
  'approved',a.email is not null,'approvedAt',a.created_at,
  'registered',u.id is not null,'confirmed',u.email_confirmed_at is not null,
  'clientIds',coalesce((select jsonb_agg(ac.client_id order by ac.client_id)
    from public.crm_user_clients ac where ac.email=a.email),'[]'::jsonb),
  'admin',exists(select 1 from public.crm_admins ad where ad.user_id=u.id))
  order by (a.email is not null),coalesce(a.email,lower(u.email)))
 from public.crm_allowed_emails a full join auth.users u on lower(u.email)=a.email
 where coalesce(a.email,lower(u.email)) is not null),'[]'::jsonb);
end $$;
revoke all on function public.crm_guard_signup(),public.crm_admin_users() from public,anon,authenticated;
grant execute on function public.crm_admin_users() to authenticated;
notify pgrst,'reload schema';
commit;
