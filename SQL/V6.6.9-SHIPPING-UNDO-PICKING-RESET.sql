-- DESIGN SOCKS V6.6.9 출고취소 후 재피킹 상태 완전 초기화
-- 재고복원은 마지막 출고 이후 내역만 한 번 복원하며 피킹 담당·세션·검증 상태를 모두 해제합니다.
-- 배송비·택배사·송장번호·입금계좌는 변경하지 않습니다.

-- 이미 출고취소된 주문 중 수량은 0인데 피킹 세션만 남은 건을 한 번 정리합니다.
update public.orders
   set picking_session_active = false,
       picking_assigned_to = null,
       picking_assigned_name = null,
       picking_assigned_device = null,
       picking_assigned_at = null,
       picking_scan_increment = 1,
       picking_batch_id = null,
       picking_started_at = null,
       picking_verified_at = null,
       picking_verified_by = null,
       s_outbound_confirmed = false,
       b_outbound_confirmed = false,
       i_outbound_confirmed = false
 where status <> '출고완료'
   and coalesce(picked_qty, 0) = 0
   and coalesce(soldout_qty, 0) = 0
   and coalesce(picking_status, '대기') in ('', '대기')
   and (
     coalesce(picking_session_active, false) = true
     or picking_assigned_to is not null
     or picking_started_at is not null
     or picking_verified_at is not null
   );

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
     set status = '주문접수',
         picked_qty = 0,
         soldout_qty = 0,
         is_soldout = false,
         picking_status = '대기',
         picking_started_at = null,
         picking_verified_at = null,
         picking_verified_by = null,
         picking_batch_id = null,
         picking_session_active = false,
         picking_assigned_to = null,
         picking_assigned_name = null,
         picking_assigned_device = null,
         picking_assigned_at = null,
         picking_scan_increment = 1,
         s_outbound_confirmed = false,
         b_outbound_confirmed = false,
         i_outbound_confirmed = false,
         shipped_at = null
   where order_number = p_order_number;

  return jsonb_build_object(
    'ok', true,
    'order_number', p_order_number,
    'restored_items', v_restored_items,
    'restored_quantity', v_restored_quantity,
    'picking_reset', true,
    'next_status', '주문접수'
  );
end;
$$;

revoke all on function public.undo_completed_order(text, text) from public;
grant execute on function public.undo_completed_order(text, text) to authenticated;

-- 출고취소·삭제 등으로 수량이 없는 이전 세션은 새 피킹 시작 시 자동으로 정리합니다.
-- 실제 피킹수량이 남은 다른 주문은 기존처럼 보호하여 임의 전환되지 않습니다.
create or replace function public.claim_order_picking(
  p_order_number text,
  p_device_name text default '',
  p_force boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_role text;
  v_owner uuid;
  v_owner_name text;
  v_rows integer;
begin
  select coalesce(nullif(trim(business_name),''),nullif(trim(owner_name),''),email,'관리자'),
         coalesce(admin_role,'admin')
    into v_name,v_role
    from public.customers
   where id=v_user and is_admin=true and coalesce(blocked,false)=false;

  if v_name is null then
    raise exception '사용 가능한 관리자·매니저 계정이 아닙니다.';
  end if;

  update public.orders
     set picking_session_active=false,
         picking_assigned_to=null,
         picking_assigned_name=null,
         picking_assigned_device=null,
         picking_assigned_at=null
   where picking_assigned_to=v_user
     and coalesce(picking_session_active,false)=true
     and order_number<>p_order_number
     and (
       status='출고완료'
       or (coalesce(picked_qty,0)=0 and coalesce(soldout_qty,0)=0)
     );

  if exists(
    select 1 from public.orders
     where picking_assigned_to=v_user
       and coalesce(picking_session_active,false)=true
       and order_number<>p_order_number
  ) then
    raise exception '이미 다른 주문을 피킹 중입니다. 현재 작업을 종료한 뒤 시작하세요.';
  end if;

  perform 1 from public.orders where order_number=p_order_number for update;
  if not found then raise exception '피킹할 주문을 찾을 수 없습니다.'; end if;

  select picking_assigned_to,picking_assigned_name
    into v_owner,v_owner_name
    from public.orders
   where order_number=p_order_number and picking_assigned_to is not null
   limit 1;

  if v_owner is not null and v_owner<>v_user and not (p_force and v_role in ('admin','developer_admin')) then
    raise exception '이미 % 계정이 피킹 중입니다.',coalesce(v_owner_name,'다른 관리자');
  end if;

  update public.orders
     set picking_session_active=true,
         picking_assigned_to=v_user,
         picking_assigned_name=v_name,
         picking_assigned_device=left(coalesce(p_device_name,''),200),
         picking_assigned_at=coalesce(picking_assigned_at,now())
   where order_number=p_order_number;

  get diagnostics v_rows=row_count;
  return jsonb_build_object('ok',true,'order_number',p_order_number,
    'assigned_to',v_user,'assigned_name',v_name,'updated_rows',v_rows);
end;
$$;

revoke all on function public.claim_order_picking(text,text,boolean) from public;
grant execute on function public.claim_order_picking(text,text,boolean) to authenticated;
