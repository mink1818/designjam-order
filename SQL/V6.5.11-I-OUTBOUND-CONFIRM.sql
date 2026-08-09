begin;

alter table public.orders
  add column if not exists i_outbound_confirmed boolean not null default false;

comment on column public.orders.i_outbound_confirmed is
  'I 출고지에서 해당 주문 품번을 실제 출고했는지 확인한 상태';

create index if not exists idx_orders_i_outbound_confirmed
  on public.orders(order_number, i_outbound_confirmed)
  where i_outbound_confirmed = true;

commit;
