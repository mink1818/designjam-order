-- DESIGN SOCKS V6.7.77 / 대용량 거래처별 단가 동기화 시간초과 보완
-- 먼저 V6.6.17-SAFE-FAST-CUSTOMER-PRICE-SYNC.sql을 적용한 뒤 실행합니다.
-- 기존 주문·상품·단가 데이터는 수정하지 않고 해당 함수의 실행 제한시간만 늘립니다.
begin;

alter function public.sync_customer_item_prices_from_excel(jsonb,boolean)
  set statement_timeout = '180s';

alter function public.sync_customer_item_prices_from_excel(jsonb,boolean)
  set lock_timeout = '15s';

-- 실제 반영 단계에서 거래처명 연결을 빠르게 합니다.
create index if not exists customers_price_normalized_business_name_idx
  on public.customers (public.normalize_customer_price_name(business_name))
  where coalesce(is_admin,false)=false;

commit;

