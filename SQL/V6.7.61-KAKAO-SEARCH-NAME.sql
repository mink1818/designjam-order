-- DESIGN SOCKS V6.7.61
-- 거래처별 PC 카카오톡 검색명 저장 필드
-- 기존 주문/재고/매출 데이터는 변경하지 않습니다.

begin;

alter table public.customer_admin_metadata
  add column if not exists kakao_search_name text;

comment on column public.customer_admin_metadata.kakao_search_name is
  '관리자용 PC 카카오톡 검색명. 비어 있으면 ERP 거래처명을 사용합니다.';

commit;
