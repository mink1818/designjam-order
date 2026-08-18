-- DESIGN SOCKS V6.6.10 숨은 피킹 세션 자동 복구
-- 완료·취소되었거나 진행수량이 0인 이전 작업만 자동 해제합니다.
-- 실제 피킹/품절 수량이 남아 있는 다른 주문은 계속 보호합니다.

begin;

update public.orders
   set picking_session_active=false,
       picking_assigned_to=null,
       picking_assigned_name=null,
       picking_assigned_device=null,
       picking_assigned_at=null
 where coalesce(picking_session_active,false)=true
   and (
     status in ('출고완료','취소','삭제')
     or (coalesce(picked_qty,0)=0 and coalesce(soldout_qty,0)=0)
   );

create or replace function public.claim_order_picking(
  p_order_number text,
  p_device_name text default '',
  p_force boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_role text;
  v_owner uuid;
  v_owner_name text;
  v_rows integer;
begin
  select coalesce(nullif(trim(business_name),''),nullif(trim(owner_name),''),email,'관리자'),
         coalesce(admin_role,'admin')
    into v_name,v_role
    from public.customers
   where id=v_user and is_admin=true and coalesce(blocked,false)=false;

  if v_name is null then
    raise exception '사용 가능한 관리자·매니저 계정이 아닙니다.';
  end if;

  -- 목록에 안 보이는 완료·취소 주문 또는 진행이 전혀 없는 이전 세션 정리
  update public.orders
     set picking_session_active=false,
         picking_assigned_to=null,
         picking_assigned_name=null,
         picking_assigned_device=null,
         picking_assigned_at=null
   where picking_assigned_to=v_user
     and coalesce(picking_session_active,false)=true
     and order_number<>p_order_number
     and (
       status in ('출고완료','취소','삭제')
       or (coalesce(picked_qty,0)=0 and coalesce(soldout_qty,0)=0)
     );

  if exists(
    select 1 from public.orders
     where picking_assigned_to=v_user
       and coalesce(picking_session_active,false)=true
       and order_number<>p_order_number
  ) then
    raise exception '실제 피킹수량이 남은 다른 주문을 피킹 중입니다. 이전 작업을 종료한 뒤 시작하세요.';
  end if;

  perform 1 from public.orders where order_number=p_order_number for update;
  if not found then raise exception '피킹할 주문을 찾을 수 없습니다.'; end if;

  select picking_assigned_to,picking_assigned_name
    into v_owner,v_owner_name
    from public.orders
   where order_number=p_order_number and picking_assigned_to is not null
   limit 1;

  if v_owner is not null and v_owner<>v_user and not (p_force and v_role in ('admin','developer_admin')) then
    raise exception '이미 % 계정이 피킹 중입니다.',coalesce(v_owner_name,'다른 관리자');
  end if;

  update public.orders
     set picking_session_active=true,
         picking_assigned_to=v_user,
         picking_assigned_name=v_name,
         picking_assigned_device=left(coalesce(p_device_name,''),200),
         picking_assigned_at=now()
   where order_number=p_order_number;

  get diagnostics v_rows=row_count;
  return jsonb_build_object('ok',true,'order_number',p_order_number,
    'assigned_to',v_user,'assigned_name',v_name,'updated_rows',v_rows);
end;
$$;

revoke all on function public.claim_order_picking(text,text,boolean) from public;
grant execute on function public.claim_order_picking(text,text,boolean) to authenticated;

commit;
