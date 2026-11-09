const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'SQL','V6.8.8-RECEIVABLE-STATS-I-WAITING.sql'),'utf8');
const stats=fs.readFileSync(path.join(root,'js','stats.js'),'utf8');
const home=fs.readFileSync(path.join(root,'js','admin-home.js'),'utf8');
const picking=fs.readFileSync(path.join(root,'js','picking.js'),'utf8');

assert.match(sql,/admin_receivable_snapshot\(\)/,'미수금 단일 서버 집계 함수가 필요합니다.');
assert.match(sql,/distinct on \(p\.order_number\)/,'주문번호별 최신 입금기록 하나만 사용해야 합니다.');
assert.match(sql,/greatest\(\(o\.product_total\+o\.shipping_fee\)-greatest\(coalesce\(p\.paid_amount,0\),0\),0\)/,'실제 출고금액-입금액으로 미수금을 계산해야 합니다.');
assert.match(stats,/rpc\('admin_receivable_snapshot'\)/,'통계가 공통 미수금 서버 집계를 사용해야 합니다.');
assert.match(home,/rpc\('admin_receivable_snapshot'\)/,'메인이 통계와 같은 미수금 서버 집계를 사용해야 합니다.');
assert.match(stats,/receivableReady\?'[^']*'|receivableReady\?money/,'서버 금액 확정 전 캐시 금액을 확정값처럼 표시하면 안 됩니다.');

assert.match(sql,/i_packed_waiting_forced boolean not null default false/,'강제 I 대기 상태는 별도 안전 열이어야 합니다.');
assert.match(sql,/admin_set_i_packed_waiting/,'강제 I 대기 서버 함수가 필요합니다.');
assert.doesNotMatch(sql,/set\s+picked_qty\s*=/i,'강제 I 대기는 피킹수량을 변경하면 안 됩니다.');
assert.doesNotMatch(sql,/set\s+status\s*=/i,'강제 I 대기는 주문상태를 변경하면 안 됩니다.');
assert.match(picking,/id="forceIPackedWaiting"/,'피킹시작 전 강제 이동 버튼이 필요합니다.');
assert.match(picking,/rpc\("admin_set_i_packed_waiting"/,'강제 이동은 권한 검증 RPC를 사용해야 합니다.');
assert.match(picking,/주문수량·피킹수량·재고는 변경되지 않습니다/,'관리자 확인창에 영향 범위를 명확히 표시해야 합니다.');
assert.match(home,/i_packed_waiting_forced/,'메인 화면도 강제 I 대기를 동일하게 분류해야 합니다.');

console.log('V6.8.8 receivable and forced I waiting: ok');

