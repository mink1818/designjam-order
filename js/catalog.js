const ADMIN_PREVIEW_MODE = new URLSearchParams(location.search).get("adminPreview") === "1";

function updateAdminPreviewBanner() {
  const banner = document.getElementById("adminPreviewBanner");
  if (banner) banner.hidden = !ADMIN_PREVIEW_MODE;
  document.body.classList.toggle("admin-preview-mode", ADMIN_PREVIEW_MODE);

  if (ADMIN_PREVIEW_MODE) {
    const orderButton = document.querySelector("[data-customer-orders-button]");
    if (orderButton) {
      orderButton.textContent = "내 주문조회";
      orderButton.onclick = renderOrderHistoryPreview;
    }

    const logoutButton = document.querySelector("[data-customer-logout-button]");
    if (logoutButton) {
      logoutButton.hidden = true;
      logoutButton.setAttribute("aria-hidden", "true");
    }
  }
}
const supabaseUrl =
  "https://dtjhuejmxrjkcxzvilgw.supabase.co";

const supabaseKey =
  "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";

const supabaseClient = window.supabase.createClient(
  supabaseUrl,
  supabaseKey
);

const catalogList = document.getElementById("catalogList");
const catalogSearch = document.getElementById("catalogSearch");
const catalogFilters = document.getElementById("catalogFilters");

let mainCategories = [];
let categories = [];
let groups = [];
let cart = [];
let orderSubmissionInProgress = false;
let customerBulkApplyInProgress = false;
let lastCustomerBulkApplySignature = "";

let currentScreen = "home-menu";
let cartReturnState = null;
let currentBrand = "전체브랜드";
let currentProductSort = "default";
let catalogHistoryReady = false;
let selectedHomeBrands = new Set();
let homeBrandSearchKeyword = "";
let detailReturnScreen = "all-products";
let detailReturnState = null;
let activeMainCategoryId = null;
let currentUser = null;
let currentCustomer = null;
let favoriteMainCategoryIds = new Set();
let customerItemPriceMap = new Map();
function customerPriceKey(value) { return String(value ?? "").trim().normalize("NFKC").toUpperCase().replace(/^([SBI])[-_\s]+(?=[A-Z0-9])/, ""); }
async function fetchMyCustomerPricesPaged(userId) {
  const rows=[];let rpcError=null;
  for(let from=0;;from+=1000){const result=await supabaseClient.rpc("get_my_customer_item_prices").range(from,from+999);if(result.error){rpcError=result.error;break}rows.push(...(result.data||[]));if(!result.data||result.data.length<1000)return rows;}
  rows.length=0;
  for(let from=0;;from+=1000){const result=await supabaseClient.from("customer_item_prices").select("item_number,price").eq("customer_id",userId).order("item_number",{ascending:true}).range(from,from+999);if(result.error)throw new Error(result.error.message||rpcError?.message||"거래처별 전용단가 조회 실패");rows.push(...(result.data||[]));if(!result.data||result.data.length<1000)return rows;}
}
function effectiveItemPrice(group, itemNumber) { return Number(customerItemPriceMap.get(customerPriceKey(itemNumber)) ?? group?.price ?? 0); }
function refreshSavedCartPrices() {
  let changed = false;
  cart.forEach(item => {
    const warehouseCode=inferCartWarehouseCode(item);if(warehouseCode&&item.warehouseCode!==warehouseCode){item.warehouseCode=warehouseCode;changed=true}
    const group = groups.find(groupItem => Number(groupItem.id) === Number(item.groupId));
    if (!group) return;
    const nextPrice = effectiveItemPrice(group, item.number);
    if (Number(item.price) !== Number(nextPrice)) { item.price = Number(nextPrice); changed = true; }
  });
  if (changed) saveCart();
}
function inferCartWarehouseCode(item){const saved=String(item?.warehouseCode||item?.warehouse_code||'').trim().toUpperCase();if(['S','B','I'].includes(saved))return saved;const prefix=String(item?.number||'').trim().toUpperCase().match(/^([SBI])(?:[-_\s]|(?=\d))/)?.[1];if(prefix)return prefix;const group=groups.find(row=>Number(row.id)===Number(item?.groupId)),groupCode=String(group?.warehouse_code||'').trim().toUpperCase();if(['S','B','I'].includes(groupCode))return groupCode;const key=customerPriceKey(item?.number),codes=new Set();groups.forEach(row=>{const numbers=Array.isArray(row.item_numbers)?row.item_numbers:String(row.item_numbers||'').split(/[,\s/]+/);if(numbers.some(number=>customerPriceKey(number)===key)){const code=String(row.warehouse_code||'').trim().toUpperCase();if(['S','B','I'].includes(code))codes.add(code)}});return codes.size===1?[...codes][0]:''}
function validateCartWarehouseCodes(){const missing=[];cart.forEach(item=>{const code=inferCartWarehouseCode(item);if(code)item.warehouseCode=code;else missing.push(String(item.number||''))});if(missing.length){alert(`출고지가 연결되지 않은 품번은 주문할 수 없습니다: ${[...new Set(missing)].join(', ')}\n\n상품관리에서 해당 품번의 출고지를 S·B·I 중 하나로 지정해주세요.`);return false}saveCart();return true}
function customerDisplayItemNumber(value){return String(value??'').trim().replace(/^[SBI](?:[-_\s]+|(?=\d))/i,'');}
function displayWarehouseItem(group, itemNumber) { return customerDisplayItemNumber(itemNumber); }
function formatGroupUnitPrice(group) {
  const prices = [...new Set((group?.item_numbers || []).map(number => effectiveItemPrice(group, number)).filter(Number.isFinite))].sort((a,b)=>a-b);
  if (!prices.length) return `${formatWon(group?.price || 0)} / 1죽`;
  if (prices.length === 1) return `${formatWon(prices[0])} / 1죽`;
  return `${Number(prices[0]).toLocaleString()}~${Number(prices[prices.length-1]).toLocaleString()}원 / 1죽`;
}
function formatCategoryUnitPrice(category) {
  const categoryGroups = groups.filter(group => Number(group.category_id) === Number(category?.id));
  const prices = categoryGroups.flatMap(group => (group.item_numbers || []).map(number => effectiveItemPrice(group, number))).filter(Number.isFinite).sort((a,b)=>a-b);
  if (!prices.length) return `${formatWon(category?.price || 0)} / 1죽`;
  if (prices[0] === prices[prices.length-1]) return `${formatWon(prices[0])} / 1죽`;
  return `${Number(prices[0]).toLocaleString()}~${Number(prices[prices.length-1]).toLocaleString()}원 / 1죽`;
}

const ITEM_FAVORITES_KEY='designjam_item_favorites';
function readItemFavorites(){try{return new Set(JSON.parse(localStorage.getItem(ITEM_FAVORITES_KEY)||'[]').map(String));}catch(_){return new Set();}}
function saveItemFavorites(set){localStorage.setItem(ITEM_FAVORITES_KEY,JSON.stringify([...set]));window.dispatchEvent(new Event('designjam-item-favorites-changed'));}
function isItemFavorite(number){return readItemFavorites().has(String(number));}
function toggleItemFavorite(event, number) {
  event?.preventDefault();
  event?.stopPropagation();

  const set = readItemFavorites();
  const key = String(number);
  const willActivate = !set.has(key);

  if (willActivate) set.add(key);
  else set.delete(key);

  saveItemFavorites(set);

  // 상품 상세를 다시 렌더링하지 않고 버튼 상태만 갱신한다.
  // 재렌더링 시 사용자가 입력한 수량이 0으로 초기화되던 문제를 방지한다.
  const button = event?.currentTarget;
  if (button) {
    button.classList.toggle('active', willActivate);
    button.setAttribute('aria-pressed', willActivate ? 'true' : 'false');
    button.setAttribute('title', willActivate ? '즐겨찾기 해제' : '즐겨찾기 추가');
  }
}
function rememberViewedGroup(group){const rows=JSON.parse(localStorage.getItem('designjam_recent_viewed')||'[]');const now=new Date().toISOString();const next=[...(group.item_numbers||[]).map(number=>({number:String(number),title:group.title||'상품',image_url:group.image_url||'',viewed_at:now})),...rows];const seen=new Set();localStorage.setItem('designjam_recent_viewed',JSON.stringify(next.filter(x=>{const k=String(x.number);if(seen.has(k))return false;seen.add(k);return true}).slice(0,50)));}

// 목록에는 저용량 WebP 썸네일을, 상품 상세·확대에는 image_url 원본을 사용한다.
function groupThumbnailUrl(group){return String(group?.thumbnail_url||group?.image_url||'').trim();}

function openRequestedItemFromUrl() {
  const params = new URLSearchParams(location.search);
  const requestedItem = String(params.get('item') || '').trim();
  if (!requestedItem) return false;

  const targetGroup = groups.find(group =>
    (Array.isArray(group.item_numbers) ? group.item_numbers : [])
      .some(number => String(number).trim() === requestedItem)
  );

  if (!targetGroup) {
    // 잘못되었거나 삭제된 품번 링크는 일반 상품 목록으로 안전하게 복귀한다.
    history.replaceState(null, '', location.pathname);
    return false;
  }

  openGroup(targetGroup.id, requestedItem);
  return true;
}

function focusRequestedItem(number) {
  const input = document.getElementById(`qty-${String(number)}`);
  if (!input) return;

  const row = input.closest('.order-row');
  if (row) {
    row.classList.add('requested-item-row');
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // 뒤로가기/새로고침에서 같은 품번 링크가 반복 실행되지 않도록 주소를 정리한다.
  history.replaceState(null, '', location.pathname);
}
window.toggleItemFavorite=toggleItemFavorite;

let frequentGroups = [];
let frequentProductsExpanded = false;
let customerBankSettings = { bankName:"", account:"", holder:"" };

const CUSTOMER_SESSION_KEY = "designjam_customer_session";

/* ================================
   거래처별 장바구니 영구 저장
================================ */

function getCartStorageKey() {
  return currentUser?.id
    ? `designjam_cart_${currentUser.id}`
    : null;
}

function getOrderRevisionStorageKey(){return currentUser?.id?`designjam_order_revision_${currentUser.id}`:null}
function getOrderRevisionContext(){const key=getOrderRevisionStorageKey();if(!key)return null;try{const value=JSON.parse(localStorage.getItem(key)||'null');return value?.orderNumber?value:null}catch(_){return null}}
function clearOrderRevisionContext(){const key=getOrderRevisionStorageKey();if(key)localStorage.removeItem(key)}
async function validateOrderRevisionContext(){const context=getOrderRevisionContext();if(!context||!currentUser)return null;const {data,error}=await supabaseClient.from('orders').select('order_number,status,customer_revision_status').eq('order_number',context.orderNumber).eq('customer_id',currentUser.id).limit(1).maybeSingle();if(error){console.warn('주문수정 상태 확인 실패:',error.message);return context}const valid=Boolean(data)&&data.status!=='출고완료'&&data.customer_revision_status==='수정중';if(valid)return context;clearOrderRevisionContext();return null}

function loadSavedCart() {
  const key = getCartStorageKey();
  if (!key) return;

  try {
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    cart = Array.isArray(saved)
      ? saved.filter(item => item && item.number && Number(item.qty) > 0)
      : [];
  } catch (error) {
    console.warn("장바구니 복원 실패", error);
    cart = [];
  }
}

function saveCart() {
  const key = getCartStorageKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(cart));
}

function clearSavedCart() {
  const key = getCartStorageKey();
  if (key) localStorage.removeItem(key);
}

function getCartItemImage(item) {
  if (item.imageUrl) return item.imageUrl;
  let group = groups.find(groupItem =>
    Number(groupItem.id) === Number(item.groupId)
  );
  if (!group) {
    const itemKey = customerPriceKey(item.number);
    const warehouseCode = inferCartWarehouseCode(item);
    group = groups.find(groupItem => {
      const groupWarehouse = String(groupItem.warehouse_code || "").trim().toUpperCase();
      if (warehouseCode && groupWarehouse && warehouseCode !== groupWarehouse) return false;
      const numbers = Array.isArray(groupItem.item_numbers)
        ? groupItem.item_numbers
        : String(groupItem.item_numbers || "").split(/[,\s/]+/);
      return numbers.some(number => customerPriceKey(number) === itemKey);
    });
  }
  return group?.image_url || "";
}
function getCartItemThumbnail(item){
  if(item.thumbnailUrl)return item.thumbnailUrl;
  const group=groups.find(row=>Number(row.id)===Number(item.groupId));
  return groupThumbnailUrl(group);
}

/* ================================
   공통 이벤트
================================ */

if (catalogSearch) {
  catalogSearch.addEventListener("input", () => {
  const keyword =
    catalogSearch.value.trim();

  if (currentScreen === "all-products") {
    renderAllProducts();
    return;
  }

  /* 검색어가 있으면 전체 상품 검색 */
  if (keyword) {
    renderGlobalSearchResults();
    return;
  }

  /* 검색어를 지우면 현재 화면으로 복귀 */
  if (currentScreen === "main-category-detail") {
    const activeMainCategoryId =
      Number(catalogList.dataset.mainCategoryId);

    if (activeMainCategoryId) {
      renderMainCategoryDetail(activeMainCategoryId);
      return;
    }
  }

  renderMainCategories();
});
}

/* ================================
   로그인 및 데이터 불러오기
================================ */

async function checkCustomerAccess() {
  const { data: sessionData, error: userError } = await supabaseClient.auth.getSession();
  const user = sessionData?.session?.user || null;

  if (ADMIN_PREVIEW_MODE) {
    if (userError || !user) {
      location.replace("admin.html");
      return false;
    }

    const { data: adminProfile, error: adminError } = await supabaseClient
      .from("customers")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (adminError || !adminProfile?.is_admin || adminProfile.blocked) {
      alert("관리자 권한을 확인할 수 없습니다.");
      location.replace("admin.html");
      return false;
    }

    currentUser = user;
    currentCustomer = adminProfile;
    cart = [];
    updateAdminPreviewBanner();
    document.body.classList.add("auth-ready");
    return true;
  }

  if (userError || !user) {
    sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
    location.replace("login.html");
    return false;
  }

  const { data: customer, error: customerError } = await supabaseClient
    .from("customers")
    .select("*")
    .eq("id", user.id)
    .single();

  if (customerError || !customer || customer.is_admin) {
    alert("거래처 정보를 불러오지 못했습니다.");
    location.href = "login.html";
    return false;
  }

  if (!customer.approved) {
    alert("아직 관리자 승인 대기 중입니다.");
    await supabaseClient.auth.signOut();
    location.href = "login.html";
    return false;
  }

  if (customer.blocked) {
    alert("차단된 계정입니다. 관리자에게 문의해주세요.");
    await supabaseClient.auth.signOut();
    location.href = "login.html";
    return false;
  }

  // 인증 세션을 기준으로 기기 저장값을 복구해 정상 거래처가 로그인 화면으로 되돌아가지 않게 합니다.
  sessionStorage.setItem(CUSTOMER_SESSION_KEY, user.id);
  localStorage.setItem(CUSTOMER_SESSION_KEY, user.id);

  currentUser = user;
  currentCustomer = customer;
  const customerName = customer.business_name || customer.representative || customer.phone || "거래처";
  const customerProfile = JSON.stringify({ name: customerName, email: user.email || "", userId: user.id, isAdmin: false });
  sessionStorage.setItem("designjam_customer_profile", customerProfile);
  localStorage.setItem("designjam_customer_profile", customerProfile);
  window.designjamSession?.refresh();
  updateAdminPreviewBanner();
  document.body.classList.add("auth-ready");
  return true;
}

async function loadCatalog() {
  catalogList.innerHTML = "<p>상품을 불러오는 중...</p>";

  const [
    mainCategoryResponse,
    categoryResponse,
    groupResponse
  ] = await Promise.all([
    supabaseClient
      .from("product_main_categories")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),

    supabaseClient
      .from("product_categories")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),

    supabaseClient
      .from("product_groups")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
  ]);

  if (mainCategoryResponse.error) {
    showLoadError(
      "대분류를 불러오지 못했습니다",
      mainCategoryResponse.error
    );
    return;
  }

  if (categoryResponse.error) {
    showLoadError(
      "카테고리를 불러오지 못했습니다",
      categoryResponse.error
    );
    return;
  }

  if (groupResponse.error) {
    showLoadError(
      "상품 묶음을 불러오지 못했습니다",
      groupResponse.error
    );
    return;
  }

  mainCategories = mainCategoryResponse.data || [];
  categories = categoryResponse.data || [];
  groups = groupResponse.data || [];

  customerItemPriceMap = new Map();
  if (currentUser && !ADMIN_PREVIEW_MODE) {
    try { (await fetchMyCustomerPricesPaged(currentUser.id)).forEach(row => customerItemPriceMap.set(customerPriceKey(row.item_number), Number(row.price))); }
    catch (error) { console.error("거래처별 전용단가 조회 실패:",error.message); }
  }
  refreshSavedCartPrices();

  await loadCustomerFeatureData();

  // 최근 본 상품/품번별 즐겨찾기에서 전달된 품번이 있으면
  // 해당 품번이 포함된 상품 묶음 상세로 바로 이동한다.
  if (openRequestedItemFromUrl()) return;

  renderMainCategories();
}

function showLoadError(title, error) {
  catalogList.innerHTML = `
    <div class="product-card">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(error?.message || "알 수 없는 오류")}</p>
    </div>
  `;
}

/* 같은 catalog.html 안의 화면 이동을 휴대폰 시스템 뒤로가기와 연결 */
function getCatalogHistoryState(screen = currentScreen, extra = {}) {
  return { designjamCatalogScreen: screen, ...extra };
}

function replaceCatalogHistory(screen, extra = {}) {
  history.replaceState(getCatalogHistoryState(screen, extra), "", location.href);
  catalogHistoryReady = true;
}

function pushCatalogHistory(screen, extra = {}) {
  const state = history.state || {};
  const sameScreen = state.designjamCatalogScreen === screen
    && String(state.mainCategoryId || "") === String(extra.mainCategoryId || "");
  if (!sameScreen) history.pushState(getCatalogHistoryState(screen, extra), "", location.href);
  catalogHistoryReady = true;
}

function getGroupFirstItemNumber(group) {
  const numbers = Array.isArray(group?.item_numbers) ? group.item_numbers : [];
  return numbers.length ? String(numbers[0]) : "";
}

function compareNatural(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""), "ko", { numeric: true, sensitivity: "base" });
}

function sortProductGroups(list) {
  const rows = [...list];
  if (currentProductSort === "item-asc") {
    return rows.sort((a, b) => compareNatural(getGroupFirstItemNumber(a), getGroupFirstItemNumber(b)));
  }
  if (currentProductSort === "item-desc") {
    return rows.sort((a, b) => compareNatural(getGroupFirstItemNumber(b), getGroupFirstItemNumber(a)));
  }
  if (currentProductSort === "name-asc") {
    return rows.sort((a, b) => compareNatural(a.title, b.title));
  }
  if (currentProductSort === "name-desc") {
    return rows.sort((a, b) => compareNatural(b.title, a.title));
  }
  return rows;
}

function renderProductSortControl() {
  return `
    <label class="catalog-sort-control">
      <span>상품 정렬</span>
      <select onchange="changeProductSort(this.value)">
        <option value="default" ${currentProductSort === "default" ? "selected" : ""}>기본순</option>
        <option value="item-asc" ${currentProductSort === "item-asc" ? "selected" : ""}>품번 낮은순</option>
        <option value="item-desc" ${currentProductSort === "item-desc" ? "selected" : ""}>품번 높은순</option>
        <option value="name-asc" ${currentProductSort === "name-asc" ? "selected" : ""}>상품명 가나다순</option>
        <option value="name-desc" ${currentProductSort === "name-desc" ? "selected" : ""}>상품명 역순</option>
      </select>
    </label>`;
}

function changeProductSort(value) {
  currentProductSort = value || "default";
  if (currentScreen === "all-products") renderAllProducts(false);
  else if (currentScreen === "main-category-detail" && activeMainCategoryId) renderMainCategoryDetail(activeMainCategoryId, false);
}
window.changeProductSort = changeProductSort;

/* ================================
   1단계: 대분류 목록
================================ */

function renderMainCategories(pushHistory = true) {
  currentScreen = "home-menu";
  activeMainCategoryId = null;
  currentBrand = "전체브랜드";

  if (!catalogHistoryReady) replaceCatalogHistory("home-menu");
  else if (pushHistory) pushCatalogHistory("home-menu");

  showSearch(false);
  hideLegacyFilters();

  catalogList.innerHTML = `
    <section class="customer-main-quick-menu" aria-label="빠른 메뉴">
      <button class="customer-quick-card primary" type="button" onclick="renderAllProducts()">
        <span aria-hidden="true">🧦</span><strong>전체상품</strong>
      </button>
      <button class="customer-quick-card compact" type="button" onclick="renderCart()">
        <span aria-hidden="true">🛒</span><strong>장바구니</strong>
      </button>
      <button class="customer-quick-card compact" type="button" data-customer-orders-button onclick="ADMIN_PREVIEW_MODE ? renderOrderHistoryPreview() : location.href='order.html'">
        <span aria-hidden="true">📦</span><strong>주문내역</strong>
      </button>
      <button class="customer-quick-card compact" type="button" onclick="location.href='customer-settings.html'">
        <span aria-hidden="true">⚙️</span><strong>환경설정</strong>
      </button>
    </section>

    <section class="home-brand-section" aria-label="전체브랜드">
      <div class="home-brand-tools home-brand-tools-first">
        <label class="home-brand-search-wrap">
          <span aria-hidden="true">🔍</span>
          <input id="homeBrandSearch" type="search" placeholder="브랜드 · 상품명 · 품번 검색" value="${escapeHtml(homeBrandSearchKeyword)}" oninput="updateHomeBrandSearch(this.value)" />
        </label>
      </div>
      <button class="customer-home-bulk-banner" type="button" onclick="renderCustomerBulkOrder()">
        <span class="customer-home-bulk-icon" aria-hidden="true">📋</span>
        <span class="customer-home-bulk-copy"><strong>품번·수량 붙여넣기 주문</strong><small>한 줄에 한 품번씩 작성하여 여러 줄을 한 번에 입력할 수 있습니다.</small></span>
        <b aria-hidden="true">›</b>
      </button>
      <div class="home-section-heading home-brand-heading">
        <div><h2>전체브랜드</h2><p>여러 브랜드를 함께 선택할 수 있습니다</p></div>
        <strong class="selected-brand-count">선택 ${selectedHomeBrands.size}개</strong>
      </div>
      <div class="home-brand-grid">
        ${renderHomeBrandButtons()}
      </div>
      <div id="homeIntegratedSearchResults">
        ${renderHomeIntegratedSearchResults()}
      </div>
      ${renderSelectedHomeBrandProducts()}
    </section>

    <section class="home-main-category-section" aria-label="대분류">
      <div class="home-section-heading"><h2>대분류</h2><p>원하는 상품 종류를 선택하세요</p></div>
      <div class="main-category-grid">
        ${mainCategories.map(mainCategory => `
          <button class="main-category-card" type="button" onclick="openMainCategory(${Number(mainCategory.id)})">
            ${renderMainCategoryImage(mainCategory)}
            <strong>${escapeHtml(mainCategory.name)}</strong>
          </button>`).join("") || `<div class="product-card"><h2>등록된 대분류가 없습니다</h2></div>`}
      </div>
    </section>
  `;
}



function renderHomeBrandButtons() {
  const catalogBrands = getCatalogBrands();
  const keyword = normalizeSearch(homeBrandSearchKeyword);
  const visibleBrands = catalogBrands
    .filter(brand => !keyword || normalizeSearch(getBrandSearchText(brand)).includes(keyword));
  const allSelected = catalogBrands.length > 0 && catalogBrands.every(brand => selectedHomeBrands.has(brand));

  return `
    <button class="home-brand-button all-brand ${allSelected ? "active" : ""}" aria-pressed="${allSelected}" type="button" onclick="toggleAllHomeBrands()">
      <span>전체브랜드</span>
    </button>
    ${visibleBrands.map(brand => `
      <button class="home-brand-button ${selectedHomeBrands.has(brand) ? "active" : ""}" aria-pressed="${selectedHomeBrands.has(brand)}" type="button" onclick="toggleHomeBrandSelection('${escapeJsString(brand)}')">
        <span>${escapeHtml(getBrandDisplayName(brand))}</span>
      </button>`).join("") || `<p class="home-brand-empty">검색된 브랜드가 없습니다.</p>`}
  `;
}

function buildHomeIntegratedSearchText(group) {
  const brandAliases = getGroupBrandNames(group)
    .map(getBrandSearchText)
    .join(" ");

  return normalizeSearch([
    buildGroupSearchText(group),
    brandAliases
  ].join(" "));
}

function renderHomeIntegratedSearchResults() {
  const rawKeyword = String(homeBrandSearchKeyword || "").trim();
  const keyword = normalizeSearch(rawKeyword);
  if (!keyword) return "";

  const matchedGroups = groups.filter(group =>
    buildHomeIntegratedSearchText(group).includes(keyword)
  );

  return `
    <section class="home-integrated-search-results" aria-label="통합 검색 결과">
      <div class="home-section-heading home-search-result-heading">
        <div>
          <h2>통합 검색 결과</h2>
          <p>브랜드·상품명·카테고리·품번을 함께 검색합니다</p>
        </div>
        <strong>${matchedGroups.length}개</strong>
      </div>
      ${renderProductPhotoGrid(matchedGroups, `“${rawKeyword}” 검색 결과가 없습니다`)}
    </section>
  `;
}

function updateHomeBrandSearch(value) {
  homeBrandSearchKeyword = String(value || "");
  const grid = document.querySelector(".home-brand-grid");
  if (grid) grid.innerHTML = renderHomeBrandButtons();

  const results = document.getElementById("homeIntegratedSearchResults");
  if (results) results.innerHTML = renderHomeIntegratedSearchResults();
}

function toggleHomeBrandSelection(brand) {
  if (selectedHomeBrands.has(brand)) selectedHomeBrands.delete(brand);
  else selectedHomeBrands.add(brand);
  renderMainCategories();
}

function toggleAllHomeBrands() {
  const catalogBrands = getCatalogBrands();
  const allSelected = catalogBrands.length > 0 && catalogBrands.every(brand => selectedHomeBrands.has(brand));

  if (allSelected) selectedHomeBrands.clear();
  else selectedHomeBrands = new Set(catalogBrands);

  renderMainCategories();
}

function renderSelectedHomeBrandProducts() {
  if (!selectedHomeBrands.size) return "";

  const selected = [...selectedHomeBrands];
  const matched = groups.filter(group => selected.some(brand => groupMatchesBrand(group, brand)));
  const unique = [...new Map(matched.map(group => [String(group.id ?? group.group_id ?? group.title), group])).values()];

  return `
    <section class="home-selected-brand-products" aria-label="선택 브랜드 상품">
      <div class="selected-brand-summary">
        <strong>선택 ${selected.length}개 · ${selected.map(getBrandDisplayName).map(escapeHtml).join(" · ")}</strong>
        <button type="button" onclick="selectedHomeBrands.clear(); renderMainCategories();">선택 해제</button>
      </div>
      ${renderProductPhotoGrid(unique, "선택한 브랜드의 등록 상품이 없습니다")}
    </section>`;
}

function getGroupBrandNames(group) {
  const category = resolveGroupCategory(group);
  // 대분류명은 브랜드 목록과 분리합니다. 브랜드 전용 필드만 사용합니다.
  const raw = [group.brand_text, category?.brand_text]
    .filter(Boolean)
    .join(",");

  return [...new Set(raw.split(/[,/·|]+/).map(value => value.trim()).filter(Boolean))];
}

const BRAND_DISPLAY_LABELS = {
  "NIKE": "나이키",
  "ADIDAS": "아디다스",
  "DAIWA": "다이와",
  "DESCENTE": "데상트",
  "UNDER ARMOUR": "언더아머",
  "SPYDER": "스파이더",
  "STUSSY": "스투시",
  "NEW BALANCE": "뉴발란스",
  "LULULEMON": "룰루레몬",
  "HUMAN MADE": "휴먼메이드",
  "COMME DES GARCONS": "꼼데가르송",
  "TITLEIST": "타이틀리스트",
  "MIU MIU": "미우미우",
  "PXG": "PXG"
};

const BRAND_ALIAS_KEYS = {
  nike: "NIKE", 나이키: "NIKE",
  adidas: "ADIDAS", 아디다스: "ADIDAS",
  daiwa: "DAIWA", 다이와: "DAIWA",
  descente: "DESCENTE", 데상트: "DESCENTE", 데쌍트: "DESCENTE",
  underarmour: "UNDER ARMOUR", 언더아머: "UNDER ARMOUR",
  spyder: "SPYDER", 스파이더: "SPYDER",
  stussy: "STUSSY", 스투시: "STUSSY",
  newbalance: "NEW BALANCE", 뉴발란스: "NEW BALANCE", 뉴발란스: "NEW BALANCE",
  lululemon: "LULULEMON", 룰루레몬: "LULULEMON",
  humanmade: "HUMAN MADE", 휴먼메이드: "HUMAN MADE", 휴먼메이드: "HUMAN MADE",
  commedesgarcons: "COMME DES GARCONS", 꼼데가르송: "COMME DES GARCONS", 꼼데가르송: "COMME DES GARCONS",
  titleist: "TITLEIST", 타이틀리스트: "TITLEIST",
  miumiu: "MIU MIU", 미우미우: "MIU MIU",
  pxg: "PXG"
};

function normalizeBrandKey(value) {
  const compact = normalizeSearch(value).replace(/[^a-z0-9가-힣]/g, "");
  return BRAND_ALIAS_KEYS[compact] || String(value || "").trim().toUpperCase();
}

function getBrandDisplayName(brand) {
  if (brand === "전체브랜드") return "전체브랜드";
  const key = normalizeBrandKey(brand);
  return BRAND_DISPLAY_LABELS[key] || String(brand || "").trim();
}

function getBrandSearchText(brand) {
  const key = normalizeBrandKey(brand);
  const aliases = Object.entries(BRAND_ALIAS_KEYS)
    .filter(([, canonical]) => canonical === key)
    .map(([alias]) => alias);
  return [brand, key, getBrandDisplayName(key), ...aliases].join(" ");
}

function getCatalogBrands() {
  // 실제 등록 상품 종류가 많은 브랜드부터 자동 배치합니다.
  const preferred = ["NIKE", "ADIDAS", "DAIWA", "DESCENTE", "UNDER ARMOUR", "SPYDER", "PXG", "STUSSY"];
  const counts = new Map();
  groups.forEach(group => {
    const uniqueBrands = new Set(getGroupBrandNames(group).map(normalizeBrandKey).filter(Boolean));
    uniqueBrands.forEach(name => counts.set(name, (counts.get(name) || 0) + 1));
  });
  return [...counts.keys()].sort((a, b) => {
    const countDiff = (counts.get(b) || 0) - (counts.get(a) || 0);
    if (countDiff) return countDiff;
    const ai = preferred.indexOf(a), bi = preferred.indexOf(b);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return getBrandDisplayName(a).localeCompare(getBrandDisplayName(b), "ko");
  });
}

function groupMatchesBrand(group, brand) {
  if (!brand || brand === "전체브랜드") return true;
  const selectedKey = normalizeBrandKey(brand);

  // 상품 설명·묶음명·품번의 부분 문자열은 검색하지 않습니다.
  // 브랜드 전용 필드에 분리 등록된 브랜드명 중 정확히 포함된 항목만 일치시킵니다.
  return getGroupBrandNames(group).some(name => normalizeBrandKey(name) === selectedKey);
}

function renderProductPhotoGrid(productGroups, emptyMessage = "등록된 상품이 없습니다") {
  if (!productGroups.length) return `<div class="product-card"><h2>${escapeHtml(emptyMessage)}</h2></div>`;
  return `<div class="catalog-group-grid all-product-grid">${productGroups.map(group => renderGroupCard(group)).join("")}</div>`;
}

function renderAllProducts(pushHistory = true) {
  currentScreen = "all-products";
  currentBrand = "전체브랜드";
  detailReturnScreen = "all-products";
  if (pushHistory) pushCatalogHistory("all-products");
  showSearch(true, "품번 검색");
  hideLegacyFilters();

  const keyword = normalizeSearch(catalogSearch?.value);
  // 검색할 때는 사용자가 입력한 품번과의 일치도를 일반 정렬보다 우선합니다.
  const matched = keyword ? filterGroupsForSearch(keyword) : sortProductGroups(groups);

  catalogList.innerHTML = `
    ${cartTopButton()}
    <div class="catalog-page-heading">
      <button class="simple-back-button" type="button" onclick="history.length > 1 ? history.back() : renderMainCategories(false)">‹</button>
      <div><h2>전체상품</h2><p>모든브랜드</p></div>
    </div>
    ${renderProductSortControl()}
    ${renderProductPhotoGrid(matched, keyword ? "검색 결과가 없습니다" : "등록된 상품이 없습니다")}
  `;
}

function renderBrandDirectory(selectedBrand = "전체브랜드") {
  currentScreen = "brands";
  currentBrand = selectedBrand || "전체브랜드";
  detailReturnScreen = "brands";
  showSearch(false);
  hideLegacyFilters();

  const brands = getCatalogBrands();
  const matched = groups.filter(group => groupMatchesBrand(group, currentBrand));
  const brandSections = currentBrand === "전체브랜드"
    ? brands.map(brand => ({ brand, items: groups.filter(group => groupMatchesBrand(group, brand)) })).filter(section => section.items.length)
    : [{ brand: currentBrand, items: matched }];

  catalogList.innerHTML = `
    ${cartTopButton()}
    <div class="catalog-page-heading">
      <button class="simple-back-button" type="button" onclick="history.length > 1 ? history.back() : renderMainCategories(false)">‹</button>
      <div><h2>전체브랜드</h2><p>브랜드를 선택하세요</p></div>
    </div>
    <div class="brand-selector" role="list" aria-label="브랜드 선택">
      ${["전체브랜드", ...brands].map(brand => `
        <button type="button" class="brand-selector-button ${brand === currentBrand ? "active" : ""}" onclick="renderBrandDirectory('${escapeJsString(brand)}')">
          <span class="brand-check" aria-hidden="true">${brand === currentBrand ? "✓" : ""}</span><span class="brand-label">${escapeHtml(getBrandDisplayName(brand))}</span>
        </button>`).join("")}
    </div>
    <div class="brand-product-sections">
      ${brandSections.map(section => `
        <section class="brand-product-section">
          <h2>${escapeHtml(getBrandDisplayName(section.brand))}</h2>
          ${renderProductPhotoGrid(section.items)}
        </section>`).join("") || `<div class="product-card"><h2>등록된 상품이 없습니다</h2></div>`}
    </div>
  `;
}

function sameId(left, right) {
  return String(left ?? "") === String(right ?? "");
}

function flattenSearchValues(value, result = []) {
  if (value === null || value === undefined) return result;

  if (Array.isArray(value)) {
    value.forEach(item => flattenSearchValues(item, result));
    return result;
  }

  if (typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => {
      // 이미지 URL이나 시스템 날짜처럼 검색에 의미 없는 값은 제외합니다.
      if (/url|created_at|updated_at/i.test(key)) return;
      flattenSearchValues(item, result);
    });
    return result;
  }

  result.push(String(value));
  return result;
}

function resolveGroupCategory(group) {
  return categories.find(item => sameId(item.id, group.category_id)) || null;
}

function resolveGroupMainCategory(group, category = resolveGroupCategory(group)) {
  const possibleMainCategoryIds = [
    category?.main_category_id,
    category?.mainCategoryId,
    group.main_category_id,
    group.mainCategoryId
  ].filter(value => value !== null && value !== undefined && value !== "");

  for (const mainCategoryId of possibleMainCategoryIds) {
    const found = mainCategories.find(item => sameId(item.id, mainCategoryId));
    if (found) return found;
  }

  return null;
}

function buildGroupSearchText(group) {
  const category = resolveGroupCategory(group);
  const mainCategory = resolveGroupMainCategory(group, category);

  // 특정 필드뿐 아니라 대분류·카테고리·상품 묶음의 텍스트 필드를
  // 함께 합쳐 브랜드명이 어느 단계에 저장돼 있어도 검색되게 합니다.
  const values = [
    ...flattenSearchValues(mainCategory),
    ...flattenSearchValues(category),
    ...flattenSearchValues(group)
  ];

  return normalizeSearch(values.join(" "));
}
function normalizeCustomerItemSearch(value) {
  return normalizeSearch(customerDisplayItemNumber(value));
}

function getGroupSearchMatch(group, keyword, textBuilder = buildGroupSearchText) {
  const key = normalizeSearch(keyword);
  if (!key) return { rank: 0, target: "" };
  const optionalItem = resolveUniqueOptionalSuffixItem(keyword);
  const itemKey = normalizeCustomerItemSearch(optionalItem || keyword);
  const numbers = (group.item_numbers || []).map(String);
  const rankedItems = numbers.map((number, index) => {
    const numberKey = normalizeCustomerItemSearch(number);
    const rank = numberKey === itemKey ? 0 : numberKey.startsWith(itemKey) ? 1 : numberKey.includes(itemKey) ? 2 : 99;
    return { number, index, rank };
  }).filter(row => row.rank < 99).sort((a, b) => a.rank - b.rank || a.index - b.index);
  if (rankedItems.length) return { rank: rankedItems[0].rank, target: rankedItems[0].number };
  // 숫자가 들어간 검색어는 품번에서만 찾아 가격·설명의 같은 숫자가 섞이지 않게 합니다.
  if (/\d/.test(itemKey)) return null;
  return textBuilder(group).includes(key) ? { rank: 3, target: numbers[0] || "" } : null;
}

function filterGroupsForSearch(keyword, textBuilder = buildGroupSearchText) {
  if (!normalizeSearch(keyword)) return groups;
  return groups.map((group, index) => ({ group, index, match: getGroupSearchMatch(group, keyword, textBuilder) }))
    .filter(row => row.match)
    .sort((a, b) => a.match.rank - b.match.rank || a.index - b.index)
    .map(row => row.group);
}

/* 브랜드·카테고리·품번 전체 검색 */
function renderGlobalSearchResults() {
  const keyword =
    catalogSearch.value
      .trim()
      .toLowerCase();

  currentScreen = "global-search";

  catalogFilters.style.display = "none";

  const matchedGroups = filterGroupsForSearch(keyword);

  if (matchedGroups.length === 0) {
    catalogList.innerHTML = `
      ${cartTopButton()}

      <button
        class="cart-btn gray-btn"
        type="button"
        onclick="clearCatalogSearch()"
      >
        ← 대분류 목록으로 돌아가기
      </button>

      <div class="product-card">
        <h2>검색 결과가 없습니다</h2>
        <p>
          브랜드명, 카테고리명 또는 품번을 다시 입력해주세요.
        </p>
      </div>
    `;
    return;
  }

  catalogList.innerHTML = `
    ${cartTopButton()}

    <button
      class="cart-btn gray-btn"
      type="button"
      onclick="clearCatalogSearch()"
    >
      ← 대분류 목록으로 돌아가기
    </button>

    <section class="product-card">
      <h2>
        “${escapeHtml(catalogSearch.value.trim())}” 검색 결과
      </h2>

      <p>
        총 ${matchedGroups.length}개의 상품 묶음
      </p>
    </section>

    <div class="catalog-group-grid">
      ${matchedGroups.map(group => {
        const category = categories.find(
          item => sameId(item.id, group.category_id)
        );

        const mainCategory = mainCategories.find(
          item => sameId(item.id, category?.main_category_id ?? group.main_category_id)
        );

        return `
          <button
            class="catalog-group-card catalog-click-card"
            type="button"
            onclick="openGroup(${group.id})"
          >
            ${
              group.image_url
                ? `
                  <img
                    class="catalog-group-image"
                    loading="lazy"
                    decoding="async"
                    src="${escapeAttribute(groupThumbnailUrl(group))}"
                    alt="${escapeAttribute(group.title)}"
                  >
                `
                : `
                  <div class="catalog-no-image">
                    등록된 사진 없음
                  </div>
                `
            }

            <h3>${escapeHtml(group.title)}</h3>

            <p class="global-search-path">
              ${escapeHtml(mainCategory?.name || "대분류 없음")}
              &gt;
              ${escapeHtml(category?.name || "카테고리 없음")}
            </p>

            <p class="catalog-item-numbers">
              ${(group.item_numbers || [])
                .map(number=>escapeHtml(customerDisplayItemNumber(number)))
                .join(", ")}
            </p>

            <p class="price-text">
              ${formatGroupUnitPrice(group)}
            </p>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function clearCatalogSearch() {
  catalogSearch.value = "";
  delete catalogList.dataset.mainCategoryId;
  renderMainCategories();
}

window.clearCatalogSearch =
  clearCatalogSearch;

function renderMainCategoryImage(mainCategory) {
  if (mainCategory.cover_url) {
    return `
      <img
        src="${escapeAttribute(mainCategory.cover_url)}"
        alt="${escapeAttribute(mainCategory.name)}"
      >
    `;
  }

  return `
    <div class="main-category-no-image" aria-hidden="true">
      🧦
    </div>
  `;
}

function openMainCategory(mainCategoryId) {
  activeMainCategoryId = Number(mainCategoryId);
  currentScreen = "main-category-detail";

  if (catalogSearch) {
    catalogSearch.value = "";
  }

  renderMainCategoryDetail(activeMainCategoryId, true);
}

/* ================================
   2단계: 세부 카테고리 + 상품묶음
================================ */

function renderMainCategoryDetail(mainCategoryId, pushHistory = true) {
  const numericMainCategoryId = Number(mainCategoryId);

  const mainCategory = mainCategories.find(
    item => Number(item.id) === numericMainCategoryId
  );

  if (!mainCategory) {
    renderMainCategories();
    return;
  }

  activeMainCategoryId = numericMainCategoryId;
  currentScreen = "main-category-detail";
  if (pushHistory) pushCatalogHistory("main-category-detail", { mainCategoryId: numericMainCategoryId });

  showSearch(true, "카테고리명 또는 품번 검색");
  hideLegacyFilters();

  const keyword = normalizeSearch(catalogSearch?.value);

  const childCategories = categories
    .filter(category =>
      Number(category.main_category_id) === numericMainCategoryId
    )
    .map(category => ({
      ...category,
      categoryGroups: sortProductGroups(groups.filter(group =>
        Number(group.category_id) === Number(category.id)
      ))
    }))
    .filter(category => {
      if (!keyword) return true;

      const groupText = category.categoryGroups
        .map(group => [
          group.title,
          ...(Array.isArray(group.item_numbers)
            ? group.item_numbers
            : [])
        ].join(" "))
        .join(" ");

      const searchableText = normalizeSearch([
        category.name,
        category.description_text,
        category.price,
        ...(Array.isArray(category.tags) ? category.tags : []),
        groupText
      ].join(" "));

      return searchableText.includes(keyword);
    });

  catalogList.innerHTML = `
    ${cartTopButton()}

    <button
      class="cart-btn gray-btn"
      type="button"
      onclick="history.length > 1 ? history.back() : renderMainCategories(false)"
    >
      ← 대분류 목록으로 돌아가기
    </button>

    <section class="product-card main-category-title-card">
      <h2>${escapeHtml(mainCategory.name)}</h2>
    </section>
    ${renderProductSortControl()}

    ${
      childCategories.length > 0
        ? childCategories
            .map(renderCategoryWithGroups)
            .join("")
        : `
          <div class="product-card">
            <h2>등록된 상품이 없습니다</h2>
          </div>
        `
    }
  `;
}

function renderCategoryWithGroups(category) {
  const categoryGroups = category.categoryGroups || [];

  return `
    <section class="product-card category-section-card">
      <div class="category-section-heading">
        <div>
          <h2>${escapeHtml(category.name)}</h2>
        </div>

        <strong class="price-text category-section-price">
          ${formatCategoryUnitPrice(category)}
        </strong>
      </div>

      ${
        categoryGroups.length > 0
          ? `
            <div class="catalog-group-grid">
              ${categoryGroups
                .map(group => renderGroupCard(group))
                .join("")}
            </div>
          `
          : `
            <p class="empty-category-message">
              등록된 상품 사진 묶음이 없습니다.
            </p>
          `
      }
    </section>
  `;
}

function renderGroupCard(group) {
  const soldoutItems = getSoldoutItems(group);

  const itemNumbers = Array.isArray(group.item_numbers)
    ? group.item_numbers.map(String)
    : [];

  const availableCount = itemNumbers.filter(
    number => !soldoutItems.includes(number)
  ).length;

  return `
    <button
      class="catalog-group-card catalog-click-card"
      type="button"
      data-group-id="${escapeAttribute(group.id)}"
      onclick="openGroup(${group.id})"
    >
      ${
        group.image_url
          ? `
            <img
              class="catalog-group-image"
              loading="lazy"
              decoding="async"
              src="${escapeAttribute(groupThumbnailUrl(group))}"
              alt="${escapeAttribute(group.title)}"
            >
          `
          : `
            <div class="catalog-no-image">
              등록된 사진 없음
            </div>
          `
      }

      <strong class="group-title">
        ${escapeHtml(group.title)}
      </strong>

      ${
        group.description_text
          ? `
            <div class="group-description">
              ${escapeHtml(group.description_text)}
            </div>
          `
          : ""
      }

      ${
        group.brand_text
          ? `
            <div class="group-brand">
              ${escapeHtml(group.brand_text)
                .replaceAll(",", " · ")}
            </div>
          `
          : ""
      }

      <span class="catalog-item-numbers">
        ${itemNumbers.map(number=>escapeHtml(customerDisplayItemNumber(number))).join(", ")}
      </span>

      <span class="price-text">
        ${formatGroupUnitPrice(group)}
      </span>

      ${
        soldoutItems.length > 0
          ? `
            <small class="group-stock-summary">
              주문 가능 ${availableCount}종 · 품절 ${soldoutItems.length}종
            </small>
          `
          : ""
      }
    </button>
  `;
}

/* ================================
   3단계: 품번별 주문
================================ */

function openGroup(groupId, requestedItem = "") {
  const group = groups.find(
    item => Number(item.id) === Number(groupId)
  );

  if (!group) return;

  rememberViewedGroup(group);

  const category = categories.find(
    item => Number(item.id) === Number(group.category_id)
  );

  if (!category) return;

  // 상세 진입 전 보던 화면과 스크롤 위치를 저장한다.
  if (currentScreen !== "detail") {
    detailReturnScreen = currentScreen;
    detailReturnState = {
      screen: currentScreen,
      brand: currentBrand,
      mainCategoryId: activeMainCategoryId || Number(category.main_category_id) || null,
      scrollY: window.scrollY || document.documentElement.scrollTop || 0,
      groupId: Number(group.id)
    };

    // 같은 페이지 안에서 열리는 상세도 브라우저/휴대폰 뒤로가기로 닫히도록 기록한다.
    if (!requestedItem && !history.state?.designjamCatalogDetail) {
      history.pushState({ designjamCatalogDetail: true, designjamCatalogScreen: "detail", groupId: Number(group.id) }, "", location.href);
    }
  }

  currentScreen = "detail";
  activeMainCategoryId = Number(category.main_category_id) || null;

  showSearch(false);
  hideLegacyFilters();

  const soldoutItems = getSoldoutItems(group);

  const quantityRows = (group.item_numbers || [])
    .map(number => {
      const numberText = String(number);
      const isSoldout = soldoutItems.includes(numberText);

      return `
        <div class="order-row qty-control-row ${
          isSoldout ? "soldout-order-row" : ""
        }" data-qty-row="${escapeAttribute(numberText)}">
          <strong class="compact-item-number">${escapeHtml(displayWarehouseItem(group,numberText))}${isSoldout ? '<span class="soldout-label">품절</span>' : ""}</strong>
          <span class="compact-item-price"><span>${formatWon(effectiveItemPrice(group,numberText))}</span><small>/1죽</small></span>

          <div class="qty-control">
            <button
              type="button"
              class="qty-btn"
              onclick="changeCatalogQty('${escapeJsString(numberText)}', -1)"
              ${isSoldout ? "disabled" : ""}
            >
              −
            </button>

            <input
              id="qty-${escapeAttribute(numberText)}"
              class="catalog-qty-input"
              type="number"
              min="0"
              value="0"
              data-number="${escapeAttribute(numberText)}"
              oninput="recalculateGroupTotal(${group.id})"
              ${isSoldout ? "disabled" : ""}
            >

            <button
              type="button"
              class="qty-btn"
              onclick="changeCatalogQty('${escapeJsString(numberText)}', 1)"
              ${isSoldout ? "disabled" : ""}
            >
              +
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  catalogList.innerHTML = `
    ${cartTopButton()}

    <button
      class="cart-btn gray-btn"
      type="button"
      onclick="returnFromGroupDetail()"
    >
      ← 상품 사진 목록으로 돌아가기
    </button>

    <div class="product-card">
      <h2>${escapeHtml(group.title)}</h2>

      <p>${escapeHtml(category.name)}</p>

      <p class="price-text">
        ${formatGroupUnitPrice(group)}
      </p>

      ${renderProductSlider(group)}

      <div class="section-label">
        품번별 주문수량
      </div>

      <div class="mobile-order-column-head" aria-hidden="true">
        <span>품번</span><span>가격</span><span>수량</span>
      </div>

      ${quantityRows}

      <input
        id="currentGroupId"
        type="hidden"
        value="${group.id}"
      >

      <div class="live-group-total compact-order-summary">
        <span>선택상품: <strong><span id="liveGroupKinds">0</span>종류</strong></span>
        <span>총수량: <strong><span id="liveGroupQty">0</span>죽</strong></span>
        <span>총금액: <strong><span id="liveGroupPrice">0</span>원</strong></span>
      </div>

      <div class="product-order-buttons compact-product-order-buttons">
        <button
          class="cart-btn"
          type="button"
          onclick="addGroupToCart(${group.id}, 'cart')"
        >
          🛒 장바구니 담기
        </button>
      </div>
    </div>
  `;

  if (requestedItem) {
    requestAnimationFrame(() => focusRequestedItem(requestedItem));
  }
}


function restoreCatalogScroll(state) {
  if (!state) return;
  const y = Number(state.scrollY) || 0;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: y, left: 0, behavior: "auto" });
      const card = document.querySelector(`[data-group-id="${CSS.escape(String(state.groupId || ""))}"]`);
      if (card && Math.abs((window.scrollY || 0) - y) > 120) {
        card.scrollIntoView({ block: "center", behavior: "auto" });
      }
    });
  });
}

function renderDetailReturnScreen(state) {
  const target = state || detailReturnState || { screen: detailReturnScreen };
  if (catalogSearch) catalogSearch.value = "";

  if (target.screen === "brands") {
    renderBrandDirectory(target.brand || currentBrand);
  } else if (target.screen === "main-category-detail" && target.mainCategoryId) {
    renderMainCategoryDetail(target.mainCategoryId);
  } else if (target.screen === "home-menu") {
    renderMainCategories();
  } else {
    renderAllProducts();
  }
  restoreCatalogScroll(target);
}

function returnFromGroupDetail(fromHistory = false) {
  if (!fromHistory && history.state?.designjamCatalogDetail) {
    history.back();
    return;
  }
  renderDetailReturnScreen(detailReturnState);
}

window.addEventListener("popstate", event => {
  const state = event.state || {};

  if (currentScreen === "detail") {
    renderDetailReturnScreen(detailReturnState);
    return;
  }

  if (state.designjamCatalogScreen === "main-category-detail" && state.mainCategoryId) {
    renderMainCategoryDetail(state.mainCategoryId, false);
    return;
  }

  if (state.designjamCatalogScreen === "all-products") {
    renderAllProducts(false);
    return;
  }

  if (state.designjamCatalogScreen === "home-menu") {
    renderMainCategories(false);
    return;
  }

  // 앱에서 catalog 하위 화면을 연 뒤 이전 기록이 없는 경우에도 종료하지 않고 메인으로 복귀한다.
  renderMainCategories(false);
  replaceCatalogHistory("home-menu");
});

function returnToActiveMainCategory() {
  if (activeMainCategoryId) {
    if (catalogSearch) catalogSearch.value = "";
    renderMainCategoryDetail(activeMainCategoryId);
    return;
  }

  renderMainCategories();
}

function changeCatalogQty(itemNumber, amount) {
  const input = document.getElementById(`qty-${itemNumber}`);
  if (!input || input.disabled) return;

  const currentQty = Number(input.value) || 0;
  input.value = Math.max(0, currentQty + amount);

  const groupId = Number(
    document.getElementById("currentGroupId")?.value
  );

  if (groupId) {
    recalculateGroupTotal(groupId);
  }
}

function recalculateGroupTotal(groupId) {
  const group = groups.find(
    item => Number(item.id) === Number(groupId)
  );

  if (!group) return;

  let totalQty = 0;
  let totalPrice = 0;
  let selectedKinds = 0;

  document
    .querySelectorAll(".catalog-qty-input:not(:disabled)")
    .forEach(input => {
      const qty = Math.max(0, Number(input.value) || 0);
      totalQty += qty;
      totalPrice += qty * effectiveItemPrice(group,input.dataset.number);
      if (qty > 0) selectedKinds += 1;
      input.closest(".qty-control-row")?.classList.toggle("has-quantity", qty > 0);
    });

  const kindsBox = document.getElementById("liveGroupKinds");
  const qtyBox = document.getElementById("liveGroupQty");
  const priceBox = document.getElementById("liveGroupPrice");

  if (kindsBox) kindsBox.textContent = selectedKinds.toLocaleString();
  if (qtyBox) qtyBox.textContent = totalQty.toLocaleString();
  if (priceBox) priceBox.textContent = totalPrice.toLocaleString();
}

function renderOrderHistoryPreview() {
  currentScreen = "order-history-preview";
  showSearch(false);
  hideLegacyFilters();
  catalogList.innerHTML = `
    <button class="cart-btn gray-btn" type="button" onclick="renderMainCategories()">← 상품목록으로</button>
    <div class="product-card">
      <h2>📋 내 주문조회</h2>
      <p>실제 거래처가 로그인하면 진행 중 주문과 출고완료 내역이 이 화면에 표시됩니다.</p>
      <div class="preview-order-sample">
        <strong>관리자 미리보기 안내</strong>
        <p>관리자 계정에는 거래처 주문내역이 연결되지 않으므로 미리보기에서는 실제 주문 데이터가 표시되지 않습니다.</p>
      </div>
    </div>
  `;
}

/* ================================
   장바구니
================================ */

function cartTopButton() {
  const totalQty = cart.reduce(
    (sum, item) => sum + Number(item.qty || 0),
    0
  );

  return `
    <div class="catalog-quick-order-actions">
      <button class="cart-btn customer-bulk-order-button" type="button" onclick="renderCustomerBulkOrder()">📋 품번·수량 붙여넣기</button>
      <button class="cart-btn catalog-cart-button" type="button" onclick="renderCart()">🛒 장바구니 ${totalQty > 0 ? `(${totalQty})` : ""}</button>
    </div>
  `;
}

const CUSTOMER_BULK_ORDER_DRAFT_KEY = "designjam_customer_bulk_order_draft";
// V6.5.56: 예전 버전에서 기본 체크 상태로 저장된 선택값을 사용하지 않습니다.
// 새 키에서는 사용자가 팝업의 "다음 주문에도 기억"을 직접 체크한 경우만 저장됩니다.
const CUSTOMER_BULK_ITEM_CHOICE_KEY = "designjam_customer_bulk_item_choices_v2";
const CUSTOMER_BULK_DELIVERY_DRAFT_KEY = "designjam_customer_bulk_delivery_draft";
let pendingCustomerBulkAnalysis = null;
let customerBulkCartNotice = [];
const CUSTOMER_CART_SORT_KEY = "designjam_customer_cart_sort";
let customerCartSort = localStorage.getItem(CUSTOMER_CART_SORT_KEY) || "added-asc";
let cartAddedSequence = Date.now();
function cartItemNumberCompare(a, b) {
  return String(a?.number || "").localeCompare(String(b?.number || ""), "ko", { numeric: true, sensitivity: "base" });
}
function cartAddedAt(item, fallback = 0) { return Number(item?.addedAt || fallback || 0); }
function sortedCartEntries(mode = customerCartSort) {
  const entries = cart.map((item, index) => ({ item, index, addedAt: cartAddedAt(item, index + 1) }));
  if (mode === "latest-desc") return entries.sort((a, b) => b.addedAt - a.addedAt || b.index - a.index);
  if (mode === "item-asc") return entries.sort((a, b) => cartItemNumberCompare(a.item, b.item) || a.index - b.index);
  if (mode === "item-desc") return entries.sort((a, b) => cartItemNumberCompare(b.item, a.item) || a.index - b.index);
  return entries.sort((a, b) => a.addedAt - b.addedAt || a.index - b.index);
}
function setCustomerCartSort(value) { customerCartSort = value || "added-asc"; localStorage.setItem(CUSTOMER_CART_SORT_KEY, customerCartSort); renderCart(); }
function clearCustomerCart() {
  if (!cart.length || !confirm(`장바구니 ${cart.length.toLocaleString()}품번을 모두 삭제할까요?`)) return;
  cart = []; clearSavedCart(); customerBulkCartNotice = []; renderCart();
}
window.addEventListener("pagehide", () => {
  localStorage.removeItem(CUSTOMER_BULK_ORDER_DRAFT_KEY);
  const input = document.getElementById("customerBulkOrderInput");
  if (input) input.value = "";
  pendingCustomerBulkAnalysis = null;
});
window.addEventListener("pageshow", event => {
  if (!event.persisted) return;
  const input = document.getElementById("customerBulkOrderInput");
  if (input) input.value = "";
  localStorage.removeItem(CUSTOMER_BULK_ORDER_DRAFT_KEY);
  pendingCustomerBulkAnalysis = null;
});

function normalizeBulkItemNumber(value) {
  return String(value ?? "").trim().normalize("NFKC").toUpperCase();
}

function getBulkOrderItemIndex() {
  const rows = [];
  groups.forEach(group => (group.item_numbers || []).forEach(number => {
    // DB에 범위 문자열이 남아 있어도 1A~16A, 1M~2M을 개별 품번으로 펼칩니다.
    expandBulkOrderRange(number).forEach(expanded => {
      rows.push({ group, number: String(expanded), normalized: normalizeBulkItemNumber(expanded) });
    });
  }));
  return rows;
}

function bulkChoiceStorageKey() {
  return `${CUSTOMER_BULK_ITEM_CHOICE_KEY}:${currentUser?.id || "guest"}`;
}

function loadBulkItemChoices() {
  try { return JSON.parse(localStorage.getItem(bulkChoiceStorageKey()) || "{}"); }
  catch (_) { return {}; }
}

function rememberBulkItemChoice(baseNumber, actualNumber) {
  const choices = loadBulkItemChoices();
  const baseKey = normalizeBulkItemNumber(baseNumber).replace(/^[SBI][-_/\s]+/, "");
  choices[baseKey] = normalizeBulkItemNumber(actualNumber);
  localStorage.setItem(bulkChoiceStorageKey(), JSON.stringify(choices));
}

function forgetBulkItemChoice(baseNumber) {
  const choices = loadBulkItemChoices();
  const baseKey = normalizeBulkItemNumber(baseNumber).replace(/^[SBI][-_/\s]+/, "");
  delete choices[baseKey];
  localStorage.setItem(bulkChoiceStorageKey(), JSON.stringify(choices));
}

function getDuplicateBulkItemCount(index = getBulkOrderItemIndex()) {
  const bases = new Map();
  index.forEach(row => {
    const base = row.normalized.replace(/[AM]$/, "");
    if (!bases.has(base)) bases.set(base, new Set());
    bases.get(base).add(row.normalized);
  });
  return [...bases.values()].filter(numbers => numbers.size > 1).length;
}

function resolveBulkOrderItem(value, index) {
  const key = normalizeBulkItemNumber(value);
  if (!key) return { matched: null, candidates: [] };
  const withoutWarehouse = key.replace(/^[SBI][-_\s]+/, "");

  // 거래처가 A/M까지 정확히 입력한 경우 해당 품번을 그대로 사용합니다.
  if (/[AM]$/.test(withoutWarehouse)) {
    const exact = index.find(row => row.normalized === withoutWarehouse);
    return { matched: exact || null, candidates: exact ? [exact] : [] };
  }

  // 숫자 품번만 입력하면 일반·A(아동)·M(무지) 후보를 모두 확인합니다.
  const candidates = index.filter(row => row.normalized.replace(/[AM]$/, "") === withoutWarehouse);
  if (candidates.length === 1) return { matched: candidates[0], candidates };
  if (!candidates.length) return { matched: null, candidates: [] };
  const remembered = loadBulkItemChoices()[withoutWarehouse];
  const rememberedRow = remembered && candidates.find(row => row.normalized === remembered);
  // 중복 품번은 기억값이 있어도 선택창을 항상 보여 다른 종류 선택·기억 해제가 가능해야 합니다.
  return { matched: null, candidates, remembered: rememberedRow || null };
}

function bulkItemType(number) {
  const value = normalizeBulkItemNumber(number);
  if (value.endsWith("A")) return "아동양말";
  if (value.endsWith("M")) return "무지양말";
  return "일반양말";
}

function chooseBulkOrderCandidate(requestedNumber, candidates, rememberedRow = null) {
  return new Promise(resolve => {
    document.getElementById("bulkItemChoiceModal")?.remove();
    const modal = document.createElement("div");
    modal.id = "bulkItemChoiceModal";
    modal.className = "bulk-item-choice-modal";
    modal.innerHTML = `
      <div class="bulk-item-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="bulkChoiceTitle">
        <button type="button" class="bulk-choice-close" aria-label="닫기">×</button>
        <small>중복 품번 확인</small>
        <h3 id="bulkChoiceTitle">품번 ${escapeHtml(requestedNumber)}</h3>
        <p>어떤 종류의 양말인지 선택해 주세요.</p>
        <div class="bulk-item-type-buttons">
          ${candidates.map((row, i) => `<button type="button" class="bulk-item-type-button${rememberedRow?.normalized === row.normalized ? " remembered" : ""}" data-candidate-index="${i}"><b>${escapeHtml(bulkItemType(row.number))}</b><small>관리 품번 ${escapeHtml(row.number)}</small>${rememberedRow?.normalized === row.normalized ? "<em>기억된 선택</em>" : ""}</button>`).join("")}
        </div>
        <label class="bulk-choice-remember"><input type="checkbox" id="bulkChoiceRemember"${rememberedRow ? " checked" : ""}> 다음 주문에도 이 선택 기억</label>
        <button type="button" class="cart-btn gray-btn bulk-choice-cancel">취소</button>
      </div>`;
    document.body.appendChild(modal);
    const finish = row => { modal.remove(); resolve(row || null); };
    modal.querySelectorAll("[data-candidate-index]").forEach(button => button.addEventListener("click", () => {
      const row = candidates[Number(button.dataset.candidateIndex)];
      if (row && modal.querySelector("#bulkChoiceRemember")?.checked) rememberBulkItemChoice(requestedNumber, row.number);
      else forgetBulkItemChoice(requestedNumber);
      finish(row);
    }));
    modal.querySelector(".bulk-choice-close")?.addEventListener("click", () => finish(null));
    modal.querySelector(".bulk-choice-cancel")?.addEventListener("click", () => finish(null));
    modal.addEventListener("click", event => { if (event.target === modal) finish(null); });
  });
}

function expandBulkOrderRange(token) {
  const text = normalizeBulkItemNumber(token);
  const match = text.match(/^([SBI][-_]?)?(\d+)([AM]?)[~～]([SBI][-_]?)?(\d+)([AM]?)$/);
  if (!match) return [text];
  const prefix = match[1] || match[4] || "";
  const start = Number(match[2]);
  const end = Number(match[5]);
  const startSuffix = match[3] || "";
  const endSuffix = match[6] || "";
  if (startSuffix && endSuffix && startSuffix !== endSuffix) return [text];
  const suffix = startSuffix || endSuffix;
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start || end - start > 500) return [text];
  return Array.from({ length: end - start + 1 }, (_, offset) => `${prefix}${start + offset}${suffix}`);
}

function parseCompactBulkItemTokens(line) {
  const source = String(line || "").normalize("NFKC");
  // 한 줄 나열식: 7002 8002(2) 203 362(3)
  // 괄호가 하나라도 있을 때만 이 형식으로 판정해 기존 "4001 2" 입력과 구분합니다.
  if (!/[（(]\s*\d+\s*[)）]/.test(source)) return [];
  const tokenPattern = /(?:^|[\s,;|]+)((?:[SBI][-_]?)?\d+[AM]?)(?:\s*[（(]\s*(\d+)\s*(?:죽|족)?\s*[)）])?(?=$|[\s,;|]+)/gi;
  const rows = [];
  let match;
  while ((match = tokenPattern.exec(source)) !== null) {
    rows.push({ number: match[1], qty: Math.max(1, Math.floor(Number(match[2]) || 1)) });
  }
  return rows;
}

function parseCustomerBulkOrder(text) {
  const parsed = [];
  String(text || "").split(/\r?\n/).forEach(rawLine => {
    const line = rawLine.trim();
    if (!line) return;
    if (/^(?:납품처명?|배송처명?|연락처|전화(?:번호)?|주소|납품주소|배송주소|메모|요청사항)\s*[:：]/i.test(line)) return;
    if (/0\d{1,2}[\s-]?\d{3,4}[\s-]?\d{4}/.test(line.replace(/\s+/g, ""))) return;
    if (/(?:특별시|광역시|특별자치|[가-힣]+(?:도|시|군|구|읍|면|동|로|길))/.test(line) && /\d/.test(line)) return;
    const compactRows = parseCompactBulkItemTokens(line);
    if (compactRows.length) {
      compactRows.forEach(row => expandBulkOrderRange(row.number).forEach(number => parsed.push({ number, qty: row.qty })));
      return;
    }
    const cleaned = line
      .replace(/[()\[\]]/g, " ")
      .replace(/(죽씩|족씩|죽|족)/gi, " ")
      .trim();
    const separated = cleaned.match(/^(.+?)(?:[\t ,;|/.:ㅡ]+|-)(\d+)$/);
    const exactRegistered = getBulkOrderItemIndex().some(row => row.normalized === normalizeBulkItemNumber(cleaned));
    const canUseSeparated = separated && !exactRegistered && !/^[SBI]$/i.test(separated[1].trim());
    const parts = cleaned
      .split(/[\t,;|/.:\sㅡ]+/)
      .map(value => value.trim())
      .filter(Boolean);
    if (!parts.length) return;

    const itemToken = canUseSeparated ? separated[1].trim() : parts[0];
    if (!/^(?:[SBI][-_]?)?\d+[AM]?(?:[~～](?:[SBI][-_]?)?\d+[AM]?)?$/i.test(normalizeBulkItemNumber(itemToken))) return;
    const quantityToken = canUseSeparated ? separated[2] : parts.slice(1).find(value => /^\d+(?:\.\d+)?$/.test(value));
    const quantity = Math.max(1, Math.floor(Number(quantityToken) || 1));
    expandBulkOrderRange(itemToken).forEach(number => parsed.push({ number, qty: quantity }));
  });
  return parsed;
}

function parseCustomerBulkDelivery(text) {
  const fields = {};
  const labels = [
    ["deliveryName", /^(?:납품처명?|배송처명?)\s*[:：]\s*(.+)$/i],
    ["deliveryPhone", /^(?:연락처|전화(?:번호)?)\s*[:：]\s*(.+)$/i],
    ["deliveryAddress", /^(?:주소|납품주소|배송주소)\s*[:：]\s*(.+)$/i],
    ["memo", /^(?:메모|요청사항)\s*[:：]\s*(.+)$/i]
  ];
  String(text || "").split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    for (const [key, pattern] of labels) {
      const match = line.match(pattern);
      if (match) { fields[key] = match[1].trim(); break; }
    }
  });
  const remaining = String(text || "").split(/\r?\n/).map(v => v.trim()).filter(Boolean).filter(line => {
    if (labels.some(([, pattern]) => pattern.test(line))) return false;
    const parsedItems = parseCustomerBulkOrder(line);
    if (parsedItems.some(item => { const hit=resolveBulkOrderItem(item.number,getBulkOrderItemIndex()); return !!hit.matched || hit.candidates.length>0; })) return false;
    return true;
  });
  const phoneIndex = remaining.findIndex(line => /0\d{1,2}[\s-]?\d{3,4}[\s-]?\d{4}/.test(line.replace(/\s+/g, "")) || /0\d{1,2}[\s-]+\d{3,4}[\s-]+\d{4}/.test(line));
  if (!fields.deliveryPhone && phoneIndex >= 0) fields.deliveryPhone = remaining.splice(phoneIndex, 1)[0];
  const addressIndex = remaining.findIndex(line => /(?:특별시|광역시|특별자치|[가-힣]+[시도군구읍면동로길])/.test(line) && /\d/.test(line));
  if (!fields.deliveryAddress && addressIndex >= 0) fields.deliveryAddress = remaining.splice(addressIndex, 1)[0];
  if (!fields.deliveryName && remaining.length) fields.deliveryName = remaining.shift();
  if (!fields.memo && remaining.length) fields.memo = remaining.join(" / ");
  return fields;
}

function normalizeCustomerSmartPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
  return String(value || "").trim();
}

function customerSmartPersonSection(text, label, nextLabel = "") {
  const source = String(text || "").replace(/\r/g, "");
  const start = source.search(new RegExp(label + "\\s*[:：]?", "i"));
  if (start < 0) return {};
  const after = source.slice(start).replace(new RegExp("^[ㆍ·●○◆◇▪■□★☆*\\s]*" + label + "\\s*[:：]?", "i"), "");
  const end = nextLabel ? after.search(new RegExp(nextLabel + "\\s*[:：]?", "i")) : -1;
  const section = (end >= 0 ? after.slice(0, end) : after).trim();
  const phone = section.match(/0\d{1,2}[\s.-]*\d{3,4}[\s.-]*\d{4}/);
  if (!phone) return { deliveryName: section.replace(/^[ㆍ·●○◆◇▪■□★☆*\s]+|[ㆍ·●○◆◇▪■□★☆*\s]+$/g, "") };
  const before = section.slice(0, phone.index).replace(/^[ㆍ·●○◆◇▪■□★☆*\s]+|[ㆍ·●○◆◇▪■□★☆*\s]+$/g, "").trim();
  let tail = section.slice(phone.index + phone[0].length).replace(/^[ㆍ·●○◆◇▪■□★☆*,; \t]+/, "");
  const blankBreak = tail.search(/\n\s*\n/);
  const memoLabel = tail.search(/(?:메모|요청사항|배송메모)\s*[:：]?/i);
  const memoPhrase = tail.search(/(?:문\s*앞|문앞|경비실|부재\s*시|놓아\s*주세요|연락\s*(?:바랍니다|주세요)|배송\s*요청)/i);
  const splitAt = [blankBreak, memoLabel, memoPhrase].filter(index => index >= 0).sort((a,b) => a-b)[0];
  let address = Number.isInteger(splitAt) ? tail.slice(0, splitAt) : tail;
  let memo = Number.isInteger(splitAt) ? tail.slice(splitAt).replace(/^[\sㆍ·|]*(?:메모|요청사항|배송메모)?\s*[:：]?\s*/i, "") : "";
  const clean = value => String(value || "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").replace(/^[ㆍ·●○◆◇▪■□★☆*\s]+|[ㆍ·●○◆◇▪■□★☆*~\s]+$/g, "").trim();
  return {
    deliveryName: clean(before.split(/\n/).filter(Boolean).pop() || before),
    deliveryPhone: normalizeCustomerSmartPhone(phone[0]),
    deliveryAddress: clean(address),
    memo: clean(memo)
  };
}

function parseCustomerSmartItems(text, index = getBulkOrderItemIndex()) {
  let orderText = String(text || "");
  const receiverIndex = orderText.search(/(?:받는\s*사람|받는\s*분|수령인|수취인|배송받는\s*분)/i);
  if (receiverIndex >= 0) orderText = orderText.slice(0, receiverIndex);
  orderText = orderText.replace(/0\d{1,2}[\s.-]*\d{3,4}[\s.-]*\d{4}/g, " ");
  const tokens = orderText.match(/(?:[SBI][-_]?)?\d+[AM]?(?:[~～](?:[SBI][-_]?)?\d+[AM]?)?(?:\s*(?:죽|족))?(?:\s*(?:[-:/.xX×*=]|수량\s*[:：]?)\s*\d+\s*(?:죽|족)?)?/gi) || [];
  const rows = [];
  tokens.forEach(raw => {
    let token = raw.trim().replace(/\s*(?:죽|족)$/i, "");
    let qty = 1;
    const exact = index.find(row => row.normalized === normalizeBulkItemNumber(token));
    if (!exact) {
      const quantity = token.match(/^(.+?)\s*(?:[-:/.xX×*=]|수량\s*[:：]?)\s*(\d+)$/i);
      if (quantity) { token = quantity[1].trim(); qty = Math.max(1, Number(quantity[2])); }
    }
    expandBulkOrderRange(token).forEach(number => {
      if (/^(?:[SBI][-_]?)?\d+[AM]?$/i.test(normalizeBulkItemNumber(number))) rows.push({ number, qty });
    });
  });
  return rows;
}

function analyzeCustomerBulkPaste(text) {
  const source = String(text || "").normalize("NFKC");
  const receiverLabel = "(?:받는\\s*사람|받는\\s*분|수령인|수취인|배송받는\\s*분)";
  const senderLabel = "(?:보내는\\s*사람|보내는\\s*분|발송인|주문자)";
  const receiver = customerSmartPersonSection(source, receiverLabel, senderLabel);
  const legacy = Object.keys(receiver).length ? {} : parseCustomerBulkDelivery(source);
  const lineRows = parseCustomerBulkOrder(source);
  return { rows: lineRows.length ? lineRows : parseCustomerSmartItems(source), delivery: { ...legacy, ...Object.fromEntries(Object.entries(receiver).filter(([,value]) => value)) } };
}

function renderCustomerBulkAnalysis(usePending = false) {
  const input = document.getElementById("customerBulkOrderInput");
  const source = input?.value?.trim() || "";
  if (!source) return;
  if (!usePending || !pendingCustomerBulkAnalysis) pendingCustomerBulkAnalysis = analyzeCustomerBulkPaste(source);
  const { rows, delivery } = pendingCustomerBulkAnalysis;
  const vipPaste = hasVipPasteAccess();
  const box = document.getElementById("customerBulkOrderAnalysis");
  const option = (key, label, value, wide = "") => `<label class="${wide}"><input type="checkbox" data-customer-smart-field="${key}" ${value ? "checked" : ""} ${value ? "" : "disabled"}><span><b>${label}</b><br>${escapeHtml(value || "인식 안 됨")}</span></label>`;
  box.innerHTML = `<h3>자동 분석 결과 · 적용할 항목만 선택</h3><div class="customer-smart-paste-options">${option("items", "품번·수량", rows.map(row => `${customerDisplayItemNumber(row.number)} ${row.qty}죽`).join(", "), "customer-smart-paste-items")}${vipPaste?option("deliveryName", "실제 납품처명", delivery.deliveryName)+option("deliveryPhone", "연락처", delivery.deliveryPhone)+option("deliveryAddress", "주소", delivery.deliveryAddress)+option("memo", "메모", delivery.memo):""}</div>${rows.length ? "" : '<p class="warning">인식된 품번이 없습니다. 원문을 확인해 주세요.</p>'}`;
  box.hidden = false;
  document.getElementById("confirmCustomerBulkOrder").hidden = false;
  document.getElementById("customerBulkOrderResult").textContent = "분석 결과를 확인한 뒤 선택 항목 적용을 눌러주세요.";
}

function hasAdvancedCustomerAccess(){
  return ["우수","우수고객","VIP","VVIP"].includes(String(currentCustomer?.customer_grade || "일반"));
}
function hasVipPasteAccess(){
  return ["VIP","VVIP"].includes(String(currentCustomer?.customer_grade || "일반").toUpperCase());
}

async function saveCustomerBulkDeliveryDraft(fields) {
  if (!fields || !Object.values(fields).some(Boolean)) return;
  localStorage.setItem(CUSTOMER_BULK_DELIVERY_DRAFT_KEY, JSON.stringify(fields));
}

function normalizeDeliveryLookup(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s\-().,·]/g, "");
}

function findMatchingDeliveryDestination(destinations, draft) {
  const name = normalizeDeliveryLookup(draft?.deliveryName);
  const phone = normalizeDeliveryLookup(draft?.deliveryPhone);
  const address = normalizeDeliveryLookup(draft?.deliveryAddress);
  if (!name && !phone && !address) return null;
  return destinations.find(row => {
    const rowName = normalizeDeliveryLookup(row.delivery_name);
    const rowPhone = normalizeDeliveryLookup(row.delivery_phone);
    const rowAddress = normalizeDeliveryLookup(row.delivery_address);
    if (name && address) return rowName === name && rowAddress === address;
    if (address && phone) return rowAddress === address && rowPhone === phone;
    if (name && phone) return rowName === name && rowPhone === phone;
    return (name && rowName === name) || (address && rowAddress === address) || (phone && rowPhone === phone);
  }) || null;
}

const KOREAN_INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
function koreanInitialText(value) {
  return [...String(value || "")].map(char => {
    const code = char.charCodeAt(0) - 0xAC00;
    return code >= 0 && code < 11172 ? KOREAN_INITIALS[Math.floor(code / 588)] : char;
  }).join("");
}

function deliverySearchMatches(label, query) {
  const q = normalizeDeliveryLookup(query);
  return !q || normalizeDeliveryLookup(label).includes(q) || normalizeDeliveryLookup(koreanInitialText(label)).includes(q);
}

let customerOrderPhotoFiles=[];
async function customerOrderPhotoData(file){let bitmap;try{bitmap=await createImageBitmap(file)}catch{bitmap=await new Promise((resolve,reject)=>{const image=new Image(),url=URL.createObjectURL(file);image.onload=()=>{URL.revokeObjectURL(url);resolve(image)};image.onerror=reject;image.src=url})}const width=bitmap.width||bitmap.naturalWidth,height=bitmap.height||bitmap.naturalHeight,scale=Math.min(1,1800/Math.max(width,height));const canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();return canvas.toDataURL('image/jpeg',.88)}
function renderCustomerOrderPhotos(){const list=document.getElementById('customerOrderPhotoList'),clear=document.getElementById('clearCustomerOrderPhotos'),status=document.getElementById('customerOrderPhotoStatus');if(list){list.innerHTML=customerOrderPhotoFiles.map((file,index)=>`<div class="customer-order-photo-row"><span>${escapeHtml(file.name)}</span><button type="button" onclick="removeCustomerOrderPhoto(${index})">삭제</button></div>`).join('')}if(clear)clear.hidden=!customerOrderPhotoFiles.length;if(status)status.textContent=customerOrderPhotoFiles.length?`사진 ${customerOrderPhotoFiles.length}장 선택됨`:'카톡에서 저장한 주문 사진을 선택하세요.'}
function selectCustomerOrderPhotos(input){customerOrderPhotoFiles=[...(input.files||[])].slice(0,5);input.value='';renderCustomerOrderPhotos()}
function removeCustomerOrderPhoto(index){customerOrderPhotoFiles.splice(index,1);renderCustomerOrderPhotos()}
function clearCustomerOrderPhotos(){customerOrderPhotoFiles=[];renderCustomerOrderPhotos()}
async function analyzeCustomerOrderPhotos(){if(!hasVipPasteAccess())return alert('사진 주문분석은 VIP 이상 거래처만 사용할 수 있습니다.');if(!customerOrderPhotoFiles.length)return alert('분석할 사진을 선택하세요.');const status=document.getElementById('customerOrderPhotoStatus'),button=document.getElementById('analyzeCustomerOrderPhotos');try{button.disabled=true;if(!window.FreeHandwritingOCR)throw new Error('무료 손글씨 분석기를 불러오지 못했습니다. 인터넷 연결 후 새로고침해 주세요.');const knownItems=[...new Set(getBulkOrderItemIndex().map(row=>normalizeBulkItemNumber(row.number)))];const rows=await window.FreeHandwritingOCR.analyze(customerOrderPhotoFiles,knownItems,message=>{status.textContent=message}),accepted=rows.filter(row=>row.registered&&!row.needs_review),review=rows.filter(row=>!row.registered||row.needs_review);if(!rows.length)throw new Error('사진에서 주문 품번을 찾지 못했습니다. 사진을 더 가까이 잘라서 다시 선택해주세요.');document.getElementById('customerBulkOrderInput').value=[...accepted.map(row=>`${row.item_number} - ${row.qty}`),...review.map(row=>`확인필요: ${row.observed_text||row.item_number} → ${row.item_number||'?'}`)].join('\n');pendingCustomerBulkAnalysis={rows:accepted.map(row=>({number:row.item_number,qty:Math.max(1,Number(row.qty||1))})),delivery:{}};renderCustomerBulkAnalysis(true);status.textContent=`무료 분석 완료 · 자동확인 ${accepted.length}품번${review.length?` · 확인 필요 ${review.length}품번`:''}`}catch(error){status.textContent='사진 분석 실패: '+(error?.message||error)}finally{button.disabled=false}}

function renderCustomerBulkOrder() {
  if (ADMIN_PREVIEW_MODE) { alert("관리자 미리보기에서는 주문 기능을 사용할 수 없습니다."); return; }
  rememberCartReturnState();
  currentScreen = "bulk-order";
  showSearch(false);
  hideLegacyFilters();
  localStorage.removeItem(CUSTOMER_BULK_ORDER_DRAFT_KEY);
  customerOrderPhotoFiles=[];
  if (!hasVipPasteAccess()) localStorage.removeItem(CUSTOMER_BULK_DELIVERY_DRAFT_KEY);
  const draft = "";
  catalogList.innerHTML = `
    <div class="product-card customer-bulk-order-card">
      <h2>📋 품번·수량 한번에 주문</h2>
      <p>${hasVipPasteAccess()?"카톡·문자 주문의 품번·수량과 납품정보를 붙여넣어 자동 입력할 수 있습니다.":"품번과 수량만 복사해 붙여넣거나 직접 입력할 수 있습니다."}</p>
      <textarea id="customerBulkOrderInput" class="order-input customer-bulk-order-input" rows="7" placeholder="카톡·문자 주문을 붙여넣거나 직접 입력하세요.&#10;&#10;예시&#10;4001 1&#10;4002 2&#10;4003 3&#10;↓ 같은 형식으로 아래에 계속 입력하세요.">${escapeHtml(draft)}</textarea>
      ${hasVipPasteAccess()?`<div class="customer-order-photo-box"><strong>VIP 무료 주문사진 분석</strong><input type="file" accept="image/*" multiple onchange="selectCustomerOrderPhotos(this)"><div id="customerOrderPhotoList"></div><div class="customer-order-photo-actions"><button id="analyzeCustomerOrderPhotos" type="button" onclick="analyzeCustomerOrderPhotos()">사진에서 품번·수량 읽기</button><button id="clearCustomerOrderPhotos" type="button" onclick="clearCustomerOrderPhotos()" hidden>선택파일 전체삭제</button></div><small id="customerOrderPhotoStatus">카톡에서 저장한 주문 사진을 선택하세요. 첫 사용 때만 무료 모델을 내려받습니다.</small></div>`:''}
      ${hasVipPasteAccess()?'<p class="customer-bulk-order-help"><b>VIP 안내:</b> 납품처명·연락처·주소·메모까지 선택 적용할 수 있습니다. 인식 결과를 확인한 뒤 적용해 주세요.</p>':'<p class="customer-bulk-order-help"><b>안내:</b> 품번·수량만 자동 적용됩니다. 납품정보는 다음 주문 화면에서 입력해 주세요.</p>'}
      <p class="bulk-order-compact-note">중복 품번은 일반·아동·무지 중 선택 · 수량 생략 시 1죽 <span>예: 4001&nbsp;&nbsp;2죽 또는 4001 4002(2) 4003(3)</span></p>
      <p class="customer-bulk-order-help">공백·탭·쉼표·마침표·슬래시·콜론·한글 ㅡ를 구분자로 인식하며, <b>죽·족·죽씩·족씩</b>도 사용할 수 있습니다.</p>
      <div id="customerBulkOrderAnalysis" class="customer-smart-paste-preview" hidden></div>
      <div id="customerBulkOrderResult" class="customer-bulk-order-result" aria-live="polite"></div>
      <p class="customer-bulk-order-steps"><b>이용 순서</b><span>① 자동 분석</span><i>→</i><span>② 선택 항목 적용</span><i>→</i><span>③ 장바구니에서 품번·수량 확인</span></p>
      <div class="customer-bulk-order-actions">
        <button class="cart-btn" type="button" onclick="renderCustomerBulkAnalysis()">① 자동 분석</button>
        <button id="confirmCustomerBulkOrder" class="cart-btn green-btn" type="button" onclick="applyCustomerBulkOrder()" hidden>② 선택 항목 적용</button>
        <button class="cart-btn gray-btn" type="button" onclick="renderCart()">③ 품번·수량 확인</button>
        <button class="cart-btn gray-btn" type="button" onclick="continueShopping()">상품 목록으로</button>
      </div>
    </div>`;
  const input = document.getElementById("customerBulkOrderInput");
  const photoBox=document.querySelector('.customer-order-photo-box');if(photoBox&&!photoBox.querySelector('.handwriting-learning-note'))photoBox.insertAdjacentHTML('beforeend','<p class="handwriting-learning-note">💡 잘못 인식한 품번·수량을 수정해 확정하면 학습자료로 저장되며, 자료가 충분히 쌓인 뒤 디자인 삭스 전용 손글씨 모델 업데이트에 반영될 예정입니다.</p>');
  input?.addEventListener("input", () => { pendingCustomerBulkAnalysis = null; document.getElementById("customerBulkOrderAnalysis").hidden = true; document.getElementById("confirmCustomerBulkOrder").hidden = true; });
  requestAnimationFrame(() => input?.focus());
}

async function applyCustomerBulkOrder() {
  if (customerBulkApplyInProgress) return;
  const applyButton = document.getElementById("confirmCustomerBulkOrder");
  customerBulkApplyInProgress = true;
  if (applyButton) applyButton.disabled = true;
  const input = document.getElementById("customerBulkOrderInput");
  const resultBox = document.getElementById("customerBulkOrderResult");
  const pastedText = input?.value || "";
  if (!pendingCustomerBulkAnalysis) { renderCustomerBulkAnalysis(); return; }
  const checked = key => Boolean(document.querySelector(`[data-customer-smart-field="${key}"]:checked`));
  const rows = checked("items") ? pendingCustomerBulkAnalysis.rows : [];
  const deliveryFields = hasVipPasteAccess()?Object.fromEntries(Object.entries(pendingCustomerBulkAnalysis.delivery).filter(([key, value]) => checked(key) && value)):{};
  if (!rows.length && !Object.keys(deliveryFields).length) { if (resultBox) resultBox.textContent = "적용할 항목을 하나 이상 선택해 주세요."; customerBulkApplyInProgress=false; if(applyButton)applyButton.disabled=false; return; }
  const signature = JSON.stringify({rows:rows.map(r=>[String(r.number),Number(r.qty)]).sort(),delivery:deliveryFields});
  if (signature === lastCustomerBulkApplySignature && !confirm("방금 적용한 주문과 동일합니다.\n다시 적용하면 같은 품번의 수량이 추가되어 2배가 될 수 있습니다.\n\n정말 한 번 더 추가할까요?")) { customerBulkApplyInProgress=false; if(applyButton)applyButton.disabled=false; return; }

  const index = getBulkOrderItemIndex();
  const totals = new Map();
  rows.forEach(row => totals.set(row.number, (totals.get(row.number) || 0) + row.qty));
  const missing = [];
  const soldout = [];
  let addedKinds = 0;
  let addedQty = 0;
  const confirmedTraining = [];
  const addedBatchAt = ++cartAddedSequence;

  for (const [requestedNumber, qty] of totals.entries()) {
    const resolution = resolveBulkOrderItem(requestedNumber, index);
    let found = resolution.matched;
    if (!found && resolution.candidates.length > 1) found = await chooseBulkOrderCandidate(requestedNumber, resolution.candidates, resolution.remembered);
    if (!found) { missing.push(requestedNumber); continue; }
    const { group, number } = found;
    confirmedTraining.push({item_number:String(number),qty:Number(qty)});
    if (getSoldoutItems(group).includes(String(number))) soldout.push(displayWarehouseItem(group, number));
    const existing = cart.find(item => Number(item.groupId) === Number(group.id) && item.number === String(number));
    if (existing) { existing.qty = Number(existing.qty || 0) + qty; existing.addedAt = addedBatchAt; }
    else cart.push({
      groupId: group.id,
      categoryId: group.category_id,
      title: group.title,
      number: String(number),
      qty,
      price: effectiveItemPrice(group, number),
      warehouseCode: String(group.warehouse_code || ""),
      imageUrl: group.image_url || "",
      thumbnailUrl: groupThumbnailUrl(group),
      addedAt: addedBatchAt
    });
    addedKinds += 1;
    addedQty += qty;
  }

  if (addedQty) saveCart();
  await saveCustomerBulkDeliveryDraft(deliveryFields);
  const messages = [];
  if (addedQty) messages.push(`${addedKinds}품번 · ${addedQty}죽을 장바구니에 담았습니다.`);
  if (deliveryFields.deliveryName || deliveryFields.deliveryAddress) messages.push(`납품처 정보 자동 저장: ${deliveryFields.deliveryName || deliveryFields.deliveryAddress}`);
  if (missing.length) messages.push(`미등록/확인 필요: ${missing.join(", ")}`);
  if (soldout.length) messages.push(`현재 품절 표시: ${[...new Set(soldout)].join(", ")}`);
  if (resultBox) {
    resultBox.innerHTML = messages.map((message, index) => `<p class="${index ? "warning" : "success"}">${escapeHtml(message)}</p>`).join("");
  }
  if(customerOrderPhotoFiles.length&&confirmedTraining.length&&window.FreeHandwritingOCR?.saveTrainingData){await window.FreeHandwritingOCR.saveTrainingData(supabaseClient,[...customerOrderPhotoFiles],confirmedTraining,'customer-vip')}
  if (addedQty) lastCustomerBulkApplySignature = signature;
  pendingCustomerBulkAnalysis = null;
  customerBulkApplyInProgress = false;
  if (applyButton) applyButton.disabled = false;
  if (addedQty) {
    customerBulkCartNotice = messages;
    localStorage.removeItem(CUSTOMER_BULK_ORDER_DRAFT_KEY);
    setTimeout(renderCart, 350);
  }
}
window.renderCustomerBulkOrder = renderCustomerBulkOrder;
window.renderCustomerBulkAnalysis = renderCustomerBulkAnalysis;
window.applyCustomerBulkOrder = applyCustomerBulkOrder;
window.selectCustomerOrderPhotos=selectCustomerOrderPhotos;window.removeCustomerOrderPhoto=removeCustomerOrderPhoto;window.clearCustomerOrderPhotos=clearCustomerOrderPhotos;window.analyzeCustomerOrderPhotos=analyzeCustomerOrderPhotos;

function addGroupToCart(groupId, nextAction = "cart") {
  if (ADMIN_PREVIEW_MODE) { alert("관리자 미리보기에서는 주문 기능을 사용할 수 없습니다."); return; }
  const group = groups.find(
    item => Number(item.id) === Number(groupId)
  );

  if (!group) return;

  let addedQty = 0;
  const addedBatchAt = ++cartAddedSequence;

  document
    .querySelectorAll(".catalog-qty-input:not(:disabled)")
    .forEach(input => {
      const qty = Math.max(0, Number(input.value) || 0);
      const number = String(input.dataset.number || "");

      if (qty <= 0 || !number) return;

      const existingItem = cart.find(item =>
        Number(item.groupId) === Number(group.id) &&
        item.number === number
      );

      if (existingItem) {
        existingItem.qty += qty;
        existingItem.addedAt = addedBatchAt;
      } else {
        cart.push({
          groupId: group.id,
          categoryId: group.category_id,
          title: group.title,
          number,
          qty,
          price: effectiveItemPrice(group,number),
          warehouseCode: String(group.warehouse_code||''),
          imageUrl: group.image_url || "",
          thumbnailUrl: groupThumbnailUrl(group),
          addedAt: addedBatchAt
        });
      }

      addedQty += qty;
    });

  if (addedQty === 0) {
    alert("수량을 1죽 이상 입력해주세요.");
    return;
  }

  saveCart();
  alert(`${addedQty}죽이 장바구니에 담겼습니다.`);

  if (nextAction === "order") {
    showOrderForm();
    return;
  }

  // 담기 완료 확인 후 장바구니로 강제 이동하지 않고, 방금 보던 카테고리 목록으로 복귀합니다.
  returnFromGroupDetail();
}

function rememberCartReturnState() {
  if (["cart","order"].includes(currentScreen)) return;
  cartReturnState = { screen: currentScreen, mainCategoryId: activeMainCategoryId, detail: detailReturnState ? {...detailReturnState} : null };
}

function renderCart() {
  rememberCartReturnState();
  currentScreen = "cart";
  showSearch(false);
  hideLegacyFilters();

  if (cart.length === 0) {
    catalogList.innerHTML = `
      <div class="product-card">
        <h2>장바구니가 비어 있습니다</h2>

        <button
          class="cart-btn"
          type="button"
          onclick="renderMainCategories()"
        >
          상품 보러가기
        </button>
      </div>
    `;
    return;
  }

  let totalQty = 0;
  let totalPrice = 0;

  const sortedEntries = sortedCartEntries();
  const newestAddedAt = Math.max(...cart.map((item, index) => cartAddedAt(item, index + 1)));
  const itemHtml = sortedEntries
    .map(({ item, index, addedAt }) => {
      const itemTotal =
        Number(item.qty) * Number(item.price);

      totalQty += Number(item.qty);
      totalPrice += itemTotal;

      const imageUrl = getCartItemImage(item);
      const thumbnailUrl = getCartItemThumbnail(item);

      return `
        <div class="cart-item cart-edit-item">
          <div class="cart-product-info">
            ${imageUrl
              ? `<button class="cart-thumb-button" type="button" onclick="openCartImagePreview('${escapeJsString(imageUrl)}', '${escapeJsString(item.title)}')" aria-label="${escapeAttribute(item.title)} 사진 크게 보기"><img class="cart-thumb" loading="lazy" decoding="async" src="${escapeAttribute(thumbnailUrl||imageUrl)}" alt="${escapeAttribute(item.title)}"></button>`
              : `<div class="cart-thumb cart-thumb-empty">사진 없음</div>`
            }
            <div>
              <strong>${escapeHtml(customerDisplayItemNumber(item.number))} ${addedAt === newestAddedAt ? '<em class="cart-latest-badge">최신 담음</em>' : ''}</strong>
              <small>${escapeHtml(item.title)}</small>
              <small class="cart-unit-price">단가 ${Number(item.price).toLocaleString()}원 / 1죽</small>
            </div>
          </div>

          <div class="cart-qty-editor" aria-label="${escapeAttribute(item.number)} 수량 수정">
            <button type="button" onclick="changeCartQty(${index}, -1)">−</button>
            <input
              type="number"
              min="1"
              value="${Number(item.qty)}"
              onchange="setCartQty(${index}, this.value)"
              inputmode="numeric"
            >
            <button type="button" onclick="changeCartQty(${index}, 1)">＋</button>
          </div>

          <strong class="cart-line-total">${itemTotal.toLocaleString()}원</strong>

          <button
            class="cart-remove-button"
            type="button"
            onclick="removeCartItem(${index})"
          >
            삭제
          </button>
        </div>
      `;
    })
    .join("");

  catalogList.innerHTML = `
    <button
      class="cart-btn gray-btn"
      type="button"
      onclick="continueShopping()"
    >
      ← 상품 계속 보기
    </button>

    <div class="product-card">
      <h2>🛒 장바구니</h2>

      <div class="customer-cart-toolbar">
        <label>정렬
          <select class="order-input" onchange="setCustomerCartSort(this.value)">
            <option value="added-asc" ${customerCartSort === "added-asc" ? "selected" : ""}>담은 순서</option>
            <option value="latest-desc" ${customerCartSort === "latest-desc" ? "selected" : ""}>최근 담은 순</option>
            <option value="item-asc" ${customerCartSort === "item-asc" ? "selected" : ""}>품번 낮은순</option>
            <option value="item-desc" ${customerCartSort === "item-desc" ? "selected" : ""}>품번 높은순</option>
          </select>
        </label>
        <button class="cart-clear-all-button" type="button" onclick="clearCustomerCart()">장바구니 전체삭제</button>
      </div>

      ${customerBulkCartNotice.length ? `<div class="customer-bulk-order-result customer-bulk-cart-notice">${customerBulkCartNotice.map((message, index) => `<p class="${index ? "warning" : "success"}">${escapeHtml(message)}</p>`).join("")}</div>` : ""}

      ${itemHtml}

      <hr>

      <h3>총수량: ${totalQty.toLocaleString()}죽</h3>

      <h2 class="price-text">
        총금액: ${totalPrice.toLocaleString()}원
      </h2>

      <button
        class="cart-btn"
        type="button"
        onclick="showOrderForm()"
      >
        주문하기
      </button>
    </div>
  `;
  customerBulkCartNotice = [];
}

function continueShopping() {
  const target = cartReturnState;
  if (target?.screen === "detail" && target.detail?.groupId) {
    openGroup(target.detail.groupId);
    return;
  }
  if (target?.screen === "all-products") { renderAllProducts(); return; }
  if (target?.screen === "main-category-detail" && target.mainCategoryId) { renderMainCategoryDetail(target.mainCategoryId); return; }
  if (target?.screen === "global-search") { renderGlobalSearch(); return; }
  if (activeMainCategoryId) { renderMainCategoryDetail(activeMainCategoryId); return; }
  renderMainCategories();
}
window.handleCustomerCartNav = function () {
  if (currentScreen !== "cart") return false;
  continueShopping();
  return true;
};

function removeCartItem(index) {
  cart.splice(index, 1);
  saveCart();
  renderCart();
}

function setCartQty(index, value) {
  const qty = Math.max(1, Math.floor(Number(value) || 1));
  if (!cart[index]) return;
  cart[index].qty = qty;
  saveCart();
  renderCart();
}

function changeCartQty(index, change) {
  if (!cart[index]) return;
  const nextQty = Math.max(1, Number(cart[index].qty || 1) + Number(change || 0));
  cart[index].qty = nextQty;
  saveCart();
  renderCart();
}

/* ================================
   주문 접수
================================ */

function showOrderForm() {
  if (ADMIN_PREVIEW_MODE) { alert("관리자 미리보기에서는 주문 기능을 사용할 수 없습니다."); return; }
  if (cart.length === 0) {
    alert("장바구니가 비어 있습니다.");
    return;
  }

  if (!currentUser || !currentCustomer) {
    alert("로그인 정보를 확인할 수 없습니다.");
    location.href = "login.html";
    return;
  }

  currentScreen = "order";
  showSearch(false);
  hideLegacyFilters();
  let pastedDelivery = {};
  try { pastedDelivery = JSON.parse(localStorage.getItem(CUSTOMER_BULK_DELIVERY_DRAFT_KEY) || "{}"); } catch (_) {}

  catalogList.innerHTML = `
    <div class="product-card">
      <h2>주문 정보 입력</h2>

      <p class="logged-customer">
        <strong>거래처:</strong>
        ${escapeHtml(currentCustomer.business_name)}
        <small>대표자 ${escapeHtml(currentCustomer.owner_name || currentCustomer.representative || '-')}</small>
      </p>

      <div class="order-delivery-grid">
        <div class="wide delivery-destination-select-wrap"><label for="deliveryDestinationSelect">실제 납품지 선택</label><div class="delivery-destination-select-row"><select id="deliveryDestinationSelect" class="order-input"><option value="registered">가입 시 등록한 주소</option><option value="new">+ 새 납품처 입력</option></select><button id="editSelectedDestinationBtn" type="button" onclick="editSelectedDestination()">수정</button><button id="deleteSelectedDestinationBtn" class="danger-btn" type="button" onclick="deleteSelectedDestination()">삭제</button></div></div>
        <label for="deliveryName">납품처명 <b class="required-mark">* 필수</b>
          <small class="field-help">가입 주소와 실제 납품지가 다르면 입력하고, 같으면 등록 주소를 선택하세요.</small>
          <input id="deliveryName" class="order-input" list="deliveryDestinationList" maxlength="100" value="${escapeHtml(pastedDelivery.deliveryName || currentCustomer.delivery_name || currentCustomer.business_name || '')}" placeholder="실제로 배송받는 업체명">
          <datalist id="deliveryDestinationList"></datalist>
        </label>
        <label for="deliveryPhone">납품처 연락처
          <input id="deliveryPhone" class="order-input" maxlength="50" value="${escapeHtml(pastedDelivery.deliveryPhone || currentCustomer.phone || '')}" placeholder="배송 연락처">
        </label>
        <label for="deliveryAddress" class="wide">납품처 주소 <b class="required-mark">* 필수</b>
          <input id="deliveryAddress" class="order-input" maxlength="300" value="${escapeHtml(pastedDelivery.deliveryAddress || currentCustomer.address || '')}" placeholder="실제 배송 주소">
        </label>
      </div>
      <p class="order-delivery-help">저장된 납품처는 이름을 입력하면 초성으로도 찾아 선택할 수 있습니다.</p>
      <div id="deliveryDestinationManager" class="delivery-destination-manager"></div>

      ${renderBankTransferBox()}

      <label for="orderMemo">메모</label>

      <p class="order-memo-notice" role="note">
        📢 배송 주소 또는 연락처가 변경된 경우 주문 메모에 꼭 기입해 주세요.
      </p>

      <textarea
        id="orderMemo"
        class="order-input"
        rows="5"
        maxlength="1000"
        placeholder="배송 주소 또는 연락처가 변경된 경우 기입해주세요"
      >${escapeHtml(pastedDelivery.memo || getOrderRevisionContext()?.memo || '')}</textarea>

      <button
        id="submitOrderButton"
        class="cart-btn"
        type="button"
        onclick="submitOrder()"
      >
        주문 접수하기
      </button>

      <button
        class="cart-btn gray-btn"
        type="button"
        onclick="renderCart()"
      >
        ← 장바구니로 돌아가기
      </button>
    </div>
  `;
  hydrateDeliveryDestinations();
}

// V6.6.61: 거래처명/등급 변경과 무관하게 로그인 UUID 기준 저장 납품처 목록을 항상 조회한다.
async function hydrateDeliveryDestinations(){
  if(!currentUser)return;const advanced=hasAdvancedCustomerAccess();const {data,error}=await supabaseClient.from('customer_delivery_destinations').select('id,delivery_name,delivery_phone,delivery_address,last_used_at,is_default').eq('customer_id',currentUser.id).order('is_default',{ascending:false}).order('last_used_at',{ascending:false}).limit(100);if(error){console.warn('저장 납품처 조회 실패',error.message);return;}
  const destinations=data||[],select=document.getElementById('deliveryDestinationSelect'),manager=document.getElementById('deliveryDestinationManager');
  const apply=row=>{document.getElementById('deliveryName').value=row?.delivery_name||currentCustomer.business_name||'';document.getElementById('deliveryPhone').value=row?.delivery_phone||currentCustomer.phone||'';document.getElementById('deliveryAddress').value=row?.delivery_address||currentCustomer.address||'';};
  if(select){const syncButtons=()=>{const saved=/^\d+$/.test(select.value);const edit=document.getElementById('editSelectedDestinationBtn'),del=document.getElementById('deleteSelectedDestinationBtn');if(edit){edit.hidden=!advanced;edit.disabled=!saved}if(del){del.hidden=!advanced;del.disabled=!saved}};select.innerHTML='<option value="registered">가입 시 등록한 주소</option>'+destinations.map(row=>`<option value="${row.id}">${escapeHtml(row.delivery_name)}${row.is_default?' · 기본':''}</option>`).join('')+'<option value="new">+ 새 납품처 입력</option>';let draft={};try{draft=JSON.parse(localStorage.getItem(CUSTOMER_BULK_DELIVERY_DRAFT_KEY)||'{}')}catch(_){}const pasted=findMatchingDeliveryDestination(destinations,draft);if(pasted){select.value=String(pasted.id);apply(pasted)}else if(draft.deliveryName||draft.deliveryAddress){select.value='new';apply({delivery_name:draft.deliveryName||'',delivery_phone:draft.deliveryPhone||'',delivery_address:draft.deliveryAddress||''})}else{const preferred=destinations.find(x=>x.is_default);if(preferred){select.value=String(preferred.id);apply(preferred)}}select.onchange=()=>{if(select.value==='registered')apply(null);else if(select.value==='new')apply({delivery_name:'',delivery_phone:'',delivery_address:''});else apply(destinations.find(x=>String(x.id)===select.value));syncButtons();};syncButtons();
    const nameInput=document.getElementById('deliveryName'),list=document.getElementById('deliveryDestinationList');
    const refreshSuggestions=()=>{if(!list)return;const query=nameInput?.value||'';list.innerHTML=destinations.filter(row=>deliverySearchMatches(row.delivery_name,query)).sort((a,b)=>String(a.delivery_name).localeCompare(String(b.delivery_name),'ko')).map(row=>`<option value="${escapeHtml(row.delivery_name)}">${escapeHtml(row.delivery_address||row.delivery_phone||'')}</option>`).join('')};
    nameInput?.addEventListener('input',()=>{refreshSuggestions();const match=findMatchingDeliveryDestination(destinations,{deliveryName:nameInput.value});if(match){select.value=String(match.id);apply(match)}else select.value='new';syncButtons()});refreshSuggestions();
  }
  if(manager)manager.innerHTML=!advanced?'':destinations.length?`<details><summary>저장된 거래처 정보 선택·수정 (${destinations.length})</summary>${destinations.map(row=>`<div class="delivery-destination-row"><button type="button" class="delivery-destination-select-button" onclick="selectSavedDestination('${row.id}')"><span><b>${escapeHtml(row.delivery_name)}</b><small>${escapeHtml(row.delivery_phone||'')} ${escapeHtml(row.delivery_address||'')}</small></span><em>선택</em></button><button type="button" onclick="editSavedDestination('${row.id}')">수정</button><button type="button" class="danger-btn" onclick="deleteSavedDestination('${row.id}')">삭제</button></div>`).join('')}</details>`:'';
}

function selectSavedDestination(id){const select=document.getElementById('deliveryDestinationSelect');if(!select)return;select.value=String(id);select.dispatchEvent(new Event('change'));document.getElementById('deliveryName')?.scrollIntoView({behavior:'smooth',block:'center'})}

async function editSavedDestination(id){if(!hasAdvancedCustomerAccess())return;const select=document.getElementById('deliveryDestinationSelect');if(select){select.value=String(id);select.dispatchEvent(new Event('change'));}const name=prompt('수정할 납품처명을 입력하세요.',document.getElementById('deliveryName')?.value||'');if(name===null)return;const phone=prompt('연락처를 입력하세요.',document.getElementById('deliveryPhone')?.value||'');if(phone===null)return;const address=prompt('주소를 입력하세요.',document.getElementById('deliveryAddress')?.value||'');if(address===null)return;const {error}=await supabaseClient.rpc('save_premium_customer_delivery_destination',{p_id:Number(id),p_delivery_name:name,p_delivery_phone:phone,p_delivery_address:address,p_is_default:false});if(error)return alert('납품처 수정 실패: '+error.message);await hydrateDeliveryDestinations();}
async function deleteSavedDestination(id){if(!hasAdvancedCustomerAccess())return;if(!confirm('이 납품처 정보를 삭제할까요?'))return;const {error}=await supabaseClient.rpc('delete_premium_customer_delivery_destination',{p_id:Number(id)});if(error)return alert('납품처 삭제 실패: '+error.message);await hydrateDeliveryDestinations();}
function selectedDestinationId(){const value=document.getElementById('deliveryDestinationSelect')?.value||'';return /^\d+$/.test(value)?value:null;}
function editSelectedDestination(){const id=selectedDestinationId();if(!id)return alert('수정할 저장 납품지를 선택해주세요.');editSavedDestination(id);}
function deleteSelectedDestination(){const id=selectedDestinationId();if(!id)return alert('삭제할 저장 납품지를 선택해주세요.');deleteSavedDestination(id);}
window.selectSavedDestination=selectSavedDestination;window.editSavedDestination=editSavedDestination;window.deleteSavedDestination=deleteSavedDestination;window.editSelectedDestination=editSelectedDestination;window.deleteSelectedDestination=deleteSelectedDestination;

async function submitOrder() {
  if (ADMIN_PREVIEW_MODE) { alert("관리자 미리보기에서는 주문 기능을 사용할 수 없습니다."); return; }
  if (cart.length === 0) {
    alert("장바구니가 비어 있습니다.");
    return;
  }
  if(!validateCartWarehouseCodes())return;

  if (!currentUser || !currentCustomer) {
    alert("로그인이 필요합니다.");
    location.href = "login.html";
    return;
  }

  const submitButton = document.getElementById(
    "submitOrderButton"
  );

  const memo =
    document.getElementById("orderMemo")?.value.trim() || "";
  // V6.6.57: 고객 주문도 접수 직전 선택된 저장 납품처를 input에 다시 동기화한다.
  const destinationSelect=document.getElementById('deliveryDestinationSelect');
  if(destinationSelect&&/^\d+$/.test(destinationSelect.value)){
    const {data:selected}=await supabaseClient.from('customer_delivery_destinations').select('delivery_name,delivery_phone,delivery_address').eq('id',Number(destinationSelect.value)).eq('customer_id',currentUser.id).maybeSingle();
    if(selected){
      document.getElementById('deliveryName').value=selected.delivery_name||'';
      document.getElementById('deliveryPhone').value=selected.delivery_phone||'';
      document.getElementById('deliveryAddress').value=selected.delivery_address||'';
    }
  }
  const deliveryName=document.getElementById('deliveryName')?.value.trim()||'';
  const deliveryPhone=document.getElementById('deliveryPhone')?.value.trim()||'';
  const deliveryAddress=document.getElementById('deliveryAddress')?.value.trim()||'';
  if(!deliveryName)return alert('납품처명을 입력해주세요.');
  if(!deliveryAddress)return alert('납품처 주소를 입력해주세요.');
  if(orderSubmissionInProgress)return alert('주문을 저장하고 있습니다. 잠시만 기다려주세요.');
  orderSubmissionInProgress=true;

  const revisionContext=await validateOrderRevisionContext();
  const orderNumber = revisionContext?.orderNumber || makeOrderNumber();

  const orderItemsSorted = [...cart].sort(cartItemNumberCompare);
  const orderRows = orderItemsSorted.map(item => ({
    order_number: orderNumber,
    customer_id: currentUser.id,
    customer_name: currentCustomer.business_name,
    customer_owner_name: currentCustomer.owner_name || currentCustomer.representative || null,
    delivery_name: deliveryName,
    delivery_phone: deliveryPhone || null,
    delivery_address: deliveryAddress || null,
    memo,
    item_number: item.number,
    warehouse_code: item.warehouseCode || null,
    qty: Number(item.qty),
    price: Number(item.price),
    total: Number(item.qty) * Number(item.price),
    status: "주문접수",
    shipping_fee: 0,
    is_soldout: false
  }));

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "주문 저장 중...";
  }

  const revisionItems=orderItemsSorted.map(item=>({item_number:String(item.number),warehouse_code:item.warehouseCode||null,qty:Number(item.qty),price:Number(item.price)}));
  const { error } = revisionContext
    ? await supabaseClient.rpc('customer_complete_order_revision',{
        p_order_number:orderNumber,p_items:revisionItems,p_memo:memo,p_delivery_name:deliveryName,
        p_delivery_phone:deliveryPhone,p_delivery_address:deliveryAddress
      })
    : await supabaseClient.from("orders").insert(orderRows);

  if (error) {
    orderSubmissionInProgress=false;
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "주문 접수하기";
    }

    alert(`${revisionContext?'주문 수정완료':'주문 저장'} 실패: ${error.message}`);
    return;
  }

  if(revisionContext){
    const finalized=await supabaseClient.rpc('customer_finalize_unpicked_revision',{p_order_number:orderNumber});
    if(finalized.error)console.warn('주문 수정상태 정리 실패:',finalized.error.message);
  }

  const deliverySave=await supabaseClient.rpc('save_order_delivery_info',{
    p_order_number:orderNumber,
    p_owner_name:currentCustomer.owner_name||currentCustomer.representative||'',
    p_delivery_name:deliveryName,
    p_delivery_phone:deliveryPhone,
    p_delivery_address:deliveryAddress
  });
  if(deliverySave.error)console.warn('납품처 목록 저장 실패:',deliverySave.error.message);
  const deliveryVerify=await supabaseClient.from('orders').select('delivery_name').eq('order_number',orderNumber).limit(1).maybeSingle();
  if(deliveryVerify.error||String(deliveryVerify.data?.delivery_name||'').trim()!==deliveryName){
    orderSubmissionInProgress=false;
    if(submitButton){submitButton.disabled=false;submitButton.textContent=revisionContext?'주문 수정완료':'주문 접수하기';}
    alert('실제 납품처 저장 검증에 실패했습니다. 거래처명으로 잘못 저장되는 것을 막기 위해 완료 처리를 중단했습니다.');
    return;
  }
  const destinationChoice=document.getElementById('deliveryDestinationSelect')?.value||'';
  if(destinationChoice==='new'&&hasAdvancedCustomerAccess()){
    const destinationSave=await supabaseClient.rpc('save_premium_customer_delivery_destination',{
      p_id:null,p_delivery_name:deliveryName,p_delivery_phone:deliveryPhone,p_delivery_address:deliveryAddress,p_is_default:false
    });
    if(destinationSave.error)console.warn('새 납품처 자동 저장 실패:',destinationSave.error.message);
  }
  localStorage.removeItem(CUSTOMER_BULK_DELIVERY_DRAFT_KEY);
  if(revisionContext)clearOrderRevisionContext();

  let totalQty = 0;
  let totalPrice = 0;

  const completeItems = orderItemsSorted
    .map(item => {
      const itemTotal =
        Number(item.qty) * Number(item.price);

      totalQty += Number(item.qty);
      totalPrice += itemTotal;

      return `
        <div class="cart-item">
          <strong>${escapeHtml(customerDisplayItemNumber(item.number))}</strong>
          <span>${Number(item.qty).toLocaleString()}죽 · 단가 ${Number(item.price).toLocaleString()}원 / 1죽</span>
          <span>${itemTotal.toLocaleString()}원</span>
        </div>
      `;
    })
    .join("");

  catalogList.innerHTML = `
    <div class="product-card">
      <h2>✅ ${revisionContext?'주문 수정이 완료되었습니다':'주문이 접수되었습니다'}</h2>

      <p>
        <strong>주문번호:</strong>
        ${escapeHtml(orderNumber)}
      </p>

      <p>
        <strong>거래처:</strong>
        ${escapeHtml(currentCustomer.business_name)}
      </p>

      <p>
        <strong>메모:</strong>
        ${escapeHtml(memo || "-")}
      </p>

      ${completeItems}

      <hr>

      <h3>총수량: ${totalQty.toLocaleString()}죽</h3>

      <h2 class="price-text">
        총금액: ${totalPrice.toLocaleString()}원
      </h2>

      <button
        class="cart-btn"
        type="button"
        onclick="resetOrder()"
      >
        처음으로 돌아가기
      </button>

      <button
        class="cart-btn gray-btn"
        type="button"
        onclick="location.href='order.html'"
      >
        내 주문조회
      </button>
    </div>
  `;

  cart = [];
  clearSavedCart();
}

function resetOrder() {
  orderSubmissionInProgress = false;
  if (catalogSearch) catalogSearch.value = "";
  activeMainCategoryId = null;
  renderMainCategories();
}

function makeOrderNumber() {
  const now = new Date();

  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("");

  const timePart = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");

  const randomPart=(globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
    .replace(/-/g,"").slice(0,6).toUpperCase();
  return `DJ-${datePart}-${timePart}-${randomPart}`;
}

/* ================================
   사진 슬라이더
================================ */

function renderProductSlider(group) {
  const imageUrls = [
    group.image_url,
    ...(Array.isArray(group.image_urls)
      ? group.image_urls
      : [])
  ].filter(Boolean);

  if (imageUrls.length === 0) {
    return `
      <div class="catalog-no-image">
        등록된 사진 없음
      </div>
    `;
  }

  return `
    <div class="product-slider-wrap">
      <div
        id="product-slider-${group.id}"
        class="product-slider"
      >
        ${imageUrls.map((url, index) => `
          <img
            class="product-slider-image"
            src="${escapeAttribute(url)}"
            alt="${escapeAttribute(group.title)} 사진 ${index + 1}"
          >
        `).join("")}
      </div>

      ${
        imageUrls.length > 1
          ? `
            <button
              type="button"
              class="slider-arrow slider-prev"
              onclick="moveProductSlider(${group.id}, -1)"
              aria-label="이전 사진"
            >
              ‹
            </button>

            <button
              type="button"
              class="slider-arrow slider-next"
              onclick="moveProductSlider(${group.id}, 1)"
              aria-label="다음 사진"
            >
              ›
            </button>

            <div class="slider-count">
              사진 ${imageUrls.length}장
            </div>
          `
          : ""
      }
    </div>
  `;
}

function moveProductSlider(groupId, direction) {
  const slider = document.getElementById(
    `product-slider-${groupId}`
  );

  if (!slider) return;

  slider.scrollBy({
    left: slider.clientWidth * direction,
    behavior: "smooth"
  });
}

/* ================================
   보조 함수
================================ */

function getSoldoutItems(group) {
  // 거래처 화면의 품절 표시는 상품관리에서 관리자가 직접 지정한
  // product_groups.soldout_items 값만 사용합니다. ERP inventory_items의
  // 재고수량이 0이어도 거래처 화면에는 자동 품절로 표시하지 않습니다.
  return Array.isArray(group.soldout_items)
    ? group.soldout_items.map(String)
    : [];
}

function showSearch(visible, placeholder = "검색") {
  if (!catalogSearch) return;

  catalogSearch.style.display = visible ? "block" : "none";
  catalogSearch.placeholder = placeholder;
}

function hideLegacyFilters() {
  if (catalogFilters) {
    catalogFilters.style.display = "none";
    catalogFilters.innerHTML = "";
  }
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    // "언더 아머"와 "언더아머", 하이픈·특수문자 차이를 같은 검색어로 처리합니다.
    .replace(/[\s\-_./·,()\[\]{}]+/g, "");
}

function resolveUniqueOptionalSuffixItem(value) {
  const key = normalizeSearch(value);
  if (!key || !/\d$/.test(key)) return "";
  const allNumbers = groups.flatMap(group => (group.item_numbers || []).map(String));
  if (allNumbers.some(number => normalizeSearch(number) === key)) return "";
  const candidates = [...new Set(allNumbers.filter(number => {
    const itemKey = normalizeSearch(number);
    return /\d[am]$/.test(itemKey) && itemKey.slice(0, -1) === key;
  }))];
  return candidates.length === 1 ? candidates[0] : "";
}

function formatWon(value) {
  return `${Number(value || 0).toLocaleString()}원`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function escapeJsString(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");
}

function openCartImagePreview(imageUrl, title = "상품 사진") {
  let modal = document.getElementById("cartImagePreviewModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "cartImagePreviewModal";
    modal.className = "image-preview-modal";
    modal.innerHTML = `
      <button class="image-preview-backdrop" type="button" aria-label="사진 닫기"></button>
      <div class="image-preview-dialog" role="dialog" aria-modal="true">
        <button class="image-preview-close" type="button" aria-label="닫기">×</button>
        <img class="image-preview-large" alt="">
        <p class="image-preview-title"></p>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector(".image-preview-backdrop").addEventListener("click", closeCartImagePreview);
    modal.querySelector(".image-preview-close").addEventListener("click", closeCartImagePreview);
  }

  modal.querySelector(".image-preview-large").src = imageUrl;
  modal.querySelector(".image-preview-large").alt = title;
  modal.querySelector(".image-preview-title").textContent = title;
  modal.classList.add("open");
  document.body.classList.add("modal-open");
}

function closeCartImagePreview() {
  document.getElementById("cartImagePreviewModal")?.classList.remove("open");
  document.body.classList.remove("modal-open");
}

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeCartImagePreview();
});

/* ================================
   로그아웃 및 시작
================================ */

async function customerLogout() {
  const confirmed = confirm("로그아웃할까요?");
  if (!confirmed) return;

  sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
  await supabaseClient.auth.signOut();
  location.replace("login.html");
}



/* V5.2.1 실시간 통합 상품검색 */
function normalizedLiveSearch(value){
  return String(value||"").toLowerCase().replace(/\s+/g,"").trim();
}
function getGroupSearchText(group){
  const category=categories.find(item=>Number(item.id)===Number(group.category_id));
  const main=mainCategories.find(item=>Number(item.id)===Number(category?.main_category_id));
  return normalizedLiveSearch([
    group.title, group.price, ...(group.item_numbers||[]), category?.name, main?.name
  ].filter(Boolean).join(" "));
}
function renderCustomerSearchResults(keyword=""){
  const box=document.getElementById("customerSearchResults");
  if(!box)return;
  const query=normalizedLiveSearch(keyword);
  if(!query){
    box.innerHTML='<div class="customer-search-empty">브랜드 또는 품번을 입력하면 상품이 바로 표시됩니다.<br><small>예: 나이키, 6005</small></div>';
    return;
  }
  const matches=filterGroupsForSearch(keyword, group => getGroupSearchText(group)).slice(0,30);
  if(!matches.length){box.innerHTML='<div class="customer-search-empty">검색 결과가 없습니다.</div>';return;}
  box.innerHTML=matches.map(group=>{
    const category=categories.find(item=>Number(item.id)===Number(group.category_id));
    const numbers=(group.item_numbers||[]).map(String);
    const target=getGroupSearchMatch(group,keyword,group=>getGroupSearchText(group))?.target||numbers[0]||'';
    return `<button class="customer-search-result" type="button" data-search-group="${group.id}" data-search-item="${escapeAttribute(target)}">
      ${group.image_url?`<img loading="lazy" decoding="async" src="${escapeAttribute(groupThumbnailUrl(group))}" alt="">`:'<span class="search-result-no-image">🧦</span>'}
      <span><strong>${escapeHtml(group.title||'상품')}</strong><small>${escapeHtml(category?.name||'')} · ${numbers.map(escapeHtml).join(', ')}</small></span>
      <em>${formatGroupUnitPrice(group)}</em>
    </button>`;
  }).join('');
}
function openCustomerSearch(){
  const modal=document.getElementById("customerSearchModal");
  const input=document.getElementById("customerLiveSearch");
  if(!modal||!input)return;
  modal.hidden=false;modal.setAttribute("aria-hidden","false");document.body.classList.add("search-modal-open");
  input.value=catalogSearch?.value||"";renderCustomerSearchResults(input.value);
  requestAnimationFrame(()=>input.focus());
}
function closeCustomerSearch(){
  const modal=document.getElementById("customerSearchModal");if(!modal)return;
  modal.hidden=true;modal.setAttribute("aria-hidden","true");document.body.classList.remove("search-modal-open");
}
function bindCustomerSearchModal(){
  const modal=document.getElementById("customerSearchModal");
  const live=document.getElementById("customerLiveSearch");
  if(!modal||!live)return;
  document.querySelectorAll('[data-customer-search-trigger]').forEach(trigger=>{
    trigger.addEventListener('click',event=>{
      event.preventDefault();
      openCustomerSearch();
    });
  });
  live.addEventListener("input",()=>renderCustomerSearchResults(live.value));
  live.addEventListener("keydown",event=>{if(event.key==='Escape')closeCustomerSearch();if(event.key==='Enter'){modal.querySelector('.customer-search-result')?.click();}});
  modal.addEventListener("click",event=>{
    if(event.target.closest('[data-close-search]')){closeCustomerSearch();return;}
    const result=event.target.closest('[data-search-group]');if(!result)return;
    const groupId=Number(result.dataset.searchGroup);const item=result.dataset.searchItem||'';
    closeCustomerSearch();if(catalogSearch)catalogSearch.value='';openGroup(groupId,item);
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!modal.hidden)closeCustomerSearch();});
}
function openCartFromNavigation(){
  if(location.hash==='#cart'){
    renderCart();
    history.replaceState(null,'',location.pathname+location.search);
    document.querySelectorAll('.customer-bottom-nav a').forEach(link=>link.classList.toggle('active',link.getAttribute('href')==='catalog.html#cart'));
    return true;
  }
  return false;
}
window.addEventListener('hashchange',openCartFromNavigation);

async function startCatalogPage() {
  const allowed = await checkCustomerAccess();
  if (!allowed) return;

  await validateOrderRevisionContext();
  loadSavedCart();
  await loadCatalog();
  bindCustomerSearchModal();
  openCartFromNavigation();
  const pageParams=new URLSearchParams(location.search);
  if(pageParams.get('search')==='1'){
    openCustomerSearch();
    pageParams.delete('search');
    const cleanQuery=pageParams.toString();
    history.replaceState(null,'',location.pathname+(cleanQuery?'?'+cleanQuery:'')+location.hash);
  }
}

/* inline onclick에서 사용 */
window.renderMainCategories = renderMainCategories;
window.renderAllProducts = renderAllProducts;
window.renderBrandDirectory = renderBrandDirectory;
window.returnFromGroupDetail = returnFromGroupDetail;
window.openMainCategory = openMainCategory;
window.renderMainCategoryDetail = renderMainCategoryDetail;
window.openGroup = openGroup;
window.returnToActiveMainCategory = returnToActiveMainCategory;
window.changeCatalogQty = changeCatalogQty;
window.recalculateGroupTotal = recalculateGroupTotal;
window.addGroupToCart = addGroupToCart;
window.renderCart = renderCart;
window.setCustomerCartSort = setCustomerCartSort;
window.clearCustomerCart = clearCustomerCart;
window.continueShopping = continueShopping;
window.removeCartItem = removeCartItem;
window.setCartQty = setCartQty;
window.changeCartQty = changeCartQty;
window.showOrderForm = showOrderForm;
window.submitOrder = submitOrder;
window.resetOrder = resetOrder;
window.moveProductSlider = moveProductSlider;
window.customerLogout = customerLogout;
window.renderOrderHistoryPreview = renderOrderHistoryPreview;
window.openCartImagePreview = openCartImagePreview;
window.closeCartImagePreview = closeCartImagePreview;
window.openCustomerSearch = openCustomerSearch;
window.closeCustomerSearch = closeCustomerSearch;

startCatalogPage();


async function loadCustomerFeatureData(){
  try{
    const {data}=await supabaseClient.from("customer_favorites").select("target_id").eq("customer_id",currentUser.id).eq("target_type","main_category");
    favoriteMainCategoryIds=new Set((data||[]).map(x=>Number(x.target_id)));
  }catch(e){console.warn("즐겨찾기 불러오기 실패",e)}
  try{
    const {data}=await supabaseClient.from("app_settings").select("value").eq("key","bank_account").maybeSingle();
    customerBankSettings=data?.value||customerBankSettings;
  }catch(e){console.warn("계좌정보 불러오기 실패",e)}
  try{
    const {data}=await supabaseClient.from("orders").select("item_number,qty").eq("customer_id",currentUser.id).limit(1000);
    const counts={}; (data||[]).forEach(x=>counts[String(x.item_number)]=(counts[String(x.item_number)]||0)+Number(x.qty||0));
    frequentGroups=groups.map(g=>({...g,_frequency:(g.item_numbers||[]).reduce((sum,n)=>sum+(counts[String(n)]||0),0)})).filter(g=>g._frequency>0).sort((a,b)=>b._frequency-a._frequency).slice(0,16);
  }catch(e){console.warn("자주 사는 상품 계산 실패",e)}
}
function renderFrequentProducts(){
  if(!frequentGroups.length)return "";

  const visibleGroups = frequentProductsExpanded
    ? frequentGroups
    : frequentGroups.slice(0, 8);

  const moreButton = frequentGroups.length > 8
    ? `<button class="frequent-more-button" type="button" onclick="toggleFrequentProducts(event)">
         ${frequentProductsExpanded ? "접기" : "더보기"}
         <span aria-hidden="true">${frequentProductsExpanded ? "⌃" : "⌄"}</span>
       </button>`
    : "";

  return `
    <section class="product-card frequent-section">
      <h2>자주 사는 상품</h2>
      <div class="frequent-grid">
        ${visibleGroups.map(g=>`
          <button class="frequent-card" type="button" onclick="openGroup(${g.id})">
            <span class="frequent-card-image">
              ${g.image_url
                ? `<img loading="lazy" decoding="async" src="${escapeAttribute(groupThumbnailUrl(g))}" alt="${escapeAttribute(g.title)}">`
                : `<span class="frequent-no-image" aria-hidden="true">🧦</span>`}
            </span>
            <strong>${escapeHtml(g.title)}</strong>
            <small>${(g.item_numbers||[]).map(number=>escapeHtml(customerDisplayItemNumber(number))).join(", ")}</small>
          </button>`).join("")}
      </div>
      ${moreButton}
    </section>`;
}

function toggleFrequentProducts(event){
  event?.stopPropagation();
  frequentProductsExpanded = !frequentProductsExpanded;
  renderMainCategories();
}
window.toggleFrequentProducts = toggleFrequentProducts;
async function toggleMainCategoryFavorite(event,id){
  event?.stopPropagation(); const numeric=Number(id); const active=favoriteMainCategoryIds.has(numeric);
  let result;
  if(active) result=await supabaseClient.from("customer_favorites").delete().eq("customer_id",currentUser.id).eq("target_type","main_category").eq("target_id",numeric);
  else result=await supabaseClient.from("customer_favorites").insert({customer_id:currentUser.id,target_type:"main_category",target_id:numeric});
  if(result.error){alert("즐겨찾기 저장 실패: V2-FEATURE-SETUP.sql을 먼저 실행해주세요.\n"+result.error.message);return}
  active?favoriteMainCategoryIds.delete(numeric):favoriteMainCategoryIds.add(numeric);
  renderMainCategories();
}
function renderBankTransferBox(){
  const b=customerBankSettings||{}; if(!b.account)return `<div class="bank-transfer-box"><strong>입금 계좌</strong><p>관리자가 계좌번호를 등록하면 이곳에 표시됩니다.</p></div>`;
  return `<div class="bank-transfer-box"><strong>입금 계좌</strong><p>${escapeHtml(b.bankName||"")} ${escapeHtml(b.account||"")}</p><p>예금주: ${escapeHtml(b.holder||"")}</p><small>주문금액을 위 계좌로 송금해주세요.</small></div>`;
}

window.addEventListener("DOMContentLoaded", updateAdminPreviewBanner);


// V6.6.29: accidental Ctrl+V twice guard for customer bulk order
function normalizeCustomerPasteGuardText(v){return String(v||'').normalize('NFKC').replace(/\r\n/g,'\n').trim()}
function collapseCustomerExactDoublePaste(v){const t=String(v||'').replace(/\r\n/g,'\n'), n=t.length;for(let cut=Math.floor(n/2)-2;cut<=Math.floor(n/2)+2;cut++){if(cut>0&&normalizeCustomerPasteGuardText(t.slice(0,cut))===normalizeCustomerPasteGuardText(t.slice(cut)))return t.slice(0,cut).trim()}return v}
let customerLastBulkPaste={text:'',at:0};
document.addEventListener('paste',e=>{const el=e.target;if(el?.id!=='customerBulkOrderInput')return;const text=e.clipboardData?.getData('text')||'',now=Date.now();if(text&&customerLastBulkPaste.text===text&&now-customerLastBulkPaste.at<2500){e.preventDefault();const r=document.getElementById('customerBulkOrderResult');if(r)r.textContent='같은 내용의 연속 붙여넣기를 막았습니다.';return}customerLastBulkPaste={text,at:now};setTimeout(()=>{const fixed=collapseCustomerExactDoublePaste(el.value);if(fixed!==el.value){el.value=fixed;pendingCustomerBulkAnalysis=null;const r=document.getElementById('customerBulkOrderResult');if(r)r.textContent='중복으로 붙여넣어진 내용을 1회분으로 자동 정리했습니다.'}},0)});
