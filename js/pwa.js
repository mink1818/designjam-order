(function(){
  'use strict';
  const app=document.body?.dataset?.pwaApp||'customer';
  const name=app==='admin'?'디자인 삭스 관리자':'디자인 삭스';
  const icon=app==='admin'?'/icons/admin-v3-192.png?v=352':'/icons/customer-v3-192.png?v=352';
  let deferredPrompt=null;

  function isStandalone(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true}
  function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent)}
  function isAndroid(){return /android/i.test(navigator.userAgent)}
  function isKakao(){return /KAKAOTALK/i.test(navigator.userAgent)}
  function isSamsung(){return /SamsungBrowser/i.test(navigator.userAgent)}
  function isChrome(){return /Chrome/i.test(navigator.userAgent)&&!/SamsungBrowser|EdgA|OPR/i.test(navigator.userAgent)}

  function injectStyles(){
    if(document.getElementById('designSocksPwaStyles'))return;
    const s=document.createElement('style');
    s.id='designSocksPwaStyles';
    s.textContent=`
      #dsPwaInstall{position:fixed;left:12px;bottom:12px;z-index:2147483000;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 24px);padding:10px 12px;border:1px solid #d7e0eb;border-radius:16px;background:#fff;color:#102b52;box-shadow:0 12px 35px rgba(0,0,0,.2);font-family:Arial,sans-serif}#dsPwaInstall[hidden]{display:none!important}#dsPwaInstall img{width:42px;height:42px;border-radius:10px}#dsPwaInstall .ds-copy{min-width:0;flex:1}#dsPwaInstall strong{display:block;font-size:13px}#dsPwaInstall small{display:block;color:#607086;font-size:11px;margin-top:2px}#dsPwaInstall button{border:0;border-radius:9px;padding:8px 10px;font-weight:800;cursor:pointer}#dsPwaInstall .install{background:#24589f;color:#fff}#dsPwaInstall .close{background:#eef2f7;color:#55606d}
      #dsSplash{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:${app==='admin'?'#112437':'#fff'};transition:opacity .3s ease}#dsSplash.hide{opacity:0;pointer-events:none}#dsSplash .inner{text-align:center;color:${app==='admin'?'#fff':'#102b52'};font-family:Arial,sans-serif}#dsSplash img{width:118px;height:118px;border-radius:26px;box-shadow:0 14px 35px rgba(0,0,0,.15)}#dsSplash h1{margin:18px 0 5px;font-size:27px}#dsSplash p{margin:0;opacity:.75;font-weight:700}
      #dsInstallGuide{position:fixed;inset:0;z-index:2147483647;background:rgba(3,12,25,.72);display:grid;place-items:center;padding:18px;font-family:Arial,sans-serif}#dsInstallGuide[hidden]{display:none!important}.ds-guide-card{width:min(520px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:22px;box-shadow:0 24px 70px rgba(0,0,0,.35);color:#17243a}.ds-guide-head{display:flex;align-items:center;gap:12px;padding:18px;border-bottom:1px solid #e7ebf0}.ds-guide-head img{width:54px;height:54px;border-radius:13px}.ds-guide-head h2{margin:0;font-size:20px}.ds-guide-head p{margin:3px 0 0;color:#657188;font-size:13px}.ds-guide-close{margin-left:auto;border:0;background:#eef2f7;border-radius:50%;width:36px;height:36px;font-size:22px;cursor:pointer}.ds-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:14px 18px 0}.ds-tabs button{border:1px solid #dbe3ee;background:#f6f8fb;padding:11px;border-radius:11px;font-weight:800}.ds-tabs button.active{background:#24589f;color:white;border-color:#24589f}.ds-guide-body{padding:18px}.ds-device-guide{display:none}.ds-device-guide.active{display:block}.ds-warning{background:#fff6dd;border:1px solid #f1cf68;border-radius:12px;padding:12px;margin-bottom:14px;font-size:13px;line-height:1.55}.ds-step{display:grid;grid-template-columns:34px 1fr;gap:10px;margin:12px 0;align-items:start}.ds-step-num{width:30px;height:30px;border-radius:50%;background:#24589f;color:#fff;display:grid;place-items:center;font-weight:900}.ds-step b{display:block;margin-bottom:3px}.ds-step p{margin:0;color:#536176;font-size:14px;line-height:1.55}.ds-guide-actions{padding:0 18px 18px;display:grid;gap:9px}.ds-guide-actions button{border:0;border-radius:12px;padding:13px;font-weight:900;cursor:pointer}.ds-guide-primary{background:#24589f;color:#fff}.ds-guide-secondary{background:#edf2f8;color:#27364d}.ds-mini-note{font-size:12px;color:#6d788a;text-align:center;line-height:1.45;margin-top:8px}
      @media(max-width:520px){#dsPwaInstall{right:8px;left:8px;bottom:8px}.ds-guide-card{max-height:92vh}.ds-guide-head{padding:15px}.ds-guide-body{padding:15px}.ds-tabs{padding:12px 15px 0}.ds-guide-actions{padding:0 15px 15px}}
    `;
    document.head.appendChild(s);
  }

  function showSplash(){
    if(!isStandalone()||sessionStorage.getItem('ds_splash_seen_'+app))return;
    sessionStorage.setItem('ds_splash_seen_'+app,'1');
    const el=document.createElement('div');
    el.id='dsSplash';
    el.innerHTML=`<div class="inner"><img src="${icon}" alt=""><h1>${name}</h1><p>주문관리</p></div>`;
    document.body.appendChild(el);
    setTimeout(()=>{el.classList.add('hide');setTimeout(()=>el.remove(),350)},1050);
  }

  function ensureGuide(){
    let el=document.getElementById('dsInstallGuide');
    if(el)return el;
    el=document.createElement('section');
    el.id='dsInstallGuide';
    el.hidden=true;
    el.innerHTML=`
      <div class="ds-guide-card" role="dialog" aria-modal="true" aria-label="홈 화면 설치 안내">
        <div class="ds-guide-head">
          <img src="${icon}" alt="">
          <div><h2>${name} 홈 화면 추가</h2><p>앱처럼 아이콘을 눌러 바로 실행할 수 있습니다.</p></div>
          <button class="ds-guide-close" type="button" aria-label="닫기">×</button>
        </div>
        <div class="ds-tabs"><button type="button" data-tab="android">안드로이드</button><button type="button" data-tab="ios">아이폰</button></div>
        <div class="ds-guide-body">
          <div class="ds-device-guide" data-guide="android">
            ${isKakao()?'<div class="ds-warning"><b>현재 카카오톡 안에서 열려 있습니다.</b><br>카카오톡 안에서는 바로 설치되지 않습니다. 먼저 외부 브라우저로 열어주세요.</div>':''}
            <div class="ds-step"><span class="ds-step-num">1</span><div><b>카카오톡 메뉴 열기</b><p>화면 오른쪽 아래의 <b>⋮ 메뉴</b> 또는 위쪽의 <b>▼ 버튼</b>을 누르세요.</p></div></div>
            <div class="ds-step"><span class="ds-step-num">2</span><div><b>다른 브라우저로 열기</b><p><b>다른 브라우저로 열기</b>를 선택한 뒤 Chrome 또는 Samsung Internet으로 여세요.</p></div></div>
            <div class="ds-step"><span class="ds-step-num">3</span><div><b>홈 화면에 추가</b><p>Chrome: 오른쪽 위 <b>⋮ → 앱 설치/홈 화면에 추가</b><br>Samsung Internet: 오른쪽 아래 <b>☰ → 현재 페이지 추가 → 홈 화면</b></p></div></div>
            <div class="ds-step"><span class="ds-step-num">4</span><div><b>추가 확인</b><p>이름이 <b>${name}</b>인지 확인한 뒤 <b>추가</b>를 누르세요.</p></div></div>
            <div class="ds-warning"><b>Google Play 프로텍트 경고가 보이면</b><br>설치를 계속하지 말고 취소한 뒤, 브라우저 메뉴의 <b>홈 화면에 추가</b> 방식으로 등록하세요. 이 프로그램은 별도 APK 설치가 필요 없는 웹앱입니다.</div>
          </div>
          <div class="ds-device-guide" data-guide="ios">
            ${isKakao()?'<div class="ds-warning"><b>현재 카카오톡 안에서 열려 있습니다.</b><br>먼저 카카오톡 메뉴에서 <b>Safari로 열기</b>를 선택하세요.</div>':''}
            <div class="ds-step"><span class="ds-step-num">1</span><div><b>Safari로 열기</b><p>카카오톡의 <b>⋯ 메뉴 → Safari로 열기</b>를 누르세요.</p></div></div>
            <div class="ds-step"><span class="ds-step-num">2</span><div><b>공유 버튼 누르기</b><p>Safari 아래쪽의 <b>□↑ 공유 버튼</b>을 누르세요.</p></div></div>
            <div class="ds-step"><span class="ds-step-num">3</span><div><b>홈 화면에 추가 선택</b><p>메뉴를 아래로 내려 <b>홈 화면에 추가</b>를 누르세요.</p></div></div>
            <div class="ds-step"><span class="ds-step-num">4</span><div><b>추가 완료</b><p>오른쪽 위 <b>추가</b>를 누르면 홈 화면에 아이콘이 생깁니다.</p></div></div>
          </div>
        </div>
        <div class="ds-guide-actions">
          <button type="button" class="ds-guide-primary">확인했습니다</button>
          <button type="button" class="ds-guide-secondary" data-native-install hidden>설치 확인창 열기</button>
          <div class="ds-mini-note">설치 후에는 아이콘을 눌러 바로 접속할 수 있고, 업데이트는 자동으로 반영됩니다.</div>
        </div>
      </div>`;
    document.body.appendChild(el);
    const defaultTab=isIOS()?'ios':'android';
    function setTab(tab){
      el.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
      el.querySelectorAll('[data-guide]').forEach(g=>g.classList.toggle('active',g.dataset.guide===tab));
    }
    setTab(defaultTab);
    el.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
    const close=()=>{el.hidden=true};
    el.querySelector('.ds-guide-close').onclick=close;
    el.querySelector('.ds-guide-primary').onclick=close;
    el.addEventListener('click',e=>{if(e.target===el)close()});
    const nativeBtn=el.querySelector('[data-native-install]');
    nativeBtn.onclick=async()=>{
      if(!deferredPrompt)return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt=null;
      nativeBtn.hidden=true;
      el.hidden=true;
    };
    return el;
  }

  function showGuide(){
    const guide=ensureGuide();
    const nativeBtn=guide.querySelector('[data-native-install]');
    nativeBtn.hidden=!(deferredPrompt&&!isKakao());
    guide.hidden=false;
  }

  function ensureInstall(){
    if(isStandalone()||localStorage.getItem('ds_install_dismissed_'+app)==='1')return null;
    let el=document.getElementById('dsPwaInstall');
    if(el)return el;
    el=document.createElement('aside');
    el.id='dsPwaInstall';
    el.hidden=true;
    el.innerHTML=`<img src="${icon}" alt=""><div class="ds-copy"><strong>${name}</strong><small>홈 화면에 추가하면 앱처럼 바로 실행됩니다.</small></div><button type="button" class="install">추가 방법</button><button type="button" class="close" aria-label="닫기">×</button>`;
    document.body.appendChild(el);
    el.querySelector('.close').onclick=()=>{el.hidden=true;localStorage.setItem('ds_install_dismissed_'+app,'1')};
    el.querySelector('.install').onclick=installApp;
    return el;
  }

  async function installApp(){
    if(deferredPrompt&&!isKakao()&&isAndroid()){
      const guide=ensureGuide();
      const nativeBtn=guide.querySelector('[data-native-install]');
      nativeBtn.hidden=false;
      showGuide();
      return;
    }
    showGuide();
  }

  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();
    deferredPrompt=e;
    const el=ensureInstall();
    if(el)el.hidden=false;
  });
  window.addEventListener('appinstalled',()=>{
    const el=document.getElementById('dsPwaInstall');
    if(el)el.hidden=true;
    localStorage.setItem('ds_install_dismissed_'+app,'1');
  });
  window.designSocksInstallApp=installApp;

  document.addEventListener('DOMContentLoaded',()=>{
    injectStyles();
    showSplash();
    if(!isStandalone()&&(isIOS()||isKakao()||isSamsung())){
      const el=ensureInstall();
      if(el)el.hidden=false;
    }
    document.querySelectorAll('[data-install-app]').forEach(b=>b.addEventListener('click',installApp));
    if('serviceWorker'in navigator){
      navigator.serviceWorker.register('/service-worker.js?v=352').then(reg=>reg.update()).catch(console.warn);
    }
  });
})();
