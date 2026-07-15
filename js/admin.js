const ADMIN_SESSION_KEY = "designjam_admin_session";
const CUSTOMER_SESSION_KEY = "designjam_customer_session";

async function adminLogin() {
  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;
  const messageBox = document.getElementById("adminLoginMessage");

  if (!email || !password) {
    alert("관리자 이메일과 비밀번호를 입력해주세요.");
    return;
  }

  messageBox.innerHTML = "<p>로그인 확인 중...</p>";

  const { data, error } =
    await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

  if (error) {
    messageBox.innerHTML = `
      <p class="auth-error">로그인 실패: ${error.message}</p>
    `;
    return;
  }

  const { data: customer, error: customerError } =
    await supabaseClient
      .from("customers")
      .select("business_name, representative, is_admin, blocked")
      .eq("id", data.user.id)
      .single();

  if (
    customerError ||
    !customer ||
    !customer.is_admin ||
    customer.blocked
  ) {
    await supabaseClient.auth.signOut();

    messageBox.innerHTML = `
      <p class="auth-error">
        관리자 권한이 없는 계정입니다.
      </p>
    `;
    return;
  }

  sessionStorage.setItem(ADMIN_SESSION_KEY, data.user.id);
  localStorage.setItem(ADMIN_SESSION_KEY, data.user.id);
  sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
  localStorage.removeItem(CUSTOMER_SESSION_KEY);
  const adminName = customer.business_name || customer.representative || data.user.email || "관리자";
  const adminProfile = JSON.stringify({ name: adminName, email: data.user.email || "", userId: data.user.id });
  sessionStorage.setItem("designjam_admin_profile", adminProfile);
  localStorage.setItem("designjam_admin_profile", adminProfile);

  // 관리자 로그인 성공 시 전체 관리자 메뉴로 이동
  location.replace("admin-home.html");
}

const adminOrders = document.getElementById("adminOrders");
const adminSearch = document.getElementById("adminSearch");
const adminCompletedPeriod = document.getElementById("adminCompletedPeriod");

let adminFilter = "전체";

adminSearch.addEventListener("input", loadOrders);

function setAdminFilter(status) {
  adminFilter = status;
  loadOrders();
}

async function loadOrders() {
  adminOrders.innerHTML = "<p>주문을 불러오는 중...</p>";

  let data = [];

try {
  data = await fetchOrders();
} catch (error) {
  adminOrders.innerHTML = `<p>주문 불러오기 실패: ${error.message}</p>`;
  return;
}

  if (!data || data.length === 0) {
    adminOrders.innerHTML = "<div class='product-card'><h2>주문이 없습니다</h2></div>";
    return;
  }

  const grouped = {};

  data.forEach(order => {
    if (!grouped[order.order_number]) {
      grouped[order.order_number] = {
        orderNumber: order.order_number,
        customerName: order.customer_name,
        memo: order.memo,
        status: order.status,
        createdAt: order.created_at,
        shipping_fee: order.shipping_fee || 0,
        courier: order.courier || "로젠택배",
tracking_number: order.tracking_number || "",
        items: []
      };
    }

    grouped[order.order_number].items.push(order);
  });

  const groups = Object.values(grouped);

  document.getElementById("totalCount").textContent = groups.length;
  document.getElementById("pendingCount").textContent =
    groups.filter(g => g.status === "주문접수").length;
  document.getElementById("doneCount").textContent =
    groups.filter(g => g.status === "출고완료").length;

  const keyword = adminSearch.value.trim();

  const filteredGroups = groups
    .filter(group => {
      if (adminFilter !== "전체" && group.status !== adminFilter) return false;

      if (group.status === "출고완료" && !isWithinCompletedPeriod(group.createdAt)) {
        return false;
      }

      if (!keyword) return true;

      const itemText = group.items.map(item => item.item_number).join(" ");

      return (
        group.customerName?.includes(keyword) ||
        group.orderNumber?.includes(keyword) ||
        itemText.includes(keyword)
      );
    })
    .sort((a, b) => {
      if (a.status === b.status) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      }

      if (a.status === "주문접수") return -1;
      if (b.status === "주문접수") return 1;

      return 0;
    });

  renderOrderCards(filteredGroups);
}

function isWithinCompletedPeriod(createdAt) {
  const value = adminCompletedPeriod?.value || "30";
  if (value === "all") return true;

  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return true;

  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - Number(value));
  return created >= cutoff;
}

function formatOrderDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit"
  });
}

function renderOrderCards(groups) {
  if (groups.length === 0) {
    adminOrders.innerHTML = "<div class='product-card'><h2>검색 결과가 없습니다</h2></div>";
    return;
  }

  let html = "";

  groups.forEach((group, index) => {
    const isDone = group.status === "출고완료";
    let itemHtml = "";
    let summaryQty = 0;
let summaryTotal = 0;

group.items.forEach(item => {
  if (!item.is_soldout) {
    summaryQty += item.qty;
    summaryTotal += item.price * item.qty * 10;
  }
});

summaryTotal += Number(group.shipping_fee || 0);

    group.items.forEach(item => {
      const rowTotal = item.price * item.qty * 10;

      itemHtml += `
        <label class="pick-row stock-row">
          <input 
  type="checkbox" 
  ${item.is_soldout ? "checked" : ""}
  ${group.status === "출고완료" ? "disabled" : ""}
  onchange="toggleSoldout(${item.id}, this.checked); recalcOrderCard('order-${index}')"
>
          <strong>${item.item_number}</strong>
          <span>× ${item.qty}</span>
          <em>${rowTotal.toLocaleString()}원</em>
        </label>
      `;
    });

    html += `
      <div id="order-${index}" class="product-card order-card ${group.status === "출고완료" ? "done" : ""}">
                <div class="order-header" onclick="toggleDetail('detail-${index}')">
  <div>
    <h2>${group.customerName || "거래처 미입력"}</h2>
    <p class="order-summary-number">${group.orderNumber} · ${formatOrderDate(group.createdAt)}</p>
    <p class="order-summary-money">출고수량 ${summaryQty}개 / ${summaryTotal.toLocaleString()}원</p>
  </div>

  <span>
    ${group.status} ▼
  </span>
</div>

<div
id="detail-${index}"
class="order-detail">

        <div class="pick-list">
          ${itemHtml}
        </div>

        <hr>

        <label class="shipping-label">배송비</label>
        
<input
  class="shipping-input"
  type="number"
  value="${group.shipping_fee || 0}"
  min="0"
  data-order="${group.orderNumber}"
  oninput="recalcOrderCard('order-${index}')"
  ${group.status === "출고완료" ? "disabled" : ""}
>

<label class="shipping-label">택배사</label>

<select 
  class="courier-select" 
  data-order="${group.orderNumber}"
  ${isDone ? "disabled" : ""}
>
  <option value="로젠택배" ${group.courier==="로젠택배"?"selected":""}>로젠택배</option>
  <option value="CJ대한통운" ${group.courier==="CJ대한통운"?"selected":""}>CJ대한통운</option>
  <option value="한진택배" ${group.courier==="한진택배"?"selected":""}>한진택배</option>
  <option value="우체국택배" ${group.courier==="우체국택배"?"selected":""}>우체국택배</option>
  <option value="롯데택배" ${group.courier==="롯데택배"?"selected":""}>롯데택배</option>
  <option value="경동택배" ${group.courier==="경동택배"?"selected":""}>경동택배</option>
</select>

<label class="shipping-label">송장번호</label>

<input
  class="tracking-input"
  data-order="${group.orderNumber}"
  type="text"
  value="${group.tracking_number || ""}"
  placeholder="송장번호 입력"
  ${isDone ? "disabled" : ""}
>

        <h2 class="total-qty">출고수량: <span class="calc-qty">0</span>개</h2>
        <p><strong>상품금액:</strong> <span class="calc-product-total">0</span>원</p>
        <p><strong>배송비:</strong> <span class="calc-shipping-fee">0</span>원</p>
        <h2 class="final-total">최종금액: <span class="calc-final-total">0</span>원</h2>

        <button
          class="cart-btn ${group.status === "출고완료" ? "undo-btn" : ""}"
          onclick="toggleOrderStatus('${group.orderNumber}', '${group.status}')"
        >
          ${group.status === "출고완료" ? "주문접수로 되돌리기" : "출고완료"}
        </button>

        <button
  class="cart-btn statement-btn"
  type="button"
  onclick="openStatement('${group.orderNumber}')"
>
  거래명세서 출력
</button>
      </div>
      </div>
    `;
  });

  adminOrders.innerHTML = html;

  groups.forEach((_, index) => {
    recalcOrderCard(`order-${index}`);
  });
}

async function toggleOrderStatus(orderNumber, currentStatus) {
  const shippingInput = document.querySelector(
    `.shipping-input[data-order="${orderNumber}"]`
  );

  const courierSelect = document.querySelector(
    `.courier-select[data-order="${orderNumber}"]`
  );

  const trackingInput = document.querySelector(
    `.tracking-input[data-order="${orderNumber}"]`
  );

  const shippingFee = Number(shippingInput?.value) || 0;
  const courier = courierSelect?.value || "로젠택배";
  const trackingNumber = trackingInput?.value || "";

  try {
    await updateOrderStatus(orderNumber, currentStatus, shippingFee, courier, trackingNumber);
    loadOrders();
  } catch (error) {
    alert("상태 변경 실패: " + error.message);
  }
}

function recalcOrderCard(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;

  const rows = card.querySelectorAll(".stock-row");

  let qtyTotal = 0;
  let productTotal = 0;

  rows.forEach(row => {
    const checkbox = row.querySelector("input[type='checkbox']");
    const qtyText = row.querySelector("span").textContent.replace("×", "").trim();
    const priceText = row.querySelector("em").textContent.replace(/[^0-9]/g, "");

    const qty = Number(qtyText);
    const rowTotal = Number(priceText);

    if (!checkbox.checked) {
      qtyTotal += qty;
      productTotal += rowTotal;
    }
  });

  const shipping = Number(card.querySelector(".shipping-input").value) || 0;
  const finalTotal = productTotal + shipping;

  card.querySelector(".calc-qty").textContent = qtyTotal;
  card.querySelector(".calc-product-total").textContent = productTotal.toLocaleString();
  card.querySelector(".calc-shipping-fee").textContent = shipping.toLocaleString();
  card.querySelector(".calc-final-total").textContent = finalTotal.toLocaleString();
}
async function saveShipping(orderNumber, fee){

    await supabaseClient
    .from("orders")
    .update({
        shipping_fee:Number(fee)
    })
    .eq("order_number",orderNumber);

}

async function toggleSoldout(id, isChecked) {
  try {
    await updateSoldout(id, isChecked);
  } catch (error) {
    alert("품절 저장 실패: " + error.message);
  }
}

function toggleDetail(id) {
  const box = document.getElementById(id);
  if (!box) return;

  const isHidden = window.getComputedStyle(box).display === "none";

  box.style.display = isHidden ? "block" : "none";
}

function openStatement(orderNumber) {
  const url =
    `statement.html?order=${encodeURIComponent(orderNumber)}`;

  window.open(url, "_blank");
}

async function initializeAdminPage() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  const sessionUserId = sessionStorage.getItem(ADMIN_SESSION_KEY);

  if (!user || sessionUserId !== user.id) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    if (user) await supabaseClient.auth.signOut();
    document.getElementById("loginBox").style.display = "block";
    document.getElementById("adminContent").style.display = "none";
    return;
  }

  const { data: customer } = await supabaseClient
    .from("customers")
    .select("is_admin, blocked")
    .eq("id", user.id)
    .single();

  if (!customer?.is_admin || customer.blocked) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    await supabaseClient.auth.signOut();
    document.getElementById("loginBox").style.display = "block";
    document.getElementById("adminContent").style.display = "none";
    return;
  }

  document.getElementById("loginBox").style.display = "none";
  document.getElementById("adminContent").style.display = "block";
  loadOrders();
}

initializeAdminPage();
