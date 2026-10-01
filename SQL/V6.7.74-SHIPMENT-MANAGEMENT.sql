-- DESIGN SOCKS V6.7.74 송장관리/출고전달 (기존 orders 변경 없음)
create extension if not exists pgcrypto;

create or replace function public.shipment_staff_allowed()
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.customers c where c.id=auth.uid() and c.is_admin=true and coalesce(c.blocked,false)=false and coalesce(c.admin_role,'admin') in ('developer_admin','admin','manager'));
$$;

create table if not exists public.shipment_upload_batches(
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), uploaded_by uuid references auth.users(id), file_count integer not null default 0,
 status text not null default 'processing' check(status in('processing','completed','partial','failed'))
);
create table if not exists public.shipment_documents(
 id uuid primary key default gen_random_uuid(), batch_id uuid references public.shipment_upload_batches(id) on delete set null,
 storage_path text, original_name text, mime_type text, file_size bigint, image_sha256 text not null, ocr_text text, ocr_engine text,
 uploaded_by uuid references auth.users(id), created_at timestamptz not null default now(), delete_after timestamptz not null default(now()+interval '31 days'), image_deleted_at timestamptz,
 unique(image_sha256)
);
create table if not exists public.shipment_labels(
 id uuid primary key default gen_random_uuid(), document_id uuid not null references public.shipment_documents(id) on delete cascade,
 label_index integer not null default 0, warehouse_code text check(warehouse_code is null or warehouse_code in('S','B','I')),
 carrier_name text, tracking_number text, tracking_normalized text, recipient_name text, recipient_phone text, recipient_address text,
 match_status text not null default 'review' check(match_status in('review','matched','duplicate','ignored')),
 match_score integer not null default 0, match_reasons jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists shipment_labels_carrier_tracking_uq on public.shipment_labels(lower(coalesce(carrier_name,'')),tracking_normalized) where tracking_normalized is not null and tracking_normalized<>'';
create table if not exists public.shipment_order_links(
 id uuid primary key default gen_random_uuid(), label_id uuid not null references public.shipment_labels(id) on delete cascade,
 order_number text not null, link_type text not null default 'manual' check(link_type in('auto','manual')),
 confidence integer not null default 0, linked_by uuid references auth.users(id), linked_at timestamptz not null default now(), unique(label_id,order_number)
);
create index if not exists shipment_order_links_order_idx on public.shipment_order_links(order_number);
create table if not exists public.shipment_handoffs(
 id uuid primary key default gen_random_uuid(), business_date date not null, customer_id uuid, customer_name text not null,
 completed_at timestamptz, completed_by uuid references auth.users(id), note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(business_date,customer_id)
);

alter table public.shipment_upload_batches enable row level security;alter table public.shipment_documents enable row level security;alter table public.shipment_labels enable row level security;alter table public.shipment_order_links enable row level security;alter table public.shipment_handoffs enable row level security;
do $$ declare t text; begin foreach t in array array['shipment_upload_batches','shipment_documents','shipment_labels','shipment_order_links','shipment_handoffs'] loop execute format('drop policy if exists shipment_staff_all on public.%I',t);execute format('create policy shipment_staff_all on public.%I for all to authenticated using (public.shipment_staff_allowed()) with check (public.shipment_staff_allowed())',t);end loop;end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('shipping-labels','shipping-labels',false,15728640,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists shipment_storage_read on storage.objects;drop policy if exists shipment_storage_insert on storage.objects;drop policy if exists shipment_storage_delete on storage.objects;
create policy shipment_storage_read on storage.objects for select to authenticated using(bucket_id='shipping-labels' and public.shipment_staff_allowed());
create policy shipment_storage_insert on storage.objects for insert to authenticated with check(bucket_id='shipping-labels' and public.shipment_staff_allowed());
create policy shipment_storage_delete on storage.objects for delete to authenticated using(bucket_id='shipping-labels' and public.shipment_staff_allowed());

-- 거래처는 자기 주문의 번호/택배사만 조회. 원본사진 경로는 반환하지 않음.
create or replace function public.get_my_order_shipments(p_order_number text default null)
returns table(order_number text,warehouse_code text,carrier_name text,tracking_number text) language sql stable security definer set search_path=public as $$
 select lnk.order_number,l.warehouse_code,l.carrier_name,l.tracking_number from public.shipment_order_links lnk join public.shipment_labels l on l.id=lnk.label_id
 where exists(select 1 from public.orders o where o.order_number=lnk.order_number and o.customer_id=auth.uid()) and (p_order_number is null or lnk.order_number=p_order_number);
$$;
revoke all on function public.get_my_order_shipments(text) from public;grant execute on function public.get_my_order_shipments(text) to authenticated;

comment on table public.shipment_documents is '원본은 delete_after 이후 Edge Function으로 삭제하며 해시/메타데이터는 중복방지를 위해 유지';
