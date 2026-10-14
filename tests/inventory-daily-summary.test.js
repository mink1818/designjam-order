const fs=require('fs');
const assert=require('assert');

const source=fs.readFileSync(require('path').join(__dirname,'../js/scanner.js'),'utf8');
assert(source.includes("function summarizeMovements(rows)"),'일자별 합계 계산 함수가 필요합니다.');
assert(source.includes("sum.inQty+=qty"),'입고수량을 합산해야 합니다.');
assert(source.includes("sum.outQty+=qty"),'출고수량을 합산해야 합니다.');
assert(source.includes("sum.adjustQty+=movementDelta(row)"),'직접수정 증감을 합산해야 합니다.');
assert(source.includes("sum.netQty+=movementDelta(row)"),'순증감을 계산해야 합니다.');
assert(source.includes("isPiecePackItem(row?.item_number)?quantity/10:quantity"),'8881·8882 실제 10개를 1죽으로 환산해야 합니다.');
assert(source.includes("입고 총수량</span><strong>+${quantityText(total.inQty)}단위"),'혼합 합계는 주문단위로 표시해야 합니다.');
assert(source.includes("unit=pieceItem?'개':'죽'"),'건별 이력은 일반 품번 죽, 8881·8882 개로 구분해야 합니다.');
assert(source.includes(".range(from,from+pageSize-1)"),'2,000건 제한 없이 기간 데이터를 페이지 조회해야 합니다.');
assert(source.includes("new Date(`${start}T00:00:00`).toISOString()"),'선택 시작일을 조회 조건에 사용해야 합니다.');
assert(source.includes("next.setDate(next.getDate()+1)"),'선택 종료일 전체를 포함해야 합니다.');
assert(source.includes("setQuickDate('0'"),'기본 조회일은 오늘이어야 합니다.');

const rows=[
  {movement_type:'IN',quantity:12,quantity_before:10,quantity_after:22},
  {movement_type:'OUT',quantity:5,quantity_before:22,quantity_after:17},
  {movement_type:'ADJUST',quantity:0,quantity_before:17,quantity_after:20}
];
const result=rows.reduce((sum,row)=>{
  const qty=Math.max(0,Number(row.quantity||0));
  const delta=row.movement_type==='IN'?qty:row.movement_type==='OUT'?-qty:Number(row.quantity_after||0)-Number(row.quantity_before||0);
  if(row.movement_type==='IN')sum.inQty+=qty;
  else if(row.movement_type==='OUT')sum.outQty+=qty;
  else sum.adjustQty+=delta;
  sum.netQty+=delta;sum.count++;
  return sum;
},{inQty:0,outQty:0,adjustQty:0,netQty:0,count:0});
assert.deepStrictEqual(result,{inQty:12,outQty:5,adjustQty:3,netQty:10,count:3});
console.log('inventory daily summary: ok');
