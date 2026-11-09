const fs=require('fs');
const path=require('path');
const assert=require('assert');

const js=fs.readFileSync(path.join(__dirname,'..','js','admin-home.js'),'utf8');

assert.match(js,/rpc\('admin_receivable_snapshot'\)/,'메인은 서버에서 계산한 단일 미수금 스냅샷을 사용해야 합니다.');
assert.match(js,/Array\.isArray\(snapshot\.data\)/,'서버 미수금 결과만 화면 자료로 변환해야 합니다.');
assert.doesNotMatch(js,/await fetchAllDashboardOrders\(\{status:'출고완료'.*order_payment_records/s,'전체 출고완료와 전체 입금기록을 따로 내려받으면 안 됩니다.');

console.log('dashboard unpaid performance: ok');
