begin;

-- 피킹 시작 전 주문만 전체 삭제할 수 있습니다. 단가 조회·보정 로직은 변경하지 않습니다.
create or replace function public.delete_order_and_restore_inventory(
  p_order_number text,
  p_device_name text default '피킹 전 주문삭제'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_deleted integer:=0;
begin
  if not public.is_inventory_admin() then raise exception '관리자만 주문을 삭제할 수 있습니다.'; end if;
  perform 1 from public.orders where order_number=p_order_number for update;
  if not found then raise exception '삭제할 주문을 찾을 수 없습니다.'; end if;
  if exists(select 1 from public.orders where order_number=p_order_number and
    (status='출고완료' or coalesce(picked_qty,0)>0 or coalesce(soldout_qty,0)>0 or coalesce(is_soldout,false)
     or coalesce(picking_status,'대기') not in ('','대기'))) then
    raise exception '피킹을 시작한 주문은 전체 삭제할 수 없습니다.';
  end if;
  delete from public.orders where order_number=p_order_number;
  get diagnostics v_deleted=row_count;
  return jsonb_build_object('ok',true,'order_number',p_order_number,'deleted_rows',v_deleted);
end; $$;
revoke all on function public.delete_order_and_restore_inventory(text,text) from public;
grant execute on function public.delete_order_and_restore_inventory(text,text) to authenticated;

create or replace function public.customer_delete_pending_order(p_order_number text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_deleted integer:=0;
begin
  perform 1 from public.orders where order_number=p_order_number and customer_id=auth.uid() for update;
  if not found then raise exception '본인의 주문을 찾을 수 없습니다.'; end if;
  if exists(select 1 from public.orders where order_number=p_order_number and
    (customer_id<>auth.uid() or status='출고완료' or coalesce(picked_qty,0)>0 or coalesce(soldout_qty,0)>0
     or coalesce(is_soldout,false) or coalesce(picking_status,'대기') not in ('','대기'))) then
    raise exception '피킹을 시작한 주문은 수정·삭제할 수 없습니다.';
  end if;
  delete from public.orders where order_number=p_order_number and customer_id=auth.uid();
  get diagnostics v_deleted=row_count;
  return jsonb_build_object('ok',true,'deleted_rows',v_deleted);
end; $$;
revoke all on function public.customer_delete_pending_order(text) from public;
grant execute on function public.customer_delete_pending_order(text) to authenticated;

commit;
