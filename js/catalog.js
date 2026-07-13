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

/* ================================
   공통 이벤트
================================ */

if (catalogSearch) {
  catalogSearch.addEventListener("input", () => {
    if (currentScreen === "main-categories") {
      renderMainCategories();
      return;
    }

    if (
      currentScreen === "main-category-detail" &&
      activeMainCategoryId
    ) {
      renderMainCategoryDetail(activeMainCategoryId);
    }
  });
}

/* ================================
   로그인 및 데이터 불러오기
================================ */

async function checkCustomerAccess() {
  const {
    data: { user },
    error: userError
  } = await supabaseClient.auth.getUser();

  if (userError || !user) {
    location.href = "login.html";
    return false;
  }

  const { data: customer, error: customerError } =
    await supabaseClient
      .from("customers")
      .select("*")
      .eq("id", user.id)
      .single();

  if (customerError || !customer) {
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
  );

  catalogList.innerHTML = `
    ${cartTopButton()}

    ${
      filtered.length > 0
        ? `
          <div class="main-category-grid">
            ${filtered.map(mainCategory => `
              <button
                class="main-category-card"
                type="button"
                onclick="openMainCategory(${mainCategory.id})"
              >
                ${renderMainCategoryImage(mainCategory)}

                <strong>
                  ${escapeHtml(mainCategory.name)}
                </strong>
              </button>
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

          ${
            category.description_text
              ? `
                <p class="category-short-description">
                  ${escapeHtml(category.description_text)}
                </p>
              `
              : ""
          }
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

      <strong>${escapeHtml(group.title)}</strong>

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

function openGroup(groupId) {
  const group = groups.find(
    item => Number(item.id) === Number(groupId)
  );

  if (!group) return;

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
            ${escapeHtml(numberText)}
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
            <span id="liveGroupQty">0</span>개
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
          price: Number(group.price)
        });
      }

      addedQty += qty;
    });

  if (addedQty === 0) {
    alert("수량을 1개 이상 입력해주세요.");
    return;
  }

  alert(`${addedQty}개가 장바구니에 담겼습니다.`);

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

      return `
        <div class="cart-item">
          <div>
            <strong>${escapeHtml(item.number)}</strong>
            <small>${escapeHtml(item.title)}</small>
          </div>

          <span>${Number(item.qty).toLocaleString()}개</span>

          <span>${itemTotal.toLocaleString()}원</span>

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

      <h3>총수량: ${totalQty.toLocaleString()}개</h3>

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
  renderCart();
}

/* ================================
   주문 접수
================================ */

function showOrderForm() {
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
          <span>${Number(item.qty).toLocaleString()}개</span>
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

      <h3>총수량: ${totalQty.toLocaleString()}개</h3>

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
    .trim()
    .toLowerCase();
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

/* ================================
   로그아웃 및 시작
================================ */

async function customerLogout() {
  const confirmed = confirm("로그아웃할까요?");
  if (!confirmed) return;

  await supabaseClient.auth.signOut();
  location.href = "login.html";
}

async function startCatalogPage() {
  const allowed = await checkCustomerAccess();
  if (!allowed) return;

  await loadCatalog();
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
window.showOrderForm = showOrderForm;
window.submitOrder = submitOrder;
window.resetOrder = resetOrder;
window.moveProductSlider = moveProductSlider;
window.customerLogout = customerLogout;

startCatalogPage();
