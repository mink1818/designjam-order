-- V6.2.1 개발관리자 권한
alter table public.customers add column if not exists admin_role text not null default 'admin';
alter table public.customers add column if not exists last_login_at timestamptz;
update public.customers set admin_role='developer_admin' where lower(email) in ('900smk@naver.com','sm0727sm@hanmail.net','p1028p@naver.com') and is_admin=true;
create index if not exists idx_customers_admin_role on public.customers(is_admin,admin_role);
