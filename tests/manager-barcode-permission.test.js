const fs=require('fs');
const path=require('path');
const assert=require('assert');

const security=fs.readFileSync(path.join(__dirname,'..','js','admin-security.js'),'utf8');
const home=fs.readFileSync(path.join(__dirname,'..','admin-home.html'),'utf8');
const products=fs.readFileSync(path.join(__dirname,'..','products.html'),'utf8');

assert.match(security,/MANAGER_ALLOWED=new Set\(\[[^\]]*'products\.html'/,'매니저에게 상품 페이지 진입 권한이 있어야 합니다.');
assert.match(security,/products\.html#barcodeManagement/,'매니저 메뉴는 바코드 영역으로 바로 이동해야 합니다.');
assert.match(security,/manager-barcode-only/,'매니저에게 상품수정 영역을 숨겨야 합니다.');
assert.match(security,/const keep=document\.getElementById\('barcodeManagement'\)/,'바코드관리 영역만 유지해야 합니다.');
assert.match(home,/admin-security\.js\?v=68090/,'관리자 홈 권한 스크립트 캐시를 갱신해야 합니다.');
assert.match(products,/admin-security\.js\?v=68090/,'상품관리 권한 스크립트 캐시를 갱신해야 합니다.');

console.log('manager barcode permission: ok');
