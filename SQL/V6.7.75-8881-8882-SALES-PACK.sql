-- DESIGN SOCKS V6.7.75 / 8881·8882 10개 묶음 판매단위
-- Supabase SQL Editor에서 전체 실행합니다.
-- 중요: 기존 주문을 UPDATE하지 않습니다. 아래 열은 새 주문의 판매단위 스냅샷만 보관합니다.
begin;

alter table public.orders add column if not exists sales_pack_size integer;
alter table public.orders add column if not exists sales_pack_qty numeric;
alter table public.orders add column if not exists sales_pack_price numeric;

comment on column public.orders.sales_pack_size is '주문 당시 판매묶음 크기. 8881/8882 신규 주문은 10';
comment on column public.orders.sales_pack_qty is '화면에서 입력한 묶음 주문수량';
comment on column public.orders.sales_pack_price is '주문 당시 1묶음 판매가격';

create or replace function public.mark_8881_8882_sales_pack()
returns trigger language plpgsql set search_path=public as $$
begin
  if regexp_replace(upper(coalesce(new.item_number,'')),'^[SBI][-_[:space:]]*','','i') in ('8881','8882') then
    if tg_op='INSERT' or new.qty is distinct from old.qty or new.price is distinct from old.price or new.item_number is distinct from old.item_number then
      new.sales_pack_size:=10;
      new.sales_pack_qty:=coalesce(new.sales_pack_qty,new.qty/10.0);
      new.sales_pack_price:=coalesce(new.sales_pack_price,new.price*10);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_mark_8881_8882_sales_pack on public.orders;
create trigger trg_mark_8881_8882_sales_pack before insert or update of item_number,qty,price on public.orders for each row execute function public.mark_8881_8882_sales_pack();

-- 엑셀의 기본/거래처별 단가는 묶음가격 10,000원으로 유지합니다.
-- 주문 스냅샷에 넣을 때만 8881/8882 전용단가를 10으로 나누어 개당 단가로 저장합니다.
create or replace function public.apply_customer_item_price_to_order()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_price numeric; v_name text; v_item text;
begin
  if new.customer_id is null then return new; end if;
  v_item:=regexp_replace(upper(trim(new.item_number)),'^[SBI][-_[:space:]]+','');
  if upper(coalesce(new.order_number,'')) like 'ADMIN-%'
     or position('[관리자 대신주문]' in coalesce(new.memo,''))>0 then
    new.price:=greatest(0,coalesce(new.price,0));new.total:=greatest(0,coalesce(new.qty,0))*new.price;return new;
  end if;
  select business_name into v_name from public.customers where id=new.customer_id;
  select p.price into v_price from public.customer_name_item_prices p
   where p.normalized_name=public.normalize_customer_price_name(v_name)
     and regexp_replace(upper(trim(p.item_number)),'^[SBI][-_[:space:]]+','')=v_item and p.price>0
   order by p.updated_at desc nulls last,p.id desc limit 1;
  if not found then
    select p.price into v_price from public.customer_item_prices p
     where p.customer_id=new.customer_id
       and regexp_replace(upper(trim(p.item_number)),'^[SBI][-_[:space:]]+','')=v_item and p.price>0
     order by p.updated_at desc nulls last,p.id desc limit 1;
  end if;
  if v_price is not null then
    new.price:=case when v_item in ('8881','8882') then v_price/10.0 else v_price end;
    new.total:=greatest(0,coalesce(new.qty,0))*new.price;
  end if;
  return new;
end $$;

drop trigger if exists orders_apply_customer_item_price on public.orders;
create trigger orders_apply_customer_item_price before insert on public.orders
for each row execute function public.apply_customer_item_price_to_order();

create or replace function public.admin_save_order_items(p_order_number text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_base public.orders%rowtype;v_item jsonb;v_id bigint;v_item_number text;v_warehouse_code text;
  v_qty integer;v_price numeric;v_inserted_id bigint;v_saved integer:=0;v_before jsonb;v_after jsonb;
  v_pack_size integer;v_pack_qty numeric;v_pack_price numeric;
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
    v_pack_size:=nullif(v_item->>'sales_pack_size','')::integer;v_pack_qty:=nullif(v_item->>'sales_pack_qty','')::numeric;v_pack_price:=nullif(v_item->>'sales_pack_price','')::numeric;
    if regexp_replace(upper(v_item_number),'^[SBI][-_[:space:]]*','','i') in ('8881','8882') then
      v_pack_size:=10;v_pack_qty:=coalesce(v_pack_qty,v_qty/10.0);v_pack_price:=coalesce(v_pack_price,v_price*10);
    end if;
    if v_item_number='' then raise exception '품번은 비워둘 수 없습니다.';end if;
    if v_warehouse_code is not null and v_warehouse_code not in ('S','B','I') then raise exception '출고지 코드는 S, B, I만 사용할 수 있습니다.';end if;
    if v_id is not null then
      update public.orders set item_number=v_item_number,warehouse_code=v_warehouse_code,qty=v_qty,price=v_price,total=v_qty*v_price,sales_pack_size=v_pack_size,sales_pack_qty=v_pack_qty,sales_pack_price=v_pack_price where id=v_id and order_number=p_order_number;
      if not found then raise exception '수정할 주문 품목을 찾을 수 없습니다.';end if;
    else
      insert into public.orders(order_number,customer_id,customer_name,customer_owner_name,delivery_name,delivery_phone,delivery_address,memo,item_number,warehouse_code,qty,price,total,status,shipping_fee,courier,tracking_number,is_soldout,picking_status,picked_qty,soldout_qty,sales_pack_size,sales_pack_qty,sales_pack_price)
      values(v_base.order_number,v_base.customer_id,v_base.customer_name,v_base.customer_owner_name,v_base.delivery_name,v_base.delivery_phone,v_base.delivery_address,v_base.memo,v_item_number,v_warehouse_code,v_qty,v_price,v_qty*v_price,v_base.status,v_base.shipping_fee,v_base.courier,v_base.tracking_number,false,'대기',0,0,v_pack_size,v_pack_qty,v_pack_price) returning id into v_inserted_id;
      update public.orders set price=v_price,total=v_qty*v_price,sales_pack_size=v_pack_size,sales_pack_qty=v_pack_qty,sales_pack_price=v_pack_price where id=v_inserted_id;
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

-- 검증(조회만 수행): 과거 주문은 바뀌지 않았고, 신규 주문에만 스냅샷이 기록됩니다.
-- select item_number,qty,price,total,sales_pack_size,sales_pack_qty,sales_pack_price
-- from public.orders where regexp_replace(upper(item_number),'^[SBI][-_[:space:]]*','','i') in ('8881','8882')
-- order by id desc limit 30;
