begin;

-- 거래처명 비교 기준: 유니코드 표기 차이는 클라이언트에서 정리하고,
-- DB에서는 대소문자·공백·일반 구분기호 차이를 제거해 비교합니다.
create or replace function public.normalize_customer_business_name(p_name text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(lower(trim(coalesce(p_name,''))),'[[:space:]_.·ㆍ,()\[\]{}-]+','','g');
$$;

-- 가입 화면에서 먼저 확인하는 공개 RPC입니다.
create or replace function public.check_customer_signup_duplicate(p_business_name text,p_phone text)
returns jsonb
language sql
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'business_name_exists',exists(
      select 1
      from public.customers c
      where coalesce(c.is_admin,false)=false
        and public.normalize_customer_business_name(c.business_name)=public.normalize_customer_business_name(p_business_name)
    ),
    'phone_exists',exists(
      select 1
      from public.customers c
      where coalesce(c.is_admin,false)=false
        and regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')
        and regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')<>''
    )
  );
$$;

revoke all on function public.check_customer_signup_duplicate(text,text) from public;
grant execute on function public.check_customer_signup_duplicate(text,text) to anon,authenticated;

-- 사전 조회 직후 동시에 가입하는 경우까지 막기 위한 DB 최종 안전장치입니다.
create or replace function public.prevent_duplicate_customer_business_name()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_key text:=public.normalize_customer_business_name(new.business_name);
begin
  if coalesce(new.is_admin,false)=false and v_key<>'' and exists(
    select 1
    from public.customers c
    where c.id<>new.id
      and coalesce(c.is_admin,false)=false
      and public.normalize_customer_business_name(c.business_name)=v_key
  ) then
    raise exception using
      errcode='23505',
      message='이미 등록된 거래처명입니다. 기존 계정 확인 또는 관리자에게 문의해주세요.';
  end if;
  return new;
end;
$$;

drop trigger if exists customers_prevent_duplicate_business_name on public.customers;
create trigger customers_prevent_duplicate_business_name
before insert or update of business_name,is_admin on public.customers
for each row execute function public.prevent_duplicate_customer_business_name();

commit;
