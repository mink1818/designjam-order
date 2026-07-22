-- DESIGN SOCKS V6.2.4 최종 안정화
-- Supabase SQL Editor에서 전체 실행하세요.

alter table public.customers add column if not exists admin_role text not null default 'admin';
alter table public.inventory_movements add column if not exists customer_name text not null default '';
alter table public.inventory_movements add column if not exists order_number text;

create or replace function public.create_admin_proxy_order(
  p_order_number text,
  p_customer_id uuid,
  p_customer_name text,
  p_memo text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean := false;
  v_item jsonb;
  v_count integer := 0;
begin
  select coalesce(is_admin,false) and not coalesce(blocked,false)
    into v_is_admin
  from public.customers
  where id = v_user;

  if not coalesce(v_is_admin,false) then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if nullif(trim(p_order_number),'') is null then raise exception '주문번호가 없습니다.'; end if;
  if nullif(trim(p_customer_name),'') is null then raise exception '거래처명이 없습니다.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception '주문 품목이 없습니다.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if nullif(trim(v_item->>'item_number'),'') is null then continue; end if;
    insert into public.orders(
      order_number, customer_id, customer_name, memo,
      item_number, qty, price, total, status, shipping_fee, is_soldout
    ) values (
      trim(p_order_number), coalesce(p_customer_id,v_user), trim(p_customer_name), coalesce(p_memo,''),
      trim(v_item->>'item_number'), greatest(1,coalesce((v_item->>'qty')::integer,1)),
      greatest(0,coalesce((v_item->>'price')::numeric,0)),
      greatest(0,coalesce((v_item->>'total')::numeric,0)),
      '주문접수',0,false
    );
    v_count := v_count + 1;
  end loop;

  if v_count=0 then raise exception '저장할 주문 품목이 없습니다.'; end if;
  return jsonb_build_object('ok',true,'order_number',p_order_number,'item_count',v_count);
end;
$$;

grant execute on function public.create_admin_proxy_order(text,uuid,text,text,jsonb) to authenticated;

create or replace function public.apply_inventory_scan(
  p_item_number text,
  p_mode text,
  p_increment integer default 1,
  p_device_name text default '',
  p_order_number text default null,
  p_customer_name text default ''
) returns public.inventory_items
language plpgsql
security definer
set search_path=public
as $$
declare
  v_item public.inventory_items;
  v_mode text := upper(trim(coalesce(p_mode,'')));
  v_before integer;
  v_after integer;
begin
  if v_mode not in ('IN','OUT') then raise exception '입출고 구분이 올바르지 않습니다.'; end if;
  if coalesce(p_increment,0)<=0 then raise exception '수량은 1 이상이어야 합니다.'; end if;
  if v_mode='OUT' and nullif(trim(coalesce(p_customer_name,'')),'') is null then
    raise exception '출고 거래처명을 입력하세요.';
  end if;

  select * into v_item from public.inventory_items
  where upper(trim(item_number))=upper(trim(p_item_number)) or upper(trim(coalesce(barcode,'')))=upper(trim(p_item_number))
  for update;
  if not found then raise exception '재고에 등록되지 않은 품번입니다: %', p_item_number; end if;

  v_before := coalesce(v_item.quantity,0);
  v_after := case when v_mode='IN' then v_before+p_increment else v_before-p_increment end;
  if v_after<0 then raise exception '재고 부족: 현재 %, 출고 %',v_before,p_increment; end if;

  update public.inventory_items set quantity=v_after,updated_at=now(),updated_by=auth.uid()
  where item_number=v_item.item_number returning * into v_item;

  insert into public.inventory_movements(
    item_number,movement_type,quantity,quantity_before,quantity_after,
    source,order_number,customer_name,device_name,created_by
  ) values (
    v_item.item_number,v_mode,p_increment,v_before,v_after,'SCANNER',
    nullif(trim(coalesce(p_order_number,'')),''),
    case when v_mode='OUT' then trim(coalesce(p_customer_name,'')) else trim(coalesce(p_customer_name,'')) end,
    coalesce(p_device_name,''),auth.uid()
  );
  return v_item;
end;
$$;

grant execute on function public.apply_inventory_scan(text,text,integer,text,text,text) to authenticated;
