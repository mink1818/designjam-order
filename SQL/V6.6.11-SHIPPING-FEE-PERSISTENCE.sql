-- DESIGN SOCKS V6.6.11 배송비 0원과 미설정 상태 구분
-- 기존 출고완료 주문의 0원은 0원으로 보존합니다.
-- 출고 전 미설정 주문은 화면에서 기본 4,000원을 사용합니다.

begin;

alter table public.orders
  add column if not exists shipping_fee_manual boolean not null default false;

-- 이미 완료된 주문은 당시 저장값(0원 포함)을 확정값으로 보존합니다.
-- 출고 전이라도 0원이 아닌 값을 저장한 주문은 확정값으로 보존합니다.
update public.orders
   set shipping_fee_manual=true
 where coalesce(shipping_fee_manual,false)=false
   and (status='출고완료' or coalesce(shipping_fee,0)<>0);

create or replace function public.save_order_shipping_bundle(
  p_order_number text,p_shipping_fee numeric,p_courier text,p_tracking_number text,
  p_payment_account_id uuid,p_payment_account_label text,p_payment_bank_name text,
  p_payment_account_number text,p_payment_account_holder text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_role text;v_rows integer;
begin
  select admin_role into v_role from public.customers
   where id=auth.uid() and is_admin=true and coalesce(blocked,false)=false;
  if coalesce(v_role,'') not in ('admin','developer_admin') then
    raise exception '배송정보 수정은 관리자만 가능합니다.';
  end if;
  update public.orders
     set shipping_fee=greatest(coalesce(p_shipping_fee,0),0),
         shipping_fee_manual=true,
         courier=coalesce(nullif(trim(p_courier),''),'로젠택배'),
         tracking_number=coalesce(trim(p_tracking_number),''),
         payment_account_id=p_payment_account_id,
         payment_account_label=coalesce(p_payment_account_label,''),
         payment_bank_name=coalesce(p_payment_bank_name,''),
         payment_account_number=coalesce(p_payment_account_number,''),
         payment_account_holder=coalesce(p_payment_account_holder,'')
   where order_number=p_order_number;
  get diagnostics v_rows=row_count;
  if v_rows=0 then raise exception '주문을 찾을 수 없습니다.';end if;
  return jsonb_build_object('ok',true,'updated_rows',v_rows);
end $$;

create or replace function public.complete_order_shipping(
  p_order_number text,p_shipping_fee numeric,p_courier text,p_tracking_number text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_rows integer;
begin
  if not public.is_inventory_admin() then raise exception '관리자 권한이 필요합니다.';end if;
  if exists(select 1 from public.orders where order_number=p_order_number and customer_revision_status is not null) then
    raise exception '고객 주문변경 확인을 먼저 완료해주세요.';
  end if;
  if not exists(select 1 from public.orders where order_number=p_order_number and coalesce(picking_status,'') in ('검증완료','부분품절 검증완료')) then
    raise exception '피킹 최종검증을 먼저 완료해주세요.';
  end if;
  update public.orders
     set status='출고완료',
         shipping_fee=greatest(coalesce(p_shipping_fee,4000),0),
         shipping_fee_manual=true,
         courier=coalesce(nullif(trim(p_courier),''),'로젠택배'),
         tracking_number=coalesce(p_tracking_number,''),
         shipped_at=now()
   where order_number=p_order_number and status<>'출고완료';
  get diagnostics v_rows=row_count;
  if v_rows=0 then raise exception '출고완료 처리할 주문을 찾을 수 없습니다.';end if;
  return jsonb_build_object('ok',true,'order_number',p_order_number,'updated_rows',v_rows,'shipped_at',now());
end $$;

revoke all on function public.save_order_shipping_bundle(text,numeric,text,text,uuid,text,text,text,text) from public;
revoke all on function public.complete_order_shipping(text,numeric,text,text) from public;
grant execute on function public.save_order_shipping_bundle(text,numeric,text,text,uuid,text,text,text,text) to authenticated;
grant execute on function public.complete_order_shipping(text,numeric,text,text) to authenticated;

commit;
