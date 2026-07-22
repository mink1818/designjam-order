const supabaseUrl = "https://dtjhuejmxrjkcxzvilgw.supabase.co";
const supabaseKey = "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
const ADMIN_SESSION_KEY = "designjam_admin_session";
const DESIGNJAM_ADMIN_EMAILS = new Set(["900smk@naver.com","sm0727sm@hanmail.net","p1028p@naver.com"]);
let currentAdmin = null;

const isAdminEmail = email => DESIGNJAM_ADMIN_EMAILS.has(String(email || "").trim().toLowerCase());
const todayStartIso = () => { const d=new Date(); d.setHours(0,0,0,0); return d.toISOString(); };
const uniqueOrders = rows => new Set((rows||[]).map(r=>r.order_number).filter(Boolean)).size;
const setText = (id,value) => { const el=document.getElementById(id); if(el) el.textContent=value; };
const esc = value => String(value ?? "").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

async function guardAdminHome(){
  const {data:{user}}=await supabaseClient.auth.getUser();
  const stored=sessionStorage.getItem(ADMIN_SESSION_KEY)||localStorage.getItem(ADMIN_SESSION_KEY);
  if(!user || (stored && stored!==user.id)){ location.replace("admin.html"); return false; }
  const {data:profile}=await supabaseClient.from("customers").select("is_admin,blocked").eq("id",user.id).maybeSingle();
  if(!isAdminEmail(user.email) && !(profile?.is_admin===true && profile?.blocked!==true)){ await supabaseClient.auth.signOut(); location.replace("admin.html"); return false; }
  sessionStorage.setItem(ADMIN_SESSION_KEY,user.id); localStorage.setItem(ADMIN_SESSION_KEY,user.id);
  currentAdmin=user;
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
    supabaseClient.from("orders").select("order_number").eq("status","출고완료"),
    supabaseClient.from("customers").select("id",{count:"exact",head:true}).eq("is_admin",false),
    supabaseClient.from("customers").select("id",{count:"exact",head:true}).eq("approved",false).eq("blocked",false),
    supabaseClient.from("product_groups").select("id,sold_out")
  ]);
  setText("todayOrderCount",uniqueOrders(todayOrders.data));
  setText("pendingOrderCount",uniqueOrders(pending.data));
  setText("todayDoneCount",uniqueOrders(doneToday.data));
  setText("customerCount",customers.count ?? 0);
  setText("waitingCustomerCount",waiting.count ?? 0);
  setText("soldoutCount",(products.data||[]).filter(p=>p.sold_out===true).length);
  setText("dashboardUpdatedAt",`${new Date().toLocaleString("ko-KR")} 기준`);
  await loadNotifications();
}

async function loadNotifications(){
  const box=document.getElementById("dashboardNotificationList");
  const {data,error}=await supabaseClient.from("app_notifications").select("id,title,message,is_read,created_at,link_url").eq("recipient_id",currentAdmin.id).order("created_at",{ascending:false}).limit(8);
  if(error){ box.innerHTML='<p class="empty-copy">알림 테이블 설치 후 표시됩니다.</p>'; return; }
  if(!data?.length){ box.innerHTML='<p class="empty-copy">새 알림이 없습니다.</p>'; return; }
  box.innerHTML=data.map(n=>`<button class="v3-notification-item ${n.is_read?'':'unread'}" data-id="${n.id}" data-link="${esc(n.link_url||'')}"><span>${n.is_read?'':'● '}${esc(n.title)}</span><small>${esc(n.message||'')} · ${new Date(n.created_at).toLocaleString('ko-KR')}</small></button>`).join('');
  box.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',async()=>{ await supabaseClient.from('app_notifications').update({is_read:true}).eq('id',btn.dataset.id); if(btn.dataset.link) location.href=btn.dataset.link; else loadNotifications(); }));
}

async function markAllRead(){ if(!currentAdmin)return; await supabaseClient.from('app_notifications').update({is_read:true}).eq('recipient_id',currentAdmin.id).eq('is_read',false); loadNotifications(); }

document.addEventListener('DOMContentLoaded',async()=>{
  if(!(await guardAdminHome()))return;
  document.querySelectorAll('[data-link]').forEach(el=>el.addEventListener('click',()=>location.href=el.dataset.link));
  document.getElementById('refreshDashboardBtn')?.addEventListener('click',loadDashboard);
  document.getElementById('markAllReadBtn')?.addEventListener('click',markAllRead);
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
