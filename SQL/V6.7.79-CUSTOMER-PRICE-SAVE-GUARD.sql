-- DESIGN SOCKS V6.7.79 거래처 전용단가 저장 이중검증
-- Supabase SQL Editor에서 전체 실행하세요.
-- 과거 주문은 UPDATE하지 않습니다. 이 SQL 실행 이후의 신규 주문/신규·변경 품번만 보호합니다.

begin;

create or replace function public.resolve_customer_order_price(
  p_customer_id uuid,
  p_customer_name text,
  p_item_number text
) returns numeric
language plpgsql stable security definer set search_path=public as $$
declare
  v_price numeric;
  v_item text:=regexp_replace(upper(trim(coalesce(p_item_number,''))),'^[SBI][-_[:space:]]*','','i');
begin
  if nullif(v_item,'') is null then return null;end if;

  -- 거래처명 전용단가를 먼저 적용한다. 관리자 대신주문의 미가입/직접입력 거래처도 보호한다.
  if nullif(trim(coalesce(p_customer_name,'')),'') is not null then
    select p.price into v_price
    from public.customer_name_item_prices p
    where p.normalized_name=public.normalize_customer_price_name(p_customer_name)
      and regexp_replace(upper(trim(p.item_number)),'^[SBI][-_[:space:]]*','','i')=v_item
      and p.price>0
    order by p.updated_at desc nulls last,p.id desc limit 1;
  end if;

  if v_price is null and p_customer_id is not null then
    select p.price into v_price
    from public.customer_item_prices p
    where p.customer_id=p_customer_id
      and regexp_replace(upper(trim(p.item_number)),'^[SBI][-_[:space:]]*','','i')=v_item
      and p.price>0
    order by p.updated_at desc nulls last,p.id desc limit 1;
  end if;
  return v_price;
end $$;

revoke all on function public.resolve_customer_order_price(uuid,text,text) from public;
grant execute on function public.resolve_customer_order_price(uuid,text,text) to authenticated;

-- 일반 거래처 주문은 브라우저 가격과 무관하게 저장 직전에 DB 전용단가를 다시 확인한다.
create or replace function public.apply_customer_item_price_to_order()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_price numeric;v_item text;
begin
  if new.customer_id is null then return new;end if;
  if upper(coalesce(new.order_number,'')) like 'ADMIN-%'
     or position('[관리자 대신주문]' in coalesce(new.memo,''))>0 then
    new.price:=greatest(0,coalesce(new.price,0));
    new.total:=greatest(0,coalesce(new.qty,0))*new.price;
    return new;
  end if;
  v_item:=regexp_replace(upper(trim(new.item_number)),'^[SBI][-_[:space:]]*','','i');
  v_price:=public.resolve_customer_order_price(new.customer_id,new.customer_name,new.item_number);
  if v_price is not null then
    new.price:=case when v_item in ('8881','8882') then v_price/10.0 else v_price end;
    new.total:=greatest(0,coalesce(new.qty,0))*new.price;
  end if;
  return new;
end $$;

drop trigger if exists orders_apply_customer_item_price on public.orders;
create trigger orders_apply_customer_item_price before insert on public.orders
for each row execute function public.apply_customer_item_price_to_order();

-- 관리자 대신주문: 수기단가는 보존하고 자동단가는 DB에서 다시 확인한다.
create or replace function public.create_admin_proxy_order(
  p_order_number text,p_customer_id uuid,p_customer_name text,p_memo text,p_items jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_user uuid:=auth.uid();v_is_admin boolean:=false;v_item jsonb;v_count integer:=0;
  v_warehouse_code text;v_item_number text;v_normalized_item text;v_qty integer;v_price numeric;
  v_special_price numeric;v_saved_price numeric;v_customer_id uuid;v_price_manual boolean;
  v_pack_size integer;v_pack_qty numeric;v_pack_price numeric;
begin
  select coalesce(is_admin,false) and not coalesce(blocked,false) into v_is_admin from public.customers where id=v_user;
  if not coalesce(v_is_admin,false) then raise exception '관리자 권한이 필요합니다.';end if;
  if nullif(trim(p_order_number),'') is null then raise exception '주문번호가 없습니다.';end if;
  if nullif(trim(p_customer_name),'') is null then raise exception '거래처명이 없습니다.';end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception '주문 품목이 없습니다.';end if;
  v_customer_id:=public.proxy_customer_identity(p_customer_id,p_customer_name);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_number:=trim(coalesce(v_item->>'item_number',''));if v_item_number='' then continue;end if;
    v_normalized_item:=regexp_replace(upper(v_item_number),'^[SBI][-_[:space:]]*','','i');
    begin v_qty:=greatest(1,coalesce((v_item->>'qty')::integer,1));exception when others then v_qty:=1;end;
    begin v_price:=greatest(0,coalesce((v_item->>'price')::numeric,0));exception when others then v_price:=0;end;
    begin v_price_manual:=coalesce((v_item->>'price_manual')::boolean,false);exception when others then v_price_manual:=false;end;
    if not v_price_manual then
      v_special_price:=public.resolve_customer_order_price(p_customer_id,p_customer_name,v_item_number);
      if v_special_price is not null then
        v_price:=case when v_normalized_item in ('8881','8882') then v_special_price/10.0 else v_special_price end;
      end if;
    end if;
    if v_price<=0 then raise exception '품번 %의 확정단가가 올바르지 않습니다.',v_item_number;end if;
    v_warehouse_code:=nullif(upper(trim(coalesce(v_item->>'warehouse_code',''))),'');
    if v_warehouse_code is not null and v_warehouse_code not in ('S','B','I') then raise exception '출고지 코드는 S, B, I만 사용할 수 있습니다.';end if;
    v_pack_size:=nullif(v_item->>'sales_pack_size','')::integer;
    v_pack_qty:=nullif(v_item->>'sales_pack_qty','')::numeric;
    v_pack_price:=nullif(v_item->>'sales_pack_price','')::numeric;
    if v_normalized_item in ('8881','8882') then
      v_pack_size:=10;v_pack_qty:=coalesce(v_pack_qty,v_qty/10.0);v_pack_price:=v_price*10;
    end if;
    insert into public.orders(order_number,customer_id,customer_name,memo,item_number,warehouse_code,qty,price,total,status,shipping_fee,is_soldout,sales_pack_size,sales_pack_qty,sales_pack_price)
    values(trim(p_order_number),v_customer_id,trim(p_customer_name),coalesce(p_memo,''),v_item_number,v_warehouse_code,v_qty,v_price,v_qty*v_price,'주문접수',0,false,v_pack_size,v_pack_qty,v_pack_price)
    returning price into v_saved_price;
    if v_saved_price is distinct from v_price then raise exception '품번 % 단가 저장 검증 실패: 확정 %, 저장 %',v_item_number,v_price,v_saved_price;end if;
    v_count:=v_count+1;
  end loop;
  if v_count=0 then raise exception '저장할 주문 품목이 없습니다.';end if;
  return jsonb_build_object('ok',true,'order_number',p_order_number,'item_count',v_count,'price_guard','server_verified');
end $$;
revoke all on function public.create_admin_proxy_order(text,uuid,text,text,jsonb) from public;
grant execute on function public.create_admin_proxy_order(text,uuid,text,text,jsonb) to authenticated;

-- 관리자 주문수정: 기존 행의 과거 확정단가는 유지한다.
-- 새 행 또는 품번이 바뀐 행만 전용단가를 재검증하며, 명시적인 수기단가는 그대로 저장한다.
create or replace function public.admin_save_order_items(p_order_number text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_base public.orders%rowtype;v_item jsonb;v_id bigint;v_item_number text;v_old_item_number text;v_warehouse_code text;
  v_qty integer;v_price numeric;v_special_price numeric;v_inserted_id bigint;v_saved integer:=0;v_before jsonb;v_after jsonb;
  v_pack_size integer;v_pack_qty numeric;v_pack_price numeric;v_normalized_item text;v_price_manual boolean;v_item_changed boolean;
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
    v_id:=nullif(v_item->>'id','')::bigint;v_item_number:=btrim(coalesce(v_item->>'item_number',''));
    v_warehouse_code:=nullif(upper(btrim(coalesce(v_item->>'warehouse_code',''))),'');v_qty:=greatest(1,coalesce((v_item->>'qty')::integer,1));v_price:=greatest(0,coalesce((v_item->>'price')::numeric,0));
    begin v_price_manual:=coalesce((v_item->>'price_manual')::boolean,false);exception when others then v_price_manual:=false;end;
    v_pack_size:=nullif(v_item->>'sales_pack_size','')::integer;v_pack_qty:=nullif(v_item->>'sales_pack_qty','')::numeric;v_pack_price:=nullif(v_item->>'sales_pack_price','')::numeric;
    v_normalized_item:=regexp_replace(upper(v_item_number),'^[SBI][-_[:space:]]*','','i');
    if v_item_number='' then raise exception '품번은 비워둘 수 없습니다.';end if;
    if v_warehouse_code is not null and v_warehouse_code not in ('S','B','I') then raise exception '출고지 코드는 S, B, I만 사용할 수 있습니다.';end if;

    v_old_item_number:=null;v_item_changed:=v_id is null;
    if v_id is not null then
      select item_number into v_old_item_number from public.orders where id=v_id and order_number=p_order_number;
      if not found then raise exception '수정할 주문 품목을 찾을 수 없습니다.';end if;
      v_item_changed:=regexp_replace(upper(trim(v_old_item_number)),'^[SBI][-_[:space:]]*','','i')<>v_normalized_item;
    end if;
    if v_item_changed and not v_price_manual then
      v_special_price:=public.resolve_customer_order_price(v_base.customer_id,v_base.customer_name,v_item_number);
      if v_special_price is not null then v_price:=case when v_normalized_item in ('8881','8882') then v_special_price/10.0 else v_special_price end;end if;
    end if;
    if v_normalized_item in ('8881','8882') then v_pack_size:=10;v_pack_qty:=coalesce(v_pack_qty,v_qty/10.0);v_pack_price:=v_price*10;end if;

    if v_id is not null then
      update public.orders set item_number=v_item_number,warehouse_code=v_warehouse_code,qty=v_qty,price=v_price,total=v_qty*v_price,sales_pack_size=v_pack_size,sales_pack_qty=v_pack_qty,sales_pack_price=v_pack_price where id=v_id and order_number=p_order_number;
    else
      insert into public.orders(order_number,customer_id,customer_name,customer_owner_name,delivery_name,delivery_phone,delivery_address,memo,item_number,warehouse_code,qty,price,total,status,shipping_fee,courier,tracking_number,is_soldout,picking_status,picked_qty,soldout_qty,sales_pack_size,sales_pack_qty,sales_pack_price)
      values(v_base.order_number,v_base.customer_id,v_base.customer_name,v_base.customer_owner_name,v_base.delivery_name,v_base.delivery_phone,v_base.delivery_address,v_base.memo,v_item_number,v_warehouse_code,v_qty,v_price,v_qty*v_price,v_base.status,v_base.shipping_fee,v_base.courier,v_base.tracking_number,false,'대기',0,0,v_pack_size,v_pack_qty,v_pack_price) returning id into v_inserted_id;
      -- ADMIN 주문 삽입 트리거는 화면가격을 보존하므로 위에서 검증한 가격을 그대로 확정한다.
      update public.orders set price=v_price,total=v_qty*v_price,sales_pack_size=v_pack_size,sales_pack_qty=v_pack_qty,sales_pack_price=v_pack_price where id=v_inserted_id;
    end if;
    if not exists(select 1 from public.orders o where o.id=coalesce(v_id,v_inserted_id) and o.order_number=p_order_number and o.item_number=v_item_number and o.warehouse_code is not distinct from v_warehouse_code and o.qty=v_qty and o.price=v_price and o.total=v_qty*v_price) then raise exception '주문 품목 단가 저장값이 확정값과 다릅니다: %',v_item_number;end if;
    v_saved:=v_saved+1;
  end loop;
  select jsonb_agg(to_jsonb(o) order by o.id) into v_after from public.orders o where o.order_number=p_order_number;
  if v_before is distinct from v_after then insert into public.order_change_history(order_number,customer_id,customer_name,change_reason,before_snapshot,after_snapshot,changed_by) values(p_order_number,v_base.customer_id,v_base.customer_name,'관리자 주문 품목 수정',v_before,v_after,auth.uid());end if;
  return jsonb_build_object('ok',true,'saved',v_saved,'history_saved',v_before is distinct from v_after,'price_guard','server_verified');
end $$;
revoke all on function public.admin_save_order_items(text,jsonb) from public;
grant execute on function public.admin_save_order_items(text,jsonb) to authenticated;

commit;

-- 적용 확인(조회만 수행)
-- select public.resolve_customer_order_price(c.id,c.business_name,'853') expected_price
-- from public.customers c where c.business_name='임호선' limit 1;
