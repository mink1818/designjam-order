begin;

-- 동일 거래처명 및 동일 휴대폰번호 가입을 사전에 차단합니다.
create or replace function public.check_customer_signup_duplicate(p_business_name text,p_phone text)
returns jsonb language sql security definer set search_path=public as $$
  select jsonb_build_object(
    'business_name_exists',exists(select 1 from customers where regexp_replace(lower(trim(coalesce(business_name,''))),'\s','','g')=regexp_replace(lower(trim(coalesce(p_business_name,''))),'\s','','g')),
    'phone_exists',exists(select 1 from customers where regexp_replace(coalesce(phone,''),'[^0-9]','','g')=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'))
  );
$$;
revoke all on function public.check_customer_signup_duplicate(text,text) from public;
grant execute on function public.check_customer_signup_duplicate(text,text) to anon,authenticated;

-- 기존 직원 등급은 매니저로 통합합니다.
update public.customers set admin_role='manager' where is_admin=true and admin_role='employee';

-- 거래처 주문수정은 피킹을 전혀 시작하지 않은 주문만 허용합니다.
create or replace function public.assert_customer_order_revision_allowed(p_order_number text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from orders where order_number=p_order_number and customer_id=auth.uid() and (coalesce(picked_qty,0)>0 or coalesce(soldout_qty,0)>0 or coalesce(picking_status,'대기') not in ('','대기'))) then
    raise exception '피킹을 시작했거나 피킹완료된 주문은 수정할 수 없습니다.';
  end if;
end;$$;
grant execute on function public.assert_customer_order_revision_allowed(text) to authenticated;

-- 출고상태와 재고이력은 건드리지 않고 배송비와 표시계좌만 수정합니다.
create or replace function public.update_shipped_order_billing(
  p_order_number text,p_shipping_fee numeric,p_payment_account_id uuid,p_payment_account_label text,
  p_payment_bank_name text,p_payment_account_number text,p_payment_account_holder text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_rows integer;
begin
  if public.current_admin_role() not in ('admin','developer_admin') then raise exception '관리자 권한이 필요합니다.';end if;
  if not exists(select 1 from orders where order_number=p_order_number and status='출고완료') then raise exception '출고완료 주문을 찾을 수 없습니다.';end if;
  update orders set shipping_fee=greatest(coalesce(p_shipping_fee,0),0),payment_account_id=p_payment_account_id,
    payment_account_label=coalesce(p_payment_account_label,''),payment_bank_name=coalesce(p_payment_bank_name,''),
    payment_account_number=coalesce(p_payment_account_number,''),payment_account_holder=coalesce(p_payment_account_holder,'')
  where order_number=p_order_number and status='출고완료';
  get diagnostics v_rows=row_count;
  return jsonb_build_object('ok',true,'updated_rows',v_rows);
end;$$;
revoke all on function public.update_shipped_order_billing(text,numeric,uuid,text,text,text,text) from public;
grant execute on function public.update_shipped_order_billing(text,numeric,uuid,text,text,text,text) to authenticated;

commit;
