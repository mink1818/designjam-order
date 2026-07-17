const supabaseUrl = "https://dtjhuejmxrjkcxzvilgw.supabase.co";
const supabaseKey = "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

const activeOrderResult = document.getElementById("activeOrderResult");
const completedOrderResult = document.getElementById("completedOrderResult");
const completedPeriod = document.getElementById("completedPeriod");
let myOrderGroups = [];
let currentOrderUser = null;
let defaultPaymentAccount = null;
const CUSTOMER_SESSION_KEY = "designjam_customer_session";

completedPeriod?.addEventListener("change", renderMyOrders);

async function loadMyOrders() {
  activeOrderResult.innerHTML = "<p>내 주문을 불러오는 중...</p>";
  completedOrderResult.innerHTML = "";

  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  const sessionUserId = sessionStorage.getItem(CUSTOMER_SESSION_KEY);
  if (userError || !user || sessionUserId !== user.id) {
    sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
    if (user) await supabaseClient.auth.signOut();
    location.replace("login.html");
    return;
  }

  currentOrderUser = user;
  document.body.classList.add("auth-ready");
  try { const {data}=await supabaseClient.from("payment_accounts").select("*").eq("is_default",true).eq("is_active",true).maybeSingle(); defaultPaymentAccount=data||null; } catch(e) { console.warn(e); }

  const { data: customer, error: customerError } = await supabaseClient
    .from("customers")
    .select("business_name")
    .eq("id", user.id)
    .single();

  if (customerError || !customer) {
    activeOrderResult.innerHTML = "<p>거래처 정보를 불러오지 못했습니다.</p>";
    return;
  }

  const { data: idOrders, error: idOrderError } = await supabaseClient
    .from("orders")
    .select("*")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false });

  if (idOrderError) {
    activeOrderResult.innerHTML = `<p>조회 실패: ${escapeHtml(idOrderError.message)}</p>`;
    return;
  }

  let legacyOrders = [];
  if (customer.business_name) {
    const { data: nameOrders, error: nameOrderError } = await supabaseClient
      .from("orders")
      .select("*")
      .eq("customer_name", customer.business_name)
      .order("created_at", { ascending: false });

    if (!nameOrderError) legacyOrders = nameOrders || [];
  }

  const uniqueRows = new Map();
  [...(idOrders || []), ...legacyOrders].forEach(row => {
    const key = row.id || [row.order_number, row.item_number, row.created_at].join("|");
    uniqueRows.set(key, row);
  });
  const data = [...uniqueRows.values()];

  const grouped = {};
  (data || []).forEach(order => {
    if (!grouped[order.order_number]) {
      grouped[order.order_number] = {
        orderNumber: order.order_number,
        customerName: order.customer_name,
        memo: order.memo,
        status: order.status,
        shippingFee: order.shipping_fee || 0,
        courier: order.courier || "로젠택배",
        trackingNumber: order.tracking_number || "",
        paymentAccount: {
          id: order.payment_account_id || null,
          label: order.payment_account_label || "",
          bankName: order.payment_bank_name || "",
          accountNumber: order.payment_account_number || "",
          holder: order.payment_account_holder || ""
        },
        createdAt: order.created_at,
        items: []
      };
    }
    grouped[order.order_number].items.push(order);

    if (order.status === "출고완료") {
      grouped[order.order_number].status = "출고완료";
    } else if (grouped[order.order_number].status !== "출고완료" && order.status) {
      grouped[order.order_number].status = order.status;
    }

    if (new Date(order.created_at) > new Date(grouped[order.order_number].createdAt)) {
      grouped[order.order_number].createdAt = order.created_at;
    }
  });

  myOrderGroups = Object.values(grouped).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  renderMyOrders();
}

function renderMyOrders() {
  const activeGroups = myOrderGroups.filter(group => group.status !== "출고완료");
  const completedGroups = myOrderGroups.filter(group =>
    group.status === "출고완료" && isWithinPeriod(group.createdAt)
  );

  activeOrderResult.innerHTML = activeGroups.length
    ? `<h2 class="order-section-title">진행 중 주문</h2>${activeGroups.map(renderCompactActiveOrder).join("")}`
    : `<div class="product-card empty-order-card"><h2>진행 중인 주문이 없습니다</h2></div>`;

  completedOrderResult.innerHTML = completedGroups.length
    ? completedGroups.map(renderCompletedOrder).join("")
    : `<div class="product-card empty-order-card"><p>선택한 기간의 출고완료 주문이 없습니다.</p></div>`;
}

function isWithinPeriod(createdAt) {
  const value = completedPeriod?.value || "90";
  if (value === "all") return true;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return true;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - Number(value));
  return created >= cutoff;
}

function getOrderSummary(group) {
  let qtyTotal = 0;
  let productTotal = 0;
  const itemRows = group.items.map(item => {
    const isSoldout = item.is_soldout;
    const rowTotal = item.price * item.qty * 10;
    if (!isSoldout) {
      qtyTotal += item.qty;
      productTotal += rowTotal;
    }
    return `<div class="cart-item ${isSoldout ? "soldout-item" : ""}">
      <strong>${escapeHtml(item.item_number)}${isSoldout ? " 품절" : ""}</strong>
      <span>${item.qty}죽</span>
      <span>${isSoldout ? "-" : rowTotal.toLocaleString() + "원"}</span>
    </div>`;
  }).join("");

  return {
    qtyTotal,
    productTotal,
    finalTotal: productTotal + Number(group.shippingFee || 0),
    itemRows
  };
}


function safeOrderId(prefix, orderNumber) {
  return `${prefix}-${String(orderNumber).replace(/[^a-zA-Z0-9가-힣_-]/g, "-")}`;
}

function renderCompactActiveOrder(group) {
  const summary = getOrderSummary(group);
  const id = safeOrderId("active", group.orderNumber);
  return `<article class="completed-order-row active-order-row">
    <button class="completed-order-summary" type="button" onclick="toggleOrderDetail('${id}', this)">
      <span><strong>${formatDate(group.createdAt)}</strong><small>${escapeHtml(group.orderNumber)}</small></span>
      <span class="order-status-badge">${escapeHtml(group.status || "주문접수")}</span>
      <span>${summary.qtyTotal}죽</span>
      <span>${summary.finalTotal.toLocaleString()}원</span>
      <span class="completed-toggle">상세보기 ▼</span>
    </button>
    <div id="${id}" class="completed-order-detail">
      ${group.memo ? `<p><strong>메모:</strong> ${escapeHtml(group.memo)}</p>` : ""}
      ${summary.itemRows}
      <p><strong>상품금액:</strong> ${summary.productTotal.toLocaleString()}원</p>
      <p><strong>배송비:</strong> ${Number(group.shippingFee || 0).toLocaleString()}원</p>
      <p><strong>배송정보:</strong> 출고 준비 중입니다</p>
      ${renderOrderBankBox(group)}
      <button class="reorder-btn" type="button" onclick="copyOrderToCart('${group.orderNumber}')">이 주문 한 번에 다시 담기</button>
    </div>
  </article>`;
}

function renderFullOrder(group) {
  const summary = getOrderSummary(group);
  return `<div class="product-card order-history-card">
    <h2>${escapeHtml(group.customerName || "거래처")}</h2>
    <p><strong>주문일:</strong> ${formatDate(group.createdAt)}</p>
    <p><strong>주문번호:</strong> ${escapeHtml(group.orderNumber)}</p>
    <p><strong>상태:</strong> ${escapeHtml(group.status)}</p>
    <p><strong>메모:</strong> ${escapeHtml(group.memo || "")}</p>
    ${summary.itemRows}
    <hr>
    <h3>출고수량: ${summary.qtyTotal}죽</h3>
    <p><strong>상품금액:</strong> ${summary.productTotal.toLocaleString()}원</p>
    <p><strong>배송비:</strong> ${Number(group.shippingFee).toLocaleString()}원</p>
    <h2 class="price-text">최종금액: ${summary.finalTotal.toLocaleString()}원</h2>
    <p><strong>배송정보:</strong> 출고 준비 중입니다</p>
    ${renderOrderBankBox(group)}
    <button class="reorder-btn" type="button" onclick="copyOrderToCart('${group.orderNumber}')">이 주문 한 번에 다시 담기</button>
  </div>`;
}

function renderCompletedOrder(group) {
  const summary = getOrderSummary(group);
  const id = safeOrderId("completed", group.orderNumber);
  return `<article class="completed-order-row">
    <button class="completed-order-summary" type="button" onclick="toggleOrderDetail('${id}', this)">
      <span><strong>${formatDate(group.createdAt)}</strong><small>${escapeHtml(group.orderNumber)}</small></span>
      <span>${summary.qtyTotal}죽</span>
      <span>${summary.finalTotal.toLocaleString()}원</span>
      <span class="completed-toggle">상세보기 ▼</span>
    </button>
    <div id="${id}" class="completed-order-detail">
      ${summary.itemRows}
      <p><strong>배송비:</strong> ${Number(group.shippingFee).toLocaleString()}원</p>
      <p><strong>택배사:</strong> ${escapeHtml(group.courier)}</p>
      <p><strong>송장번호:</strong> ${escapeHtml(group.trackingNumber || "입력 전")}</p>
      ${group.memo ? `<p><strong>메모:</strong> ${escapeHtml(group.memo)}</p>` : ""}
      ${renderOrderBankBox(group)}
      <button class="reorder-btn" type="button" onclick="copyOrderToCart('${group.orderNumber}')">이 주문 한 번에 다시 담기</button>
    </div>
  </article>`;
}

function toggleOrderDetail(id, button) {
  const detail = document.getElementById(id);
  if (!detail) return;
  const isOpen = detail.classList.toggle("open");
  const toggle = button?.querySelector(".completed-toggle");
  if (toggle) toggle.textContent = isOpen ? "접기 ▲" : "상세보기 ▼";
}

function toggleCompletedOrder(id) {
  toggleOrderDetail(id, null);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadMyOrders();


function renderOrderBankBox(group){const saved=group?.paymentAccount||{};const b=saved.accountNumber?saved:{bankName:defaultPaymentAccount?.bank_name||"",accountNumber:defaultPaymentAccount?.account_number||"",holder:defaultPaymentAccount?.account_holder||""};if(!b.accountNumber)return "";return `<div class="bank-transfer-box"><strong>입금 계좌</strong><p>${escapeHtml(b.bankName||"")} ${escapeHtml(b.accountNumber||"")}</p><p>예금주: ${escapeHtml(b.holder||"")}</p></div>`}
function copyOrderToCart(orderNumber){
  const group=myOrderGroups.find(x=>x.orderNumber===orderNumber); if(!group||!currentOrderUser)return;
  const cart=group.items.filter(x=>!x.is_soldout).map(x=>({groupId:null,categoryId:null,title:"최근 주문",number:String(x.item_number),qty:Number(x.qty)||1,price:Number(x.price)||0,imageUrl:""}));
  if(!cart.length){alert("다시 담을 수 있는 상품이 없습니다.");return}
  localStorage.setItem(`designjam_cart_${currentOrderUser.id}`,JSON.stringify(cart));
  if(confirm(`${cart.length}개 품번을 장바구니에 담았습니다. 상품 주문 화면으로 이동할까요?`)) location.href="catalog.html";
}

window.toggleOrderDetail = toggleOrderDetail;
