const ADMIN_SESSION_KEY = "designjam_admin_session";
const CUSTOMER_SESSION_KEY = "designjam_customer_session";

const DESIGNJAM_ADMIN_EMAILS = new Set([
  "900smk@naver.com",
  "sm0727sm@hanmail.net",
  "p1028p@naver.com"
]);

function isDesignjamAdminEmail(email) {
  return DESIGNJAM_ADMIN_EMAILS.has(String(email || "").trim().toLowerCase());
}

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

  const emailAllowed = isDesignjamAdminEmail(data.user.email);
  const databaseAllowed = !customerError && customer?.is_admin === true && customer?.blocked !== true;

  if (!emailAllowed && !databaseAllowed) {
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
  const adminName = customer?.business_name || customer?.representative || data.user.email || "관리자";
  const adminProfile = JSON.stringify({ name: adminName, email: data.user.email || "", userId: data.user.id });
  sessionStorage.setItem("designjam_admin_profile", adminProfile);
  localStorage.setItem("designjam_admin_profile", adminProfile);

  // 관리자 로그인 성공 시 전체 관리자 메뉴로 이동
  location.replace("admin-home.html");
}

const adminOrders = document.getElementById("adminOrders");
const adminSearch = document.getElementById("adminSearch");
const adminCompletedPeriod = document.getElementById("adminCompletedPeriod");

let adminFilter = "주문접수";
let adminPage = 1;
const ADMIN_PAGE_SIZE = 50;
const requestedAdminStatus = new URLSearchParams(location.search).get("status");
if (["전체", "주문접수", "출고완료"].includes(requestedAdminStatus)) adminFilter = requestedAdminStatus;
let customerNotes = {};
let paymentAccounts = [];

if (adminSearch) adminSearch.addEventListener("input", () => { adminPage = 1; loadOrders(); });

function setAdminFilter(status) {
  adminFilter = status;
  adminPage = 1;
  syncAdminFilterTabs();
  loadOrders();
}

function syncAdminFilterTabs() {
  const map = { 주문접수: "tabPending", 출고완료: "tabDone", 전체: "tabAll" };
  document.querySelectorAll(".order-status-tab").forEach(btn => btn.classList.remove("active"));
  document.getElementById(map[adminFilter])?.classList.add("active");
  const toolbar = document.querySelector(".completed-toolbar");
  if (toolbar) toolbar.hidden = adminFilter !== "출고완료" && adminFilter !== "전체";
}

function setAdminPage(page) {
  adminPage = Math.max(1, Number(page) || 1);
  loadOrders();
  document.getElementById("adminOrders")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  await loadAdminFeatureData(data);

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
        customerId: order.customer_id,
        memo: order.memo,
        status: order.status,
        createdAt: order.created_at,
        shipping_fee: order.shipping_fee || 0,
        courier: order.courier || "로젠택배",
        tracking_number: order.tracking_number || "",
        paymentAccountId: order.payment_account_id || "",
        paymentAccountLabel: order.payment_account_label || "",
        paymentBankName: order.payment_bank_name || "",
        paymentAccountNumber: order.payment_account_number || "",
        paymentAccountHolder: order.payment_account_holder || "",
        isProxy: String(order.order_number||'').startsWith('ADMIN-') || String(order.memo||'').includes('[관리자 대신주문]'),
        pickingStatus: order.picking_status || '대기',
        items: []
      };
    }

    grouped[order.order_number].items.push(order);
    if (order.picking_status === '검증완료' || order.picking_status === '부분품절 검증완료') grouped[order.order_number].pickingStatus = order.picking_status;
    else if (order.picking_status === '피킹중' && !String(grouped[order.order_number].pickingStatus).includes('검증완료')) grouped[order.order_number].pickingStatus = '피킹중';
  });

  const groups = Object.values(grouped);

  document.getElementById("totalCount").textContent = groups.length;
  document.getElementById("pendingCount").textContent =
    groups.filter(g => g.status === "주문접수").length;
  document.getElementById("doneCount").textContent =
    groups.filter(g => g.status === "출고완료").length;

  const keyword = adminSearch?.value?.trim() || "";

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

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / ADMIN_PAGE_SIZE));
  if (adminPage > totalPages) adminPage = totalPages;
  const pageGroups = filteredGroups.slice((adminPage - 1) * ADMIN_PAGE_SIZE, adminPage * ADMIN_PAGE_SIZE);
  document.getElementById("orderResultCount").textContent = `${filteredGroups.length.toLocaleString()}건`;
  renderOrderCards(pageGroups);
  renderAdminPagination(totalPages);
  syncAdminFilterTabs();
}

function renderAdminPagination(totalPages) {
  const nav = document.getElementById("orderPagination");
  if (!nav) return;
  if (totalPages <= 1) { nav.innerHTML = ""; return; }
  const start = Math.max(1, adminPage - 2);
  const end = Math.min(totalPages, start + 4);
  let html = `<button type="button" ${adminPage === 1 ? "disabled" : ""} onclick="setAdminPage(${adminPage - 1})">이전</button>`;
  for (let i = start; i <= end; i++) html += `<button type="button" class="${i === adminPage ? "active" : ""}" onclick="setAdminPage(${i})">${i}</button>`;
  html += `<button type="button" ${adminPage === totalPages ? "disabled" : ""} onclick="setAdminPage(${adminPage + 1})">다음</button>`;
  nav.innerHTML = html;
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

function formatMobileOrderDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
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
let soldoutQty=0;

group.items.forEach(item => {
  const itemSoldout=Number(item.soldout_qty||0)||(item.is_soldout?Number(item.qty||0):0); soldoutQty+=itemSoldout; summaryQty += Math.max(0,Number(item.qty||0)-itemSoldout); summaryTotal += Math.max(0,Number(item.qty||0)-itemSoldout)*Number(item.price||0)*10;
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
          <strong>${item.item_number}${(Number(item.soldout_qty||0)>0||item.is_soldout)?` <small class="soldout-order-badge">${Number(item.soldout_qty||0)>0&&Number(item.soldout_qty||0)<Number(item.qty||0)?'일부품절 '+Number(item.soldout_qty||0)+'죽':'전체품절'}</small>`:''}</strong>
          <span>× ${item.qty}죽</span>
          <em>${rowTotal.toLocaleString()}원</em>
        </label>
      `;
    });

    html += `
      <div id="order-${index}" class="product-card order-card ${group.status === "출고완료" ? "done" : ""}" data-order-number="${escapeAdminAttr(group.orderNumber)}">
                <div class="order-header compact-order-header" onclick="toggleDetail('detail-${index}')">
  <div class="order-primary">
    <h2>${group.customerName || "거래처 미입력"} ${group.isProxy?'<small class="proxy-order-badge">관리자 대신주문</small>':''} ${soldoutQty>0?`<small class="soldout-order-badge">${soldoutQty}죽 품절</small>`:''}</h2>
    <p class="order-summary-number">${formatOrderDate(group.createdAt)} · ${group.orderNumber}</p>
  </div>
  <div class="order-compact-stats"><span>${group.items.length}품목</span><strong>${summaryQty}죽</strong><b>${summaryTotal.toLocaleString()}원</b></div>
  <div class="mobile-order-summary" aria-label="주문 요약">
    <span class="mobile-order-date">${formatMobileOrderDate(group.createdAt)}</span>
    <strong class="mobile-order-qty">${summaryQty}죽</strong>
    <b class="mobile-order-total">${summaryTotal.toLocaleString()}원</b>
  </div>
  <div class="order-status-stack">
    <span class="order-status-pill order-main-status ${isDone ? "done" : "pending"}">${group.status}</span>
    ${!isDone?`<span class="order-status-pill picking order-picking-status ${String(group.pickingStatus).includes("검증완료")?"done":"pending"}">${String(group.pickingStatus).includes("검증완료")?"출고대기":group.pickingStatus==="피킹중"?"피킹중":"피킹대기"}</span>`:""}
  </div>
  <span class="order-expand-icon" aria-hidden="true">⌄</span>
  ${customerNotes[group.orderNumber] ? `<span class="admin-note-badge">📝 ${escapeAdminHtml(customerNotes[group.orderNumber])}</span>` : ""}
</div>

<div
id="detail-${index}"
class="order-detail">

        <div class="pick-list">
          ${itemHtml}
        </div>

        <hr>

        <label class="shipping-label">관리자 메모</label>
        <input class="customer-note-input" type="text" value="${escapeAdminAttr(customerNotes[group.orderNumber] || "")}" placeholder="예: 전화요망, 합배송, 후불" onchange="saveOrderNote('${escapeAdminAttr(group.orderNumber)}', this.value, this)">

        <label class="shipping-label">배송비</label>
        
<input
  class="shipping-input"
  type="number"
  value="${group.shipping_fee || 0}"
  min="0"
  data-order="${group.orderNumber}"
  oninput="recalcOrderCard('order-${index}'); queueShippingSave('${escapeAdminAttr(group.orderNumber)}', this.closest('.order-detail'))"
  ${group.status === "출고완료" ? "disabled" : ""}
>

<label class="shipping-label">택배사</label>

<select 
  class="courier-select" 
  data-order="${group.orderNumber}"
  onchange="queueShippingSave('${escapeAdminAttr(group.orderNumber)}', this.closest('.order-detail'))"
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
  oninput="queueShippingSave('${escapeAdminAttr(group.orderNumber)}', this.closest('.order-detail'))"
  ${isDone ? "disabled" : ""}
>

        ${renderPaymentAccountEditor(group, index, isDone)}

        <h2 class="total-qty">출고수량: <span class="calc-qty">0</span>죽</h2>
        <p><strong>상품금액:</strong> <span class="calc-product-total">0</span>원</p>
        <p><strong>배송비:</strong> <span class="calc-shipping-fee">0</span>원</p>
        <h2 class="final-total">최종금액: <span class="calc-final-total">0</span>원</h2>

        <button
          class="cart-btn order-shipping-btn ${group.status === "출고완료" ? "undo-btn" : ""}"
          data-current-status="${group.status}" data-picking-status="${escapeAdminAttr(group.pickingStatus || '대기')}"
          onclick="toggleOrderStatus('${group.orderNumber}', '${group.status}', '${escapeAdminAttr(group.pickingStatus || '대기')}')"
          ${group.status !== "출고완료" && !String(group.pickingStatus || '').includes('검증완료') ? 'disabled title="피킹 최종검증 후 출고완료할 수 있습니다"' : ''}
        >
          ${group.status === "출고완료" ? "주문접수로 되돌리기" : String(group.pickingStatus || '').includes('검증완료') ? "출고완료" : "피킹검증 후 출고가능"}
        </button>

        <button class="cart-btn picking-btn" type="button" onclick="location.href='picking.html?order=${encodeURIComponent(group.orderNumber)}'">${String(group.pickingStatus || '').includes('검증완료') ? '피킹 결과 확인' : group.pickingStatus === '피킹중' ? '피킹 계속하기' : '피킹 시작'}</button>
        <button class="cart-btn work-print-btn" type="button" onclick="openWorkSheet('${group.orderNumber}')">작업지시서 출력</button>

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

async function toggleOrderStatus(orderNumber, currentStatus, pickingStatus='대기') {
  if (currentStatus !== '출고완료' && !String(pickingStatus).includes('검증완료')) { alert('피킹 최종검증을 먼저 완료해주세요.'); return; }
  const shippingInput = document.querySelector(
    `.shipping-input[data-order="${orderNumber}"]`
  );

  const courierSelect = document.querySelector(
    `.courier-select[data-order="${orderNumber}"]`
  );

  const trackingInput = document.querySelector(
    `.tracking-input[data-order="${orderNumber}"]`
  );

  const rawShippingFee = String(shippingInput?.value ?? "").trim();
  const shippingFee = Number(rawShippingFee) || 0;
  const courier = courierSelect?.value || "로젠택배";
  const trackingNumber = String(trackingInput?.value || "").trim();

  if (currentStatus !== "출고완료") {
    const missing = [];
    if (!rawShippingFee || shippingFee <= 0) missing.push("배송비");
    if (!trackingNumber) missing.push("송장번호");
    if (missing.length) {
      const proceed = confirm(`${missing.join("와 ")}가 입력되지 않았습니다.\n그래도 출고완료 처리할까요?`);
      if (!proceed) return;
    }
  }

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
    const qtyText = row.querySelector("span")?.textContent || "";
    const priceText = row.querySelector("em")?.textContent || "";

    // 화면 표시는 "3죽"이지만 계산에는 숫자만 사용합니다.
    const qty = Number(qtyText.replace(/[^0-9.-]/g, "")) || 0;
    const rowTotal = Number(priceText.replace(/[^0-9.-]/g, "")) || 0;

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

const orderShippingSaveTimers=new Map();
function queueShippingSave(orderNumber,detail){
  if(!orderNumber||!detail)return;
  clearTimeout(orderShippingSaveTimers.get(orderNumber));
  const timer=setTimeout(()=>persistShippingFields(orderNumber,detail),450);
  orderShippingSaveTimers.set(orderNumber,timer);
}
async function persistShippingFields(orderNumber,detail){
  const payload={
    shipping_fee:Number(detail.querySelector('.shipping-input')?.value)||0,
    courier:detail.querySelector('.courier-select')?.value||'로젠택배',
    tracking_number:detail.querySelector('.tracking-input')?.value.trim()||''
  };
  const fields=detail.querySelectorAll('.shipping-input,.courier-select,.tracking-input');
  fields.forEach(el=>el.classList.add('field-saving'));
  const {error}=await supabaseClient.from('orders').update(payload).eq('order_number',orderNumber);
  fields.forEach(el=>el.classList.remove('field-saving'));
  if(error){fields.forEach(el=>el.classList.add('field-save-error'));console.warn('배송정보 자동저장 실패',error);return;}
  fields.forEach(el=>{el.classList.remove('field-save-error');el.classList.add('field-save-success');setTimeout(()=>el.classList.remove('field-save-success'),900);});
}
window.queueShippingSave=queueShippingSave;

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

function openWorkSheet(orderNumber) {
  const url = `picking.html?order=${encodeURIComponent(orderNumber)}&print=1`;
  window.open(url, '_blank');
}
window.openWorkSheet = openWorkSheet;

let adminRealtimeTimer = null;
let adminRealtimeBusy = false;

function updateAdminOrderCardStatus(orderNumber, status, pickingStatus) {
  const card = Array.from(document.querySelectorAll('.order-card[data-order-number]'))
    .find(el => el.dataset.orderNumber === String(orderNumber));
  if (!card) return;

  const isDone = status === '출고완료';
  const isVerified = String(pickingStatus || '').includes('검증완료');
  card.classList.toggle('done', isDone);

  const mainPill = card.querySelector('.order-main-status');
  if (mainPill) {
    mainPill.textContent = status || '주문접수';
    mainPill.classList.toggle('done', isDone);
    mainPill.classList.toggle('pending', !isDone);
  }

  let pickingPill = card.querySelector('.order-picking-status');
  const statusStack = card.querySelector('.order-status-stack');
  if (isDone) {
    pickingPill?.remove();
  } else {
    if (!pickingPill && statusStack) {
      pickingPill = document.createElement('span');
      pickingPill.className = 'order-status-pill picking order-picking-status';
      statusStack.appendChild(pickingPill);
    }
    if (pickingPill) {
      pickingPill.textContent = isVerified ? '출고대기' : pickingStatus === '피킹중' ? '피킹중' : '피킹대기';
      pickingPill.classList.toggle('done', isVerified);
      pickingPill.classList.toggle('pending', !isVerified);
    }
  }

  const shippingBtn = card.querySelector('.order-shipping-btn');
  if (shippingBtn) {
    shippingBtn.dataset.currentStatus = status || '주문접수';
    shippingBtn.dataset.pickingStatus = pickingStatus || '대기';
    shippingBtn.disabled = !isDone && !isVerified;
    shippingBtn.title = shippingBtn.disabled ? '피킹 최종검증 후 출고완료할 수 있습니다' : '';
    shippingBtn.textContent = isDone ? '주문접수로 되돌리기' : isVerified ? '출고완료' : '피킹검증 후 출고가능';
    shippingBtn.classList.toggle('undo-btn', isDone);
    shippingBtn.onclick = () => toggleOrderStatus(orderNumber, status || '주문접수', pickingStatus || '대기');
  }
}

async function refreshAdminOrderStatuses() {
  if (adminRealtimeBusy || document.visibilityState !== 'visible') return;
  const orderNumbers = Array.from(document.querySelectorAll('.order-card[data-order-number]'))
    .map(el => el.dataset.orderNumber).filter(Boolean);
  if (!orderNumbers.length) return;
  adminRealtimeBusy = true;
  try {
    const { data, error } = await supabaseClient
      .from('orders')
      .select('order_number,status,picking_status')
      .in('order_number', orderNumbers);
    if (error) throw error;
    const latest = new Map();
    (data || []).forEach(row => {
      const current = latest.get(row.order_number) || { status: row.status || '주문접수', pickingStatus: '대기' };
      current.status = row.status || current.status;
      if (String(row.picking_status || '').includes('검증완료')) current.pickingStatus = row.picking_status;
      else if (row.picking_status === '피킹중' && !String(current.pickingStatus).includes('검증완료')) current.pickingStatus = '피킹중';
      latest.set(row.order_number, current);
    });
    latest.forEach((value, key) => updateAdminOrderCardStatus(key, value.status, value.pickingStatus));
  } catch (error) {
    console.warn('주문 상태 자동 확인 실패:', error);
  } finally {
    adminRealtimeBusy = false;
  }
}

function startAdminRealtimeRefresh() {
  if (!adminOrders || adminRealtimeTimer) return;
  // 전체 목록을 다시 그리지 않고 상태와 버튼만 갱신하여 화면 깜빡임과 상세 닫힘을 방지합니다.
  adminRealtimeTimer = window.setInterval(refreshAdminOrderStatuses, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshAdminOrderStatuses();
  });
  window.addEventListener('storage', event => {
    if (event.key === 'designjam_picking_verified') refreshAdminOrderStatuses();
  });
}

function openStatement(orderNumber) {
  const url =
    `statement.html?order=${encodeURIComponent(orderNumber)}`;

  window.open(url, "_blank");
}

async function initializeAdminPage() {
  const loginBox = document.getElementById("loginBox");
  const adminContent = document.getElementById("adminContent");

  const showLogin = () => {
    if (loginBox) loginBox.style.display = "block";
    if (adminContent) adminContent.style.display = "none";
  };
  const showAdmin = () => {
    if (loginBox) loginBox.style.display = "none";
    if (adminContent) adminContent.style.display = "block";
  };

  try {
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError) console.warn("관리자 세션 확인 오류:", userError);

    const sessionUserId = sessionStorage.getItem(ADMIN_SESSION_KEY);
    const savedUserId = localStorage.getItem(ADMIN_SESSION_KEY);
    const knownAdminEmail = isDesignjamAdminEmail(user?.email);
    const hasSavedAdminSession = Boolean(user && (sessionUserId === user.id || savedUserId === user.id));

    if (!user || (!hasSavedAdminSession && !knownAdminEmail)) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      localStorage.removeItem(ADMIN_SESSION_KEY);
      if (user) await supabaseClient.auth.signOut();
      showLogin();
      return;
    }

    sessionStorage.setItem(ADMIN_SESSION_KEY, user.id);
    localStorage.setItem(ADMIN_SESSION_KEY, user.id);

    const { data: customer, error: profileError } = await supabaseClient
      .from("customers")
      .select("is_admin, blocked")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) console.warn("관리자 권한 조회 오류:", profileError);

    const emailAllowed = isDesignjamAdminEmail(user.email);
    const databaseAllowed = customer?.is_admin === true && customer?.blocked !== true;

    if (!emailAllowed && !databaseAllowed) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      localStorage.removeItem(ADMIN_SESSION_KEY);
      await supabaseClient.auth.signOut();
      showLogin();
      return;
    }

    // 관리자 기본 진입은 항상 대시보드로 통일합니다.
    // 주문관리 링크에서 status 또는 view=orders를 명시한 경우에만 이 화면을 유지합니다.
    const params = new URLSearchParams(location.search);
    const openOrdersDirectly = params.has("status") || params.has("filter") || params.get("view") === "orders";
    if (!openOrdersDirectly) {
      location.replace("admin-home.html");
      return;
    }

    showAdmin();
    await loadOrders();
  } catch (error) {
    console.error("관리자 페이지 초기화 실패:", error);
    showLogin();
    const messageBox = document.getElementById("adminLoginMessage");
    if (messageBox) messageBox.innerHTML = '<p class="auth-error">화면을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.</p>';
  } finally {
    document.body.classList.add("auth-ready");
  }
}
initializeAdminPage();


function escapeAdminHtml(value){return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function escapeAdminAttr(value){return escapeAdminHtml(value)}
async function loadAdminFeatureData(orderRows=[]){
  try{
    const orderNumbers=[...new Set(orderRows.map(r=>r.order_number).filter(Boolean))];
    customerNotes={};
    if(orderNumbers.length){
      const {data,error}=await supabaseClient.from("admin_order_notes").select("order_number,note").in("order_number",orderNumbers);
      if(error) throw error;
      customerNotes=Object.fromEntries((data||[]).map(x=>[x.order_number,x.note||""]));
    }
  }catch(e){console.warn("주문별 관리자 메모 불러오기 실패",e)}
  try{
    const {data,error}=await supabaseClient.from("payment_accounts").select("*").eq("is_active",true).order("is_default",{ascending:false}).order("created_at",{ascending:true});
    if(error) throw error;
    paymentAccounts=data||[];
  }catch(e){console.warn("저장 계좌 불러오기 실패",e);paymentAccounts=[]}
}

function renderPaymentAccountEditor(group,index,isDone){
  const selectedId=group.paymentAccountId||paymentAccounts.find(a=>a.is_default)?.id||"";
  const hasManual=Boolean(group.paymentAccountNumber&&!group.paymentAccountId);
  const options=paymentAccounts.map(a=>`<option value="${escapeAdminAttr(a.id)}" ${selectedId===a.id&&!hasManual?"selected":""}>${escapeAdminHtml(a.label)} · ${escapeAdminHtml(a.bank_name)} ${escapeAdminHtml(a.account_number)} / ${escapeAdminHtml(a.account_holder)}</option>`).join("");
  const selectedAccount=paymentAccounts.find(a=>a.id===selectedId);
  const bank=hasManual?group.paymentBankName:(group.paymentBankName||selectedAccount?.bank_name||"");
  const number=hasManual?group.paymentAccountNumber:(group.paymentAccountNumber||selectedAccount?.account_number||"");
  const holder=hasManual?group.paymentAccountHolder:(group.paymentAccountHolder||selectedAccount?.account_holder||"");
  return `<section class="order-payment-account" data-order-account="${escapeAdminAttr(group.orderNumber)}">
    <label class="shipping-label">입금계좌</label>
    <select class="payment-account-select" onchange="changePaymentAccountMode(${index},this.value)" ${isDone?"disabled":""}>
      ${options||'<option value="">등록된 계좌 없음</option>'}
      <option value="__manual__" ${hasManual?"selected":""}>직접 입력</option>
    </select>
    <div id="manual-account-${index}" class="manual-account-fields ${hasManual?'show':''}">
      <input class="manual-bank-name" value="${escapeAdminAttr(bank)}" placeholder="은행명" oninput="updatePaymentAccountPreview(${index})" ${isDone?"disabled":""}>
      <input class="manual-account-number" value="${escapeAdminAttr(number)}" placeholder="계좌번호" oninput="updatePaymentAccountPreview(${index})" ${isDone?"disabled":""}>
      <input class="manual-account-holder" value="${escapeAdminAttr(holder)}" placeholder="예금주" oninput="updatePaymentAccountPreview(${index})" ${isDone?"disabled":""}>
    </div>
    <div class="selected-account-preview">${number?`현재 표시: ${escapeAdminHtml(bank)} ${escapeAdminHtml(number)} / ${escapeAdminHtml(holder)}`:'표시할 계좌를 선택하세요.'}</div>
    ${isDone?'':`<button type="button" class="cart-btn account-save-btn" onclick="saveOrderPaymentAccount('${escapeAdminAttr(group.orderNumber)}',${index})">이 주문에 계좌 저장</button>`}
  </section>`;
}
function updatePaymentAccountPreview(index){
  const detail=document.getElementById(`detail-${index}`);if(!detail)return;
  const select=detail.querySelector('.payment-account-select');
  const preview=detail.querySelector('.selected-account-preview');
  if(!select||!preview)return;
  let bank='',number='',holder='';
  if(select.value==='__manual__'){
    bank=detail.querySelector('.manual-bank-name')?.value.trim()||'';
    number=detail.querySelector('.manual-account-number')?.value.trim()||'';
    holder=detail.querySelector('.manual-account-holder')?.value.trim()||'';
  }else{
    const a=paymentAccounts.find(x=>x.id===select.value);
    bank=a?.bank_name||''; number=a?.account_number||''; holder=a?.account_holder||'';
  }
  preview.textContent=number?`선택한 계좌: ${bank} ${number} / ${holder}`:'표시할 계좌를 선택하세요.';
}
function changePaymentAccountMode(index,value){
  const box=document.getElementById(`manual-account-${index}`);if(!box)return;
  box.classList.toggle('show',value==='__manual__');
  if(value!=='__manual__'){
    const a=paymentAccounts.find(x=>x.id===value);if(!a)return;
    box.querySelector('.manual-bank-name').value=a.bank_name||'';
    box.querySelector('.manual-account-number').value=a.account_number||'';
    box.querySelector('.manual-account-holder').value=a.account_holder||'';
  }
  updatePaymentAccountPreview(index);
}
async function saveOrderPaymentAccount(orderNumber,index){
  const detail=document.getElementById(`detail-${index}`);if(!detail)return;
  const select=detail.querySelector('.payment-account-select');
  const manual=select?.value==='__manual__';
  let payload={payment_account_id:null,payment_account_label:'',payment_bank_name:'',payment_account_number:'',payment_account_holder:''};
  if(manual){
    payload.payment_bank_name=detail.querySelector('.manual-bank-name')?.value.trim()||'';
    payload.payment_account_number=detail.querySelector('.manual-account-number')?.value.trim()||'';
    payload.payment_account_holder=detail.querySelector('.manual-account-holder')?.value.trim()||'';
    payload.payment_account_label='직접 입력';
  }else{
    const a=paymentAccounts.find(x=>x.id===select?.value);
    if(a) payload={payment_account_id:a.id,payment_account_label:a.label||'',payment_bank_name:a.bank_name||'',payment_account_number:a.account_number||'',payment_account_holder:a.account_holder||''};
  }
  if(!payload.payment_bank_name||!payload.payment_account_number||!payload.payment_account_holder){alert('은행명, 계좌번호, 예금주를 모두 입력하거나 저장 계좌를 선택하세요.');return;}
  // 계좌 저장 시 같은 주문 화면에서 작성 중인 배송정보도 함께 저장합니다.
  // 이전에는 저장 후 주문목록을 다시 그리면서 상세화면이 닫히고,
  // 아직 출고완료 전인 배송비·택배사·송장번호 입력값이 사라졌습니다.
  const shippingInput=detail.querySelector('.shipping-input');
  const courierSelect=detail.querySelector('.courier-select');
  const trackingInput=detail.querySelector('.tracking-input');
  payload.shipping_fee=Number(shippingInput?.value)||0;
  payload.courier=courierSelect?.value||'로젠택배';
  payload.tracking_number=trackingInput?.value.trim()||'';

  const {error}=await supabaseClient.from('orders').update(payload).eq('order_number',orderNumber);
  if(error){alert('주문 계좌 저장 실패: V3-1-ORDER-ACCOUNT-SETUP.sql을 먼저 실행해주세요.\n'+error.message);return;}
  const preview=detail.querySelector('.selected-account-preview');
  if(preview){
    preview.textContent=`저장됨: ${payload.payment_bank_name} ${payload.payment_account_number} / ${payload.payment_account_holder}`;
    preview.classList.add('account-saved-preview');
  }
  const section=detail.querySelector('.order-payment-account');
  if(section){section.dataset.savedAccount=payload.payment_account_id||'manual';}
  const saveButton=detail.querySelector('.account-save-btn');
  if(saveButton){
    const originalText=saveButton.textContent;
    saveButton.textContent='저장 완료';
    saveButton.disabled=true;
    setTimeout(()=>{saveButton.textContent=originalText;saveButton.disabled=false;},1200);
  }
  alert('입금계좌와 현재 배송정보를 저장했습니다.');
  // 화면을 다시 불러오지 않아 상세 주문 화면과 입력값을 그대로 유지합니다.
}
window.changePaymentAccountMode=changePaymentAccountMode;window.updatePaymentAccountPreview=updatePaymentAccountPreview;window.saveOrderPaymentAccount=saveOrderPaymentAccount;

async function saveOrderNote(orderNumber,note,input){
  if(!orderNumber){alert("주문번호가 없어 메모를 저장할 수 없습니다.");return}
  const cleanNote=String(note||"").trim();
  const {error}=await supabaseClient.from("admin_order_notes").upsert({order_number:orderNumber,note:cleanNote,updated_at:new Date().toISOString()},{onConflict:"order_number"});
  if(error){
    alert("주문별 메모 저장 실패: V5.3.33-ADMIN-ORDER-NOTES.sql을 Supabase SQL Editor에서 먼저 실행해주세요.\n"+error.message);
    return;
  }
  customerNotes[orderNumber]=cleanNote;
  if(input){
    input.classList.add("note-save-success");
    setTimeout(()=>input.classList.remove("note-save-success"),900);
  }
  // 주문 목록을 다시 그리지 않아 열려 있는 상세화면과 배송 입력값을 유지합니다.
}
window.saveOrderNote=saveOrderNote;

// V6.2.3 주문관리 무깜빡임 실시간 상태 갱신
document.addEventListener("DOMContentLoaded", startAdminRealtimeRefresh);
