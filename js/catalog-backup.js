const supabaseUrl =
  "https://dtjhuejmxrjkcxzvilgw.supabase.co";

const supabaseKey =
  "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";

const supabaseClient = window.supabase.createClient(
  supabaseUrl,
  supabaseKey
);

const catalogList =
  document.getElementById("catalogList");

const catalogSearch =
  document.getElementById("catalogSearch");

const catalogFilters =
  document.getElementById("catalogFilters");

let categories = [];
let groups = [];
let mainCategories = [];
let cart = [];

let currentTag = "전체";
let currentScreen = "main-categories";

let currentUser = null;
let currentCustomer = null;

catalogSearch.addEventListener("input", () => {

  if (currentScreen === "main-categories") {
    renderMainCategories();
    return;
  }

  if (currentScreen === "main-category-detail") {

    const activeMainCategoryId =
      Number(catalogList.dataset.mainCategoryId);

    if (activeMainCategoryId) {
      renderMainCategoryDetail(
        activeMainCategoryId
      );
    }

    return;
  }
});

/* 주문번호 생성 */
function makeOrderNumber() {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    now.getDate()
  ).padStart(2, "0");

  const hour = String(
    now.getHours()
  ).padStart(2, "0");

  const minute = String(
    now.getMinutes()
  ).padStart(2, "0");

  const second = String(
    now.getSeconds()
  ).padStart(2, "0");

  return `DJ-${year}${month}${day}-${hour}${minute}${second}`;
}

/* 로그인 및 거래처 승인 확인 */
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

/* Supabase 상품 데이터 불러오기 */
async function loadCatalog() {
  catalogList.innerHTML =
    "<p>상품을 불러오는 중...</p>";

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
  catalogList.innerHTML = `
    <div class="product-card">
      <h2>대분류를 불러오지 못했습니다</h2>
      <p>${escapeHtml(mainCategoryResponse.error.message)}</p>
    </div>
  `;
  return;
}

  if (categoryResponse.error) {
    catalogList.innerHTML = `
      <div class="product-card">
        <h2>카테고리를 불러오지 못했습니다</h2>
        <p>${escapeHtml(categoryResponse.error.message)}</p>
      </div>
    `;
    return;
  }

  if (groupResponse.error) {
    catalogList.innerHTML = `
      <div class="product-card">
        <h2>상품 묶음을 불러오지 못했습니다</h2>
        <p>${escapeHtml(groupResponse.error.message)}</p>
      </div>
    `;
    return;
  }

  mainCategories =
  mainCategoryResponse.data || [];

  categories = categoryResponse.data || [];
  groups = groupResponse.data || [];

  renderTagFilters();
  renderMainCategories();
}

/* 검색 태그 버튼 */
function renderTagFilters() {
  const tagSet = new Set(["전체"]);

  categories.forEach(category => {
    (category.tags || []).forEach(tag => {
      tagSet.add(tag);
    });
  });

  catalogFilters.innerHTML = "";

  [...tagSet].forEach(tag => {
    const button = document.createElement("button");

    button.className = "filter-btn";

    if (tag === currentTag) {
      button.classList.add("active");
    }

    button.textContent = tag;

    button.addEventListener("click", () => {
      currentTag = tag;
      currentScreen = "categories";

      renderTagFilters();
      renderCategories();
    });

    catalogFilters.appendChild(button);
  });
}

/* 상단 장바구니 버튼 */
function cartTopButton() {
  const totalQty = cart.reduce(
    (sum, item) => sum + item.qty,
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

/* 1단계: 카테고리 목록 */
function renderMainCategories() {
  currentScreen = "main-categories";

  catalogSearch.style.display = "block";
  catalogFilters.style.display = "none";

  const keyword =
    catalogSearch.value.trim().toLowerCase();

  const filtered = mainCategories.filter(mainCategory => {
    const searchableText = [
      mainCategory.name
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(keyword);
  });

  if (filtered.length === 0) {
    catalogList.innerHTML = `
      <div class="product-card">
        <h2>등록된 대분류가 없습니다</h2>
      </div>
    `;
    return;
  }

  catalogList.innerHTML = `
    ${cartTopButton()}

    <div class="main-category-grid">
      ${filtered.map(mainCategory => `
        <button
          class="main-category-card"
          type="button"
          onclick="openMainCategory(${mainCategory.id})"
        >
          ${
            mainCategory.cover_url
              ? `
                <img
                  src="${escapeAttribute(mainCategory.cover_url)}"
                  alt="${escapeAttribute(mainCategory.name)}"
                >
              `
              : `
                <div class="main-category-no-image">
                  🧦
                </div>
              `
          }

          <strong>
            ${escapeHtml(mainCategory.name)}
          </strong>
        </button>
      `).join("")}
    </div>
  `;
}

function renderMainCategoryDetail(mainCategoryId) {
  const mainCategory = mainCategories.find(
    item => item.id === mainCategoryId
  );

  if (!mainCategory) return;

  const keyword =
    catalogSearch.value.trim().toLowerCase();

  const childCategories = categories
    .filter(category =>
      category.main_category_id === mainCategoryId
    )
    .filter(category => {
      const categoryGroups = groups.filter(
        group => group.category_id === category.id
      );

      const groupText = categoryGroups
        .map(group => [
          group.title,
          ...(group.item_numbers || [])
        ].join(" "))
        .join(" ");

      const searchableText = [
        category.name,
        category.description_text || "",
        ...(category.tags || []),
        groupText
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(keyword);
    });

  if (childCategories.length === 0) {
    catalogList.innerHTML = `
      ${cartTopButton()}

      <button
        class="cart-btn gray-btn"
        type="button"
        onclick="renderMainCategories()"
      >
        ← 대분류 목록으로 돌아가기
      </button>

      <div class="product-card">
        <h2>등록된 상품이 없습니다</h2>
      </div>
    `;
    return;
  }

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

    ${childCategories.map(category => {
      const categoryGroups = groups.filter(
        group => group.category_id === category.id
      );

      return `
        <section class="product-card category-section-card">
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

          <p class="price-text">
            ${Number(category.price).toLocaleString()}원
          </p>

          <div class="catalog-group-grid">
            ${categoryGroups.map(group => `
              <button
                class="catalog-group-card"
                type="button"
                onclick="openGroup(${group.id})"
              >
                ${
                  group.image_url
                    ? `
                      <img
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

                <strong>
                  ${escapeHtml(group.title)}
                </strong>
              </button>
            `).join("")}
          </div>
        </section>
      `;
    }).join("")}
  `;
}

/* 2단계: 선택한 카테고리의 상품 묶음 */
function openCategory(categoryId) {
  currentScreen = "groups";

  catalogSearch.style.display = "none";
  catalogFilters.style.display = "none";

  const category = categories.find(
    item => item.id === categoryId
  );

  if (!category) return;

  const categoryGroups = groups.filter(
    group => group.category_id === categoryId
  );

  catalogList.innerHTML = `
    ${cartTopButton()}

    <button
      class="cart-btn gray-btn"
      type="button"
      onclick="renderCategories()"
    >
      ← 카테고리로 돌아가기
    </button>

    <div class="product-card">
      <h2>${escapeHtml(category.name)}</h2>

      ${
        category.info_url
          ? `
            <img
              class="catalog-info-image"
              src="${escapeAttribute(category.info_url)}"
              alt="${escapeAttribute(category.name)} 상세사진"
            >
          `
          : ""
      }

      <p class="price-text">
        기본 단가:
        ${Number(category.price).toLocaleString()}원
      </p>
    </div>

    <div class="catalog-group-grid">
      ${
        categoryGroups.length > 0
          ? categoryGroups.map(group => `
              <button
                type="button"
                class="catalog-group-card catalog-click-card"
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

                <p class="catalog-item-numbers">
                  ${(group.item_numbers || [])
                    .map(escapeHtml)
                    .join(", ")}
                </p>

                <p class="price-text">
                  ${Number(group.price).toLocaleString()}원
                </p>
              </button>
            `).join("")
          : `
            <div class="product-card">
              <h2>등록된 상품 묶음이 없습니다</h2>
            </div>
          `
      }
    </div>
  `;
}

/* 3단계: 품번별 수량 입력 */
function openGroup(groupId) {
  currentScreen = "detail";

  catalogSearch.style.display = "none";
  catalogFilters.style.display = "none";

  const group = groups.find(
    item => item.id === groupId
  );

  if (!group) return;

  const category = categories.find(
    item => item.id === group.category_id
  );

  const quantityRows = (group.item_numbers || [])
  .map(number => `
    <div class="order-row qty-control-row">
      <label>${escapeHtml(number)}</label>

      <div class="qty-control">
        <button
          type="button"
          class="qty-btn"
          onclick="changeCatalogQty('${escapeAttribute(number)}', -1)"
        >
          −
        </button>

        <input
          id="qty-${escapeAttribute(number)}"
          class="catalog-qty-input"
          type="number"
          min="0"
          value="0"
          data-number="${escapeAttribute(number)}"
          oninput="recalculateGroupTotal(${group.id})"
        >

        <button
          type="button"
          class="qty-btn"
          onclick="changeCatalogQty('${escapeAttribute(number)}', 1)"
        >
          +
        </button>
      </div>
    </div>
  `)
  .join("");

  catalogList.innerHTML = `
    ${cartTopButton()}

    <button
      class="cart-btn gray-btn"
      type="button"
      onclick="openCategory(${group.category_id})"
    >
      ← 상품 사진 목록으로 돌아가기
    </button>

    <div class="product-card">
      <h2>${escapeHtml(group.title)}</h2>

      <p>${escapeHtml(category?.name || "")}</p>

      <p class="price-text">
        ${Number(group.price).toLocaleString()}원
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
    onclick="openCategory(${group.category_id})"
  >
    다른 상품 계속 보기
  </button>

</div>
    </div>
  `;
}

function changeCatalogQty(itemNumber, amount) {
  const input = document.getElementById(`qty-${itemNumber}`);

  if (!input) return;

  const currentQty = Number(input.value) || 0;
  const nextQty = Math.max(0, currentQty + amount);

  input.value = nextQty;

  const groupId =
    Number(document.getElementById("currentGroupId")?.value);

  if (groupId) {
    recalculateGroupTotal(groupId);
  }
}

function recalculateGroupTotal(groupId) {
  const group = groups.find(
    item => item.id === groupId
  );

  if (!group) return;

  const inputs =
    document.querySelectorAll(".catalog-qty-input");

  let totalQty = 0;

  inputs.forEach(input => {
    totalQty += Number(input.value) || 0;
  });

  const totalPrice =
    totalQty * Number(group.price) * 10;

  const qtyBox =
    document.getElementById("liveGroupQty");

  const priceBox =
    document.getElementById("liveGroupPrice");

  if (qtyBox) {
    qtyBox.textContent = totalQty.toLocaleString();
  }

  if (priceBox) {
    priceBox.textContent = totalPrice.toLocaleString();
  }
}

window.changeCatalogQty = changeCatalogQty;
window.recalculateGroupTotal = recalculateGroupTotal;
window.renderMainCategories =
  renderMainCategories;

/* 입력한 품번과 수량을 장바구니에 담기 */
function addGroupToCart(groupId, nextAction = "cart") {
  const group = groups.find(
    item => item.id === groupId
  );

  if (!group) return;

  const inputs =
    document.querySelectorAll(".catalog-qty-input");

  let addedQty = 0;

  inputs.forEach(input => {
    const qty = Number(input.value) || 0;
    const number = input.dataset.number;

    if (qty <= 0) return;

    const existingItem = cart.find(
      item =>
        item.groupId === group.id &&
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

/* 장바구니 화면 */
function renderCart() {
  currentScreen = "cart";

  catalogSearch.style.display = "none";
  catalogFilters.style.display = "none";

  if (cart.length === 0) {
    catalogList.innerHTML = `
      <div class="product-card">
        <h2>장바구니가 비어 있습니다</h2>

        <button
          class="cart-btn"
          type="button"
          onclick="renderMainCategories("
        >
          상품 보러가기
        </button>
      </div>
    `;
    return;
  }

  let totalQty = 0;
  let totalPrice = 0;

  const itemHtml = cart.map((item, index) => {
    const itemTotal =
      item.qty * item.price * 10;

    totalQty += item.qty;
    totalPrice += itemTotal;

    return `
      <div class="cart-item">
        <div>
          <strong>${escapeHtml(item.number)}</strong>
          <small>${escapeHtml(item.title)}</small>
        </div>

        <span>${item.qty}개</span>

        <span>
          ${itemTotal.toLocaleString()}원
        </span>

        <button
          class="cart-remove-button"
          type="button"
          onclick="removeCartItem(${index})"
        >
          삭제
        </button>
      </div>
    `;
  }).join("");

  catalogList.innerHTML = `
    <button
      class="cart-btn gray-btn"
      type="button"
      onclick="renderMainCategories("
    >
      ← 계속 쇼핑하기
    </button>

    <div class="product-card">
      <h2>🛒 장바구니</h2>

      ${itemHtml}

      <hr>

      <h3>총수량: ${totalQty}개</h3>

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

/* 장바구니 품목 삭제 */
function removeCartItem(index) {
  cart.splice(index, 1);
  renderCart();
}

/* 주문정보 화면 */
function showOrderForm() {
  if (!currentUser || !currentCustomer) {
    alert("로그인 정보를 확인할 수 없습니다.");
    location.href = "login.html";
    return;
  }

  currentScreen = "order";

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

/* Supabase orders 테이블에 주문 저장 */
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

  const submitButton =
    document.getElementById("submitOrderButton");

  const memo =
    document.getElementById("orderMemo")?.value.trim() || "";

  const orderNumber = makeOrderNumber();

  const orderRows = cart.map(item => ({
    order_number: orderNumber,
    customer_id: currentUser.id,
    customer_name: currentCustomer.business_name,
    memo,
    item_number: item.number,
    qty: item.qty,
    price: item.price,
    total: item.qty * item.price * 10,
    status: "주문접수",
    shipping_fee: 0,
    is_soldout: false
  }));

  submitButton.disabled = true;
  submitButton.textContent = "주문 저장 중...";

  const { error } = await supabaseClient
    .from("orders")
    .insert(orderRows);

  if (error) {
    submitButton.disabled = false;
    submitButton.textContent = "주문 접수하기";

    alert("주문 저장 실패: " + error.message);
    return;
  }

  let totalQty = 0;
  let totalPrice = 0;

  const completeItems = cart.map(item => {
    const itemTotal =
      item.qty * item.price * 10;

    totalQty += item.qty;
    totalPrice += itemTotal;

    return `
      <div class="cart-item">
        <strong>${escapeHtml(item.number)}</strong>
        <span>${item.qty}개</span>
        <span>${itemTotal.toLocaleString()}원</span>
      </div>
    `;
  }).join("");

  catalogList.innerHTML = `
    <div class="product-card">
      <h2>✅ 주문이 접수되었습니다</h2>

      <p>
        <strong>주문번호:</strong>
        ${orderNumber}
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

      <h3>총수량: ${totalQty}개</h3>

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

/* 주문 완료 후 초기화 */
function resetOrder() {
  currentTag = "전체";
  catalogSearch.value = "";

  renderTagFilters();
  renderCategories();
}

/* 상품 이미지 슬라이더 */
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
            >
              ‹
            </button>

            <button
              type="button"
              class="slider-arrow slider-next"
              onclick="moveProductSlider(${group.id}, 1)"
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

window.moveProductSlider = moveProductSlider;

/* HTML 출력 안전처리 */
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

/* 상품 페이지 시작 */
async function startCatalogPage() {
  const allowed = await checkCustomerAccess();

  if (!allowed) return;

  await loadCatalog();
}

async function customerLogout() {
  const confirmed = confirm("로그아웃할까요?");

  if (!confirmed) return;

  await supabaseClient.auth.signOut();
  location.href = "login.html";
}

startCatalogPage();