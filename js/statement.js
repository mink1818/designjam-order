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
let currentStatementProfile = null;
let statementAdvancedAllowed = false;
const statementParams = new URLSearchParams(location.search);
const customerStatementMode = statementParams.get("customer") === "1";

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

async function checkStatementAccess() {
  const {
    data: { user },
    error: userError
  } = await supabaseClient.auth.getUser();

  if (userError || !user) {
    location.replace(customerStatementMode ? "login.html" : "admin.html");
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

  const customerAllowed = !customerError && customer?.is_admin !== true && customer?.approved === true && customer?.blocked !== true;
  if (customerStatementMode ? !customerAllowed : (!emailAllowed && !databaseAllowed)) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    await supabaseClient.auth.signOut();
    location.replace(customerStatementMode ? "login.html" : "admin.html");
    return false;
  }

  statementAdvancedAllowed = !customerStatementMode || ["우수","VIP"].includes(String(customer?.customer_grade || "일반"));

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
  if (currentStatementCustomerId) {
    try {
      const profileResult = await supabaseClient.from("customer_statement_profiles").select("*").eq("customer_id", currentStatementCustomerId).maybeSingle();
      if (!profileResult.error) currentStatementProfile = profileResult.data || null;
    } catch (_) {}
  }
  let productGroups = [];
  try {
    const result = await supabaseClient.from("product_groups").select("title,item_numbers");
    if (!result.error) productGroups = result.data || [];
  } catch (_) {}
  // 거래명세서는 현재 단가표가 아니라 주문 접수 당시 orders.price를 그대로 사용합니다.
  renderStatement(data, productGroups);
  enableCustomerStatementEditing();
}

function enableCustomerStatementEditing(){
 document.body.classList.add('customer-statement-mode');
 const notice=document.getElementById('statementModeNotice');
 if(!statementAdvancedAllowed){if(notice)notice.textContent='거래명세서 정보 저장·편집은 우수고객 이상에서 사용할 수 있습니다.';return;}
 if(notice)notice.textContent='수정한 거래처·대표자·주소·하단 상호는 저장 후 재로그인해도 유지됩니다.';
 document.getElementById('saveStatementProfileBtn')?.removeAttribute('hidden');
 statementArea.querySelectorAll('[data-profile-field]').forEach(node=>{node.contentEditable='true';node.spellcheck=false;node.title='눌러서 수정한 뒤 상단의 정보 저장을 누르세요.'});
}

async function saveStatementProfile(){
  if(!statementAdvancedAllowed || !currentStatementCustomerId)return;
  const value=field=>statementArea.querySelector(`[data-profile-field="${field}"]`)?.textContent?.trim()||null;
  const payload={customer_id:currentStatementCustomerId,customer_name:value('customer_name'),owner_name:value('owner_name'),delivery_address:value('delivery_address'),brand_name:value('brand_name'),footer_name:value('footer_name'),updated_at:new Date().toISOString()};
  const {error}=await supabaseClient.from('customer_statement_profiles').upsert(payload,{onConflict:'customer_id'});
  if(error)return alert('거래명세서 정보 저장 실패: '+error.message+'\n\nSQL/V6.5.48-CUSTOMER-PREMIUM-STATEMENT.sql을 먼저 실행하세요.');
  currentStatementProfile=payload;alert('거래명세서 정보가 저장되었습니다. 다음 로그인 후에도 유지됩니다.');
}

function renderStatement(items, productGroups = []) {
  const first = items[0];
  const profile = currentStatementProfile || {};
  const customerName = profile.customer_name || first.customer_name || "거래처";
  const ownerName = profile.owner_name || first.customer_owner_name || "-";
  const deliveryAddress = profile.delivery_address || first.delivery_address || "-";
  const brandName = profile.brand_name || "디자인 삭스";
  const footerName = profile.footer_name || brandName;
  currentStatementCustomerName = customerName;

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
    const displayNumber = String(item.item_number || '').replace(/^[SBI]-/i,'');
    row.itemNumbers.push(`${displayNumber}-(${orderedQty})${soldoutQty ? `[품절 ${soldoutQty}]` : ""}`);
  });
  const itemRows = [...compactRows.values()].map((row, index) => {
    return `
      <tr class="${row.shippedQty === 0 ? "soldout-row" : ""}">
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(row.category)}</strong></td>
        <td class="statement-item-list">${escapeHtml(row.itemNumbers.join(", "))}</td>
        <td>${row.shippedQty.toLocaleString()}죽${row.soldoutQty ? ` / 품절 ${row.soldoutQty}죽` : ""}</td>
        <td class="statement-unit-price">${row.price.toLocaleString()}원/죽</td>
        <td>${row.shippedQty > 0 ? row.rowTotal.toLocaleString() + "원" : "-"}</td>
      </tr>
    `;
  }).join("");

  statementArea.innerHTML = `
    <header class="statement-header">
      <div>
        <h1>거래명세서</h1>
        <p data-profile-field="brand_name">${escapeHtml(brandName)}</p>
      </div>

      <div class="statement-date">
        작성일<br>
        ${formatDate(new Date(), true)}
      </div>
    </header>

    <section class="customer-info">
      <div>
        <strong>거래처</strong>
        <span data-profile-field="customer_name">${escapeHtml(customerName)}</span>
      </div>

      <div>
        <strong>대표자</strong>
        <span data-profile-field="owner_name">${escapeHtml(ownerName)}</span>
      </div>

      <div><strong>납품주소</strong><span data-profile-field="delivery_address">${escapeHtml(deliveryAddress)}</span></div>

      <div>
        <strong>주문번호</strong>
        <span>${escapeHtml(first.order_number)}</span>
      </div>

      <div>
        <strong>주문일</strong>
        <span>${formatDate(first.created_at, true)}</span>
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
          <th>단가/죽</th>
          <th>금액</th>
        </tr>
      </thead>

      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <section class="statement-bottom-grid statement-summary-only">
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

  location.href = customerStatementMode ? "order.html" : "admin.html?view=orders";
}

async function startStatementPage() {
  const allowed = await checkStatementAccess();

  if (!allowed) return;

  await loadStatement();
}

startStatementPage();
