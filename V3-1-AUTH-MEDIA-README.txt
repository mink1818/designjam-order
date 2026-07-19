V3.1 인증/공지 이미지 기능 설치

1) Supabase SQL Editor에서 V3-1-AUTH-MEDIA-SETUP.sql 실행
   - 이미 같은 정책이 있으면 해당 정책만 삭제 후 재실행하거나 오류 메시지를 확인하세요.

2) Supabase CLI로 Edge Function 배포
   supabase login
   supabase link --project-ref dtjhuejmxrjkcxzvilgw
   supabase functions deploy admin-user-management

3) 웹 프로젝트 배포
   git add .
   git commit -m "add notice image upload and password management"
   git push

기능
- 공지 이미지 파일 업로드
- 로그인 사용자의 직접 비밀번호 변경
- 관리자의 거래처 임시 비밀번호 설정
- 일반 관리자 계정 추가

주의
- 임시 비밀번호 및 관리자 추가는 service_role 키가 브라우저에 노출되지 않도록 Edge Function에서만 처리합니다.
