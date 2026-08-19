begin;

-- 거래처별단가 시트를 운영 기준으로 사용합니다.
-- p_apply=false는 추가·변경·삭제 건수만 계산하고, true일 때만 한 트랜잭션으로 동기화합니다.
create or replace function public.sync_customer_item_prices_from_excel(
  p_prices jsonb,
  p_apply boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_added integer:=0;
  v_changed integer:=0;
  v_deleted integer:=0;
  v_removed_customers integer:=0;
  v_saved integer:=0;
  v_id_saved integer:=0;
begin
  if not public.is_inventory_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;
  if p_prices is null or jsonb_typeof(p_prices)<>'array' then
    raise exception '단가 자료 형식이 올바르지 않습니다.';
  end if;

  with incoming as (
    select distinct on (public.normalize_customer_price_name(x.customer_name),
                        regexp_replace(upper(trim(x.item_number)),'^[SBI][-_[:space:]]+',''))
      public.normalize_customer_price_name(x.customer_name) normalized_name,
      trim(x.customer_name) customer_name,
      regexp_replace(upper(trim(x.item_number)),'^[SBI][-_[:space:]]+','') item_number,
      x.price::integer price
    from jsonb_to_recordset(p_prices) as x(customer_name text,item_number text,price numeric)
    where nullif(trim(x.customer_name),'') is not null
      and nullif(trim(x.item_number),'') is not null
      and x.price>0 and mod(x.price::integer,50)=0
    order by public.normalize_customer_price_name(x.customer_name),
             regexp_replace(upper(trim(x.item_number)),'^[SBI][-_[:space:]]+','')
  )
  select
    count(*) filter(where old.id is null),
    count(*) filter(where old.id is not null and old.price<>incoming.price)
  into v_added,v_changed
  from incoming
  left join public.customer_name_item_prices old
    on old.normalized_name=incoming.normalized_name
   and regexp_replace(upper(trim(old.item_number)),'^[SBI][-_[:space:]]+','')=incoming.item_number;

  with incoming as (
    select distinct
      public.normalize_customer_price_name(x.customer_name) normalized_name,
      regexp_replace(upper(trim(x.item_number)),'^[SBI][-_[:space:]]+','') item_number
    from jsonb_to_recordset(p_prices) as x(customer_name text,item_number text,price numeric)
    where nullif(trim(x.customer_name),'') is not null
      and nullif(trim(x.item_number),'') is not null
      and x.price>0 and mod(x.price::integer,50)=0
  )
  select count(*) into v_deleted
  from public.customer_name_item_prices old
  where not exists(
    select 1 from incoming i
    where i.normalized_name=old.normalized_name
      and i.item_number=regexp_replace(upper(trim(old.item_number)),'^[SBI][-_[:space:]]+','')
  );

  with incoming_names as (
    select distinct public.normalize_customer_price_name(x.customer_name) normalized_name
    from jsonb_to_recordset(p_prices) as x(customer_name text,item_number text,price numeric)
    where nullif(trim(x.customer_name),'') is not null and x.price>0
  )
  select count(*) into v_removed_customers
  from (select distinct normalized_name from public.customer_name_item_prices) old
  where not exists(select 1 from incoming_names i where i.normalized_name=old.normalized_name);

  if not coalesce(p_apply,false) then
    return jsonb_build_object('ok',true,'preview',true,'added',v_added,'changed',v_changed,'deleted',v_deleted,'removed_customers',v_removed_customers);
  end if;

  -- 이 함수 전체가 한 트랜잭션으로 실행되므로 중간 실패 시 기존 단가가 모두 복구됩니다.
  delete from public.customer_item_prices;
  delete from public.customer_name_item_prices;

  insert into public.customer_name_item_prices(normalized_name,customer_name,item_number,price,updated_at)
  select distinct on (public.normalize_customer_price_name(x.customer_name),
                      regexp_replace(upper(trim(x.item_number)),'^[SBI][-_[:space:]]+',''))
    public.normalize_customer_price_name(x.customer_name),
    trim(x.customer_name),
    regexp_replace(upper(trim(x.item_number)),'^[SBI][-_[:space:]]+',''),
    x.price::integer,
    now()
  from jsonb_to_recordset(p_prices) as x(customer_name text,item_number text,price numeric)
  where nullif(trim(x.customer_name),'') is not null
    and nullif(trim(x.item_number),'') is not null
    and x.price>0 and mod(x.price::integer,50)=0
  order by public.normalize_customer_price_name(x.customer_name),
           regexp_replace(upper(trim(x.item_number)),'^[SBI][-_[:space:]]+','');
  get diagnostics v_saved=row_count;

  insert into public.customer_item_prices(customer_id,item_number,price,updated_at)
  select c.id,p.item_number,p.price,now()
  from public.customer_name_item_prices p
  join public.customers c
    on coalesce(c.is_admin,false)=false
   and public.normalize_customer_price_name(c.business_name)=p.normalized_name
  on conflict(customer_id,item_number)
  do update set price=excluded.price,updated_at=now();
  get diagnostics v_id_saved=row_count;

  return jsonb_build_object('ok',true,'preview',false,'saved',v_saved,'id_saved',v_id_saved,'added',v_added,'changed',v_changed,'deleted',v_deleted,'removed_customers',v_removed_customers,'updated_open_orders',0);
end;
$$;

revoke all on function public.sync_customer_item_prices_from_excel(jsonb,boolean) from public;
grant execute on function public.sync_customer_item_prices_from_excel(jsonb,boolean) to authenticated;

commit;
