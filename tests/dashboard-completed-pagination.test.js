const fs=require('fs');
const path=require('path');
const assert=require('assert');

const js=fs.readFileSync(path.join(__dirname,'..','js','admin-home.js'),'utf8');

assert.match(js,/async function fetchAllDashboardOrders/,'메인 주문 조회는 전체 페이지 조회 함수를 사용해야 합니다.');
assert.match(js,/select\(columns,withCount\?\{count:'exact'\}:\{\}\)/,'첫 페이지에서 전체 행 수를 확인해야 합니다.');
assert.match(js,/\.order\('id',\{ascending:true\}\)\.range\(from,from\+999\)/,'페이지 경계 누락 방지를 위해 id 정렬과 range를 사용해야 합니다.');
assert.match(js,/for\(let from=1000;from<count;from\+=4000\)/,'1,000행 이후 페이지도 계속 조회해야 합니다.');
assert.match(js,/shippedStart:start,shippedEnd:end/,'오늘 출고완료 조회에 시작·종료 시각을 모두 적용해야 합니다.');
assert.doesNotMatch(js,/from\("orders"\)\.select\("order_number,customer_id,customer_name"\)\.eq\("status","출고완료"\)/,'출고완료를 단일 1,000행 조회로 되돌리면 안 됩니다.');

console.log('dashboard completed pagination: ok');
