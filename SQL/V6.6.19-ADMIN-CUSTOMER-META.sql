-- V6.6.19 관리자 전용 고객코드/고객표시
create table if not exists public.customer_admin_metadata (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  customer_code text not null default '',
  customer_tag text not null default '',
  show_order_tag boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.customer_admin_metadata enable row level security;
drop policy if exists "admin customer metadata select" on public.customer_admin_metadata;
drop policy if exists "admin customer metadata insert" on public.customer_admin_metadata;
drop policy if exists "admin customer metadata update" on public.customer_admin_metadata;
create policy "admin customer metadata select" on public.customer_admin_metadata for select to authenticated using ((exists(select 1 from public.customers c where c.id=auth.uid() and c.is_admin=true and coalesce(c.blocked,false)=false) or lower(coalesce(auth.jwt()->>'email','')) in ('900smk@naver.com','sm0727sm@hanmail.net','p1028p@naver.com')));
create policy "admin customer metadata insert" on public.customer_admin_metadata for insert to authenticated with check ((exists(select 1 from public.customers c where c.id=auth.uid() and c.is_admin=true and coalesce(c.blocked,false)=false) or lower(coalesce(auth.jwt()->>'email','')) in ('900smk@naver.com','sm0727sm@hanmail.net','p1028p@naver.com')));
create policy "admin customer metadata update" on public.customer_admin_metadata for update to authenticated using ((exists(select 1 from public.customers c where c.id=auth.uid() and c.is_admin=true and coalesce(c.blocked,false)=false) or lower(coalesce(auth.jwt()->>'email','')) in ('900smk@naver.com','sm0727sm@hanmail.net','p1028p@naver.com'))) with check ((exists(select 1 from public.customers c where c.id=auth.uid() and c.is_admin=true and coalesce(c.blocked,false)=false) or lower(coalesce(auth.jwt()->>'email','')) in ('900smk@naver.com','sm0727sm@hanmail.net','p1028p@naver.com')));
create index if not exists customer_admin_metadata_code_idx on public.customer_admin_metadata(customer_code);
