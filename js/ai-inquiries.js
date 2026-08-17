const supabaseClient=window.supabase.createClient('https://dtjhuejmxrjkcxzvilgw.supabase.co','sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87');
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function withTimeout(promise,ms=12000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('조회 시간이 초과되었습니다. 새로고침 후 다시 시도해주세요.')),ms)})]);}finally{clearTimeout(timer)}}

async function saveAnswer(id,answer,button){
  if(!answer)return alert('답변을 입력하세요.');
  button.disabled=true;
  try{
    const result=await withTimeout(supabaseClient.rpc('admin_answer_ai_inquiry',{p_id:Number(id),p_answer:answer}));
    if(result.error)throw result.error;
    await load();
  }catch(error){button.disabled=false;alert('답변 저장 실패: '+(error.message||error))}
}

async function forceComplete(id,button){
  if(!confirm('이 문의를 거래처 알림이나 답변 없이 관리자 내부에서만 완료 처리할까요?'))return;
  button.disabled=true;
  try{
    const result=await withTimeout(supabaseClient.rpc('admin_force_complete_ai_inquiry',{p_id:Number(id)}));
    if(result.error)throw result.error;
    await load();
  }catch(error){button.disabled=false;alert('강제 완료 처리 실패: V6.6.4 문의 SQL을 다시 실행해주세요.\n'+(error.message||error))}
}

function renderRows(data){
  const list=$('aiInquiryList');
  list.innerHTML=data?.length?data.map(x=>`<article class="product-card ai-inquiry-card"><header><div><b>${esc(x.customer_name||'거래처')}</b><small>${new Date(x.created_at).toLocaleString('ko-KR')}</small></div><span>${x.admin_force_completed?'관리자 내부완료':esc(x.status)}</span></header><h3>Q. ${esc(x.question)}</h3>${x.admin_answer?`<p class="ai-existing-answer">A. ${esc(x.admin_answer)}<br><small>${esc(x.answered_by_name||'관리자')} · ${x.answered_at?new Date(x.answered_at).toLocaleString('ko-KR'):''}</small></p>`:''}${x.admin_force_completed?`<p class="ai-force-completed">거래처 알림 없이 ${esc(x.answered_by_name||'관리자')}가 내부 완료 처리했습니다.</p>`:`<textarea rows="3" placeholder="거래처에 보낼 답변을 입력하세요">${esc(x.admin_answer||'')}</textarea><div class="ai-inquiry-actions"><button class="cart-btn" data-answer="${x.id}">답변 저장</button><button class="cart-btn gray-btn" data-force-complete="${x.id}">강제 완료 처리</button></div>`}</article>`).join(''):'<div class="product-card"><p>문의가 없습니다.</p></div>';
  list.querySelectorAll('[data-answer]').forEach(button=>button.onclick=()=>saveAnswer(button.dataset.answer,button.closest('article').querySelector('textarea').value.trim(),button));
  list.querySelectorAll('[data-force-complete]').forEach(button=>button.onclick=()=>forceComplete(button.dataset.forceComplete,button));
}

async function queryInquiries(status){
  const rpcResult=await withTimeout(supabaseClient.rpc('admin_list_ai_inquiries',{p_status:status}));
  if(!rpcResult.error)return rpcResult;
  const missingRpc=['PGRST202','42883'].includes(String(rpcResult.error.code||''))||/admin_list_ai_inquiries|function.*does not exist/i.test(String(rpcResult.error.message||''));
  if(!missingRpc)return rpcResult;
  let query=supabaseClient.from('customer_ai_inquiries').select('*').order('created_at',{ascending:false}).limit(200);
  if(status&&status!=='all')query=query.eq('status',status);
  return withTimeout(query);
}

async function load(){
  const list=$('aiInquiryList');
  list.innerHTML='<div class="product-card"><p>문의를 불러오는 중입니다.</p></div>';
  try{
    const userResult=await withTimeout(supabaseClient.auth.getUser()),user=userResult.data?.user;
    if(!user)throw new Error('관리자 로그인이 필요합니다.');
    const profileResult=await withTimeout(supabaseClient.from('customers').select('is_admin,blocked,admin_role').eq('id',user.id).maybeSingle());
    if(profileResult.error)throw profileResult.error;
    const profile=profileResult.data;
    if(!profile?.is_admin||profile.blocked)throw new Error('관리자 권한이 없습니다.');
    if(['manager','employee'].includes(profile.admin_role))throw new Error('매니저는 거래처 문의를 조회할 수 없습니다.');
    document.body.classList.add('auth-ready');
    const result=await queryInquiries($('aiInquiryFilter').value);
    if(result.error)throw result.error;
    renderRows(result.data||[]);
  }catch(error){
    document.body.classList.add('auth-ready');
    list.innerHTML=`<div class="product-card"><p class="error-copy">문의 조회 실패: ${esc(error.message||'알 수 없는 오류')}</p><button type="button" class="cart-btn" id="retryAiInquiry">다시 불러오기</button><p>계속 실패하면 Supabase에서 V6.6.4 문의 SQL을 다시 실행해주세요.</p></div>`;
    $('retryAiInquiry').onclick=load;
  }
}
function init(){$('aiInquiryFilter').onchange=load;$('aiInquiryRefresh').onclick=load;load()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
