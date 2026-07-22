-- DESIGN SOCKS V6.1.6 피킹검증과 출고완료 분리
-- 피킹 최종검증 시 재고만 차감하고 주문 상태는 주문접수로 유지합니다.
-- 실제 출고완료는 주문관리에서 송장/배송정보 확인 후 처리합니다.
create or replace function public.complete_order_picking(p_order_number text,p_device_name text default '피킹검증') returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_customer_id text;v_customer_name text;v_bad integer;v_row record;v_item public.inventory_items;v_before integer;v_after integer;v_already integer;
begin
 if not public.is_inventory_admin() then raise exception '관리자 권한이 필요합니다.';end if;
 select count(*) into v_bad from public.orders where order_number=p_order_number and coalesce(picked_qty,0)+coalesce(soldout_qty,0)<>coalesce(qty,0);
 if v_bad>0 then raise exception '피킹+품절 수량 불일치 품목이 %개 있습니다.',v_bad;end if;
 select count(*) into v_already from public.orders where order_number=p_order_number and coalesce(picking_status,'') in ('검증완료','부분품절 검증완료');
 if v_already>0 then raise exception '이미 피킹 최종검증이 완료된 주문입니다.';end if;
 select customer_id::text,coalesce(customer_name,'거래처 미입력') into v_customer_id,v_customer_name from public.orders where order_number=p_order_number limit 1;
 if not found then raise exception '주문을 찾을 수 없습니다.';end if;
 for v_row in select item_number,sum(coalesce(picked_qty,0))::integer as qty from public.orders where order_number=p_order_number group by item_number loop
  if v_row.qty<=0 then continue;end if;
  select * into v_item from inventory_items where item_number=trim(v_row.item_number) or barcode=trim(v_row.item_number) for update;
  if not found then raise exception '재고 미등록 품번: %',v_row.item_number;end if;
  v_before:=v_item.quantity;v_after:=v_before-v_row.qty;
  if v_after<0 then raise exception '재고 부족: % 현재 %, 출고 %',v_row.item_number,v_before,v_row.qty;end if;
  update inventory_items set quantity=v_after,updated_at=now(),updated_by=auth.uid() where item_number=v_item.item_number;
  insert into inventory_movements(item_number,movement_type,quantity,quantity_before,quantity_after,source,order_number,customer_id,customer_name,device_name,created_by)
  values(v_item.item_number,'OUT',v_row.qty,v_before,v_after,'ORDER_PICKING',p_order_number,v_customer_id,v_customer_name,coalesce(p_device_name,''),auth.uid());
 end loop;
 update orders set status='주문접수',picking_status=case when soldout_qty>0 then '부분품절 검증완료' else '검증완료' end,picking_verified_at=now(),picking_verified_by=auth.uid(),is_soldout=(soldout_qty>=qty) where order_number=p_order_number;
 return jsonb_build_object('ok',true,'order_number',p_order_number,'customer_name',v_customer_name,'next_status','출고대기');
end;$$;
grant execute on function public.complete_order_picking(text,text) to authenticated;
