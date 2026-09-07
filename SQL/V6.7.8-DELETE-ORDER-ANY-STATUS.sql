-- DESIGN SOCKS V6.7.8
-- 관리자 주문관리에서 주문접수·피킹중·출고대기·출고완료 주문을 안전하게 삭제합니다.
-- 피킹 검증으로 실제 차감된 재고만 복원하고 삭제 전 원본은 deleted_order_history에 보관합니다.

begin;

create or replace function public.admin_delete_order_any_status(
  p_order_number text,
  p_device_name text default '관리자 주문 전체삭제'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_customer uuid;
  v_name text;
  v_status text;
  v_last_cancel_id bigint := 0;
  v_move record;
  v_item public.inventory_items;
  v_before integer;
  v_after integer;
  v_restored_items integer := 0;
  v_restored_quantity integer := 0;
  v_deleted integer := 0;
begin
  if not public.is_inventory_admin() then
    raise exception '관리자만 주문을 삭제할 수 있습니다.';
  end if;

  perform 1 from public.orders where order_number = p_order_number for update;
  if not found then raise exception '삭제할 주문을 찾을 수 없습니다.'; end if;

  select jsonb_agg(to_jsonb(o) order by o.id)
    into v_snapshot
    from public.orders o
   where o.order_number = p_order_number;

  select customer_id, coalesce(customer_name,'거래처 미입력'), coalesce(status,'주문접수')
    into v_customer, v_name, v_status
    from public.orders
   where order_number = p_order_number
   limit 1;

  select coalesce(max(id),0)
    into v_last_cancel_id
    from public.inventory_movements
   where order_number = p_order_number
     and source = 'ORDER_PICKING_CANCEL';

  for v_move in
    select item_number, sum(quantity)::integer as quantity
      from public.inventory_movements
     where order_number = p_order_number
       and source = 'ORDER_PICKING'
       and movement_type = 'OUT'
       and id > v_last_cancel_id
     group by item_number
  loop
    select * into v_item
      from public.inventory_items
     where item_number = v_move.item_number
     for update;
    if not found then
      raise exception '재고 복원 품목을 찾을 수 없습니다: %', v_move.item_number;
    end if;

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
      'ORDER_PICKING_CANCEL', p_order_number, v_customer::text, v_name,
      '주문 전체삭제로 재고 자동복원', coalesce(p_device_name,''), auth.uid()
    );
    v_restored_items := v_restored_items + 1;
    v_restored_quantity := v_restored_quantity + v_move.quantity;
  end loop;

  insert into public.deleted_order_history(
    order_number, customer_id, customer_name, deleted_by, deleted_by_role,
    delete_reason, order_snapshot
  ) values (
    p_order_number, v_customer, v_name, auth.uid(), '관리자',
    coalesce(nullif(trim(p_device_name),''),'관리자 주문 전체삭제') || ' · 삭제 전 상태 ' || v_status,
    v_snapshot
  );

  delete from public.orders where order_number = p_order_number;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'ok', true,
    'order_number', p_order_number,
    'deleted_rows', v_deleted,
    'restored_items', v_restored_items,
    'restored_quantity', v_restored_quantity,
    'archived', true
  );
end;
$$;

revoke all on function public.admin_delete_order_any_status(text,text) from public;
grant execute on function public.admin_delete_order_any_status(text,text) to authenticated;

commit;

select 'V6.7.8 모든 주문상태 안전삭제 적용 완료' as result;
