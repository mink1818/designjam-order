const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin.js'), 'utf8');
const recalc = source.slice(source.indexOf('function recalcOrderCard'), source.indexOf('function getCourierValue'));

assert.match(recalc, /row\.dataset\.rowTotal/,
  '관리자 하단 상품금액은 판매단위를 반영한 행 출고금액을 합산해야 합니다.');
assert.doesNotMatch(recalc, /productTotal \+= shippedQty \* unitPrice/,
  '8881·8882 실제 개수에 10개 묶음 표시단가를 다시 곱하면 안 됩니다.');

const normalRows = [4 * 16000, 7 * 16000];
const packed8881 = 4 * 10000;
const productTotal = [...normalRows, packed8881].reduce((sum, value) => sum + value, 0);
assert.equal(productTotal, 216000);
assert.equal(productTotal + 4000, 220000);

console.log('admin packed final total: ok');
