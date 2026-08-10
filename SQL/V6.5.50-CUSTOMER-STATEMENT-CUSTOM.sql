-- DESIGN SOCKS V6.5.50
-- 거래처가 자기 거래처에 보내는 커스텀 거래명세서 저장
-- 중요: 상품 단가, 거래처별 전용단가, orders.price/total은 변경하지 않습니다.

alter table public.customer_statement_profiles add column if not exists statement_title text;
alter table public.customer_statement_profiles add column if not exists confirmation_text text;

drop policy if exists statement_profile_premium_own on public.customer_statement_profiles;
create policy statement_profile_premium_own on public.customer_statement_profiles
for all to authenticated
using(customer_id=auth.uid() and coalesce((select customer_grade from public.customers where id=auth.uid()),'일반') in ('우수','우수고객','VIP','VVIP'))
with check(customer_id=auth.uid() and coalesce((select customer_grade from public.customers where id=auth.uid()),'일반') in ('우수','우수고객','VIP','VVIP'));

create table if not exists public.customer_statement_recipient_profiles(
  customer_id uuid not null references public.customers(id) on delete cascade,
  recipient_key text not null,
  recipient_name text not null,
  owner_name text,
  delivery_address text,
  updated_at timestamptz not null default now(),
  primary key(customer_id,recipient_key)
);
alter table public.customer_statement_recipient_profiles enable row level security;

drop policy if exists statement_recipient_premium_own on public.customer_statement_recipient_profiles;
create policy statement_recipient_premium_own on public.customer_statement_recipient_profiles
for all to authenticated
using(customer_id=auth.uid() and coalesce((select customer_grade from public.customers where id=auth.uid()),'일반') in ('우수','우수고객','VIP','VVIP'))
with check(customer_id=auth.uid() and coalesce((select customer_grade from public.customers where id=auth.uid()),'일반') in ('우수','우수고객','VIP','VVIP'));

drop policy if exists statement_recipient_admin on public.customer_statement_recipient_profiles;
create policy statement_recipient_admin on public.customer_statement_recipient_profiles
for all to authenticated using(public.is_inventory_admin()) with check(public.is_inventory_admin());

grant select,insert,update,delete on public.customer_statement_recipient_profiles to authenticated;

create or replace function public.save_premium_customer_delivery_destination(
  p_id bigint,p_delivery_name text,p_delivery_phone text,p_delivery_address text,p_is_default boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_grade text;v_role text;v_existing_id bigint;
begin
  select coalesce(customer_grade,'일반') into v_grade from public.customers where id=auth.uid();
  v_role:=public.current_admin_role();
  if v_role not in ('admin','developer_admin') and v_grade not in ('우수','우수고객','VIP','VVIP') then raise exception '우수거래처 이상에서 사용할 수 있습니다.'; end if;
  if p_id is null then
    select id into v_existing_id from public.customer_delivery_destinations
    where customer_id=auth.uid() and trim(delivery_name)=trim(p_delivery_name)
      and coalesce(trim(delivery_address),'')=coalesce(trim(p_delivery_address),'') limit 1;
    p_id:=v_existing_id;
  end if;
  return public.save_customer_delivery_destination(p_id,p_delivery_name,p_delivery_phone,p_delivery_address,p_is_default);
end $$;
grant execute on function public.save_premium_customer_delivery_destination(bigint,text,text,text,boolean) to authenticated;

create or replace function public.delete_premium_customer_delivery_destination(p_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_grade text;v_role text;
begin
  select coalesce(customer_grade,'일반') into v_grade from public.customers where id=auth.uid();
  v_role:=public.current_admin_role();
  if v_role not in ('admin','developer_admin') and v_grade not in ('우수','우수고객','VIP','VVIP') then raise exception '우수거래처 이상에서 사용할 수 있습니다.'; end if;
  return public.delete_customer_delivery_destination(p_id);
end $$;
grant execute on function public.delete_premium_customer_delivery_destination(bigint) to authenticated;

select 'V6.5.50 커스텀 거래명세서 적용 완료 - 단가 변경 없음' as result;
