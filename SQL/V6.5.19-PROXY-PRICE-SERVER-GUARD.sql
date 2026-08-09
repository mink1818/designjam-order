begin;

-- 관리자 대신주문은 브라우저가 전달한 가격을 신뢰하지 않고 서버에서 전용단가를 다시 확정합니다.
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
  v_warehouse_code text;v_item_number text;v_item_key text;v_qty integer;v_price integer;v_supplied_price integer;
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
    v_item_key:=regexp_replace(upper(v_item_number),'^[SBI][-_[:space:]]+','');
    begin v_qty:=greatest(1,coalesce((v_item->>'qty')::integer,1));exception when others then v_qty:=1;end;
    begin v_supplied_price:=greatest(0,coalesce((v_item->>'price')::integer,0));exception when others then v_supplied_price:=0;end;
    v_price:=null;

    -- 운영 기준: 정규화된 거래처명 최신단가
    select np.price into v_price from public.customer_name_item_prices np
    where np.normalized_name=public.normalize_customer_price_name(p_customer_name)
      and regexp_replace(upper(trim(np.item_number)),'^[SBI][-_[:space:]]+','')=v_item_key
      and np.price>0
    order by np.updated_at desc nulls last,np.id desc limit 1;

    -- 거래처명 단가가 없는 품번만 가입계정 ID 단가 사용
    if v_price is null and p_customer_id is not null then
      select ip.price into v_price from public.customer_item_prices ip
      where ip.customer_id=p_customer_id
        and regexp_replace(upper(trim(ip.item_number)),'^[SBI][-_[:space:]]+','')=v_item_key
        and ip.price>0
      order by ip.updated_at desc nulls last,ip.id desc limit 1;
    end if;
    v_price:=coalesce(v_price,v_supplied_price);

    v_warehouse_code:=nullif(upper(trim(coalesce(v_item->>'warehouse_code',''))),'');
    if v_warehouse_code is not null and v_warehouse_code not in ('S','B','I') then raise exception '출고지 코드는 S, B, I만 사용할 수 있습니다.';end if;
    insert into public.orders(order_number,customer_id,customer_name,memo,item_number,warehouse_code,qty,price,total,status,shipping_fee,is_soldout)
    values(trim(p_order_number),coalesce(p_customer_id,v_user),trim(p_customer_name),coalesce(p_memo,''),v_item_number,v_warehouse_code,v_qty,v_price,v_qty*v_price,'주문접수',0,false);
    v_count:=v_count+1;
  end loop;
  if v_count=0 then raise exception '저장할 주문 품목이 없습니다.';end if;
  return jsonb_build_object('ok',true,'order_number',p_order_number,'item_count',v_count,'price_source','server_customer_name_first');
end;$$;

grant execute on function public.create_admin_proxy_order(text,uuid,text,text,jsonb) to authenticated;
commit;
