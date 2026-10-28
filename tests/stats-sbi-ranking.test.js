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
assert.match(html,/⑤ 판매·거래처 랭킹[\s\S]*S·B·I 품번별 출고량 순위[\s\S]*⑥ 출고지·카테고리 분석/,'SBI 출고 순위는 기존 5번 랭킹 안에 있어야 합니다.');
assert.match(js,/renderWarehouseRankings\(aggregateWarehouseRankings\(r\.orders\),r\.label\)/,'기존 월별·토탈 랭킹 조회와 SBI 순위가 연동되어야 합니다.');
assert.match(js,/\$\{group\.code\}출고_품번순위/,'엑셀에 출고지별 품번 순위를 포함해야 합니다.');

console.log('stats SBI ranking: ok');
