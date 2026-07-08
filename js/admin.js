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

  groups.forEach(group => {
    let totalQty = 0;
    let totalPrice = 0;
    let itemHtml = "";

    group.items.forEach(item => {
      totalQty += item.qty;
      totalPrice += item.total;

      itemHtml += `
  <label class="pick-row check-row">
    <input type="checkbox">
    <strong>${item.item_number}</strong>
    <span>× ${item.qty}</span>
  </label>
`;
    });

    html += `
      <div class="product-card order-card ${group.status === "출고완료" ? "done" : ""}">
        <div class="order-top">
          <h2>${group.customerName || "거래처 미입력"}</h2>
          <span class="status-badge ${group.status === "출고완료" ? "done" : "pending"}">
            ${group.status}
          </span>
        </div>

        <p><strong>주문번호:</strong> ${group.orderNumber}</p>
        <p><strong>메모:</strong> ${group.memo || ""}</p>

        <div class="pick-list">${itemHtml}</div>

        <hr>

        <h2 class="total-qty">총 ${totalQty}개</h2>
        <p><strong>총금액:</strong> ${totalPrice.toLocaleString()}원</p>

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