begin;

-- V6.6.45: 주문번호는 시스템 전체에서 고유하므로 입금 레코드도 주문번호당 1개만 유지한다.
-- customer_key 변경/불일치로 중복 레코드가 생겼을 때, 관리자가 실제 저장한 레코드를 자동 생성 레코드보다 우선 보존한다.
with ranked as (
  select id, order_number,
         row_number() over (
           partition by order_number
           order by (confirmed_by is not null) desc, updated_at desc, id desc
         ) as rn
  from public.order_payment_records
)
delete from public.order_payment_records p
using ranked r
where p.id=r.id and r.rn>1;

drop index if exists public.order_payment_records_order_number_uidx;
create unique index order_payment_records_order_number_uidx
  on public.order_payment_records(order_number);

-- 신규 주문 행/거래처키 변경 시 기존 주문번호의 입금액을 절대 0으로 덮어쓰지 않는다.
create or replace function public.initialize_order_payment_record()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.order_payment_records(
   order_number,customer_key,customer_name,order_amount,paid_amount,payment_status,created_at,updated_at
 ) values(
   new.order_number,coalesce(new.customer_id::text,''),coalesce(new.customer_name,''),0,0,'미입금',coalesce(new.created_at,now()),now()
 )
 on conflict(order_number) do update set
   customer_key=case when coalesce(public.order_payment_records.customer_key,'')='' then excluded.customer_key else public.order_payment_records.customer_key end,
   customer_name=case when coalesce(trim(excluded.customer_name),'')<>'' then excluded.customer_name else public.order_payment_records.customer_name end;
 return new;
end;$$;

-- 저장도 주문번호를 단일 기준으로 사용한다. 기존 paid_amount는 명시적으로 전달된 값으로만 변경된다.
create or replace function public.admin_save_order_payment(
 p_order_number text,p_customer_key text,p_customer_name text,p_order_amount numeric,p_paid_amount numeric,
 p_payment_account text default null,p_depositor_name text default null,p_paid_at timestamptz default null,p_memo text default null
) returns public.order_payment_records language plpgsql security definer set search_path=public as $$
declare v_old public.order_payment_records;v_new public.order_payment_records;v_status text;v_paid numeric:=greatest(coalesce(p_paid_amount,0),0);v_total numeric:=greatest(coalesce(p_order_amount,0),0);v_actor_name text;
begin
 if not public.is_payment_admin() then raise exception '일반 관리자 이상만 입금정보를 관리할 수 있습니다.';end if;
 if nullif(trim(p_order_number),'') is null then raise exception '주문번호가 없습니다.';end if;
 v_status:=case when v_paid<=0 then '미입금' when v_paid<v_total then '일부입금' else '입금완료' end;
 select coalesce(nullif(trim(business_name),''),nullif(trim(owner_name),''),nullif(trim(email),''),'관리자') into v_actor_name from public.customers where id=auth.uid();
 v_actor_name:=coalesce(v_actor_name,'관리자');
 select * into v_old from public.order_payment_records where order_number=trim(p_order_number) order by (confirmed_by is not null) desc,updated_at desc limit 1;
 insert into public.order_payment_records(order_number,customer_key,customer_name,order_amount,paid_amount,payment_status,payment_account,depositor_name,paid_at,memo,confirmed_by,confirmed_by_name,updated_at)
 values(trim(p_order_number),coalesce(p_customer_key,''),coalesce(p_customer_name,''),v_total,v_paid,v_status,nullif(trim(p_payment_account),''),nullif(trim(p_depositor_name),''),case when v_paid>0 then coalesce(p_paid_at,now()) else null end,nullif(trim(p_memo),''),auth.uid(),v_actor_name,now())
 on conflict(order_number) do update set customer_key=excluded.customer_key,customer_name=excluded.customer_name,order_amount=excluded.order_amount,paid_amount=excluded.paid_amount,payment_status=excluded.payment_status,payment_account=excluded.payment_account,depositor_name=excluded.depositor_name,paid_at=excluded.paid_at,memo=excluded.memo,confirmed_by=auth.uid(),confirmed_by_name=v_actor_name,updated_at=now() returning * into v_new;
 insert into public.order_payment_history(payment_record_id,order_number,customer_key,previous_status,new_status,previous_paid_amount,new_paid_amount,changed_by,changed_by_name)
 values(v_new.id,v_new.order_number,v_new.customer_key,v_old.payment_status,v_new.payment_status,v_old.paid_amount,v_new.paid_amount,auth.uid(),v_actor_name);
 return v_new;
end;$$;

commit;
