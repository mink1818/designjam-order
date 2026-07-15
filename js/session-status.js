(() => {
  "use strict";

  const SUPABASE_URL = "https://dtjhuejmxrjkcxzvilgw.supabase.co";
  const SUPABASE_KEY = "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";
  const ADMIN_SESSION_KEY = "designjam_admin_session";
  const CUSTOMER_SESSION_KEY = "designjam_customer_session";

  let client = null;

  function getClient() {
    if (client) return client;
    if (!window.supabase?.createClient) return null;
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return client;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ensureStyles() {
    if (document.getElementById("designjamSessionStatusStyles")) return;
    const style = document.createElement("style");
    style.id = "designjamSessionStatusStyles";
    style.textContent = `
      .session-status{position:fixed!important;top:10px!important;right:10px!important;z-index:2147483647!important;display:flex!important;align-items:center!important;gap:8px!important;max-width:calc(100vw - 20px)!important;padding:8px 9px 8px 11px!important;border:1px solid rgba(255,255,255,.3)!important;border-radius:14px!important;background:rgba(18,32,56,.96)!important;color:#fff!important;box-shadow:0 8px 24px rgba(0,0,0,.22)!important;font-family:Arial,sans-serif!important}
      .session-status-customer{background:rgba(31,78,145,.97)!important}.session-status-dot{width:9px!important;height:9px!important;flex:0 0 9px!important;border-radius:50%!important;background:#47d16c!important;box-shadow:0 0 0 4px rgba(71,209,108,.17)!important}.session-status-text{min-width:0!important;display:flex!important;flex-direction:column!important;line-height:1.2!important}.session-status-text strong{font-size:12px!important;color:#fff!important;white-space:nowrap!important}.session-status-text span{max-width:170px!important;overflow:hidden!important;color:rgba(255,255,255,.85)!important;font-size:11px!important;text-overflow:ellipsis!important;white-space:nowrap!important}.session-status-logout{flex:0 0 auto!important;padding:7px 9px!important;border:0!important;border-radius:9px!important;background:rgba(255,255,255,.18)!important;color:#fff!important;font-size:12px!important;font-weight:700!important;cursor:pointer!important}@media(max-width:680px){.session-status{top:6px!important;right:6px!important;padding:7px 8px!important}.session-status-text span{max-width:100px!important}}
    `;
    document.head.appendChild(style);
  }

  function createStatusBar({ role, title, detail }) {
    ensureStyles();
    document.getElementById("designjamSessionStatus")?.remove();

    const box = document.createElement("aside");
    box.id = "designjamSessionStatus";
    box.className = `session-status session-status-${role}`;
    box.setAttribute("aria-live", "polite");
    box.innerHTML = `
      <div class="session-status-dot" aria-hidden="true"></div>
      <div class="session-status-text">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>
      <button type="button" class="session-status-logout">로그아웃</button>
    `;

    box.querySelector(".session-status-logout")
      .addEventListener("click", logout);

    document.body.appendChild(box);
  }

  async function logout() {
    const sb = getClient();
    try {
      if (sb) await sb.auth.signOut();
    } catch (error) {
      console.warn("로그아웃 처리 중 오류:", error);
    }

    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
    localStorage.removeItem(ADMIN_SESSION_KEY);
    localStorage.removeItem(CUSTOMER_SESSION_KEY);

    const pageRole = document.body.dataset.sessionPage;
    location.replace(pageRole === "admin" ? "admin.html" : "login.html");
  }

  async function render() {
    try {
    const expectedRole = document.body.dataset.sessionPage;
    if (!expectedRole) return;

    const sb = getClient();
    if (!sb) return;

    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const adminSession = sessionStorage.getItem(ADMIN_SESSION_KEY);
    const customerSession = sessionStorage.getItem(CUSTOMER_SESSION_KEY);

    const { data: customer } = await sb
      .from("customers")
      .select("business_name, representative, phone, is_admin, approved, blocked")
      .eq("id", user.id)
      .maybeSingle();

    if (!customer || customer.blocked) return;

    if (expectedRole === "admin") {
      if (!customer.is_admin) return;
      if (adminSession !== user.id) sessionStorage.setItem(ADMIN_SESSION_KEY, user.id);
      createStatusBar({
        role: "admin",
        title: "관리자 로그인 중",
        detail: customer.business_name || customer.representative || user.email || "관리자"
      });
      return;
    }

    if (
      expectedRole === "customer" &&
      customer.approved &&
      !customer.is_admin
    ) {
      if (customerSession !== user.id) sessionStorage.setItem(CUSTOMER_SESSION_KEY, user.id);
      createStatusBar({
        role: "customer",
        title: "거래처 로그인 중",
        detail: customer.business_name || customer.representative || customer.phone || "거래처"
      });
    }
    } catch (error) {
      console.warn("로그인 정보 표시 오류:", error);
    }
  }

  window.designjamSession = { logout, refresh: render };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render, { once: true });
  } else {
    render();
  }
})();
