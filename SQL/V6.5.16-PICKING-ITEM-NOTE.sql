begin;

alter table public.orders
  add column if not exists picking_note text;

comment on column public.orders.picking_note is '피킹 화면의 품번별 짧은 작업 메모';

commit;
