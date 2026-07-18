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

let currentScreen = "main-categories";
let activeMainCategoryId = null;
let currentUser = null;
let currentCustomer = null;
let favoriteMainCategoryIds = new Set();

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
  const group = groups.find(groupItem =>
    Number(groupItem.id) === Number(item.groupId)
  );
  return group?.image_url || "";
}

/* ================================
   공통 이벤트
================================ */

if (catalogSearch) {
  catalogSearch.addEventListener("input", () => {
  const keyword =
    catalogSearch.value.trim();

  /* 검색어가 있으면 대분류와 관계없이 전체 상품 검색 */
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
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

  if (ADMIN_PREVIEW_MODE) {
    const adminSessionId = sessionStorage.getItem("designjam_admin_session") || localStorage.getItem("designjam_admin_session");
    if (userError || !user || adminSessionId !== user.id) {
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

  const sessionUserId = sessionStorage.getItem(CUSTOMER_SESSION_KEY) || localStorage.getItem(CUSTOMER_SESSION_KEY);

  if (userError || !user || sessionUserId !== user.id) {
    sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
    if (user) await supabaseClient.auth.signOut();
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

/* ================================
   1단계: 대분류 목록
================================ */

function renderMainCategories() {
  currentScreen = "main-categories";
  activeMainCategoryId = null;

  showSearch(true, "대분류명 검색");
  hideLegacyFilters();

  const keyword = normalizeSearch(catalogSearch?.value);

  const filtered = mainCategories.filter(mainCategory =>
    normalizeSearch(mainCategory.name).includes(keyword)
  ).sort((a,b) => Number(favoriteMainCategoryIds.has(Number(b.id))) - Number(favoriteMainCategoryIds.has(Number(a.id))));

  catalogList.innerHTML = `
    ${cartTopButton()}
    ${renderFrequentProducts()}

    ${
      filtered.length > 0
        ? `
          <div class="main-category-grid">
            ${filtered.map(mainCategory => `
              <div class="favorite-category-card">
                <button class="main-category-card" type="button" onclick="openMainCategory(${mainCategory.id})">
                  ${renderMainCategoryImage(mainCategory)}
                  <strong>${escapeHtml(mainCategory.name)}</strong>
                </button>
                <button
                  class="favorite-star ${favoriteMainCategoryIds.has(Number(mainCategory.id)) ? "active" : ""}"
                  type="button"
                  onclick="toggleMainCategoryFavorite(event, ${mainCategory.id})"
                  aria-label="${favoriteMainCategoryIds.has(Number(mainCategory.id)) ? "즐겨찾기 해제" : "즐겨찾기 추가"}"
                  title="${favoriteMainCategoryIds.has(Number(mainCategory.id)) ? "즐겨찾기 해제" : "즐겨찾기 추가"}"
                >★</button>
              </div>
            `).join("")}
          </div>
        `
        : `
          <div class="product-card">
            <h2>검색 결과가 없습니다</h2>
          </div>
        `
    }
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

/* 브랜드·카테고리·품번 전체 검색 */
function renderGlobalSearchResults() {
  const keyword =
    catalogSearch.value
      .trim()
      .toLowerCase();

  currentScreen = "global-search";

  catalogFilters.style.display = "none";

  const matchedGroups = groups.filter(group =>
    buildGroupSearchText(group).includes(normalizeSearch(keyword))
  );

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
                    src="${escapeAttribute(group.image_url)}"
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
                .map(escapeHtml)
                .join(", ")}
            </p>

            <p class="price-text">
              ${Number(group.price).toLocaleString()}원
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

  renderMainCategoryDetail(activeMainCategoryId);
}

/* ================================
   2단계: 세부 카테고리 + 상품묶음
================================ */

function renderMainCategoryDetail(mainCategoryId) {
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

  showSearch(true, "카테고리명 또는 품번 검색");
  hideLegacyFilters();

  const keyword = normalizeSearch(catalogSearch?.value);

  const childCategories = categories
    .filter(category =>
      Number(category.main_category_id) === numericMainCategoryId
    )
    .map(category => ({
      ...category,
      categoryGroups: groups.filter(group =>
        Number(group.category_id) === Number(category.id)
      )
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
      onclick="renderMainCategories()"
    >
      ← 대분류 목록으로 돌아가기
    </button>

    <section class="product-card main-category-title-card">
      <h2>${escapeHtml(mainCategory.name)}</h2>
    </section>

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
          ${formatWon(category.price)}
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
      onclick="openGroup(${group.id})"
    >
      ${
        group.image_url
          ? `
            <img
              class="catalog-group-image"
              src="${escapeAttribute(group.image_url)}"
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
        ${itemNumbers.map(escapeHtml).join(", ")}
      </span>

      <span class="price-text">
        ${formatWon(group.price)}
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
        }">
          <label>
            <span class="favorite-item-number">${escapeHtml(numberText)}
              <button type="button" class="item-favorite-btn ${isItemFavorite(numberText)?'active':''}" onclick="toggleItemFavorite(event,'${escapeJsString(numberText)}')" aria-label="품번 즐겨찾기" aria-pressed="${isItemFavorite(numberText)?'true':'false'}" title="${isItemFavorite(numberText)?'즐겨찾기 해제':'즐겨찾기 추가'}">★</button>
            </span>
            ${isSoldout ? '<span class="soldout-label">품절</span>' : ""}
          </label>

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
      onclick="returnToActiveMainCategory()"
    >
      ← 상품 사진 목록으로 돌아가기
    </button>

    <div class="product-card">
      <h2>${escapeHtml(group.title)}</h2>

      <p>${escapeHtml(category.name)}</p>

      <p class="price-text">
        ${formatWon(group.price)}
      </p>

      ${renderProductSlider(group)}

      <div class="section-label">
        품번별 주문수량
      </div>

      ${quantityRows}

      <input
        id="currentGroupId"
        type="hidden"
        value="${group.id}"
      >

      <div class="live-group-total">
        <p>
          총수량:
          <strong>
            <span id="liveGroupQty">0</span>죽
          </strong>
        </p>

        <p>
          총금액:
          <strong>
            <span id="liveGroupPrice">0</span>원
          </strong>
        </p>
      </div>

      <div class="product-order-buttons">
        <button
          class="cart-btn"
          type="button"
          onclick="addGroupToCart(${group.id}, 'cart')"
        >
          🛒 장바구니 담기
        </button>

        <button
          class="cart-btn direct-order-btn"
          type="button"
          onclick="addGroupToCart(${group.id}, 'order')"
        >
          바로 주문하기
        </button>

        <button
          class="cart-btn gray-btn"
          type="button"
          onclick="returnToActiveMainCategory()"
        >
          다른 상품 계속 보기
        </button>
      </div>
    </div>
  `;

  if (requestedItem) {
    requestAnimationFrame(() => focusRequestedItem(requestedItem));
  }
}

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

  document
    .querySelectorAll(".catalog-qty-input:not(:disabled)")
    .forEach(input => {
      totalQty += Math.max(0, Number(input.value) || 0);
    });

  const totalPrice = totalQty * Number(group.price || 0) * 10;

  const qtyBox = document.getElementById("liveGroupQty");
  const priceBox = document.getElementById("liveGroupPrice");

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
    <button
      class="cart-btn catalog-cart-button"
      type="button"
      onclick="renderCart()"
    >
      🛒 장바구니 ${totalQty > 0 ? `(${totalQty})` : ""}
    </button>
  `;
}

function addGroupToCart(groupId, nextAction = "cart") {
  if (ADMIN_PREVIEW_MODE) { alert("관리자 미리보기에서는 주문 기능을 사용할 수 없습니다."); return; }
  const group = groups.find(
    item => Number(item.id) === Number(groupId)
  );

  if (!group) return;

  let addedQty = 0;

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
      } else {
        cart.push({
          groupId: group.id,
          categoryId: group.category_id,
          title: group.title,
          number,
          qty,
          price: Number(group.price),
          imageUrl: group.image_url || ""
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

  renderCart();
}

function renderCart() {
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

  const itemHtml = cart
    .map((item, index) => {
      const itemTotal =
        Number(item.qty) * Number(item.price) * 10;

      totalQty += Number(item.qty);
      totalPrice += itemTotal;

      const imageUrl = getCartItemImage(item);

      return `
        <div class="cart-item cart-edit-item">
          <div class="cart-product-info">
            ${imageUrl
              ? `<button class="cart-thumb-button" type="button" onclick="openCartImagePreview('${escapeJsString(imageUrl)}', '${escapeJsString(item.title)}')" aria-label="${escapeAttribute(item.title)} 사진 크게 보기"><img class="cart-thumb" src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(item.title)}"></button>`
              : `<div class="cart-thumb cart-thumb-empty">사진 없음</div>`
            }
            <div>
              <strong>${escapeHtml(item.number)}</strong>
              <small>${escapeHtml(item.title)}</small>
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
      ← 계속 쇼핑하기
    </button>

    <div class="product-card">
      <h2>🛒 장바구니</h2>

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
}

function continueShopping() {
  if (activeMainCategoryId) {
    renderMainCategoryDetail(activeMainCategoryId);
    return;
  }

  renderMainCategories();
}

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

  catalogList.innerHTML = `
    <div class="product-card">
      <h2>주문 정보 입력</h2>

      <p class="logged-customer">
        <strong>거래처:</strong>
        ${escapeHtml(currentCustomer.business_name)}
      </p>

      ${renderBankTransferBox()}

      <label for="orderMemo">메모</label>

      <input
        id="orderMemo"
        class="order-input"
        type="text"
        placeholder="예: 빠른출고, 오후배송"
      >

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
}

async function submitOrder() {
  if (ADMIN_PREVIEW_MODE) { alert("관리자 미리보기에서는 주문 기능을 사용할 수 없습니다."); return; }
  if (cart.length === 0) {
    alert("장바구니가 비어 있습니다.");
    return;
  }

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

  const orderNumber = makeOrderNumber();

  const orderRows = cart.map(item => ({
    order_number: orderNumber,
    customer_id: currentUser.id,
    customer_name: currentCustomer.business_name,
    memo,
    item_number: item.number,
    qty: Number(item.qty),
    price: Number(item.price),
    total: Number(item.qty) * Number(item.price) * 10,
    status: "주문접수",
    shipping_fee: 0,
    is_soldout: false
  }));

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "주문 저장 중...";
  }

  const { error } = await supabaseClient
    .from("orders")
    .insert(orderRows);

  if (error) {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "주문 접수하기";
    }

    alert("주문 저장 실패: " + error.message);
    return;
  }

  let totalQty = 0;
  let totalPrice = 0;

  const completeItems = cart
    .map(item => {
      const itemTotal =
        Number(item.qty) * Number(item.price) * 10;

      totalQty += Number(item.qty);
      totalPrice += itemTotal;

      return `
        <div class="cart-item">
          <strong>${escapeHtml(item.number)}</strong>
          <span>${Number(item.qty).toLocaleString()}죽</span>
          <span>${itemTotal.toLocaleString()}원</span>
        </div>
      `;
    })
    .join("");

  catalogList.innerHTML = `
    <div class="product-card">
      <h2>✅ 주문이 접수되었습니다</h2>

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

  return `DJ-${datePart}-${timePart}`;
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
  const matches=groups.filter(group=>getGroupSearchText(group).includes(query)).slice(0,30);
  if(!matches.length){box.innerHTML='<div class="customer-search-empty">검색 결과가 없습니다.</div>';return;}
  box.innerHTML=matches.map(group=>{
    const category=categories.find(item=>Number(item.id)===Number(group.category_id));
    const numbers=(group.item_numbers||[]).map(String);
    const exact=numbers.find(number=>normalizedLiveSearch(number).includes(query));
    const target=exact||numbers[0]||'';
    return `<button class="customer-search-result" type="button" data-search-group="${group.id}" data-search-item="${escapeAttribute(target)}">
      ${group.image_url?`<img src="${escapeAttribute(group.image_url)}" alt="">`:'<span class="search-result-no-image">🧦</span>'}
      <span><strong>${escapeHtml(group.title||'상품')}</strong><small>${escapeHtml(category?.name||'')} · ${numbers.map(escapeHtml).join(', ')}</small></span>
      <em>${formatWon(group.price)}</em>
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
window.openMainCategory = openMainCategory;
window.renderMainCategoryDetail = renderMainCategoryDetail;
window.openGroup = openGroup;
window.returnToActiveMainCategory = returnToActiveMainCategory;
window.changeCatalogQty = changeCatalogQty;
window.recalculateGroupTotal = recalculateGroupTotal;
window.addGroupToCart = addGroupToCart;
window.renderCart = renderCart;
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
                ? `<img src="${escapeAttribute(g.image_url)}" alt="${escapeAttribute(g.title)}">`
                : `<span class="frequent-no-image" aria-hidden="true">🧦</span>`}
            </span>
            <strong>${escapeHtml(g.title)}</strong>
            <small>${(g.item_numbers||[]).map(escapeHtml).join(", ")}</small>
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
