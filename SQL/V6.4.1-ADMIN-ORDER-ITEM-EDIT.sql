-- V6.4.1 관리자 주문 품목 수정·추가
create or replace function public.admin_save_order_items(
  p_order_number text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean := false;
  v_base public.orders%rowtype;
  v_item jsonb;
  v_id bigint;
  v_item_number text;
  v_warehouse_code text;
  v_qty integer;
  v_price numeric;
  v_saved integer := 0;
begin
  select coalesce(c.is_admin, false)
    into v_admin
    from public.customers c
   where c.id = auth.uid();

  v_admin := coalesce(v_admin, false) or lower(coalesce(auth.jwt()->>'email', '')) in (
    '900smk@naver.com', 'sm0727sm@hanmail.net', 'p1028p@naver.com'
  );

  if not v_admin then
    raise exception '관리자만 주문 품목을 수정할 수 있습니다.';
  end if;

  if p_order_number is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception '저장할 주문 품목이 없습니다.';
  end if;

  select * into v_base
    from public.orders
   where order_number = p_order_number
   order by id
   limit 1
   for update;

  if not found then raise exception '주문을 찾을 수 없습니다.'; end if;
  if v_base.status = '출고완료' then raise exception '출고완료 주문은 품목을 수정할 수 없습니다.'; end if;

  if exists (
    select 1 from public.orders
     where order_number = p_order_number
       and (coalesce(picked_qty, 0) > 0
         or coalesce(soldout_qty, 0) > 0
         or coalesce(is_soldout, false)
         or coalesce(picking_status, '대기') not in ('', '대기'))
  ) then
    raise exception '피킹을 시작한 주문은 피킹 초기화 후 수정해주세요.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_id := nullif(v_item->>'id', '')::bigint;
    v_item_number := btrim(coalesce(v_item->>'item_number', ''));
    v_warehouse_code := nullif(upper(btrim(coalesce(v_item->>'warehouse_code', ''))), '');
    v_qty := greatest(1, coalesce((v_item->>'qty')::integer, 1));
    v_price := greatest(0, coalesce((v_item->>'price')::numeric, 0));
    if v_item_number = '' then raise exception '품번은 비워둘 수 없습니다.'; end if;
    if v_warehouse_code is not null and v_warehouse_code not in ('S','B','I') then
      raise exception '출고지 코드는 S, B, I만 사용할 수 있습니다.';
    end if;

    if v_id is not null then
      update public.orders
         set item_number = v_item_number,
             warehouse_code = v_warehouse_code,
             qty = v_qty,
             price = v_price,
             total = v_qty * v_price
       where id = v_id and order_number = p_order_number;
      if not found then raise exception '수정할 주문 품목을 찾을 수 없습니다.'; end if;
    else
      insert into public.orders (
        order_number, customer_id, customer_name, memo,
        item_number, warehouse_code, qty, price, total,
        status, shipping_fee, courier, tracking_number,
        is_soldout, picking_status, picked_qty, soldout_qty
      ) values (
        v_base.order_number, v_base.customer_id, v_base.customer_name, v_base.memo,
        v_item_number, v_warehouse_code, v_qty, v_price, v_qty * v_price,
        v_base.status, v_base.shipping_fee, v_base.courier, v_base.tracking_number,
        false, '대기', 0, 0
      );
    end if;
    v_saved := v_saved + 1;
  end loop;

  return jsonb_build_object('ok', true, 'saved', v_saved);
end;
$$;

revoke all on function public.admin_save_order_items(text, jsonb) from public;
grant execute on function public.admin_save_order_items(text, jsonb) to authenticated;
