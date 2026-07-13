const supabaseUrl =
  "https://dtjhuejmxrjkcxzvilgw.supabase.co";

const supabaseKey =
  "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";

const supabaseClient = window.supabase.createClient(
  supabaseUrl,
  supabaseKey
);

const customerList =
  document.getElementById("customerList");

const memberSearch =
  document.getElementById("memberSearch");

let allCustomers = [];
let memberFilter = "전체";

memberSearch.addEventListener(
  "input",
  renderFilteredCustomers
);

/* 관리자 권한 확인 */
async function checkAdminAccess() {
  const {
    data: { user },
    error: userError
  } = await supabaseClient.auth.getUser();

  if (userError || !user) {
    location.href = "admin.html";
    return false;
  }

  const { data: customer, error: customerError } =
    await supabaseClient
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
    location.href = "admin.html";
    return false;
  }

  return true;
}

/* 회원 상태 필터 */
function setMemberFilter(filter) {
  memberFilter = filter;
  renderFilteredCustomers();
}

window.setMemberFilter = setMemberFilter;

/* 회원목록 불러오기 */
async function loadCustomers() {
  customerList.innerHTML =
    "<p>회원목록을 불러오는 중...</p>";

  const { data, error } = await supabaseClient
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    customerList.innerHTML = `
      <div class="product-card">
        <h2>회원목록 불러오기 실패</h2>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
    return;
  }

  allCustomers = data || [];

  updateMemberCounts();
  renderFilteredCustomers();
}

/* 상단 회원 수 표시 */
function updateMemberCounts() {
  const waitingCount =
    allCustomers.filter(customer =>
      !customer.approved &&
      !customer.blocked
    ).length;

  const approvedCount =
    allCustomers.filter(customer =>
      customer.approved &&
      !customer.blocked
    ).length;

  const blockedCount =
    allCustomers.filter(customer =>
      customer.blocked
    ).length;

  document.getElementById("waitingCount").textContent =
    waitingCount;

  document.getElementById("approvedCount").textContent =
    approvedCount;

  document.getElementById("blockedCount").textContent =
    blockedCount;
}

/* 검색·필터 적용 */
function renderFilteredCustomers() {
  const keyword =
    memberSearch.value
      .trim()
      .toLowerCase()
      .replace(/[^0-9a-z가-힣@.]/g, "");

  const filteredCustomers =
    allCustomers.filter(customer => {
      const matchesFilter =
        memberFilter === "전체" ||
        (
          memberFilter === "승인대기" &&
          !customer.approved &&
          !customer.blocked
        ) ||
        (
          memberFilter === "승인완료" &&
          customer.approved &&
          !customer.blocked
        ) ||
        (
          memberFilter === "차단" &&
          customer.blocked
        );

      const searchableText = [
        customer.business_name,
        customer.owner_name,
        customer.phone,
        customer.email,
        customer.address
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .replace(/[^0-9a-z가-힣@.]/g, "");

      return (
        matchesFilter &&
        searchableText.includes(keyword)
      );
    });

  renderCustomers(filteredCustomers);
}

/* 회원 카드 표시 */
function renderCustomers(customers) {
  if (customers.length === 0) {
    customerList.innerHTML = `
      <div class="product-card">
        <h2>검색 결과가 없습니다</h2>
      </div>
    `;
    return;
  }

  customerList.innerHTML = customers
    .map(customer => {
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
        !customer.approved &&
        !customer.blocked
          ? `
            <button
              class="cart-btn"
              type="button"
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
            type="button"
            onclick="unblockCustomer('${customer.id}')"
          >
            차단 해제
          </button>
        `
        : `
          <button
            class="cart-btn gray-btn"
            type="button"
            onclick="blockCustomer('${customer.id}')"
          >
            회원 차단
          </button>
        `;

      const realEmailHtml =
        customer.email &&
        !isInternalPhoneEmail(customer.email)
          ? `
            <p>
              <strong>이메일:</strong>
              ${escapeHtml(customer.email)}
            </p>
          `
          : "";

      return `
        <div class="product-card member-card">

          <div class="order-top">
            <h2>
              ${escapeHtml(
                customer.business_name ||
                "거래처명 미입력"
              )}
            </h2>

            <span class="status-badge ${statusClass}">
              ${statusText}
            </span>
          </div>

          <p>
            <strong>대표자:</strong>
            ${escapeHtml(customer.owner_name || "-")}
          </p>

          <p>
            <strong>휴대폰번호:</strong>
            ${escapeHtml(formatPhone(customer.phone))}
          </p>

          ${realEmailHtml}

          <p>
            <strong>주소:</strong>
            ${escapeHtml(customer.address || "-")}
          </p>

          <p>
            <strong>가입일:</strong>
            ${formatDate(customer.created_at)}
          </p>

          ${approveButton}
          ${blockButton}

        </div>
      `;
    })
    .join("");
}

/* 내부 전화번호용 가상 이메일 여부 */
function isInternalPhoneEmail(email) {
  const normalizedEmail =
    String(email || "").toLowerCase();

  return (
    normalizedEmail.endsWith(
      "@phone.designsocks.kr"
    ) ||
    normalizedEmail.endsWith(
      "@designsocks.local"
    )
  );
}

/* 전화번호 표시 형식 */
function formatPhone(phone) {
  const numbers =
    String(phone || "")
      .replace(/[^0-9]/g, "");

  if (numbers.length === 11) {
    return (
      `${numbers.slice(0, 3)}-` +
      `${numbers.slice(3, 7)}-` +
      `${numbers.slice(7)}`
    );
  }

  if (numbers.length === 10) {
    return (
      `${numbers.slice(0, 3)}-` +
      `${numbers.slice(3, 6)}-` +
      `${numbers.slice(6)}`
    );
  }

  return phone || "-";
}

/* 날짜 표시 */
function formatDate(value) {
  if (!value) return "-";

  return new Date(value).toLocaleString("ko-KR");
}

/* 회원 승인 */
async function approveCustomer(customerId) {
  if (!confirm("이 회원을 승인할까요?")) return;

  const { error } = await supabaseClient
    .from("customers")
    .update({
      approved: true,
      blocked: false
    })
    .eq("id", customerId);

  if (error) {
    alert(
      "회원 승인 실패: " +
      error.message
    );
    return;
  }

  alert("회원 승인이 완료되었습니다.");
  await loadCustomers();
}

window.approveCustomer = approveCustomer;

/* 회원 차단 */
async function blockCustomer(customerId) {
  if (!confirm("이 회원을 차단할까요?")) return;

  const { error } = await supabaseClient
    .from("customers")
    .update({
      blocked: true
    })
    .eq("id", customerId);

  if (error) {
    alert(
      "회원 차단 실패: " +
      error.message
    );
    return;
  }

  await loadCustomers();
}

window.blockCustomer = blockCustomer;

/* 차단 해제 */
async function unblockCustomer(customerId) {
  if (!confirm("차단을 해제할까요?")) return;

  const { error } = await supabaseClient
    .from("customers")
    .update({
      blocked: false
    })
    .eq("id", customerId);

  if (error) {
    alert(
      "차단 해제 실패: " +
      error.message
    );
    return;
  }

  await loadCustomers();
}

window.unblockCustomer = unblockCustomer;

/* 화면 출력용 안전 처리 */
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* 페이지 시작 */
async function startMembersPage() {
  const allowed = await checkAdminAccess();

  if (!allowed) return;

  await loadCustomers();
}

startMembersPage();