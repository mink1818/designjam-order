const supabaseUrl =
  "https://dtjhuejmxrjkcxzvilgw.supabase.co";

const supabaseKey =
  "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";

const supabaseClient = window.supabase.createClient(
  supabaseUrl,
  supabaseKey
);

const ADMIN_SESSION_KEY = "designjam_admin_session";

const DESIGNJAM_ADMIN_EMAILS = new Set([
  "900smk@naver.com",
  "sm0727sm@hanmail.net",
  "p1028p@naver.com"
]);

function isDesignjamAdminEmail(email) {
  return DESIGNJAM_ADMIN_EMAILS.has(String(email || "").trim().toLowerCase());
}


const statementArea =
  document.getElementById("statementArea");
let currentStatementOrderNumber = "거래명세서";
let currentStatementCustomerName = "거래처";
let currentStatementCustomerId = null;
const statementParams = new URLSearchParams(location.search);
let statementLogistics = { bank:null, courier:"", tracking:"" };

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value, dateOnly = false) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  if (dateOnly) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}. ${m}. ${d}.`;
  }
  return date.toLocaleString("ko-KR");
}

function cleanStatementItemNumber(value) {
  return String(value || "").trim().replace(/^([SBI])[-_\s]+(?=[A-Z0-9])/i, "");
}
function compareStatementItemNumber(a,b){
  return cleanStatementItemNumber(a).localeCompare(cleanStatementItemNumber(b),"ko",{numeric:true,sensitivity:"base"});
}

function resolveStatementCategoryLine(title, itemNumber) {
  const original = String(title || "개별품번").trim();
  const segments = original.split(/[,，\n]+/).map(value => value.trim()).filter(Boolean);
  if (segments.length < 2) return original;
  const cleanItem = cleanStatementItemNumber(itemNumber).replace(/[AM]$/i, "");
  const itemNumeric = Number(cleanItem.match(/\d+/)?.[0]);
  if (!Number.isFinite(itemNumeric)) return original;
  const matched = segments.find(segment => {
    const numbers = [...segment.matchAll(/\d+/g)].map(match => Number(match[0]));
    if (!numbers.length) return false;
    if (numbers.length >= 2 && /[~～〜-]/.test(segment)) {
      const start = Math.min(numbers[0], numbers[1]);
      const end = Math.max(numbers[0], numbers[1]);
      return itemNumeric >= start && itemNumeric <= end;
    }
    return numbers.includes(itemNumeric);
  });
  return matched || original;
}

async function checkStatementAccess() {
  const {
    data: { user },
    error: userError
  } = await supabaseClient.auth.getUser();

  if (userError || !user) {
    location.replace("admin.html");
    return false;
  }

  const { data: customer, error: customerError } =
    await supabaseClient
      .from("customers")
      .select("is_admin, blocked, approved, customer_grade")
      .eq("id", user.id)
      .single();

  const emailAllowed = isDesignjamAdminEmail(user.email);
  const databaseAllowed = !customerError && customer?.is_admin === true && customer?.blocked !== true;

  if (!emailAllowed && !databaseAllowed) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    await supabaseClient.auth.signOut();
    location.replace("admin.html");
    return false;
  }

  document.body.classList.add("auth-ready");
  return true;
}

async function loadStatement() {
  const orderNumber = statementParams.get("order");
  currentStatementOrderNumber = orderNumber || "거래명세서";

  if (!orderNumber) {
    statementArea.innerHTML = `
      <h2>주문번호가 없습니다.</h2>
      <p>관리자 주문관리 화면에서 거래명세서를 열어주세요.</p>
    `;
    return;
  }

  const { data, error } = await supabaseClient
    .from("orders")
    .select("*")
    .eq("order_number", orderNumber)
    .order("id", { ascending: true });

  if (error) {
    statementArea.innerHTML = `
      <h2>거래명세서 불러오기 실패</h2>
      <p>${escapeHtml(error.message)}</p>
    `;
    return;
  }

  if (!data || data.length === 0) {
    statementArea.innerHTML = `
      <h2>주문을 찾을 수 없습니다.</h2>
      <p>${escapeHtml(orderNumber)}</p>
    `;
    return;
  }

  currentStatementCustomerId = data[0].customer_id || null;
  try {
    const account = data[0].payment_account_number ? {bank_name:data[0].payment_bank_name,account_number:data[0].payment_account_number,account_holder:data[0].payment_account_holder} : (await supabaseClient.from("payment_accounts").select("bank_name,account_number,account_holder").eq("is_default",true).eq("is_active",true).maybeSingle()).data;
    statementLogistics={bank:account||null,courier:data[0].courier||"",tracking:data[0].tracking_number||""};
  } catch (_) { statementLogistics={bank:null,courier:data[0].courier||"",tracking:data[0].tracking_number||""}; }
  let productGroups = [];
  try {
    const result = await supabaseClient.from("product_groups").select("title,item_numbers");
    if (!result.error) productGroups = result.data || [];
  } catch (_) {}
  let customerOwnerName = data[0].customer_owner_name || "";
  if (!customerOwnerName && data[0].customer_id) {
    try {
      const profile = await supabaseClient.from("customers").select("owner_name,representative").eq("id", data[0].customer_id).maybeSingle();
      customerOwnerName = profile.data?.owner_name || profile.data?.representative || "";
    } catch (_) {}
  }
  // 거래명세서는 현재 단가표가 아니라 주문 접수 당시 orders.price를 그대로 사용합니다.
  renderStatement(data, productGroups, customerOwnerName);
}

function renderStatement(items, productGroups = [], customerOwnerName = "") {
  const first = items[0];
  const customerName = first.customer_name || "거래처";
  const actualDeliveryName = first.delivery_name || "-";
  const brandName = "디자인 삭스", footerName = brandName, statementTitle = "거래명세서", confirmationText = "상기 내용과 같이 거래하였음을 확인합니다.";
  currentStatementCustomerName = customerName;

  const productTotal = items.reduce((sum, item) => {
    const orderedQty = Number(item.qty || 0);
    const soldoutQty = Math.min(orderedQty, Math.max(0, Number(item.soldout_qty || (item.is_soldout ? orderedQty : 0))));
    const shippedQty = Math.max(0, orderedQty - soldoutQty);
    return sum + Number(item.price || 0) * shippedQty;
  }, 0);

  const savedShippingRow = items.find(item => item.shipping_fee_manual === true);
  const shippingFee = savedShippingRow
    ? Math.max(0, Number(savedShippingRow.shipping_fee || 0))
    : 4000;

  const finalTotal =
    productTotal + shippingFee;

  const totalQty = items.reduce((sum, item) => {
    const orderedQty = Number(item.qty || 0);
    const soldoutQty = Math.min(orderedQty, Math.max(0, Number(item.soldout_qty || (item.is_soldout ? orderedQty : 0))));
    return sum + Math.max(0, orderedQty - soldoutQty);
  }, 0);

  const groupByItem = new Map();
  productGroups.forEach(group => (group.item_numbers || []).forEach(number => groupByItem.set(String(number).trim(), resolveStatementCategoryLine(group.title || "개별품번", number))));
  const compactRows = new Map();
  [...items].sort((a,b)=>compareStatementItemNumber(a.item_number,b.item_number)).forEach(item => {
    const orderedQty = Number(item.qty || 0);
    const soldoutQty = Math.min(orderedQty, Math.max(0, Number(item.soldout_qty || (item.is_soldout ? orderedQty : 0))));
    const shippedQty = Math.max(0, orderedQty - soldoutQty);
    const category = groupByItem.get(String(item.item_number).trim()) || "개별품번";
    const price = Number(item.price || 0);
    const key = `${category}\u0000${price}`;
    if (!compactRows.has(key)) compactRows.set(key, { category, price, shippedQty: 0, soldoutQty: 0, itemNumbers: [], rowTotal: 0 });
    const row = compactRows.get(key);
    row.shippedQty += shippedQty;
    row.soldoutQty += soldoutQty;
    row.rowTotal += price * shippedQty;
    const cleanNumber = cleanStatementItemNumber(item.item_number);
    const displayNumber = /A$/i.test(cleanNumber)?`${cleanNumber.slice(0,-1)} 아동`:/M$/i.test(cleanNumber)?`${cleanNumber.slice(0,-1)} 무지`:cleanNumber;
    row.itemNumbers.push(`${displayNumber}-(${orderedQty})${soldoutQty ? `[품절 ${soldoutQty}]` : ""}`);
  });
  const sortedCompactRows=[...compactRows.values()].map(row=>({...row,itemNumbers:row.itemNumbers.sort(compareStatementItemNumber)})).sort((a,b)=>compareStatementItemNumber(a.itemNumbers[0],b.itemNumbers[0]));
  const itemRows = sortedCompactRows.map((row, index) => {
    return `
      <tr class="${row.shippedQty === 0 ? "soldout-row" : ""}">
        <td>${index + 1}</td>
        <td class="statement-category"><strong>${escapeHtml(row.category)}</strong></td>
        <td class="statement-item-list">${escapeHtml(row.itemNumbers.join(", "))}</td>
        <td class="statement-qty"><span>${row.shippedQty.toLocaleString()}죽</span>${row.soldoutQty ? `<small>품절 ${row.soldoutQty}죽</small>` : ""}</td>
        <td class="statement-unit-price"><span>${row.price.toLocaleString()}원</span><small>/죽</small></td>
        <td class="statement-row-total">${row.shippedQty > 0 ? `<span>${row.rowTotal.toLocaleString()}</span><small>원</small>` : "-"}</td>
      </tr>
    `;
  }).join("");

  statementArea.innerHTML = `
    <header class="statement-header">
      <div>
        <h1 data-profile-field="statement_title">${escapeHtml(statementTitle)}</h1>
        <p data-profile-field="brand_name">${escapeHtml(brandName)}</p>
      </div>

      <div class="statement-date">
        작성일<br>
        ${formatDate(new Date(), true)}
      </div>
    </header>

    <section class="customer-info statement-info-grid">
      <div class="statement-party-row info-customer">
        <strong>거래처명</strong>
        <span data-profile-field="customer_name">${escapeHtml(customerName)}</span>
      </div>

      <div class="info-order-date">
        <strong>주문일</strong>
        <span>${formatDate(first.created_at, true)}</span>
      </div>

      <div class="statement-party-row info-delivery">
        <strong>실제납품처</strong>
        <span data-profile-field="delivery_name">${escapeHtml(actualDeliveryName)}</span>
      </div>

      <div class="info-owner-name">
        <strong>대표자명</strong>
        <span>${escapeHtml(customerOwnerName || first.customer_owner_name || "-")}</span>
      </div>

      <div class="info-order-number">
        <strong>주문번호</strong>
        <span>${escapeHtml(first.order_number)}</span>
      </div>

      <div class="info-order-status">
        <strong>주문상태</strong>
        <span>${escapeHtml(first.status || "-")}</span>
      </div>

      <div class="full-row info-memo">
        <strong>메모</strong>
        <span>${escapeHtml(first.memo || "-")}</span>
      </div>
    </section>

    <table class="statement-table">
      <caption>모든 단가와 금액은 1죽 단가를 기준으로 계산됩니다.</caption>
      <thead>
        <tr>
          <th>번호</th>
          <th>카테고리</th>
          <th>해당 품번</th>
          <th>수량(죽)</th>
          <th>단가/죽</th>
          <th>금액</th>
        </tr>
      </thead>

      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <section class="statement-bottom-grid">
      <div class="statement-logistics-column">
        ${statementLogistics.bank?.account_number?`<div class="bank-transfer-box"><strong>입금 계좌</strong><p>${escapeHtml(statementLogistics.bank.bank_name||'')} ${escapeHtml(statementLogistics.bank.account_number)}</p><p>예금주: ${escapeHtml(statementLogistics.bank.account_holder||'')}</p></div>`:''}
        <div class="delivery-info"><strong>택배정보</strong><p>택배사: ${escapeHtml(statementLogistics.courier||'-')}</p><p>송장번호: ${escapeHtml(statementLogistics.tracking||'-')}</p></div>
      </div>
      <section class="statement-summary">
        <div>
          <span>출고수량</span>
          <strong>${totalQty.toLocaleString()}죽</strong>
        </div>

        <div>
          <span>상품금액</span>
          <strong>${productTotal.toLocaleString()}원</strong>
        </div>

        <div>
          <span>배송비</span>
          <strong>${shippingFee.toLocaleString()}원</strong>
        </div>

        <div class="final-row">
          <span>최종금액</span>
          <strong>${finalTotal.toLocaleString()}원</strong>
        </div>
      </section>
    </section>

    <section class="statement-manual-memo">
      <strong>수기메모</strong>
      <div contenteditable="true" role="textbox" aria-label="수기메모" data-placeholder="거래명세서에 추가할 내용을 직접 입력하세요."></div>
    </section>

    <footer class="statement-footer">
      <p data-profile-field="confirmation_text">${escapeHtml(confirmationText)}</p>
      <h2 data-profile-field="footer_name">${escapeHtml(footerName)}</h2>
    </footer>
  `;
}

function printStatement() {
  const originalTitle = document.title;
  document.title = " ";
  document.body.classList.add("statement-printing");

  const restore = () => {
    document.title = originalTitle;
    document.body.classList.remove("statement-printing");
    window.removeEventListener("afterprint", restore);
  };

  window.addEventListener("afterprint", restore);
  window.print();
  setTimeout(restore, 1500);
}

async function saveStatementImage(button) {
  if (!window.html2canvas) return alert("이미지 저장 기능을 불러오지 못했습니다. 인터넷 연결 후 새로고침해주세요.");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "전체 화면 만드는 중...";
  try {
    const now=new Date(),date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    const baseName=`${String(currentStatementCustomerName).replace(/[^0-9A-Za-z가-힣_-]/g, "_")}_${date}_거래명세서`;
    const clone=statementArea.cloneNode(true);
    clone.classList.add('statement-image-export');
    clone.style.cssText='position:fixed;left:-10000px;top:0;width:1000px;max-width:none;background:#fff;color:#111;z-index:-1';
    document.body.appendChild(clone);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const width=Math.max(1000,clone.scrollWidth),height=Math.max(1,clone.scrollHeight);
    // Chrome/Edge 캔버스 한 변 한계보다 여유 있게 30,000px 안에서 최대 3배 고해상도를 적용합니다.
    const scale=Math.max(.1,Math.min(3,30000/height,12000/width));
    button.textContent=`한 장 고해상도 저장 중 (${scale.toFixed(1)}배)`;
    const canvas=await window.html2canvas(clone,{backgroundColor:'#ffffff',scale,useCORS:true,logging:false,windowWidth:width,windowHeight:height,scrollX:0,scrollY:0});
    clone.remove();
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('이미지 변환 실패')),'image/png'));
    const link=document.createElement('a');
    link.download=`${baseName}.png`;link.href=URL.createObjectURL(blob);link.click();setTimeout(()=>URL.revokeObjectURL(link.href),5000);
    button.textContent = "이미지 저장 완료";
  } catch (error) {
    console.error(error);
    alert("긴 화면 이미지 저장에 실패했습니다. 다시 시도해주세요.");
    button.textContent = original;
  } finally {
    button.disabled = false;
    setTimeout(() => { button.textContent = original; }, 1600);
  }
}

function closeStatement() {
  if (window.opener && !window.opener.closed) {
    window.opener.focus();
    window.close();
    return;
  }

  location.href = "admin.html?view=orders";
}

async function startStatementPage() {
  document.title = "관리자 거래명세서";
  const allowed = await checkStatementAccess();

  if (!allowed) return;

  await loadStatement();
}

startStatementPage();
