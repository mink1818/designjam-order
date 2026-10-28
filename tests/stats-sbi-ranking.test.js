const fs=require('fs');
const path=require('path');
const assert=require('assert');

const js=fs.readFileSync(path.join(__dirname,'..','js','stats.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','stats.html'),'utf8');

assert.match(js,/function statsWarehouseCode\(item\)/,'출고지 판정 함수가 있어야 합니다.');
assert.match(js,/effectiveItemQty\(item\)/,'품절수량을 제외한 실제 출고수량을 사용해야 합니다.');
assert.match(js,/warehouseRankMaps/,'SBI별 순위 집계가 있어야 합니다.');
assert.match(js,/renderRanking\(`warehouseRanking\$\{group\.code\}`/,'기존 판매량 순위 렌더러를 사용해야 합니다.');
assert.match(js,/warehouseRankingExpanded=\{S:false,B:false,I:false\}/,'각 출고지 TOP100 펼치기를 독립 관리해야 합니다.');
assert.match(html,/S·B·I 품번 출고 순위/,'관리자 통계에 SBI 출고 순위 영역이 있어야 합니다.');
assert.match(js,/S출고_품번순위|\$\{group\.code\}출고_품번순위/,'엑셀에 출고지별 품번 순위를 포함해야 합니다.');

console.log('stats SBI ranking: ok');
