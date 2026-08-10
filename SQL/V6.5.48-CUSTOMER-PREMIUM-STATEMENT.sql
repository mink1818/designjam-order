-- DESIGN SOCKS V6.5.48
-- 우수고객 이상 저장 거래처/거래명세서 편집 기능
-- 중요: 거래처별 전용단가, 상품 기본단가, orders.price/total은 변경하지 않습니다.
-- 할인율은 화면과 계산에서 사용하지 않으며 이 SQL도 단가를 재계산하지 않습니다.

alter table public.customers add column if not exists customer_grade text not null default '일반';

create table if not exists public.customer_statement_profiles(
  customer_id uuid primary key references public.customers(id) on delete cascade,
  customer_name text,
  owner_name text,
  delivery_address text,
  brand_name text,
  footer_name text,
  updated_at timestamptz not null default now()
);
alter table public.customer_statement_profiles enable row level security;

drop policy if exists statement_profile_premium_own on public.customer_statement_profiles;
create policy statement_profile_premium_own on public.customer_statement_profiles
for all to authenticated
using (
  customer_id=auth.uid()
  and coalesce((select customer_grade from public.customers where id=auth.uid()),'일반') in ('우수','VIP')
)
with check (
  customer_id=auth.uid()
  and coalesce((select customer_grade from public.customers where id=auth.uid()),'일반') in ('우수','VIP')
);

drop policy if exists statement_profile_admin on public.customer_statement_profiles;
create policy statement_profile_admin on public.customer_statement_profiles
for all to authenticated using(public.is_inventory_admin()) with check(public.is_inventory_admin());

-- 저장 거래처 목록 조회/수정은 우수고객 이상 또는 관리자만 허용합니다.
drop policy if exists delivery_destination_premium_restrict on public.customer_delivery_destinations;
create policy delivery_destination_premium_restrict on public.customer_delivery_destinations
as restrictive for select to authenticated
using (
  public.is_inventory_admin()
  or (
    customer_id=auth.uid()
    and coalesce((select customer_grade from public.customers where id=auth.uid()),'일반') in ('우수','VIP')
  )
);

grant select,insert,update,delete on public.customer_statement_profiles to authenticated;

select 'V6.5.48 적용 완료 - 단가/할인 계산 변경 없음' as result;
