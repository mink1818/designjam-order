const supabaseUrl = "https://dtjhuejmxrjkcxzvilgw.supabase.co";
const supabaseKey = "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

const activeOrderResult = document.getElementById("activeOrderResult");
const completedOrderResult = document.getElementById("completedOrderResult");
const completedPeriod = document.getElementById("completedPeriod");
let myOrderGroups = [];
let currentOrderUser = null;
let defaultPaymentAccount = null;
let customerShareDocumentAllowed = false;
const CUSTOMER_SESSION_KEY = "designjam_customer_session";

completedPeriod?.addEventListener("change", renderMyOrders);

async function loadMyOrders() {
  activeOrderResult.innerHTML = "<p>내 주문을 불러오는 중...</p>";
  completedOrderResult.innerHTML = "";

  const { data: sessionData, error: userError } = await supabaseClient.auth.getSession();
  const user = sessionData?.session?.user || null;
  if (userError || !user) {
    sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
    location.replace("login.html");
    return;
  }

  sessionStorage.setItem(CUSTOMER_SESSION_KEY, user.id);
  localStorage.setItem(CUSTOMER_SESSION_KEY, user.id);

  currentOrderUser = user;
  document.body.classList.add("auth-ready");
  try { const {data}=await supabaseClient.from("payment_accounts").select("*").eq("is_default",true).eq("is_active",true).maybeSingle(); defaultPaymentAccount=data||null; } catch(e) { console.warn(e); }

  const { data: customer, error: customerError } = await supabaseClient
    .from("customers")
    .select("business_name, customer_grade")
    .eq("id", user.id)
    .single();

  if (customerError || !customer) {
    activeOrderResult.innerHTML = "<p>거래처 정보를 불러오지 못했습니다.</p>";
    return;
  }

  // 등급명은 거래처 화면에 노출하지 않고 사용 가능한 계정에만 버튼을 표시합니다.
  customerShareDocumentAllowed = ["우수", "우수고객", "VIP", "VVIP"]
    .includes(String(customer.customer_grade || ""));

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
  // 주문내역은 현재 단가표가 아니라 주문 접수 당시 저장된 단가를 유지합니다.
  let data = [...uniqueRows.values()];

  const grouped = {};
  (data || []).forEach(order => {
    if (!grouped[order.order_number]) {
      grouped[order.order_number] = {
        orderNumber: order.order_number,
        customerName: order.customer_name,
        customerOwnerName: order.customer_owner_name || customer.owner_name || customer.representative || '',
        deliveryName: order.delivery_name || order.customer_name || '',
        deliveryPhone: order.delivery_phone || '',
        deliveryAddress: order.delivery_address || '',
        memo: order.memo,
        status: order.status,
        revisionStatus: order.customer_revision_status || '',
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
        completedAt: order.status === "출고완료" ? (order.shipped_at || order.completed_at || order.picking_verified_at || order.created_at) : null,
        items: []
      };
    }
    const currentGroup=grouped[order.order_number];
    if(order.customer_revision_status)currentGroup.revisionStatus=order.customer_revision_status;
    if(order.delivery_name&&(!currentGroup.deliveryName||currentGroup.deliveryName===currentGroup.customerName))currentGroup.deliveryName=order.delivery_name;
    if(order.delivery_phone&&!currentGroup.deliveryPhone)currentGroup.deliveryPhone=order.delivery_phone;
    if(order.delivery_address&&!currentGroup.deliveryAddress)currentGroup.deliveryAddress=order.delivery_address;
    currentGroup.items.push(order);

    if (order.status === "출고완료") {
      grouped[order.order_number].status = "출고완료";
      const completedAt = order.shipped_at || order.completed_at || order.picking_verified_at || order.created_at;
      if (!grouped[order.order_number].completedAt || new Date(completedAt) > new Date(grouped[order.order_number].completedAt)) grouped[order.order_number].completedAt = completedAt;
    } else if (grouped[order.order_number].status !== "출고완료" && order.status) {
      grouped[order.order_number].status = order.status;
    }

    if (new Date(order.created_at) > new Date(grouped[order.order_number].createdAt)) {
      grouped[order.order_number].createdAt = order.created_at;
    }
  });

  Object.values(grouped).forEach(group => group.items.sort((a,b) => String(a.item_number||'').localeCompare(String(b.item_number||''),'ko',{numeric:true,sensitivity:'base'})));
  myOrderGroups = Object.values(grouped).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  renderMyOrders();
}

function renderMyOrders() {
  const activeGroups = myOrderGroups.filter(group => group.status !== "출고완료");
  const completedGroups = myOrderGroups.filter(group =>
    group.status === "출고완료" && isWithinPeriod(group.completedAt || group.createdAt)
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
  if (value !== "today") cutoff.setDate(cutoff.getDate() - Math.max(0, Number(value) - 1));
  return created >= cutoff;
}

function getOrderSummary(group) {
  let qtyTotal = 0;
  let productTotal = 0;
  const itemRows = group.items.map(item => {
    const orderedQty = Math.max(0, Number(item.qty || 0));
    const soldoutQty = Math.min(orderedQty, Math.max(0, Number(item.soldout_qty || (item.is_soldout ? orderedQty : 0))));
    const shippedQty = Math.max(0, orderedQty - soldoutQty);
    const isFullySoldout = orderedQty > 0 && shippedQty === 0;
    const isPartiallySoldout = soldoutQty > 0 && shippedQty > 0;
    const unitPrice = Number(item.price || 0);
    const rowTotal = unitPrice * shippedQty;
    qtyTotal += shippedQty;
    productTotal += rowTotal;
    const soldoutLabel = isFullySoldout ? "전체품절" : isPartiallySoldout ? `일부품절 ${soldoutQty}죽` : "";
    return `<div class="cart-item ${isFullySoldout ? "soldout-item" : isPartiallySoldout ? "partial-soldout-item" : ""}">
      <strong>${escapeHtml(String(item.item_number||'').replace(/^[SBI]-/i,''))}${soldoutLabel ? ` <small class="customer-soldout-label">${soldoutLabel}</small>` : ""}</strong>
      <span>${soldoutQty > 0 ? `주문 ${orderedQty}죽 · 출고 ${shippedQty}죽 · 품절 ${soldoutQty}죽` : `출고 ${shippedQty}죽`} · 단가 ${unitPrice.toLocaleString()}원 / 1죽</span>
      <span>${isFullySoldout ? "-" : rowTotal.toLocaleString() + "원"}</span>
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
  const editable = group.status !== "출고완료" && group.revisionStatus !== '수정완료';
  const pickingStarted = group.items.some(item => Number(item.picked_qty || 0) > 0 || Number(item.soldout_qty || 0) > 0 || !["", "대기"].includes(String(item.picking_status || "대기")));
  return `<article class="completed-order-row active-order-row">
    <button class="completed-order-summary" type="button" onclick="toggleOrderDetail('${id}', this)">
      <span><strong>${formatDate(group.createdAt)}</strong><small>${escapeHtml(group.orderNumber)}</small></span>
      <span class="order-status-badge ${group.revisionStatus?'revision':''}">${escapeHtml(group.revisionStatus==='수정중'?'고객 수정중':group.revisionStatus==='수정완료'?'수정완료·관리자 확인중':group.status||"주문접수")}</span>
      <span>${summary.qtyTotal}죽</span>
      <span>${summary.finalTotal.toLocaleString()}원</span>
      <span class="completed-toggle">상세보기 ▼</span>
    </button>
    <div class="order-quick-actions"><button class="reorder-btn" type="button" onclick="event.stopPropagation();copyCustomerOrderDetails('${group.orderNumber}','kakao',this)">카톡복사</button><button class="reorder-btn" type="button" onclick="event.stopPropagation();copyCustomerOrderDetails('${group.orderNumber}','excel',this)">엑셀복사</button>${customerShareDocumentAllowed?`<button class="reorder-btn" type="button" onclick="event.stopPropagation();openCustomerShareDocument('${group.orderNumber}')">전달용 문서 만들기</button>`:''}</div>
    <div id="${id}" class="completed-order-detail">
      <div class="expanded-order-actions">${editable ? `<button class="reorder-btn danger-btn" type="button" onclick="deletePendingOrder('${group.orderNumber}')">주문 삭제</button><button class="reorder-btn" type="button" onclick="editPendingOrder('${group.orderNumber}')">${group.revisionStatus==='수정중'?'수정 계속하기':'수정하기'}</button>${pickingStarted?'<span class="customer-change-warning">피킹 후 변경 시 관리자에게 즉시 알림·재피킹 처리됩니다.</span>':''}` : `<span class="order-status-badge">${group.status==='출고완료'?'출고완료 후 수정불가':'수정완료·관리자 확인중'}</span>`}<button class="reorder-btn" type="button" onclick="copyOrderToCart('${group.orderNumber}')">이 주문 한 번에 다시 담기</button></div>
      <div class="order-party-summary"><p><strong>거래처:</strong> ${escapeHtml(group.customerName||'-')} · <strong>대표자:</strong> ${escapeHtml(group.customerOwnerName||'-')}</p><p><strong>납품처:</strong> ${escapeHtml(group.deliveryName||'-')}${group.deliveryAddress?` · ${escapeHtml(group.deliveryAddress)}`:''}</p></div>
      ${group.memo ? `<p><strong>메모:</strong> ${escapeHtml(group.memo)}</p>` : ""}
      ${summary.itemRows}
      <p><strong>상품금액:</strong> ${summary.productTotal.toLocaleString()}원</p>
      <p><strong>배송비:</strong> ${Number(group.shippingFee || 0).toLocaleString()}원</p>
      <p><strong>배송정보:</strong> 출고 준비 중입니다</p>
      ${renderOrderBankBox(group)}
      ${editable ? `` : `<p><small>${group.status==='출고완료'?'출고완료 주문은 수정하거나 삭제할 수 없습니다.':'관리자가 변경사항을 확인하면 다시 주문 상태가 표시됩니다.'}</small></p>`}
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
    <p><strong>대표자:</strong> ${escapeHtml(group.customerOwnerName||'-')}</p>
    <p><strong>납품처:</strong> ${escapeHtml(group.deliveryName||'-')}</p>
    ${group.deliveryAddress?`<p><strong>납품주소:</strong> ${escapeHtml(group.deliveryAddress)}</p>`:''}
    <p><strong>메모:</strong> ${escapeHtml(group.memo || "")}</p>
    ${summary.itemRows}
    <hr>
    <h3>출고수량: ${summary.qtyTotal}죽</h3>
    <p><strong>상품금액:</strong> ${summary.productTotal.toLocaleString()}원</p>
    <p><strong>배송비:</strong> ${Number(group.shippingFee).toLocaleString()}원</p>
    <h2 class="price-text">최종금액: ${summary.finalTotal.toLocaleString()}원</h2>
    <p><strong>배송정보:</strong> 출고 준비 중입니다</p>
    ${renderOrderBankBox(group)}
    <button class="reorder-btn" type="button" onclick="copyCustomerOrderDetails('${group.orderNumber}','kakao',this)">품번·수량·단가 카톡복사</button><button class="reorder-btn" type="button" onclick="copyCustomerOrderDetails('${group.orderNumber}','excel',this)">품번·수량·단가 엑셀복사</button>
    ${customerShareDocumentAllowed?`<button class="reorder-btn" type="button" onclick="openCustomerShareDocument('${group.orderNumber}')">거래처 전달용 문서 만들기</button>`:''}
    <button class="reorder-btn" type="button" onclick="copyOrderToCart('${group.orderNumber}')">이 주문 한 번에 다시 담기</button>
  </div>`;
}

function renderCompletedOrder(group) {
  const summary = getOrderSummary(group);
  const id = safeOrderId("completed", group.orderNumber);
  return `<article class="completed-order-row">
    <button class="completed-order-summary" type="button" onclick="toggleOrderDetail('${id}', this)">
      <span><strong>${formatDate(group.completedAt || group.createdAt)}</strong><small>${escapeHtml(group.orderNumber)}</small></span>
      <span>${summary.qtyTotal}죽</span>
      <span>${summary.finalTotal.toLocaleString()}원</span>
      <span class="completed-toggle">상세보기 ▼</span>
    </button>
    <div class="order-quick-actions"><button class="reorder-btn" type="button" onclick="event.stopPropagation();copyCustomerOrderDetails('${group.orderNumber}','kakao',this)">카톡복사</button><button class="reorder-btn" type="button" onclick="event.stopPropagation();copyCustomerOrderDetails('${group.orderNumber}','excel',this)">엑셀복사</button>${customerShareDocumentAllowed?`<button class="reorder-btn" type="button" onclick="event.stopPropagation();openCustomerShareDocument('${group.orderNumber}')">전달용 문서 만들기</button>`:''}</div>
    <div id="${id}" class="completed-order-detail">
      ${summary.itemRows}
      <p><strong>출고수량:</strong> ${summary.qtyTotal.toLocaleString()}죽</p>
      <p><strong>상품금액:</strong> ${summary.productTotal.toLocaleString()}원</p>
      <p><strong>배송비:</strong> ${Number(group.shippingFee).toLocaleString()}원</p>
      <p><strong>최종금액:</strong> ${summary.finalTotal.toLocaleString()}원</p>
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

function openCustomerShareDocument(orderNumber){
  location.href=`customer-share-document.html?order=${encodeURIComponent(orderNumber)}`;
}

async function copyCustomerOrderDetails(orderNumber,mode='excel',button){
 const group=myOrderGroups.find(row=>row.orderNumber===orderNumber);if(!group)return;
 const rows=group.items.map(item=>{const ordered=Number(item.qty||0),soldout=Math.min(ordered,Number(item.soldout_qty||(item.is_soldout?ordered:0))),qty=Math.max(0,ordered-soldout),price=Number(item.price||0);return{item:String(item.item_number||'').replace(/^[SBI]-/i,''),qty,price}}).filter(row=>row.qty>0);
 const text=mode==='kakao'?rows.map(row=>`${row.item}      ${row.qty}죽      ${row.price.toLocaleString()}원      ${(row.qty*row.price).toLocaleString()}원`).join('\n'):['품번\t수량(죽)\t단가(1죽)\t금액',...rows.map(row=>`${row.item}\t${row.qty}\t${row.price}\t${row.qty*row.price}`)].join('\n');
 try{await navigator.clipboard.writeText(text)}catch(_){const area=document.createElement('textarea');area.value=text;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove()}
 const original=button?.textContent;if(button){button.textContent='복사완료';setTimeout(()=>button.textContent=original,1400)}
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

function downloadOrderCsv(){if(!myOrderGroups.length){alert('저장할 주문내역이 없습니다.');return;}const rows=[['주문일','주문번호','상태','품번','수량(죽)','단가(1죽)','금액','택배사','송장번호']];myOrderGroups.forEach(g=>g.items.forEach(i=>rows.push([formatDate(g.createdAt),g.orderNumber,g.status||'',i.item_number,i.qty,i.price,Number(i.price||0)*Number(i.qty||0),g.courier||'',g.trackingNumber||''])));const csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`디자인 삭스_주문내역_${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
document.getElementById('downloadOrdersBtn')?.addEventListener('click',downloadOrderCsv);
window.copyOrderToCart=copyOrderToCart;

async function deletePendingOrder(orderNumber, editing=false){
  const group=myOrderGroups.find(x=>x.orderNumber===orderNumber);if(!group)return;
  if(group.status==='출고완료')return alert('출고완료 주문은 수정하거나 삭제할 수 없습니다.');
  const pickingStarted=group.items.some(item=>Number(item.picked_qty||0)>0||Number(item.soldout_qty||0)>0||!["","대기"].includes(String(item.picking_status||"대기")));
  const prompt=editing?'현재 주문을 장바구니로 옮겨 수정할까요?':'이 주문을 삭제할까요?';
  if(!confirm(`${prompt}${pickingStarted?'\n\n이미 피킹한 주문이므로 피킹·재고가 자동 원복되고 관리자에게 변경 알림이 표시됩니다.':''}`))return;
  const cart=group.items.map(x=>({groupId:null,categoryId:null,title:'주문 수정',number:String(x.item_number),warehouseCode:x.warehouse_code||null,qty:Number(x.qty)||1,price:Number(x.price)||0,imageUrl:''}));
  const {error}=editing
    ? await supabaseClient.rpc('customer_begin_order_revision',{p_order_number:orderNumber})
    : await supabaseClient.rpc('customer_reopen_order_for_change',{p_order_number:orderNumber,p_change_type:'삭제'});
  if(error)return alert(`주문 ${editing?'수정':'삭제'} 준비 실패: ${error.message}\n\nSupabase에서 ${editing?'V6.5.63':'수정된 V6.5.70'} SQL을 먼저 실행해주세요.`);
  if(editing){const revisionKey=`designjam_order_revision_${currentOrderUser.id}`;let continuing=false;try{continuing=JSON.parse(localStorage.getItem(revisionKey)||'null')?.orderNumber===orderNumber}catch(_){}if(!continuing)localStorage.setItem(`designjam_cart_${currentOrderUser.id}`,JSON.stringify(cart));const deliveryDraft={deliveryName:group.deliveryName||group.customerName||'',deliveryPhone:group.deliveryPhone||'',deliveryAddress:group.deliveryAddress||''};localStorage.setItem('designjam_customer_bulk_delivery_draft',JSON.stringify(deliveryDraft));localStorage.setItem(revisionKey,JSON.stringify({orderNumber,startedAt:new Date().toISOString(),...deliveryDraft}));}
  if(editing)location.href='catalog.html';else{const revisionKey=`designjam_order_revision_${currentOrderUser.id}`;try{if(JSON.parse(localStorage.getItem(revisionKey)||'null')?.orderNumber===orderNumber)localStorage.removeItem(revisionKey)}catch(_){}await loadMyOrders()}
}
function editPendingOrder(orderNumber){return deletePendingOrder(orderNumber,true)}
window.deletePendingOrder=deletePendingOrder;window.editPendingOrder=editPendingOrder;
