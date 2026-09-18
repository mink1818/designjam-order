-- DESIGN SOCKS V6.7.36 관리자 주문수정 단가 확정
-- Supabase SQL Editor에서 전체 실행. 기존 주문이나 기존 단가는 일괄 변경하지 않습니다.
begin;
create or replace function public.admin_save_order_items(p_order_number text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_base public.orders%rowtype;v_item jsonb;v_id bigint;v_item_number text;v_warehouse_code text;
  v_qty integer;v_price numeric;v_inserted_id bigint;v_saved integer:=0;v_before jsonb;v_after jsonb;
begin
  if public.current_admin_role() not in ('admin','developer_admin') then raise exception '관리자만 주문 품목을 수정할 수 있습니다.';end if;
  if p_order_number is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception '저장할 주문 품목이 없습니다.';end if;
  select * into v_base from public.orders where order_number=p_order_number order by id limit 1 for update;
  if not found then raise exception '주문을 찾을 수 없습니다.';end if;
  if v_base.status='출고완료' then raise exception '출고완료 주문은 품목을 수정할 수 없습니다.';end if;
  if exists(select 1 from public.orders where order_number=p_order_number and (coalesce(picked_qty,0)>0 or coalesce(soldout_qty,0)>0 or coalesce(is_soldout,false) or coalesce(picking_status,'대기') not in ('','대기'))) then raise exception '피킹을 시작한 주문은 피킹 초기화 후 수정해주세요.';end if;
  select jsonb_agg(to_jsonb(o) order by o.id) into v_before from public.orders o where o.order_number=p_order_number;
  delete from public.orders o where o.order_number=p_order_number and not exists(select 1 from jsonb_array_elements(p_items) value where nullif(value->>'id','')::bigint=o.id);
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_id:=nullif(v_item->>'id','')::bigint;v_item_number:=btrim(coalesce(v_item->>'item_number',''));v_warehouse_code:=nullif(upper(btrim(coalesce(v_item->>'warehouse_code',''))),'');v_qty:=greatest(1,coalesce((v_item->>'qty')::integer,1));v_price:=greatest(0,coalesce((v_item->>'price')::numeric,0));
    if v_item_number='' then raise exception '품번은 비워둘 수 없습니다.';end if;
    if v_warehouse_code is not null and v_warehouse_code not in ('S','B','I') then raise exception '출고지 코드는 S, B, I만 사용할 수 있습니다.';end if;
    if v_id is not null then
      update public.orders set item_number=v_item_number,warehouse_code=v_warehouse_code,qty=v_qty,price=v_price,total=v_qty*v_price where id=v_id and order_number=p_order_number;
      if not found then raise exception '수정할 주문 품목을 찾을 수 없습니다.';end if;
    else
      insert into public.orders(order_number,customer_id,customer_name,customer_owner_name,delivery_name,delivery_phone,delivery_address,memo,item_number,warehouse_code,qty,price,total,status,shipping_fee,courier,tracking_number,is_soldout,picking_status,picked_qty,soldout_qty)
      values(v_base.order_number,v_base.customer_id,v_base.customer_name,v_base.customer_owner_name,v_base.delivery_name,v_base.delivery_phone,v_base.delivery_address,v_base.memo,v_item_number,v_warehouse_code,v_qty,v_price,v_qty*v_price,v_base.status,v_base.shipping_fee,v_base.courier,v_base.tracking_number,false,'대기',0,0) returning id into v_inserted_id;
      -- INSERT 전용 거래처 단가 트리거가 신규 행의 화면 확정단가를 변경할 수 있습니다.
      -- 관리자 수정에서 입력한 단가를 이 트랜잭션 안에서 최종 확정합니다.
      update public.orders set price=v_price,total=v_qty*v_price where id=v_inserted_id;
    end if;
    if not exists(select 1 from public.orders o where o.id=coalesce(v_id,v_inserted_id) and o.order_number=p_order_number and o.item_number=v_item_number and o.warehouse_code is not distinct from v_warehouse_code and o.qty=v_qty and o.price=v_price and o.total=v_qty*v_price) then raise exception '주문 품목 단가 저장값이 입력값과 다릅니다: %',v_item_number;end if;
    v_saved:=v_saved+1;
  end loop;
  select jsonb_agg(to_jsonb(o) order by o.id) into v_after from public.orders o where o.order_number=p_order_number;
  if v_before is distinct from v_after then insert into public.order_change_history(order_number,customer_id,customer_name,change_reason,before_snapshot,after_snapshot,changed_by) values(p_order_number,v_base.customer_id,v_base.customer_name,'관리자 주문 품목 수정',v_before,v_after,auth.uid());end if;
  return jsonb_build_object('ok',true,'saved',v_saved,'history_saved',v_before is distinct from v_after);
end $$;
revoke all on function public.admin_save_order_items(text,jsonb) from public;
grant execute on function public.admin_save_order_items(text,jsonb) to authenticated;
commit;
