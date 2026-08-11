-- DESIGN SOCKS V6.5.70
-- 관리자 대신주문 미가입 거래처 저장목록 삭제
-- 기존 주문내역과 모든 단가 데이터는 변경하지 않습니다.

alter table public.admin_proxy_parties add column if not exists is_hidden boolean not null default false;

create or replace function public.delete_admin_proxy_party(p_party_id bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_party public.admin_proxy_parties%rowtype;
begin
  if not public.is_inventory_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  select * into v_party from public.admin_proxy_parties where id=p_party_id for update;
  if not found then raise exception '저장된 미가입 거래처를 찾을 수 없습니다.'; end if;
  if v_party.linked_customer_id is not null then raise exception '가입 거래처는 거래처관리에서 관리해주세요.'; end if;
  delete from public.admin_proxy_party_destinations where party_id=p_party_id;
  update public.admin_proxy_parties set is_hidden=true,updated_at=now() where id=p_party_id;
  return jsonb_build_object('ok',true,'party_id',p_party_id,'customer_name',v_party.customer_name);
end $$;

revoke all on function public.delete_admin_proxy_party(bigint) from public;
grant execute on function public.delete_admin_proxy_party(bigint) to authenticated;

create or replace function public.restore_admin_proxy_party(p_customer_name text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
  if not public.is_inventory_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  update public.admin_proxy_parties set is_hidden=false,updated_at=now(),last_used_at=now()
  where normalized_name=public.proxy_normalized_text(p_customer_name) returning id into v_id;
  return jsonb_build_object('ok',true,'party_id',v_id);
end $$;
grant execute on function public.restore_admin_proxy_party(text) to authenticated;

select 'V6.5.70 미가입 대신주문 거래처 저장목록 삭제 적용 완료 - 주문/단가 변경 없음' as result;
