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
      #designjamSessionStatus .session-status-action{flex:0 0 auto!important;padding:7px 9px!important;border:0!important;border-radius:9px!important;background:rgba(255,255,255,.2)!important;color:#fff!important;font-size:12px!important;font-weight:700!important;cursor:pointer!important} #designjamPasswordModal{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.55)} #designjamPasswordModal[hidden]{display:none!important} #designjamPasswordModal .pw-card{width:min(420px,100%);padding:22px;border-radius:18px;background:#fff;color:#111;box-shadow:0 20px 60px rgba(0,0,0,.3)} #designjamPasswordModal input{width:100%;box-sizing:border-box;margin:7px 0 13px;padding:12px;border:1px solid #ccd4df;border-radius:10px} #designjamPasswordModal .pw-actions{display:flex;gap:8px} #designjamPasswordModal button{flex:1;padding:11px;border:0;border-radius:10px;font-weight:700;cursor:pointer} #designjamPasswordModal .primary{background:#24589f;color:#fff}
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
      <button type="button" class="session-status-action session-status-password">비밀번호 변경</button><button type="button" class="session-status-action session-status-logout">로그아웃</button>
    `;
    box.querySelector(".session-status-logout").addEventListener("click", logout);
    box.querySelector(".session-status-password").addEventListener("click", openPasswordModal);
  }


  function ensurePasswordModal() {
    let modal=document.getElementById("designjamPasswordModal");
    if(modal) return modal;
    modal=document.createElement("div"); modal.id="designjamPasswordModal"; modal.hidden=true;
    modal.innerHTML=`<div class="pw-card"><h2>비밀번호 변경</h2><p>새 비밀번호를 8자 이상 입력하세요.</p><label>새 비밀번호<input id="designjamNewPassword" type="password" minlength="8" autocomplete="new-password"></label><label>비밀번호 확인<input id="designjamNewPasswordConfirm" type="password" minlength="8" autocomplete="new-password"></label><div class="pw-actions"><button type="button" id="designjamPasswordCancel">취소</button><button type="button" class="primary" id="designjamPasswordSave">변경</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector("#designjamPasswordCancel").onclick=()=>{modal.hidden=true};
    modal.addEventListener("click",e=>{if(e.target===modal)modal.hidden=true});
    modal.querySelector("#designjamPasswordSave").onclick=changeOwnPassword;
    return modal;
  }
  function openPasswordModal(){const m=ensurePasswordModal();m.hidden=false;m.querySelector("#designjamNewPassword").focus();}
  async function changeOwnPassword(){
    const modal=ensurePasswordModal(), p1=modal.querySelector("#designjamNewPassword").value, p2=modal.querySelector("#designjamNewPasswordConfirm").value;
    if(p1.length<8)return alert("비밀번호는 8자 이상 입력하세요."); if(p1!==p2)return alert("비밀번호 확인이 일치하지 않습니다.");
    const sb=getClient(); const btn=modal.querySelector("#designjamPasswordSave"); btn.disabled=true;
    const {error}=await sb.auth.updateUser({password:p1}); btn.disabled=false; if(error)return alert("변경 실패: "+error.message);
    alert("비밀번호가 변경되었습니다."); modal.hidden=true; modal.querySelectorAll("input").forEach(i=>i.value="");
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

  window.designjamSession = { logout, refresh: render, openPasswordModal };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render, { once: true });
  } else {
    render();
  }
  window.addEventListener("pageshow", render);
})();
