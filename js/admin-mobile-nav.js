(() => {
  function currentKey() {
    const page = location.pathname.split('/').pop() || 'admin-home.html';
    if (page === 'admin-home.html') return 'home';
    if (page === 'admin.html') return 'orders';
    if (page === 'products.html') return 'products';
    if (page === 'members.html') return 'members';
    if (page === 'settings.html') return 'settings';
    return '';
  }

  function addAdminMobileNav() {
    if (document.getElementById('adminMobileBottomNav')) return;
    const active = currentKey();
    const items = [
      ['home', 'admin-home.html', '🏠', '홈'],
      ['orders', 'admin.html?view=orders', '📦', '주문'],
      ['products', 'products.html', '🧦', '상품'],
      ['members', 'members.html', '🏢', '거래처'],
      ['settings', 'settings.html', '⚙️', '설정']
    ];
    const nav = document.createElement('nav');
    nav.id = 'adminMobileBottomNav';
    nav.className = 'admin-mobile-bottom-nav';
    nav.setAttribute('aria-label', '관리자 빠른 이동');
    nav.innerHTML = items.map(([key, href, icon, label]) =>
      `<a href="${href}" class="${active === key ? 'active' : ''}" ${active === key ? 'aria-current="page"' : ''}><span>${icon}</span><b>${label}</b></a>`
    ).join('');
    document.body.appendChild(nav);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addAdminMobileNav);
  else addAdminMobileNav();
})();
