-- DESIGN SOCKS V6.3.3 안전한 출고완료 취소
-- 출고완료 주문을 주문접수로 되돌릴 때 원래 피킹 출고량을 재고에 복원하고,
-- 원본 OUT 이력은 보존한 채 별도의 IN 취소 이력을 기록합니다.

create or replace function public.undo_completed_order(
  p_order_number text,
  p_device_name text default '주문관리 출고취소'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_status text;
  v_customer_id text;
  v_customer_name text;
  v_move record;
  v_item public.inventory_items;
  v_before integer;
  v_after integer;
  v_restored_items integer := 0;
  v_restored_quantity integer := 0;
begin
  if not public.is_inventory_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  select status, customer_id::text, coalesce(customer_name, '거래처 미입력')
    into v_order_status, v_customer_id, v_customer_name
    from public.orders
   where order_number = p_order_number
   limit 1
   for update;

  if not found then
    raise exception '주문을 찾을 수 없습니다.';
  end if;
  if v_order_status <> '출고완료' then
    raise exception '출고완료 상태인 주문만 취소할 수 있습니다.';
  end if;

  if exists (
    select 1 from public.inventory_movements
     where order_number = p_order_number
       and source = 'ORDER_PICKING_CANCEL'
  ) then
    raise exception '이미 출고취소 및 재고복원이 완료된 주문입니다.';
  end if;

  if not exists (
    select 1 from public.inventory_movements
     where order_number = p_order_number
       and source = 'ORDER_PICKING'
       and movement_type = 'OUT'
  ) then
    raise exception '원래 피킹 출고이력이 없어 재고를 자동 복원할 수 없습니다.';
  end if;

  for v_move in
    select item_number, sum(quantity)::integer as quantity
      from public.inventory_movements
     where order_number = p_order_number
       and source = 'ORDER_PICKING'
       and movement_type = 'OUT'
     group by item_number
  loop
    select * into v_item
      from public.inventory_items
     where item_number = v_move.item_number
     for update;

    if not found then
      raise exception '재고 품목을 찾을 수 없습니다: %', v_move.item_number;
    end if;

    v_before := v_item.quantity;
    v_after := v_before + v_move.quantity;

    update public.inventory_items
       set quantity = v_after,
           updated_at = now(),
           updated_by = auth.uid()
     where item_number = v_item.item_number;

    insert into public.inventory_movements(
      item_number, movement_type, quantity, quantity_before, quantity_after,
      source, order_number, customer_id, customer_name, note,
      device_name, created_by
    ) values (
      v_item.item_number, 'IN', v_move.quantity, v_before, v_after,
      'ORDER_PICKING_CANCEL', p_order_number, v_customer_id, v_customer_name,
      '출고완료 취소로 재고 자동복원', coalesce(p_device_name, ''), auth.uid()
    );

    v_restored_items := v_restored_items + 1;
    v_restored_quantity := v_restored_quantity + v_move.quantity;
  end loop;

  update public.orders
     set status = '주문접수',
         picked_qty = 0,
         soldout_qty = 0,
         is_soldout = false,
         picking_status = '대기',
         picking_started_at = null,
         picking_verified_at = null,
         picking_verified_by = null
   where order_number = p_order_number;

  return jsonb_build_object(
    'ok', true,
    'order_number', p_order_number,
    'restored_items', v_restored_items,
    'restored_quantity', v_restored_quantity,
    'next_status', '주문접수'
  );
end;
$$;

revoke all on function public.undo_completed_order(text, text) from public;
grant execute on function public.undo_completed_order(text, text) to authenticated;
