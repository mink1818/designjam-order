const supabaseUrl =
  "https://dtjhuejmxrjkcxzvilgw.supabase.co";

const supabaseKey =
  "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";

const supabaseClient = window.supabase.createClient(
  supabaseUrl,
  supabaseKey
);

const loginButton =
  document.getElementById("loginButton");

const loginMessage =
  document.getElementById("loginMessage");

const loginPhoneInput =
  document.getElementById("loginPhone");

const CUSTOMER_SESSION_KEY = "designjam_customer_session";
const ADMIN_SESSION_KEY = "designjam_admin_session";

loginButton.addEventListener(
  "click",
  loginCustomer
);

loginPhoneInput.addEventListener(
  "keydown",
  event => {
    if (event.key === "Enter") {
      loginCustomer();
    }
  }
);

document
  .getElementById("loginPassword")
  .addEventListener("keydown", event => {
    if (event.key === "Enter") {
      loginCustomer();
    }
  });

function normalizePhone(value) {
  return String(value || "")
    .replace(/[^0-9]/g, "");
}

/* 휴대폰번호 자동 하이픈 */
loginPhoneInput.addEventListener("input", () => {
  const numbers =
    normalizePhone(loginPhoneInput.value)
      .slice(0, 11);

  if (numbers.length <= 3) {
    loginPhoneInput.value = numbers;
    return;
  }

  if (numbers.length <= 7) {
    loginPhoneInput.value =
      `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return;
  }

  loginPhoneInput.value =
    `${numbers.slice(0, 3)}-` +
    `${numbers.slice(3, 7)}-` +
    `${numbers.slice(7)}`;
});

async function loginCustomer() {
  const phone =
    normalizePhone(loginPhoneInput.value);

  const password =
    document
      .getElementById("loginPassword")
      .value;

  loginMessage.innerHTML = "";

  if (!/^01[0-9]{8,9}$/.test(phone)) {
    alert("휴대폰번호를 정확히 입력해주세요.");
    loginPhoneInput.focus();
    return;
  }

  if (!password) {
    alert("비밀번호를 입력해주세요.");
    return;
  }

  /* 회원가입 때 만든 내부 인증용 이메일 */
  const authEmail =
    `${phone}@phone.designsocks.kr`;

  loginButton.disabled = true;
  loginButton.textContent = "로그인 중...";

  try {
    const { data, error } =
      await supabaseClient.auth.signInWithPassword({
        email: authEmail,
        password
      });

    if (error) {
      throw new Error(
        "휴대폰번호 또는 비밀번호가 맞지 않습니다."
      );
    }

    const { data: customer, error: customerError } =
      await supabaseClient
        .from("customers")
        .select("*")
        .eq("id", data.user.id)
        .single();

    if (customerError || !customer) {
      await supabaseClient.auth.signOut();

      throw new Error(
        "거래처 정보를 불러오지 못했습니다."
      );
    }

    if (customer.blocked) {
      await supabaseClient.auth.signOut();

      throw new Error(
        "사용이 차단된 계정입니다. 관리자에게 문의해주세요."
      );
    }

    if (!customer.approved) {
      await supabaseClient.auth.signOut();

      loginMessage.innerHTML = `
        <div class="auth-success">
          <h3>관리자 승인 대기 중입니다.</h3>
          <p>
            관리자 승인 후 주문페이지를 이용할 수 있습니다.
          </p>
        </div>
      `;

      return;
    }

    sessionStorage.setItem(CUSTOMER_SESSION_KEY, data.user.id);
    localStorage.setItem(CUSTOMER_SESSION_KEY, data.user.id);
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    localStorage.removeItem(ADMIN_SESSION_KEY);
    const customerName = customer.business_name || customer.representative || customer.phone || "거래처";
    const customerProfile = JSON.stringify({ name: customerName, email: data.user.email || "", userId: data.user.id });
    sessionStorage.setItem("designjam_customer_profile", customerProfile);
    localStorage.setItem("designjam_customer_profile", customerProfile);
    location.replace("index.html");

  } catch (error) {
    loginMessage.innerHTML = `
      <p class="auth-error">
        ${escapeHtml(error.message)}
      </p>
    `;
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "로그인";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}