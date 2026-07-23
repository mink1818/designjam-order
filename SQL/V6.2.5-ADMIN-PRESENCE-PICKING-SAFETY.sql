-- DESIGN SOCKS V6.2.5
-- 관리자 로그인 기록·실시간 접속 / 피킹대기 수량 / 안전재고 일괄 수정

alter table public.customers
  add column if not exists last_login_at timestamptz null,
  add column if not exists last_seen_at timestamptz null,
  add column if not exists login_count integer not null default 0;

create table if not exists public.admin_login_events (
  id bigint generated always as identity primary key,
  admin_id uuid not null references public.customers(id) on delete cascade,
  logged_in_at timestamptz not null default now()
);

create index if not exists admin_login_events_admin_logged_idx
  on public.admin_login_events(admin_id, logged_in_at desc);
create index if not exists admin_login_events_logged_idx
  on public.admin_login_events(logged_in_at desc);

alter table public.admin_login_events enable row level security;

drop policy if exists admin_login_events_admin_select on public.admin_login_events;
create policy admin_login_events_admin_select
  on public.admin_login_events
  for select to authenticated
  using (public.is_inventory_admin());

create or replace function public.record_admin_login()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_inventory_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  update public.customers
     set last_login_at = now(),
         last_seen_at = now(),
         login_count = coalesce(login_count, 0) + 1
   where id = auth.uid()
     and coalesce(is_admin, false) = true
     and coalesce(blocked, false) = false;

  if not found then
    raise exception '사용 가능한 관리자 계정을 찾을 수 없습니다.';
  end if;

  insert into public.admin_login_events(admin_id) values (auth.uid());
end;
$$;

grant execute on function public.record_admin_login() to authenticated;

create or replace function public.touch_admin_presence()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_inventory_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  update public.customers
     set last_seen_at = now()
   where id = auth.uid()
     and coalesce(is_admin, false) = true
     and coalesce(blocked, false) = false;
end;
$$;

grant execute on function public.touch_admin_presence() to authenticated;

create or replace function public.bulk_update_inventory_safety_stock(
  p_item_numbers text[],
  p_safety_stock integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_inventory_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if p_safety_stock is null or p_safety_stock < 0 then
    raise exception '안전재고는 0 이상이어야 합니다.';
  end if;

  if p_item_numbers is null then
    update public.inventory_items
       set safety_stock = p_safety_stock,
           updated_at = now(),
           updated_by = auth.uid();
  elsif coalesce(array_length(p_item_numbers, 1), 0) = 0 then
    return 0;
  else
    update public.inventory_items
       set safety_stock = p_safety_stock,
           updated_at = now(),
           updated_by = auth.uid()
     where item_number = any(p_item_numbers);
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.bulk_update_inventory_safety_stock(text[], integer)
  to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.customers;
  exception
    when duplicate_object then null;
  end;
end
$$;
