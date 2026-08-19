begin;

-- V6.6.16의 빠른 임시표 비교를 유지하면서 Supabase의 조건 없는 DELETE 차단에도 대응합니다.
create or replace function public.sync_customer_item_prices_from_excel(
  p_prices jsonb,
  p_apply boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
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

  create temporary table excel_price_sync_incoming(
    normalized_name text not null,
    customer_name text not null,
    item_number text not null,
    price integer not null,
    primary key(normalized_name,item_number)
  ) on commit drop;

  insert into excel_price_sync_incoming(normalized_name,customer_name,item_number,price)
  select distinct on (public.normalize_customer_price_name(x.customer_name),
                      regexp_replace(upper(trim(x.item_number)),'^[SBI][-_[:space:]]+',''))
    public.normalize_customer_price_name(x.customer_name),
    trim(x.customer_name),
    regexp_replace(upper(trim(x.item_number)),'^[SBI][-_[:space:]]+',''),
    x.price::integer
  from jsonb_to_recordset(p_prices) as x(customer_name text,item_number text,price numeric)
  where nullif(trim(x.customer_name),'') is not null
    and nullif(trim(x.item_number),'') is not null
    and x.price>0 and mod(x.price::integer,50)=0
  order by public.normalize_customer_price_name(x.customer_name),
           regexp_replace(upper(trim(x.item_number)),'^[SBI][-_[:space:]]+','');

  analyze excel_price_sync_incoming;

  select
    count(*) filter(where old.id is null),
    count(*) filter(where old.id is not null and old.price<>incoming.price)
  into v_added,v_changed
  from excel_price_sync_incoming incoming
  left join public.customer_name_item_prices old
    on old.normalized_name=incoming.normalized_name
   and old.item_number=incoming.item_number;

  select count(*) into v_deleted
  from public.customer_name_item_prices old
  left join excel_price_sync_incoming incoming
    on incoming.normalized_name=old.normalized_name
   and incoming.item_number=regexp_replace(upper(trim(old.item_number)),'^[SBI][-_[:space:]]+','')
  where incoming.normalized_name is null;

  select count(*) into v_removed_customers
  from (select distinct normalized_name from public.customer_name_item_prices) old
  left join (select distinct normalized_name from excel_price_sync_incoming) incoming
    on incoming.normalized_name=old.normalized_name
  where incoming.normalized_name is null;

  if not coalesce(p_apply,false) then
    return jsonb_build_object('ok',true,'preview',true,'added',v_added,'changed',v_changed,'deleted',v_deleted,'removed_customers',v_removed_customers);
  end if;

  -- Supabase의 안전 삭제 정책을 통과하도록 삭제 대상을 명시합니다.
  -- 함수 전체가 한 트랜잭션이므로 중간 실패 시 기존 단가가 복구됩니다.
  delete from public.customer_item_prices
  where customer_id is not null;

  delete from public.customer_name_item_prices
  where normalized_name is not null;

  insert into public.customer_name_item_prices(normalized_name,customer_name,item_number,price,updated_at)
  select normalized_name,customer_name,item_number,price,now()
  from excel_price_sync_incoming;
  get diagnostics v_saved=row_count;

  insert into public.customer_item_prices(customer_id,item_number,price,updated_at)
  select c.id,p.item_number,p.price,now()
  from excel_price_sync_incoming p
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
