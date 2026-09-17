-- Verificación de instalación, sin leer datos comerciales.
select c.relname as objeto,c.relkind as tipo,c.relrowsecurity as rls
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and (c.relname like 'crm_%' or c.relname in ('cost_categories','monthly_cost_structures','monthly_cost_items'))
and c.relkind in ('r','v') order by c.relname;
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'crm_%' order by proname;
select (select count(*) from public.crm_client_types) as tipos,
 (select count(*) from public.crm_additionals) as adicionales,
 (select last_sequence from public.crm_numbering where id) as ultimo_numero;
