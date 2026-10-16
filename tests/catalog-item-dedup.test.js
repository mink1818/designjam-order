const assert = require('assert');
const fs = require('fs');
const path = require('path');

const catalog = fs.readFileSync(path.join(__dirname, '..', 'js', 'catalog.js'), 'utf8');
const proxy = fs.readFileSync(path.join(__dirname, '..', 'js', 'proxy-order.js'), 'utf8');

assert.match(catalog, /function dedupeCatalogGroups\(/, '상품 묶음 중복 제거 함수가 필요합니다.');
assert.match(catalog, /groups = dedupeCatalogGroups\(groupResponse\.data \|\| \[\]\)/, '불러온 상품 묶음에 중복 제거를 적용해야 합니다.');
assert.match(catalog, /const seen = new Set\(\);[\s\S]*function getBulkOrderItemIndex/, '품번 인덱스 중복 방지 장치가 필요합니다.');
assert.match(catalog, /catalogItemIdentity\(item\.number, inferCartWarehouseCode\(item\)\)/, '장바구니도 출고지·품번 기준으로 합쳐야 합니다.');
assert.match(proxy, /const rawLines=.*proxy-line/, '관리자 대신주문 원본 행을 먼저 읽어야 합니다.');
assert.match(proxy, /const lineMap=new Map\(\)/, '관리자 대신주문 중복행을 합쳐야 합니다.');

console.log('catalog item dedup guard: ok');
