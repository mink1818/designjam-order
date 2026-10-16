const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'picking.js'), 'utf8');

assert.match(source, /code === "I" && rows\.length === 0/, 'I 품목 없는 주문의 완료상태 판정이 필요합니다.');
assert.match(source, /iStageRows = iRows\.length \? iRows : active\.items/, 'I 품목이 없으면 주문 전체 피킹완료를 확인해야 합니다.');
assert.match(source, /const rows = iRows\.length \? iRows : active\.items/, 'I 품목이 없으면 주문 전체 행에 완료표시를 저장해야 합니다.');
assert.match(source, /주문 전체를 I 피킹완료로 처리할까요/, 'I 품목 없는 주문은 확인창을 보여야 합니다.');

console.log('no-I picking completion guard: ok');
