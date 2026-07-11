const supabaseUrl = "https://dtjhuejmxrjkcxzvilgw.supabase.co";
const supabaseKey = "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";

const supabaseClient = window.supabase.createClient(
  supabaseUrl,
  supabaseKey
);

const customerList = document.getElementById("customerList");

async function checkAdminAccess() {
  const {
    data: { user },
    error: userError
  } = await supabaseClient.auth.getUser();

  if (userError || !user) {
    location.href = "admin.html";
    return false;
  }

  const { data: customer, error: customerError } = await supabaseClient
    .from("customers")
    .select("is_admin, blocked")
    .eq("id", user.id)
    .single();

  if (
    customerError ||
    !customer ||
    !customer.is_admin ||
    customer.blocked
  ) {
    alert("관리자 권한이 없습니다.");
    location.href = "login.html";
    return false;
  }

  return true;
}

async function loadCustomers() {
  customerList.innerHTML = "<p>회원목록을 불러오는 중...</p>";

  const { data, error } = await supabaseClient
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    customerList.innerHTML = `
      <div class="product-card">
        <h2>회원목록 불러오기 실패</h2>
        <p>${error.message}</p>
      </div>
    `;
    return;
  }

  renderCustomers(data || []);
}

function renderCustomers(customers) {
  const waitingCount = customers.filter(
    customer => !customer.approved && !customer.blocked
  ).length;

  const approvedCount = customers.filter(
    customer => customer.approved && !customer.blocked
  ).length;

  const blockedCount = customers.filter(
    customer => customer.blocked
  ).length;

  document.getElementById("waitingCount").textContent = waitingCount;
  document.getElementById("approvedCount").textContent = approvedCount;
  document.getElementById("blockedCount").textContent = blockedCount;

  if (customers.length === 0) {
    customerList.innerHTML = `
      <div class="product-card">
        <h2>가입한 회원이 없습니다</h2>
      </div>
    `;
    return;
  }

  customerList.innerHTML = customers.map(customer => {
    const statusText = customer.blocked
      ? "차단"
      : customer.approved
        ? "승인완료"
        : "승인대기";

    const statusClass = customer.blocked
      ? "blocked"
      : customer.approved
        ? "done"
        : "pending";

    const approveButton =
      !customer.approved && !customer.blocked
        ? `
          <button
            class="cart-btn"
            onclick="approveCustomer('${customer.id}')"
          >
            회원 승인
          </button>
        `
        : "";

    const blockButton = customer.blocked
      ? `
        <button
          class="cart-btn"
          onclick="unblockCustomer('${customer.id}')"
        >
          차단 해제
        </button>
      `
      : `
        <button
          class="cart-btn gray-btn"
          onclick="blockCustomer('${customer.id}')"
        >
          회원 차단
        </button>
      `;

    return `
      <div class="product-card member-card">
        <div class="order-top">
          <h2>${customer.business_name || "거래처명 미입력"}</h2>

          <span class="status-badge ${statusClass}">
            ${statusText}
          </span>
        </div>

        <p><strong>대표자:</strong> ${customer.owner_name || "-"}</p>
        <p><strong>전화번호:</strong> ${customer.phone || "-"}</p>
        <p><strong>이메일:</strong> ${customer.email || "-"}</p>
        <p><strong>사업자번호:</strong> ${customer.business_number || "-"}</p>
        <p><strong>주소:</strong> ${customer.address || "-"}</p>
        <p>
          <strong>가입일:</strong>
          ${new Date(customer.created_at).toLocaleString("ko-KR")}
        </p>

        ${approveButton}
        ${blockButton}
      </div>
    `;
  }).join("");
}

async function approveCustomer(customerId) {
  const confirmed = confirm("이 회원을 승인할까요?");
  if (!confirmed) return;

  const { error } = await supabaseClient
    .from("customers")
    .update({
      approved: true,
      blocked: false
    })
    .eq("id", customerId);

  if (error) {
    alert("회원 승인 실패: " + error.message);
    return;
  }

  alert("회원 승인이 완료되었습니다.");
  loadCustomers();
}

async function blockCustomer(customerId) {
  const confirmed = confirm("이 회원을 차단할까요?");
  if (!confirmed) return;

  const { error } = await supabaseClient
    .from("customers")
    .update({
      blocked: true
    })
    .eq("id", customerId);

  if (error) {
    alert("회원 차단 실패: " + error.message);
    return;
  }

  loadCustomers();
}

async function unblockCustomer(customerId) {
  const confirmed = confirm("이 회원의 차단을 해제할까요?");
  if (!confirmed) return;

  const { error } = await supabaseClient
    .from("customers")
    .update({
      blocked: false
    })
    .eq("id", customerId);

  if (error) {
    alert("차단 해제 실패: " + error.message);
    return;
  }

  loadCustomers();
}

async function startMembersPage() {
  const allowed = await checkAdminAccess();

  if (!allowed) return;

  loadCustomers();
}

startMembersPage();