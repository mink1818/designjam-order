-- DESIGN SOCKS V6.5.99 고객 주문번호 충돌 차단 및 갱식이네 기존 출고기록 통합
-- Supabase SQL Editor에서 전체를 한 번 실행하세요.
begin;

-- 구버전 화면에서 초 단위 주문번호를 사용하더라도 서로 다른 고객 주문이
-- 같은 주문번호로 섞이거나 같은 품번이 중복 저장되는 것을 DB에서 차단합니다.
create or replace function public.prevent_customer_order_number_collision()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_customer_id uuid;
begin
  if nullif(trim(coalesce(new.order_number,'')),'') is null then
    raise exception '주문번호가 없습니다.';
  end if;

  -- 같은 주문번호를 동시에 저장하는 요청은 순서대로 검사합니다.
  perform pg_advisory_xact_lock(hashtextextended(new.order_number,0));

  select o.customer_id into v_customer_id
    from public.orders o
   where o.order_number=new.order_number
   order by o.id
   limit 1;

  if found and v_customer_id is distinct from new.customer_id then
    raise exception '주문번호 중복이 감지되어 저장을 중단했습니다. 주문 화면을 새로고침한 후 다시 접수해주세요.';
  end if;

  if exists(
    select 1 from public.orders o
     where o.order_number=new.order_number
       and o.customer_id is not distinct from new.customer_id
       and upper(trim(coalesce(o.item_number,'')))=upper(trim(coalesce(new.item_number,'')))
       and upper(trim(coalesce(o.warehouse_code,'')))=upper(trim(coalesce(new.warehouse_code,'')))
  ) then
    raise exception '동일 주문이 중복 접수되지 않도록 차단했습니다. 주문내역을 확인해주세요.';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_prevent_number_collision on public.orders;
create trigger orders_prevent_number_collision
before insert on public.orders
for each row execute function public.prevent_customer_order_number_collision();

create index if not exists orders_order_number_customer_idx
  on public.orders(order_number,customer_id);

-- 2026-08-13 갱식이네 충돌 주문 중 삭제된 과거 계정에 연결된 실제 출고 3죽을
-- 현재 정상 계정의 동일 주문으로 통합합니다.
-- 주문·피킹·품절·단가·재고수량은 바꾸지 않고 고객 연결만 바로잡습니다.
update public.orders
   set order_number='DJ-20260813-121319',
       customer_id='cddec8f3-15ba-4e78-b660-8f584cfad0b1'::uuid,
       customer_name='갱식이네'
 where order_number in ('DJ-20260813-121319','DJ-20260813-121319-X3-FB7607')
   and customer_id::text='fb7607da-a56e-4182-9b71-4e54ac99ab1e'
;

-- 위 3죽에 대응하는 실제 피킹 출고이력도 현재 정상 계정에 연결합니다.
-- 재고 수량과 이동수량 자체는 변경하지 않습니다.
update public.inventory_movements
   set order_number='DJ-20260813-121319',
       customer_id='cddec8f3-15ba-4e78-b660-8f584cfad0b1',
       customer_name='갱식이네'
 where order_number in ('DJ-20260813-121319','DJ-20260813-121319-X3-FB7607')
   and trim(customer_id::text)='fb7607da-a56e-4182-9b71-4e54ac99ab1e'
   and upper(trim(item_number)) in ('2001','2002','2003')
   and source in ('ORDER_PICKING','ORDER_PICKING_RESET');

commit;

-- 실행 결과 확인
select
  order_number,customer_id,customer_name,
  count(*) as 품번수,
  sum(qty) as 주문수량,
  sum(picked_qty) as 피킹수량,
  sum(soldout_qty) as 품절수량,
  sum((qty-coalesce(soldout_qty,0))*price) as 상품금액
from public.orders
where order_number='DJ-20260813-121319'
group by order_number,customer_id,customer_name
order by order_number;
