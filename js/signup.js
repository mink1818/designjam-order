const supabaseUrl =
  "https://dtjhuejmxrjkcxzvilgw.supabase.co";

const supabaseKey =
  "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";

const supabaseClient = window.supabase.createClient(
  supabaseUrl,
  supabaseKey
);

const signupButton =
  document.getElementById("signupButton");

const signupMessage =
  document.getElementById("signupMessage");

const signupPhoneInput =
  document.getElementById("signupPhone");

signupButton.addEventListener(
  "click",
  signupCustomer
);

/* 휴대폰번호에서 숫자만 추출 */
function normalizePhone(value) {
  return String(value || "")
    .replace(/[^0-9]/g, "");
}

/* 휴대폰번호 입력 중 자동 하이픈 */
signupPhoneInput.addEventListener("input", () => {
  const numbers =
    normalizePhone(signupPhoneInput.value)
      .slice(0, 11);

  if (numbers.length <= 3) {
    signupPhoneInput.value = numbers;
    return;
  }

  if (numbers.length <= 7) {
    signupPhoneInput.value =
      `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return;
  }

  signupPhoneInput.value =
    `${numbers.slice(0, 3)}-` +
    `${numbers.slice(3, 7)}-` +
    `${numbers.slice(7)}`;
});

/* 회원가입 */
async function signupCustomer() {
  const businessName =
    document
      .getElementById("businessName")
      .value
      .trim();

  const ownerName =
    document
      .getElementById("ownerName")
      .value
      .trim();

  const phone =
    normalizePhone(signupPhoneInput.value);

  const address =
    document
      .getElementById("address")
      .value
      .trim();

  const password =
    document
      .getElementById("signupPassword")
      .value;

  const passwordConfirm =
    document
      .getElementById("passwordConfirm")
      .value;

  signupMessage.innerHTML = "";

  if (!businessName) {
    alert("거래처명을 입력해주세요.");
    return;
  }

  if (!/^01[0-9]{8,9}$/.test(phone)) {
    alert("휴대폰번호를 정확히 입력해주세요.");
    signupPhoneInput.focus();
    return;
  }

  if (password.length < 6) {
    alert("비밀번호는 6자리 이상 입력해주세요.");
    return;
  }

  if (password !== passwordConfirm) {
    alert("비밀번호가 서로 다릅니다.");
    return;
  }

  /*
    실제 이메일을 받지 않고,
    휴대폰번호로 내부 인증용 이메일을 자동 생성합니다.
  */
  const authEmail =
    `${phone}@phone.designsocks.kr`;

  signupButton.disabled = true;
  signupButton.textContent =
    "회원가입 처리 중...";

  try {
    const { data, error } =
      await supabaseClient.auth.signUp({
        email: authEmail,
        password,

        options: {
          data: {
            business_name: businessName,
            owner_name: ownerName,
            phone,
            address,

            /*
              기존 고객 생성 트리거가 email 값을
              사용하고 있을 가능성을 고려해 함께 전달
            */
            email: authEmail
          }
        }
      });

    if (error) {
      const message =
        String(error.message || "");

      if (
        message.toLowerCase().includes("already") ||
        message.toLowerCase().includes("registered")
      ) {
        throw new Error(
          "이미 가입된 휴대폰번호입니다."
        );
      }

      throw error;
    }

    if (!data.user) {
      throw new Error(
        "회원정보를 생성하지 못했습니다."
      );
    }

    /*
      이메일 확인을 껐기 때문에 회원가입 직후
      세션이 생성될 수 있습니다.
      관리자 승인 전 사용하지 못하도록 바로 로그아웃합니다.
    */
    await supabaseClient.auth.signOut();

    signupMessage.innerHTML = `
      <div class="auth-success">
        <h3>회원가입 신청이 완료되었습니다.</h3>

        <p>
          관리자 승인 후 휴대폰번호와
          비밀번호로 로그인할 수 있습니다.
        </p>

        <button
          class="cart-btn"
          type="button"
          onclick="location.href='login.html'"
        >
          로그인 화면으로 이동
        </button>
      </div>
    `;

    document.getElementById("businessName").value = "";
    document.getElementById("ownerName").value = "";
    signupPhoneInput.value = "";
    document.getElementById("address").value = "";
    document.getElementById("signupPassword").value = "";
    document.getElementById("passwordConfirm").value = "";

  } catch (error) {
    signupMessage.innerHTML = `
      <p class="auth-error">
        회원가입 실패:
        ${escapeHtml(error.message)}
      </p>
    `;
  } finally {
    signupButton.disabled = false;
    signupButton.textContent =
      "회원가입 신청";
  }
}

/* 화면 출력용 안전 처리 */
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}