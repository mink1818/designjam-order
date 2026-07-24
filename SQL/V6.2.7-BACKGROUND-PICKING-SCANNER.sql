-- DESIGN SOCKS V6.2.7 백그라운드 피킹 스캐너
-- 백그라운드 스캔은 피킹수량만 증가시키며, 재고는 피킹 최종검증 완료 시 한 번 차감됩니다.

create or replace function public.apply_order_picking_scan(
  p_order_number text,
  p_item_number text,
  p_increment integer default 1,
  p_device_name text default ''
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row public.orders;
  v_new_picked integer;
  v_customer_name text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not exists (
    select 1 from public.customers
    where id=auth.uid() and is_admin=true and coalesce(blocked,false)=false
  ) then
    raise exception '관리자 계정만 피킹 스캔을 사용할 수 있습니다.';
  end if;

  if nullif(trim(coalesce(p_order_number,'')),'') is null then
    raise exception '피킹 주문을 선택하세요.';
  end if;
  if nullif(trim(coalesce(p_item_number,'')),'') is null then
    raise exception '품번이 없습니다.';
  end if;
  if coalesce(p_increment,0)<=0 then
    raise exception '스캔 수량은 1 이상이어야 합니다.';
  end if;

  select * into v_row
  from public.orders
  where order_number=trim(p_order_number)
    and upper(trim(item_number))=upper(trim(p_item_number))
  order by created_at,id
  limit 1
  for update;

  if not found then
    raise exception '선택한 주문에 없는 품번입니다: %',p_item_number;
  end if;
  if coalesce(v_row.picking_status,'') in ('검증완료','부분품절 검증완료') then
    raise exception '이미 피킹 최종검증이 완료된 주문입니다.';
  end if;

  v_new_picked := coalesce(v_row.picked_qty,0)+p_increment;
  if v_new_picked+coalesce(v_row.soldout_qty,0)>coalesce(v_row.qty,0) then
    raise exception '주문수량을 초과합니다: % 피킹 % / 주문 %',
      v_row.item_number,v_new_picked,v_row.qty;
  end if;

  update public.orders
  set picked_qty=v_new_picked,
      picking_status='피킹중',
      picking_started_at=coalesce(picking_started_at,now())
  where id=v_row.id;

  select coalesce(customer_name,'거래처 미입력')
  into v_customer_name
  from public.orders
  where order_number=trim(p_order_number)
  limit 1;

  return jsonb_build_object(
    'ok',true,
    'order_number',trim(p_order_number),
    'item_number',v_row.item_number,
    'picked_qty',v_new_picked,
    'qty',v_row.qty,
    'customer_name',v_customer_name,
    'device_name',coalesce(p_device_name,'')
  );
end;
$$;

grant execute on function public.apply_order_picking_scan(text,text,integer,text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end
$$;
