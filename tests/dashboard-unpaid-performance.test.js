const fs=require('fs');
const path=require('path');
const assert=require('assert');

const js=fs.readFileSync(path.join(__dirname,'..','js','admin-home.js'),'utf8');

assert.match(js,/fetchUnpaidPaymentRows/,'미수금 대상 입금기록 전용 조회가 있어야 합니다.');
assert.match(js,/\.in\('payment_status',\['미입금','일부입금'\]\)/,'미입금·일부입금만 먼저 조회해야 합니다.');
assert.match(js,/fetchCompletedUnpaidRows\(\[\.\.\.paymentMap\.values\(\)\]\.map\(x=>x\.order_number\)\)/,'미수금 대상 주문만 조회해야 합니다.');
assert.match(js,/\.in\('order_number',numbers\)/,'대상 주문번호로 서버 조회 범위를 제한해야 합니다.');
assert.doesNotMatch(js,/fetchCompletedUnpaidRows\(\),fetchDashboardRows\('order_payment_records'/,'전체 출고완료와 전체 입금기록을 동시에 읽으면 안 됩니다.');

console.log('dashboard unpaid performance: ok');
