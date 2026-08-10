-- V6.5.49 우수고객 등급 명칭 호환
-- 단가, 주문금액, 할인 계산은 변경하지 않습니다.

drop policy if exists delivery_destination_premium_restrict on public.customer_delivery_destinations;
create policy delivery_destination_premium_restrict
on public.customer_delivery_destinations
as restrictive for select to authenticated
using (
  public.is_inventory_admin()
  or (
    customer_id = auth.uid()
    and coalesce((select customer_grade from public.customers where id = auth.uid()), '일반')
      in ('우수', '우수고객', 'VIP', 'VVIP')
  )
);

select 'V6.5.49 우수고객 등급 명칭 호환 적용 완료 - 단가 변경 없음' as result;
