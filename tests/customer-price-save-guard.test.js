const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const proxy = read('js/proxy-order.js');
const admin = read('js/admin.js');
const catalog = read('js/catalog.js');
const sql = read('SQL/V6.7.79-CUSTOMER-PRICE-SAVE-GUARD.sql');

assert(proxy.includes("price_manual:r.dataset.priceManual==='1'"), '대신주문 수기단가 표시 누락');
assert(proxy.includes('price_manual:x.price_manual===true'), '대신주문 RPC 수기단가 전달 누락');
assert(admin.includes("price_manual: row.dataset.priceManual === '1' || row.dataset.manualOverride === '1'"), '주문수정 수기단가 표시 누락');
assert(catalog.includes('customerPriceLoadState = "error"'), '거래처 단가 조회 실패 상태 누락');
assert(catalog.includes('전용단가를 확인하지 못해 주문 저장을 중단했습니다'), '일반주문 저장 차단 안내 누락');
assert(sql.includes('resolve_customer_order_price'), '서버 단가 해석 함수 누락');
assert(sql.includes('v_item_changed and not v_price_manual'), '주문수정 서버 검증 누락');
assert(sql.includes('not v_price_manual'), '대신주문 서버 검증 누락');
assert(!/update\s+public\.orders\s+o?\s*set[\s\S]*where[\s\S]*customer_name_item_prices/i.test(sql), '과거 주문 대량 변경 가능성');

console.log('customer-price-save-guard tests passed');
