begin;

create or replace function public.normalize_customer_business_name(p_name text)
returns text language sql immutable parallel safe as $$
  select regexp_replace(lower(trim(coalesce(p_name,''))),'[[:space:]_.·ㆍ,()\[\]{}-]+','','g');
$$;

-- orders.customer_id는 customers.id 외래키입니다.
-- 미가입 대신주문은 접수 관리자 ID를 임시 사용하고 화면·미수금에서는 거래처명으로 분리합니다.
-- 해당 거래처가 가입하면 아래 트리거가 실제 가입 ID로 자동 연결합니다.
create or replace function public.proxy_customer_identity(p_customer_id uuid,p_customer_name text)
returns uuid language sql stable set search_path=public as $$
  select coalesce(p_customer_id,auth.uid());
$$;

create or replace function public.create_admin_proxy_order(
  p_order_number text,p_customer_id uuid,p_customer_name text,p_memo text,p_items jsonb
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_user uuid:=auth.uid();v_is_admin boolean:=false;v_item jsonb;v_count integer:=0;
  v_warehouse_code text;v_item_number text;v_qty integer;v_price integer;v_saved_price integer;v_customer_id uuid;
begin
  select coalesce(is_admin,false) and not coalesce(blocked,false) into v_is_admin from public.customers where id=v_user;
  if not coalesce(v_is_admin,false) then raise exception '관리자 권한이 필요합니다.';end if;
  if nullif(trim(p_order_number),'') is null then raise exception '주문번호가 없습니다.';end if;
  if nullif(trim(p_customer_name),'') is null then raise exception '거래처명이 없습니다.';end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception '주문 품목이 없습니다.';end if;
  v_customer_id:=public.proxy_customer_identity(p_customer_id,p_customer_name);
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_number:=trim(coalesce(v_item->>'item_number',''));if v_item_number='' then continue;end if;
    begin v_qty:=greatest(1,coalesce((v_item->>'qty')::integer,1));exception when others then v_qty:=1;end;
    begin v_price:=greatest(0,coalesce((v_item->>'price')::integer,0));exception when others then v_price:=0;end;
    if v_price<=0 then raise exception '품번 %의 확정단가가 올바르지 않습니다.',v_item_number;end if;
    v_warehouse_code:=nullif(upper(trim(coalesce(v_item->>'warehouse_code',''))),'');
    if v_warehouse_code is not null and v_warehouse_code not in ('S','B','I') then raise exception '출고지 코드는 S, B, I만 사용할 수 있습니다.';end if;
    insert into public.orders(order_number,customer_id,customer_name,memo,item_number,warehouse_code,qty,price,total,status,shipping_fee,is_soldout)
    values(trim(p_order_number),v_customer_id,trim(p_customer_name),coalesce(p_memo,''),v_item_number,v_warehouse_code,v_qty,v_price,v_qty*v_price,'주문접수',0,false)
    returning price into v_saved_price;
    if v_saved_price is distinct from v_price then raise exception '품번 % 단가 저장 검증 실패: 화면 %, 저장 %',v_item_number,v_price,v_saved_price;end if;
    v_count:=v_count+1;
  end loop;
  if v_count=0 then raise exception '저장할 주문 품목이 없습니다.';end if;
  return jsonb_build_object('ok',true,'order_number',p_order_number,'item_count',v_count,'customer_identity',v_customer_id);
end;$$;
revoke all on function public.create_admin_proxy_order(text,uuid,text,text,jsonb) from public;
grant execute on function public.create_admin_proxy_order(text,uuid,text,text,jsonb) to authenticated;

-- 실행 전 원본 식별값을 1회 백업합니다.
create table if not exists public.proxy_order_identity_repair_backup(
  order_row_id text primary key,order_number text,customer_name text,old_customer_id text,new_customer_id text,backed_up_at timestamptz default now()
);

with target as (
  select o.id::text row_id,o.order_number,o.customer_name,o.customer_id::text old_id,
         coalesce((select c.id::text from public.customers c
                   where coalesce(c.is_admin,false)=false
                     and public.normalize_customer_business_name(c.business_name)=public.normalize_customer_business_name(o.customer_name)
                   order by c.created_at asc limit 1),
                  o.customer_id::text) new_id
  from public.orders o
  where (o.order_number like 'ADMIN-%' or coalesce(o.memo,'') like '%[관리자 대신주문]%')
    and nullif(trim(coalesce(o.customer_name,'')),'') is not null
)
insert into public.proxy_order_identity_repair_backup(order_row_id,order_number,customer_name,old_customer_id,new_customer_id)
select row_id,order_number,customer_name,old_id,new_id from target
on conflict(order_row_id) do nothing;

update public.orders o set customer_id=b.new_customer_id::uuid
from public.proxy_order_identity_repair_backup b
where o.id::text=b.order_row_id and o.customer_id::text is distinct from b.new_customer_id;

-- 입금액은 그대로 두고, 주문에 연결된 거래처 식별값만 교정합니다.
update public.order_payment_records p set customer_key=x.customer_id::text,customer_name=x.customer_name,updated_at=now()
from (
  select order_number,min(customer_id::text) customer_id,min(customer_name) customer_name
  from public.orders where order_number like 'ADMIN-%' group by order_number
) x
where p.order_number=x.order_number and (p.customer_key is distinct from x.customer_id or p.customer_name is distinct from x.customer_name);

-- 주문의 실제 상품금액+배송비로 입금관리 주문금액을 복구합니다.
-- 입금액은 절대 변경하지 않으며 초과입금은 차액으로 표시됩니다.
create table if not exists public.order_payment_amount_repair_backup(
  payment_row_id text primary key,order_number text,old_order_amount numeric,new_order_amount numeric,
  paid_amount numeric,backed_up_at timestamptz default now()
);

with actual as (
  select o.order_number,
         sum(greatest(0,coalesce(o.qty,0)-coalesce(o.soldout_qty,case when coalesce(o.is_soldout,false) then o.qty else 0 end))*coalesce(o.price,0))
         + max(coalesce(o.shipping_fee,0)) as actual_amount
  from public.orders o group by o.order_number
)
insert into public.order_payment_amount_repair_backup(payment_row_id,order_number,old_order_amount,new_order_amount,paid_amount)
select p.id::text,p.order_number,p.order_amount,a.actual_amount,p.paid_amount
from public.order_payment_records p join actual a on a.order_number=p.order_number
where p.order_amount is distinct from a.actual_amount
on conflict(payment_row_id) do nothing;

with actual as (
  select o.order_number,
         sum(greatest(0,coalesce(o.qty,0)-coalesce(o.soldout_qty,case when coalesce(o.is_soldout,false) then o.qty else 0 end))*coalesce(o.price,0))
         + max(coalesce(o.shipping_fee,0)) as actual_amount
  from public.orders o group by o.order_number
)
update public.order_payment_records p
set order_amount=a.actual_amount,
    payment_status=case when coalesce(p.paid_amount,0)>=a.actual_amount then '입금완료'
                        when coalesce(p.paid_amount,0)>0 then '일부입금' else '미입금' end,
    updated_at=now()
from actual a where p.order_number=a.order_number and p.order_amount is distinct from a.actual_amount;

-- 미가입 거래처가 나중에 가입하면 동일 거래처명의 대신주문과 입금기록을 실제 가입 ID로 이어 붙입니다.
create or replace function public.link_proxy_orders_after_customer_signup()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_order_number text;
begin
  if coalesce(new.is_admin,false) or public.normalize_customer_business_name(new.business_name)='' then return new;end if;
  for v_order_number in
    select distinct o.order_number from public.orders o
    where (o.order_number like 'ADMIN-%' or coalesce(o.memo,'') like '%[관리자 대신주문]%')
      and public.normalize_customer_business_name(o.customer_name)=public.normalize_customer_business_name(new.business_name)
  loop
    update public.orders set customer_id=new.id
    where order_number=v_order_number
      and public.normalize_customer_business_name(customer_name)=public.normalize_customer_business_name(new.business_name);
    update public.order_payment_records set customer_key=new.id::text,customer_name=new.business_name,updated_at=now()
    where order_number=v_order_number;
  end loop;
  return new;
end;$$;

drop trigger if exists customers_link_proxy_orders_after_signup on public.customers;
create trigger customers_link_proxy_orders_after_signup
after insert or update of business_name,is_admin on public.customers
for each row execute function public.link_proxy_orders_after_customer_signup();

-- 신규 거래처명은 공백·특수기호를 금지합니다. 기존 행은 이름을 수정하지 않는 한 영향받지 않습니다.
create or replace function public.validate_customer_business_name_chars()
returns trigger language plpgsql set search_path=public as $$
declare v_name text:=coalesce(new.business_name,'');
begin
  if not coalesce(new.is_admin,false) then
    if v_name='' or regexp_replace(v_name,'[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9]','','g')<>'' then
      raise exception '거래처명은 공백·특수기호 없이 한글·영문·숫자만 입력할 수 있습니다.';
    end if;
  end if;
  return new;
end;$$;

drop trigger if exists customers_validate_business_name_chars on public.customers;
create trigger customers_validate_business_name_chars
before insert or update of business_name on public.customers
for each row execute function public.validate_customer_business_name_chars();

commit;

-- 확인: 아래 결과가 0행이면 같은 주문번호가 여러 거래처명/ID로 섞이지 않은 상태입니다.
select order_number,count(distinct customer_name) customer_names,count(distinct customer_id::text) customer_ids
from public.orders group by order_number
having count(distinct customer_name)>1 or count(distinct customer_id::text)>1;
