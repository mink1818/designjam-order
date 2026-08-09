begin;

alter table public.orders
  add column if not exists s_outbound_confirmed boolean not null default false,
  add column if not exists b_outbound_confirmed boolean not null default false,
  add column if not exists i_outbound_confirmed boolean not null default false,
  add column if not exists picking_scan_increment integer not null default 1,
  add column if not exists picking_session_active boolean not null default false;

alter table public.orders
  drop constraint if exists orders_picking_scan_increment_check;

alter table public.orders
  add constraint orders_picking_scan_increment_check
  check (picking_scan_increment in (1, 10));

comment on column public.orders.picking_scan_increment is '주문별 공유 바코드 1회 스캔수량: 1 또는 10';
comment on column public.orders.picking_session_active is '여러 기기에서 공유하는 피킹 시작 상태';

create index if not exists idx_orders_live_picking_reservation
  on public.orders(item_number, status, picking_status)
  where picked_qty > 0;

create or replace function public.delete_order_and_restore_inventory(
  p_order_number text,
  p_device_name text default '주문 전체삭제'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reset jsonb := '{}'::jsonb;
  v_deleted integer := 0;
begin
  if not public.is_inventory_admin() then
    raise exception '관리자만 주문 전체삭제를 할 수 있습니다.';
  end if;
  if not exists (select 1 from public.orders where order_number = p_order_number) then
    raise exception '삭제할 주문을 찾을 수 없습니다: %', p_order_number;
  end if;
  select public.reset_order_picking(p_order_number, p_device_name) into v_reset;
  delete from public.orders where order_number = p_order_number;
  get diagnostics v_deleted = row_count;
  return coalesce(v_reset, '{}'::jsonb) || jsonb_build_object('order_number',p_order_number,'deleted_rows',v_deleted);
end;
$$;

revoke all on function public.delete_order_and_restore_inventory(text, text) from public;
grant execute on function public.delete_order_and_restore_inventory(text, text) to authenticated;

commit;
