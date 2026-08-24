const supabaseUrl = "https://dtjhuejmxrjkcxzvilgw.supabase.co";
const supabaseKey = "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const ADMIN_SESSION_KEY = "designjam_admin_session";
const DESIGNJAM_ADMIN_EMAILS = new Set(["900smk@naver.com","sm0727sm@hanmail.net","p1028p@naver.com"]);
let currentAdmin = null;

const isAdminEmail = email => DESIGNJAM_ADMIN_EMAILS.has(String(email || "").trim().toLowerCase());
const todayStartIso = () => { const d=new Date(); d.setHours(0,0,0,0); return d.toISOString(); };
const uniqueOrders = rows => new Set((rows||[]).map(r=>r.order_number).filter(Boolean)).size;
const setText = (id,value) => { const el=document.getElementById(id); if(el) el.textContent=value; };
const esc = value => String(value ?? "").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
function parseSoldoutItems(value){if(Array.isArray(value))return value.map(String);const text=String(value||'').trim();if(!text)return[];try{const parsed=JSON.parse(text);if(Array.isArray(parsed))return parsed.map(String)}catch(_){}return text.replace(/^\{|\}$/g,'').split(',').map(v=>v.trim().replace(/^"|"$/g,'')).filter(Boolean)}
async function fetchAllProductSoldouts(){const rows=[];for(let from=0;;from+=1000){const {data,error}=await supabaseClient.from('inventory_items').select('item_number,quantity,warehouse_code,category_name').lte('quantity',0).range(from,from+999);if(error)throw error;rows.push(...(data||[]));if(!data||data.length<1000)break}return rows}

async function guardAdminHome(){
  const {data:sessionData,error:sessionError}=await supabaseClient.auth.getSession();
  if(sessionError) console.warn("관리자 세션 확인 오류:",sessionError);
  const user=sessionData?.session?.user||null;
  if(!user){ location.replace("admin.html"); return false; }
  const {data:profile,error:profileError}=await supabaseClient.from("customers").select("is_admin,blocked,admin_role").eq("id",user.id).maybeSingle();
  if(profileError) console.warn("관리자 권한 조회 오류:",profileError);
  if(!isAdminEmail(user.email) && !(profile?.is_admin===true && profile?.blocked!==true)){ await supabaseClient.auth.signOut(); location.replace("admin.html"); return false; }
  sessionStorage.setItem(ADMIN_SESSION_KEY,user.id); localStorage.setItem(ADMIN_SESSION_KEY,user.id);
  currentAdmin=user;
  if(['employee','manager'].includes(profile?.admin_role)){document.documentElement.dataset.adminRole='manager';const allowed=['picking.html','proxy-order.html','scanner.html'];document.querySelectorAll('.v3-menu-card').forEach(button=>{const action=button.getAttribute('onclick')||'';if(!allowed.some(page=>action.includes(page))){button.hidden=true;button.classList.add('manager-restricted-menu');button.style.setProperty('display','none','important')}});document.querySelectorAll('.v3-metric-grid,.v3-dashboard-section:last-of-type,.global-admin-search,.unpaid-customer-panel').forEach(element=>{element.hidden=true;element.style.setProperty('display','none','important')})}
  document.body.classList.add("auth-ready");
  requestAnimationFrame(()=>{
    document.body.classList.remove("auth-pending");
    document.querySelectorAll('.v3-metric-grid,.v3-metric-card').forEach(el=>{
      el.style.visibility='visible'; el.style.opacity='1';
    });
  });
  return true;
}

async function loadDashboard(){
  const start=todayStartIso();
  const [todayOrders,pending,doneToday,customers,waiting,products]=await Promise.all([
    supabaseClient.from("orders").select("order_number").gte("created_at",start),
    supabaseClient.from("orders").select("order_number,status").neq("status","출고완료"),
    supabaseClient.from("orders").select("order_number").eq("status","출고완료").gte("shipped_at",start),
    supabaseClient.from("customers").select("id",{count:"exact",head:true}).eq("is_admin",false),
    supabaseClient.from("customers").select("id",{count:"exact",head:true}).eq("approved",false).eq("blocked",false),
    fetchAllProductSoldouts().then(data=>({data,error:null})).catch(error=>({data:[],error}))
  ]);
  setText("todayOrderCount",uniqueOrders(todayOrders.data));
  setText("pendingOrderCount",uniqueOrders(pending.data));
  setText("todayDoneCount",uniqueOrders(doneToday.data));
  setText("customerCount",customers.count ?? 0);
  setText("waitingCustomerCount",waiting.count ?? 0);
  const soldoutItems=new Set();
  (products.data||[]).forEach(item=>{const itemKey=String(item.item_number||'').trim().toUpperCase(),key=`${String(item.warehouse_code||'').toUpperCase()}:${itemKey}`;if(itemKey)soldoutItems.add(key)});
  setText("soldoutCount",products.error?"-":soldoutItems.size);
  setText("dashboardUpdatedAt",`${new Date().toLocaleString("ko-KR")} 기준`);
  await loadNotifications();
  await loadHandwritingTrainingStatus();
  await loadUnpaidCustomers();
  await loadUnansweredInquiryCount();
}

async function loadUnansweredInquiryCount(){
  try{
    const {count,error}=await supabaseClient.from('customer_ai_inquiries').select('id',{count:'exact',head:true}).eq('status','대기');
    if(error)throw error;
    setText('unansweredInquiryCount',count??0);
  }catch(error){
    console.warn('미답변 문의 건수 조회 실패:',error.message);
    setText('unansweredInquiryCount','-');
  }
}

async function fetchDashboardRows(table,columns,orderColumn){const rows=[];for(let from=0;;from+=1000){let q=supabaseClient.from(table).select(columns).range(from,from+999);if(orderColumn)q=q.order(orderColumn,{ascending:false}).order('id',{ascending:false});const {data,error}=await q;if(error)throw error;rows.push(...(data||[]));if(!data||data.length<1000)return rows}}
async function loadUnpaidCustomers(){
  const panel=document.getElementById('unpaidCustomerPanel'),box=document.getElementById('unpaidCustomerList');if(!panel||!box)return;
  try{
    const [orders,payments]=await Promise.all([fetchDashboardRows('orders','order_number,customer_id,customer_name,qty,price,soldout_qty,is_soldout,shipping_fee,status,shipped_at,created_at','created_at'),fetchDashboardRows('order_payment_records','order_number,customer_key,paid_amount,confirmed_by,updated_at','updated_at')]);
    const paymentMap=new Map();payments.forEach(x=>{const k=`order::${x.order_number}`;const old=paymentMap.get(k);if(!old||(!old.confirmed_by&&x.confirmed_by)||new Date(x.updated_at||0)>new Date(old.updated_at||0))paymentMap.set(k,x)});const orderMap=new Map();
    orders.forEach(row=>{if(row.status!=='출고완료')return;const name=row.customer_name||'거래처 미입력',key=`order::${row.order_number}`;if(!orderMap.has(key))orderMap.set(key,{orderNumber:row.order_number,customerId:String(row.customer_id||''),name,total:0,shipping:0});const g=orderMap.get(key),ordered=Number(row.qty||0),soldout=Math.min(ordered,Number(row.soldout_qty||(row.is_soldout?ordered:0)));g.total+=Math.max(0,ordered-soldout)*Number(row.price||0);g.shipping=Math.max(g.shipping,Number(row.shipping_fee||0))});
    const customerMap=new Map();let unpaidOrders=0,unpaidTotal=0;
    orderMap.forEach((g,key)=>{const record=paymentMap.get(`order::${g.orderNumber}`);if(!record)return;const total=g.total+g.shipping,paid=Math.max(0,Number(record.paid_amount||0)),balance=Math.max(0,total-paid);if(balance<=0)return;unpaidOrders++;unpaidTotal+=balance;const ck=String(g.name||'거래처 미입력').normalize('NFKC').replace(/\s+/g,'').toLowerCase();if(!customerMap.has(ck))customerMap.set(ck,{...g,count:0,balance:0});const c=customerMap.get(ck);c.count++;c.balance+=balance});
    const list=[...customerMap.values()].sort((a,b)=>b.balance-a.balance);setText('unpaidCustomerCount',unpaidOrders);setText('unpaidCustomerSummary',`${list.length}곳 · ${unpaidOrders}건 · 미수금 ${unpaidTotal.toLocaleString()}원`);panel.hidden=true;box.innerHTML=list.length?list.slice(0,50).map(c=>`<button type="button" data-href="admin.html?view=orders&status=전체&payment=unpaid&search=${encodeURIComponent(c.name)}"><b>${esc(c.name)}</b><span>${c.count}건</span><strong>${c.balance.toLocaleString()}원 미입금</strong></button>`).join(''):'<p>미입금 거래처가 없습니다.</p>';box.querySelectorAll('[data-href]').forEach(b=>b.onclick=()=>location.href=b.dataset.href);
  }catch(error){console.warn('미입금 현황 조회 실패:',error.message);panel.hidden=true;setText('unpaidCustomerCount','-')}
}

async function loadHandwritingTrainingStatus(){
  const panel=document.getElementById('handwritingTrainingPanel'),text=document.getElementById('handwritingTrainingStatus');if(!panel||!text)return;
  const {data,error}=await supabaseClient.from('handwriting_training_samples').select('confirmed_items').limit(1000);
  if(error){panel.hidden=true;return}
  const photos=(data||[]).length,items=(data||[]).reduce((sum,row)=>sum+(Array.isArray(row.confirmed_items)?row.confirmed_items.length:0),0);
  panel.hidden=false;text.textContent=items>=300?`교정 ${items}품번(${photos}장) 누적 · 전용모델 학습자료 준비 기준에 도달했습니다.`:`교정 ${items}품번(${photos}장) 누적 · 300품번 이상부터 전용모델 학습자료로 활용하기 좋습니다.`;
}

async function loadRevisionAlerts(){
  const panel=document.getElementById('revisionAlertPanel'),box=document.getElementById('revisionAlertList');if(!panel||!box)return;
  const {data,error}=await supabaseClient.from('orders').select('order_number,customer_name,delivery_name,customer_revision_status,customer_revision_started_at,customer_revision_completed_at').not('customer_revision_status','is',null).neq('status','출고완료').order('customer_revision_completed_at',{ascending:false,nullsFirst:false});
  if(error){console.warn('고객 주문 수정건 조회 실패:',error.message);panel.hidden=true;return}
  const map=new Map();(data||[]).forEach(row=>{if(!map.has(row.order_number))map.set(row.order_number,row)});const rows=[...map.values()];panel.hidden=!rows.length;setText('revisionAlertCount',`${rows.length}건`);
  box.innerHTML=rows.map(row=>{const complete=row.customer_revision_status==='수정완료',time=row.customer_revision_completed_at||row.customer_revision_started_at;return `<button type="button" class="revision-alert-item ${complete?'complete':'editing'}" data-order="${esc(row.order_number)}"><span><b>${complete?'🚨 수정완료·변경확인 필요':'✏️ 고객 수정중'}</b><strong>${esc(row.customer_name||'거래처 미입력')}</strong><small>납품처 ${esc(row.delivery_name||'-')} · ${esc(row.order_number)}${time?` · ${new Date(time).toLocaleString('ko-KR')}`:''}</small></span><em>${complete?'변경확인·재피킹 허용':'수정 완료 대기'}</em></button>`}).join('');
  box.querySelectorAll('[data-order]').forEach(button=>button.onclick=()=>location.href=`admin.html?view=orders&search=${encodeURIComponent(button.dataset.order)}`);
}

async function loadNotifications(){
  const box=document.getElementById("dashboardNotificationList");
  const {data,error}=await supabaseClient.from("app_notifications").select("id,title,message,is_read,created_at,link_url,notification_type").eq("recipient_id",currentAdmin.id).neq("notification_type","customer_order_change").order("created_at",{ascending:false}).limit(8);
  if(error){ box.innerHTML='<p class="empty-copy">알림 테이블 설치 후 표시됩니다.</p>'; return; }
  if(!data?.length){ box.innerHTML='<p class="empty-copy">새 알림이 없습니다.</p>'; return; }
  box.innerHTML=data.map(n=>`<button class="v3-notification-item ${n.is_read?'':'unread'}" data-id="${n.id}" data-link="${esc(n.link_url||'')}"><span>${n.is_read?'':'● '}${esc(n.title)}</span><small>${esc(n.message||'')} · ${new Date(n.created_at).toLocaleString('ko-KR')}</small></button>`).join('');
  box.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',async()=>{ await supabaseClient.from('app_notifications').update({is_read:true}).eq('id',btn.dataset.id); const target=resolveAdminNotificationLink(btn.dataset.link); if(target) location.href=target; else loadNotifications(); }));
}

function resolveAdminNotificationLink(rawLink){
  const raw=String(rawLink||'').trim();if(!raw)return '';
  try{
    const url=new URL(raw,location.href);
    if(url.origin!==location.origin)return raw;
    const page=url.pathname.split('/').pop().toLowerCase();
    if(page==='order.html'){
      const orderNumber=url.searchParams.get('order')||url.searchParams.get('order_number')||url.searchParams.get('search')||'';
      return `admin.html?view=orders${orderNumber?`&search=${encodeURIComponent(orderNumber)}`:''}`;
    }
    if(['login.html','index.html','catalog.html','cart.html','customer-settings.html','customer-signup.html'].includes(page))return 'admin-home.html';
    return `${page||'admin-home.html'}${url.search}${url.hash}`;
  }catch(_){
    if(/^(order|login|index|catalog|cart)\.html/i.test(raw))return raw.toLowerCase().startsWith('order.html')?'admin.html?view=orders':'admin-home.html';
    return raw;
  }
}

async function markAllRead(){ if(!currentAdmin)return; await supabaseClient.from('app_notifications').update({is_read:true}).eq('recipient_id',currentAdmin.id).eq('is_read',false); loadNotifications(); }

document.addEventListener('DOMContentLoaded',async()=>{
  if(!(await guardAdminHome()))return;
  document.querySelectorAll('[data-link]').forEach(el=>el.addEventListener('click',()=>location.href=el.dataset.link));
  document.getElementById('refreshDashboardBtn')?.addEventListener('click',loadDashboard);
  document.getElementById('markAllReadBtn')?.addEventListener('click',markAllRead);
  document.getElementById('unpaidCustomerToggle')?.addEventListener('click',()=>{const panel=document.getElementById('unpaidCustomerPanel');if(!panel)return;panel.hidden=!panel.hidden;if(!panel.hidden)panel.scrollIntoView({behavior:'smooth',block:'start'})});
  await loadDashboard();
});

let adminSearchTimer=null;
function searchResultCard(icon,title,sub,href){return `<button type="button" class="admin-search-result" data-href="${esc(href)}"><b>${icon} ${esc(title)}</b><small>${esc(sub)}</small></button>`;}
async function runAdminGlobalSearch(){const input=document.getElementById('adminGlobalSearch'),box=document.getElementById('adminGlobalSearchResults');const q=(input?.value||'').trim();if(!box)return;if(q.length<2){box.hidden=false;box.innerHTML='<p>두 글자 이상 입력하세요.</p>';return;}box.hidden=false;box.innerHTML='<p>주문·거래처·품번을 검색 중입니다.</p>';try{const safe=q.replace(/[,()]/g,' ');const [ordersRes,customersRes,groupsRes]=await Promise.all([supabaseClient.from('orders').select('order_number,customer_name,item_number,status,created_at').or(`order_number.ilike.%${safe}%,customer_name.ilike.%${safe}%,item_number.ilike.%${safe}%`).order('created_at',{ascending:false}).limit(30),supabaseClient.from('customers').select('id,name,business_name,phone,approved,blocked').or(`name.ilike.%${safe}%,business_name.ilike.%${safe}%,phone.ilike.%${safe}%`).limit(12),supabaseClient.from('product_groups').select('id,title,item_numbers,main_category_name,category_name').limit(500)]);const orderMap=new Map();(ordersRes.data||[]).forEach(o=>{if(!orderMap.has(o.order_number))orderMap.set(o.order_number,o);});const products=(groupsRes.data||[]).filter(g=>[g.title,g.item_numbers,g.main_category_name,g.category_name].join(' ').toLowerCase().includes(q.toLowerCase())).slice(0,12);let html='';if(orderMap.size){html+='<h4>주문</h4>'+[...orderMap.values()].slice(0,10).map(o=>searchResultCard('📦',o.order_number,`${o.customer_name||'거래처 미입력'} · ${o.status||'주문접수'}`,`admin.html?view=orders&search=${encodeURIComponent(o.order_number)}`)).join('');}if(customersRes.data?.length){html+='<h4>거래처</h4>'+customersRes.data.map(c=>searchResultCard('🏢',c.business_name||c.name||'이름 미입력',`${c.phone||'전화번호 없음'} · ${c.blocked?'차단':c.approved?'승인':'승인대기'}`,`members.html?search=${encodeURIComponent(c.business_name||c.name||q)}`)).join('');}if(products.length){html+='<h4>상품/품번</h4>'+products.map(g=>searchResultCard('🧦',String(g.item_numbers||g.title||'품번 미입력'),`${g.main_category_name||g.category_name||'대분류 미등록'}`,`products.html?search=${encodeURIComponent(q)}`)).join('');}box.innerHTML=html||'<p>검색 결과가 없습니다.</p>';box.querySelectorAll('[data-href]').forEach(b=>b.onclick=()=>location.href=b.dataset.href);}catch(e){box.innerHTML=`<p>검색 실패: ${esc(e.message)}</p>`;}}
document.getElementById('adminGlobalSearchBtn')?.addEventListener('click',runAdminGlobalSearch);document.getElementById('adminGlobalSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter')runAdminGlobalSearch();if(e.key==='Escape')document.getElementById('adminGlobalSearchResults').hidden=true;});document.getElementById('adminGlobalSearch')?.addEventListener('input',()=>{clearTimeout(adminSearchTimer);adminSearchTimer=setTimeout(runAdminGlobalSearch,450);});document.addEventListener('click',e=>{if(!e.target.closest('.global-admin-search')){const box=document.getElementById('adminGlobalSearchResults');if(box)box.hidden=true;}});
function syncAdminThemeButton(){const b=document.getElementById('adminThemeToggle');if(!b)return;const dark=document.documentElement.dataset.theme==='dark';b.textContent=dark?'☀️ 라이트':'🌙 다크';}
document.getElementById('adminThemeToggle')?.addEventListener('click',()=>{DesignJamPreferences.setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');syncAdminThemeButton();});syncAdminThemeButton();


window.addEventListener('pageshow',()=>{
  if(document.body.classList.contains('auth-ready')){
    document.body.classList.remove('auth-pending','admin-page-leaving');
    document.querySelectorAll('.v3-metric-grid,.v3-metric-card').forEach(el=>{el.style.visibility='visible';el.style.opacity='1';});
  }
});
