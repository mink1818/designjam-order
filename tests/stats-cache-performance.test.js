const fs=require('fs');
const path=require('path');
const assert=require('assert');

const js=fs.readFileSync(path.join(__dirname,'..','js','stats.js'),'utf8');

assert.match(js,/STATS_CACHE_DB='design-socks-stats-cache'/,'통계 전용 캐시가 있어야 합니다.');
assert.match(js,/async function readStatsCache/,'통계 캐시 읽기 함수가 있어야 합니다.');
assert.match(js,/async function writeStatsCache/,'통계 캐시 저장 함수가 있어야 합니다.');
assert.match(js,/function applyStatsCache/,'저장 통계를 즉시 적용해야 합니다.');
assert.match(js,/저장된 통계를 먼저 표시했습니다/,'캐시 표시와 최신화 상태를 관리자에게 알려야 합니다.');
assert.match(js,/await loadSourceData\(\)/,'캐시 표시 후 서버 최신 데이터를 반드시 다시 확인해야 합니다.');

console.log('stats cache performance: ok');
