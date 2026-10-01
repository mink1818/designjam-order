const assert=require('node:assert/strict');
global.window=global;
require('../js/sales-unit.js');
const unit=global.DesignSocksSalesUnit;

for(const item of ['8881','8882','S-8881','B 8882']){
  const saved=unit.toStored(item,2,10000);
  assert.equal(saved.qty,20,`${item}: 실제 출고수량`);
  assert.equal(saved.price,1000,`${item}: DB 개당 단가`);
  assert.equal(saved.total,20000,`${item}: 주문금액`);
  assert.equal(50-saved.qty,30,`${item}: 재고 50개 차감 후`);
  assert.equal(saved.packQty,2);
  assert.equal(saved.packSize,10);
}

const normal=unit.toStored('3001',2,12000);
assert.deepEqual(normal,{qty:2,price:12000,total:24000,packSize:1,packQty:2,packPrice:12000});

const loaded=unit.fromStored({item_number:'8881',qty:20,price:1000,sales_pack_size:10});
assert.equal(loaded.qty,2);
assert.equal(loaded.price,10000);

const legacy=unit.fromStored({item_number:'8881',qty:2,price:1000,sales_pack_size:null});
assert.equal(legacy.qty,2,'과거 주문은 묶음 변환하지 않음');
assert.equal(legacy.price,1000,'과거 주문금액 단가 유지');
console.log('sales-unit scenarios: PASS');
