-- V6.6.63 관리자 공용 신규주문 알림
-- 한 명의 관리자가 확인하면 모든 관리자 화면에서 동시에 사라집니다.
create table if not exists public.admin_new_order_alerts (
  order_number text primary key,
  customer_name text,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  acknowledged_by_name text
);
alter table public.admin_new_order_alerts enable row level security;

drop policy if exists "admins can read new order alerts" on public.admin_new_order_alerts;
create policy "admins can read new order alerts" on public.admin_new_order_alerts for select to authenticated using (public.is_admin_user());
drop policy if exists "admins can update new order alerts" on public.admin_new_order_alerts;
create policy "admins can update new order alerts" on public.admin_new_order_alerts for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());

create or replace function public.capture_admin_new_order_alert() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.admin_new_order_alerts(order_number,customer_name,created_at)
  values(new.order_number,new.customer_name,coalesce(new.created_at,now()))
  on conflict(order_number) do nothing;
  return new;
end;$$;

drop trigger if exists trg_admin_new_order_alert on public.orders;
create trigger trg_admin_new_order_alert after insert on public.orders for each row execute function public.capture_admin_new_order_alert();

-- SQL 적용 시점 이전 주문은 팝업 대상에서 제외합니다.
-- Realtime 사용을 위해 테이블 publication 등록(이미 등록되어 있으면 무시)
do $$ begin
  alter publication supabase_realtime add table public.admin_new_order_alerts;
exception when duplicate_object then null; end $$;
