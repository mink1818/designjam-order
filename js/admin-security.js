(function(){
'use strict';
const MANAGER_ALLOWED=new Set(['admin-home.html','admin.html','picking.html','proxy-order.html','scanner.html','products.html']);
const EMPLOYEE_ALLOWED=new Set(['admin-home.html','picking.html','proxy-order.html','scanner.html']);let profile=null;
async function loadRole(){if(profile)return profile;const {data:sessionData}=await supabaseClient.auth.getSession();const user=sessionData?.session?.user||null;if(!user)return null;const {data,error}=await supabaseClient.from('customers').select('id,email,is_admin,blocked,admin_role').eq('id',user.id).maybeSingle();if(error){console.warn('관리자 권한 확인 오류:',error);return undefined;}profile=data||null;return profile;}
function managerTarget(element){const raw=element.getAttribute('href')||element.dataset?.link||element.getAttribute('onclick')||'';const match=raw.match(/([a-z0-9-]+\.html)/i);return match?.[1]||''}
function hideRestrictedMenus(allowed){document.querySelectorAll('a,button,[data-link]').forEach(element=>{const target=managerTarget(element);if(target&&!allowed.has(target)){element.hidden=true;element.classList.add('manager-restricted-menu');element.style.setProperty('display','none','important')}});document.querySelectorAll('.global-admin-search,.v3-metric-grid,.v3-dashboard-section:last-of-type,.unpaid-customer-panel').forEach(element=>{element.hidden=true;element.style.setProperty('display','none','important')})}
function applyManagerBarcodeOnly(page){
  if(page==='admin-home.html'){
    const productButton=[...document.querySelectorAll('.v3-menu-card')].find(el=>managerTarget(el)==='products.html');
    if(productButton){const b=productButton.querySelector('b'),span=productButton.querySelector('span');if(b)b.textContent='🖨 바코드관리';if(span)span.textContent='상품 품번 바코드 조회·라벨 출력';}
  }
  if(page==='products.html'){
    document.documentElement.classList.add('manager-barcode-only');
    const keep=document.getElementById('barcodeManagement');
    document.querySelectorAll('main.products-admin-page > *').forEach(el=>{if(el!==keep){el.hidden=true;el.style.setProperty('display','none','important')}});
    if(keep){keep.hidden=false;keep.style.removeProperty('display');setTimeout(()=>keep.scrollIntoView({block:'start'}),0);}
  }
}
function hideManagerUnauthorizedMenus(){hideRestrictedMenus(MANAGER_ALLOWED)}
async function enforce(){const page=location.pathname.split('/').pop()||'admin.html';if(document.body?.dataset?.sessionPage==='customer')return;const p=await loadRole();if(p===undefined)return;if(!p){if(page!=='admin.html')location.replace('admin.html');return}if(!p.is_admin||p.blocked){location.replace('admin.html');return}document.documentElement.dataset.adminRole=p.admin_role||'admin';if(p.admin_role==='manager'){hideManagerUnauthorizedMenus();applyManagerBarcodeOnly(page);setTimeout(()=>{hideManagerUnauthorizedMenus();applyManagerBarcodeOnly(page)},100);if(!MANAGER_ALLOWED.has(page)){alert('매니저 계정은 허용된 업무 화면만 사용할 수 있습니다.');location.replace('admin-home.html');return}}else if(p.admin_role==='employee'){hideRestrictedMenus(EMPLOYEE_ALLOWED);setTimeout(()=>hideRestrictedMenus(EMPLOYEE_ALLOWED),100);if(!EMPLOYEE_ALLOWED.has(page)){alert('직원 계정은 허용된 작업 화면만 사용할 수 있습니다.');location.replace('picking.html');return}}else if(page!=='ai-inquiries.html'&&!document.querySelector('script[data-ai-inquiry-alert]')){const script=document.createElement('script');script.src='js/admin-ai-inquiry-alert.js?v=66040';script.dataset.aiInquiryAlert='1';document.body.appendChild(script)}}
async function requireSecurity(level='password'){
  const p=await loadRole();
  if(!p)throw new Error('로그인이 필요합니다.');
  if(['employee','manager'].includes(p.admin_role))throw new Error('매니저 계정은 이 작업을 수행할 수 없습니다.');
  const password=prompt('보안을 위해 현재 비밀번호를 입력하세요.');
  if(!password)throw new Error('본인 확인이 취소되었습니다.');
  const {error}=await supabaseClient.auth.signInWithPassword({email:p.email,password});
  if(error)throw new Error('비밀번호가 맞지 않습니다.');
  const passwordGrant=await supabaseClient.rpc('mark_admin_password_verified');
  if(passwordGrant.error)throw new Error('비밀번호 인증기록 저장 실패: '+passwordGrant.error.message);

  if(level==='email'){
    if(p.admin_role!=='developer_admin')throw new Error('최고 보안 작업은 개발관리자만 가능합니다.');
    // signInWithOtp는 프로젝트 메일 템플릿에 따라 로그인 링크를 보내므로
    // 화면에서 기다리는 인증번호 입력 방식과 맞지 않습니다. 재인증 전용 nonce를 사용합니다.
    const sent=await supabaseClient.auth.reauthenticate();
    if(sent.error)throw new Error('인증번호 메일 발송 실패: '+sent.error.message);
    const nonce=prompt('메일로 받은 8자리 인증번호를 입력하세요.\n\n링크를 누르는 방식이 아니라 메일 본문의 인증번호를 입력하면 됩니다.');
    if(!nonce)throw new Error('메일 인증이 취소되었습니다.');
    if(!/^\d{8}$/.test(String(nonce).trim()))throw new Error('메일에 표시된 8자리 인증번호를 정확히 입력하세요.');
    const {data:{user}}=await supabaseClient.auth.getUser();
    const verified=await supabaseClient.auth.updateUser({
      nonce:String(nonce).trim(),
      data:{...(user?.user_metadata||{}),admin_reauthenticated_at:new Date().toISOString()}
    });
    if(verified.error)throw new Error('메일 인증번호가 맞지 않거나 만료되었습니다. 새 인증번호로 다시 시도하세요.');
    const emailGrant=await supabaseClient.rpc('mark_admin_email_verified');
    if(emailGrant.error)throw new Error('메일 인증기록 저장 실패: '+emailGrant.error.message);
  }
  return true;
}
window.requireAdminSecurity=requireSecurity;document.addEventListener('DOMContentLoaded',enforce);
})();
