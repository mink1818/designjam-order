(() => {
  "use strict";
  // V6.6.64: 화면을 먼저 지워버리는 전환 효과를 제거해 흰 화면 체감을 없앱니다.
  const begin = () => {};
  window.designSocksAdminTransition = begin;
  const prefetched = new Set();
  const targetOf = el => el?.getAttribute?.('href') || el?.dataset?.link || el?.dataset?.href || '';
  const prefetch = href => {
    try {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin || prefetched.has(url.href)) return;
      prefetched.add(url.href);
      const link=document.createElement('link'); link.rel='prefetch'; link.href=url.href; link.as='document'; link.fetchPriority='high'; document.head.appendChild(link);
    } catch (_) {}
  };
  const candidate = target => target?.closest?.('a[href],[data-link],[data-href]');
  const warmFromEvent = e => { const el=candidate(e.target); if(el) prefetch(targetOf(el)); };
  document.addEventListener('pointerover', warmFromEvent, {passive:true});
  document.addEventListener('pointerdown', warmFromEvent, {passive:true,capture:true});
  document.addEventListener('touchstart', warmFromEvent, {passive:true,capture:true});
  document.addEventListener('focusin', warmFromEvent, {passive:true});

  // 자주 이동하는 화면은 현재 화면이 그려진 직후 미리 받아 둡니다.
  const common=document.body?.dataset?.sessionPage==='customer'
    ? ['index.html','catalog.html','order.html','customer-settings.html']
    : ['admin-home.html','admin.html?view=orders','picking.html','proxy-order.html','members.html'];
  const warmCommon=()=>common.forEach(prefetch);
  if('requestIdleCallback' in window) requestIdleCallback(warmCommon,{timeout:350});
  else setTimeout(warmCommon,40);
})();
