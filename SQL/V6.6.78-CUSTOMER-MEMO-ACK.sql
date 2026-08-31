-- V6.6.78 고객 주문메모 확인상태 공유
-- 기존 주문/메모 데이터는 변경하지 않고 관리자 메타데이터에 확인정보만 추가합니다.
alter table public.order_admin_metadata
  add column if not exists customer_memo_acknowledged_at timestamptz,
  add column if not exists customer_memo_acknowledged_by uuid references auth.users(id) on delete set null,
  add column if not exists customer_memo_acknowledged_by_name text;

comment on column public.order_admin_metadata.customer_memo_acknowledged_at is '고객 주문메모 관리자 확인시각';
comment on column public.order_admin_metadata.customer_memo_acknowledged_by is '고객 주문메모 확인 관리자 UUID';
comment on column public.order_admin_metadata.customer_memo_acknowledged_by_name is '고객 주문메모 확인 관리자 표시명';

-- 고객이 주문 메모 내용을 변경하면 이전 확인상태를 자동 해제합니다.
create or replace function public.reset_customer_memo_ack_on_order_memo_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.memo is distinct from old.memo then
    update public.order_admin_metadata
       set customer_memo_acknowledged_at = null,
           customer_memo_acknowledged_by = null,
           customer_memo_acknowledged_by_name = null,
           updated_at = now()
     where order_number = new.order_number;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reset_customer_memo_ack_on_order_memo_change on public.orders;
create trigger trg_reset_customer_memo_ack_on_order_memo_change
after update of memo on public.orders
for each row
execute function public.reset_customer_memo_ack_on_order_memo_change();
