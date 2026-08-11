begin;
-- 기존 주문 중 출고지 누락 건은 ERP 품번 연결 또는 품번 접두어로 우선 복구합니다.
update public.orders o set warehouse_code=upper(trim(i.warehouse_code))
from public.inventory_items i
where coalesce(trim(o.warehouse_code),'') not in ('S','B','I')
  and upper(trim(i.item_number))=upper(trim(o.item_number))
  and upper(trim(i.warehouse_code)) in ('S','B','I');
update public.orders set warehouse_code=upper(substring(trim(item_number) from 1 for 1))
where coalesce(trim(warehouse_code),'') not in ('S','B','I')
  and upper(trim(item_number)) ~ '^[SBI]([-_[:space:]]|[0-9])';

create or replace function public.admin_delete_order_history(p_history_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_order text;v_rows integer;
begin
  if not public.is_inventory_admin() then raise exception '관리자 권한이 필요합니다.';end if;
  select order_number into v_order from public.deleted_order_history where id=p_history_id for update;
  if not found then raise exception '삭제 주문 이력을 찾을 수 없습니다.';end if;
  delete from public.deleted_order_history where id=p_history_id;
  get diagnostics v_rows=row_count;
  return jsonb_build_object('ok',true,'deleted_rows',v_rows,'order_number',v_order);
end;$$;
revoke all on function public.admin_delete_order_history(bigint) from public;
grant execute on function public.admin_delete_order_history(bigint) to authenticated;
commit;
