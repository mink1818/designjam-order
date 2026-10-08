const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'catalog.js'), 'utf8');

assert.match(source, /designjam_cart_bulk_apply_history_/,
  '새로고침 후에도 붙여넣기 적용 이력을 유지해야 합니다.');
assert.match(source, /loadBulkApplyHistory\(\)\.includes\(signature\)/,
  '현재 화면뿐 아니라 저장된 적용 이력도 중복 검사해야 합니다.');
assert.match(source, /if \(existing\) \{ existing\.qty = qty;/,
  '이미 담긴 동일 품번은 더하지 않고 붙여넣기 수량으로 교체해야 합니다.');
assert.doesNotMatch(source, /if \(existing\) \{ existing\.qty = Number\(existing\.qty \|\| 0\) \+ qty;/,
  '붙여넣기 적용 시 동일 품번 수량을 누적해서는 안 됩니다.');
assert.match(source, /needsBulkDuplicateFinalReview\(\)/,
  '중복 교체가 발생한 주문은 저장 직전 최종 수량 확인이 필요합니다.');
assert.match(source, /clearBulkApplyHistory\(\);/,
  '주문 완료 또는 장바구니 초기화 시 적용 이력을 함께 정리해야 합니다.');

console.log('customer bulk double quantity guard: ok');
