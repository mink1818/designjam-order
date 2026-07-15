(() => {
  "use strict";

  const SUPABASE_URL = "https://dtjhuejmxrjkcxzvilgw.supabase.co";
  const SUPABASE_KEY = "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";
  const ADMIN_SESSION_KEY = "designjam_admin_session";
  const CUSTOMER_SESSION_KEY = "designjam_customer_session";
  const ADMIN_PROFILE_KEY = "designjam_admin_profile";
  const CUSTOMER_PROFILE_KEY = "designjam_customer_profile";

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

  function readProfile(role) {
    const key = role === "admin" ? ADMIN_PROFILE_KEY : CUSTOMER_PROFILE_KEY;
    try {
      return JSON.parse(sessionStorage.getItem(key) || localStorage.getItem(key) || "null");
    } catch (_) {
      return null;
    }
  }

  function saveProfile(role, profile) {
    const key = role === "admin" ? ADMIN_PROFILE_KEY : CUSTOMER_PROFILE_KEY;
    const value = JSON.stringify(profile || {});
    sessionStorage.setItem(key, value);
    localStorage.setItem(key, value);
  }

  function ensureStyles() {
    if (document.getElementById("designjamSessionStatusStyles")) return;
    const style = document.createElement("style");
    style.id = "designjamSessionStatusStyles";
    style.textContent = `
      #designjamSessionStatus.session-status{position:fixed!important;top:10px!important;right:10px!important;left:auto!important;z-index:2147483647!important;display:flex!important;visibility:visible!important;opacity:1!important;align-items:center!important;gap:8px!important;max-width:calc(100vw - 20px)!important;padding:8px 9px 8px 11px!important;border:1px solid rgba(255,255,255,.35)!important;border-radius:14px!important;background:#172b4d!important;color:#fff!important;box-shadow:0 8px 24px rgba(0,0,0,.25)!important;font-family:Arial,sans-serif!important;transform:none!important}
      #designjamSessionStatus.session-status-customer{background:#24589f!important}
      #designjamSessionStatus .session-status-dot{width:9px!important;height:9px!important;flex:0 0 9px!important;border-radius:50%!important;background:#47d16c!important;box-shadow:0 0 0 4px rgba(71,209,108,.18)!important}
      #designjamSessionStatus .session-status-text{min-width:0!important;display:flex!important;flex-direction:column!important;line-height:1.2!important}
      #designjamSessionStatus .session-status-text strong{font-size:12px!important;color:#fff!important;white-space:nowrap!important}
      #designjamSessionStatus .session-status-text span{max-width:180px!important;overflow:hidden!important;color:rgba(255,255,255,.88)!important;font-size:11px!important;text-overflow:ellipsis!important;white-space:nowrap!important}
      #designjamSessionStatus .session-status-logout{flex:0 0 auto!important;padding:7px 9px!important;border:0!important;border-radius:9px!important;background:rgba(255,255,255,.2)!important;color:#fff!important;font-size:12px!important;font-weight:700!important;cursor:pointer!important}
      @media(max-width:680px){#designjamSessionStatus.session-status{top:6px!important;right:6px!important;padding:7px 8px!important}#designjamSessionStatus .session-status-text span{max-width:100px!important}}
    `;
    document.head.appendChild(style);
  }

  function createStatusBar({ role, title, detail }) {
    ensureStyles();
    let box = document.getElementById("designjamSessionStatus");
    if (!box) {
      box = document.createElement("aside");
      box.id = "designjamSessionStatus";
      document.body.appendChild(box);
    }
    box.className = `session-status session-status-${role}`;
    box.setAttribute("aria-live", "polite");
    box.innerHTML = `
      <div class="session-status-dot" aria-hidden="true"></div>
      <div class="session-status-text">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(detail || (role === "admin" ? "관리자" : "거래처"))}</span>
      </div>
      <button type="button" class="session-status-logout">로그아웃</button>
    `;
    box.querySelector(".session-status-logout").addEventListener("click", logout);
  }

  async function logout() {
    const role = document.body.dataset.sessionPage;
    const sb = getClient();
    try { if (sb) await sb.auth.signOut(); } catch (error) { console.warn("로그아웃 오류:", error); }

    [ADMIN_SESSION_KEY, CUSTOMER_SESSION_KEY, ADMIN_PROFILE_KEY, CUSTOMER_PROFILE_KEY]
      .forEach(key => { sessionStorage.removeItem(key); localStorage.removeItem(key); });
    location.replace(role === "admin" ? "admin.html" : "login.html");
  }

  async function render() {
    const role = document.body.dataset.sessionPage;
    if (role !== "admin" && role !== "customer") return;

    const sb = getClient();
    if (!sb) return;

    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

      const sessionKey = role === "admin" ? ADMIN_SESSION_KEY : CUSTOMER_SESSION_KEY;
      const sessionId = sessionStorage.getItem(sessionKey) || localStorage.getItem(sessionKey);
      if (sessionId !== user.id) return;

      // DB 조회가 늦거나 RLS로 실패하더라도 로그인 정보창부터 즉시 표시
      const cached = readProfile(role) || {};
      createStatusBar({
        role,
        title: role === "admin" ? "관리자 로그인 중" : "거래처 로그인 중",
        detail: cached.name || cached.businessName || cached.email || user.email || (role === "admin" ? "관리자" : "거래처")
      });

      const { data: customer, error } = await sb
        .from("customers")
        .select("business_name, representative, phone, is_admin, approved, blocked")
        .eq("id", user.id)
        .maybeSingle();

      if (error || !customer || customer.blocked) return;
      if (role === "admin" && !customer.is_admin) return;
      if (role === "customer" && (!customer.approved || customer.is_admin)) return;

      const name = customer.business_name || customer.representative || user.email || (role === "admin" ? "관리자" : "거래처");
      saveProfile(role, { name, email: user.email || "", userId: user.id });
      createStatusBar({
        role,
        title: role === "admin" ? "관리자 로그인 중" : "거래처 로그인 중",
        detail: name
      });
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
  window.addEventListener("pageshow", render);
})();
