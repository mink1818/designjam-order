const supabaseUrl = "https://dtjhuejmxrjkcxzvilgw.supabase.co";
const supabaseKey = "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";

const supabaseClient = window.supabase.createClient(
  supabaseUrl,
  supabaseKey
);

const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");

loginButton.addEventListener("click", loginCustomer);

async function loginCustomer() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    alert("이메일과 비밀번호를 입력해주세요.");
    return;
  }

  loginButton.disabled = true;
  loginButton.textContent = "로그인 중...";
  loginMessage.innerHTML = "";

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  loginButton.disabled = false;
  loginButton.textContent = "로그인";

  if (error) {
    loginMessage.innerHTML = `
      <p class="auth-error">로그인 실패: ${error.message}</p>
    `;
    return;
  }

  const user = data.user;

  const { data: customer, error: customerError } = await supabaseClient
    .from("customers")
    .select("*")
    .eq("id", user.id)
    .single();

  if (customerError) {
    await supabaseClient.auth.signOut();

    loginMessage.innerHTML = `
      <p class="auth-error">
        거래처 정보를 불러오지 못했습니다.
      </p>
    `;
    return;
  }

  if (customer.blocked) {
    await supabaseClient.auth.signOut();

    loginMessage.innerHTML = `
      <p class="auth-error">
        사용이 차단된 계정입니다. 관리자에게 문의해주세요.
      </p>
    `;
    return;
  }

  if (!customer.approved) {
    await supabaseClient.auth.signOut();

    loginMessage.innerHTML = `
      <div class="auth-success">
        <h3>관리자 승인 대기 중입니다.</h3>
        <p>승인 완료 후 주문페이지를 이용할 수 있습니다.</p>
      </div>
    `;
    return;
  }

  location.href = "index.html";
}