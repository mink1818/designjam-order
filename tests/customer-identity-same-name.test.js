const fs=require('fs');
const path=require('path');
const assert=require('assert');

const sql=fs.readFileSync(path.join(__dirname,'..','SQL','V6.8.7-CUSTOMER-IDENTITY-SAME-NAME-FIX.sql'),'utf8');
const members=fs.readFileSync(path.join(__dirname,'..','js','members.js'),'utf8');

assert.match(sql,/v_key=v_old_key[\s\S]*return new;/,'거래처명이 실질적으로 같으면 기존 계정 수정을 허용해야 합니다.');
assert.match(sql,/where c\.id<>new\.id/,'실제 거래처명 변경 시 자기 계정은 중복검사에서 제외해야 합니다.');
assert.match(sql,/이미 등록된 거래처명입니다/,'실제 다른 계정과 중복되면 계속 차단해야 합니다.');
assert.match(sql,/is distinct from/,'실제 값이 바뀐 경우에만 거래처 정보와 이력을 저장해야 합니다.');
assert.match(members,/같은 거래처명이 다른 계정에 이미 등록되어 있습니다/,'실제 중복 오류를 정확히 안내해야 합니다.');
assert.match(members,/V6\.8\.7-CUSTOMER-IDENTITY-SAME-NAME-FIX\.sql/,'DB 함수 미적용 오류에는 새 SQL을 안내해야 합니다.');

console.log('customer identity same-name update: ok');
