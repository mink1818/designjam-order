-- DESIGN SOCKS V6.7.24
-- 출고완료·통계·미납금액 조회용 안전 인덱스

create index if not exists orders_status_shipped_at_idx
  on public.orders (status, shipped_at desc);

create index if not exists orders_created_at_desc_idx
  on public.orders (created_at desc);

create index if not exists order_payment_records_order_updated_idx
  on public.order_payment_records (order_number, updated_at desc);

create index if not exists deleted_order_history_deleted_at_idx
  on public.deleted_order_history (deleted_at desc);

create index if not exists order_change_history_changed_at_idx
  on public.order_change_history (changed_at desc);

analyze public.orders;
analyze public.order_payment_records;
analyze public.deleted_order_history;
analyze public.order_change_history;
