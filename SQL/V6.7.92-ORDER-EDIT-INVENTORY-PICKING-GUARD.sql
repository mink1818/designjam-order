-- DESIGN SOCKS V6.7.92
-- 관리자 주문수정 품번의 ERP 재고 연결 검증 + 피킹 품번 표기 정규화
begin;

create or replace function public.complete_order_picking(p_order_number text,p_device_name text default '피킹검증') returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_customer_id text;v_customer_name text;v_bad integer;v_row record;v_item public.inventory_items;v_before integer;v_after integer;v_already integer;v_batch uuid:=gen_random_uuid();v_key text;
begin
 if not public.is_inventory_admin() then raise exception '관리자 권한이 필요합니다.';end if;
 perform 1 from public.orders where order_number=p_order_number for update;
 select count(*) into v_bad from public.orders where order_number=p_order_number and coalesce(picked_qty,0)+coalesce(soldout_qty,0)<>coalesce(qty,0);
 if v_bad>0 then raise exception '피킹+품절 수량 불일치 품목이 %개 있습니다.',v_bad;end if;
 select count(*) into v_already from public.orders where order_number=p_order_number and coalesce(picking_status,'') in ('검증완료','부분품절 검증완료');
 if v_already>0 then raise exception '이미 피킹 최종검증이 완료된 주문입니다.';end if;
 select customer_id::text,coalesce(customer_name,'거래처 미입력') into v_customer_id,v_customer_name from public.orders where order_number=p_order_number limit 1;
 if not found then raise exception '주문을 찾을 수 없습니다.';end if;
 for v_row in select item_number,upper(nullif(trim(warehouse_code),'')) warehouse_code,sum(coalesce(picked_qty,0))::integer qty from public.orders where order_number=p_order_number group by item_number,upper(nullif(trim(warehouse_code),'')) loop
  if v_row.qty<=0 then continue;end if;
  v_key:=regexp_replace(upper(trim(v_row.item_number)),'^[SBI][-_[:space:]]+','','i');
  select i.* into v_item from public.inventory_items i
   where (regexp_replace(upper(trim(i.item_number)),'^[SBI][-_[:space:]]+','','i')=v_key
      or regexp_replace(upper(trim(coalesce(i.barcode,''))),'^[SBI][-_[:space:]]+','','i')=v_key)
     and (v_row.warehouse_code is null or nullif(upper(trim(i.warehouse_code)),'') is null or upper(trim(i.warehouse_code))=v_row.warehouse_code)
   order by (upper(trim(i.item_number))=upper(trim(v_row.item_number))) desc,
            (upper(trim(coalesce(i.warehouse_code,'')))=coalesce(v_row.warehouse_code,'')) desc,
            i.item_number limit 1 for update;
  if not found then raise exception '재고 미등록 품번: % (ERP 재고센터에서 상품 품번 동기화를 실행하세요.)',v_row.item_number;end if;
  v_before:=v_item.quantity;v_after:=v_before-v_row.qty;
  if v_after<0 then raise exception '재고 부족: % 현재 %, 출고 %',v_item.item_number,v_before,v_row.qty;end if;
  update public.inventory_items set quantity=v_after,updated_at=now(),updated_by=auth.uid() where item_number=v_item.item_number;
  insert into public.inventory_movements(item_number,movement_type,quantity,quantity_before,quantity_after,source,order_number,customer_id,customer_name,device_name,created_by,picking_batch_id)
  values(v_item.item_number,'OUT',v_row.qty,v_before,v_after,'ORDER_PICKING',p_order_number,v_customer_id,v_customer_name,coalesce(p_device_name,''),auth.uid(),v_batch);
 end loop;
 update public.orders set status='주문접수',picking_status=case when soldout_qty>0 then '부분품절 검증완료' else '검증완료' end,picking_verified_at=now(),picking_verified_by=auth.uid(),is_soldout=(soldout_qty>=qty),picking_batch_id=v_batch where order_number=p_order_number;
 return jsonb_build_object('ok',true,'order_number',p_order_number,'customer_name',v_customer_name,'next_status','출고대기','picking_batch_id',v_batch);
end;$$;
revoke all on function public.complete_order_picking(text,text) from public;
grant execute on function public.complete_order_picking(text,text) to authenticated;

-- 주문수정 서버 저장 전에도 재고품번 연결을 검증합니다. 오류가 나면 전체 트랜잭션이 롤백되어 기존 주문이 유지됩니다.
create or replace function public.admin_save_order_items(p_order_number text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_base public.orders%rowtype;v_item jsonb;v_id bigint;v_item_number text;v_old_item_number text;v_warehouse_code text;
  v_qty integer;v_price numeric;v_special_price numeric;v_inserted_id bigint;v_saved integer:=0;v_before jsonb;v_after jsonb;
  v_pack_size integer;v_pack_qty numeric;v_pack_price numeric;v_normalized_item text;v_price_manual boolean;v_item_changed boolean;v_inventory_exists boolean;
begin
  if public.current_admin_role() not in ('admin','developer_admin') then raise exception '관리자만 주문 품목을 수정할 수 있습니다.';end if;
  if p_order_number is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception '저장할 주문 품목이 없습니다.';end if;
  select * into v_base from public.orders where order_number=p_order_number order by id limit 1 for update;
  if not found then raise exception '주문을 찾을 수 없습니다.';end if;
  if v_base.status='출고완료' then raise exception '출고완료 주문은 품목을 수정할 수 없습니다.';end if;
  if exists(select 1 from public.orders where order_number=p_order_number and (coalesce(picked_qty,0)>0 or coalesce(soldout_qty,0)>0 or coalesce(is_soldout,false) or coalesce(picking_status,'대기') not in ('','대기'))) then raise exception '피킹을 시작한 주문은 피킹 초기화 후 수정해주세요.';end if;
  select jsonb_agg(to_jsonb(o) order by o.id) into v_before from public.orders o where o.order_number=p_order_number;

  -- 삭제/수정 전에 모든 입력 품번을 먼저 검사하여 중간 상태가 생기지 않게 합니다.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_item_number:=btrim(coalesce(v_item->>'item_number',''));v_warehouse_code:=nullif(upper(btrim(coalesce(v_item->>'warehouse_code',''))),'');
    v_normalized_item:=regexp_replace(upper(v_item_number),'^[SBI][-_[:space:]]+','','i');
    select exists(select 1 from public.inventory_items i where
      (regexp_replace(upper(trim(i.item_number)),'^[SBI][-_[:space:]]+','','i')=v_normalized_item or regexp_replace(upper(trim(coalesce(i.barcode,''))),'^[SBI][-_[:space:]]+','','i')=v_normalized_item)
      and (v_warehouse_code is null or nullif(upper(trim(i.warehouse_code)),'') is null or upper(trim(i.warehouse_code))=v_warehouse_code)) into v_inventory_exists;
    if not v_inventory_exists then raise exception 'ERP 재고 미등록 품번: %-% (ERP 재고센터에서 상품 품번 동기화를 먼저 실행하세요.)',coalesce(v_warehouse_code,'?'),v_item_number;end if;
  end loop;

  delete from public.orders o where o.order_number=p_order_number and not exists(select 1 from jsonb_array_elements(p_items) value where nullif(value->>'id','')::bigint=o.id);
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_id:=nullif(v_item->>'id','')::bigint;v_item_number:=btrim(coalesce(v_item->>'item_number',''));
    v_warehouse_code:=nullif(upper(btrim(coalesce(v_item->>'warehouse_code',''))),'');v_qty:=greatest(1,coalesce((v_item->>'qty')::integer,1));v_price:=greatest(0,coalesce((v_item->>'price')::numeric,0));
    begin v_price_manual:=coalesce((v_item->>'price_manual')::boolean,false);exception when others then v_price_manual:=false;end;
    v_pack_size:=nullif(v_item->>'sales_pack_size','')::integer;v_pack_qty:=nullif(v_item->>'sales_pack_qty','')::numeric;v_pack_price:=nullif(v_item->>'sales_pack_price','')::numeric;
    v_normalized_item:=regexp_replace(upper(v_item_number),'^[SBI][-_[:space:]]+','','i');
    if v_item_number='' then raise exception '품번은 비워둘 수 없습니다.';end if;
    if v_warehouse_code is not null and v_warehouse_code not in ('S','B','I') then raise exception '출고지 코드는 S, B, I만 사용할 수 있습니다.';end if;
    v_old_item_number:=null;v_item_changed:=v_id is null;
    if v_id is not null then select item_number into v_old_item_number from public.orders where id=v_id and order_number=p_order_number;if not found then raise exception '수정할 주문 품목을 찾을 수 없습니다.';end if;v_item_changed:=regexp_replace(upper(trim(v_old_item_number)),'^[SBI][-_[:space:]]+','','i')<>v_normalized_item;end if;
    if v_item_changed and not v_price_manual then v_special_price:=public.resolve_customer_order_price(v_base.customer_id,v_base.customer_name,v_item_number);if v_special_price is not null then v_price:=case when v_normalized_item in ('8881','8882') then v_special_price/10.0 else v_special_price end;end if;end if;
    if v_normalized_item in ('8881','8882') then v_pack_size:=10;v_pack_qty:=coalesce(v_pack_qty,v_qty/10.0);v_pack_price:=v_price*10;end if;
    if v_id is not null then update public.orders set item_number=v_item_number,warehouse_code=v_warehouse_code,qty=v_qty,price=v_price,total=v_qty*v_price,sales_pack_size=v_pack_size,sales_pack_qty=v_pack_qty,sales_pack_price=v_pack_price where id=v_id and order_number=p_order_number;
    else insert into public.orders(order_number,customer_id,customer_name,customer_owner_name,delivery_name,delivery_phone,delivery_address,memo,item_number,warehouse_code,qty,price,total,status,shipping_fee,courier,tracking_number,is_soldout,picking_status,picked_qty,soldout_qty,sales_pack_size,sales_pack_qty,sales_pack_price) values(v_base.order_number,v_base.customer_id,v_base.customer_name,v_base.customer_owner_name,v_base.delivery_name,v_base.delivery_phone,v_base.delivery_address,v_base.memo,v_item_number,v_warehouse_code,v_qty,v_price,v_qty*v_price,v_base.status,v_base.shipping_fee,v_base.courier,v_base.tracking_number,false,'대기',0,0,v_pack_size,v_pack_qty,v_pack_price) returning id into v_inserted_id;update public.orders set price=v_price,total=v_qty*v_price,sales_pack_size=v_pack_size,sales_pack_qty=v_pack_qty,sales_pack_price=v_pack_price where id=v_inserted_id;end if;
    if not exists(select 1 from public.orders o where o.id=coalesce(v_id,v_inserted_id) and o.order_number=p_order_number and o.item_number=v_item_number and o.warehouse_code is not distinct from v_warehouse_code and o.qty=v_qty and o.price=v_price and o.total=v_qty*v_price) then raise exception '주문 품목 단가 저장값이 확정값과 다릅니다: %',v_item_number;end if;
    v_saved:=v_saved+1;
  end loop;
  select jsonb_agg(to_jsonb(o) order by o.id) into v_after from public.orders o where o.order_number=p_order_number;
  if v_before is distinct from v_after then insert into public.order_change_history(order_number,customer_id,customer_name,change_reason,before_snapshot,after_snapshot,changed_by) values(p_order_number,v_base.customer_id,v_base.customer_name,'관리자 주문 품목 수정',v_before,v_after,auth.uid());end if;
  return jsonb_build_object('ok',true,'saved',v_saved,'history_saved',v_before is distinct from v_after,'inventory_guard','server_verified');
end $$;
revoke all on function public.admin_save_order_items(text,jsonb) from public;
grant execute on function public.admin_save_order_items(text,jsonb) to authenticated;

commit;
