-- DESIGN SOCKS V6.8.7
-- 기존 중복 계정이 있어도 자기 거래처명을 유지한 채 대표자명·주소 등을 수정할 수 있게 합니다.
-- 신규 가입 및 실제 거래처명 변경 시의 중복 차단은 그대로 유지합니다.

begin;

create or replace function public.prevent_duplicate_customer_business_name()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_key text:=public.normalize_customer_business_name(new.business_name);
  v_old_key text:=case when tg_op='UPDATE' then public.normalize_customer_business_name(old.business_name) else '' end;
begin
  -- 기존 계정에서 거래처명 표기가 실질적으로 바뀌지 않았다면
  -- 대표자명·연락처·주소 등 다른 정보 수정은 허용합니다.
  if tg_op='UPDATE'
     and coalesce(new.is_admin,false)=coalesce(old.is_admin,false)
     and v_key=v_old_key then
    return new;
  end if;

  if coalesce(new.is_admin,false)=false and v_key<>'' and exists(
    select 1
    from public.customers c
    where c.id<>new.id
      and coalesce(c.is_admin,false)=false
      and public.normalize_customer_business_name(c.business_name)=v_key
  ) then
    raise exception using
      errcode='23505',
      message='이미 등록된 거래처명입니다. 기존 계정 확인 또는 관리자에게 문의해주세요.';
  end if;
  return new;
end;
$$;

drop trigger if exists customers_prevent_duplicate_business_name on public.customers;
create trigger customers_prevent_duplicate_business_name
before insert or update of business_name,is_admin on public.customers
for each row execute function public.prevent_duplicate_customer_business_name();

-- 관리자 수정 함수도 값이 실제로 달라진 경우에만 해당 열을 변경하고 이력을 남깁니다.
create or replace function public.admin_update_customer_identity(
  p_customer_id uuid,
  p_business_name text,
  p_owner_name text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_old public.customers%rowtype;
  v_business_name text:=trim(coalesce(p_business_name,''));
  v_owner_name text:=nullif(trim(p_owner_name),'');
begin
  if not public.is_inventory_admin() then raise exception '관리자만 거래처 정보를 수정할 수 있습니다.'; end if;
  select * into v_old from public.customers where id=p_customer_id for update;
  if not found then raise exception '거래처를 찾을 수 없습니다.'; end if;
  if v_business_name='' then raise exception '거래처명을 입력하세요.'; end if;

  if v_old.business_name is distinct from v_business_name
     or v_old.owner_name is distinct from v_owner_name then
    update public.customers
    set business_name=v_business_name,
        owner_name=v_owner_name
    where id=p_customer_id;

    insert into public.customer_identity_change_history(
      customer_id,old_business_name,new_business_name,old_owner_name,new_owner_name,changed_by
    ) values(
      p_customer_id,v_old.business_name,v_business_name,v_old.owner_name,v_owner_name,auth.uid()
    );
  end if;

  return jsonb_build_object('ok',true,'customer_id',p_customer_id,'changed',
    v_old.business_name is distinct from v_business_name or v_old.owner_name is distinct from v_owner_name);
end $$;

revoke all on function public.admin_update_customer_identity(uuid,text,text) from public;
grant execute on function public.admin_update_customer_identity(uuid,text,text) to authenticated;

commit;
