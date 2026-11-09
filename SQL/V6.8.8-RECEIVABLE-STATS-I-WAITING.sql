-- DESIGN SOCKS V6.8.8
-- 1) 메인·통계 누적 미수금을 동일한 서버 계산으로 고정
-- 2) 피킹시작 전에도 관리자가 I 포장완료 대기로 보낼 수 있는 별도 표시
-- 기존 주문수량·금액·피킹수량·재고는 변경하지 않습니다.

begin;

alter table public.orders
  add column if not exists i_packed_waiting_forced boolean not null default false;

create index if not exists orders_i_packed_waiting_forced_idx
  on public.orders (i_packed_waiting_forced, status, created_at desc)
  where i_packed_waiting_forced=true;

create index if not exists orders_created_at_id_idx
  on public.orders (created_at, id);

-- 강제 대기 표시는 피킹·품절·재고·주문상태를 바꾸지 않습니다.
create or replace function public.admin_set_i_packed_waiting(
  p_order_number text,
  p_enabled boolean default true
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer:=0;
begin
  if not exists(
    select 1 from public.customers c
    where c.id=auth.uid() and c.is_admin=true and coalesce(c.blocked,false)=false
  ) then
    raise exception '관리자·매니저 권한이 필요합니다.';
  end if;

  if nullif(trim(p_order_number),'') is null then
    raise exception '주문번호가 없습니다.';
  end if;

  if exists(
    select 1 from public.orders
    where order_number=trim(p_order_number) and status='출고완료'
  ) then
    raise exception '이미 출고완료된 주문은 I 포장완료 대기로 이동할 수 없습니다.';
  end if;

  update public.orders
     set i_packed_waiting_forced=coalesce(p_enabled,false)
   where order_number=trim(p_order_number);
  get diagnostics v_count=row_count;

  if v_count=0 then raise exception '주문을 찾을 수 없습니다.'; end if;

  return jsonb_build_object(
    'ok',true,
    'order_number',trim(p_order_number),
    'enabled',coalesce(p_enabled,false),
    'updated_rows',v_count
  );
end;
$$;

revoke all on function public.admin_set_i_packed_waiting(text,boolean) from public;
grant execute on function public.admin_set_i_packed_waiting(text,boolean) to authenticated;

-- 주문번호당 실제 출고금액을 한 번만 계산하고, 최신 입금기록 한 건만 결합합니다.
-- 메인과 통계가 이 함수를 함께 사용하므로 같은 시점에는 항상 같은 금액이 표시됩니다.
create or replace function public.admin_receivable_snapshot()
returns table(
  order_number text,
  customer_id text,
  customer_name text,
  delivery_name text,
  ordered_qty numeric,
  order_total numeric,
  shipping_fee numeric,
  paid_amount numeric,
  balance numeric,
  payment_status text,
  payment_account text,
  depositor_name text,
  paid_at timestamptz,
  memo text,
  completed_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path=public
as $$
  with allowed as (
    select 1
    from public.customers c
    where c.id=auth.uid()
      and c.is_admin=true
      and coalesce(c.blocked,false)=false
      and coalesce(c.admin_role,'admin') not in ('manager','employee')
  ), latest_payment as (
    select distinct on (p.order_number)
      p.*
    from public.order_payment_records p, allowed
    order by p.order_number,
             (p.confirmed_by is not null) desc,
             p.updated_at desc,
             p.id desc
  ), completed_orders as (
    select
      o.order_number,
      max(coalesce(o.customer_id::text,'')) as customer_id,
      max(coalesce(nullif(trim(o.customer_name),''),'거래처 미입력')) as customer_name,
      max(coalesce(o.delivery_name,'')) as delivery_name,
      sum(greatest(coalesce(o.qty,0),0))::numeric as ordered_qty,
      sum(
        greatest(
          greatest(coalesce(o.qty,0),0)
          - least(
              greatest(coalesce(o.qty,0),0),
              case when coalesce(o.is_soldout,false)
                   then greatest(coalesce(o.qty,0),0)
                   else greatest(coalesce(o.soldout_qty,0),0)
              end
            ),
          0
        ) * greatest(coalesce(o.price,0),0)
      )::numeric as product_total,
      max(greatest(coalesce(o.shipping_fee,0),0))::numeric as shipping_fee,
      max(coalesce(o.shipped_at,o.picking_verified_at,o.created_at)) as completed_at
    from public.orders o, allowed
    where o.status='출고완료'
    group by o.order_number
  )
  select
    o.order_number,
    o.customer_id,
    o.customer_name,
    o.delivery_name,
    o.ordered_qty,
    (o.product_total+o.shipping_fee)::numeric as order_total,
    o.shipping_fee,
    greatest(coalesce(p.paid_amount,0),0)::numeric as paid_amount,
    greatest((o.product_total+o.shipping_fee)-greatest(coalesce(p.paid_amount,0),0),0)::numeric as balance,
    case
      when greatest(coalesce(p.paid_amount,0),0)<=0 then '미입금'
      when greatest(coalesce(p.paid_amount,0),0)<(o.product_total+o.shipping_fee) then '일부입금'
      else '입금완료'
    end as payment_status,
    p.payment_account,
    p.depositor_name,
    p.paid_at,
    p.memo,
    o.completed_at,
    p.updated_at
  from completed_orders o
  join latest_payment p on p.order_number=o.order_number
  where greatest((o.product_total+o.shipping_fee)-greatest(coalesce(p.paid_amount,0),0),0)>0
  order by o.completed_at desc, o.order_number desc;
$$;

revoke all on function public.admin_receivable_snapshot() from public;
grant execute on function public.admin_receivable_snapshot() to authenticated;

analyze public.orders;
analyze public.order_payment_records;

commit;

