const fs=require('fs');
const assert=require('assert');

const manager=fs.readFileSync('js/shipment-manager.js','utf8');
const handoff=fs.readFileSync('js/shipment-handoff.js','utf8');

for(const carrier of ['CJ대한통운','한진택배','롯데택배','로젠택배','경동택배','우리택배']){
  assert(manager.includes(carrier),`${carrier} 판독 규칙이 필요합니다.`);
}
assert(manager.includes('운송장번호|송장번호|등기번호|배송번호'),'송장번호 표제 인식이 필요합니다.');
assert(manager.includes("text.match(/\\b\\d{9,14}\\b/g)"),'하이픈 없는 운송장번호 인식이 필요합니다.');
assert(manager.includes("tracks:tracks.length?tracks:['']"),'한 사진의 복수 운송장번호를 보존해야 합니다.');
assert(manager.includes('plausibleTrack'),'택배사별 송장번호 유효성 검사가 필요합니다.');
assert(manager.includes('@zxing/library'),'기본 판독 실패 시 무료 ZXing 보조 판독이 필요합니다.');
assert(manager.includes('이미 등록된 송장입니다'),'중복 송장을 이해하기 쉬운 문구로 안내해야 합니다.');

for(const [name,source] of [['송장관리',manager],['출고전달',handoff]]){
  assert(source.includes("document.body.classList.add('auth-ready')"),`${name} 화면의 로딩 해제가 필요합니다.`);
  assert(source.includes("document.body.classList.remove('auth-pending')"),`${name} 화면의 대기 상태 해제가 필요합니다.`);
  assert(source.includes('if(!await guard())return'),`${name} 관리자 권한 확인이 필요합니다.`);
}
assert(handoff.includes('analyzeDirectShipment(file)'),'출고전달 주문별 송장도 자동분석해야 합니다.');
assert(handoff.includes('tesseract-local-direct'),'주문별 송장의 OCR 결과를 함께 저장해야 합니다.');

console.log('shipment multi-carrier/loading guards: ok');
