begin;

-- V6.6.48 관리자 삭제 주문 복원
alter table public.deleted_order_history
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid,
  add column if not exists restored_by_role text;

create or replace function public.admin_restore_deleted_order(p_history_id bigint)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_history public.deleted_order_history%rowtype;
  v_item jsonb;
  v_cols text;
  v_count integer := 0;
begin
  if not public.is_inventory_admin() then
    raise exception '관리자만 삭제 주문을 복원할 수 있습니다.';
  end if;

  select * into v_history
  from public.deleted_order_history
  where id=p_history_id
  for update;

  if not found then raise exception '삭제 주문 이력을 찾을 수 없습니다.'; end if;
  if v_history.restored_at is not null then raise exception '이미 복원된 주문입니다.'; end if;
  if exists(select 1 from public.orders where order_number=v_history.order_number) then
    raise exception '같은 주문번호가 이미 존재하여 복원할 수 없습니다.';
  end if;
  if jsonb_typeof(v_history.order_snapshot) <> 'array' or jsonb_array_length(v_history.order_snapshot)=0 then
    raise exception '복원할 주문 원본이 없습니다.';
  end if;

  -- 현재 orders 스키마의 모든 일반 컬럼을 사용하되 PK id는 새로 발급한다.
  select string_agg(quote_ident(a.attname), ',' order by a.attnum)
    into v_cols
  from pg_attribute a
  where a.attrelid='public.orders'::regclass
    and a.attnum>0 and not a.attisdropped and a.attname<>'id'
    and a.attgenerated='';

  for v_item in select value from jsonb_array_elements(v_history.order_snapshot)
  loop
    execute format(
      'insert into public.orders (%1$s) select %1$s from jsonb_populate_record(null::public.orders,$1)',
      v_cols
    ) using v_item;
    v_count := v_count + 1;
  end loop;

  update public.deleted_order_history
     set restored_at=now(), restored_by=auth.uid(), restored_by_role='관리자'
   where id=p_history_id;

  return jsonb_build_object('ok',true,'order_number',v_history.order_number,'restored_rows',v_count);
end;
$$;

revoke all on function public.admin_restore_deleted_order(bigint) from public;
grant execute on function public.admin_restore_deleted_order(bigint) to authenticated;

commit;
