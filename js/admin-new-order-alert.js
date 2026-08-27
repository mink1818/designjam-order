(() => {
  "use strict";
  if (window.__designSocksNewOrderAlertStarted) return;
  window.__designSocksNewOrderAlertStarted=true;
  let client=null, channel=null, rows=[];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function ensureUI(){
    if(document.getElementById('adminNewOrderAlert'))return;
    const style=document.createElement('style');style.textContent=`
      .admin-new-order-alert{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.36);display:grid;place-items:center;padding:16px}
      .admin-new-order-alert[hidden]{display:none}.admin-new-order-box{width:min(430px,calc(100vw - 28px));background:#fff;color:#172033;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.28);padding:20px}
      .admin-new-order-box h3{margin:0 0 8px;font-size:21px}.admin-new-order-box p{margin:5px 0;font-size:15px;line-height:1.5}.admin-new-order-list{max-height:210px;overflow:auto;margin:12px 0;padding:0;list-style:none}
      .admin-new-order-list li{padding:9px 10px;background:#f4f7fb;border-radius:10px;margin:6px 0;font-size:14px}.admin-new-order-actions{display:flex;gap:8px}.admin-new-order-actions button{flex:1;border:0;border-radius:10px;padding:11px 10px;font-weight:900;font-size:14px;cursor:pointer}
      .admin-new-order-open{background:#e7eef8;color:#173d73}.admin-new-order-ok{background:#173d73;color:#fff}@media(max-width:600px){.admin-new-order-box{padding:16px}.admin-new-order-box h3{font-size:19px}.admin-new-order-box p,.admin-new-order-list li{font-size:14px}}
      html[data-theme=dark] .admin-new-order-box{background:#172234;color:#eef5ff}.admin-new-order-list li{color:#172033}`;document.head.appendChild(style);
    const el=document.createElement('div');el.id='adminNewOrderAlert';el.className='admin-new-order-alert';el.hidden=true;el.innerHTML=`<section class="admin-new-order-box"><h3>🔔 신규 주문</h3><p id="adminNewOrderSummary"></p><ul id="adminNewOrderList" class="admin-new-order-list"></ul><div class="admin-new-order-actions"><button class="admin-new-order-open" type="button">주문관리 보기</button><button class="admin-new-order-ok" type="button">확인</button></div></section>`;document.body.appendChild(el);
    el.querySelector('.admin-new-order-ok').onclick=ackAll; el.querySelector('.admin-new-order-open').onclick=()=>location.href='admin.html?view=orders&status=주문접수';
  }
  function render(){ensureUI();const el=document.getElementById('adminNewOrderAlert');if(!rows.length){el.hidden=true;return}el.hidden=false;document.getElementById('adminNewOrderSummary').textContent=rows.length===1?'새 주문이 접수되었습니다.':`새 주문 ${rows.length}건이 접수되었습니다.`;document.getElementById('adminNewOrderList').innerHTML=rows.slice(0,8).map(r=>`<li><b>${esc(r.customer_name||'거래처')}</b> · ${esc(r.order_number||'주문번호 없음')}<br><small>${new Date(r.created_at).toLocaleString('ko-KR')}</small></li>`).join('')+(rows.length>8?`<li>외 ${rows.length-8}건</li>`:'');}
  async function load(){if(!client)return;const {data,error}=await client.from('admin_new_order_alerts').select('order_number,customer_name,created_at').is('acknowledged_at',null).order('created_at',{ascending:true}).limit(50);if(error){console.warn('신규주문 알림 조회 생략:',error.message);return}rows=data||[];render();}
  async function ackAll(){if(!client||!rows.length)return;const nums=rows.map(r=>r.order_number);const profile=(()=>{try{return JSON.parse(sessionStorage.getItem('designjam_admin_profile')||localStorage.getItem('designjam_admin_profile')||'{}')}catch(_){return{}}})();const {data:{user}}=await client.auth.getUser();const {error}=await client.from('admin_new_order_alerts').update({acknowledged_at:new Date().toISOString(),acknowledged_by:user?.id||null,acknowledged_by_name:profile.name||user?.email||'관리자'}).in('order_number',nums).is('acknowledged_at',null);if(error){alert('신규 주문 확인 처리 실패: '+error.message);return}rows=[];render();}
  async function start(){
    client=window.supabaseClient||window.supabase?.createClient?.('https://dtjhuejmxrjkcxzvilgw.supabase.co','sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    if(!client)return; const {data:{user}}=await client.auth.getUser(); if(!user)return;
    const {data:p}=await client.from('customers').select('is_admin,blocked').eq('id',user.id).maybeSingle(); if(!p?.is_admin||p?.blocked)return;
    await load();
    channel=client.channel('admin-new-order-alerts-v66663').on('postgres_changes',{event:'*',schema:'public',table:'admin_new_order_alerts'},()=>load()).subscribe();
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,0));else setTimeout(start,0);
})();
