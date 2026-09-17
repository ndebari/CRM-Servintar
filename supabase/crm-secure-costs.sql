-- Ejecutar después de publicar el CRM con autenticación.
begin;
drop policy if exists "Allow public cost category reads" on public.cost_categories;
drop policy if exists "Allow public cost category access" on public.cost_categories;
drop policy if exists "Allow public monthly cost structure access" on public.monthly_cost_structures;
drop policy if exists "Allow public monthly cost item access" on public.monthly_cost_items;
revoke all on public.cost_categories, public.monthly_cost_structures, public.monthly_cost_items from public, anon, authenticated;
grant select on public.cost_categories, public.monthly_cost_structures, public.monthly_cost_items to authenticated;
commit;
