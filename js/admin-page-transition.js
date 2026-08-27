(() => {
  "use strict";
  // V6.6.64: 화면을 먼저 지워버리는 전환 효과를 제거해 흰 화면 체감을 없앱니다.
  const begin = () => {};
  window.designSocksAdminTransition = begin;
  const prefetched = new Set();
  const prefetch = href => {
    try {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin || prefetched.has(url.href)) return;
      prefetched.add(url.href);
      const link=document.createElement('link'); link.rel='prefetch'; link.href=url.href; link.as='document'; document.head.appendChild(link);
    } catch (_) {}
  };
  document.addEventListener('pointerover', e => { const a=e.target.closest('a[href]'); if(a) prefetch(a.getAttribute('href')); }, {passive:true});
  document.addEventListener('touchstart', e => { const a=e.target.closest('a[href]'); if(a) prefetch(a.getAttribute('href')); }, {passive:true});
  document.querySelectorAll('[data-link]').forEach(el=>{ const href=el.dataset.link; if(href) el.addEventListener('pointerenter',()=>prefetch(href),{once:true,passive:true}); });
})();
