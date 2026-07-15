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

  function createStatusBar({ role, title, detail }) {
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
      if (adminSession !== user.id || !customer.is_admin) return;
      createStatusBar({
        role: "admin",
        title: "관리자 로그인 중",
        detail: customer.business_name || customer.representative || user.email || "관리자"
      });
      return;
    }

    if (
      expectedRole === "customer" &&
      customerSession === user.id &&
      customer.approved &&
      !customer.is_admin
    ) {
      createStatusBar({
        role: "customer",
        title: "거래처 로그인 중",
        detail: customer.business_name || customer.representative || customer.phone || "거래처"
      });
    }
  }

  window.designjamSession = { logout, refresh: render };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render, { once: true });
  } else {
    render();
  }
})();
