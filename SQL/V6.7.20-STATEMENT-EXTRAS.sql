-- V6.7.20 거래명세서 택배수량·기타금액·수기메모 영구 저장
alter table public.orders add column if not exists statement_manual_memo text;
alter table public.orders add column if not exists statement_parcel_counts jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists other_amount numeric not null default 0 check (other_amount >= 0);

create or replace function public.save_order_statement_extras(
  p_order_number text,
  p_manual_memo text,
  p_parcel_counts jsonb,
  p_other_amount numeric
) returns void
language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is null or not (
    exists(select 1 from public.customers c where c.id=auth.uid() and c.is_admin=true and coalesce(c.blocked,false)=false)
    or lower(coalesce(auth.jwt()->>'email','')) in ('900smk@naver.com','sm0727sm@hanmail.net','p1028p@naver.com')
  ) then raise exception '관리자 권한이 필요합니다.'; end if;
  update public.orders set
    statement_manual_memo=coalesce(p_manual_memo,''),
    statement_parcel_counts=case when jsonb_typeof(coalesce(p_parcel_counts,'[]'::jsonb))='array' then coalesce(p_parcel_counts,'[]'::jsonb) else '[]'::jsonb end,
    other_amount=greatest(0,coalesce(p_other_amount,0))
  where order_number=p_order_number;
end;
$$;
revoke all on function public.save_order_statement_extras(text,text,jsonb,numeric) from public;
grant execute on function public.save_order_statement_extras(text,text,jsonb,numeric) to authenticated;
