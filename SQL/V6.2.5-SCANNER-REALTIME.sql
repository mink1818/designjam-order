-- DESIGN SOCKS V6.2.5 백그라운드 스캐너 실시간 반영 보강
-- Supabase SQL Editor에서 한 번 실행하세요.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inventory_items'
  ) then
    alter publication supabase_realtime add table public.inventory_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inventory_movements'
  ) then
    alter publication supabase_realtime add table public.inventory_movements;
  end if;
end
$$;
