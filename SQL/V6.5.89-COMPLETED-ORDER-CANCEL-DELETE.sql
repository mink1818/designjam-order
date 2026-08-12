begin;
create or replace function public.cancel_and_delete_completed_order(p_order_number text,p_device_name text default '출고완료 취소·주문삭제') returns jsonb language plpgsql security definer set search_path=public as $$
declare v_snapshot jsonb;v_customer uuid;v_name text;v_undo jsonb;v_deleted integer;
begin
 if not public.is_inventory_admin() then raise exception '관리자만 출고완료 주문을 삭제할 수 있습니다.';end if;
 select jsonb_agg(to_jsonb(o) order by o.id) into v_snapshot from orders o where o.order_number=p_order_number;
 select customer_id,customer_name into v_customer,v_name from orders where order_number=p_order_number limit 1;
 if v_snapshot is null then raise exception '주문을 찾을 수 없습니다.';end if;
 if not exists(select 1 from orders where order_number=p_order_number and status='출고완료') then raise exception '출고완료 주문만 이 기능으로 삭제할 수 있습니다.';end if;
 v_undo:=public.undo_completed_order(p_order_number,p_device_name);
 insert into deleted_order_history(order_number,customer_id,customer_name,deleted_by,deleted_by_role,delete_reason,order_snapshot) values(p_order_number,v_customer,v_name,auth.uid(),'관리자','출고완료 취소·재고복원 후 주문삭제',v_snapshot);
 delete from orders where order_number=p_order_number;get diagnostics v_deleted=row_count;
 return jsonb_build_object('ok',true,'deleted_rows',v_deleted,'restored_items',coalesce((v_undo->>'restored_items')::integer,0),'restored_quantity',coalesce((v_undo->>'restored_quantity')::integer,0));
end;$$;
revoke all on function public.cancel_and_delete_completed_order(text,text) from public;grant execute on function public.cancel_and_delete_completed_order(text,text) to authenticated;
commit;
