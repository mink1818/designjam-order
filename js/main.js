const supabaseUrl = "https://dtjhuejmxrjkcxzvilgw.supabase.co";
const supabaseKey = "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

const categories = [
  {
    name: "나이키중목_몽클_불꽃_나이키 카바 단바닥",
    price: "1350원",
    tags: ["전체", "나이키", "중목", "카바", "1350원"],
    cover: "images/661~663.jpg",
    info: "images/661~663.jpg"
  },
  {
    name: "중목 파일 나이키.아디다스.다이와.데상트.언더아머.스파이더",
    price: "1500원",
    tags: ["전체", "나이키", "아디다스", "중목", "파일", "1500원"],
    cover: "images/941~950.jpg",
    info: "images/941~950.jpg"
  }
];

const sampleProducts = [
  {
    category: "나이키중목_몽클_불꽃_나이키 카바 단바닥",
    title: "661~663",
    price: 1350,
    image: "images/661~663.jpg",
    numbers: ["661", "662", "663"]
  },
  {
    category: "중목 파일 나이키.아디다스.다이와.데상트.언더아머.스파이더",
    title: "941~950",
    price: 1500,
    image: "images/941~950.jpg",
    numbers: ["941", "942", "943", "944", "945", "946", "947", "948", "949", "950"]
  }
];

const filterTags = ["전체", "특가", "행사", "나이키", "아디다스", "단목", "중목", "장목", "파일", "1250원", "1350원", "1500원"];

let currentFilter = "전체";
let cart = [];

const productList = document.getElementById("productList");
const searchInput = document.getElementById("searchInput");

function makeOrderNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");

  return `DJ-${y}${m}${d}-${h}${min}${s}`;
}

function renderCategories(keyword = "") {
  productList.innerHTML = "";

  const filterBox = document.createElement("div");
  filterBox.className = "filter-buttons";

  filterTags.forEach(tag => {
    const btn = document.createElement("button");
    btn.className = "filter-btn";
    if (tag === currentFilter) btn.classList.add("active");
    btn.textContent = tag;

    btn.addEventListener("click", () => {
      currentFilter = tag;
      renderCategories(searchInput.value.trim());
    });

    filterBox.appendChild(btn);
  });

  productList.appendChild(filterBox);

  const grid = document.createElement("div");
  grid.className = "category-grid";

  const filtered = categories.filter(cat => {
    const matchSearch =
      cat.name.includes(keyword) ||
      cat.price.includes(keyword);

    const matchTag =
      currentFilter === "전체" ||
      cat.tags.includes(currentFilter);

    return matchSearch && matchTag;
  });

  filtered.forEach(cat => {
    const card = document.createElement("div");
    card.className = "category-main-card";

    card.innerHTML = `
      <img src="${cat.cover}" alt="${cat.name}">
      <h2>${cat.name}</h2>
      <div class="price-text">${cat.price}</div>
    `;

    card.addEventListener("click", () => renderProducts(cat.name));
    grid.appendChild(card);
  });

  productList.appendChild(grid);
}

function renderProducts(categoryName) {
  productList.innerHTML = "";

  const category = categories.find(cat => cat.name === categoryName);

  productList.innerHTML += `
    <button class="cart-btn" onclick="renderCategories(searchInput.value.trim())">← 카테고리로 돌아가기</button>
    <div class="detail-title">${category.name}</div>
    ${category.info ? `<img class="info-img" src="${category.info}" alt="상세 설명">` : ""}
    <div class="section-label">상품 사진 목록</div>
  `;

  const products = sampleProducts.filter(item => item.category === categoryName);

  const grid = document.createElement("div");
  grid.className = "gallery-grid";

  products.forEach(product => {
    const card = document.createElement("div");
    card.className = "gallery-card";

    card.innerHTML = `
      <img src="${product.image}" alt="${product.title}">
      <h3>${product.title}</h3>
      <p>${product.numbers.join(", ")}</p>
    `;

    card.addEventListener("click", () => openOrder(product));
    grid.appendChild(card);
  });

  productList.appendChild(grid);
}

function openOrder(product) {
  productList.innerHTML = "";

  let inputHtml = "";

  product.numbers.forEach(num => {
    inputHtml += `
      <div class="order-row">
        <label>${num}</label>
        <input type="number" min="0" value="0" data-number="${num}">
      </div>
    `;
  });

  productList.innerHTML = `
    <button class="cart-btn" onclick="renderProducts('${product.category}')">← 상품 사진 목록으로 돌아가기</button>

    <div class="product-card">
      <h2>${product.title}</h2>
      <div class="price">${product.price.toLocaleString()}원</div>
      <img class="order-detail-img" src="${product.image}" alt="${product.title}">
      ${inputHtml}
      <button class="cart-btn" onclick='addToCart(${JSON.stringify(product)})'>장바구니 담기</button>
    </div>
  `;
}

function addToCart(product) {
  const inputs = document.querySelectorAll("input[data-number]");
  let addedCount = 0;

  inputs.forEach(input => {
    const qty = Number(input.value);
    const number = input.dataset.number;

    if (qty > 0) {
      cart.push({
        number,
        qty,
        price: product.price,
        title: product.title
      });

      addedCount += qty;
    }
  });

  if (addedCount === 0) {
    alert("수량을 1개 이상 입력해주세요.");
    return;
  }

  renderCart();
}

function renderCart() {
  productList.innerHTML = "";

  if (cart.length === 0) {
    productList.innerHTML = `
      <div class="product-card">
        <h2>장바구니가 비어있습니다</h2>
        <button class="cart-btn" onclick="renderCategories()">처음으로</button>
      </div>
    `;
    return;
  }

  let totalQty = 0;
  let totalPrice = 0;
  let cartHtml = "";

  cart.forEach(item => {
    const itemTotal = item.qty * item.price;
    totalQty += item.qty;
    totalPrice += itemTotal;

    cartHtml += `
      <div class="cart-item">
        <strong>${item.number}</strong>
        <span>${item.qty}개</span>
        <span>${itemTotal.toLocaleString()}원</span>
      </div>
    `;
  });

  productList.innerHTML = `
    <button class="cart-btn" onclick="renderCategories()">← 계속 쇼핑하기</button>

    <div class="product-card">
      <h2>🛒 장바구니</h2>
      ${cartHtml}
      <hr>
      <h3>총수량: ${totalQty}개</h3>
      <h3>총금액: ${totalPrice.toLocaleString()}원</h3>
      <button class="cart-btn" onclick="showOrderForm()">주문하기</button>
    </div>
  `;
}

function showOrderForm() {
  productList.innerHTML = `
    <div class="product-card">
      <h2>주문 정보 입력</h2>

      <label>거래처명</label>
      <input class="order-input" id="customerName" placeholder="예: 박다혜">

      <label>메모</label>
      <input class="order-input" id="orderMemo" placeholder="예: 빠른출고">

      <button class="cart-btn" onclick="submitOrder()">주문 접수하기</button>
      <button class="cart-btn gray-btn" onclick="renderCart()">← 장바구니로 돌아가기</button>
    </div>
  `;
}

async function submitOrder() {
  if (cart.length === 0) {
    alert("장바구니가 비어있습니다.");
    return;
  }

  const orderNumber = makeOrderNumber();
  const customerName = document.getElementById("customerName")?.value || "거래처 미입력";
  const orderMemo = document.getElementById("orderMemo")?.value || "";

  const orderRows = cart.map(item => ({
    order_number: orderNumber,
    customer_name: customerName,
    memo: orderMemo,
    item_number: item.number,
    qty: item.qty,
    price: item.price,
    total: item.qty * item.price,
    status: "주문접수"
  }));

  const { error } = await supabaseClient
    .from("orders")
    .insert(orderRows);

  if (error) {
    alert("주문 저장 실패: " + error.message);
    console.error(error);
    return;
  }

  let orderHtml = "";

  cart.forEach(item => {
    orderHtml += `
      <div class="cart-item">
        <strong>${item.number}</strong>
        <span>${item.qty}개</span>
        <span>${(item.qty * item.price).toLocaleString()}원</span>
      </div>
    `;
  });

  productList.innerHTML = `
    <div class="product-card">
      <h2>✅ 주문이 접수되었습니다</h2>
      <p>주문번호: ${orderNumber}</p>
      <p>거래처: ${customerName}</p>
      <p>메모: ${orderMemo}</p>
      ${orderHtml}
      <button class="cart-btn" onclick="resetOrder()">처음으로 돌아가기</button>
    </div>
  `;

  cart = [];
}

function resetOrder() {
  renderCategories("");
}

searchInput.addEventListener("input", () => {
  renderCategories(searchInput.value.trim());
});

renderCategories();