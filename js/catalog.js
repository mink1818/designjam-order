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
let cart = [];

let currentTag = "전체";
let currentScreen = "categories";

let currentUser = null;
let currentCustomer = null;

catalogSearch.addEventListener("input", () => {
  if (currentScreen === "categories") {
    renderCategories();
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

  const [categoryResponse, groupResponse] =
    await Promise.all([
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

  categories = categoryResponse.data || [];
  groups = groupResponse.data || [];

  renderTagFilters();
  renderCategories();
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
function renderCategories() {
  currentScreen = "categories";

  catalogSearch.style.display = "block";
  catalogFilters.style.display = "flex";

  const keyword =
    catalogSearch.value.trim().toLowerCase();

  const filtered = categories.filter(category => {
    const categoryGroups = groups.filter(
      group => group.category_id === category.id
    );

    const itemText = categoryGroups
      .map(group => [
        group.title,
        ...(group.item_numbers || []),
        group.price
      ].join(" "))
      .join(" ");

    const searchableText = [
      category.name,
      category.price,
      ...(category.tags || []),
      itemText
    ]
      .join(" ")
      .toLowerCase();

    const matchesTag =
      currentTag === "전체" ||
      (category.tags || []).includes(currentTag);

    return (
      matchesTag &&
      searchableText.includes(keyword)
    );
  });

  if (filtered.length === 0) {
    catalogList.innerHTML = `
      ${cartTopButton()}

      <div class="product-card">
        <h2>표시할 카테고리가 없습니다</h2>
      </div>
    `;
    return;
  }

  catalogList.innerHTML = `
    ${cartTopButton()}

    <div class="category-grid">
      ${filtered.map(category => `
        <button
          type="button"
          class="category-main-card catalog-click-card"
          onclick="openCategory(${category.id})"
        >
          ${
            category.cover_url
              ? `
                <img
                  src="${escapeAttribute(category.cover_url)}"
                  alt="${escapeAttribute(category.name)}"
                >
              `
              : `
                <div class="catalog-no-image">
                  등록된 사진 없음
                </div>
              `
          }

          <h2>${escapeHtml(category.name)}</h2>

          <div class="price-text">
            ${Number(category.price).toLocaleString()}원
          </div>
        </button>
      `).join("")}
    </div>
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
      <div class="order-row">
        <label>${escapeHtml(number)}</label>

        <input
          class="catalog-qty-input"
          type="number"
          min="0"
          value="0"
          data-number="${escapeAttribute(number)}"
        >
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

      ${
        group.image_url
          ? `
            <img
              class="order-detail-img"
              src="${escapeAttribute(group.image_url)}"
              alt="${escapeAttribute(group.title)}"
            >
          `
          : ""
      }

      <div class="section-label">
        품번별 주문수량
      </div>

      ${quantityRows}

      <button
        class="cart-btn"
        type="button"
        onclick="addGroupToCart(${group.id})"
      >
        장바구니 담기
      </button>
    </div>
  `;
}

/* 입력한 품번과 수량을 장바구니에 담기 */
function addGroupToCart(groupId) {
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
          onclick="renderCategories()"
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
      onclick="renderCategories()"
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

startCatalogPage();