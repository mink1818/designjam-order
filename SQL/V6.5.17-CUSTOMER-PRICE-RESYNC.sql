begin;

-- 중요: customer_name_item_prices의 거래처명 단가가 운영 기준입니다.
-- 이후 기능 추가 시 customer_item_prices(ID 단가)가 이 값을 우선하도록 변경하지 마세요.

-- 거래처명 전용단가를 같은 상호의 모든 가입계정 ID 단가에 다시 연결합니다.
insert into public.customer_item_prices(customer_id,item_number,price,updated_at)
select c.id,np.item_number,np.price,now()
from public.customer_name_item_prices np
join public.customers c
  on coalesce(c.is_admin,false)=false
 and public.normalize_customer_price_name(c.business_name)=np.normalized_name
where np.price>0
on conflict(customer_id,item_number)
do update set price=excluded.price,updated_at=now();

-- 단가표 갱신은 이미 접수된 주문가격을 변경하지 않습니다.
-- 이 함수를 재정의하여 과거 V6.5.2의 미출고 주문 자동변경 동작을 제거합니다.
create or replace function public.upsert_customer_item_prices(p_prices jsonb)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_row jsonb;v_customer uuid;v_item text;v_price integer;v_saved integer:=0;
begin
  if not public.is_inventory_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  if p_prices is null or jsonb_typeof(p_prices)<>'array' then raise exception '단가 자료 형식이 올바르지 않습니다.'; end if;
  for v_row in select * from jsonb_array_elements(p_prices)
  loop
    begin v_customer:=(v_row->>'customer_id')::uuid; exception when others then continue; end;
    v_item:=regexp_replace(upper(trim(coalesce(v_row->>'item_number',''))),'^[SBI][-_[:space:]]+','');
    begin v_price:=(v_row->>'price')::integer; exception when others then continue; end;
    if v_customer is null or v_item='' or v_price<=0 or mod(v_price,50)<>0 then continue; end if;
    if not exists(select 1 from public.customers where id=v_customer and coalesce(is_admin,false)=false) then continue; end if;
    insert into public.customer_item_prices(customer_id,item_number,price,updated_at)
    values(v_customer,v_item,v_price,now())
    on conflict(customer_id,item_number) do update set price=excluded.price,updated_at=now();
    v_saved:=v_saved+1;
  end loop;
  return jsonb_build_object('ok',true,'saved',v_saved,'updated_open_orders',0);
end;$$;

-- 거래처 본인 화면: 동일 상호의 최신 거래처명 단가를 ID 단가보다 우선합니다.
create or replace function public.get_my_customer_item_prices()
returns table(item_number text,price integer)
language sql stable security definer set search_path=public
as $$
  select distinct on (source.item_number) source.item_number,source.price
  from (
    select np.item_number,np.price,1 as priority
    from public.customer_name_item_prices np
    join public.customers c on c.id=auth.uid()
    where np.normalized_name=public.normalize_customer_price_name(c.business_name) and np.price>0
    union all
    select p.item_number,p.price,2 as priority
    from public.customer_item_prices p where p.customer_id=auth.uid() and p.price>0
  ) source
  order by source.item_number,source.priority;
$$;

-- 관리자 대신주문: 등록 거래처도 거래처명 최신단가를 우선합니다.
create or replace function public.get_customer_item_prices_for_admin(p_customer_id uuid)
returns table(item_number text,price integer)
language plpgsql stable security definer set search_path=public
as $$
begin
  if not public.is_inventory_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  return query
  select distinct on (source.item_number) source.item_number,source.price
  from (
    select np.item_number,np.price,1 as priority
    from public.customer_name_item_prices np
    join public.customers c on c.id=p_customer_id
    where np.normalized_name=public.normalize_customer_price_name(c.business_name) and np.price>0
    union all
    select p.item_number,p.price,2 as priority
    from public.customer_item_prices p where p.customer_id=p_customer_id and p.price>0
  ) source
  order by source.item_number,source.priority;
end;
$$;

create or replace function public.get_customer_item_prices_by_name_for_admin(p_customer_name text)
returns table(item_number text,price integer)
language plpgsql stable security definer set search_path=public
as $$
begin
  if not public.is_inventory_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  return query select p.item_number,p.price
  from public.customer_name_item_prices p
  where p.normalized_name=public.normalize_customer_price_name(p_customer_name) and p.price>0
  order by p.item_number;
end;
$$;

-- 저장 직전에도 거래처명 최신단가를 우선하여 주문 가격을 확정합니다.
create or replace function public.apply_customer_item_price_to_order()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_price integer; v_name text; v_item text;
begin
  if new.customer_id is null then return new; end if;
  v_item:=regexp_replace(upper(trim(new.item_number)),'^[SBI][-_[:space:]]+','');
  select business_name into v_name from public.customers where id=new.customer_id;
  select p.price into v_price from public.customer_name_item_prices p
   where p.normalized_name=public.normalize_customer_price_name(v_name)
     and regexp_replace(upper(trim(p.item_number)),'^[SBI][-_[:space:]]+','')=v_item
   order by p.updated_at desc nulls last,p.id desc limit 1;
  if not found then
    select p.price into v_price from public.customer_item_prices p
     where p.customer_id=new.customer_id
       and regexp_replace(upper(trim(p.item_number)),'^[SBI][-_[:space:]]+','')=v_item
     order by p.updated_at desc nulls last,p.id desc limit 1;
  end if;
  if v_price is not null then new.price:=v_price;new.total:=greatest(0,coalesce(new.qty,0))*v_price;end if;
  return new;
end;$$;

drop trigger if exists orders_apply_customer_item_price on public.orders;
create trigger orders_apply_customer_item_price before insert on public.orders
for each row execute function public.apply_customer_item_price_to_order();

grant execute on function public.upsert_customer_item_prices(jsonb) to authenticated;
grant execute on function public.get_my_customer_item_prices() to authenticated;
grant execute on function public.get_customer_item_prices_for_admin(uuid) to authenticated;
grant execute on function public.get_customer_item_prices_by_name_for_admin(text) to authenticated;

commit;
