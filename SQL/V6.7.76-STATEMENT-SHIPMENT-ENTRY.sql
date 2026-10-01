-- DESIGN SOCKS V6.7.76 / 관리자 거래명세서 운송장 직접입력
-- V6.7.74 송장관리 SQL을 먼저 적용한 뒤 실행하세요.
-- 기존 orders 및 기존 송장 행은 수정하지 않습니다.
begin;

-- 사진 없이 운송장번호만 먼저 등록하는 업무를 허용합니다.
alter table public.shipment_labels alter column document_id drop not null;

create or replace function public.save_manual_order_shipment(
  p_order_number text,
  p_warehouse_code text default null,
  p_carrier_name text default null,
  p_tracking_number text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_label_id uuid;
  v_tracking text:=btrim(coalesce(p_tracking_number,''));
  v_normalized text;
  v_warehouse text:=nullif(upper(btrim(coalesce(p_warehouse_code,''))), '');
  v_carrier text:=nullif(btrim(coalesce(p_carrier_name,'')), '');
begin
  if not public.shipment_staff_allowed() then raise exception '송장업무 권한이 없습니다.'; end if;
  if btrim(coalesce(p_order_number,''))='' or not exists(select 1 from public.orders where order_number=p_order_number) then raise exception '주문을 찾을 수 없습니다.'; end if;
  if v_warehouse is not null and v_warehouse not in ('S','B','I') then raise exception '출고처는 S, B, I만 입력할 수 있습니다.'; end if;
  if v_tracking='' then raise exception '운송장번호를 입력해주세요.'; end if;
  v_normalized:=upper(regexp_replace(v_tracking,'[^0-9A-Za-z]','','g'));

  select id into v_label_id from public.shipment_labels
   where tracking_normalized=v_normalized and lower(coalesce(carrier_name,''))=lower(coalesce(v_carrier,''))
   order by created_at limit 1;
  if v_label_id is null then
    insert into public.shipment_labels(document_id,warehouse_code,carrier_name,tracking_number,tracking_normalized,match_status,match_score)
    values(null,v_warehouse,v_carrier,v_tracking,v_normalized,'matched',100) returning id into v_label_id;
  end if;
  insert into public.shipment_order_links(label_id,order_number,link_type,confidence,linked_by)
  values(v_label_id,p_order_number,'manual',100,auth.uid()) on conflict(label_id,order_number) do nothing;
  return v_label_id;
end $$;

revoke all on function public.save_manual_order_shipment(text,text,text,text) from public;
grant execute on function public.save_manual_order_shipment(text,text,text,text) to authenticated;
commit;

