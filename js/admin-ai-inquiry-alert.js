(()=>{
  'use strict';
  if(window.__adminAiInquiryAlertLoaded)return;
  window.__adminAiInquiryAlertLoaded=true;
  const client=typeof supabaseClient!=='undefined'?supabaseClient:window.supabaseClient;
  if(!client)return;
  const SEEN_KEY='designjam_ai_inquiry_popup_seen_v2';
  let latestSeen=Number(localStorage.getItem(SEEN_KEY)||0),timer=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function remember(rows){latestSeen=Math.max(latestSeen,...rows.map(x=>Number(x.id||0)));localStorage.setItem(SEEN_KEY,String(latestSeen))}
  function close(){document.getElementById('adminAiInquiryPopup')?.remove()}
  function show(rows){
    if(!rows.length||document.getElementById('adminAiInquiryPopup'))return;
    remember(rows);
    document.body.insertAdjacentHTML('beforeend',`<div id="adminAiInquiryPopup" class="admin-ai-inquiry-popup"><section><header><div><strong>💬 새 거래처 문의 ${rows.length}건</strong><small>닫으면 같은 문의는 다시 팝업으로 표시하지 않습니다.</small></div><button type="button" data-close>×</button></header><div>${rows.slice(0,5).map(x=>`<article><b>${esc(x.customer_name||'거래처')}</b><p>${esc(x.question)}</p><small>${new Date(x.created_at).toLocaleString('ko-KR')}</small></article>`).join('')}</div><footer><button type="button" data-close>닫기</button><button type="button" data-open>문의관리 열기</button></footer></section></div>`);
    const popup=document.getElementById('adminAiInquiryPopup');
    popup.querySelectorAll('[data-close]').forEach(button=>button.onclick=close);
    popup.querySelector('[data-open]').onclick=()=>location.href='ai-inquiries.html?v=66048';
  }
  async function check(){const {data,error}=await client.from('customer_ai_inquiries').select('id,customer_name,question,created_at').eq('status','대기').gt('id',latestSeen).order('id',{ascending:true}).limit(20);if(!error&&data?.length)show(data)}
  async function start(){
    const {data:{user}}=await client.auth.getUser();if(!user)return;
    const {data:profile}=await client.from('customers').select('is_admin,blocked,admin_role').eq('id',user.id).maybeSingle();
    if(!profile?.is_admin||profile.blocked||['manager','employee'].includes(profile.admin_role))return;
    await check();timer=setInterval(check,20000);
    try{client.channel('admin-ai-inquiry-alert-v2').on('postgres_changes',{event:'INSERT',schema:'public',table:'customer_ai_inquiries'},payload=>{const row=payload.new;if(Number(row.id)>latestSeen&&row.status==='대기')show([row])}).subscribe()}catch(_){ }
  }
  start();window.addEventListener('beforeunload',()=>timer&&clearInterval(timer));
})();
