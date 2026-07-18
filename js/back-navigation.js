(() => {
  'use strict';
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (!isStandalone) return;
  const role = document.body?.dataset?.sessionPage || '';
  const home = role === 'admin' ? 'admin-home.html' : role === 'customer' ? 'index.html' : '';
  if (!home) return;
  const current = location.pathname.split('/').pop() || 'index.html';
  history.replaceState({designjamGuard:true}, '', location.href);
  history.pushState({designjamGuard:true}, '', location.href);
  let toastTimer;
  function showToast(message){
    let el=document.getElementById('designjamBackToast');
    if(!el){el=document.createElement('div');el.id='designjamBackToast';Object.assign(el.style,{position:'fixed',left:'50%',bottom:'74px',transform:'translateX(-50%)',zIndex:'2147483647',padding:'10px 14px',borderRadius:'999px',background:'rgba(17,36,55,.88)',color:'#fff',fontSize:'13px',fontWeight:'700',boxShadow:'0 6px 20px rgba(0,0,0,.22)',whiteSpace:'nowrap'});document.body.appendChild(el);}
    el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;},1800);
  }
  addEventListener('popstate', () => {
    const now = location.pathname.split('/').pop() || 'index.html';
    if(now !== home && current !== home){ location.replace(home); return; }
    history.pushState({designjamGuard:true}, '', location.href);
    showToast(role==='admin'?'관리자 앱은 상단 로그아웃 버튼으로 종료하세요.':'거래처 앱은 상단 로그아웃 버튼으로 종료하세요.');
  });
})();
