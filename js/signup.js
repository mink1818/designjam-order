const supabaseUrl = "https://dtjhuejmxrjkcxzvilgw.supabase.co";
const supabaseKey = "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";

const supabaseClient = window.supabase.createClient(
  supabaseUrl,
  supabaseKey
);

const signupButton = document.getElementById("signupButton");
const signupMessage = document.getElementById("signupMessage");

signupButton.addEventListener("click", signupCustomer);

async function signupCustomer() {
  const businessName = document.getElementById("businessName").value.trim();
  const ownerName = document.getElementById("ownerName").value.trim();
  const businessNumber = document.getElementById("businessNumber").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const address = document.getElementById("address").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const passwordConfirm = document.getElementById("passwordConfirm").value;

  signupMessage.textContent = "";

  if (!businessName || !phone || !email || !password) {
    alert("거래처명, 전화번호, 이메일, 비밀번호는 필수입니다.");
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

  signupButton.disabled = true;
  signupButton.textContent = "회원가입 처리 중...";

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: "https://designjam-order.vercel.app/login.html",
      data: {
        business_name: businessName,
        owner_name: ownerName,
        business_number: businessNumber,
        phone,
        address
      }
    }
  });

  signupButton.disabled = false;
  signupButton.textContent = "회원가입 신청";

  if (error) {
    signupMessage.innerHTML = `
      <p class="auth-error">
        회원가입 실패: ${error.message}
      </p>
    `;
    return;
  }

  if (!data.user) {
    signupMessage.innerHTML = `
      <p class="auth-error">
        회원정보를 생성하지 못했습니다.
      </p>
    `;
    return;
  }

  signupMessage.innerHTML = `
    <div class="auth-success">
      <h3>회원가입 신청이 완료되었습니다.</h3>
      <p>이메일로 전송된 인증 링크를 눌러주세요.</p>
      <p>이메일 인증 후 관리자 승인이 완료되면 주문할 수 있습니다.</p>
    </div>
  `;
}