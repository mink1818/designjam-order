begin;

-- 거래처는 출고완료 전까지 주문을 다시 열 수 있습니다.
-- 피킹 검증으로 차감된 재고가 있으면 같은 트랜잭션에서 복원하고 관리자에게 알립니다.
create or replace function public.customer_reopen_order_for_change(
  p_order_number text,
  p_change_type text default '수정'
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_change_type text:=case when p_change_type='삭제' then '삭제' else '수정' end;
  v_rows jsonb;
  v_name text;
  v_batch uuid;
  v_verified boolean:=false;
  v_picking_started boolean:=false;
  v_row record;
  v_item public.inventory_items;
  v_before integer;
  v_after integer;
  v_restored integer:=0;
  v_deleted integer:=0;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;

  perform 1 from public.orders
   where order_number=p_order_number and customer_id=auth.uid()
   for update;
  if not found then raise exception '본인의 주문을 찾을 수 없습니다.'; end if;
  if exists(select 1 from public.orders where order_number=p_order_number and customer_id=auth.uid() and status='출고완료') then
    raise exception '출고완료 주문은 수정하거나 삭제할 수 없습니다.';
  end if;

  select jsonb_agg(to_jsonb(o) order by o.id),min(customer_name),max(picking_batch_id::text)::uuid,
         bool_or(coalesce(picking_status,'') in ('검증완료','부분품절 검증완료')),
         bool_or(coalesce(picked_qty,0)>0 or coalesce(soldout_qty,0)>0 or coalesce(picking_status,'대기') not in ('','대기'))
    into v_rows,v_name,v_batch,v_verified,v_picking_started
    from public.orders o
   where order_number=p_order_number and customer_id=auth.uid();

  if coalesce(v_verified,false) then
    for v_row in
      select m.item_number,sum(m.quantity)::integer qty
        from public.inventory_movements m
       where m.order_number=p_order_number
         and m.movement_type='OUT' and m.source='ORDER_PICKING'
         and ((v_batch is not null and m.picking_batch_id=v_batch) or (v_batch is null and m.picking_batch_id is null))
         and not exists (
           select 1 from public.inventory_movements r
            where r.order_number=p_order_number and r.source='ORDER_PICKING_RESET'
              and r.picking_batch_id is not distinct from m.picking_batch_id
         )
       group by m.item_number
    loop
      select * into v_item from public.inventory_items where item_number=v_row.item_number for update;
      if not found then raise exception '복원할 재고 품번이 없습니다: %',v_row.item_number; end if;
      v_before:=v_item.quantity; v_after:=v_before+v_row.qty;
      update public.inventory_items set quantity=v_after,updated_at=now(),updated_by=auth.uid()
       where item_number=v_item.item_number;
      insert into public.inventory_movements(
        item_number,movement_type,quantity,quantity_before,quantity_after,source,
        order_number,customer_id,customer_name,device_name,created_by,picking_batch_id
      ) values(
        v_item.item_number,'IN',v_row.qty,v_before,v_after,'ORDER_PICKING_RESET',
        p_order_number,auth.uid(),v_name,'고객 주문'||v_change_type,auth.uid(),v_batch
      );
      v_restored:=v_restored+v_row.qty;
    end loop;
  end if;

  insert into public.deleted_order_history(
    order_number,customer_id,customer_name,deleted_by,deleted_by_role,delete_reason,order_snapshot
  ) values(
    p_order_number,auth.uid(),v_name,auth.uid(),'거래처','거래처 출고완료 전 주문'||v_change_type,v_rows
  );

  insert into public.app_notifications(recipient_id,notification_type,title,message,is_read,link_url)
  select c.id,'customer_order_change','고객 주문 '||v_change_type,
         format('%s · 주문번호 %s · %s%s',coalesce(v_name,'거래처 미입력'),p_order_number,
           case when coalesce(v_picking_started,false) then '피킹 후 ' else '' end,
           case when v_change_type='삭제' then '주문을 삭제했습니다.' else '주문을 수정하여 재접수합니다.' end),
         false,'admin.html?view=orders&search='||p_order_number
    from public.customers c
   where c.is_admin=true and coalesce(c.blocked,false)=false;

  delete from public.orders where order_number=p_order_number and customer_id=auth.uid();
  get diagnostics v_deleted=row_count;
  return jsonb_build_object('ok',true,'deleted_rows',v_deleted,'restored_quantity',v_restored,
    'picking_started',coalesce(v_picking_started,false),'change_type',v_change_type);
end;
$$;

revoke all on function public.customer_reopen_order_for_change(text,text) from public;
grant execute on function public.customer_reopen_order_for_change(text,text) to authenticated;

commit;
