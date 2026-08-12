begin;
create or replace function public.save_order_shipping_bundle(p_order_number text,p_shipping_fee numeric,p_courier text,p_tracking_number text,p_payment_account_id uuid,p_payment_account_label text,p_payment_bank_name text,p_payment_account_number text,p_payment_account_holder text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_role text;v_rows integer;
begin
  select admin_role into v_role from public.customers where id=auth.uid();
  if not (coalesce(v_role,'') in ('admin','developer_admin') or exists(select 1 from auth.users where id=auth.uid() and lower(email) in ('900smk@naver.com','sm0727sm@hanmail.net','p1028p@naver.com'))) then raise exception '관리자만 배송정보를 수정할 수 있습니다.';end if;
  update public.orders set shipping_fee=greatest(coalesce(p_shipping_fee,0),0),courier=coalesce(nullif(trim(p_courier),''),'로젠택배'),tracking_number=coalesce(trim(p_tracking_number),''),payment_account_id=p_payment_account_id,payment_account_label=coalesce(p_payment_account_label,''),payment_bank_name=coalesce(p_payment_bank_name,''),payment_account_number=coalesce(p_payment_account_number,''),payment_account_holder=coalesce(p_payment_account_holder,'') where order_number=p_order_number;
  get diagnostics v_rows=row_count;if v_rows=0 then raise exception '주문을 찾을 수 없습니다.';end if;
  return jsonb_build_object('ok',true,'updated_rows',v_rows);
end;$$;
revoke all on function public.save_order_shipping_bundle(text,numeric,text,text,uuid,text,text,text,text) from public;
grant execute on function public.save_order_shipping_bundle(text,numeric,text,text,uuid,text,text,text,text) to authenticated;
commit;
