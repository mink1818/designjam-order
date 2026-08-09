begin;

alter table public.orders
  add column if not exists s_outbound_confirmed boolean not null default false,
  add column if not exists b_outbound_confirmed boolean not null default false,
  add column if not exists i_outbound_confirmed boolean not null default false;

comment on column public.orders.s_outbound_confirmed is 'S 출고지 품번별 출고 확인 기록';
comment on column public.orders.b_outbound_confirmed is 'B 출고지 품번별 출고 확인 기록';
comment on column public.orders.i_outbound_confirmed is 'I 출고지 품번별 출고 확인 기록';

create index if not exists idx_orders_sbi_outbound_confirmed
  on public.orders(order_number, s_outbound_confirmed, b_outbound_confirmed, i_outbound_confirmed);

create or replace function public.delete_order_and_restore_inventory(
  p_order_number text,
  p_device_name text default '주문 전체삭제'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reset jsonb := '{}'::jsonb;
  v_deleted integer := 0;
begin
  if auth.uid() is null or not exists (
    select 1 from public.customers
    where id = auth.uid() and is_admin = true and coalesce(blocked, false) = false
  ) then
    raise exception '관리자만 주문 전체삭제를 할 수 있습니다.';
  end if;

  if not exists (select 1 from public.orders where order_number = p_order_number) then
    raise exception '삭제할 주문을 찾을 수 없습니다: %', p_order_number;
  end if;

  select public.reset_order_picking(p_order_number, p_device_name)
    into v_reset;

  delete from public.orders where order_number = p_order_number;
  get diagnostics v_deleted = row_count;

  return coalesce(v_reset, '{}'::jsonb) || jsonb_build_object(
    'order_number', p_order_number,
    'deleted_rows', v_deleted
  );
end;
$$;

revoke all on function public.delete_order_and_restore_inventory(text, text) from public;
grant execute on function public.delete_order_and_restore_inventory(text, text) to authenticated;

commit;
