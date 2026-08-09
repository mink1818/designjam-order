-- DESIGN SOCKS V6.5.22 주문 확정단가 보호
-- Supabase SQL Editor에서 전체 실행하세요.
-- 주문 접수 시 저장된 orders.price는 피킹/품절/검증/출고 상태 변경으로 바뀌면 안 됩니다.

begin;

-- 과거 설치본의 단가 트리거가 UPDATE까지 연결돼 있어도 제거한 뒤 INSERT 전용으로 고정합니다.
drop trigger if exists orders_apply_customer_item_price on public.orders;
create trigger orders_apply_customer_item_price
before insert on public.orders
for each row execute function public.apply_customer_item_price_to_order();

-- 피킹·품절·검증·출고 처리와 함께 단가 변경이 들어오면 주문 당시 단가를 복원합니다.
-- 관리자가 피킹 초기화 후 주문 품목 편집 화면에서 단가만 수정하는 정상 작업은 허용됩니다.
create or replace function public.protect_order_price_during_fulfillment()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_fulfillment_changed boolean;
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

  if v_fulfillment_changed then
    new.price := old.price;
    -- 피킹 단계에서는 주문수량도 바뀌지 않으므로 주문 당시 금액까지 그대로 보존합니다.
    new.total := old.total;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_protect_fulfillment_price on public.orders;
create trigger orders_protect_fulfillment_price
before update on public.orders
for each row execute function public.protect_order_price_during_fulfillment();

commit;

-- 확인용 예시(주문번호를 실제 값으로 바꿔 별도로 실행):
-- select order_number,customer_name,item_number,qty,price,total,picking_status,status
-- from public.orders
-- where order_number='실제 주문번호' and item_number='9022';
