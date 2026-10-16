-- DESIGN SOCKS V6.8.2
-- 피킹수량 + 품절수량이 주문수량과 일치하면 품절 포함 주문도 출고완료 허용
-- 기존 주문금액·수량·품절수량은 변경하지 않으며, 검증상태가 누락된 완료 주문만 최종검증을 이어서 실행합니다.
begin;

create or replace function public.complete_order_shipping(
  p_order_number text,p_shipping_fee numeric,p_courier text,p_tracking_number text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_rows integer;v_unprocessed integer;
begin
  if not public.is_inventory_admin() then raise exception '관리자 권한이 필요합니다.';end if;
  if exists(select 1 from public.orders where order_number=p_order_number and customer_revision_status is not null) then
    raise exception '고객 주문변경 확인을 먼저 완료해주세요.';
  end if;

  select count(*) into v_unprocessed
    from public.orders
   where order_number=p_order_number
     and coalesce(picked_qty,0)+coalesce(soldout_qty,case when coalesce(is_soldout,false) then qty else 0 end)<>coalesce(qty,0);
  if v_unprocessed>0 then
    raise exception '피킹수량과 품절수량의 합이 주문수량과 일치하지 않는 품목이 %개 있습니다.',v_unprocessed;
  end if;

  -- 전량/일부 품절까지 수량 처리가 끝났지만 화면 상태만 검증완료가 아닌 경우를 복구합니다.
  if not exists(select 1 from public.orders where order_number=p_order_number and coalesce(picking_status,'') in ('검증완료','부분품절 검증완료')) then
    perform public.complete_order_picking(p_order_number,'출고완료 전 자동 최종검증');
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

revoke all on function public.complete_order_shipping(text,numeric,text,text) from public;
grant execute on function public.complete_order_shipping(text,numeric,text,text) to authenticated;

commit;

select 'V6.8.2 품절 포함 출고완료 적용 완료' as result;
