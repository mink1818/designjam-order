-- DESIGN SOCKS V6.7.94
-- 주문 거래처명과 customer_id가 다른 거래처를 가리킬 때 타 거래처 전용단가 사용 차단
-- 기존 주문 및 기존 단가 자료는 수정하지 않습니다.

begin;

create or replace function public.resolve_customer_order_price(
  p_customer_id uuid,
  p_customer_name text,
  p_item_number text
) returns numeric
language plpgsql stable security definer set search_path=public as $$
declare
  v_price numeric;
  v_item text:=public.normalize_customer_price_item(p_item_number);
  v_linked_name text;
  v_identity_matches boolean:=false;
begin
  if nullif(v_item,'') is null then return null;end if;

  -- 주문에 실제 저장된 거래처명 단가를 가장 먼저 사용합니다.
  select p.price into v_price
  from public.customer_name_item_prices p
  where p.normalized_name=public.normalize_customer_price_name(p_customer_name)
    and public.normalize_customer_price_item(p.item_number)=v_item
    and p.price>0
  order by case when upper(trim(p.item_number))=v_item then 0 else 1 end,
           p.updated_at desc nulls last,p.id desc
  limit 1;
  if v_price is not null then return v_price;end if;

  -- customer_id 단가는 그 ID의 현재 거래처명과 주문 거래처명이 같은 경우에만 허용합니다.
  if p_customer_id is not null then
    select c.business_name into v_linked_name from public.customers c where c.id=p_customer_id;
    v_identity_matches:=public.normalize_customer_price_name(v_linked_name)=public.normalize_customer_price_name(p_customer_name);
  end if;
  if not v_identity_matches then return null;end if;

  select p.price into v_price
  from public.customer_item_prices p
  where p.customer_id=p_customer_id
    and public.normalize_customer_price_item(p.item_number)=v_item
    and p.price>0
  order by case when upper(trim(p.item_number))=v_item then 0 else 1 end,
           p.updated_at desc nulls last,p.id desc
  limit 1;
  return v_price;
end $$;

revoke all on function public.resolve_customer_order_price(uuid,text,text) from public;
grant execute on function public.resolve_customer_order_price(uuid,text,text) to authenticated;

commit;

-- 운영 데이터 진단용(조회만 수행)
-- 주문 거래처명과 customer_id의 실제 거래처명이 다른 주문을 확인합니다.
-- select o.order_number,o.customer_name,c.business_name linked_business_name,o.customer_id
-- from public.orders o join public.customers c on c.id=o.customer_id
-- where public.normalize_customer_price_name(o.customer_name)<>public.normalize_customer_price_name(c.business_name)
-- order by o.created_at desc;
