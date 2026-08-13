(function(){
'use strict';
const URL='https://dtjhuejmxrjkcxzvilgw.supabase.co',KEY='sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function start(){
 if(!window.supabase||document.body?.dataset?.sessionPage!=='customer')return;
 try{
  const client=window.supabase.createClient(URL,KEY),{data:{session}}=await client.auth.getSession();if(!session?.user)return;
  const {data,error}=await client.rpc('get_today_emergency_notices');
  if(error){console.warn('팝업공지 확인 실패:',error.message);return}
  const queue=[...(data||[])];if(queue.length)show(queue,client);
 }catch(error){console.warn('팝업공지를 불러오지 못했지만 주문 기능은 계속 사용할 수 있습니다.',error)}
}
function show(queue,client){
 const n=queue[0];if(!n)return;const urgent=n.notice_type==='긴급공지';
 const modal=document.createElement('div');modal.id='emergencyNoticeModal';modal.className=`emergency-notice-modal${urgent?' urgent':''}`;modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
 modal.innerHTML=`<section class="emergency-notice-card"><div class="emergency-notice-badge">${urgent?'🚨':'📢'} ${esc(n.notice_type||'공지')}</div><h2>${esc(n.title)}</h2><div class="emergency-notice-period">${n.start_at?new Date(n.start_at).toLocaleDateString('ko-KR'):''}${n.end_at?` ~ ${new Date(n.end_at).toLocaleDateString('ko-KR')}`:''}</div>${n.image_url?`<img src="${esc(n.image_url)}" alt="공지 이미지">`:''}<div class="emergency-notice-content">${esc(n.content).replace(/\n/g,'<br>')}</div>${n.link_url?`<a href="${esc(n.link_url)}" target="_blank" rel="noopener">자세히 보기</a>`:''}<p class="emergency-notice-help">오늘 확인하면 오늘은 사라지고, 게시기간 중 다음 날 다시 표시됩니다.</p><button type="button">오늘 내용 확인 완료</button><p class="emergency-notice-error" hidden></p></section>`;
 document.body.appendChild(modal);const button=modal.querySelector('button'),errorBox=modal.querySelector('.emergency-notice-error');button.focus();
 button.onclick=async()=>{button.disabled=true;button.textContent='확인 저장 중…';const result=await client.rpc('confirm_today_emergency_notice',{p_announcement_id:String(n.announcement_id)});if(result.error){button.disabled=false;button.textContent='오늘 내용 확인 완료';errorBox.hidden=false;errorBox.textContent='확인 저장 실패: '+result.error.message;return}modal.remove();queue.shift();if(queue.length)show(queue,client)};
 modal.onclick=e=>{if(e.target===modal)button.focus()};document.addEventListener('keydown',e=>{if(document.getElementById('emergencyNoticeModal')&&e.key==='Escape'){e.preventDefault();button.focus()}},true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
