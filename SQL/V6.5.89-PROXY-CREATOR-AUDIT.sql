begin;
alter table public.orders add column if not exists proxy_created_by uuid;
alter table public.orders add column if not exists proxy_created_by_name text;
alter table public.orders add column if not exists proxy_created_by_role text;
create or replace function public.stamp_proxy_order_creator() returns trigger language plpgsql security definer set search_path=public as $$
declare v_name text;v_role text;
begin
 if not (coalesce(new.order_number,'') like 'ADMIN-%' or position('[관리자 대신주문]' in coalesce(new.memo,''))>0) then return new;end if;
 if new.proxy_created_by is null then new.proxy_created_by:=auth.uid();end if;
 if nullif(trim(coalesce(new.proxy_created_by_name,'')),'') is null then select coalesce(nullif(trim(business_name),''),nullif(trim(owner_name),''),nullif(trim(email),''),'관리자'),coalesce(admin_role,'admin') into v_name,v_role from customers where id=auth.uid();new.proxy_created_by_name:=v_name;new.proxy_created_by_role:=v_role;end if;
 return new;
end;$$;
drop trigger if exists trg_stamp_proxy_order_creator on public.orders;
create trigger trg_stamp_proxy_order_creator before insert on public.orders for each row execute function public.stamp_proxy_order_creator();
create or replace function public.record_proxy_order_creator(p_order_number text) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_name text;v_role text;v_rows integer;
begin
 if not exists(select 1 from customers where id=auth.uid() and is_admin=true and coalesce(blocked,false)=false) then raise exception '관리자 또는 매니저만 기록할 수 있습니다.';end if;
 select coalesce(nullif(trim(business_name),''),nullif(trim(owner_name),''),nullif(trim(email),''),'관리자'),coalesce(admin_role,'admin') into v_name,v_role from customers where id=auth.uid();
 update orders set proxy_created_by=auth.uid(),proxy_created_by_name=v_name,proxy_created_by_role=v_role where order_number=p_order_number and (order_number like 'ADMIN-%' or position('[관리자 대신주문]' in coalesce(memo,''))>0);
 get diagnostics v_rows=row_count;if v_rows=0 then raise exception '대신주문을 찾을 수 없습니다.';end if;
 return jsonb_build_object('ok',true,'name',v_name,'role',v_role,'updated_rows',v_rows);
end;$$;
revoke all on function public.record_proxy_order_creator(text) from public;grant execute on function public.record_proxy_order_creator(text) to authenticated;
-- 기존 주문은 실제 접수자를 확정할 수 없어 임의로 채우지 않습니다. SQL 실행 이후 신규 대신주문부터 정확히 기록됩니다.
commit;
