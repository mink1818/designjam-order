-- V6.6.77 - 매니저 주문관리 배송정보(배송비 포함) 수정 권한
begin;

create or replace function public.save_order_shipping_bundle(
  p_order_number text,p_shipping_fee numeric,p_courier text,p_tracking_number text,
  p_payment_account_id uuid,p_payment_account_label text,p_payment_bank_name text,
  p_payment_account_number text,p_payment_account_holder text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_role text;v_rows integer;
begin
  select admin_role into v_role
    from public.customers
   where id=auth.uid()
     and is_admin=true
     and coalesce(blocked,false)=false;

  if coalesce(v_role,'') not in ('manager','admin','developer_admin') then
    raise exception '배송정보 수정 권한이 없습니다.';
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
  if v_rows=0 then raise exception '주문을 찾을 수 없습니다.'; end if;
  return jsonb_build_object('ok',true,'updated_rows',v_rows);
end $$;

revoke all on function public.save_order_shipping_bundle(text,numeric,text,text,uuid,text,text,text,text) from public;
grant execute on function public.save_order_shipping_bundle(text,numeric,text,text,uuid,text,text,text,text) to authenticated;

commit;
