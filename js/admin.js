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
const adminCompletedSort = document.getElementById("adminCompletedSort");
if (adminCompletedSort && adminUrlParams.get("sort")) adminCompletedSort.value = adminUrlParams.get("sort");

let adminFilter = "주문접수";
let adminPage = 1;
const ADMIN_PAGE_SIZE = 50;
const requestedAdminStatus = new URLSearchParams(location.search).get("status");
if (["전체", "주문접수", "출고대기", "출고완료"].includes(requestedAdminStatus)) adminFilter = requestedAdminStatus;
let customerNotes = {};
let orderRevisionMap = {};
let orderRevisionHistoryMap = {};
let orderAdminChangeMap = {};
let orderAdminChangeHistoryMap = {};
let paymentAccounts = [];
let orderPaymentRecords = new Map();
const requestedPaymentFilter = adminUrlParams.get('payment') || '';
const paymentRecordKey=(orderNumber,customerId)=>`${String(orderNumber||'')}::${String(customerId||'')}`;
const normalizeAdminCustomerName=value=>String(value||'').trim().normalize('NFKC').replace(/[\s_.·ㆍ,()[\]{}\-/]+/g,'').toLowerCase();
const getOrderPaymentRecord=(orderNumber,customerId)=>orderPaymentRecords.get(paymentRecordKey(orderNumber,customerId))||orderPaymentRecords.get(`order::${String(orderNumber||'')}`);
let adminInventoryMap = new Map();
let adminInventoryAvailable = false;
let adminCustomerIdentityMap = new Map();
let adminCustomerMetaMap = new Map();
let adminProductCatalogMap = new Map();
let adminOrderMetaMap = new Map();

let adminAuxCache={at:0,inventory:null,product:null,customerMeta:null,orderMeta:null};
const ADMIN_AUX_CACHE_MS=60000;
async function fetchCustomerIdentitySnapshot(ids=[]){
  const unique=[...new Set((ids||[]).filter(Boolean).map(String))];
  if(!unique.length)return [];
  const {data,error}=await supabaseClient.from('customers').select('id,business_name,owner_name,phone,address').in('id',unique);
  if(error)throw error;return data||[];
}


async function fetchAdminCustomerMetadata(ids=[]){const unique=[...new Set((ids||[]).filter(Boolean).map(String))];if(!unique.length)return[];const {data,error}=await supabaseClient.from('customer_admin_metadata').select('customer_id,customer_code,customer_tag,show_order_tag').in('customer_id',unique);if(error){console.warn('V6.6.20 고객표시 조회 생략:',error.message);return[]}return data||[]}
async function fetchAdminOrderMetadata(nums=[]){const unique=[...new Set((nums||[]).filter(Boolean).map(String))];if(!unique.length)return[];const {data,error}=await supabaseClient.from('order_admin_metadata').select('order_number,admin_tag,show_tag').in('order_number',unique);if(error){console.warn('V6.6.20 주문표시 조회 생략:',error.message);return[]}return data||[]}
async function fetchAdminProductCatalog(){const {data,error}=await supabaseClient.from('product_groups').select('id,item_numbers,price,warehouse_code');if(error){console.warn('상품단가표 조회 실패:',error.message);return[]}return data||[]}
function catalogNumbers(value){if(Array.isArray(value))return value.map(String);if(typeof value==='string'){try{const p=JSON.parse(value);if(Array.isArray(p))return p.map(String)}catch{}return value.split(/[\s,\/]+/).filter(Boolean)}return[]}
function setAdminProductCatalog(rows){adminProductCatalogMap=new Map();(rows||[]).forEach(g=>catalogNumbers(g.item_numbers).forEach(n=>adminProductCatalogMap.set(inventoryKey(n),{item_number:String(n),price:Number(g.price||0),warehouse_code:String(g.warehouse_code||'').toUpperCase()})))}
function inventoryKey(value) {
  return String(value ?? "").trim().toUpperCase();
}
const ADMIN_KOREAN_INITIALS='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function adminInitialText(value){return[...String(value||'').normalize('NFKC')].map(char=>{const code=char.charCodeAt(0)-0xAC00;return code>=0&&code<=11171?ADMIN_KOREAN_INITIALS[Math.floor(code/588)]:char}).join('')}
function adminLookupMatches(value,query){const normalize=text=>String(text||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');const needle=normalize(query);return !needle||normalize(value).includes(needle)||normalize(adminInitialText(value)).includes(needle)}

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

let adminOrderSearchTimer=null;
if (adminSearch) adminSearch.addEventListener("input", () => {
  adminPage = 1; clearTimeout(adminOrderSearchTimer);
  adminOrderSearchTimer=setTimeout(()=>loadOrders(),280);
});

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


async function saveOrderAdminTag(orderNumber,index){
  const input=document.getElementById(`admin-order-tag-${index}`);
  const tag=String(input?.value||'').trim();
  if(!tag){alert('표시 내용을 입력하세요.');return;}
  const {error}=await supabaseClient.from('order_admin_metadata').upsert({order_number:orderNumber,admin_tag:tag,show_tag:true,updated_at:new Date().toISOString()},{onConflict:'order_number'});
  if(error)return alert('관리자 표시 저장 실패: '+error.message+'\n\nSQL/V6.6.20-ORDER-ADMIN-TAG.sql을 먼저 실행하세요.');
  adminOrderMetaMap.set(String(orderNumber),{order_number:orderNumber,admin_tag:tag,show_tag:true});
  await loadOrders();
}
window.saveOrderAdminTag=saveOrderAdminTag;
async function deleteOrderAdminTag(orderNumber){
  const {error}=await supabaseClient.from('order_admin_metadata').upsert({order_number:orderNumber,admin_tag:'',show_tag:false,updated_at:new Date().toISOString()},{onConflict:'order_number'});
  if(error)return alert('관리자 표시 삭제 실패: '+error.message);
  adminOrderMetaMap.set(String(orderNumber),{order_number:orderNumber,admin_tag:'',show_tag:false});
  await loadOrders();
}
window.deleteOrderAdminTag=deleteOrderAdminTag;

async function loadOrders() {
  const hadOrders = Boolean(adminOrders?.querySelector('.order-card'));
  if (!hadOrders) adminOrders.innerHTML = "<p>주문을 불러오는 중...</p>";
  else adminOrders.classList.add('orders-refreshing');

  let data = [];

try {
  // V6.6.77: 주문 자체를 먼저 받고, 현재 화면에 필요한 고객/표시 데이터만 병렬 조회합니다.
  const orderRows=await fetchOrders();
  data=orderRows||[];
  const customerIds=[...new Set(data.map(r=>r.customer_id).filter(Boolean))];
  const orderNumbers=[...new Set(data.map(r=>r.order_number).filter(Boolean))];
  const cacheFresh=Date.now()-Number(adminAuxCache.at||0)<ADMIN_AUX_CACHE_MS;
  const [inventoryRows,customerRows,customerMetaRows,productCatalogRows,orderMetaRows]=await Promise.all([
    cacheFresh&&adminAuxCache.inventory?Promise.resolve(adminAuxCache.inventory):fetchInventorySnapshot(),
    fetchCustomerIdentitySnapshot(customerIds),
    fetchAdminCustomerMetadata(customerIds),
    cacheFresh&&adminAuxCache.product?Promise.resolve(adminAuxCache.product):fetchAdminProductCatalog(),
    fetchAdminOrderMetadata(orderNumbers)
  ]);
  adminAuxCache={at:Date.now(),inventory:inventoryRows,product:productCatalogRows,customerMeta:customerMetaRows,orderMeta:orderMetaRows};
  adminCustomerIdentityMap=new Map((customerRows||[]).map(row=>[String(row.id),row]));
  adminCustomerMetaMap=new Map((customerMetaRows||[]).map(row=>[String(row.customer_id),row]));
  setAdminProductCatalog(productCatalogRows);
  adminOrderMetaMap=new Map((orderMetaRows||[]).map(row=>[String(row.order_number),row]));
  setAdminInventorySnapshot(inventoryRows);
} catch (error) {
  adminOrders.innerHTML = `<p>주문 불러오기 실패: ${error.message}</p>`;
  return;
}

  await Promise.all([loadAdminFeatureData(data),loadOrderPaymentRecords(data)]);

  if (!data || data.length === 0) {
    adminOrders.innerHTML = "<div class='product-card'><h2>주문이 없습니다</h2></div>";
    return;
  }

  const grouped = {};

  data.forEach(order => {
    const customerProfile=adminCustomerIdentityMap.get(String(order.customer_id||''))||{};
    const customerMeta=adminCustomerMetaMap.get(String(order.customer_id||''))||{};
    const groupedKey=`${String(order.order_number||'')}::${normalizeAdminCustomerName(order.customer_name||'')||String(order.customer_id||'')}`;
    const orderMeta=adminOrderMetaMap.get(String(order.order_number||''))||{};
    if (!grouped[groupedKey]) {
      const isProxyOrder = String(order.order_number||'').startsWith('ADMIN-') || String(order.memo||'').includes('[관리자 대신주문]');
      const ownerCandidate = order.customer_owner_name || customerProfile.owner_name || '';
      grouped[groupedKey] = {
        orderNumber: order.order_number,
        customerName: order.customer_name,
        customerOwnerName: visibleOrderOwnerName(ownerCandidate, isProxyOrder),
        customerCode: customerMeta.customer_code||'',
        customerTag: customerMeta.customer_tag||'',
        showCustomerTag: !!customerMeta.customer_tag,
        orderAdminTag: orderMeta.admin_tag||'',
        showOrderAdminTag: orderMeta.show_tag===true,
        deliveryName: order.delivery_name || order.customer_name || '',
        deliveryPhone: order.delivery_phone || customerProfile.phone || '',
        deliveryAddress: order.delivery_address || customerProfile.address || '',
        customerId: order.customer_id,
        memo: order.memo,
        status: order.status,
        revisionStatus: order.customer_revision_status || '',
        createdAt: order.created_at,
        completedAt: order.shipped_at || latestTimestamp(order.picking_verified_at,order.created_at),
        shipping_fee: order.shipping_fee_manual === true ? Math.max(0,Number(order.shipping_fee||0)) : 4000,
        shippingFeeManual: order.shipping_fee_manual === true,
        courier: order.courier || "로젠택배",
        tracking_number: order.tracking_number || "",
        paymentAccountId: order.payment_account_id || "",
        paymentAccountLabel: order.payment_account_label || "",
        paymentBankName: order.payment_bank_name || "",
        paymentAccountNumber: order.payment_account_number || "",
        paymentAccountHolder: order.payment_account_holder || "",
        proxyCreatedByName: order.proxy_created_by_name || "",
        proxyCreatedByRole: order.proxy_created_by_role || "",
        isProxy: isProxyOrder,
        pickingStatus: order.picking_status || '대기',
        items: []
      };
    }

    const currentGroup=grouped[groupedKey];
    if(order.shipping_fee_manual===true){
      currentGroup.shippingFeeManual=true;
      currentGroup.shipping_fee=Math.max(0,Number(order.shipping_fee||0));
    }
    if(order.customer_revision_status)currentGroup.revisionStatus=order.customer_revision_status;
    if(order.delivery_name&&(!currentGroup.deliveryName||currentGroup.deliveryName===currentGroup.customerName))currentGroup.deliveryName=order.delivery_name;
    if(order.delivery_phone&&!currentGroup.deliveryPhone)currentGroup.deliveryPhone=order.delivery_phone;
    if(order.delivery_address&&!currentGroup.deliveryAddress)currentGroup.deliveryAddress=order.delivery_address;
    if(order.memo&&!currentGroup.memo)currentGroup.memo=order.memo;
    currentGroup.completedAt=latestTimestamp(currentGroup.completedAt,order.shipped_at,order.picking_verified_at,order.created_at);
    currentGroup.items.push(order);
    if (order.picking_status === '검증완료' || order.picking_status === '부분품절 검증완료') grouped[groupedKey].pickingStatus = order.picking_status;
    else if (order.picking_status === '피킹중' && !String(grouped[groupedKey].pickingStatus).includes('검증완료')) grouped[groupedKey].pickingStatus = '피킹중';
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

      // 미입금 조회는 PC·모바일 모두 출고완료 기간 필터와 무관하게 누적 표시합니다.
      if (requestedPaymentFilter!=='unpaid' && group.status === "출고완료" && !isWithinCompletedPeriod(group.completedAt)) {
        return false;
      }
      const payment=getOrderPaymentRecord(group.orderNumber,group.customerId);
      if(requestedPaymentFilter==='unpaid' && (!payment||Number(payment.paid_amount||0)>=calculateGroupPaymentTotal(group)))return false;

      if (!keyword) return true;

      const itemText = group.items.map(item => item.item_number).join(" ");

      if(exactItemSearch)return group.items.some(item=>inventoryKey(item.item_number)===normalizedKeyword);

      return adminLookupMatches([group.customerName,group.customerOwnerName,group.deliveryName,group.orderNumber,itemText].join(' '),keyword);
    })
    .sort((a, b) => {
      if (a.status === b.status) {
        if (a.status === "출고완료") {
          const direction = adminCompletedSort?.value === "shipped-asc" ? 1 : -1;
          return direction * (new Date(a.completedAt || a.createdAt) - new Date(b.completedAt || b.createdAt));
        }
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

function formatOrderDateTime(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  return date.toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
}
function formatHourMinute(value){const date=new Date(value);if(Number.isNaN(date.getTime()))return'';return date.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})}

function formatCompletedDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "출고시간 미기록";
  return date.toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
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

function calculateGroupPaymentTotal(group){
  const productTotal=(group.items||[]).reduce((sum,item)=>{const ordered=Number(item.qty||0),soldout=Math.min(ordered,Number(item.soldout_qty||(item.is_soldout?ordered:0)));return sum+Math.max(0,ordered-soldout)*Number(item.price||0)},0);
  return productTotal+Number(group.shipping_fee||0);
}
async function loadOrderPaymentRecords(orderRows=[]){
  const nums=[...new Set((orderRows||[]).map(r=>r.order_number).filter(Boolean))];
  if(!nums.length){orderPaymentRecords=new Map();return;}
  const {data,error}=await supabaseClient.from('order_payment_records').select('id,order_number,customer_key,customer_name,order_amount,paid_amount,payment_status,payment_account,depositor_name,paid_at,memo,confirmed_by,confirmed_by_name,updated_at').in('order_number',nums).limit(10000);
  if(error){console.warn('입금정보 조회 실패:',error.message);orderPaymentRecords=new Map();return}
  orderPaymentRecords=new Map();(data||[]).forEach(row=>{orderPaymentRecords.set(paymentRecordKey(row.order_number,row.customer_key),row);const k=`order::${String(row.order_number||'')}`,old=orderPaymentRecords.get(k);if(!old||(!old.confirmed_by&&row.confirmed_by)||((!!old.confirmed_by)===(!!row.confirmed_by)&&new Date(row.updated_at||0)>new Date(old.updated_at||0)))orderPaymentRecords.set(k,row)});
}
async function saveOrderPayment(orderNumber,customerId,customerName,total,paidAmount){
  const old=getOrderPaymentRecord(orderNumber,customerId)||{};
  const {data,error}=await supabaseClient.rpc('admin_save_order_payment',{p_order_number:orderNumber,p_customer_key:String(customerId||''),p_customer_name:customerName||'',p_order_amount:Number(total||0),p_paid_amount:Number(paidAmount||0),p_payment_account:old.payment_account||null,p_depositor_name:old.depositor_name||null,p_paid_at:Number(paidAmount||0)>0?(old.paid_at||new Date().toISOString()):null,p_memo:old.memo||null});
  if(error){alert('입금상태 저장 실패: '+error.message+'\n\nV6.6.3-PAYMENT-RECEIVABLES.sql 실행 여부를 확인해주세요.');return false}
  orderPaymentRecords.set(paymentRecordKey(orderNumber,customerId),data);orderPaymentRecords.set(`order::${String(orderNumber||'')}`,data);return true;
}

async function toggleOrderPaid(input,orderNumber,customerId,total,customerName){
  input.disabled=true;const next=input.checked?total:0;
  if(!input.checked&&!confirm('이 주문을 미입금으로 변경할까요?')){input.checked=true;input.disabled=false;return}
  if(await saveOrderPayment(orderNumber,customerId,customerName,total,next))await loadOrders();else{input.checked=!input.checked;input.disabled=false}
}
function togglePartialPaymentEditor(index){const box=document.getElementById(`partial-payment-${index}`);if(box)box.hidden=!box.hidden}
async function savePartialPayment(button,orderNumber,customerId,total,customerName){const input=button.closest('.partial-payment-editor')?.querySelector('input');const value=Math.max(0,Number(input?.value||0));if(value>=total&&!confirm('주문금액 이상입니다. 입금완료로 저장할까요?'))return;button.disabled=true;if(await saveOrderPayment(orderNumber,customerId,customerName,total,value))await loadOrders();else button.disabled=false}
async function showPaymentHistory(index,orderNumber,customerId){const box=document.getElementById(`payment-history-${index}`);if(!box)return;if(!box.hidden){box.hidden=true;return}box.hidden=false;box.innerHTML='<p>변경기록을 불러오는 중입니다.</p>';const {data,error}=await supabaseClient.from('order_payment_history').select('*').eq('order_number',orderNumber).eq('customer_key',String(customerId||'')).order('changed_at',{ascending:false}).limit(30);if(error){box.innerHTML=`<p>기록 조회 실패: ${escapeAdminHtml(error.message)}</p>`;return}box.innerHTML=data?.length?`<strong>입금 확인·변경 기록</strong>${data.map(row=>`<article><span>${escapeAdminHtml(row.previous_status||'최초등록')} → <b>${escapeAdminHtml(row.new_status)}</b></span><span>${Number(row.previous_paid_amount||0).toLocaleString()}원 → <b>${Number(row.new_paid_amount||0).toLocaleString()}원</b></span><small>${escapeAdminHtml(row.changed_by_name||'관리자')} · ${formatOrderDateTime(row.changed_at)}</small></article>`).join('')}`:'<p>저장된 변경기록이 없습니다.</p>'}
window.toggleOrderPaid=toggleOrderPaid;window.togglePartialPaymentEditor=togglePartialPaymentEditor;window.savePartialPayment=savePartialPayment;window.showPaymentHistory=showPaymentHistory;

function canEditOrderItems(group) {
  return group.status !== "출고완료" &&
    !group.revisionStatus &&
    !String(group.pickingStatus || "").includes("검증완료") &&
    group.pickingStatus !== "피킹중" &&
    group.items.every(item => Number(item.picked_qty || 0) === 0 && Number(item.soldout_qty || 0) === 0 && !item.is_soldout);
}
function canDeletePendingOrder(group){return group.status==='주문접수'&&canEditOrderItems(group)}

function revisionSnapshotMap(snapshot){const map=new Map();(Array.isArray(snapshot)?snapshot:[]).forEach(item=>{const warehouse=String(item.warehouse_code||'').toUpperCase(),number=String(item.item_number||'').trim();map.set(`${warehouse}|${number}`,{warehouse,number,qty:Number(item.qty||0),price:Number(item.price||0)})});return map}
function changedItemKeys(beforeSnapshot,afterSnapshot){const before=revisionSnapshotMap(beforeSnapshot),after=revisionSnapshotMap(afterSnapshot),keys=new Set();for(const key of new Set([...before.keys(),...after.keys()])){const a=before.get(key),b=after.get(key);if(!a||!b||a.qty!==b.qty||a.price!==b.price)keys.add(key)}return keys}
function orderItemHistoryFlags(group,item){
 const key=`${String(item.warehouse_code||'').toUpperCase()}|${String(item.item_number||'').trim()}`;
 const customerRows=group.revisionHistory||[];const adminRows=group.adminChangeHistory||[];
 return {customer:customerRows.some(row=>changedItemKeys(row.original_snapshot,row.revised_snapshot).has(key)),admin:adminRows.some(row=>changedItemKeys(row.before_snapshot,row.after_snapshot).has(key))};
}
function itemEditHistoryBadges(group,item){const flags=orderItemHistoryFlags(group,item);return `${flags.customer?'<small class="item-edit-history-badge customer" title="고객이 수정한 품번">고객수정</small>':''}${flags.admin?'<small class="item-edit-history-badge admin" title="관리자가 수정한 품번">관리자수정</small>':''}`}
function itemEditHistoryClass(group,item){const flags=orderItemHistoryFlags(group,item);return flags.customer&&flags.admin?' edit-both':flags.customer?' edit-customer':flags.admin?' edit-admin':''}
function describeSnapshotChanges(beforeSnapshot,afterSnapshot){
 const before=revisionSnapshotMap(beforeSnapshot),after=revisionSnapshotMap(afterSnapshot),keys=[...new Set([...before.keys(),...after.keys()])].sort((a,b)=>a.localeCompare(b,'ko',{numeric:true}));
 return keys.map(key=>{const a=before.get(key),b=after.get(key),label=`${b?.warehouse||a?.warehouse?`${b?.warehouse||a?.warehouse}-`:''}${b?.number||a?.number||'-'}`;if(!a)return`<li class="history-added"><b>${escapeAdminHtml(label)}</b><span>품번 추가 · ${b.qty}죽${b.price?` · 단가 ${b.price.toLocaleString()}원`:''}</span></li>`;if(!b)return`<li class="history-deleted"><b>${escapeAdminHtml(label)}</b><span>품번 삭제 · 기존 ${a.qty}죽</span></li>`;const parts=[];if(a.qty!==b.qty)parts.push(`수량 ${a.qty}죽 → ${b.qty}죽`);if(a.price!==b.price)parts.push(`단가 ${a.price.toLocaleString()}원 → ${b.price.toLocaleString()}원`);return parts.length?`<li class="history-changed"><b>${escapeAdminHtml(label)}</b><span>${parts.join(' · ')}</span></li>`:''}).filter(Boolean).join('');
}
function renderOrderEditHistory(group,index){
 const entries=[...(group.revisionHistory||[]).map(row=>({kind:'customer',time:row.completed_at||row.started_at,before:row.original_snapshot,after:row.revised_snapshot,label:'고객 수정'})),...(group.adminChangeHistory||[]).map(row=>({kind:'admin',time:row.changed_at,before:row.before_snapshot,after:row.after_snapshot,label:'관리자 수정',reason:row.change_reason}))].filter(row=>row.time).sort((a,b)=>new Date(a.time)-new Date(b.time));
 if(!entries.length)return `<section class="order-edit-history-box empty"><strong>수정이력</strong><small>수정 기록 없음</small></section>`;
 return `<section class="order-edit-history-box" onclick="event.stopPropagation()"><button type="button" class="order-edit-history-toggle" onclick="toggleOrderEditHistory(${index})"><span>수정이력</span><b>${entries.length}회</b><em>펼치기</em></button><div id="order-edit-history-${index}" class="order-edit-history-list" hidden>${entries.map((entry,i)=>{const changes=describeSnapshotChanges(entry.before,entry.after);return `<article class="order-edit-history-entry ${entry.kind}"><header><b>${i+1}차 · ${entry.label}</b><time>${formatOrderDateTime(entry.time)}</time></header>${entry.reason?`<small>${escapeAdminHtml(entry.reason)}</small>`:''}<ul>${changes||'<li>품목 외 주문정보 수정</li>'}</ul></article>`}).join('')}</div></section>`;
}
function toggleOrderEditHistory(index){const box=document.getElementById(`order-edit-history-${index}`);if(!box)return;box.hidden=!box.hidden;const btn=box.previousElementSibling;if(btn){const em=btn.querySelector('em');if(em)em.textContent=box.hidden?'펼치기':'접기'}}
window.toggleOrderEditHistory=toggleOrderEditHistory;
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
  return `<section id="order-item-editor-${index}" class="order-item-editor" data-customer-id="${escapeAdminAttr(group.customerId||'')}" hidden>
    <div class="order-edit-head"><span>품번</span><span>수량(죽)</span><span>단가(1죽)</span><span>금액</span><span>관리</span></div>
    <div class="order-edit-rows">${rows}</div>
    <div class="order-edit-actions">
      <div class="order-edit-add-actions">
        <button type="button" class="order-edit-add-auto" onclick="addOrderItemEditRow(${index},'auto')">+ 품번 자동추가</button>
        <button type="button" class="order-edit-add-manual" onclick="addOrderItemEditRow(${index},'manual')">+ 수기 직접입력</button>
      </div>
      <button type="button" class="order-edit-save" onclick="saveOrderItems('${escapeAdminAttr(group.orderNumber)}',${index})">주문 품목 저장</button>
    </div>
    <small><b>품번 자동추가</b>: 등록 상품의 출고지·거래처 단가를 자동 조회합니다. · <b>수기 직접입력</b>: 입력한 품번·단가를 그대로 사용합니다.</small>
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
  return order.map(code => ({ code, label: getOrderWarehouseLabel(code), items: map.get(code).sort((a,b)=>String(a.item_number||'').localeCompare(String(b.item_number||''),'ko',{numeric:true,sensitivity:'base'})) })).filter(section => section.items.length);
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

function copyItemKey(value){return String(value||'').trim().toUpperCase().replace(/^([SBI])[-_\s]+(?=[A-Z0-9])/,'')}
function compareCopiedItem(a,b){return copyItemKey(a).localeCompare(copyItemKey(b),'ko',{numeric:true,sensitivity:'base'})}
let orderCopyGroupMap=null;
function copyGroupNumbers(value){if(Array.isArray(value))return value.map(String);if(typeof value==='string'){try{const parsed=JSON.parse(value);if(Array.isArray(parsed))return parsed.map(String)}catch{}return value.split(/[\s,\/]+/).filter(Boolean)}return[]}
async function getOrderCopyGroupMap(){if(orderCopyGroupMap)return orderCopyGroupMap;const map=new Map();try{const {data}=await supabaseClient.from('product_groups').select('id,item_numbers');(data||[]).forEach((group,index)=>copyGroupNumbers(group.item_numbers).forEach(number=>map.set(copyItemKey(number),String(group.id??index))))}catch(_){}orderCopyGroupMap=map;return map}
function formatCopyEntriesWithGroupGap(entries,mode='excel',details=false){let previousGroup=null;return entries.map(entry=>{const group=entry.group||`single:${copyItemKey(entry.rawItem)}`,gap=previousGroup!==null&&group!==previousGroup?'\n':'';previousGroup=group;if(details)return gap+(mode==='kakao'?`${entry.item}      ${entry.qty}죽      ${entry.price.toLocaleString()}원      ${(entry.qty*entry.price).toLocaleString()}원`:`${entry.item}\t${entry.qty}\t${entry.price}\t${entry.qty*entry.price}`);return gap+(mode==='kakao'?`${entry.item}            ${entry.qty}`:`${entry.item}\t${entry.qty}`)}).join('\n')}
async function formatOrderCopyRows(rows,mode='excel'){
  const groupMap=await getOrderCopyGroupMap(),entries=rows.map((row,rowOrder)=>({item:formatCopiedItemNumber(row.dataset.copyItem),rawItem:row.dataset.copyItem,qty:row.dataset.copyQty,rowOrder,group:groupMap.get(copyItemKey(row.dataset.copyItem))||''})).sort((a,b)=>compareCopiedItem(a.rawItem,b.rawItem)||a.rowOrder-b.rowOrder);return formatCopyEntriesWithGroupGap(entries,mode);
}

function formatCopiedItemNumber(value){const clean=String(value||'').trim().replace(/^([SBI])[-_\s]+(?=[A-Z0-9])/i,'');if(/A$/i.test(clean))return`${clean.slice(0,-1)} 아동`;if(/M$/i.test(clean))return`${clean.slice(0,-1)} 무지`;return clean}

async function copyWarehouseOrder(button, event, mode='excel') {
  event?.preventDefault();
  event?.stopPropagation();
  const section = button.closest(".admin-warehouse-section");
  const rows = [...section.querySelectorAll(".pick-row[data-copy-item]")];
  const text = await formatOrderCopyRows(rows,mode);
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
  const text = await formatOrderCopyRows(rows,mode);
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
 const groupMap=await getOrderCopyGroupMap();const rows=[...card.querySelectorAll('.pick-row[data-copy-item]')].map((row,rowOrder)=>({item:formatCopiedItemNumber(row.dataset.copyItem),rawItem:row.dataset.copyItem,qty:Number(row.dataset.copyQty||0),price:Number(row.dataset.unitPrice||0),rowOrder,group:groupMap.get(copyItemKey(row.dataset.copyItem))||''})).sort((a,b)=>compareCopiedItem(a.rawItem,b.rawItem)||a.rowOrder-b.rowOrder);
 if(!rows.length)return alert('복사할 주문 품목이 없습니다.');
 const body=formatCopyEntriesWithGroupGap(rows,mode,true);const text=mode==='kakao'?body:`품번\t수량(죽)\t단가(1죽)\t금액\n${body}`;
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
    group.revisionHistory=orderRevisionHistoryMap[group.orderNumber]||[];
    group.adminChangeRecord=orderAdminChangeMap[group.orderNumber]||null;
    group.adminChangeHistory=orderAdminChangeHistoryMap[group.orderNumber]||[];
    const customerChanged=Boolean(group.revisionRecord||group.revisionStatus);
    const adminChanged=Boolean(group.adminChangeRecord);
    const editBadges=`${customerChanged?`<small class="order-edit-origin-badge customer" title="고객 주문 수정 이력${group.revisionRecord?.completed_at?` · ${formatOrderDateTime(group.revisionRecord.completed_at)}`:''}">고객 수정</small>`:''}${adminChanged?`<small class="order-edit-origin-badge admin" title="${escapeAdminAttr(group.adminChangeRecord?.change_reason||'관리자 주문 수정')}${group.adminChangeRecord?.changed_at?` · ${formatOrderDateTime(group.adminChangeRecord.changed_at)}`:''}">관리자 수정</small>`:''}`;
    const isDone = group.status === "출고완료";
    let itemHtml = "";
    let summaryQty = 0;
let summaryTotal = 0;
let soldoutQty=0;

group.items.forEach(item => {
  const itemSoldout=Number(item.soldout_qty||0)||(item.is_soldout?Number(item.qty||0):0); soldoutQty+=itemSoldout; summaryQty += Math.max(0,Number(item.qty||0)-itemSoldout); summaryTotal += Math.max(0,Number(item.qty||0)-itemSoldout)*Number(item.price||0);
});

summaryTotal += Number(group.shipping_fee || 0);
    const paymentRecord=getOrderPaymentRecord(group.orderNumber,group.customerId)||{};
    const paymentTracked=Boolean(paymentRecord.id);
    const paidAmount=Math.max(0,Number(paymentRecord.paid_amount||0));
    const paymentStatus=!paymentTracked?'이전주문':paidAmount<=0?'미입금':paidAmount<summaryTotal?'일부입금':'입금완료';

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
          <strong class="order-item-number-highlight${itemEditHistoryClass(group,item)}">${item.warehouse_code?`${escapeAdminHtml(String(item.warehouse_code).toUpperCase())}-`:''}${item.item_number}${itemEditHistoryBadges(group,item)}${(Number(item.soldout_qty||0)>0||item.is_soldout)?` <small class="soldout-order-badge">${Number(item.soldout_qty||0)>0&&Number(item.soldout_qty||0)<Number(item.qty||0)?'일부품절 '+Number(item.soldout_qty||0)+'죽':'전체품절'}</small>`:''}${!isDone && stockStatus.warning?` <small class="inventory-warning-badge ${stockStatus.kind}">⚠ ${stockStatus.text}</small>`:''}</strong>
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
    <h2>${group.customerName || "거래처 미입력"} ${!group.isProxy&&group.customerOwnerName?`<small class="customer-owner-name">대표자 ${escapeAdminHtml(group.customerOwnerName)}</small>`:''} ${group.isProxy?`<small class="proxy-order-badge">관리자 대신주문${group.proxyCreatedByName?` · ${escapeAdminHtml(group.proxyCreatedByName)}(${escapeAdminHtml(group.proxyCreatedByRole==='manager'?'매니저':group.proxyCreatedByRole==='developer_admin'?'개발관리자':'관리자')}) · ${formatHourMinute(group.createdAt)}`:''}</small>`:''} ${group.memo?'<small class="customer-order-memo-badge">📝 메모</small>':''} ${soldoutQty>0?`<small class="soldout-order-badge">${soldoutQty}죽 품절</small>`:''} ${!isDone&&group.items.some(item=>getAdminStockStatus(item).warning)?`<small class="inventory-order-alert">⚠ 재고부족 ${group.items.filter(item=>getAdminStockStatus(item).warning).length}품번</small>`:''} ${editBadges}</h2>
    <p class="order-delivery-preview"><strong>납품처</strong> ${escapeAdminHtml(group.deliveryName||group.customerName||'-')}${group.showCustomerTag&&group.customerTag?` <small class="admin-customer-alias-inline">${escapeAdminHtml(group.customerTag)}</small>`:''}${group.showOrderAdminTag&&group.orderAdminTag?` <small class="admin-order-tag-inline">${escapeAdminHtml(group.orderAdminTag)}</small>`:''}</p>
    <p class="order-summary-number">${isDone ? `출고 ${formatCompletedDateTime(group.completedAt)}` : formatOrderDate(group.createdAt)} · ${group.orderNumber}</p>
  </div>
  <div class="order-compact-stats"><span>${group.items.length}품목</span><strong>${summaryQty}죽</strong><b>${summaryTotal.toLocaleString()}원</b></div>
  <div class="mobile-order-summary" aria-label="주문 요약">
    <span class="mobile-order-date">${isDone ? `출고 ${formatMobileOrderDate(group.completedAt)}` : formatMobileOrderDate(group.createdAt)}</span>
    <strong class="mobile-order-qty">${summaryQty}죽</strong>
    <b class="mobile-order-total">${summaryTotal.toLocaleString()}원</b>
    ${paymentTracked?`<label class="order-payment-check mobile-payment-check ${paymentStatus==='입금완료'?'paid':paymentStatus==='일부입금'?'partial':''}" onclick="event.stopPropagation()"><input type="checkbox" ${paymentStatus==='입금완료'?'checked':''} onchange="toggleOrderPaid(this,'${escapeAdminAttr(group.orderNumber)}','${escapeAdminAttr(group.customerId||'')}',${summaryTotal},'${escapeAdminAttr(group.customerName||'')}',${index})"><span>${paymentStatus==='입금완료'?'입금':paymentStatus==='일부입금'?`일부 ${paidAmount.toLocaleString()}원`:'미입금'}</span>${paymentRecord.updated_at?`<small>${escapeAdminHtml(paymentRecord.confirmed_by_name||'관리자')} · ${formatHourMinute(paymentRecord.updated_at)}</small>`:''}</label>`:''}
  </div>
  <div class="order-status-stack">
    ${paymentTracked?`<label class="order-payment-check desktop-payment-check ${paymentStatus==='입금완료'?'paid':paymentStatus==='일부입금'?'partial':''}" onclick="event.stopPropagation()"><input type="checkbox" ${paymentStatus==='입금완료'?'checked':''} onchange="toggleOrderPaid(this,'${escapeAdminAttr(group.orderNumber)}','${escapeAdminAttr(group.customerId||'')}',${summaryTotal},'${escapeAdminAttr(group.customerName||'')}',${index})"><span>${paymentStatus==='입금완료'?'입금':paymentStatus==='일부입금'?`일부 ${paidAmount.toLocaleString()}원`:'미입금'}</span>${paymentRecord.updated_at?`<small>${escapeAdminHtml(paymentRecord.confirmed_by_name||'관리자')} · ${formatHourMinute(paymentRecord.updated_at)}</small>`:''}</label>`:''}
    <span class="order-status-pill order-main-status ${isDone ? "done" : "pending"}">${group.revisionStatus==='수정중'?'고객 수정중':group.revisionStatus==='수정완료'?'고객 수정완료':group.status}</span>
    ${!isDone?`<span class="order-status-pill picking order-picking-status ${String(group.pickingStatus).includes("검증완료")?"done":"pending"}">${String(group.pickingStatus).includes("검증완료")?"출고대기":group.pickingStatus==="피킹중"?"피킹중":"피킹대기"}</span>`:""}
    ${isDone?`<button class="order-card-edit-button locked" type="button" disabled title="상세화면에서 출고취소·재고복원 후 수정할 수 있습니다">주문수정 불가</button>`:`<button class="order-card-edit-button ${canEditOrderItems(group) ? "" : "locked"}" type="button" onclick="event.stopPropagation();prepareOrderItemEditor('${escapeAdminAttr(group.orderNumber)}',${index},${canEditOrderItems(group)},false)">주문수정</button>`}
  </div>
  <span class="order-expand-icon" aria-hidden="true">⌄</span>
  ${customerNotes[group.orderNumber] ? `<span class="admin-note-badge">📝 ${escapeAdminHtml(customerNotes[group.orderNumber])}</span>` : ""}
</div>

<div
id="detail-${index}"
class="order-detail">

        ${renderOrderRevisionPanel(group)}

        ${paymentTracked?`<section class="order-payment-detail ${paymentStatus==='입금완료'?'paid':paymentStatus==='일부입금'?'partial':''}"><div><strong>입금상태</strong><span>${paymentStatus}</span><small>주문금액 ${summaryTotal.toLocaleString()}원 · 입금 ${paidAmount.toLocaleString()}원 · 미수 ${Math.max(0,summaryTotal-paidAmount).toLocaleString()}원${paymentRecord.updated_at?`<br>최근 확인: ${escapeAdminHtml(paymentRecord.confirmed_by_name||'관리자')} · ${formatOrderDateTime(paymentRecord.updated_at)}`:''}</small></div><span class="payment-detail-actions"><button type="button" onclick="togglePartialPaymentEditor(${index})">일부입금 입력</button><button type="button" class="gray-btn" onclick="showPaymentHistory(${index},'${escapeAdminAttr(group.orderNumber)}','${escapeAdminAttr(group.customerId||'')}')">변경기록</button></span></section><div id="partial-payment-${index}" class="partial-payment-editor" hidden><label>현재까지 받은 금액<input type="number" min="0" step="100" value="${paidAmount}"></label><button type="button" onclick="savePartialPayment(this,'${escapeAdminAttr(group.orderNumber)}','${escapeAdminAttr(group.customerId||'')}',${summaryTotal},'${escapeAdminAttr(group.customerName||'')}')">저장</button></div><div id="payment-history-${index}" class="payment-history-list" hidden></div>`:''}

        ${renderOrderItemEditor(group, index)}
        ${canDeletePendingOrder(group)?`<div class="pending-order-delete-row"><button type="button" class="cart-btn admin-delete-order-btn" onclick="deletePendingAdminOrder('${escapeAdminAttr(group.orderNumber)}')">주문접수건 삭제</button><small>피킹 시작 전 주문만 삭제할 수 있으며 삭제이력에 보관됩니다.</small></div>`:''}

        <div class="order-admin-meta-row"><section class="admin-order-tag-editor compact-admin-tag" onclick="event.stopPropagation()"><strong>관리표시</strong><input id="admin-order-tag-${index}" type="text" maxlength="40" value="${escapeAdminAttr(group.orderAdminTag||'')}" placeholder="예: 확인필요" onkeydown="if(event.key==='Enter'){event.preventDefault();saveOrderAdminTag('${escapeAdminAttr(group.orderNumber)}',${index})}"><button type="button" class="cart-btn" onclick="saveOrderAdminTag('${escapeAdminAttr(group.orderNumber)}',${index})">저장</button>${group.showOrderAdminTag&&group.orderAdminTag?`<button type="button" class="admin-order-tag-delete" onclick="deleteOrderAdminTag('${escapeAdminAttr(group.orderNumber)}')">삭제</button>`:''}<small>관리자만 표시</small></section>${renderOrderEditHistory(group,index)}</div>
        <div class="order-party-summary">${group.isProxy&&group.proxyCreatedByName?`<p class="proxy-created-by-admin"><strong>대신주문 접수자</strong> ${escapeAdminHtml(group.proxyCreatedByName)} · ${escapeAdminHtml(group.proxyCreatedByRole==='manager'?'매니저':group.proxyCreatedByRole==='developer_admin'?'개발관리자':'관리자')} · 접수 ${formatOrderDateTime(group.createdAt)}</p>`:''}<p><strong>거래처명</strong> ${escapeAdminHtml(group.customerName||'-')}${!group.isProxy?` · <strong>대표자명</strong> ${escapeAdminHtml(group.customerOwnerName||'-')}`:' · <strong>관리자 대신주문</strong>'}</p><p><strong>납품처명</strong> ${escapeAdminHtml(group.deliveryName||'-')}${group.deliveryPhone?` · ${escapeAdminHtml(group.deliveryPhone)}`:''}</p>${group.deliveryAddress?`<p><strong>납품주소</strong> ${escapeAdminHtml(group.deliveryAddress)}</p>`:''}<button type="button" class="cart-btn order-party-edit-toggle" onclick="toggleOrderPartyEditor(${index})">거래처·납품정보 수정</button></div>
        <section class="order-party-editor" id="order-party-editor-${index}" hidden><div class="order-party-edit-grid"><label>거래처명<input data-party="customer" value="${escapeAdminAttr(group.customerName||'')}"></label><label>대표자명<input data-party="owner" value="${escapeAdminAttr(group.customerOwnerName||'')}"></label><label>실제 납품처명<input data-party="delivery" value="${escapeAdminAttr(group.deliveryName||'')}"></label><label>납품처 연락처<input data-party="phone" value="${escapeAdminAttr(group.deliveryPhone||'')}"></label><label class="wide">납품처 주소<input data-party="address" value="${escapeAdminAttr(group.deliveryAddress||'')}"></label><label class="wide">주문 메모<textarea data-party="memo" rows="3">${escapeAdminHtml(group.memo||'')}</textarea></label></div><div class="v3-card-actions"><button type="button" class="cart-btn" onclick="saveOrderPartyInfo('${escapeAdminAttr(group.orderNumber)}',${index})">정보 저장</button><button type="button" class="cart-btn gray-btn" onclick="toggleOrderPartyEditor(${index})">취소</button></div></section>
        ${group.memo ? `<div class="customer-order-memo"><strong>거래처 주문메모</strong><p>${escapeAdminHtml(group.memo).replaceAll("\n", "<br>")}</p></div>` : ""}
        <div class="order-copy-all-row"><span class="copy-button-pair"><button type="button" class="warehouse-copy-button all-warehouse-copy-button" onclick="copyAllWarehouseOrders(this,event,'kakao')">S·B·I 카톡용 전체복사</button><button type="button" class="warehouse-copy-button all-warehouse-copy-button excel-copy-button" onclick="copyAllWarehouseOrders(this,event,'excel')">S·B·I 엑셀용 전체복사</button><button type="button" class="warehouse-copy-button" onclick="copyOrderDetails(this,event,'kakao')">품번·수량·단가 카톡복사</button><button type="button" class="warehouse-copy-button excel-copy-button" onclick="copyOrderDetails(this,event,'excel')">품번·수량·단가 엑셀복사</button></span><small>상세복사는 품번·출고수량·1죽 단가·금액을 함께 복사합니다.</small></div>
        <div class="pick-list">
          ${itemHtml}
        </div>

        <hr>

        <label class="shipping-label">관리자 메모</label>
        <textarea class="customer-note-input" rows="3" maxlength="1000" placeholder="예: 전화요망, 합배송, 후불&#10;Enter를 눌러 다음 줄에 계속 작성할 수 있습니다." onchange="saveOrderNote('${escapeAdminAttr(group.orderNumber)}', this.value, this)">${escapeAdminHtml(customerNotes[group.orderNumber] || "")}</textarea>

        <div class="shipping-editor-actions"><button type="button" class="cart-btn shipping-edit-enable" onclick="enableOrderShippingEdit(${index},${isDone})">배송정보 수정</button></div>
        <label class="shipping-label">배송비</label>
<div class="shipping-fee-control">
  <button type="button" class="shipping-step-btn" onclick="adjustShippingFee(this,-500)" disabled>-500원</button>
  <input
    class="shipping-input"
    type="number"
    step="500"
    value="${Math.max(0,Number(group.shipping_fee||0))}"
    min="0"
    data-order="${group.orderNumber}"
    oninput="recalcOrderCard('order-${index}')" disabled
  >
  <button type="button" class="shipping-step-btn" onclick="adjustShippingFee(this,500)" disabled>+500원</button>
</div>

<label class="shipping-label">택배사</label>
<div class="courier-control">
<select 
  class="courier-select" 
  data-order="${group.orderNumber}"
  onchange="handleCourierChange(this)"
  disabled
>
  ${['로젠택배','CJ대한통운','한진택배','우체국택배','롯데택배','경동택배'].map(name=>`<option value="${name}" ${group.courier===name?'selected':''}>${name}</option>`).join('')}
  <option value="__custom__" ${group.courier && !['로젠택배','CJ대한통운','한진택배','우체국택배','롯데택배','경동택배'].includes(group.courier)?'selected':''}>직접 입력</option>
</select>
<input class="courier-custom-input" type="text" maxlength="50" placeholder="택배사명 직접 입력" value="${group.courier && !['로젠택배','CJ대한통운','한진택배','우체국택배','롯데택배','경동택배'].includes(group.courier)?escapeAdminAttr(group.courier):''}" ${group.courier && !['로젠택배','CJ대한통운','한진택배','우체국택배','롯데택배','경동택배'].includes(group.courier)?'':'hidden'} disabled>
</div>

<label class="shipping-label">송장번호</label>

<input
  class="tracking-input"
  data-order="${group.orderNumber}"
  type="text"
  value="${group.tracking_number || ""}"
  placeholder="송장번호 입력"
  disabled
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

        <button class="cart-btn picking-btn" type="button" ${group.revisionStatus?'disabled title="고객 주문변경 확인을 먼저 완료해주세요"':''} onclick="event.stopPropagation();openPickingAfterShippingSave('${escapeAdminAttr(group.orderNumber)}',${index})">${group.revisionStatus==='수정중'?'고객 수정중':group.revisionStatus==='수정완료'?'변경확인 후 피킹가능':String(group.pickingStatus || '').includes('검증완료') ? '피킹 결과 확인' : group.pickingStatus === '피킹중' ? '피킹 계속하기' : '피킹 시작 지시'}</button>
        ${String(group.pickingStatus || '').includes('검증완료') ? `<button class="cart-btn picking-edit-btn" type="button" onclick="editVerifiedPicking('${escapeAdminAttr(group.orderNumber)}')">일부품절·피킹수량 수정</button>` : ''}
        <button class="cart-btn work-print-btn" type="button" onclick="openWorkSheet('${group.orderNumber}')">출고지별 작업지시서 출력</button>

        ${isDone ? `<button
  class="cart-btn statement-btn"
  type="button"
  onclick="openStatement('${group.orderNumber}')"
>
  거래명세서 출력
</button>` : ''}
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
      alert("출고취소 실패: " + error.message + "\n\nSQL/V6.5.90-REPEAT-SAFE-SHIPPING-UNDO.sql을 Supabase에서 실행했는지 확인해주세요.");
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

async function deletePendingAdminOrder(orderNumber){
  if(!confirm(`주문접수건을 삭제할까요?\n${orderNumber}\n\n피킹을 시작한 주문은 삭제되지 않으며 삭제이력에 보관됩니다.`))return;
  const {data,error}=await supabaseClient.rpc('delete_order_and_restore_inventory',{p_order_number:orderNumber,p_device_name:'관리자 주문관리 주문접수건 삭제'});
  if(error)return alert('주문삭제 실패: '+error.message+'\n\nSQL/V6.5.90-REPEAT-SAFE-SHIPPING-UNDO.sql을 실행했는지 확인해주세요.');
  alert(`주문삭제 완료\n삭제 품목: ${Number(data?.deleted_rows||0)}건`);
  await loadOrders();
}
window.deletePendingAdminOrder=deletePendingAdminOrder;

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
  if(input){input.hidden=select.value!=='__custom__';input.disabled=!detail?.classList.contains('shipping-editing')||input.hidden;if(!input.hidden)input.focus();}
}
function adjustShippingFee(button,delta){
  const detail=button.closest('.order-detail');
  const input=detail?.querySelector('.shipping-input');
  if(!input||input.disabled)return;
  input.value=Math.max(0,(Number(input.value)||0)+Number(delta||0));
  const card=button.closest('.order-card');if(card)recalcOrderCard(card.id);
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
    shipping_fee_manual:true,
    courier:getCourierValue(detail)||'로젠택배',
    tracking_number:detail.querySelector('.tracking-input')?.value.trim()||''
  };
  const fields=detail.querySelectorAll('.shipping-input,.courier-select,.courier-custom-input,.tracking-input');
  fields.forEach(el=>el.classList.add('field-saving'));
  const {error}=await supabaseClient.from('orders').update(payload).eq('order_number',orderNumber);
  fields.forEach(el=>el.classList.remove('field-saving'));
  if(error){fields.forEach(el=>el.classList.add('field-save-error'));console.warn('배송정보 자동저장 실패',error);return false;}
  fields.forEach(el=>{el.classList.remove('field-save-error');el.classList.add('field-save-success');setTimeout(()=>el.classList.remove('field-save-success'),900);});
  return true;
}
window.queueShippingSave=queueShippingSave;

async function openPickingAfterShippingSave(orderNumber,index){
  const detail=document.getElementById(`detail-${index}`);
  if(detail){
    clearTimeout(orderShippingSaveTimers.get(orderNumber));
    const saved=await persistShippingFields(orderNumber,detail);
    if(saved===false){alert('배송비 저장에 실패하여 피킹 화면으로 이동하지 않았습니다. 다시 저장해주세요.');return;}
  }
  location.href=`picking.html?order=${encodeURIComponent(orderNumber)}`;
}
window.openPickingAfterShippingSave=openPickingAfterShippingSave;

async function saveShipping(orderNumber, fee){

    await supabaseClient
    .from("orders")
    .update({
        shipping_fee:Number(fee),
        shipping_fee_manual:true
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

async function autofillNewOrderItem(row){if(!row?.classList.contains('new-order-edit-row')||row.dataset.entryMode==='manual')return;const input=row.querySelector('.order-edit-number'),parsed=splitWarehouseItemNumber(input?.value),key=inventoryKey(parsed.itemNumber);if(!key)return;const found=adminProductCatalogMap.get(key);if(!found)return;const customerId=row.closest('.order-item-editor')?.dataset.customerId||'';let price=Number(found.price||0);if(customerId){try{const {data,error}=await supabaseClient.rpc('get_customer_item_prices_for_admin',{p_customer_id:customerId});if(!error){const special=(data||[]).find(x=>inventoryKey(x.item_number)===key);if(special)price=Number(special.price||price)}}catch(_){}}input.value=`${found.warehouse_code||parsed.warehouseCode||''}${found.warehouse_code||parsed.warehouseCode?'-':''}${found.item_number}`;const priceInput=row.querySelector('.order-edit-price');if(priceInput)priceInput.value=price;updateOrderEditRowTotal(row)}
function bindOrderEditRow(row) {
  const numberInput=row.querySelector('.order-edit-number');if(numberInput&&!numberInput.dataset.autoPriceBound){numberInput.dataset.autoPriceBound='1';numberInput.addEventListener('change',()=>autofillNewOrderItem(row));numberInput.addEventListener('blur',()=>autofillNewOrderItem(row));}
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

function addOrderItemEditRow(index, mode = "auto") {
  const editor = document.getElementById(`order-item-editor-${index}`);
  const rows = editor?.querySelector(".order-edit-rows");
  if (!rows) return;
  const isManual = mode === "manual";
  rows.insertAdjacentHTML("beforeend", `<div class="order-edit-item-row new-order-edit-row ${isManual ? 'manual-order-edit-row' : 'auto-order-edit-row'}" data-order-edit-row data-entry-mode="${isManual ? 'manual' : 'auto'}">
    <input class="order-edit-number" type="text" placeholder="${isManual ? '수기 품번(예: S-1001)' : '등록 품번(예: S-1001)'}">
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
  if(items.some(item=>!['S','B','I'].includes(String(item.warehouse_code||'').toUpperCase())))return alert('기타출고지 발생을 막기 위해 모든 품번 앞에 S-, B-, I- 출고지를 입력해주세요.');
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
let adminRealtimeChannel = null;
let adminRealtimeConnected = false;
let adminRealtimeLastSnapshot = 0;
let adminRealtimeRefreshDelay = null;

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
  const scheduleSnapshot = (delay=900) => {
    clearTimeout(adminRealtimeRefreshDelay);
    adminRealtimeRefreshDelay = setTimeout(() => {
      adminRealtimeLastSnapshot = Date.now();
      refreshAdminOrderStatuses();
    }, delay);
  };
  const applyRealtimeRow = row => {
    if (!row?.order_number) return;
    const card = Array.from(document.querySelectorAll('.order-card[data-order-number]'))
      .find(el => el.dataset.orderNumber === String(row.order_number));
    if (!card) { scheduleSnapshot(); return; }
    const previousRevision = card.dataset.revisionStatus || '';
    updateAdminOrderCardStatus(row.order_number, row.status, row.picking_status, row.customer_revision_status || '');
    if (previousRevision !== String(row.customer_revision_status || '')) scheduleSnapshot(350);
  };
  adminRealtimeLastSnapshot = Date.now();
  adminRealtimeChannel = supabaseClient.channel('admin-orders-live-v6639')
    .on('postgres_changes', {event:'UPDATE', schema:'public', table:'orders'}, event => applyRealtimeRow(event.new || {}))
    .on('postgres_changes', {event:'INSERT', schema:'public', table:'orders'}, () => scheduleSnapshot())
    .on('postgres_changes', {event:'DELETE', schema:'public', table:'orders'}, () => scheduleSnapshot())
    .subscribe(status => {
      adminRealtimeConnected = status === 'SUBSCRIBED';
      if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status) && document.visibilityState === 'visible') scheduleSnapshot(1200);
    });
  // 실시간 연결 장애 시와 5분 안전 점검 때만 보정 조회합니다.
  adminRealtimeTimer = window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (!adminRealtimeConnected || now - adminRealtimeLastSnapshot >= 300000) {
      adminRealtimeLastSnapshot = now;
      refreshAdminOrderStatuses();
    }
  }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      adminRealtimeLastSnapshot = Date.now();
      refreshAdminOrderStatuses();
    }
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
  ['js/session-status.js?v=66040','js/admin-mobile-nav.js?v=66040'].forEach(src=>{const script=document.createElement('script');script.src=src;script.defer=true;document.body.appendChild(script)});
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
    // 대용량 주문 조회가 끝날 때까지 전체 화면을 가리지 않습니다.
    document.body.classList.add("auth-ready");
    document.body.classList.remove("auth-pending","admin-page-leaving");
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
    const orderNumbers=[...new Set(orderRows.map(r=>r.order_number).filter(Boolean))];orderRevisionMap={};orderRevisionHistoryMap={};
    if(orderNumbers.length){const {data,error}=await supabaseClient.from('order_revision_history').select('order_number,original_snapshot,revised_snapshot,revision_status,started_at,completed_at').in('order_number',orderNumbers).order('started_at',{ascending:false});if(error)throw error;(data||[]).forEach(row=>{if(!orderRevisionMap[row.order_number])orderRevisionMap[row.order_number]=row;(orderRevisionHistoryMap[row.order_number]||(orderRevisionHistoryMap[row.order_number]=[])).push(row)});Object.values(orderRevisionHistoryMap).forEach(rows=>rows.sort((a,b)=>new Date(a.completed_at||a.started_at)-new Date(b.completed_at||b.started_at)))}
  }catch(e){console.warn('고객 주문변경 이력 불러오기 실패',e);orderRevisionMap={};orderRevisionHistoryMap={}}
  try{
    const orderNumbers=[...new Set(orderRows.map(r=>r.order_number).filter(Boolean))];orderAdminChangeMap={};orderAdminChangeHistoryMap={};
    if(orderNumbers.length){
      const {data,error}=await supabaseClient.from('order_change_history').select('order_number,change_reason,changed_at,before_snapshot,after_snapshot').in('order_number',orderNumbers).order('changed_at',{ascending:false});
      if(error)throw error;
      (data||[]).forEach(row=>{if(!orderAdminChangeMap[row.order_number])orderAdminChangeMap[row.order_number]=row;(orderAdminChangeHistoryMap[row.order_number]||(orderAdminChangeHistoryMap[row.order_number]=[])).push(row)});Object.values(orderAdminChangeHistoryMap).forEach(rows=>rows.sort((a,b)=>new Date(a.changed_at)-new Date(b.changed_at)));
    }
  }catch(e){console.warn('관리자 주문수정 이력 불러오기 실패',e);orderAdminChangeMap={};orderAdminChangeHistoryMap={}}
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
    <select class="payment-account-select" onchange="changePaymentAccountMode(${index},this.value)" disabled>
      ${options||'<option value="">등록된 계좌 없음</option>'}
      <option value="__manual__" ${hasManual?"selected":""}>직접 입력</option>
    </select>
    <div id="manual-account-${index}" class="manual-account-fields ${hasManual?'show':''}">
      <input class="manual-bank-name" value="${escapeAdminAttr(bank)}" placeholder="은행명" oninput="updatePaymentAccountPreview(${index})" disabled>
      <input class="manual-account-number" value="${escapeAdminAttr(number)}" placeholder="계좌번호" oninput="updatePaymentAccountPreview(${index})" disabled>
      <input class="manual-account-holder" value="${escapeAdminAttr(holder)}" placeholder="예금주" oninput="updatePaymentAccountPreview(${index})" disabled>
    </div>
    <div class="selected-account-preview">${number?`현재 표시: ${escapeAdminHtml(bank)} ${escapeAdminHtml(number)} / ${escapeAdminHtml(holder)}`:'표시할 계좌를 선택하세요.'}</div>
    <button type="button" class="cart-btn account-save-btn" onclick="saveOrderPaymentAccount('${escapeAdminAttr(group.orderNumber)}',${index},${isDone})" hidden>배송정보 저장</button>
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
  box.querySelectorAll('input').forEach(input=>input.disabled=value!=='__manual__'||!box.closest('.order-detail')?.classList.contains('shipping-editing'));
  if(value!=='__manual__'){
    const a=paymentAccounts.find(x=>x.id===value);if(!a)return;
    box.querySelector('.manual-bank-name').value=a.bank_name||'';
    box.querySelector('.manual-account-number').value=a.account_number||'';
    box.querySelector('.manual-account-holder').value=a.account_holder||'';
  }
  updatePaymentAccountPreview(index);
}
function enableOrderShippingEdit(index,isDone=false){
  const detail=document.getElementById(`detail-${index}`);if(!detail)return;
  if(isDone&&!confirm('출고완료 주문의 배송정보를 수정할까요?\n출고상태와 재고는 변경되지 않습니다.'))return;
  detail.classList.add('shipping-editing');
  detail.querySelectorAll('.shipping-input,.shipping-step-btn,.courier-select,.tracking-input,.payment-account-select').forEach(el=>el.disabled=false);
  const courier=detail.querySelector('.courier-select'),custom=detail.querySelector('.courier-custom-input');if(custom)custom.disabled=courier?.value!=='__custom__';
  const account=detail.querySelector('.payment-account-select');detail.querySelectorAll('.manual-account-fields input').forEach(el=>el.disabled=account?.value!=='__manual__');
  const edit=detail.querySelector('.shipping-edit-enable'),save=detail.querySelector('.account-save-btn');if(edit)edit.hidden=true;if(save)save.hidden=false;
}
async function saveOrderPaymentAccount(orderNumber,index,isDone=false){
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
  const hasAnyAccount=Boolean(payload.payment_bank_name||payload.payment_account_number||payload.payment_account_holder);
  if(hasAnyAccount&&(!payload.payment_bank_name||!payload.payment_account_number||!payload.payment_account_holder)){alert('계좌를 입력할 때는 은행명, 계좌번호, 예금주를 모두 입력하세요.');return;}
  // 계좌 저장 시 같은 주문 화면에서 작성 중인 배송정보도 함께 저장합니다.
  // 이전에는 저장 후 주문목록을 다시 그리면서 상세화면이 닫히고,
  // 아직 출고완료 전인 배송비·택배사·송장번호 입력값이 사라졌습니다.
  const shippingInput=detail.querySelector('.shipping-input');
  const courierSelect=detail.querySelector('.courier-select');
  const trackingInput=detail.querySelector('.tracking-input');
  payload.shipping_fee=Number(shippingInput?.value)||0;
  payload.shipping_fee_manual=true;
  payload.courier=getCourierValue(detail)||'로젠택배';
  payload.tracking_number=trackingInput?.value.trim()||'';

  const result=await supabaseClient.rpc('save_order_shipping_bundle',{p_order_number:orderNumber,p_shipping_fee:payload.shipping_fee,p_courier:payload.courier,p_tracking_number:payload.tracking_number,p_payment_account_id:payload.payment_account_id||null,p_payment_account_label:payload.payment_account_label,p_payment_bank_name:payload.payment_bank_name,p_payment_account_number:payload.payment_account_number,p_payment_account_holder:payload.payment_account_holder});const error=result.error;
  if(error){alert('배송정보 저장 실패: SQL/V6.5.89-SHIPPING-EDITOR.sql을 먼저 실행해주세요.\n'+error.message);return;}
  const preview=detail.querySelector('.selected-account-preview');
  if(preview){
    preview.textContent=`저장됨: ${payload.payment_bank_name} ${payload.payment_account_number} / ${payload.payment_account_holder}`;
    preview.classList.add('account-saved-preview');
  }
  const section=detail.querySelector('.order-payment-account');
  if(section){section.dataset.savedAccount=payload.payment_account_id||'manual';}
  detail.classList.remove('shipping-editing');detail.querySelectorAll('.shipping-input,.shipping-step-btn,.courier-select,.courier-custom-input,.tracking-input,.payment-account-select,.manual-account-fields input').forEach(el=>el.disabled=true);
  const editButton=detail.querySelector('.shipping-edit-enable');if(editButton)editButton.hidden=false;
  const saveButton=detail.querySelector('.account-save-btn');
  if(saveButton){
    const originalText=saveButton.textContent;
    saveButton.textContent='저장 완료';
    saveButton.disabled=true;
    setTimeout(()=>{saveButton.textContent=originalText;saveButton.disabled=false;saveButton.hidden=true;},1200);
  }
  alert('입금계좌와 현재 배송정보를 저장했습니다.');
  // 화면을 다시 불러오지 않아 상세 주문 화면과 입력값을 그대로 유지합니다.
}
window.changePaymentAccountMode=changePaymentAccountMode;window.updatePaymentAccountPreview=updatePaymentAccountPreview;window.saveOrderPaymentAccount=saveOrderPaymentAccount;window.enableOrderShippingEdit=enableOrderShippingEdit;
function toggleOrderPartyEditor(index){const box=document.getElementById(`order-party-editor-${index}`);if(box)box.hidden=!box.hidden}
async function saveOrderPartyInfo(orderNumber,index){const box=document.getElementById(`order-party-editor-${index}`);if(!box)return;const value=key=>box.querySelector(`[data-party="${key}"]`)?.value.trim()||'';if(!value('customer'))return alert('거래처명을 입력하세요.');if(!confirm('이 주문의 거래처·납품정보와 메모를 수정할까요?\n단가와 수량은 변경되지 않습니다.'))return;const {error}=await supabaseClient.rpc('admin_update_order_party_info',{p_order_number:orderNumber,p_customer_name:value('customer'),p_owner_name:value('owner'),p_delivery_name:value('delivery'),p_delivery_phone:value('phone'),p_delivery_address:value('address'),p_memo:value('memo')});if(error)return alert('주문 정보 수정 실패: SQL/V6.5.89-ADMIN-ACTIVITY-ORDER-PARTY.sql을 먼저 실행해주세요.\n'+error.message);alert('거래처·납품정보와 메모를 저장했습니다.');loadOrders()}
window.toggleOrderPartyEditor=toggleOrderPartyEditor;window.saveOrderPartyInfo=saveOrderPartyInfo;

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
