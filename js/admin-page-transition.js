(() => {
  "use strict";
  const begin = () => {
    if (document.body.classList.contains("admin-page-leaving")) return;
    document.body.classList.add("admin-page-leaving");
  };
  window.designSocksAdminTransition = begin;

  document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest("a[href]");
    if (anchor) {
      const href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("#") || anchor.target === "_blank" || href.startsWith("javascript:")) return;
      try {
        const url = new URL(href, location.href);
        if (url.origin === location.origin) begin();
      } catch (_) {}
      return;
    }
    const button = event.target.closest("button");
    if (!button) return;
    const inline = button.getAttribute("onclick") || "";
    if (/location\.(href|replace)|location\.assign/.test(inline) && !/window\.open/.test(inline)) begin();
    if (button.dataset.link) begin();
  }, true);

  window.addEventListener("pageshow", () => document.body.classList.remove("admin-page-leaving"));
})();
