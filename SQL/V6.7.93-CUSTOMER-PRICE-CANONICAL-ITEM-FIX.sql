-- DESIGN SOCKS V6.7.93
-- 관리자 대신주문/주문수정 전용단가의 동일 품번 표기 충돌 방지
-- 과거 주문과 기존 단가자료는 수정하거나 삭제하지 않습니다.

begin;

create or replace function public.normalize_customer_price_item(p_item_number text)
returns text
language sql immutable parallel safe
as $$
  select regexp_replace(
    upper(trim(coalesce(p_item_number,''))),
    '^[SBI][-_[:space:]]+',
    '',
    'i'
  );
$$;

-- 거래처명 단가가 최우선입니다. 같은 품번이 6061/S-6061 형태로 함께 있으면
-- 접두어 없는 정확한 품번을 먼저 선택하고, 그 다음 최신 수정값을 선택합니다.
create or replace function public.resolve_customer_order_price(
  p_customer_id uuid,
  p_customer_name text,
  p_item_number text
) returns numeric
language plpgsql stable security definer set search_path=public as $$
declare
  v_price numeric;
  v_item text:=public.normalize_customer_price_item(p_item_number);
  v_distinct_prices integer:=0;
  v_exact_rows integer:=0;
begin
  if nullif(v_item,'') is null then return null;end if;

  if nullif(trim(coalesce(p_customer_name,'')),'') is not null then
    select count(distinct p.price),
           count(*) filter (where upper(trim(p.item_number))=v_item)
      into v_distinct_prices,v_exact_rows
    from public.customer_name_item_prices p
    where p.normalized_name=public.normalize_customer_price_name(p_customer_name)
      and public.normalize_customer_price_item(p.item_number)=v_item
      and p.price>0;
    if v_distinct_prices>1 and v_exact_rows=0 then
      raise exception '거래처 전용단가 충돌: % / 품번 % (단가표에서 동일 품번 표기를 확인해주세요.)',p_customer_name,v_item;
    end if;
    select p.price into v_price
    from public.customer_name_item_prices p
    where p.normalized_name=public.normalize_customer_price_name(p_customer_name)
      and public.normalize_customer_price_item(p.item_number)=v_item
      and p.price>0
    order by
      case when upper(trim(p.item_number))=v_item then 0 else 1 end,
      p.updated_at desc nulls last,
      p.id desc
    limit 1;
  end if;

  if v_price is null and p_customer_id is not null then
    select count(distinct p.price),
           count(*) filter (where upper(trim(p.item_number))=v_item)
      into v_distinct_prices,v_exact_rows
    from public.customer_item_prices p
    where p.customer_id=p_customer_id
      and public.normalize_customer_price_item(p.item_number)=v_item
      and p.price>0;
    if v_distinct_prices>1 and v_exact_rows=0 then
      raise exception '거래처 ID 전용단가 충돌: 품번 % (단가표에서 동일 품번 표기를 확인해주세요.)',v_item;
    end if;
    select p.price into v_price
    from public.customer_item_prices p
    where p.customer_id=p_customer_id
      and public.normalize_customer_price_item(p.item_number)=v_item
      and p.price>0
    order by
      case when upper(trim(p.item_number))=v_item then 0 else 1 end,
      p.updated_at desc nulls last,
      p.id desc
    limit 1;
  end if;
  return v_price;
end $$;

-- 관리자 주문수정 화면용: 정규화된 품번당 한 가격만 반환합니다.
create or replace function public.get_customer_item_prices_for_admin(p_customer_id uuid)
returns table(item_number text,price integer)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_inventory_admin() then raise exception '관리자 권한이 필요합니다.';end if;
  return query
  select distinct on (source.normalized_item)
    source.normalized_item as item_number,
    source.price::integer as price
  from (
    select public.normalize_customer_price_item(np.item_number) normalized_item,
           np.item_number raw_item,np.price,np.updated_at,np.id,
           1 source_priority
    from public.customer_name_item_prices np
    join public.customers c on c.id=p_customer_id
    where np.normalized_name=public.normalize_customer_price_name(c.business_name)
      and np.price>0
    union all
    select public.normalize_customer_price_item(ip.item_number) normalized_item,
           ip.item_number raw_item,ip.price,ip.updated_at,ip.id,
           2 source_priority
    from public.customer_item_prices ip
    where ip.customer_id=p_customer_id and ip.price>0
  ) source
  where nullif(source.normalized_item,'') is not null
  order by source.normalized_item,
           source.source_priority,
           case when upper(trim(source.raw_item))=source.normalized_item then 0 else 1 end,
           source.updated_at desc nulls last,
           source.id desc;
end $$;

create or replace function public.get_customer_item_prices_by_name_for_admin(p_customer_name text)
returns table(item_number text,price integer)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_inventory_admin() then raise exception '관리자 권한이 필요합니다.';end if;
  return query
  select distinct on (public.normalize_customer_price_item(p.item_number))
    public.normalize_customer_price_item(p.item_number) as item_number,
    p.price::integer as price
  from public.customer_name_item_prices p
  where p.normalized_name=public.normalize_customer_price_name(p_customer_name)
    and p.price>0
    and nullif(public.normalize_customer_price_item(p.item_number),'') is not null
  order by public.normalize_customer_price_item(p.item_number),
           case when upper(trim(p.item_number))=public.normalize_customer_price_item(p.item_number) then 0 else 1 end,
           p.updated_at desc nulls last,
           p.id desc;
end $$;

revoke all on function public.normalize_customer_price_item(text) from public;
revoke all on function public.resolve_customer_order_price(uuid,text,text) from public;
revoke all on function public.get_customer_item_prices_for_admin(uuid) from public;
revoke all on function public.get_customer_item_prices_by_name_for_admin(text) from public;
grant execute on function public.normalize_customer_price_item(text) to authenticated;
grant execute on function public.resolve_customer_order_price(uuid,text,text) to authenticated;
grant execute on function public.get_customer_item_prices_for_admin(uuid) to authenticated;
grant execute on function public.get_customer_item_prices_by_name_for_admin(text) to authenticated;

-- 전체 거래처 단가표에서 동일 품번 표기인데 가격이 서로 다른 항목을 관리자가 조회할 수 있습니다.
create or replace function public.audit_customer_price_conflicts()
returns table(customer_name text,item_number text,prices text,row_count bigint)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_inventory_admin() then raise exception '관리자 권한이 필요합니다.';end if;
  return query
  select max(p.customer_name)::text,
         public.normalize_customer_price_item(p.item_number)::text,
         string_agg(distinct p.price::text,', ' order by p.price::text)::text,
         count(*)::bigint
  from public.customer_name_item_prices p
  where p.price>0
  group by p.normalized_name,public.normalize_customer_price_item(p.item_number)
  having count(distinct p.price)>1
  order by max(p.customer_name),public.normalize_customer_price_item(p.item_number);
end $$;

revoke all on function public.audit_customer_price_conflicts() from public;
grant execute on function public.audit_customer_price_conflicts() to authenticated;

commit;

-- 실행 후 부산마야 6061/6062/6064 확정단가 확인용(조회만 수행)
-- select x.item_number,
--        public.resolve_customer_order_price(c.id,c.business_name,x.item_number) expected_price
-- from public.customers c
-- cross join (values ('6061'),('6062'),('6064')) x(item_number)
-- where public.normalize_customer_price_name(c.business_name)=public.normalize_customer_price_name('부산마야')
-- order by x.item_number;

-- 전체 거래처 충돌 점검(조회만 수행)
-- select * from public.audit_customer_price_conflicts();
