begin;

create or replace function public.block_customer_picked_order_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid()=old.customer_id and (coalesce(old.picked_qty,0)>0 or coalesce(old.soldout_qty,0)>0
    or coalesce(old.picking_session_active,false)=true or old.picking_started_at is not null
    or coalesce(old.picking_status,'대기') not in ('','대기')) then
    raise exception '피킹을 시작했거나 피킹완료된 주문은 수정하거나 삭제할 수 없습니다.';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;$$;

drop trigger if exists trg_block_customer_picked_order_update on public.orders;
create trigger trg_block_customer_picked_order_update before update on public.orders for each row
when (new.customer_revision_status='수정중' and old.customer_revision_status is distinct from '수정중')
execute function public.block_customer_picked_order_change();

drop trigger if exists trg_block_customer_picked_order_delete on public.orders;
create trigger trg_block_customer_picked_order_delete before delete on public.orders for each row
execute function public.block_customer_picked_order_change();

create or replace function public.customer_finalize_unpicked_revision(p_order_number text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_rows integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
  if not exists(select 1 from orders where order_number=p_order_number and customer_id=auth.uid()) then raise exception '본인의 주문을 찾을 수 없습니다.';end if;
  if exists(select 1 from orders where order_number=p_order_number and customer_id=auth.uid()
    and (status='출고완료' or coalesce(picked_qty,0)>0 or coalesce(soldout_qty,0)>0
      or coalesce(picking_session_active,false)=true or picking_started_at is not null
      or coalesce(picking_status,'대기') not in ('','대기'))) then
    raise exception '피킹을 시작했거나 피킹완료된 주문은 수정할 수 없습니다.';
  end if;
  update orders set customer_revision_status=null,customer_revision_confirmed_at=now()
   where order_number=p_order_number and customer_id=auth.uid() and customer_revision_status='수정완료';
  get diagnostics v_rows=row_count;
  update order_revision_history set revision_status='자동확정',confirmed_at=now(),confirmed_by=auth.uid()
   where id=(select id from order_revision_history where order_number=p_order_number and customer_id=auth.uid()
     and revision_status='수정완료' order by started_at desc limit 1);
  delete from app_notifications where notification_type='customer_order_change' and link_url like '%'||p_order_number||'%';
  return jsonb_build_object('ok',true,'updated_rows',v_rows,'order_number',p_order_number);
end;$$;
revoke all on function public.customer_finalize_unpicked_revision(text) from public;
grant execute on function public.customer_finalize_unpicked_revision(text) to authenticated;

create or replace function public.assert_customer_order_revision_allowed(p_order_number text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from orders where order_number=p_order_number and customer_id=auth.uid()
    and (status='출고완료' or coalesce(picked_qty,0)>0 or coalesce(soldout_qty,0)>0
      or coalesce(picking_session_active,false)=true or picking_started_at is not null
      or coalesce(picking_status,'대기') not in ('','대기'))) then
    raise exception '피킹을 시작했거나 피킹완료된 주문은 수정하거나 삭제할 수 없습니다.';
  end if;
end;$$;
revoke all on function public.assert_customer_order_revision_allowed(text) from public;
grant execute on function public.assert_customer_order_revision_allowed(text) to authenticated;

-- 고객 수정 알림은 생성 단계에서 막고, 주문 내용만 즉시 반영합니다.
create or replace function public.suppress_customer_order_change_notification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.notification_type='customer_order_change' then return null;end if;
  return new;
end;$$;
drop trigger if exists trg_suppress_customer_order_change_notification on public.app_notifications;
create trigger trg_suppress_customer_order_change_notification before insert on public.app_notifications
for each row execute function public.suppress_customer_order_change_notification();

delete from public.app_notifications where notification_type='customer_order_change';
commit;
