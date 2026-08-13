(function(){
'use strict';
const URL='https://dtjhuejmxrjkcxzvilgw.supabase.co',KEY='sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let client=null,loading=false,lastLoadedAt=0;
async function start(force=false){
 if(loading||!window.supabase||document.body?.dataset?.sessionPage!=='customer'||document.getElementById('emergencyNoticeModal'))return;
 if(!force&&Date.now()-lastLoadedAt<1500)return;
 loading=true;
 try{
  client=client||window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
  const {data:{session}}=await client.auth.getSession();if(!session?.user)return;
  const {data,error}=await client.rpc('get_today_emergency_notices');
  if(error){console.warn('팝업공지 확인 실패:',error.message);return}
  lastLoadedAt=Date.now();const queue=[...(data||[])];if(queue.length)show(queue);
 }catch(error){console.warn('팝업공지를 불러오지 못했지만 주문 기능은 계속 사용할 수 있습니다.',error)}
 finally{loading=false}
}
function show(queue){
 const n=queue[0];if(!n||document.getElementById('emergencyNoticeModal'))return;
 const urgent=n.notice_type==='긴급공지',modal=document.createElement('div');
 modal.id='emergencyNoticeModal';modal.className=`emergency-notice-modal${urgent?' urgent':''}`;modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
 modal.innerHTML=`<section class="emergency-notice-card"><div class="emergency-notice-badge">${urgent?'🚨':'📢'} ${esc(n.notice_type||'공지')}</div><h2>${esc(n.title)}</h2><div class="emergency-notice-period">${n.start_at?new Date(n.start_at).toLocaleDateString('ko-KR'):''}${n.end_at?` ~ ${new Date(n.end_at).toLocaleDateString('ko-KR')}`:''}</div>${n.image_url?`<img src="${esc(n.image_url)}" alt="공지 이미지">`:''}<div class="emergency-notice-content">${esc(n.content).replace(/\n/g,'<br>')}</div>${n.link_url?`<a href="${esc(n.link_url)}" target="_blank" rel="noopener">자세히 보기</a>`:''}<p class="emergency-notice-help">그냥 닫으면 다른 화면으로 이동하거나 다시 접속할 때 계속 표시됩니다.</p><label class="emergency-notice-today"><input type="checkbox"> 오늘은 이 팝업 보지 않기</label><button type="button">닫기</button><p class="emergency-notice-error" hidden></p></section>`;
 document.body.appendChild(modal);
 const button=modal.querySelector('button'),checkbox=modal.querySelector('.emergency-notice-today input'),errorBox=modal.querySelector('.emergency-notice-error');button.focus();
 const image=modal.querySelector('.emergency-notice-card img');
 if(image){image.tabIndex=0;image.setAttribute('role','button');image.setAttribute('aria-label','공지 이미지 크게 보기');image.insertAdjacentHTML('afterend','<p class="emergency-notice-image-help">이미지를 누르면 글자를 크게 볼 수 있습니다.</p>');const toggleZoom=()=>{image.classList.toggle('zoomed');image.setAttribute('aria-label',image.classList.contains('zoomed')?'확대 이미지 닫기':'공지 이미지 크게 보기')};image.onclick=toggleZoom;image.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleZoom()}}}
 button.onclick=async()=>{
  if(!checkbox.checked){modal.remove();return}
  button.disabled=true;button.textContent='오늘 숨김 저장 중…';
  const result=await client.rpc('confirm_today_emergency_notice',{p_announcement_id:String(n.announcement_id)});
  if(result.error){button.disabled=false;button.textContent='닫기';errorBox.hidden=false;errorBox.textContent='오늘 숨김 저장 실패: '+result.error.message;return}
  modal.remove();queue.shift();if(queue.length)show(queue);
 };
 modal.onclick=e=>{if(e.target===modal)button.focus()};
}
function boot(){start();setTimeout(()=>start(true),1200)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.addEventListener('pageshow',()=>start(true));
})();
