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
  currentAdmin=user; document.body.classList.add("auth-ready"); return true;
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

function runAdminGlobalSearch(){const q=document.getElementById('adminGlobalSearch')?.value.trim();if(!q)return;location.href=`admin.html?view=orders&search=${encodeURIComponent(q)}`;}
document.getElementById('adminGlobalSearchBtn')?.addEventListener('click',runAdminGlobalSearch);document.getElementById('adminGlobalSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter')runAdminGlobalSearch();});
function syncAdminThemeButton(){const b=document.getElementById('adminThemeToggle');if(!b)return;const dark=document.documentElement.dataset.theme==='dark';b.textContent=dark?'☀️ 라이트':'🌙 다크';}
document.getElementById('adminThemeToggle')?.addEventListener('click',()=>{DesignJamPreferences.setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');syncAdminThemeButton();});syncAdminThemeButton();
