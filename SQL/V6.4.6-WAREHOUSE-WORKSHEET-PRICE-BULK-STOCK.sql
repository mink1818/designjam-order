-- DESIGN SOCKS V6.4.6
-- S/B/I 출고지, 관리자 대신주문 출고지 저장, 출고지별 재고 일괄수정

alter table public.inventory_items
  add column if not exists warehouse_code text;

create index if not exists inventory_items_warehouse_code_idx
  on public.inventory_items(warehouse_code, item_number);

-- 관리자 대신주문에도 상품의 S/B/I 출고지를 저장합니다.
create or replace function public.create_admin_proxy_order(
  p_order_number text,
  p_customer_id uuid,
  p_customer_name text,
  p_memo text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean := false;
  v_item jsonb;
  v_count integer := 0;
  v_warehouse_code text;
begin
  select coalesce(is_admin,false) and not coalesce(blocked,false)
    into v_is_admin
  from public.customers
  where id = v_user;

  if not coalesce(v_is_admin,false) then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if nullif(trim(p_order_number),'') is null then raise exception '주문번호가 없습니다.'; end if;
  if nullif(trim(p_customer_name),'') is null then raise exception '거래처명이 없습니다.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception '주문 품목이 없습니다.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if nullif(trim(v_item->>'item_number'),'') is null then continue; end if;
    v_warehouse_code := nullif(upper(trim(coalesce(v_item->>'warehouse_code',''))),'');
    if v_warehouse_code is not null and v_warehouse_code not in ('S','B','I') then
      raise exception '출고지 코드는 S, B, I만 사용할 수 있습니다.';
    end if;

    insert into public.orders(
      order_number, customer_id, customer_name, memo,
      item_number, warehouse_code, qty, price, total,
      status, shipping_fee, is_soldout
    ) values (
      trim(p_order_number), coalesce(p_customer_id,v_user), trim(p_customer_name), coalesce(p_memo,''),
      trim(v_item->>'item_number'), v_warehouse_code,
      greatest(1,coalesce((v_item->>'qty')::integer,1)),
      greatest(0,coalesce((v_item->>'price')::numeric,0)),
      greatest(0,coalesce((v_item->>'total')::numeric,0)),
      '주문접수',0,false
    );
    v_count := v_count + 1;
  end loop;

  if v_count=0 then raise exception '저장할 주문 품목이 없습니다.'; end if;
  return jsonb_build_object('ok',true,'order_number',p_order_number,'item_count',v_count);
end;
$$;

grant execute on function public.create_admin_proxy_order(text,uuid,text,text,jsonb) to authenticated;

-- 선택한 출고지에서 화면으로 수정한 품번만 한 번에 저장하고 품번별 이력을 남깁니다.
create or replace function public.bulk_adjust_inventory_items(
  p_warehouse_code text,
  p_items jsonb,
  p_note text,
  p_device_name text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_warehouse_code,'')));
  v_item public.inventory_items%rowtype;
  v_change jsonb;
  v_item_number text;
  v_new_quantity integer;
  v_changed integer := 0;
  v_matched integer := 0;
  v_difference integer;
begin
  if not public.is_inventory_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;
  if v_code not in ('S','B','I') then
    raise exception '출고지는 S, B, I 중 하나여야 합니다.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception '변경할 품번이 없습니다.';
  end if;
  if length(trim(coalesce(p_note,''))) < 1 then
    raise exception '일괄수정 사유를 입력하세요.';
  end if;

  for v_change in select * from jsonb_array_elements(p_items)
  loop
    v_item_number := trim(coalesce(v_change->>'item_number',''));
    if v_item_number = '' then raise exception '품번이 없는 변경 항목이 있습니다.'; end if;
    begin
      v_new_quantity := (v_change->>'new_quantity')::integer;
    exception when others then
      raise exception '품번 %의 재고 수량이 올바르지 않습니다.', v_item_number;
    end;
    if v_new_quantity is null or v_new_quantity < 0 then
      raise exception '품번 %의 재고 수량은 0 이상이어야 합니다.', v_item_number;
    end if;

    select * into v_item
      from public.inventory_items
     where item_number = v_item_number
       and upper(coalesce(warehouse_code,'')) = v_code
     for update;
    if not found then
      raise exception '품번 %는 % 출고지 재고에 없습니다.', v_item_number, v_code;
    end if;

    v_matched := v_matched + 1;
    if v_item.quantity = v_new_quantity then continue; end if;
    v_difference := abs(v_new_quantity - v_item.quantity);

    update public.inventory_items
       set quantity = v_new_quantity,
           updated_at = now(),
           updated_by = auth.uid()
     where item_number = v_item.item_number;

    insert into public.inventory_movements(
      item_number,movement_type,quantity,quantity_before,quantity_after,
      source,note,device_name,created_by
    ) values (
      v_item.item_number,'ADJUST',greatest(v_difference,1),v_item.quantity,v_new_quantity,
      'WAREHOUSE_BULK',v_code || ' 출고지 일괄수정: ' || trim(p_note),
      coalesce(p_device_name,''),auth.uid()
    );
    v_changed := v_changed + 1;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'warehouse_code',v_code,
    'matched_count',v_matched,
    'changed_count',v_changed
  );
end;
$$;

revoke all on function public.bulk_adjust_inventory_items(text,jsonb,text,text) from public;
grant execute on function public.bulk_adjust_inventory_items(text,jsonb,text,text) to authenticated;
