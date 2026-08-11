begin;

alter table public.orders add column if not exists customer_revision_status text;
alter table public.orders add column if not exists customer_revision_started_at timestamptz;
alter table public.orders add column if not exists customer_revision_completed_at timestamptz;
alter table public.orders add column if not exists customer_revision_confirmed_at timestamptz;
alter table public.orders add column if not exists shipped_at timestamptz;

update public.orders
set shipped_at=coalesce(picking_verified_at,created_at)
where status='출고완료' and shipped_at is null;

create table if not exists public.order_revision_history(
  id bigserial primary key,
  order_number text not null,
  customer_id uuid not null,
  customer_name text,
  original_snapshot jsonb not null default '[]'::jsonb,
  revised_snapshot jsonb,
  revision_status text not null default '수정중',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid
);
create index if not exists idx_order_revision_history_order on public.order_revision_history(order_number,started_at desc);
alter table public.order_revision_history enable row level security;
drop policy if exists order_revision_history_select on public.order_revision_history;
create policy order_revision_history_select on public.order_revision_history for select to authenticated
using(customer_id=auth.uid() or public.is_inventory_admin());

create or replace function public.customer_begin_order_revision(p_order_number text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_rows jsonb;v_name text;v_batch uuid;v_verified boolean:=false;v_row record;
  v_item public.inventory_items;v_before integer;v_after integer;v_restored integer:=0;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
  perform 1 from public.orders where order_number=p_order_number and customer_id=auth.uid() for update;
  if not found then raise exception '본인의 주문을 찾을 수 없습니다.';end if;
  if exists(select 1 from public.orders where order_number=p_order_number and customer_id=auth.uid() and status='출고완료') then
    raise exception '출고완료 주문은 수정할 수 없습니다.';
  end if;
  if exists(select 1 from public.orders where order_number=p_order_number and customer_id=auth.uid() and customer_revision_status='수정완료') then
    raise exception '관리자가 변경사항을 확인 중입니다.';
  end if;
  if exists(select 1 from public.orders where order_number=p_order_number and customer_id=auth.uid() and customer_revision_status='수정중') then
    return jsonb_build_object('ok',true,'order_number',p_order_number,'already_started',true);
  end if;

  select jsonb_agg(to_jsonb(o) order by o.id),min(customer_name),max(picking_batch_id::text)::uuid,
         bool_or(coalesce(picking_status,'') in ('검증완료','부분품절 검증완료'))
    into v_rows,v_name,v_batch,v_verified
    from public.orders o where order_number=p_order_number and customer_id=auth.uid();

  if coalesce(v_verified,false) then
    for v_row in
      select m.item_number,sum(m.quantity)::integer qty from public.inventory_movements m
       where m.order_number=p_order_number and m.movement_type='OUT' and m.source='ORDER_PICKING'
         and ((v_batch is not null and m.picking_batch_id=v_batch) or (v_batch is null and m.picking_batch_id is null))
         and not exists(select 1 from public.inventory_movements r where r.order_number=p_order_number
           and r.source='ORDER_PICKING_RESET' and r.picking_batch_id is not distinct from m.picking_batch_id)
       group by m.item_number
    loop
      select * into v_item from public.inventory_items where item_number=v_row.item_number for update;
      if not found then raise exception '복원할 재고 품번이 없습니다: %',v_row.item_number;end if;
      v_before:=v_item.quantity;v_after:=v_before+v_row.qty;
      update public.inventory_items set quantity=v_after,updated_at=now(),updated_by=auth.uid() where item_number=v_item.item_number;
      insert into public.inventory_movements(item_number,movement_type,quantity,quantity_before,quantity_after,source,order_number,customer_id,customer_name,device_name,created_by,picking_batch_id)
      values(v_item.item_number,'IN',v_row.qty,v_before,v_after,'ORDER_PICKING_RESET',p_order_number,auth.uid(),v_name,'고객 주문수정 시작',auth.uid(),v_batch);
      v_restored:=v_restored+v_row.qty;
    end loop;
  end if;

  update public.orders set picked_qty=0,soldout_qty=0,is_soldout=false,picking_status='대기',
    picking_started_at=null,picking_verified_at=null,picking_verified_by=null,picking_batch_id=null,
    picking_session_active=false,customer_revision_status='수정중',customer_revision_started_at=now(),
    customer_revision_completed_at=null,customer_revision_confirmed_at=null
  where order_number=p_order_number and customer_id=auth.uid();

  insert into public.order_revision_history(order_number,customer_id,customer_name,original_snapshot,revision_status)
  values(p_order_number,auth.uid(),v_name,v_rows,'수정중');
  insert into public.app_notifications(recipient_id,notification_type,title,message,is_read,link_url)
  select c.id,'customer_order_change','고객 주문 수정중',
    format('%s · 주문번호 %s · 고객이 주문을 수정하고 있습니다.',coalesce(v_name,'거래처 미입력'),p_order_number),
    false,'admin.html?view=orders&search='||p_order_number
  from public.customers c where c.is_admin=true and coalesce(c.blocked,false)=false;
  return jsonb_build_object('ok',true,'order_number',p_order_number,'restored_quantity',v_restored);
end;$$;
revoke all on function public.customer_begin_order_revision(text) from public;
grant execute on function public.customer_begin_order_revision(text) to authenticated;

create or replace function public.customer_complete_order_revision(
  p_order_number text,p_items jsonb,p_memo text,p_delivery_name text,p_delivery_phone text,p_delivery_address text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_base public.orders%rowtype;v_entry jsonb;v_item text;v_warehouse text;v_qty integer;v_price numeric;v_existing_price numeric;v_count integer;v_snapshot jsonb;v_name text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
  if coalesce(jsonb_typeof(p_items),'')<>'array' or coalesce(jsonb_array_length(p_items),0)=0 then raise exception '수정 주문 품목이 없습니다.';end if;
  select * into v_base from public.orders where order_number=p_order_number and customer_id=auth.uid() order by id limit 1 for update;
  if not found then raise exception '본인의 주문을 찾을 수 없습니다.';end if;
  if v_base.status='출고완료' then raise exception '출고완료 주문은 수정할 수 없습니다.';end if;
  if coalesce(v_base.customer_revision_status,'')<>'수정중' then raise exception '수정중인 주문이 아닙니다.';end if;

  for v_entry in select value from jsonb_array_elements(p_items)
  loop
    v_item=upper(trim(v_entry->>'item_number'));v_warehouse=nullif(upper(trim(v_entry->>'warehouse_code')),'');
    v_qty=coalesce((v_entry->>'qty')::integer,0);v_price=coalesce((v_entry->>'price')::numeric,0);
    if v_item='' or v_qty<=0 or v_price<0 then raise exception '품번·수량·단가 형식이 올바르지 않습니다.';end if;
    if (select count(*) from jsonb_array_elements(p_items) x where upper(trim(x->>'item_number'))=v_item and coalesce(upper(trim(x->>'warehouse_code')),'')=coalesce(v_warehouse,''))>1 then
      raise exception '중복 품번이 있습니다: %',v_item;
    end if;
  end loop;

  delete from public.orders o where o.order_number=p_order_number and o.customer_id=auth.uid()
    and not exists(select 1 from jsonb_array_elements(p_items) x
      where upper(trim(x->>'item_number'))=upper(trim(o.item_number))
        and coalesce(upper(trim(x->>'warehouse_code')),'')=coalesce(upper(trim(o.warehouse_code)),'') );

  for v_entry in select value from jsonb_array_elements(p_items)
  loop
    v_item=upper(trim(v_entry->>'item_number'));v_warehouse=nullif(upper(trim(v_entry->>'warehouse_code')),'');
    v_qty=(v_entry->>'qty')::integer;v_price=(v_entry->>'price')::numeric;
    select price into v_existing_price from public.orders where order_number=p_order_number and customer_id=auth.uid()
      and upper(trim(item_number))=v_item and coalesce(upper(trim(warehouse_code)),'')=coalesce(v_warehouse,'') limit 1;
    update public.orders set qty=v_qty,total=v_qty*price,memo=coalesce(p_memo,''),delivery_name=trim(p_delivery_name),
      delivery_phone=nullif(trim(p_delivery_phone),''),delivery_address=nullif(trim(p_delivery_address),''),status='주문접수',
      picked_qty=0,soldout_qty=0,is_soldout=false,picking_status='대기',customer_revision_status='수정완료',
      customer_revision_completed_at=now()
    where order_number=p_order_number and customer_id=auth.uid() and upper(trim(item_number))=v_item
      and coalesce(upper(trim(warehouse_code)),'')=coalesce(v_warehouse,'');
    get diagnostics v_count=row_count;
    if v_count=0 then
      insert into public.orders(order_number,customer_id,customer_name,customer_owner_name,delivery_name,delivery_phone,delivery_address,
        memo,item_number,warehouse_code,qty,price,total,status,shipping_fee,is_soldout,created_at,customer_revision_status,
        customer_revision_started_at,customer_revision_completed_at,courier,tracking_number,payment_account_id,payment_account_label,
        payment_bank_name,payment_account_number,payment_account_holder)
      values(p_order_number,auth.uid(),v_base.customer_name,v_base.customer_owner_name,trim(p_delivery_name),nullif(trim(p_delivery_phone),''),
        nullif(trim(p_delivery_address),''),coalesce(p_memo,''),v_item,v_warehouse,v_qty,v_price,v_qty*v_price,'주문접수',
        v_base.shipping_fee,false,v_base.created_at,'수정완료',v_base.customer_revision_started_at,now(),v_base.courier,
        v_base.tracking_number,v_base.payment_account_id,v_base.payment_account_label,v_base.payment_bank_name,
        v_base.payment_account_number,v_base.payment_account_holder);
    end if;
  end loop;

  select jsonb_agg(to_jsonb(o) order by o.id),min(customer_name) into v_snapshot,v_name
    from public.orders o where order_number=p_order_number and customer_id=auth.uid();
  update public.order_revision_history set revised_snapshot=v_snapshot,revision_status='수정완료',completed_at=now()
   where id=(select id from public.order_revision_history where order_number=p_order_number and customer_id=auth.uid() and revision_status='수정중' order by started_at desc limit 1);
  insert into public.app_notifications(recipient_id,notification_type,title,message,is_read,link_url)
  select c.id,'customer_order_change','고객 주문 수정완료',
    format('%s · 주문번호 %s · 변경사항을 확인한 뒤 재피킹해주세요.',coalesce(v_name,'거래처 미입력'),p_order_number),
    false,'admin.html?view=orders&search='||p_order_number
  from public.customers c where c.is_admin=true and coalesce(c.blocked,false)=false;
  return jsonb_build_object('ok',true,'order_number',p_order_number,'items',jsonb_array_length(p_items));
end;$$;
revoke all on function public.customer_complete_order_revision(text,jsonb,text,text,text,text) from public;
grant execute on function public.customer_complete_order_revision(text,jsonb,text,text,text,text) to authenticated;

create or replace function public.admin_confirm_order_revision(p_order_number text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_customer uuid;v_name text;
begin
  if not public.is_inventory_admin() then raise exception '관리자 권한이 필요합니다.';end if;
  select customer_id,customer_name into v_customer,v_name from public.orders where order_number=p_order_number limit 1 for update;
  if not found then raise exception '주문을 찾을 수 없습니다.';end if;
  if not exists(select 1 from public.orders where order_number=p_order_number and customer_revision_status='수정완료') then raise exception '고객 수정완료 주문이 아닙니다.';end if;
  update public.orders set customer_revision_status=null,customer_revision_confirmed_at=now(),picking_status='대기'
   where order_number=p_order_number;
  update public.order_revision_history set revision_status='확인완료',confirmed_at=now(),confirmed_by=auth.uid()
   where id=(select id from public.order_revision_history where order_number=p_order_number and revision_status='수정완료' order by started_at desc limit 1);
  insert into public.app_notifications(recipient_id,notification_type,title,message,is_read,link_url)
  values(v_customer,'customer_order_change','주문 변경 확인완료',format('주문번호 %s · 관리자가 변경사항을 확인했습니다.',p_order_number),false,'order.html');
  return jsonb_build_object('ok',true,'order_number',p_order_number,'customer_name',v_name);
end;$$;
revoke all on function public.admin_confirm_order_revision(text) from public;
grant execute on function public.admin_confirm_order_revision(text) to authenticated;

create or replace function public.complete_order_shipping(p_order_number text,p_shipping_fee numeric,p_courier text,p_tracking_number text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_rows integer;
begin
  if not public.is_inventory_admin() then raise exception '관리자 권한이 필요합니다.';end if;
  if exists(select 1 from public.orders where order_number=p_order_number and customer_revision_status is not null) then raise exception '고객 주문변경 확인을 먼저 완료해주세요.';end if;
  if not exists(select 1 from public.orders where order_number=p_order_number and coalesce(picking_status,'') in ('검증완료','부분품절 검증완료')) then raise exception '피킹 최종검증을 먼저 완료해주세요.';end if;
  update public.orders set status='출고완료',shipping_fee=coalesce(p_shipping_fee,0),courier=coalesce(nullif(trim(p_courier),''),'로젠택배'),
    tracking_number=coalesce(p_tracking_number,''),shipped_at=now() where order_number=p_order_number and status<>'출고완료';
  get diagnostics v_rows=row_count;
  if v_rows=0 then raise exception '출고완료 처리할 주문을 찾을 수 없습니다.';end if;
  return jsonb_build_object('ok',true,'order_number',p_order_number,'updated_rows',v_rows,'shipped_at',now());
end;$$;
revoke all on function public.complete_order_shipping(text,numeric,text,text) from public;
grant execute on function public.complete_order_shipping(text,numeric,text,text) to authenticated;

commit;
