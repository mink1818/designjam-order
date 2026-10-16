const assert = require('assert');
const fs = require('fs');
const path = require('path');

const admin = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin.js'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, '..', 'SQL', 'V6.8.2-SOLDOUT-SHIPPING-COMPLETE.sql'), 'utf8');

assert.match(admin, /const quantitiesAccounted = group\.items\.length > 0/, '품절 포함 수량완료 판정이 필요합니다.');
assert.match(admin, /const isShippingReady = isVerified \|\| quantitiesAccounted/, '검증표시가 누락돼도 처리수량이 맞으면 출고 버튼이 필요합니다.');
assert.match(sql, /picked_qty,0\)\+coalesce\(soldout_qty/, '서버에서도 피킹+품절 수량을 검사해야 합니다.');
assert.match(sql, /perform public\.complete_order_picking/, '검증상태 누락 시 서버가 안전하게 최종검증해야 합니다.');
assert.match(sql, /set status='출고완료'/, '품절 주문도 출고완료로 변경해야 합니다.');

console.log('soldout shipping completion guard: ok');
