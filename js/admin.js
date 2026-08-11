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
      .select("business_name, owner_name, is_admin, blocked")
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
  const adminName = customer?.business_name || customer?.owner_name || data.user.email || "관리자";
  const adminProfile = JSON.stringify({ name: adminName, email: data.user.email || "", userId: data.user.id });
  sessionStorage.setItem("designjam_admin_profile", adminProfile);
  localStorage.setItem("designjam_admin_profile", adminProfile);

  // 관리자 로그인 시간·기기·오늘 로그인 횟수를 실제 DB에 기록합니다.
  const deviceInfo = `${navigator.platform || "PC"} · ${window.innerWidth <= 768 ? "모바일" : "PC 웹"}`;
  const { error: loginRecordError } = await supabaseClient.rpc("record_admin_login", {
    p_device_info: deviceInfo,
    p_user_agent: navigator.userAgent || ""
  });
  if (loginRecordError) {
    console.warn("관리자 로그인 기록 저장 실패:", loginRecordError.message);
  }

  // 관리자 로그인 성공 시 전체 관리자 메뉴로 이동
  location.replace("admin-home.html");
}

const adminOrders = document.getElementById("adminOrders");
const adminSearch = document.getElementById("adminSearch");
const adminUrlParams = new URLSearchParams(location.search);

function currentAdminDisplayName() {
  try {
    const profile = JSON.parse(sessionStorage.getItem("designjam_admin_profile") || localStorage.getItem("designjam_admin_profile") || "{}");
    return String(profile.name || "").trim();
  } catch (_) {
    return "";
  }
}

function visibleOrderOwnerName(ownerName, isProxy) {
  const owner = String(ownerName || "").trim();
  if (!owner) return "";
  const adminName = currentAdminDisplayName();
  if (isProxy && adminName && owner.normalize("NFKC") === adminName.normalize("NFKC")) return "";
  return owner;
}
const requestedCustomerId = adminUrlParams.get("customer") || "";
if (adminSearch && adminUrlParams.get("search")) adminSearch.value = adminUrlParams.get("search");
const adminCompletedPeriod = document.getElementById("adminCompletedPeriod");
if (adminCompletedPeriod && adminUrlParams.get("period")) adminCompletedPeriod.value = adminUrlParams.get("period");

let adminFilter = "주문접수";
let adminPage = 1;
const ADMIN_PAGE_SIZE = 50;
const requestedAdminStatus = new URLSearchParams(location.search).get("status");
if (["전체", "주문접수", "출고대기", "출고완료"].includes(requestedAdminStatus)) adminFilter = requestedAdminStatus;
let customerNotes = {};
let orderRevisionMap = {};
let paymentAccounts = [];
let adminInventoryMap = new Map();
let adminInventoryAvailable = false;
let adminCustomerIdentityMap = new Map();

async function fetchCustomerIdentitySnapshot(){
  const rows=[];for(let from=0;;from+=1000){const {data,error}=await supabaseClient.from('customers').select('id,business_name,owner_name,phone,address').range(from,from+999);if(error)throw error;rows.push(...(data||[]));if(!data||data.length<1000)break}return rows;
}

function inventoryKey(value) {
  return String(value ?? "").trim().toUpperCase();
}

function setAdminInventorySnapshot(rows) {
  adminInventoryMap = new Map();
  adminInventoryAvailable = Array.isArray(rows);
  if (!rows) return;
  (rows || []).forEach(row => {
    const stock = Number(row.quantity || 0);
    const itemKey = inventoryKey(row.item_number);
    const barcodeKey = inventoryKey(row.barcode);
    if (itemKey) adminInventoryMap.set(itemKey, stock);
    if (barcodeKey) adminInventoryMap.set(barcodeKey, stock);
  });
}

function getAdminStockStatus(item) {
  if (!adminInventoryAvailable) return { warning: false, kind: "unknown", stock: null, text: "재고조회 불가" };
  const key = inventoryKey(item?.item_number);
  const registered = adminInventoryMap.has(key);
  const stock = registered ? Number(adminInventoryMap.get(key) || 0) : null;
  const ordered = Number(item?.qty || 0);
  if (!registered) return { warning: true, kind: "unregistered", stock: null, text: "ERP 재고 미등록" };
  if (stock <= 0) return { warning: true, kind: "empty", stock, text: "재고 없음" };
  if (stock < ordered) return { warning: true, kind: "short", stock, text: `재고 부족 ${stock}죽` };
  return { warning: false, kind: "enough", stock, text: `재고 ${stock}죽` };
}

if (adminSearch) adminSearch.addEventListener("input", () => { adminPage = 1; loadOrders(); });

function setAdminFilter(status) {
  adminFilter = status;
  adminPage = 1;
  syncAdminFilterTabs();
  loadOrders();
}

function syncAdminFilterTabs() {
  const map = { 주문접수: "tabPending", 출고대기: "tabReady", 출고완료: "tabDone", 전체: "tabAll" };
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
  const [orderRows, inventoryRows, customerRows] = await Promise.all([
    fetchOrders(),
    fetchInventorySnapshot(),
    fetchCustomerIdentitySnapshot()
  ]);
  // 관리자 주문화면은 현재 단가표가 아니라 주문 접수 당시 저장된 단가를 유지합니다.
  data = orderRows;
  adminCustomerIdentityMap=new Map((customerRows||[]).map(row=>[String(row.id),row]));
  setAdminInventorySnapshot(inventoryRows);
} catch (error) {
  adminOrders.innerHTML = `<p>주문 불러오기 실패: ${error.message}</p>`;
  return;
}

  await Promise.all([loadAdminFeatureData(data),loadCustomerOrderChangeAlerts()]);

  if (!data || data.length === 0) {
    adminOrders.innerHTML = "<div class='product-card'><h2>주문이 없습니다</h2></div>";
    return;
  }

  const grouped = {};

  data.forEach(order => {
    const customerProfile=adminCustomerIdentityMap.get(String(order.customer_id||''))||{};
    if (!grouped[order.order_number]) {
      const isProxyOrder = String(order.order_number||'').startsWith('ADMIN-') || String(order.memo||'').includes('[관리자 대신주문]');
      const ownerCandidate = order.customer_owner_name || customerProfile.owner_name || '';
      grouped[order.order_number] = {
        orderNumber: order.order_number,
        customerName: order.customer_name,
        customerOwnerName: visibleOrderOwnerName(ownerCandidate, isProxyOrder),
        deliveryName: order.delivery_name || order.customer_name || '',
        deliveryPhone: order.delivery_phone || customerProfile.phone || '',
        deliveryAddress: order.delivery_address || customerProfile.address || '',
        customerId: order.customer_id,
        memo: order.memo,
        status: order.status,
        revisionStatus: order.customer_revision_status || '',
        createdAt: order.created_at,
        completedAt: order.shipped_at || latestTimestamp(order.picking_verified_at,order.created_at),
        shipping_fee: order.shipping_fee || 0,
        courier: order.courier || "로젠택배",
        tracking_number: order.tracking_number || "",
        paymentAccountId: order.payment_account_id || "",
        paymentAccountLabel: order.payment_account_label || "",
        paymentBankName: order.payment_bank_name || "",
        paymentAccountNumber: order.payment_account_number || "",
        paymentAccountHolder: order.payment_account_holder || "",
        isProxy: isProxyOrder,
        pickingStatus: order.picking_status || '대기',
        items: []
      };
    }

    const currentGroup=grouped[order.order_number];
    if(order.customer_revision_status)currentGroup.revisionStatus=order.customer_revision_status;
    if(order.delivery_name&&(!currentGroup.deliveryName||currentGroup.deliveryName===currentGroup.customerName))currentGroup.deliveryName=order.delivery_name;
    if(order.delivery_phone&&!currentGroup.deliveryPhone)currentGroup.deliveryPhone=order.delivery_phone;
    if(order.delivery_address&&!currentGroup.deliveryAddress)currentGroup.deliveryAddress=order.delivery_address;
    currentGroup.completedAt=latestTimestamp(currentGroup.completedAt,order.shipped_at,order.picking_verified_at,order.created_at);
    currentGroup.items.push(order);
    if (order.picking_status === '검증완료' || order.picking_status === '부분품절 검증완료') grouped[order.order_number].pickingStatus = order.picking_status;
    else if (order.picking_status === '피킹중' && !String(grouped[order.order_number].pickingStatus).includes('검증완료')) grouped[order.order_number].pickingStatus = '피킹중';
  });

  const groups = Object.values(grouped);

  document.getElementById("totalCount").textContent = groups.length;
  document.getElementById("pendingCount").textContent =
    groups.filter(g => g.status === "주문접수" && !String(g.pickingStatus || "").includes("검증완료")).length;
  document.getElementById("readyCount").textContent =
    groups.filter(g => g.status === "주문접수" && String(g.pickingStatus || "").includes("검증완료")).length;
  document.getElementById("doneCount").textContent =
    groups.filter(g => g.status === "출고완료").length;

  const keyword = adminSearch?.value?.trim() || "";
  const normalizedKeyword=inventoryKey(keyword);const exactItemSearch=Boolean(keyword)&&groups.some(group=>group.items.some(item=>inventoryKey(item.item_number)===normalizedKeyword));

  const filteredGroups = groups
    .filter(group => {
      if (requestedCustomerId && String(group.customerId || "") !== requestedCustomerId) return false;
      const pickingVerified = String(group.pickingStatus || "").includes("검증완료");
      if (adminFilter === "출고대기" && !(group.status === "주문접수" && pickingVerified)) return false;
      if (adminFilter === "주문접수" && !(group.status === "주문접수" && !pickingVerified)) return false;
      if (!["전체","주문접수","출고대기"].includes(adminFilter) && group.status !== adminFilter) return false;

      if (group.status === "출고완료" && !isWithinCompletedPeriod(group.completedAt)) {
        return false;
      }

      if (!keyword) return true;

      const itemText = group.items.map(item => item.item_number).join(" ");

      if(exactItemSearch)return group.items.some(item=>inventoryKey(item.item_number)===normalizedKeyword);

      return (
        group.customerName?.includes(keyword) ||
        group.customerOwnerName?.includes(keyword) ||
        group.deliveryName?.includes(keyword) ||
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

async function loadCustomerOrderChangeAlerts(){
 const box=document.getElementById('customerOrderChangeAlerts');if(!box)return;
 const {data:{user}}=await supabaseClient.auth.getUser();if(!user){box.hidden=true;return}
 const {data,error}=await supabaseClient.from('app_notifications').select('id,title,message,created_at,link_url').eq('recipient_id',user.id).eq('is_read',false).ilike('title','고객 주문%').order('created_at',{ascending:false}).limit(20);
 if(error||!data?.length){box.hidden=true;box.innerHTML='';return}
 box.hidden=false;box.innerHTML=`<div class="customer-change-alert-head"><strong>🔔 고객 주문 변경 ${data.length}건</strong><button type="button" id="readAllCustomerChanges">모두 확인</button></div>${data.map(row=>`<button type="button" class="customer-change-alert-item" data-id="${escapeAdminAttr(row.id)}" data-link="${escapeAdminAttr(row.link_url||'admin.html?view=orders')}"><b>${escapeAdminHtml(row.title)}</b><span>${escapeAdminHtml(row.message||'')}</span><small>${new Date(row.created_at).toLocaleString('ko-KR')}</small></button>`).join('')}`;
 box.querySelectorAll('.customer-change-alert-item').forEach(button=>button.onclick=async()=>{await supabaseClient.from('app_notifications').update({is_read:true}).eq('id',button.dataset.id);location.href=button.dataset.link||'admin.html?view=orders'});
 box.querySelector('#readAllCustomerChanges').onclick=async()=>{await supabaseClient.from('app_notifications').update({is_read:true}).in('id',data.map(row=>row.id));loadCustomerOrderChangeAlerts()};
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

function latestTimestamp(...values){return values.filter(Boolean).sort((a,b)=>new Date(b)-new Date(a))[0]||''}
function isWithinCompletedPeriod(completedAt) {
  const value = adminCompletedPeriod?.value || "30";
  if (value === "all") return true;

  const completed = new Date(completedAt);
  if (Number.isNaN(completed.getTime())) return true;

  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  if(value === "today") return completed >= cutoff;
  cutoff.setDate(cutoff.getDate() - Number(value));
  return completed >= cutoff;
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

function canEditOrderItems(group) {
  return group.status !== "출고완료" &&
    !group.revisionStatus &&
    !String(group.pickingStatus || "").includes("검증완료") &&
    group.pickingStatus !== "피킹중" &&
    group.items.every(item => Number(item.picked_qty || 0) === 0 && Number(item.soldout_qty || 0) === 0 && !item.is_soldout);
}

function revisionSnapshotMap(snapshot){const map=new Map();(Array.isArray(snapshot)?snapshot:[]).forEach(item=>{const warehouse=String(item.warehouse_code||'').toUpperCase(),number=String(item.item_number||'').trim();map.set(`${warehouse}|${number}`,{warehouse,number,qty:Number(item.qty||0)})});return map}
function renderOrderRevisionPanel(group){
 const state=group.revisionStatus;if(!state)return'';const revision=group.revisionRecord||{},before=revisionSnapshotMap(revision.original_snapshot),after=revisionSnapshotMap(revision.revised_snapshot),keys=[...new Set([...before.keys(),...after.keys()])].sort((a,b)=>a.localeCompare(b,'ko',{numeric:true}));
 const changes=keys.map(key=>{const oldItem=before.get(key),newItem=after.get(key),label=`${newItem?.warehouse||oldItem?.warehouse?`${newItem?.warehouse||oldItem?.warehouse}-`:''}${newItem?.number||oldItem?.number||'-'}`;if(!oldItem)return`<li class="revision-added"><b>${escapeAdminHtml(label)}</b> 신규 ${newItem.qty}죽</li>`;if(!newItem)return`<li class="revision-deleted"><b>${escapeAdminHtml(label)}</b> ${oldItem.qty}죽 → 삭제</li>`;if(oldItem.qty!==newItem.qty)return`<li class="revision-changed"><b>${escapeAdminHtml(label)}</b> ${oldItem.qty}죽 → ${newItem.qty}죽</li>`;return''}).filter(Boolean).join('');
 return `<section class="customer-revision-panel ${state==='수정완료'?'complete':'editing'}"><h3>${state==='수정중'?'✏️ 고객이 주문 수정중입니다':'🔔 고객 주문 수정완료·변경확인 필요'}</h3>${state==='수정완료'?`<ul>${changes||'<li>수량 변경 없이 주문정보를 수정했습니다.</li>'}</ul><button type="button" class="cart-btn revision-confirm-button" onclick="confirmCustomerOrderRevision('${escapeAdminAttr(group.orderNumber)}')">변경사항 확인·재피킹 허용</button>`:'<p>고객이 수정 완료할 때까지 피킹할 수 없습니다.</p>'}</section>`;
}
async function confirmCustomerOrderRevision(orderNumber){if(!confirm('변경사항을 확인했습니까?\n확인 후 이 주문을 다시 피킹할 수 있습니다.'))return;const {error}=await supabaseClient.rpc('admin_confirm_order_revision',{p_order_number:orderNumber});if(error)return alert('변경확인 실패: '+error.message+'\n\nV6.5.63 SQL 실행 여부를 확인해주세요.');alert('변경사항 확인완료\n이제 다시 피킹할 수 있습니다.');await loadOrders()}
window.confirmCustomerOrderRevision=confirmCustomerOrderRevision;

function renderOrderItemEditor(group, index) {
  if (!canEditOrderItems(group)) return `<p class="order-edit-locked">피킹을 시작하거나 검증한 주문은 피킹 초기화 후 품목을 수정할 수 있습니다.</p>`;
  const rows = group.items.map(item => {
    const displayNumber = item.warehouse_code ? `${String(item.warehouse_code).toUpperCase()}-${item.item_number}` : item.item_number;
    return `<div class="order-edit-item-row" data-order-edit-row data-id="${Number(item.id)}">
      <input class="order-edit-number" type="text" value="${escapeAdminAttr(displayNumber)}" placeholder="품번(예: S-1001)">
      <input class="order-edit-qty" type="number" min="1" step="1" value="${Number(item.qty || 1)}" aria-label="수량(죽)">
      <input class="order-edit-price" type="number" min="0" step="50" value="${Number(item.price || 0)}" aria-label="1죽 단가">
      <input class="order-edit-row-total" type="number" min="0" step="1" value="${Number(item.qty || 0) * Number(item.price || 0)}" aria-label="금액">
      <button class="order-edit-remove-new" type="button" onclick="this.closest('[data-order-edit-row]').remove()">삭제</button>
    </div>`;
  }).join("");
  return `<section id="order-item-editor-${index}" class="order-item-editor" hidden>
    <div class="order-edit-head"><span>품번</span><span>수량(죽)</span><span>단가(1죽)</span><span>금액</span><span>관리</span></div>
    <div class="order-edit-rows">${rows}</div>
    <div class="order-edit-actions">
      <button type="button" onclick="addOrderItemEditRow(${index})">+ 없는 품번 추가</button>
      <button type="button" class="order-edit-save" onclick="saveOrderItems('${escapeAdminAttr(group.orderNumber)}',${index})">주문 품목 저장</button>
    </div>
    <small>여기서 수정하면 작업지시서·피킹검증·거래명세서에 같이 반영됩니다.</small>
  </section>`;
}

function getOrderWarehouseCode(item) {
  const saved = String(item?.warehouse_code || "").trim().toUpperCase();
  if (["S", "B", "I"].includes(saved)) return saved;
  const match = String(item?.item_number || "").trim().toUpperCase().match(/^([SBI])(?:[-\s]|(?=\d))/);
  return match ? match[1] : "기타";
}

function getOrderWarehouseLabel(code) {
  return code === "S" ? "S 출고지" : code === "B" ? "B 출고지" : code === "I" ? "I 출고지" : "기타 출고지";
}

function getOrderWarehouseSections(items) {
  const order = ["S", "B", "I", "기타"];
  const map = new Map(order.map(code => [code, []]));
  (items || []).forEach(item => (map.get(getOrderWarehouseCode(item)) || map.get("기타")).push(item));
  return order.map(code => ({ code, label: getOrderWarehouseLabel(code), items: map.get(code) })).filter(section => section.items.length);
}

function fallbackCopyWithoutJump(text) {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const focused = document.activeElement;
  const area = document.createElement("textarea");
  area.value = text;
  area.readOnly = true;
  area.setAttribute("aria-hidden", "true");
  area.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none;z-index:-1";
  document.body.appendChild(area);
  area.focus({ preventScroll: true });
  area.select();
  area.setSelectionRange(0, area.value.length);
  const copied = document.execCommand("copy");
  area.remove();
  window.scrollTo(scrollX, scrollY);
  if (focused && typeof focused.focus === "function") focused.focus({ preventScroll: true });
  return copied;
}

function formatOrderCopyRows(rows,mode='excel'){
  if(mode==='kakao')return rows.map(row=>`${formatCopiedItemNumber(row.dataset.copyItem)}            ${row.dataset.copyQty}`).join('\n');
  return rows.map(row=>`${formatCopiedItemNumber(row.dataset.copyItem)}\t${row.dataset.copyQty}`).join('\n');
}

function formatCopiedItemNumber(value){const clean=String(value||'').trim().replace(/^([SBI])[-_\s]+(?=[A-Z0-9])/i,'');if(/A$/i.test(clean))return`${clean.slice(0,-1)} 아동`;if(/M$/i.test(clean))return`${clean.slice(0,-1)} 무지`;return clean}

async function copyWarehouseOrder(button, event, mode='excel') {
  event?.preventDefault();
  event?.stopPropagation();
  const section = button.closest(".admin-warehouse-section");
  const rows = [...section.querySelectorAll(".pick-row[data-copy-item]")];
  const text = formatOrderCopyRows(rows,mode);
  if (!text) return alert("복사할 품번이 없습니다.");
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(text);
  } catch (_) {
    if (!fallbackCopyWithoutJump(text)) return alert("복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
  }
  const original = button.textContent;
  button.textContent = `${rows.length}품번 복사완료`;
  button.classList.add("copied");
  setTimeout(() => { button.textContent = original; button.classList.remove("copied"); }, 1600);
}

async function copyAllWarehouseOrders(button, event, mode='excel') {
  event?.preventDefault();
  event?.stopPropagation();
  const card = button.closest('.order-card');
  if (!card) return;
  const rows = [...card.querySelectorAll('.admin-warehouse-section .pick-row[data-copy-item]')];
  if (!rows.length) return alert('복사할 S·B·I 주문이 없습니다.');
  const text = formatOrderCopyRows(rows,mode);
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(text);
  } catch (_) {
    if (!fallbackCopyWithoutJump(text)) return alert('복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.');
  }
  const original = button.textContent;
  button.textContent = 'S·B·I 전체 복사완료';
  button.classList.add('copied');
  setTimeout(() => { button.textContent = original; button.classList.remove('copied'); }, 1600);
}

async function copyOrderDetails(button,event,mode='excel'){
 event?.preventDefault();event?.stopPropagation();const card=button.closest('.order-card');if(!card)return;
 const rows=[...card.querySelectorAll('.pick-row[data-copy-item]')].map(row=>({item:formatCopiedItemNumber(row.dataset.copyItem),qty:Number(row.dataset.copyQty||0),price:Number(row.dataset.unitPrice||0)}));
 if(!rows.length)return alert('복사할 주문 품목이 없습니다.');
 const text=mode==='kakao'?rows.map(row=>`${row.item}      ${row.qty}죽      ${row.price.toLocaleString()}원      ${(row.qty*row.price).toLocaleString()}원`).join('\n'):['품번\t수량(죽)\t단가(1죽)\t금액',...rows.map(row=>`${row.item}\t${row.qty}\t${row.price}\t${row.qty*row.price}`)].join('\n');
 try{if(!navigator.clipboard?.writeText)throw new Error();await navigator.clipboard.writeText(text)}catch(_){if(!fallbackCopyWithoutJump(text))return alert('복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.')}
 const original=button.textContent;button.textContent='상세 복사완료';setTimeout(()=>button.textContent=original,1600);
}

function renderOrderCards(groups) {
  if (groups.length === 0) {
    adminOrders.innerHTML = "<div class='product-card'><h2>검색 결과가 없습니다</h2></div>";
    return;
  }

  let html = "";

  groups.forEach((group, index) => {
    group.revisionRecord=orderRevisionMap[group.orderNumber]||null;
    const isDone = group.status === "출고완료";
    let itemHtml = "";
    let summaryQty = 0;
let summaryTotal = 0;
let soldoutQty=0;

group.items.forEach(item => {
  const itemSoldout=Number(item.soldout_qty||0)||(item.is_soldout?Number(item.qty||0):0); soldoutQty+=itemSoldout; summaryQty += Math.max(0,Number(item.qty||0)-itemSoldout); summaryTotal += Math.max(0,Number(item.qty||0)-itemSoldout)*Number(item.price||0);
});

summaryTotal += Number(group.shipping_fee || 0);

    getOrderWarehouseSections(group.items).forEach(section => {
      const sectionOrderedQty = section.items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
      const sectionSoldoutQty = section.items.reduce((sum, item) => {
        const ordered = Number(item.qty || 0);
        return sum + Math.min(ordered, Number(item.soldout_qty || (item.is_soldout ? ordered : 0)));
      }, 0);
      const sectionQty = Math.max(0, sectionOrderedQty - sectionSoldoutQty);
      const sectionTotal = section.items.reduce((sum, item) => {
        const ordered = Number(item.qty || 0);
        const soldout = Math.min(ordered, Number(item.soldout_qty || (item.is_soldout ? ordered : 0)));
        return sum + Math.max(0, ordered - soldout) * Number(item.price || 0);
      }, 0);
      itemHtml += `<div class="admin-warehouse-section warehouse-${section.code.toLowerCase()}">
        <div class="admin-warehouse-heading"><strong>${section.label}</strong><span class="admin-warehouse-heading-actions"><small>${section.items.length}품번 · 출고 ${sectionQty}죽${sectionSoldoutQty?` · 품절 ${sectionSoldoutQty}죽`:''} · 합계 ${sectionTotal.toLocaleString()}원</small><span class="copy-button-pair"><button type="button" class="warehouse-copy-button" onclick="copyWarehouseOrder(this,event,'kakao')">카톡용 복사</button><button type="button" class="warehouse-copy-button excel-copy-button" onclick="copyWarehouseOrder(this,event,'excel')">엑셀용 복사</button></span></span></div>`;
      section.items.forEach(item => {
        const oneJukPrice = Number(item.price || 0);
        const orderedQty = Number(item.qty || 0);
        const itemSoldoutQty = Math.min(orderedQty, Number(item.soldout_qty || (item.is_soldout ? orderedQty : 0)));
        const shippedQty = Math.max(0, orderedQty - itemSoldoutQty);
        const rowTotal = oneJukPrice * shippedQty;
        const stockStatus = getAdminStockStatus(item);

        itemHtml += `
        <label class="pick-row stock-row ${!isDone && stockStatus.warning ? `inventory-warning ${stockStatus.kind}` : ""}" data-qty="${orderedQty}" data-soldout-qty="${itemSoldoutQty}" data-unit-price="${oneJukPrice}" data-row-total="${rowTotal}" data-copy-item="${escapeAdminAttr(item.warehouse_code?`${String(item.warehouse_code).toUpperCase()}-${item.item_number}`:item.item_number)}" data-copy-qty="${shippedQty}">
          <input 
  type="checkbox" 
  ${item.is_soldout ? "checked" : ""}
  ${group.status === "출고완료" || String(group.pickingStatus || '').includes('검증완료') ? "disabled" : ""}
  onchange="toggleSoldout(${item.id}, this.checked); recalcOrderCard('order-${index}')"
>
          <strong>${item.warehouse_code?`${escapeAdminHtml(String(item.warehouse_code).toUpperCase())}-`:''}${item.item_number}${(Number(item.soldout_qty||0)>0||item.is_soldout)?` <small class="soldout-order-badge">${Number(item.soldout_qty||0)>0&&Number(item.soldout_qty||0)<Number(item.qty||0)?'일부품절 '+Number(item.soldout_qty||0)+'죽':'전체품절'}</small>`:''}${!isDone && stockStatus.warning?` <small class="inventory-warning-badge ${stockStatus.kind}">⚠ ${stockStatus.text}</small>`:''}</strong>
          <span class="admin-item-pricing"><b>출고 ${shippedQty}죽</b>${itemSoldoutQty?`<small>주문 ${orderedQty}죽 · 품절 ${itemSoldoutQty}죽</small>`:''}<small>단가 ${oneJukPrice.toLocaleString()}원 / 1죽</small></span>
          <em>출고금액 ${rowTotal.toLocaleString()}원</em>
        </label>
      `;
      });
      itemHtml += `</div>`;
    });

    html += `
      <div id="order-${index}" class="product-card order-card ${group.status === "출고완료" ? "done" : ""}" data-order-number="${escapeAdminAttr(group.orderNumber)}" data-revision-status="${escapeAdminAttr(group.revisionStatus||'')}">
                <div class="order-header compact-order-header" onclick="toggleDetail('detail-${index}')">
  <div class="order-primary">
    <h2>${group.customerName || "거래처 미입력"} ${!group.isProxy&&group.customerOwnerName?`<small class="customer-owner-name">대표자 ${escapeAdminHtml(group.customerOwnerName)}</small>`:''} ${group.isProxy?'<small class="proxy-order-badge">관리자 대신주문</small>':''} ${soldoutQty>0?`<small class="soldout-order-badge">${soldoutQty}죽 품절</small>`:''} ${!isDone&&group.items.some(item=>getAdminStockStatus(item).warning)?`<small class="inventory-order-alert">⚠ 재고부족 ${group.items.filter(item=>getAdminStockStatus(item).warning).length}품번</small>`:''}</h2>
    <p class="order-delivery-preview"><strong>납품처</strong> ${escapeAdminHtml(group.deliveryName||group.customerName||'-')}</p>
    <p class="order-summary-number">${formatOrderDate(group.createdAt)} · ${group.orderNumber}</p>
  </div>
  <div class="order-compact-stats"><span>${group.items.length}품목</span><strong>${summaryQty}죽</strong><b>${summaryTotal.toLocaleString()}원</b></div>
  <div class="mobile-order-summary" aria-label="주문 요약">
    <span class="mobile-order-date">${formatMobileOrderDate(group.createdAt)}</span>
    <strong class="mobile-order-qty">${summaryQty}죽</strong>
    <b class="mobile-order-total">${summaryTotal.toLocaleString()}원</b>
  </div>
  <div class="order-status-stack">
    <span class="order-status-pill order-main-status ${isDone ? "done" : "pending"}">${group.revisionStatus==='수정중'?'고객 수정중':group.revisionStatus==='수정완료'?'고객 수정완료':group.status}</span>
    ${!isDone?`<span class="order-status-pill picking order-picking-status ${String(group.pickingStatus).includes("검증완료")?"done":"pending"}">${String(group.pickingStatus).includes("검증완료")?"출고대기":group.pickingStatus==="피킹중"?"피킹중":"피킹대기"}</span>`:""}
    <button class="order-card-edit-button ${canEditOrderItems(group) ? "" : "locked"}" type="button" onclick="event.stopPropagation();prepareOrderItemEditor('${escapeAdminAttr(group.orderNumber)}',${index},${canEditOrderItems(group)},${isDone})">${isDone ? "수정불가" : "주문수정"}</button>
  </div>
  <span class="order-expand-icon" aria-hidden="true">⌄</span>
  ${customerNotes[group.orderNumber] ? `<span class="admin-note-badge">📝 ${escapeAdminHtml(customerNotes[group.orderNumber])}</span>` : ""}
</div>

<div
id="detail-${index}"
class="order-detail">

        ${renderOrderRevisionPanel(group)}

        ${canEditOrderItems(group) ? `<button class="cart-btn order-items-edit-toggle" type="button" onclick="toggleOrderItemEditor(${index})">품번·수량·단가 수정</button>` : ""}
        ${renderOrderItemEditor(group, index)}

        <div class="order-party-summary"><p><strong>거래처명</strong> ${escapeAdminHtml(group.customerName||'-')}${!group.isProxy?` · <strong>대표자명</strong> ${escapeAdminHtml(group.customerOwnerName||'-')}`:' · <strong>관리자 대신주문</strong>'}</p><p><strong>납품처명</strong> ${escapeAdminHtml(group.deliveryName||'-')}${group.deliveryPhone?` · ${escapeAdminHtml(group.deliveryPhone)}`:''}</p>${group.deliveryAddress?`<p><strong>납품주소</strong> ${escapeAdminHtml(group.deliveryAddress)}</p>`:''}</div>
        <div class="order-copy-all-row"><span class="copy-button-pair"><button type="button" class="warehouse-copy-button all-warehouse-copy-button" onclick="copyAllWarehouseOrders(this,event,'kakao')">S·B·I 카톡용 전체복사</button><button type="button" class="warehouse-copy-button all-warehouse-copy-button excel-copy-button" onclick="copyAllWarehouseOrders(this,event,'excel')">S·B·I 엑셀용 전체복사</button><button type="button" class="warehouse-copy-button" onclick="copyOrderDetails(this,event,'kakao')">품번·수량·단가 카톡복사</button><button type="button" class="warehouse-copy-button excel-copy-button" onclick="copyOrderDetails(this,event,'excel')">품번·수량·단가 엑셀복사</button></span><small>상세복사는 품번·출고수량·1죽 단가·금액을 함께 복사합니다.</small></div>
        <div class="pick-list">
          ${itemHtml}
        </div>

        <hr>

        <label class="shipping-label">관리자 메모</label>
        <textarea class="customer-note-input" rows="3" maxlength="1000" placeholder="예: 전화요망, 합배송, 후불&#10;Enter를 눌러 다음 줄에 계속 작성할 수 있습니다." onchange="saveOrderNote('${escapeAdminAttr(group.orderNumber)}', this.value, this)">${escapeAdminHtml(customerNotes[group.orderNumber] || "")}</textarea>

        <label class="shipping-label">배송비</label>
<div class="shipping-fee-control">
  <button type="button" class="shipping-step-btn" onclick="adjustShippingFee(this,-500)" ${isDone ? "disabled" : ""}>-500원</button>
  <input
    class="shipping-input"
    type="number"
    step="500"
    value="${group.shipping_fee || 0}"
    min="0"
    data-order="${group.orderNumber}"
    oninput="recalcOrderCard('order-${index}'); queueShippingSave('${escapeAdminAttr(group.orderNumber)}', this.closest('.order-detail'))"
    ${group.status === "출고완료" ? "disabled" : ""}
  >
  <button type="button" class="shipping-step-btn" onclick="adjustShippingFee(this,500)" ${isDone ? "disabled" : ""}>+500원</button>
</div>

<label class="shipping-label">택배사</label>
<div class="courier-control">
<select 
  class="courier-select" 
  data-order="${group.orderNumber}"
  onchange="handleCourierChange(this)"
  ${isDone ? "disabled" : ""}
>
  ${['로젠택배','CJ대한통운','한진택배','우체국택배','롯데택배','경동택배'].map(name=>`<option value="${name}" ${group.courier===name?'selected':''}>${name}</option>`).join('')}
  <option value="__custom__" ${group.courier && !['로젠택배','CJ대한통운','한진택배','우체국택배','롯데택배','경동택배'].includes(group.courier)?'selected':''}>직접 입력</option>
</select>
<input class="courier-custom-input" type="text" maxlength="50" placeholder="택배사명 직접 입력" value="${group.courier && !['로젠택배','CJ대한통운','한진택배','우체국택배','롯데택배','경동택배'].includes(group.courier)?escapeAdminAttr(group.courier):''}" ${group.courier && !['로젠택배','CJ대한통운','한진택배','우체국택배','롯데택배','경동택배'].includes(group.courier)?'':'hidden'} oninput="queueShippingSave('${escapeAdminAttr(group.orderNumber)}', this.closest('.order-detail'))" ${isDone ? "disabled" : ""}>
</div>

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
          ${group.status === "출고완료" ? "출고취소·재고복원" : String(group.pickingStatus || '').includes('검증완료') ? "출고완료" : "피킹검증 후 출고가능"}
        </button>

        <button class="cart-btn picking-btn" type="button" ${group.revisionStatus?'disabled title="고객 주문변경 확인을 먼저 완료해주세요"':''} onclick="event.stopPropagation();location.href='picking.html?order=${encodeURIComponent(group.orderNumber)}'">${group.revisionStatus==='수정중'?'고객 수정중':group.revisionStatus==='수정완료'?'변경확인 후 피킹가능':String(group.pickingStatus || '').includes('검증완료') ? '피킹 결과 확인' : group.pickingStatus === '피킹중' ? '피킹 계속하기' : '피킹 시작'}</button>
        ${String(group.pickingStatus || '').includes('검증완료') ? `<button class="cart-btn picking-edit-btn" type="button" onclick="editVerifiedPicking('${escapeAdminAttr(group.orderNumber)}')">일부품절·피킹수량 수정</button>` : ''}
        <button class="cart-btn work-print-btn" type="button" onclick="openWorkSheet('${group.orderNumber}')">출고지별 작업지시서 출력</button>

        <button
  class="cart-btn statement-btn"
  type="button"
  onclick="openStatement('${group.orderNumber}')"
>
  거래명세서 출력
</button>
        ${canEditOrderItems(group)?`<button class="cart-btn admin-delete-order-btn" type="button" onclick="deleteOrderFromAdmin(decodeURIComponent('${encodeURIComponent(group.orderNumber)}'),decodeURIComponent('${encodeURIComponent(group.customerName || '거래처 미입력')}'),${group.items.length})">피킹 전 주문 전체삭제</button>`:`<p class="order-delete-locked">피킹을 시작한 주문은 바로 삭제할 수 없습니다.</p>`}
      </div>
      </div>
    `;
  });

  adminOrders.innerHTML = html;

  groups.forEach((_, index) => {
    recalcOrderCard(`order-${index}`);
  });
}

async function deleteOrderFromAdmin(orderNumber, customerName, itemCount) {
  if (!confirm(`주문 전체삭제\n\n거래처: ${customerName}\n주문번호: ${orderNumber}\n품번: ${Number(itemCount || 0)}개\n\n주문 화면에서는 삭제되며 원본은 삭제 주문 이력에 보관됩니다. 계속할까요?`)) return;
  if (!confirm(`정말 삭제할까요?\n삭제 후 관리자 메인의 삭제 주문 이력에서 원본을 확인할 수 있습니다.\n\n${orderNumber}`)) return;
  try {
    const { data, error } = await supabaseClient.rpc("delete_order_and_restore_inventory", {
      p_order_number: orderNumber,
      p_device_name: "주문관리 주문 전체삭제"
    });
    if (error) throw error;
    alert(`${customerName} 피킹 전 주문을 전체삭제했습니다.`);
    await loadOrders();
  } catch (error) {
    alert(`주문 전체삭제 실패: ${error.message}\n\nSupabase에서 SQL/V6.5.28-PRE-PICK-ORDER-MANAGEMENT.sql을 먼저 실행했는지 확인해주세요.`);
  }
}

async function toggleOrderStatus(orderNumber, currentStatus, pickingStatus='대기') {
  if (currentStatus !== '출고완료' && !String(pickingStatus).includes('검증완료')) { alert('피킹 최종검증을 먼저 완료해주세요.'); return; }

  if (currentStatus === "출고완료") {
    const proceed = confirm(
      "출고완료를 취소하면 ERP 재고가 복원되고 피킹수량이 초기화됩니다.\n" +
      "기존 출고이력은 보존되며 출고취소 이력이 새로 추가됩니다.\n\n계속할까요?"
    );
    if (!proceed) return;
    try {
      const result = await undoCompletedOrder(orderNumber);
      alert(`출고취소 완료\n복원 품목: ${Number(result?.restored_items || 0)}종\n복원 수량: ${Number(result?.restored_quantity || 0)}개`);
      loadOrders();
    } catch (error) {
      alert("출고취소 실패: " + error.message);
    }
    return;
  }

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
  const courier = getCourierValue(courierSelect?.closest('.order-detail')) || "로젠택배";
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
    const qty = Number(row.dataset.qty || 0);
    const recordedSoldout = Math.max(0, Number(row.dataset.soldoutQty || 0));
    const soldoutQty = Math.min(qty, recordedSoldout > 0 ? recordedSoldout : (checkbox.checked ? qty : 0));
    const shippedQty = Math.max(0, qty - soldoutQty);
    const unitPrice = Number(row.dataset.unitPrice || 0);
    qtyTotal += shippedQty;
    productTotal += shippedQty * unitPrice;
  });

  const shipping = Number(card.querySelector(".shipping-input").value) || 0;
  const finalTotal = productTotal + shipping;

  card.querySelector(".calc-qty").textContent = qtyTotal;
  card.querySelector(".calc-product-total").textContent = productTotal.toLocaleString();
  card.querySelector(".calc-shipping-fee").textContent = shipping.toLocaleString();
  card.querySelector(".calc-final-total").textContent = finalTotal.toLocaleString();
}


function getCourierValue(detail){
  if(!detail)return '';
  const select=detail.querySelector('.courier-select');
  if(!select)return '';
  if(select.value==='__custom__')return (detail.querySelector('.courier-custom-input')?.value||'').trim();
  return select.value||'';
}
function handleCourierChange(select){
  const detail=select.closest('.order-detail');
  const input=detail?.querySelector('.courier-custom-input');
  if(input){input.hidden=select.value!=='__custom__';if(!input.hidden)input.focus();}
  queueShippingSave(select.dataset.order,detail);
}
function adjustShippingFee(button,delta){
  const detail=button.closest('.order-detail');
  const input=detail?.querySelector('.shipping-input');
  if(!input||input.disabled)return;
  input.value=Math.max(0,(Number(input.value)||0)+Number(delta||0));
  const card=button.closest('.order-card');if(card)recalcOrderCard(card.id);
  queueShippingSave(input.dataset.order,detail);
}
window.handleCourierChange=handleCourierChange;window.adjustShippingFee=adjustShippingFee;

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
    courier:getCourierValue(detail)||'로젠택배',
    tracking_number:detail.querySelector('.tracking-input')?.value.trim()||''
  };
  const fields=detail.querySelectorAll('.shipping-input,.courier-select,.courier-custom-input,.tracking-input');
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

function editVerifiedPicking(orderNumber) {
  if (!confirm('검증된 피킹을 초기화하면 차감된 ERP 재고가 먼저 복원됩니다.\n그 후 일부품절·피킹수량을 다시 입력하고 최종검증해야 합니다.\n\n계속할까요?')) return;
  location.href = `picking.html?order=${encodeURIComponent(orderNumber)}&edit=1`;
}
window.editVerifiedPicking = editVerifiedPicking;

function splitWarehouseItemNumber(value) {
  const text = String(value || "").trim();
  const match = text.match(/^([SBI])[-\s](.+)$/i);
  return match ? { warehouseCode: match[1].toUpperCase(), itemNumber: match[2].trim() } : { warehouseCode: null, itemNumber: text };
}

function updateOrderEditRowTotal(row) {
  const qty = Math.max(0, Number(row.querySelector(".order-edit-qty")?.value || 0));
  const price = Math.max(0, Number(row.querySelector(".order-edit-price")?.value || 0));
  const total = row.querySelector(".order-edit-row-total");
  if (total) total.value = qty * price;
}

function bindOrderEditRow(row) {
  row.querySelectorAll(".order-edit-qty,.order-edit-price").forEach(input => input.addEventListener("input", () => updateOrderEditRowTotal(row)));
  row.querySelector(".order-edit-row-total")?.addEventListener("input", event => {
    const qty = Math.max(1, Number(row.querySelector(".order-edit-qty")?.value || 1));
    const price = row.querySelector(".order-edit-price");
    if (price) price.value = Math.max(0, Number(event.target.value || 0)) / qty;
  });
  updateOrderEditRowTotal(row);
}

function toggleOrderItemEditor(index) {
  const editor = document.getElementById(`order-item-editor-${index}`);
  if (!editor) return;
  editor.hidden = !editor.hidden;
  if (!editor.hidden) editor.querySelectorAll("[data-order-edit-row]").forEach(bindOrderEditRow);
}

function openOrderItemEditor(index) {
  const detail = document.getElementById(`detail-${index}`);
  const editor = document.getElementById(`order-item-editor-${index}`);
  if (!detail || !editor) return;
  detail.style.display = "block";
  editor.hidden = false;
  editor.querySelectorAll("[data-order-edit-row]").forEach(bindOrderEditRow);
  editor.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function prepareOrderItemEditor(orderNumber, index, editable, isDone) {
  if (isDone) {
    alert("출고완료 주문은 재고·출고이력을 보호하기 위해 바로 수정할 수 없습니다.\n먼저 출고취소·재고복원을 진행해주세요.");
    return;
  }
  if (editable) {
    openOrderItemEditor(index);
    return;
  }
  alert('피킹을 시작한 주문은 품번·수량·단가를 바로 수정할 수 없습니다.\n피킹 화면의 전용 초기화 기능으로 대기 상태를 확인한 뒤 다시 시도해주세요.');
}

function addOrderItemEditRow(index) {
  const editor = document.getElementById(`order-item-editor-${index}`);
  const rows = editor?.querySelector(".order-edit-rows");
  if (!rows) return;
  rows.insertAdjacentHTML("beforeend", `<div class="order-edit-item-row new-order-edit-row" data-order-edit-row>
    <input class="order-edit-number" type="text" placeholder="품번(예: S-1001)">
    <input class="order-edit-qty" type="number" min="1" step="1" value="1" aria-label="수량(죽)">
    <input class="order-edit-price" type="number" min="0" step="50" value="0" aria-label="1죽 단가">
    <input class="order-edit-row-total" type="number" min="0" step="1" value="0" aria-label="금액">
    <button class="order-edit-remove-new" type="button" onclick="this.closest('[data-order-edit-row]').remove()">삭제</button>
  </div>`);
  const row = rows.lastElementChild;
  bindOrderEditRow(row);
  row.querySelector(".order-edit-number")?.focus();
}

async function saveOrderItems(orderNumber, index) {
  const editor = document.getElementById(`order-item-editor-${index}`);
  if (!editor) return;
  const items = [...editor.querySelectorAll("[data-order-edit-row]")].map(row => {
    const parsed = splitWarehouseItemNumber(row.querySelector(".order-edit-number")?.value);
    const oneJukPrice = Math.max(0, Number(row.querySelector(".order-edit-price")?.value || 0));
    return {
      id: row.dataset.id ? Number(row.dataset.id) : null,
      item_number: parsed.itemNumber,
      warehouse_code: parsed.warehouseCode,
      qty: Math.max(1, Math.floor(Number(row.querySelector(".order-edit-qty")?.value || 1))),
      price: oneJukPrice
    };
  });
  if (!items.length || items.some(item => !item.item_number)) return alert("품번을 모두 입력해주세요.");
  if (items.some(item => !Number.isFinite(item.price) || item.price < 0)) return alert("단가를 확인해주세요.");
  if (!confirm("주문 품목을 저장하면 작업지시서·피킹검증·거래명세서에 반영됩니다.\n계속할까요?")) return;
  const button = editor.querySelector(".order-edit-save");
  if (button) { button.disabled = true; button.textContent = "저장 중..."; }
  try {
    const { data, error } = await supabaseClient.rpc("admin_save_order_items", { p_order_number: orderNumber, p_items: items });
    if (error) throw error;
    if (data?.ok === false) throw new Error(data.error || "주문 품목을 저장하지 못했습니다.");
    alert("주문 품목을 저장했습니다.");
    await loadOrders();
  } catch (error) {
    alert("주문 품목 저장 실패: " + error.message + "\nSQL/V6.4.2-ADMIN-ORDER-ITEM-EDIT.sql 적용 여부를 확인해주세요.");
    if (button) { button.disabled = false; button.textContent = "주문 품목 저장"; }
  }
}

window.toggleOrderItemEditor = toggleOrderItemEditor;
window.openOrderItemEditor = openOrderItemEditor;
window.prepareOrderItemEditor = prepareOrderItemEditor;
window.addOrderItemEditRow = addOrderItemEditRow;
window.saveOrderItems = saveOrderItems;
window.copyAllWarehouseOrders = copyAllWarehouseOrders;
window.copyOrderDetails = copyOrderDetails;

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

function updateAdminOrderCardStatus(orderNumber, status, pickingStatus, revisionStatus='') {
  const card = Array.from(document.querySelectorAll('.order-card[data-order-number]'))
    .find(el => el.dataset.orderNumber === String(orderNumber));
  if (!card) return;
  card.dataset.revisionStatus=revisionStatus||'';

  const isDone = status === '출고완료';
  const isVerified = String(pickingStatus || '').includes('검증완료');
  card.classList.toggle('done', isDone);

  const mainPill = card.querySelector('.order-main-status');
  if (mainPill) {
    mainPill.textContent = revisionStatus==='수정중'?'고객 수정중':revisionStatus==='수정완료'?'고객 수정완료':status||'주문접수';
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
    shippingBtn.disabled = Boolean(revisionStatus)||(!isDone&&!isVerified);
    shippingBtn.title = revisionStatus?'고객 주문변경 확인을 먼저 완료해주세요':shippingBtn.disabled?'피킹 최종검증 후 출고완료할 수 있습니다':'';
    shippingBtn.textContent = isDone ? '출고취소·재고복원' : isVerified ? '출고완료' : '피킹검증 후 출고가능';
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
      .select('order_number,status,picking_status,customer_revision_status')
      .in('order_number', orderNumbers);
    if (error) throw error;
    const latest = new Map();
    (data || []).forEach(row => {
      const current = latest.get(row.order_number) || { status: row.status || '주문접수', pickingStatus: '대기', revisionStatus:row.customer_revision_status||'' };
      current.status = row.status || current.status;
      if(row.customer_revision_status)current.revisionStatus=row.customer_revision_status;
      if (String(row.picking_status || '').includes('검증완료')) current.pickingStatus = row.picking_status;
      else if (row.picking_status === '피킹중' && !String(current.pickingStatus).includes('검증완료')) current.pickingStatus = '피킹중';
      latest.set(row.order_number, current);
    });
    let revisionChanged=false;latest.forEach((value,key)=>{const card=Array.from(document.querySelectorAll('.order-card[data-order-number]')).find(el=>el.dataset.orderNumber===String(key));if(card&&String(card.dataset.revisionStatus||'')!==String(value.revisionStatus||''))revisionChanged=true;updateAdminOrderCardStatus(key,value.status,value.pickingStatus,value.revisionStatus)});if(revisionChanged)setTimeout(()=>loadOrders(),0);
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

function loadAuthenticatedAdminChrome(){
  if(document.getElementById('authenticatedAdminChrome'))return;
  const marker=document.createElement('meta');marker.id='authenticatedAdminChrome';document.head.appendChild(marker);
  ['js/session-status.js?v=65640','js/admin-mobile-nav.js?v=65640'].forEach(src=>{const script=document.createElement('script');script.src=src;script.defer=true;document.body.appendChild(script)});
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
    loadAuthenticatedAdminChrome();
  };

  try {
    // 네트워크 왕복 전에 로컬 세션을 먼저 읽어 로그인 화면 대기·깜빡임을 줄입니다.
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) console.warn("관리자 세션 확인 오류:", sessionError);
    const user = sessionData?.session?.user || null;

    if (!user) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      localStorage.removeItem(ADMIN_SESSION_KEY);
      showLogin();
      return;
    }

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

    // Supabase 세션이 유효하면 기기 저장값이 없거나 오래됐더라도 현재 사용자로 복구합니다.
    // 저장값만 먼저 검사하면 정상 관리자도 로그인 화면과 메인 화면을 반복 이동할 수 있습니다.
    sessionStorage.setItem(ADMIN_SESSION_KEY, user.id);
    localStorage.setItem(ADMIN_SESSION_KEY, user.id);

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
    const orderNumbers=[...new Set(orderRows.map(r=>r.order_number).filter(Boolean))];orderRevisionMap={};
    if(orderNumbers.length){const {data,error}=await supabaseClient.from('order_revision_history').select('order_number,original_snapshot,revised_snapshot,revision_status,started_at,completed_at').in('order_number',orderNumbers).order('started_at',{ascending:false});if(error)throw error;(data||[]).forEach(row=>{if(!orderRevisionMap[row.order_number])orderRevisionMap[row.order_number]=row})}
  }catch(e){console.warn('고객 주문변경 이력 불러오기 실패',e);orderRevisionMap={}}
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
  payload.courier=getCourierValue(detail)||'로젠택배';
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

// V6.2.4 주문관리 무깜빡임 실시간 상태 갱신
document.addEventListener("DOMContentLoaded", startAdminRealtimeRefresh);
