const supabaseUrl="https://dtjhuejmxrjkcxzvilgw.supabase.co";
const supabaseKey="sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";
const supabaseClient=window.supabase.createClient(supabaseUrl,supabaseKey);
const ADMIN_SESSION_KEY="designjam_admin_session";
const ADMIN_EMAILS=new Set(["900smk@naver.com","sm0727sm@hanmail.net","p1028p@naver.com"]);
const PAGE_SIZE=30;
let allCustomers=[],memberFilter="전체",currentRows=[],visibleCount=PAGE_SIZE;
let adminCustomerMeta=new Map();
const list=document.getElementById('customerList'),search=document.getElementById('memberSearch'),sort=document.getElementById('memberSort');
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const money=v=>Number(v||0).toLocaleString('ko-KR');
const date=v=>v?new Date(v).toLocaleDateString('ko-KR'):'-';
const phone=v=>String(v||'-').replace(/^(\d{3})(\d{3,4})(\d{4})$/,'$1-$2-$3');
const isAdminEmail=e=>ADMIN_EMAILS.has(String(e||'').toLowerCase());
const MEMBER_KOREAN_INITIALS='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function memberInitialText(value){return[...String(value||'').normalize('NFKC')].map(char=>{const code=char.charCodeAt(0)-0xAC00;return code>=0&&code<=11171?MEMBER_KOREAN_INITIALS[Math.floor(code/588)]:char}).join('')}
function memberGradeRank(value){const grade=String(value||'일반').trim().toUpperCase();return grade==='VVIP'?4:grade==='VIP'?3:['우수','우수고객'].includes(grade)?2:1}

async function checkAdminAccess(){
 const {data:{user}}=await supabaseClient.auth.getUser();
 const stored=sessionStorage.getItem(ADMIN_SESSION_KEY)||localStorage.getItem(ADMIN_SESSION_KEY);
 if(!user||(stored&&stored!==user.id)){location.replace('admin.html');return false;}
 const {data:p}=await supabaseClient.from('customers').select('is_admin,blocked').eq('id',user.id).maybeSingle();
 if(!isAdminEmail(user.email)&&!(p?.is_admin===true&&p?.blocked!==true)){location.replace('admin.html');return false;}
 sessionStorage.setItem(ADMIN_SESSION_KEY,user.id);localStorage.setItem(ADMIN_SESSION_KEY,user.id);document.body.classList.add('auth-ready');return true;
}

async function withTimeout(promise,ms=15000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('요청 시간이 초과되었습니다. 네트워크 연결을 확인한 뒤 새로고침해 주세요.')),ms)})]);}finally{clearTimeout(timer)}}
async function fetchAllMemberOrderStats(){const rows=[];for(let from=0;;from+=1000){const result=await withTimeout(supabaseClient.from('orders').select('customer_id,customer_name,total,qty,price,soldout_qty,is_soldout,created_at,order_number').order('created_at',{ascending:false}).range(from,from+999),18000);if(result.error)throw result.error;rows.push(...(result.data||[]));if(!result.data||result.data.length<1000)break}return rows}
const memberNameKey=value=>String(value||'').trim().normalize('NFKC').toLowerCase().replace(/[\s_.·,()\[\]{}\-/]+/g,'');
async function loadCustomers(){
 list.innerHTML='<p class="customer-loading">거래처 정보를 불러오는 중...</p>';
 try{
 const [{data,error},metaResult]=await Promise.all([withTimeout(supabaseClient.from('customers').select('*').order('created_at',{ascending:false}),15000),withTimeout(supabaseClient.from('customer_admin_metadata').select('*'),15000).catch(()=>({data:[]}))]);
 adminCustomerMeta=new Map((metaResult.data||[]).map(row=>[String(row.customer_id),row]));
 if(error)throw error;
 const customers=(data||[]).filter(c=>!c.is_admin);
 let orders=[];
 try{
   const result=await fetchAllMemberOrderStats();
   const customerIds=new Set(customers.map(c=>String(c.id))),customerNames=new Set(customers.map(c=>memberNameKey(c.business_name)).filter(Boolean));orders=result.filter(o=>customerIds.has(String(o.customer_id))||customerNames.has(memberNameKey(o.customer_name)));
 }catch(statsError){console.warn('거래처 주문통계 생략:',statsError);}
 const stats={},customerIds=new Set(customers.map(c=>String(c.id)));
 const customerByName=new Map(customers.map(c=>[memberNameKey(c.business_name),c.id]));
 orders.forEach(o=>{const customerId=customerIds.has(String(o.customer_id))?o.customer_id:customerByName.get(memberNameKey(o.customer_name));if(!customerId)return;const s=stats[customerId]||(stats[customerId]={total:0,last:null,orders:new Set()}),ordered=Math.max(0,Number(o.qty||0)),soldout=Math.min(ordered,Math.max(0,Number(o.soldout_qty||(o.is_soldout?ordered:0)))),shipped=Math.max(0,ordered-soldout);s.total+=shipped*Number(o.price||0);s.orders.add(o.order_number);if(!s.last||new Date(o.created_at)>new Date(s.last))s.last=o.created_at;});
 allCustomers=customers.map(c=>({...c,total_sales:stats[c.id]?.total||0,order_count:stats[c.id]?.orders.size||0,last_order_at:stats[c.id]?.last||c.last_order_at||null}));
 visibleCount=PAGE_SIZE;updateCounts();renderFilteredCustomers();
 }catch(error){list.innerHTML=`<div class="product-card"><h2>거래처 불러오기 실패</h2><p>${esc(error.message||'알 수 없는 오류')}</p><button class="cart-btn" type="button" onclick="loadCustomers()">다시 불러오기</button></div>`;}
}
function updateCounts(){
 document.getElementById('waitingCount').textContent=allCustomers.filter(c=>!c.approved&&!c.blocked).length;
 document.getElementById('approvedCount').textContent=allCustomers.filter(c=>c.approved&&!c.blocked).length;
 document.getElementById('blockedCount').textContent=allCustomers.filter(c=>c.blocked).length;
}
function setMemberFilter(v){memberFilter=v;visibleCount=PAGE_SIZE;document.querySelectorAll('.admin-filter button').forEach(b=>b.classList.toggle('active',b.dataset.filter===v));renderFilteredCustomers();}
window.setMemberFilter=setMemberFilter;
function renderFilteredCustomers(){
 const q=String(search.value||'').toLowerCase().replace(/\s/g,'');
 let rows=allCustomers.filter(c=>{
  const status=memberFilter==='전체'||(memberFilter==='승인대기'&&!c.approved&&!c.blocked)||(memberFilter==='승인완료'&&c.approved&&!c.blocked)||(memberFilter==='차단'&&c.blocked);
  const meta=adminCustomerMeta.get(String(c.id))||{};const text=[c.business_name,c.owner_name,c.representative,c.phone,c.email,c.address,c.customer_grade,c.admin_memo,meta.customer_code,meta.customer_tag].join(' ').toLowerCase().replace(/\s/g,'');
  return status&&(text.includes(q)||memberInitialText(text).replace(/\s/g,'').includes(q));
 });
 const mode=sort.value;
 rows.sort((a,b)=>mode==='grade-desc'?memberGradeRank(b.customer_grade)-memberGradeRank(a.customer_grade)||String(a.business_name||'').localeCompare(String(b.business_name||''),'ko'):mode==='grade-asc'?memberGradeRank(a.customer_grade)-memberGradeRank(b.customer_grade)||String(a.business_name||'').localeCompare(String(b.business_name||''),'ko'):mode==='sales'?Number(b.total_sales||0)-Number(a.total_sales||0)||String(a.business_name||'').localeCompare(String(b.business_name||''),'ko'):mode==='order-count'?Number(b.order_count||0)-Number(a.order_count||0)||Number(b.total_sales||0)-Number(a.total_sales||0):mode==='order'?new Date(b.last_order_at||0)-new Date(a.last_order_at||0):mode==='seen'?new Date(b.last_seen_at||0)-new Date(a.last_seen_at||0):mode==='name'?String(a.business_name||'').localeCompare(String(b.business_name||''),'ko'):new Date(b.created_at||0)-new Date(a.created_at||0));
 currentRows=rows;renderCustomers();
}
function customerState(c){return c.blocked?{text:'차단',cls:'blocked'}:c.approved?{text:'승인',cls:'done'}:{text:'대기',cls:'pending'};}
function isOnline(c){return !!c.last_seen_at&&(Date.now()-new Date(c.last_seen_at).getTime())<=5*60*1000;}
function lastSeenText(c){if(!c.last_seen_at)return '접속 기록 없음';if(isOnline(c))return '실시간 접속중';return '최근 '+new Date(c.last_seen_at).toLocaleString('ko-KR');}
function renderCustomers(){
 if(!currentRows.length){list.innerHTML='<div class="product-card"><h2>검색 결과가 없습니다</h2></div>';return;}
 const shown=currentRows.slice(0,visibleCount);
 list.innerHTML=`
  <div class="customer-list-head"><span>검색결과 <b>${currentRows.length}</b>곳</span><span>현재 <b>${shown.length}</b>곳 표시</span></div>
  <div class="compact-customer-list">${shown.map(renderCustomerRow).join('')}</div>
  ${visibleCount<currentRows.length?`<button class="cart-btn customer-more-btn" onclick="showMoreCustomers()">다음 ${Math.min(PAGE_SIZE,currentRows.length-visibleCount)}곳 더 보기</button>`:''}`;
}
function renderCustomerRow(c){
 const state=customerState(c);const owner=c.owner_name||c.representative||'-';const grade=c.customer_grade||'일반';const meta=adminCustomerMeta.get(String(c.id))||{};
 return `<article class="compact-customer-card" data-id="${c.id}">
  <button type="button" class="compact-customer-summary-row" onclick="toggleCustomerDetail('${c.id}')" aria-expanded="false">
   <span class="customer-main-info"><strong>${esc(c.business_name||'거래처명 미입력')}${meta.customer_tag?` <small class="member-customer-alias">${esc(meta.customer_tag)}</small>`:''}</strong><small>${esc(owner)} · ${esc(phone(c.phone))}</small></span>
   <span class="customer-meta-info"><span class="presence-chip ${isOnline(c)?'online':'offline'}">${isOnline(c)?'● 접속중':'○ 오프라인'}</span><span class="status-badge ${state.cls}">${state.text}</span><span class="grade-chip">${esc(grade)}</span><small>${esc(lastSeenText(c))}</small></span>
   <span class="customer-chevron">›</span>
  </button>
  <div class="compact-customer-detail" id="detail-${c.id}" hidden>
   <div class="customer-detail-stats"><span>주문 <b>${c.order_count}</b>회</span><span>누적 <b>${money(c.total_sales)}</b>원</span><span>가입 <b>${date(c.created_at)}</b></span></div>
   <div class="customer-contact-grid"><p><strong>이메일</strong>${esc(c.email||'-')}</p><p><strong>주소</strong>${esc(c.address||'-')}</p></div>
   <div class="v3-customer-form">
    <label>거래처명<input data-field="business_name" maxlength="100" value="${esc(c.business_name||'')}"></label>
    <label>대표자명<input data-field="owner_name" maxlength="100" value="${esc(c.owner_name||c.representative||'')}"></label>
    <label>연락처<input data-field="phone" maxlength="50" value="${esc(c.phone||'')}"></label>
    <label class="wide">가입 주소<input data-field="address" maxlength="300" value="${esc(c.address||'')}"></label>
    <label>등급<select data-field="customer_grade"><option ${grade==='일반'?'selected':''}>일반</option><option ${grade==='우수'?'selected':''}>우수</option><option ${grade==='VIP'?'selected':''}>VIP</option><option ${String(grade).toUpperCase()==='VVIP'?'selected':''}>VVIP</option></select></label>
    <label>고객코드<input data-admin-meta="customer_code" maxlength="40" value="${esc(meta.customer_code||'')}" placeholder="예: A012"></label><label>거래처 애칭<input data-admin-meta="customer_tag" maxlength="40" value="${esc(meta.customer_tag||'')}" placeholder="예: 휴대폰주문"></label><label class="wide">관리자 메모<textarea data-field="admin_memo" placeholder="전화요망, 합배송, 후불 등">${esc(c.admin_memo||'')}</textarea></label>
   </div>
   <section class="customer-password-admin-box"><h3>비밀번호 분실 처리</h3><p>거래처에 안내할 새 비밀번호를 관리자가 직접 지정합니다.</p><div class="customer-password-row"><input data-password-one type="password" minlength="6" autocomplete="new-password" placeholder="새 비밀번호 6자리 이상"><input data-password-two type="password" minlength="6" autocomplete="new-password" placeholder="새 비밀번호 확인"><button class="cart-btn" type="button" onclick="setCustomerPassword('${c.id}', this)">비밀번호 변경</button></div></section>
   <div class="v3-card-actions"><button class="cart-btn" onclick="saveCustomer('${c.id}')">저장</button>${!c.approved&&!c.blocked?`<button class="cart-btn" onclick="approveCustomer('${c.id}')">승인</button>`:''}<button class="cart-btn gray-btn" onclick="toggleBlock('${c.id}',${!!c.blocked})">${c.blocked?'차단 해제':'차단'}</button><button class="cart-btn gray-btn" onclick="openCustomerOrders('${c.id}','${esc(c.business_name||'')}')">주문내역</button></div>
  </div>
 </article>`;
}
function toggleCustomerDetail(id){
 const card=list.querySelector(`[data-id="${id}"]`);if(!card)return;
 const detail=card.querySelector('.compact-customer-detail');const btn=card.querySelector('.compact-customer-summary-row');const open=detail.hasAttribute('hidden');
 if(open){detail.removeAttribute('hidden');card.classList.add('open');btn.setAttribute('aria-expanded','true');}else{detail.setAttribute('hidden','');card.classList.remove('open');btn.setAttribute('aria-expanded','false');}
}
function showMoreCustomers(){visibleCount+=PAGE_SIZE;renderCustomers();}
function openCustomerOrders(id,name){location.href=`admin.html?status=${encodeURIComponent('전체')}&period=all&customer=${encodeURIComponent(id)}&search=${encodeURIComponent(name)}`;}
function openProxyOrder(id){location.href=`proxy-order.html?customer=${encodeURIComponent(id)}`;}
async function saveCustomer(id){
 const card=list.querySelector(`[data-id="${id}"]`);const payload={};
 card.querySelectorAll('[data-field]').forEach(el=>payload[el.dataset.field]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value||0):el.value.trim());
 const businessName=payload.business_name,ownerName=payload.owner_name;delete payload.business_name;delete payload.owner_name;
 if(!businessName)return alert('거래처명을 입력하세요.');
 const identity=await supabaseClient.rpc('admin_update_customer_identity',{p_customer_id:id,p_business_name:businessName,p_owner_name:ownerName});
 if(identity.error)return alert('거래처명·대표자명 저장 실패: '+identity.error.message+'\n\nSQL/V6.5.28-CUSTOMER-DELIVERY-AUDIT.sql을 먼저 실행하세요.');
 const {error}=await supabaseClient.from('customers').update(payload).eq('id',id);if(error)return alert('저장 실패: '+error.message);
 const metaPayload={customer_id:id,customer_code:(card.querySelector('[data-admin-meta="customer_code"]')?.value||'').trim(),customer_tag:(card.querySelector('[data-admin-meta="customer_tag"]')?.value||'').trim(),show_order_tag:true,updated_at:new Date().toISOString()};
 const metaSave=await supabaseClient.from('customer_admin_metadata').upsert(metaPayload,{onConflict:'customer_id'});if(metaSave.error)return alert('고객코드·거래처 애칭 저장 실패: '+metaSave.error.message+'\n\nV6.6.20 SQL을 먼저 실행하세요.');
 alert('거래처 정보가 저장되었습니다. 변경 이력도 기록했습니다.');loadCustomers();
}
async function approveCustomer(id){const {error}=await supabaseClient.from('customers').update({approved:true,blocked:false}).eq('id',id);if(error)return alert(error.message);loadCustomers();}
async function toggleBlock(id,blocked){if(!confirm(blocked?'차단을 해제할까요?':'이 거래처를 차단할까요?'))return;const {error}=await supabaseClient.from('customers').update({blocked:!blocked}).eq('id',id);if(error)return alert(error.message);loadCustomers();}

async function invokeAdminUserAction(payload){
 const {data,error}=await supabaseClient.functions.invoke('admin-user-management',{body:payload});
 if(error)throw new Error(error.message||'계정 관리 서버 연결에 실패했습니다.');
 if(data?.error)throw new Error(data.error);
 return data;
}
async function setCustomerPassword(id,button){
 const card=button.closest('.compact-customer-card');
 const first=card?.querySelector('[data-password-one]')?.value||'';
 const second=card?.querySelector('[data-password-two]')?.value||'';
 if(first.length<6)return alert('새 비밀번호를 6자리 이상 입력하세요.');
 if(first!==second)return alert('비밀번호 확인 값이 일치하지 않습니다.');
 if(!confirm('이 거래처의 비밀번호를 입력한 값으로 변경할까요?'))return;
 button.disabled=true;button.textContent='변경 중...';
 try{await invokeAdminUserAction({action:'set_password',target_id:id,password:first});card.querySelector('[data-password-one]').value='';card.querySelector('[data-password-two]').value='';alert('거래처 비밀번호가 변경되었습니다.');}
 catch(error){alert('비밀번호 변경 실패: '+error.message+'\n\nEdge Function 배포 여부를 확인하세요.');}
 finally{button.disabled=false;button.textContent='비밀번호 변경';}
}
window.loadCustomers=loadCustomers;window.saveCustomer=saveCustomer;window.approveCustomer=approveCustomer;window.toggleBlock=toggleBlock;window.toggleCustomerDetail=toggleCustomerDetail;window.showMoreCustomers=showMoreCustomers;window.openCustomerOrders=openCustomerOrders;window.openProxyOrder=openProxyOrder;window.setCustomerPassword=setCustomerPassword;
search.addEventListener('input',()=>{visibleCount=PAGE_SIZE;renderFilteredCustomers();});sort.addEventListener('change',()=>{visibleCount=PAGE_SIZE;renderFilteredCustomers();});
document.addEventListener('DOMContentLoaded',async()=>{if(await checkAdminAccess()){document.querySelector('[data-filter="전체"]')?.classList.add('active');const f=new URLSearchParams(location.search).get('filter');if(f==='waiting'){memberFilter='승인대기';document.querySelectorAll('.admin-filter button').forEach(b=>b.classList.toggle('active',b.dataset.filter==='승인대기'));}await loadCustomers();loadLoginStats();setInterval(()=>{if(document.visibilityState==='visible')loadLoginStats()},300000);setInterval(()=>{if(document.visibilityState==='visible')refreshCustomerPresence()},120000);supabaseClient.channel('customer-presence-admin-v6612').on('postgres_changes',{event:'UPDATE',schema:'public',table:'customers'},payload=>{if(payload.new?.last_seen_at)applyCustomerPresence(payload.new.id,payload.new.last_seen_at)}).subscribe();}});

let loginStatsLoading=false,presenceLoading=false;
async function loadLoginStats(){if(loginStatsLoading||document.visibilityState==='hidden')return;loginStatsLoading=true;try{const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);const [online,tod,yes]=await Promise.all([supabaseClient.from('customers').select('id',{count:'exact',head:true}).eq('is_admin',false).gte('last_seen_at',new Date(Date.now()-5*60*1000).toISOString()),supabaseClient.from('customer_login_events').select('id',{count:'exact',head:true}).gte('logged_in_at',today.toISOString()),supabaseClient.from('customer_login_events').select('id',{count:'exact',head:true}).gte('logged_in_at',yesterday.toISOString()).lt('logged_in_at',today.toISOString())]);document.getElementById('onlineCount').textContent=online.count||0;document.getElementById('todayLoginCount').textContent=tod.count||0;document.getElementById('yesterdayLoginCount').textContent=yes.count||0;}finally{loginStatsLoading=false}}
function applyCustomerPresence(id,lastSeenAt){const customer=allCustomers.find(row=>String(row.id)===String(id));if(!customer)return;customer.last_seen_at=lastSeenAt;const card=document.querySelector(`.compact-customer-card[data-id="${CSS.escape(String(id))}"]`),chip=card?.querySelector('.presence-chip'),small=card?.querySelector('.customer-meta-info>small');if(!chip)return;const online=isOnline(customer);chip.className=`presence-chip ${online?'online':'offline'}`;chip.textContent=online?'● 접속중':'○ 오프라인';if(small)small.textContent=lastSeenText(customer)}
async function refreshCustomerPresence(){if(presenceLoading||document.visibilityState==='hidden')return;presenceLoading=true;try{const {data,error}=await supabaseClient.from('customers').select('id,last_seen_at').eq('is_admin',false);if(error)return;(data||[]).forEach(row=>applyCustomerPresence(row.id,row.last_seen_at));}finally{presenceLoading=false}}
