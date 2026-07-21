-- DESIGN SOCKS V6.1.1 ERP 재고관리 개선
-- V6.0.0 SQL 실행 후 Supabase SQL Editor에서 전체 실행

alter table public.inventory_items
  add column if not exists category_name text not null default '';

create or replace function public.adjust_inventory_item(
  p_item_number text,
  p_new_quantity integer,
  p_new_safety_stock integer,
  p_note text,
  p_device_name text default ''
)
returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_before integer;
  v_difference integer;
begin
  if not public.is_inventory_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;
  if p_new_quantity is null or p_new_quantity < 0 then
    raise exception '재고 수량은 0 이상이어야 합니다.';
  end if;
  if p_new_safety_stock is null or p_new_safety_stock < 0 then
    raise exception '안전재고는 0 이상이어야 합니다.';
  end if;
  if length(trim(coalesce(p_note,''))) < 1 then
    raise exception '수정 사유를 입력하세요.';
  end if;

  select * into v_item
  from public.inventory_items
  where item_number = trim(p_item_number) or barcode = trim(p_item_number)
  for update;

  if not found then
    raise exception '미등록 품번: %', p_item_number;
  end if;

  v_before := v_item.quantity;
  v_difference := abs(p_new_quantity - v_before);

  update public.inventory_items
     set quantity = p_new_quantity,
         safety_stock = p_new_safety_stock,
         updated_at = now(),
         updated_by = auth.uid()
   where item_number = v_item.item_number
   returning * into v_item;

  if p_new_quantity <> v_before then
    insert into public.inventory_movements(
      item_number,movement_type,quantity,quantity_before,quantity_after,
      source,note,device_name,created_by
    ) values (
      v_item.item_number,'ADJUST',greatest(v_difference,1),v_before,p_new_quantity,
      'MANUAL',trim(p_note),coalesce(p_device_name,''),auth.uid()
    );
  end if;

  return v_item;
end;
$$;

grant execute on function public.adjust_inventory_item(text,integer,integer,text,text) to authenticated;

create index if not exists inventory_items_category_idx
  on public.inventory_items(category_name);
