const supabaseUrl="https://dtjhuejmxrjkcxzvilgw.supabase.co";
const supabaseKey="sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";
const supabaseClient=window.supabase.createClient(supabaseUrl,supabaseKey);
const ADMIN_SESSION_KEY="designjam_admin_session";
const ADMIN_EMAILS=new Set(["900smk@naver.com","sm0727sm@hanmail.net","p1028p@naver.com"]);
let allCustomers=[],memberFilter="전체";
const list=document.getElementById('customerList'),search=document.getElementById('memberSearch'),sort=document.getElementById('memberSort');
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const money=v=>Number(v||0).toLocaleString('ko-KR');
const date=v=>v?new Date(v).toLocaleDateString('ko-KR'):'-';
const phone=v=>String(v||'-').replace(/^(\d{3})(\d{3,4})(\d{4})$/,'$1-$2-$3');
const isAdminEmail=e=>ADMIN_EMAILS.has(String(e||'').toLowerCase());

async function checkAdminAccess(){
 const {data:{user}}=await supabaseClient.auth.getUser(); const stored=sessionStorage.getItem(ADMIN_SESSION_KEY)||localStorage.getItem(ADMIN_SESSION_KEY);
 if(!user||(stored&&stored!==user.id)){location.replace('admin.html');return false;}
 const {data:p}=await supabaseClient.from('customers').select('is_admin,blocked').eq('id',user.id).maybeSingle();
 if(!isAdminEmail(user.email)&&!(p?.is_admin===true&&p?.blocked!==true)){location.replace('admin.html');return false;}
 sessionStorage.setItem(ADMIN_SESSION_KEY,user.id);localStorage.setItem(ADMIN_SESSION_KEY,user.id);document.body.classList.add('auth-ready');return true;
}

async function loadCustomers(){
 list.innerHTML='<p>거래처 정보를 불러오는 중...</p>';
 const {data,error}=await supabaseClient.from('customers').select('*').order('created_at',{ascending:false});
 if(error){list.innerHTML=`<div class="product-card"><h2>불러오기 실패</h2><p>${esc(error.message)}</p><p>V3-1-SETUP.sql을 먼저 실행해 주세요.</p></div>`;return;}
 const customers=(data||[]).filter(c=>!c.is_admin);
 const ids=customers.map(c=>c.id);
 let orders=[];
 if(ids.length){ const result=await supabaseClient.from('orders').select('customer_id,total,qty,created_at,order_number').in('customer_id',ids); orders=result.data||[]; }
 const stats={}; orders.forEach(o=>{const s=stats[o.customer_id]||(stats[o.customer_id]={total:0,last:null,orders:new Set()});s.total+=Number(o.total||0);s.orders.add(o.order_number);if(!s.last||new Date(o.created_at)>new Date(s.last))s.last=o.created_at;});
 allCustomers=customers.map(c=>({...c,total_sales:stats[c.id]?.total||0,order_count:stats[c.id]?.orders.size||0,last_order_at:stats[c.id]?.last||c.last_order_at||null}));
 updateCounts();renderFilteredCustomers();
}
function updateCounts(){
 document.getElementById('waitingCount').textContent=allCustomers.filter(c=>!c.approved&&!c.blocked).length;
 document.getElementById('approvedCount').textContent=allCustomers.filter(c=>c.approved&&!c.blocked).length;
 document.getElementById('blockedCount').textContent=allCustomers.filter(c=>c.blocked).length;
 document.getElementById('creditCount').textContent=allCustomers.filter(c=>c.credit_allowed).length;
}
function setMemberFilter(v){memberFilter=v;renderFilteredCustomers();} window.setMemberFilter=setMemberFilter;
function renderFilteredCustomers(){
 const q=String(search.value||'').toLowerCase().replace(/\s/g,'');
 let rows=allCustomers.filter(c=>{
  const status=memberFilter==='전체'||(memberFilter==='승인대기'&&!c.approved&&!c.blocked)||(memberFilter==='승인완료'&&c.approved&&!c.blocked)||(memberFilter==='차단'&&c.blocked);
  const text=[c.business_name,c.owner_name,c.phone,c.email,c.address,c.customer_grade,c.admin_memo].join(' ').toLowerCase().replace(/\s/g,''); return status&&text.includes(q);
 });
 const mode=sort.value; rows.sort((a,b)=>mode==='sales'?b.total_sales-a.total_sales:mode==='order'?new Date(b.last_order_at||0)-new Date(a.last_order_at||0):mode==='name'?String(a.business_name||'').localeCompare(String(b.business_name||''),'ko'):new Date(b.created_at||0)-new Date(a.created_at||0));
 renderCustomers(rows);
}
function renderCustomers(rows){
 if(!rows.length){list.innerHTML='<div class="product-card"><h2>검색 결과가 없습니다</h2></div>';return;}
 list.innerHTML=`<div class="v3-customer-grid">${rows.map(c=>{
  const state=c.blocked?'차단':c.approved?'승인완료':'승인대기'; const cls=c.blocked?'blocked':c.approved?'done':'pending';
  return `<article class="product-card v3-customer-card" data-id="${c.id}">
   <div class="order-top"><div><h2>${esc(c.business_name||'거래처명 미입력')}</h2><small>${esc(c.owner_name||'-')} · ${esc(phone(c.phone))}</small></div><span class="status-badge ${cls}">${state}</span></div>
   <div class="v3-customer-summary"><span>주문 <b>${c.order_count}</b>회</span><span>누적 <b>${money(c.total_sales)}</b>원</span><span>최근 <b>${date(c.last_order_at)}</b></span></div>
   <div class="v3-customer-form">
    <label>등급<select data-field="customer_grade"><option ${c.customer_grade==='일반'?'selected':''}>일반</option><option ${c.customer_grade==='우수'?'selected':''}>우수</option><option ${c.customer_grade==='VIP'?'selected':''}>VIP</option></select></label>
    <label>할인율(%)<input data-field="discount_rate" type="number" min="0" max="100" step="0.1" value="${Number(c.discount_rate||0)}"></label>
    <label class="check-label"><input data-field="credit_allowed" type="checkbox" ${c.credit_allowed?'checked':''}> 외상거래 허용</label>
    <label class="wide">관리자 메모<textarea data-field="admin_memo" placeholder="전화요망, 합배송, 후불 등">${esc(c.admin_memo||'')}</textarea></label>
   </div>
   <p><strong>주소:</strong> ${esc(c.address||'-')}</p><p><strong>가입일:</strong> ${date(c.created_at)}</p>
   <div class="v3-card-actions"><button class="cart-btn" onclick="saveCustomer('${c.id}')">저장</button>${!c.approved&&!c.blocked?`<button class="cart-btn" onclick="approveCustomer('${c.id}')">승인</button>`:''}<button class="cart-btn gray-btn" onclick="toggleBlock('${c.id}',${!!c.blocked})">${c.blocked?'차단 해제':'차단'}</button></div>
  </article>`;}).join('')}</div>`;
}
async function saveCustomer(id){
 const card=list.querySelector(`[data-id="${id}"]`); const payload={};
 card.querySelectorAll('[data-field]').forEach(el=>payload[el.dataset.field]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value||0):el.value.trim());
 const {error}=await supabaseClient.from('customers').update(payload).eq('id',id); if(error)return alert('저장 실패: '+error.message); alert('거래처 정보가 저장되었습니다.'); loadCustomers();
}
async function approveCustomer(id){const {error}=await supabaseClient.from('customers').update({approved:true,blocked:false}).eq('id',id);if(error)return alert(error.message);loadCustomers();}
async function toggleBlock(id,blocked){if(!confirm(blocked?'차단을 해제할까요?':'이 거래처를 차단할까요?'))return;const {error}=await supabaseClient.from('customers').update({blocked:!blocked}).eq('id',id);if(error)return alert(error.message);loadCustomers();}
window.loadCustomers=loadCustomers;window.saveCustomer=saveCustomer;window.approveCustomer=approveCustomer;window.toggleBlock=toggleBlock;
search.addEventListener('input',renderFilteredCustomers);sort.addEventListener('change',renderFilteredCustomers);
document.addEventListener('DOMContentLoaded',async()=>{if(await checkAdminAccess()){const f=new URLSearchParams(location.search).get('filter');if(f==='waiting')memberFilter='승인대기';loadCustomers();}});
