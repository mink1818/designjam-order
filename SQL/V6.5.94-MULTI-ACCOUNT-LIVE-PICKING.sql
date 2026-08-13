begin;

alter table public.orders
  add column if not exists picking_assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists picking_assigned_name text,
  add column if not exists picking_assigned_device text,
  add column if not exists picking_assigned_at timestamptz;

create index if not exists idx_orders_picking_assigned_to
  on public.orders(picking_assigned_to, picking_session_active)
  where picking_assigned_to is not null;

-- 이전 버전의 공용 피킹중 상태에는 담당자가 없으므로 설치 시 안전하게 해제합니다.
update public.orders set picking_session_active=false
where coalesce(picking_session_active,false)=true and picking_assigned_to is null;

create or replace function public.claim_order_picking(
  p_order_number text,
  p_device_name text default '',
  p_force boolean default false
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_user uuid:=auth.uid();v_name text;v_role text;v_owner uuid;v_owner_name text;v_rows integer;
begin
  select coalesce(nullif(trim(business_name),''),nullif(trim(owner_name),''),email,'관리자'),coalesce(admin_role,'admin')
    into v_name,v_role from public.customers
   where id=v_user and is_admin=true and coalesce(blocked,false)=false;
  if v_name is null then raise exception '사용 가능한 관리자·매니저 계정이 아닙니다.';end if;
  if exists(select 1 from public.orders where picking_assigned_to=v_user and coalesce(picking_session_active,false)=true and order_number<>p_order_number) then
    raise exception '이미 다른 주문을 피킹 중입니다. 현재 작업을 종료한 뒤 시작하세요.';
  end if;
  perform 1 from public.orders where order_number=p_order_number for update;
  if not found then raise exception '피킹할 주문을 찾을 수 없습니다.';end if;
  select picking_assigned_to,picking_assigned_name into v_owner,v_owner_name
    from public.orders where order_number=p_order_number and picking_assigned_to is not null limit 1;
  if v_owner is not null and v_owner<>v_user and not (p_force and v_role in ('admin','developer_admin')) then
    raise exception '이미 % 계정이 피킹 중입니다.',coalesce(v_owner_name,'다른 관리자');
  end if;
  update public.orders set
    picking_session_active=true,
    picking_assigned_to=v_user,
    picking_assigned_name=v_name,
    picking_assigned_device=left(coalesce(p_device_name,''),200),
    picking_assigned_at=coalesce(picking_assigned_at,now())
  where order_number=p_order_number;
  get diagnostics v_rows=row_count;
  return jsonb_build_object('ok',true,'order_number',p_order_number,'assigned_to',v_user,'assigned_name',v_name,'updated_rows',v_rows);
end $$;

create or replace function public.release_order_picking(
  p_order_number text,
  p_force boolean default false
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid();v_role text;v_owner uuid;v_rows integer;
begin
  select coalesce(admin_role,'admin') into v_role from public.customers
   where id=v_user and is_admin=true and coalesce(blocked,false)=false;
  if v_role is null then raise exception '관리자 권한이 필요합니다.';end if;
  perform 1 from public.orders where order_number=p_order_number for update;
  if not found then raise exception '주문을 찾을 수 없습니다.';end if;
  select picking_assigned_to into v_owner from public.orders where order_number=p_order_number and picking_assigned_to is not null limit 1;
  if v_owner is not null and v_owner<>v_user and not (p_force and v_role in ('admin','developer_admin')) then
    raise exception '다른 작업자의 피킹은 관리자만 해제할 수 있습니다.';
  end if;
  update public.orders set picking_session_active=false,picking_assigned_to=null,picking_assigned_name=null,
    picking_assigned_device=null,picking_assigned_at=null where order_number=p_order_number;
  get diagnostics v_rows=row_count;
  return jsonb_build_object('ok',true,'order_number',p_order_number,'updated_rows',v_rows);
end $$;

create or replace function public.increment_assigned_order_pick(
  p_order_number text,
  p_order_row_id bigint,
  p_increment integer default 1
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid();v_row public.orders%rowtype;v_next integer;v_add integer;
begin
  if p_increment not between 1 and 100 then raise exception '스캔수량이 올바르지 않습니다.';end if;
  select * into v_row from public.orders where id=p_order_row_id and order_number=p_order_number for update;
  if not found then raise exception '피킹 품번을 찾을 수 없습니다.';end if;
  if not coalesce(v_row.picking_session_active,false) or v_row.picking_assigned_to is distinct from v_user then
    raise exception '이 주문의 피킹 담당자가 아닙니다. 피킹시작을 먼저 눌러주세요.';
  end if;
  v_next:=least(coalesce(v_row.qty,0)-coalesce(v_row.soldout_qty,0),coalesce(v_row.picked_qty,0)+p_increment);
  v_add:=greatest(0,v_next-coalesce(v_row.picked_qty,0));
  update public.orders set picked_qty=v_next,picking_status=case when v_next+coalesce(soldout_qty,0)>0 then '피킹중' else '대기' end,
    picking_started_at=coalesce(picking_started_at,now()) where id=v_row.id;
  return jsonb_build_object('ok',true,'id',v_row.id,'picked_qty',v_next,'soldout_qty',coalesce(v_row.soldout_qty,0),'added',v_add,'qty',coalesce(v_row.qty,0));
end $$;

revoke all on function public.claim_order_picking(text,text,boolean) from public;
revoke all on function public.release_order_picking(text,boolean) from public;
revoke all on function public.increment_assigned_order_pick(text,bigint,integer) from public;
grant execute on function public.claim_order_picking(text,text,boolean) to authenticated;
grant execute on function public.release_order_picking(text,boolean) to authenticated;
grant execute on function public.increment_assigned_order_pick(text,bigint,integer) to authenticated;

-- 매니저는 피킹·대신주문·ERP 작업만 수행하며 주문의 거래처/납품/배송정보는 수정할 수 없습니다.
create or replace function public.admin_update_order_party_info(p_order_number text,p_customer_name text,p_owner_name text,p_delivery_name text,p_delivery_phone text,p_delivery_address text,p_memo text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_rows integer;v_role text;
begin
  select admin_role into v_role from public.customers where id=auth.uid() and is_admin=true and coalesce(blocked,false)=false;
  if coalesce(v_role,'') not in ('admin','developer_admin') then raise exception '거래처·납품정보 수정은 관리자만 가능합니다.';end if;
  if nullif(trim(p_customer_name),'') is null then raise exception '거래처명을 입력하세요.';end if;
  update public.orders set customer_name=trim(p_customer_name),customer_owner_name=nullif(trim(p_owner_name),''),delivery_name=coalesce(nullif(trim(p_delivery_name),''),trim(p_customer_name)),delivery_phone=nullif(trim(p_delivery_phone),''),delivery_address=nullif(trim(p_delivery_address),''),memo=nullif(trim(p_memo),'') where order_number=p_order_number;
  get diagnostics v_rows=row_count;if v_rows=0 then raise exception '주문을 찾을 수 없습니다.';end if;
  return jsonb_build_object('ok',true,'updated_rows',v_rows);
end $$;

create or replace function public.save_order_shipping_bundle(p_order_number text,p_shipping_fee numeric,p_courier text,p_tracking_number text,p_payment_account_id uuid,p_payment_account_label text,p_payment_bank_name text,p_payment_account_number text,p_payment_account_holder text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_role text;v_rows integer;
begin
  select admin_role into v_role from public.customers where id=auth.uid() and is_admin=true and coalesce(blocked,false)=false;
  if coalesce(v_role,'') not in ('admin','developer_admin') then raise exception '배송정보 수정은 관리자만 가능합니다.';end if;
  update public.orders set shipping_fee=greatest(coalesce(p_shipping_fee,0),0),courier=coalesce(nullif(trim(p_courier),''),'로젠택배'),tracking_number=coalesce(trim(p_tracking_number),''),payment_account_id=p_payment_account_id,payment_account_label=coalesce(p_payment_account_label,''),payment_bank_name=coalesce(p_payment_bank_name,''),payment_account_number=coalesce(p_payment_account_number,''),payment_account_holder=coalesce(p_payment_account_holder,'') where order_number=p_order_number;
  get diagnostics v_rows=row_count;if v_rows=0 then raise exception '주문을 찾을 수 없습니다.';end if;
  return jsonb_build_object('ok',true,'updated_rows',v_rows);
end $$;

revoke all on function public.admin_update_order_party_info(text,text,text,text,text,text,text) from public;
revoke all on function public.save_order_shipping_bundle(text,numeric,text,text,uuid,text,text,text,text) from public;
grant execute on function public.admin_update_order_party_info(text,text,text,text,text,text,text) to authenticated;
grant execute on function public.save_order_shipping_bundle(text,numeric,text,text,uuid,text,text,text,text) to authenticated;

comment on column public.orders.picking_assigned_to is '동시 피킹 주문 담당 관리자·매니저 계정';
comment on column public.orders.picking_assigned_device is '담당자가 피킹을 시작한 기기 정보';

commit;
