-- V6.6.20 관리자 전용 주문별 표시
create table if not exists public.order_admin_metadata (
  order_number text primary key,
  admin_tag text not null default '',
  show_tag boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.order_admin_metadata enable row level security;
drop policy if exists "admin order metadata select" on public.order_admin_metadata;
drop policy if exists "admin order metadata insert" on public.order_admin_metadata;
drop policy if exists "admin order metadata update" on public.order_admin_metadata;
create policy "admin order metadata select" on public.order_admin_metadata for select to authenticated using ((exists(select 1 from public.customers c where c.id=auth.uid() and c.is_admin=true and coalesce(c.blocked,false)=false) or lower(coalesce(auth.jwt()->>'email','')) in ('900smk@naver.com','sm0727sm@hanmail.net','p1028p@naver.com')));
create policy "admin order metadata insert" on public.order_admin_metadata for insert to authenticated with check ((exists(select 1 from public.customers c where c.id=auth.uid() and c.is_admin=true and coalesce(c.blocked,false)=false) or lower(coalesce(auth.jwt()->>'email','')) in ('900smk@naver.com','sm0727sm@hanmail.net','p1028p@naver.com')));
create policy "admin order metadata update" on public.order_admin_metadata for update to authenticated using ((exists(select 1 from public.customers c where c.id=auth.uid() and c.is_admin=true and coalesce(c.blocked,false)=false) or lower(coalesce(auth.jwt()->>'email','')) in ('900smk@naver.com','sm0727sm@hanmail.net','p1028p@naver.com'))) with check ((exists(select 1 from public.customers c where c.id=auth.uid() and c.is_admin=true and coalesce(c.blocked,false)=false) or lower(coalesce(auth.jwt()->>'email','')) in ('900smk@naver.com','sm0727sm@hanmail.net','p1028p@naver.com')));
