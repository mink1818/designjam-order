-- DESIGN SOCKS V6.7.80 주문별 출고전달 이력
-- 기존 거래처별 shipment_handoffs와 기존 주문 데이터는 변경하지 않습니다.

begin;

create table if not exists public.shipment_order_handoffs(
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  order_number text not null,
  customer_id uuid,
  customer_name text not null,
  delivery_name text,
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_date,order_number)
);

create index if not exists shipment_order_handoffs_customer_date_idx
on public.shipment_order_handoffs(business_date,customer_id,completed_at);

alter table public.shipment_order_handoffs enable row level security;
drop policy if exists shipment_order_handoffs_staff_all on public.shipment_order_handoffs;
create policy shipment_order_handoffs_staff_all on public.shipment_order_handoffs
for all to authenticated
using(public.shipment_staff_allowed())
with check(public.shipment_staff_allowed());

create or replace function public.set_shipment_order_handoff(
  p_business_date date,
  p_order_number text,
  p_completed boolean
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.shipment_staff_allowed() then raise exception '출고전달 처리 권한이 없습니다.';end if;
  select * into v_order from public.orders
  where order_number=p_order_number and status='출고완료'
  order by id limit 1;
  if not found then raise exception '출고완료 주문을 찾을 수 없습니다.';end if;

  insert into public.shipment_order_handoffs(
    business_date,order_number,customer_id,customer_name,delivery_name,
    completed_at,completed_by,updated_at
  ) values(
    p_business_date,trim(p_order_number),v_order.customer_id,v_order.customer_name,v_order.delivery_name,
    case when p_completed then now() else null end,
    case when p_completed then auth.uid() else null end,
    now()
  )
  on conflict(business_date,order_number) do update set
    customer_id=excluded.customer_id,
    customer_name=excluded.customer_name,
    delivery_name=excluded.delivery_name,
    completed_at=excluded.completed_at,
    completed_by=excluded.completed_by,
    updated_at=now();

  return jsonb_build_object('ok',true,'order_number',p_order_number,'completed',p_completed);
end $$;

revoke all on function public.set_shipment_order_handoff(date,text,boolean) from public;
grant execute on function public.set_shipment_order_handoff(date,text,boolean) to authenticated;

-- 이전 버전에서 거래처 전체가 이미 전달완료였던 날짜는 해당 날짜의 출고완료 주문도 완료로 이어받습니다.
-- 기존 테이블은 그대로 두고 새 주문별 테이블에만 1회 복사합니다.
insert into public.shipment_order_handoffs(
  business_date,order_number,customer_id,customer_name,delivery_name,completed_at,completed_by,created_at,updated_at
)
select distinct on(h.business_date,o.order_number)
 h.business_date,o.order_number,o.customer_id,o.customer_name,o.delivery_name,h.completed_at,h.completed_by,now(),now()
from public.shipment_handoffs h
join public.orders o on o.status='출고완료'
 and (o.shipped_at at time zone 'Asia/Seoul')::date=h.business_date
 and ((h.customer_id is not null and o.customer_id=h.customer_id)
   or (h.customer_id is null and o.customer_name=h.customer_name))
where h.completed_at is not null
order by h.business_date,o.order_number,o.id
on conflict(business_date,order_number) do nothing;

commit;
