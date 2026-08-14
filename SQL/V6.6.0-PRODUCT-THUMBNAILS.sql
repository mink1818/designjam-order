-- DESIGN SOCKS V6.6.1 목록용 상품 썸네일
-- 원본 사진은 그대로 보존하고, 카테고리·검색·장바구니 목록에는 별도 WebP 썸네일을 사용합니다.

alter table public.product_groups
  add column if not exists thumbnail_url text;

comment on column public.product_groups.thumbnail_url is
  '거래처 목록·검색·장바구니용 저용량 WebP 썸네일. 상품 상세는 image_url 원본을 사용.';
