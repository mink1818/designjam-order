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
let statementDefaultAccount = null;
let currentStatementOrderNumber = "거래명세서";

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

async function checkAdminAccess() {
  const {
    data: { user },
    error: userError
  } = await supabaseClient.auth.getUser();

  const sessionUserId = sessionStorage.getItem(ADMIN_SESSION_KEY);

  if (userError || !user || sessionUserId !== user.id) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    if (user) await supabaseClient.auth.signOut();
    location.replace("admin.html");
    return false;
  }

  const { data: customer, error: customerError } =
    await supabaseClient
      .from("customers")
      .select("is_admin, blocked")
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
  const params = new URLSearchParams(location.search);
  const orderNumber = params.get("order");
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

  try { const {data}=await supabaseClient.from("payment_accounts").select("*").eq("is_default",true).eq("is_active",true).maybeSingle(); statementDefaultAccount=data||null; } catch(e) { console.warn(e); }
  let productGroups = [];
  try {
    const result = await supabaseClient.from("product_groups").select("title,item_numbers");
    if (!result.error) productGroups = result.data || [];
  } catch (_) {}
  renderStatement(data, productGroups);
}

function renderStatement(items, productGroups = []) {
  const first = items[0];

  const productTotal = items.reduce((sum, item) => {
    const orderedQty = Number(item.qty || 0);
    const soldoutQty = Math.min(orderedQty, Math.max(0, Number(item.soldout_qty || (item.is_soldout ? orderedQty : 0))));
    const shippedQty = Math.max(0, orderedQty - soldoutQty);
    return sum + Number(item.price || 0) * shippedQty;
  }, 0);

  const shippingFee =
    Number(first.shipping_fee || 0);

  const finalTotal =
    productTotal + shippingFee;

  const totalQty = items.reduce((sum, item) => {
    const orderedQty = Number(item.qty || 0);
    const soldoutQty = Math.min(orderedQty, Math.max(0, Number(item.soldout_qty || (item.is_soldout ? orderedQty : 0))));
    return sum + Math.max(0, orderedQty - soldoutQty);
  }, 0);

  const groupByItem = new Map();
  productGroups.forEach(group => (group.item_numbers || []).forEach(number => groupByItem.set(String(number).trim(), group.title || "개별품번")));
  const compactRows = new Map();
  items.forEach(item => {
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
    const displayNumber = item.warehouse_code ? `${String(item.warehouse_code).toUpperCase()}-${item.item_number}` : item.item_number;
    row.itemNumbers.push(`${displayNumber}${orderedQty !== 1 ? `(${orderedQty})` : ""}${soldoutQty ? `[품절 ${soldoutQty}]` : ""}`);
  });
  const itemRows = [...compactRows.values()].map((row, index) => {
    return `
      <tr class="${row.shippedQty === 0 ? "soldout-row" : ""}">
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(row.category)}</strong></td>
        <td class="statement-item-list">${escapeHtml(row.itemNumbers.join(", "))}</td>
        <td>${row.shippedQty.toLocaleString()}죽${row.soldoutQty ? ` / 품절 ${row.soldoutQty}죽` : ""}</td>
        <td>${row.price.toLocaleString()}원 / 1죽</td>
        <td>${row.shippedQty > 0 ? row.rowTotal.toLocaleString() + "원" : "-"}</td>
      </tr>
    `;
  }).join("");

  statementArea.innerHTML = `
    <header class="statement-header">
      <div>
        <h1>거래명세서</h1>
        <p>디자인 삭스</p>
      </div>

      <div class="statement-date">
        작성일<br>
        ${formatDate(new Date(), true)}
      </div>
    </header>

    <section class="customer-info">
      <div>
        <strong>거래처</strong>
        <span>${escapeHtml(first.customer_name || "-")}</span>
      </div>

      <div>
        <strong>주문번호</strong>
        <span>${escapeHtml(first.order_number)}</span>
      </div>

      <div>
        <strong>주문일</strong>
        <span>${formatDate(first.created_at)}</span>
      </div>

      <div>
        <strong>주문상태</strong>
        <span>${escapeHtml(first.status || "-")}</span>
      </div>

      <div class="full-row">
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
          <th>단가(1죽)</th>
          <th>금액</th>
        </tr>
      </thead>

      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <section class="statement-bottom-grid">
      <div class="statement-logistics-column">
        ${renderStatementBankBox(first)}

        <section class="delivery-info shipping-info">
          <p>
            <strong>택배사:</strong>
            ${escapeHtml(first.courier || "-")}
          </p>

          <p>
            <strong>송장번호:</strong>
            ${escapeHtml(first.tracking_number || "-")}
          </p>
        </section>
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

    <footer class="statement-footer">
      <p>상기 내용과 같이 거래하였음을 확인합니다.</p>
      <h2>디자인 삭스</h2>
    </footer>
  `;
}

function renderStatementBankBox(first){
  const bankName=first.payment_bank_name||statementDefaultAccount?.bank_name||"";
  const account=first.payment_account_number||statementDefaultAccount?.account_number||"";
  const holder=first.payment_account_holder||statementDefaultAccount?.account_holder||"";
  if(!account)return "";
  return `<section class="delivery-info bank-transfer-box"><p><strong>입금 계좌:</strong> ${escapeHtml(bankName)} ${escapeHtml(account)}</p><p><strong>예금주:</strong> ${escapeHtml(holder)}</p></section>`;
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
    const canvas = await window.html2canvas(statementArea, {
      backgroundColor: "#ffffff",
      scale: Math.min(1.5, Math.max(1, window.devicePixelRatio || 1)),
      useCORS: true,
      logging: false,
      windowWidth: statementArea.scrollWidth,
      windowHeight: statementArea.scrollHeight,
      scrollX: 0,
      scrollY: 0
    });
    const link = document.createElement("a");
    link.download = `${String(currentStatementOrderNumber).replace(/[^0-9A-Za-z가-힣_-]/g, "_")}_거래명세서_전체.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
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

  location.href = "admin.html";
}

async function startStatementPage() {
  const allowed = await checkAdminAccess();

  if (!allowed) return;

  await loadStatement();
}

startStatementPage();
