-- V5.3.27 주문별 관리자 메모 저장 테이블
-- Supabase Dashboard > SQL Editor에서 한 번 실행하세요.

create table if not exists public.admin_order_notes (
  order_number text primary key,
  note text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.admin_order_notes enable row level security;

drop policy if exists "admin_order_notes_select_authenticated" on public.admin_order_notes;
create policy "admin_order_notes_select_authenticated"
on public.admin_order_notes for select
to authenticated
using (true);

drop policy if exists "admin_order_notes_insert_authenticated" on public.admin_order_notes;
create policy "admin_order_notes_insert_authenticated"
on public.admin_order_notes for insert
to authenticated
with check (true);

drop policy if exists "admin_order_notes_update_authenticated" on public.admin_order_notes;
create policy "admin_order_notes_update_authenticated"
on public.admin_order_notes for update
to authenticated
using (true)
with check (true);
