const ADMIN_PASSWORD = "8190a";

function adminLogin() {
  const inputPassword = document.getElementById("adminPassword").value;

  if (inputPassword === ADMIN_PASSWORD) {
    document.getElementById("loginBox").style.display = "none";
    document.getElementById("adminContent").style.display = "block";
    loadOrders();
  } else {
    alert("비밀번호가 틀렸습니다.");
  }
}

const supabaseUrl = "https://dtjhuejmxrjkcxzvilgw.supabase.co";
const supabaseKey = "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

const adminOrders = document.getElementById("adminOrders");
const adminSearch = document.getElementById("adminSearch");

let adminFilter = "전체";

adminSearch.addEventListener("input", loadOrders);

function setAdminFilter(status) {
  adminFilter = status;
  loadOrders();
}

async function loadOrders() {
  adminOrders.innerHTML = "<p>주문을 불러오는 중...</p>";

  const { data, error } = await supabaseClient
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
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

function renderOrderCards(groups) {
  if (groups.length === 0) {
    adminOrders.innerHTML = "<div class='product-card'><h2>검색 결과가 없습니다</h2></div>";
    return;
  }

  let html = "";

  groups.forEach((group, index) => {
    let itemHtml = "";

    group.items.forEach(item => {
      const rowTotal = item.price * item.qty * 10;

      itemHtml += `
        <label class="pick-row stock-row">
          <input type="checkbox" onchange="recalcOrderCard('order-${index}')">
          <strong>${item.item_number}</strong>
          <span>× ${item.qty}</span>
          <em>${rowTotal.toLocaleString()}원</em>
        </label>
      `;
    });

    html += `
      <div id="order-${index}" class="product-card order-card ${group.status === "출고완료" ? "done" : ""}">
        <div class="order-top">
          <h2>${group.customerName || "거래처 미입력"}</h2>
          <span class="status-badge ${group.status === "출고완료" ? "done" : "pending"}">
            ${group.status}
          </span>
        </div>

        <p><strong>주문번호:</strong> ${group.orderNumber}</p>
        <p><strong>메모:</strong> ${group.memo || ""}</p>

        <div class="pick-list">
          ${itemHtml}
        </div>

        <hr>

        <label class="shipping-label">배송비</label>
        <input 
          class="shipping-input" 
          type="number" 
          value="0" 
          min="0"
          oninput="recalcOrderCard('order-${index}')"
        >

        <h2 class="total-qty">출고수량: <span class="calc-qty">0</span>개</h2>
        <p><strong>상품금액:</strong> <span class="calc-product-total">0</span>원</p>
        <h2 class="final-total">최종금액: <span class="calc-final-total">0</span>원</h2>

        <button
          class="cart-btn ${group.status === "출고완료" ? "undo-btn" : ""}"
          onclick="toggleOrderStatus('${group.orderNumber}', '${group.status}')"
        >
          ${group.status === "출고완료" ? "주문접수로 되돌리기" : "출고완료"}
        </button>
      </div>
    `;
  });

  adminOrders.innerHTML = html;

  groups.forEach((_, index) => {
    recalcOrderCard(`order-${index}`);
  });
}

async function toggleOrderStatus(orderNumber, currentStatus) {
  const nextStatus = currentStatus === "출고완료" ? "주문접수" : "출고완료";

  const { error } = await supabaseClient
    .from("orders")
    .update({ status: nextStatus })
    .eq("order_number", orderNumber);

  if (error) {
    alert("상태 변경 실패: " + error.message);
    return;
  }

  loadOrders();
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
  card.querySelector(".calc-final-total").textContent = finalTotal.toLocaleString();
}