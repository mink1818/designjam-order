-- V6.5.53 관리자 대신주문 신규 납품처 저장
-- 거래처별 단가 테이블과 가격 계산 함수는 변경하지 않습니다.

create or replace function public.save_admin_customer_delivery_destination(
  p_customer_id uuid,
  p_delivery_name text,
  p_delivery_phone text,
  p_delivery_address text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id bigint;
begin
  if not public.is_inventory_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;
  if p_customer_id is null or nullif(trim(p_delivery_name),'') is null then
    raise exception '거래처와 납품처명이 필요합니다.';
  end if;

  select id into v_id
  from public.customer_delivery_destinations
  where customer_id=p_customer_id
    and lower(regexp_replace(coalesce(delivery_name,''),'[[:space:]\-().,·]','','g'))
        = lower(regexp_replace(coalesce(p_delivery_name,''),'[[:space:]\-().,·]','','g'))
    and lower(regexp_replace(coalesce(delivery_address,''),'[[:space:]\-().,·]','','g'))
        = lower(regexp_replace(coalesce(p_delivery_address,''),'[[:space:]\-().,·]','','g'))
  order by id
  limit 1;

  if v_id is null then
    insert into public.customer_delivery_destinations(
      customer_id,delivery_name,delivery_phone,delivery_address,is_default,last_used_at,updated_at
    ) values (
      p_customer_id,trim(p_delivery_name),nullif(trim(p_delivery_phone),''),nullif(trim(p_delivery_address),''),false,now(),now()
    ) returning id into v_id;
  else
    update public.customer_delivery_destinations
    set delivery_phone=nullif(trim(p_delivery_phone),''),
        delivery_address=nullif(trim(p_delivery_address),''),
        last_used_at=now(),updated_at=now()
    where id=v_id;
  end if;

  return jsonb_build_object('ok',true,'id',v_id,'customer_id',p_customer_id);
end $$;

grant execute on function public.save_admin_customer_delivery_destination(uuid,text,text,text) to authenticated;

select 'V6.5.53 납품처 자동선택/신규저장 적용 완료 - 단가 변경 없음' as result;
