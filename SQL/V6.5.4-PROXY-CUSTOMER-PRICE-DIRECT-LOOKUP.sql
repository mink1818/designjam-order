-- DESIGN SOCKS V6.5.5 관리자 대신주문 거래처 단가 직접조회·중복상호 동기화
-- Supabase SQL Editor에서 전체 실행하세요.

create or replace function public.get_customer_item_prices_for_admin(p_customer_id uuid)
returns table(item_number text,price integer)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.is_inventory_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;
  return query
  select p.item_number,p.price
  from public.customer_item_prices p
  where p.customer_id=p_customer_id and p.price>0
  order by p.item_number;
end;
$$;

revoke all on function public.get_customer_item_prices_for_admin(uuid) from public;
grant execute on function public.get_customer_item_prices_for_admin(uuid) to authenticated;

-- 같은 상호명의 중복 거래처 계정에는 가장 최근 전용단가를 모두 동일하게 복사합니다.
insert into public.customer_item_prices(customer_id,item_number,price,updated_at)
select target.id,source.item_number,source.price,now()
from public.customers target
join lateral (
  select distinct on (p.item_number) p.item_number,p.price
  from public.customer_item_prices p
  join public.customers priced_customer on priced_customer.id=p.customer_id
  where regexp_replace(lower(trim(priced_customer.business_name)),'[[:space:]_.()\[\]{}-]+','','g')=
        regexp_replace(lower(trim(target.business_name)),'[[:space:]_.()\[\]{}-]+','','g')
    and p.price>0
  order by p.item_number,p.updated_at desc nulls last,p.id desc
) source on true
where coalesce(target.is_admin,false)=false
  and coalesce(trim(target.business_name),'')<>''
on conflict(customer_id,item_number)
do update set price=excluded.price,updated_at=now();
