(() => {
  const VERSION = 'V3.7.0';
  window.DESIGNJAM_VERSION = VERSION;
  document.documentElement.dataset.appVersion = VERSION;
  console.info(`[디자인삭스] ${VERSION}`);

  document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.app-version-badge')) return;
    const badge = document.createElement('div');
    badge.className = 'app-version-badge';
    badge.textContent = VERSION;
    badge.title = '현재 배포 버전';
    document.body.appendChild(badge);
  });
})();
