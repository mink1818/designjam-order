-- DESIGN SOCKS V6.5.23 관리자 대신주문 확정단가 스냅샷
-- Supabase SQL Editor에서 전체 실행하세요.
-- 대신주문 화면에서 관리자가 확인한 품번별 가격을 그대로 orders.price에 확정 저장합니다.

begin;

-- 일반 거래처 주문은 기존 전용단가를 서버에서 적용합니다.
-- 관리자 대신주문(ADMIN-)은 전용단가를 이미 화면에서 검증했으므로 전달받은 확정가격을 보존합니다.
create or replace function public.apply_customer_item_price_to_order()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_price integer; v_name text; v_item text;
begin
  if new.customer_id is null then return new; end if;
  if upper(coalesce(new.order_number,'')) like 'ADMIN-%'
     or position('[관리자 대신주문]' in coalesce(new.memo,''))>0 then
    new.price:=greatest(0,coalesce(new.price,0));
    new.total:=greatest(0,coalesce(new.qty,0))*new.price;
    return new;
  end if;
  v_item:=regexp_replace(upper(trim(new.item_number)),'^[SBI][-_[:space:]]+','');
  select business_name into v_name from public.customers where id=new.customer_id;
  select p.price into v_price from public.customer_name_item_prices p
   where p.normalized_name=public.normalize_customer_price_name(v_name)
     and regexp_replace(upper(trim(p.item_number)),'^[SBI][-_[:space:]]+','')=v_item
     and p.price>0
   order by p.updated_at desc nulls last,p.id desc limit 1;
  if not found then
    select p.price into v_price from public.customer_item_prices p
     where p.customer_id=new.customer_id
       and regexp_replace(upper(trim(p.item_number)),'^[SBI][-_[:space:]]+','')=v_item
       and p.price>0
     order by p.updated_at desc nulls last,p.id desc limit 1;
  end if;
  if v_price is not null then new.price:=v_price;new.total:=greatest(0,coalesce(new.qty,0))*v_price;end if;
  return new;
end;$$;

drop trigger if exists orders_apply_customer_item_price on public.orders;
create trigger orders_apply_customer_item_price before insert on public.orders
for each row execute function public.apply_customer_item_price_to_order();

-- 관리자만 실행할 수 있으므로, 화면에서 최종 확인된 가격을 주문 확정가격으로 저장합니다.
create or replace function public.create_admin_proxy_order(
  p_order_number text,
  p_customer_id uuid,
  p_customer_name text,
  p_memo text,
  p_items jsonb
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_user uuid:=auth.uid();v_is_admin boolean:=false;v_item jsonb;v_count integer:=0;
  v_warehouse_code text;v_item_number text;v_qty integer;v_price integer;v_saved_price integer;
begin
  select coalesce(is_admin,false) and not coalesce(blocked,false) into v_is_admin
  from public.customers where id=v_user;
  if not coalesce(v_is_admin,false) then raise exception '관리자 권한이 필요합니다.';end if;
  if nullif(trim(p_order_number),'') is null then raise exception '주문번호가 없습니다.';end if;
  if nullif(trim(p_customer_name),'') is null then raise exception '거래처명이 없습니다.';end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception '주문 품목이 없습니다.';end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_number:=trim(coalesce(v_item->>'item_number',''));if v_item_number='' then continue;end if;
    begin v_qty:=greatest(1,coalesce((v_item->>'qty')::integer,1));exception when others then v_qty:=1;end;
    begin v_price:=greatest(0,coalesce((v_item->>'price')::integer,0));exception when others then v_price:=0;end;
    if v_price<=0 then raise exception '품번 %의 확정단가가 올바르지 않습니다.',v_item_number;end if;
    v_warehouse_code:=nullif(upper(trim(coalesce(v_item->>'warehouse_code',''))),'');
    if v_warehouse_code is not null and v_warehouse_code not in ('S','B','I') then raise exception '출고지 코드는 S, B, I만 사용할 수 있습니다.';end if;
    insert into public.orders(order_number,customer_id,customer_name,memo,item_number,warehouse_code,qty,price,total,status,shipping_fee,is_soldout)
    values(trim(p_order_number),coalesce(p_customer_id,v_user),trim(p_customer_name),coalesce(p_memo,''),v_item_number,v_warehouse_code,v_qty,v_price,v_qty*v_price,'주문접수',0,false)
    returning price into v_saved_price;
    if v_saved_price is distinct from v_price then
      raise exception '품번 % 단가 저장 검증 실패: 화면 %, 저장 %',v_item_number,v_price,v_saved_price;
    end if;
    v_count:=v_count+1;
  end loop;
  if v_count=0 then raise exception '저장할 주문 품목이 없습니다.';end if;
  return jsonb_build_object('ok',true,'order_number',p_order_number,'item_count',v_count,'price_source','confirmed_proxy_screen_snapshot');
end;$$;

grant execute on function public.create_admin_proxy_order(text,uuid,text,text,jsonb) to authenticated;

-- V6.5.22의 피킹/출고 가격보호 트리거도 다시 확실히 설치합니다.
create or replace function public.protect_order_price_during_fulfillment()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_fulfillment_changed boolean;
begin
  v_fulfillment_changed :=
       new.picked_qty is distinct from old.picked_qty
    or new.soldout_qty is distinct from old.soldout_qty
    or new.is_soldout is distinct from old.is_soldout
    or new.picking_status is distinct from old.picking_status
    or new.picking_started_at is distinct from old.picking_started_at
    or new.picking_verified_at is distinct from old.picking_verified_at
    or new.picking_verified_by is distinct from old.picking_verified_by
    or new.picking_batch_id is distinct from old.picking_batch_id
    or new.status is distinct from old.status;
  if v_fulfillment_changed then new.price:=old.price;new.total:=old.total;end if;
  return new;
end;$$;

drop trigger if exists orders_protect_fulfillment_price on public.orders;
create trigger orders_protect_fulfillment_price before update on public.orders
for each row execute function public.protect_order_price_during_fulfillment();

commit;

-- 적용 후 새 대신주문 확인 예시:
-- select order_number,customer_name,item_number,qty,price,total,picking_status,status
-- from public.orders where order_number='ADMIN-실제주문번호' order by id;
