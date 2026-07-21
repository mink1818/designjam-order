-- DESIGN SOCKS V6.1.1 총품번 전체조회·거래처 출고이력·피킹 최종검증
alter table public.inventory_movements add column if not exists customer_id text null;
alter table public.inventory_movements add column if not exists customer_name text not null default '';
alter table public.orders add column if not exists picked_qty integer not null default 0 check (picked_qty >= 0);
alter table public.orders add column if not exists picking_status text not null default '대기';
alter table public.orders add column if not exists picking_started_at timestamptz null;
alter table public.orders add column if not exists picking_verified_at timestamptz null;
alter table public.orders add column if not exists picking_verified_by uuid null references auth.users(id);

drop function if exists public.apply_inventory_scan(text,text,integer,text,text);
create or replace function public.apply_inventory_scan(p_item_number text,p_mode text,p_increment integer default 1,p_device_name text default '',p_order_number text default null,p_customer_name text default '') returns public.inventory_items language plpgsql security definer set search_path=public as $$
declare v_item public.inventory_items;v_before integer;v_after integer;v_mode text:=upper(trim(p_mode));begin
 if not public.is_inventory_admin() then raise exception '관리자 권한이 필요합니다.';end if;
 if p_increment is null or p_increment<1 or p_increment>1000 then raise exception '증감 수량은 1~1000 사이여야 합니다.';end if;
 if v_mode not in('IN','OUT') then raise exception '입고(IN) 또는 출고(OUT) 모드만 가능합니다.';end if;
 select * into v_item from public.inventory_items where item_number=trim(p_item_number) or barcode=trim(p_item_number) for update;
 if not found then raise exception '미등록 품번: %',p_item_number;end if;
 v_before:=v_item.quantity;v_after:=case when v_mode='IN' then v_before+p_increment else v_before-p_increment end;
 if v_after<0 then raise exception '재고 부족: 현재 %, 요청 %',v_before,p_increment;end if;
 update public.inventory_items set quantity=v_after,updated_at=now(),updated_by=auth.uid() where item_number=v_item.item_number returning * into v_item;
 insert into public.inventory_movements(item_number,movement_type,quantity,quantity_before,quantity_after,source,order_number,customer_name,device_name,created_by) values(v_item.item_number,v_mode,p_increment,v_before,v_after,'SCANNER',nullif(trim(p_order_number),''),case when v_mode='OUT' then trim(coalesce(p_customer_name,'')) else '' end,coalesce(p_device_name,''),auth.uid());
 return v_item;end;$$;
grant execute on function public.apply_inventory_scan(text,text,integer,text,text,text) to authenticated;

create or replace function public.complete_order_picking(p_order_number text,p_device_name text default '피킹검증') returns jsonb language plpgsql security definer set search_path=public as $$
declare v_customer_id text;v_customer_name text;v_bad integer;v_row record;v_item public.inventory_items;v_before integer;v_after integer;begin
 if not public.is_inventory_admin() then raise exception '관리자 권한이 필요합니다.';end if;
 select count(*) into v_bad from public.orders where order_number=p_order_number and coalesce(is_soldout,false)=false and coalesce(picked_qty,0)<>coalesce(qty,0);
 if v_bad>0 then raise exception '피킹수량 불일치 품목이 %개 있습니다.',v_bad;end if;
 select customer_id::text,coalesce(customer_name,'거래처 미입력') into v_customer_id,v_customer_name from public.orders where order_number=p_order_number limit 1;
 if not found then raise exception '주문을 찾을 수 없습니다: %',p_order_number;end if;
 for v_row in select item_number,sum(qty)::integer as qty from public.orders where order_number=p_order_number and coalesce(is_soldout,false)=false group by item_number loop
  select * into v_item from public.inventory_items where item_number=trim(v_row.item_number) or barcode=trim(v_row.item_number) for update;
  if not found then raise exception '재고 미등록 품번: %',v_row.item_number;end if;
  v_before:=v_item.quantity;v_after:=v_before-v_row.qty;if v_after<0 then raise exception '재고 부족: % 현재 %, 출고 %',v_row.item_number,v_before,v_row.qty;end if;
  update public.inventory_items set quantity=v_after,updated_at=now(),updated_by=auth.uid() where item_number=v_item.item_number;
  insert into public.inventory_movements(item_number,movement_type,quantity,quantity_before,quantity_after,source,order_number,customer_id,customer_name,device_name,created_by) values(v_item.item_number,'OUT',v_row.qty,v_before,v_after,'ORDER_PICKING',p_order_number,v_customer_id,v_customer_name,coalesce(p_device_name,''),auth.uid());
 end loop;
 update public.orders set status='출고완료',picking_status='검증완료',picking_verified_at=now(),picking_verified_by=auth.uid() where order_number=p_order_number;
 return jsonb_build_object('ok',true,'order_number',p_order_number,'customer_name',v_customer_name);end;$$;
grant execute on function public.complete_order_picking(text,text) to authenticated;
create index if not exists inventory_movements_customer_created_idx on public.inventory_movements(customer_name,created_at desc);
create index if not exists orders_picking_status_idx on public.orders(picking_status,created_at desc);
