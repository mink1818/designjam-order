-- DESIGN SOCKS V6.5.90 반복 출고취소·재고복원 정상화
-- 이전 출고취소 이후 새로 피킹 출고된 재고만 복원하여 중복 복원을 방지합니다.

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
  v_last_cancel_id bigint := 0;
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

  if not found then raise exception '주문을 찾을 수 없습니다.'; end if;
  if v_order_status <> '출고완료' then
    raise exception '출고완료 상태인 주문만 취소할 수 있습니다.';
  end if;

  select coalesce(max(id), 0) into v_last_cancel_id
    from public.inventory_movements
   where order_number = p_order_number
     and source = 'ORDER_PICKING_CANCEL';

  if not exists (
    select 1 from public.inventory_movements
     where order_number = p_order_number
       and source = 'ORDER_PICKING'
       and movement_type = 'OUT'
       and id > v_last_cancel_id
  ) then
    raise exception '현재 출고건의 피킹 출고이력이 없어 재고를 복원할 수 없습니다.';
  end if;

  for v_move in
    select item_number, sum(quantity)::integer as quantity
      from public.inventory_movements
     where order_number = p_order_number
       and source = 'ORDER_PICKING'
       and movement_type = 'OUT'
       and id > v_last_cancel_id
     group by item_number
  loop
    select * into v_item from public.inventory_items
     where item_number = v_move.item_number for update;
    if not found then raise exception '재고 품목을 찾을 수 없습니다: %', v_move.item_number; end if;

    v_before := v_item.quantity;
    v_after := v_before + v_move.quantity;
    update public.inventory_items
       set quantity = v_after, updated_at = now(), updated_by = auth.uid()
     where item_number = v_item.item_number;

    insert into public.inventory_movements(
      item_number, movement_type, quantity, quantity_before, quantity_after,
      source, order_number, customer_id, customer_name, note, device_name, created_by
    ) values (
      v_item.item_number, 'IN', v_move.quantity, v_before, v_after,
      'ORDER_PICKING_CANCEL', p_order_number, v_customer_id, v_customer_name,
      '출고완료 취소로 재고 자동복원', coalesce(p_device_name, ''), auth.uid()
    );
    v_restored_items := v_restored_items + 1;
    v_restored_quantity := v_restored_quantity + v_move.quantity;
  end loop;

  update public.orders
     set status = '주문접수', picked_qty = 0, soldout_qty = 0, is_soldout = false,
         picking_status = '대기', picking_started_at = null,
         picking_verified_at = null, picking_verified_by = null, shipped_at = null
   where order_number = p_order_number;

  return jsonb_build_object('ok', true, 'order_number', p_order_number,
    'restored_items', v_restored_items, 'restored_quantity', v_restored_quantity,
    'next_status', '주문접수');
end;
$$;

revoke all on function public.undo_completed_order(text, text) from public;
grant execute on function public.undo_completed_order(text, text) to authenticated;

-- 주문접수·피킹 시작 전 주문삭제를 삭제이력에 보관하며 허용합니다.
create or replace function public.delete_order_and_restore_inventory(
  p_order_number text,
  p_device_name text default '관리자 주문접수건 삭제'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_customer uuid;
  v_name text;
  v_deleted integer := 0;
begin
  if not public.is_inventory_admin() then raise exception '관리자만 주문을 삭제할 수 있습니다.'; end if;
  perform 1 from public.orders where order_number = p_order_number for update;
  if not found then raise exception '삭제할 주문을 찾을 수 없습니다.'; end if;
  if exists (
    select 1 from public.orders where order_number = p_order_number and
      (status <> '주문접수' or coalesce(picked_qty,0) > 0 or coalesce(soldout_qty,0) > 0
       or coalesce(is_soldout,false) or coalesce(picking_status,'대기') not in ('','대기'))
  ) then raise exception '피킹을 시작한 주문은 삭제할 수 없습니다.'; end if;

  select jsonb_agg(to_jsonb(o) order by o.id)
    into v_rows from public.orders o where order_number = p_order_number;
  select customer_id, customer_name into v_customer, v_name
    from public.orders where order_number = p_order_number limit 1;
  if v_rows is null then raise exception '삭제할 주문을 찾을 수 없습니다.'; end if;

  insert into public.deleted_order_history(
    order_number, customer_id, customer_name, deleted_by, deleted_by_role, delete_reason, order_snapshot
  ) values (
    p_order_number, v_customer, v_name, auth.uid(), '관리자',
    coalesce(nullif(trim(p_device_name),''),'관리자 주문접수건 삭제'), v_rows
  );
  delete from public.orders where order_number = p_order_number;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('ok',true,'order_number',p_order_number,'deleted_rows',v_deleted,'archived',true);
end;
$$;

revoke all on function public.delete_order_and_restore_inventory(text,text) from public;
grant execute on function public.delete_order_and_restore_inventory(text,text) to authenticated;
