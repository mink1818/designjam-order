-- 먼저 Edge Function 배포 및 SHIPMENT_CLEANUP_SECRET 설정 후 아래 값을 실제 값으로 바꾸어 1회 실행하세요.
-- 매일 한국시간 03:20(UTC 18:20)에 31일 지난 원본사진만 삭제합니다.
create extension if not exists pg_cron;create extension if not exists pg_net;
select cron.unschedule('cleanup-shipment-images') where exists(select 1 from cron.job where jobname='cleanup-shipment-images');
select cron.schedule('cleanup-shipment-images','20 18 * * *',$$select net.http_post(url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/cleanup-shipment-images',headers:=jsonb_build_object('Content-Type','application/json','x-cleanup-secret','YOUR_CLEANUP_SECRET'),body:='{}'::jsonb);$$);
