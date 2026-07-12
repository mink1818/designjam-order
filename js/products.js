const supabaseUrl =
  "https://dtjhuejmxrjkcxzvilgw.supabase.co";

  const coverFile =
document.getElementById("categoryCoverFile");

const infoFile =
document.getElementById("categoryInfoFile");

const groupFile =
document.getElementById("groupImageFile");

const startItem =
document.getElementById("startItem");

const endItem =
document.getElementById("endItem");

const generateItemsBtn =
document.getElementById("generateItemsBtn");

coverFile.addEventListener("change", async () => {
  const file = coverFile.files[0];

  if (!file) return;

  coverFile.disabled = true;

  try {
    showMessage(
      "categoryMessage",
      "대표사진을 업로드하는 중입니다."
    );

    const publicUrl =
      await uploadImage(file, "category-cover");

    document.getElementById("categoryCover").value =
      publicUrl;

    showMessage(
      "categoryMessage",
      "대표사진 업로드가 완료되었습니다."
    );
  } catch (error) {
    showMessage(
      "categoryMessage",
      "대표사진 업로드 실패: " + error.message,
      true
    );
  } finally {
    coverFile.disabled = false;
  }
});

infoFile.addEventListener("change", async () => {
  const file = infoFile.files[0];

  if (!file) return;

  infoFile.disabled = true;

  try {
    showMessage(
      "categoryMessage",
      "상세사진을 업로드하는 중입니다."
    );

    const publicUrl =
      await uploadImage(file, "category-info");

    document.getElementById("categoryInfo").value =
      publicUrl;

    showMessage(
      "categoryMessage",
      "상세사진 업로드가 완료되었습니다."
    );
  } catch (error) {
    showMessage(
      "categoryMessage",
      "상세사진 업로드 실패: " + error.message,
      true
    );
  } finally {
    infoFile.disabled = false;
  }
});

groupFile.addEventListener("change", async () => {
  const file = groupFile.files[0];

  if (!file) return;

  groupFile.disabled = true;

  try {
    showMessage(
      "groupMessage",
      "상품사진을 업로드하는 중입니다."
    );

    const publicUrl =
      await uploadImage(file, "product-groups");

    document.getElementById("groupImage").value =
      publicUrl;

    showMessage(
      "groupMessage",
      "상품사진 업로드가 완료되었습니다."
    );
  } catch (error) {
    showMessage(
      "groupMessage",
      "상품사진 업로드 실패: " + error.message,
      true
    );
  } finally {
    groupFile.disabled = false;
  }
});

const supabaseKey =
  "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";

const supabaseClient = window.supabase.createClient(
  supabaseUrl,
  supabaseKey
);

const categoryList = document.getElementById("categoryList");
const groupList = document.getElementById("groupList");
const categorySearch = document.getElementById("categorySearch");

let allCategories = [];
let allGroups = [];

document
  .getElementById("saveCategoryButton")
  .addEventListener("click", saveCategory);

document
  .getElementById("saveGroupButton")
  .addEventListener("click", saveGroup);

categorySearch.addEventListener("input", renderCategoryList);

/* 관리자 권한 확인 */
async function checkAdminAccess() {
  const {
    data: { user },
    error: userError
  } = await supabaseClient.auth.getUser();

  if (userError || !user) {
    location.href = "admin.html";
    return false;
  }

  const { data: customer, error: customerError } =
    await supabaseClient
      .from("customers")
      .select("is_admin, blocked")
      .eq("id", user.id)
      .single();

  if (
    customerError ||
    !customer ||
    !customer.is_admin ||
    customer.blocked
  ) {
    alert("관리자 권한이 없습니다.");
    location.href = "login.html";
    return false;
  }

  return true;
}

/* 쉼표로 입력한 값을 배열로 변환 */
function parseCommaList(value) {
  return value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function showMessage(elementId, message, isError = false) {
  const box = document.getElementById(elementId);

  box.innerHTML = `
    <p class="${isError ? "auth-error" : "product-success"}">
      ${message}
    </p>
  `;
}

/* 카테고리와 상품 묶음 불러오기 */
async function loadProductData() {
  categoryList.innerHTML =
    "<p>카테고리를 불러오는 중...</p>";

  groupList.innerHTML =
    "<p>상품 묶음을 불러오는 중...</p>";

  const [categoryResponse, groupResponse] =
    await Promise.all([
      supabaseClient
        .from("product_categories")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true }),

      supabaseClient
        .from("product_groups")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
    ]);

  if (categoryResponse.error) {
    categoryList.innerHTML = `
      <div class="product-card">
        <h2>카테고리 불러오기 실패</h2>
        <p>${categoryResponse.error.message}</p>
      </div>
    `;
    return;
  }

  if (groupResponse.error) {
    groupList.innerHTML = `
      <div class="product-card">
        <h2>상품 묶음 불러오기 실패</h2>
        <p>${groupResponse.error.message}</p>
      </div>
    `;
    return;
  }

  allCategories = categoryResponse.data || [];
  allGroups = groupResponse.data || [];

  renderCategoryOptions();
  renderCategoryList();
  renderGroupList();
}

/* 상품 묶음 등록창의 카테고리 선택 목록 */
function renderCategoryOptions() {
  const select = document.getElementById("groupCategory");
  const previousValue = select.value;

  select.innerHTML = `
    <option value="">카테고리를 선택하세요</option>
  `;

  allCategories.forEach(category => {
    select.innerHTML += `
      <option value="${category.id}">
        ${category.name}
      </option>
    `;
  });

  if (previousValue) {
    select.value = previousValue;
  }
}

/* 카테고리 목록 출력 */
function renderCategoryList() {
  const keyword =
    categorySearch.value.trim().toLowerCase();

  const filtered = allCategories.filter(category => {
    const searchableText = [
      category.name,
      ...(category.tags || []),
      String(category.price)
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(keyword);
  });

  if (filtered.length === 0) {
    categoryList.innerHTML = `
      <div class="product-card">
        <h2>등록된 카테고리가 없습니다</h2>
      </div>
    `;
    return;
  }

  categoryList.innerHTML = filtered.map(category => `
    <div class="product-card product-admin-card">
      <div class="product-admin-top">
        <div>
          <h2>${category.name}</h2>

          <p>
            <strong>기본 단가:</strong>
            ${Number(category.price).toLocaleString()}원
          </p>
        </div>

        <span class="status-badge ${
          category.is_active ? "done" : "blocked"
        }">
          ${category.is_active ? "표시 중" : "숨김"}
        </span>
      </div>

      ${
        category.cover_url
          ? `
            <img
              class="admin-product-image"
              src="${category.cover_url}"
              alt="${category.name}"
            >
          `
          : ""
      }

      <p>
        <strong>태그:</strong>
        ${(category.tags || []).join(", ") || "-"}
      </p>

      <p>
        <strong>대표사진:</strong>
        ${category.cover_url || "-"}
      </p>

      <p>
        <strong>설명사진:</strong>
        ${category.info_url || "-"}
      </p>

      <p>
        <strong>표시 순서:</strong>
        ${category.sort_order}
      </p>

      <button
        class="cart-btn"
        type="button"
        onclick="editCategory(${category.id})"
      >
        카테고리 수정
      </button>

      <button
        class="cart-btn gray-btn"
        type="button"
        onclick="toggleCategoryActive(
          ${category.id},
          ${category.is_active}
        )"
      >
        ${category.is_active ? "카테고리 숨기기" : "다시 표시"}
      </button>
    </div>
  `).join("");
}

/* 상품 사진 묶음 목록 출력 */
function renderGroupList() {
  if (allGroups.length === 0) {
    groupList.innerHTML = `
      <div class="product-card">
        <h2>등록된 상품 묶음이 없습니다</h2>
      </div>
    `;
    return;
  }

  groupList.innerHTML = allGroups.map(group => {
    const category = allCategories.find(
      item => item.id === group.category_id
    );

    return `
      <div class="product-card product-admin-card">
        <div class="product-admin-top">
          <div>
            <h2>${group.title}</h2>

            <p>
              <strong>카테고리:</strong>
              ${category?.name || "카테고리 없음"}
            </p>
          </div>

          <span class="status-badge ${
            group.is_active ? "done" : "blocked"
          }">
            ${group.is_active ? "표시 중" : "숨김"}
          </span>
        </div>

        ${
          group.image_url
            ? `
              <img
                class="admin-product-image"
                src="${group.image_url}"
                alt="${group.title}"
              >
            `
            : ""
        }

        <p>
          <strong>포함 품번:</strong>
          ${(group.item_numbers || []).join(", ") || "-"}
        </p>

        <p>
          <strong>단가:</strong>
          ${Number(group.price).toLocaleString()}원
        </p>

        <p>
          <strong>사진 경로:</strong>
          ${group.image_url || "-"}
        </p>

        <p>
          <strong>표시 순서:</strong>
          ${group.sort_order}
        </p>

        <button
          class="cart-btn"
          type="button"
          onclick="editGroup(${group.id})"
        >
          상품 묶음 수정
        </button>

        <button
          class="cart-btn gray-btn"
          type="button"
          onclick="toggleGroupActive(
            ${group.id},
            ${group.is_active}
          )"
        >
          ${group.is_active ? "상품 묶음 숨기기" : "다시 표시"}
        </button>
      </div>
    `;
  }).join("");
}

/* 카테고리 저장 */
async function saveCategory() {
  const id =
    document.getElementById("categoryId").value;

  const name =
    document.getElementById("categoryName").value.trim();

  const price =
    Number(document.getElementById("categoryPrice").value);

  const tags = parseCommaList(
    document.getElementById("categoryTags").value
  );

  const coverUrl =
    document.getElementById("categoryCover").value.trim();

  const infoUrl =
    document.getElementById("categoryInfo").value.trim();

  const sortOrder =
    Number(document.getElementById("categorySort").value) || 0;

  const isActive =
    document.getElementById("categoryActive").checked;

  if (!name) {
    alert("카테고리명을 입력해주세요.");
    return;
  }

  if (!Number.isFinite(price) || price < 0) {
    alert("올바른 가격을 입력해주세요.");
    return;
  }

  const values = {
    name,
    price,
    tags,
    cover_url: coverUrl,
    info_url: infoUrl,
    sort_order: sortOrder,
    is_active: isActive
  };

  let response;

  if (id) {
    response = await supabaseClient
      .from("product_categories")
      .update(values)
      .eq("id", Number(id));
  } else {
    response = await supabaseClient
      .from("product_categories")
      .insert(values);
  }

  if (response.error) {
    showMessage(
      "categoryMessage",
      "카테고리 저장 실패: " + response.error.message,
      true
    );
    return;
  }

  showMessage(
    "categoryMessage",
    id
      ? "카테고리가 수정되었습니다."
      : "카테고리가 등록되었습니다."
  );

  resetCategoryForm();
  await loadProductData();
}

/* 카테고리 수정 폼에 불러오기 */
function editCategory(id) {
  const category = allCategories.find(
    item => item.id === id
  );

  if (!category) return;

  document.getElementById("categoryId").value =
    category.id;

  document.getElementById("categoryName").value =
    category.name;

  document.getElementById("categoryPrice").value =
    category.price;

  document.getElementById("categoryTags").value =
    (category.tags || []).join(", ");

  document.getElementById("categoryCover").value =
    category.cover_url || "";

  document.getElementById("categoryInfo").value =
    category.info_url || "";

  document.getElementById("categorySort").value =
    category.sort_order;

  document.getElementById("categoryActive").checked =
    category.is_active;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* 카테고리 입력 초기화 */
function resetCategoryForm() {
  document.getElementById("categoryId").value = "";
  document.getElementById("categoryName").value = "";
  document.getElementById("categoryPrice").value = "";
  document.getElementById("categoryTags").value = "";
  document.getElementById("categoryCover").value = "";
  document.getElementById("categoryInfo").value = "";
  document.getElementById("categorySort").value = "0";
  document.getElementById("categoryActive").checked = true;

  coverFile.value = "";
infoFile.value = "";
}

/* 카테고리 표시·숨김 */
async function toggleCategoryActive(id, currentValue) {
  const { error } = await supabaseClient
    .from("product_categories")
    .update({
      is_active: !currentValue
    })
    .eq("id", id);

  if (error) {
    alert("카테고리 상태 변경 실패: " + error.message);
    return;
  }

  await loadProductData();
}

/* 상품 묶음 저장 */
async function saveGroup() {
  const id =
    document.getElementById("groupId").value;

  const categoryId =
    Number(document.getElementById("groupCategory").value);

  const title =
    document.getElementById("groupTitle").value.trim();

  const imageUrl =
    document.getElementById("groupImage").value.trim();

  const itemNumbers = parseCommaList(
    document.getElementById("groupNumbers").value
  );

  const price =
    Number(document.getElementById("groupPrice").value);

  const sortOrder =
    Number(document.getElementById("groupSort").value) || 0;

  const isActive =
    document.getElementById("groupActive").checked;

  if (!categoryId) {
    alert("소속 카테고리를 선택해주세요.");
    return;
  }

  if (!title) {
    alert("사진 묶음 이름을 입력해주세요.");
    return;
  }

  if (itemNumbers.length === 0) {
    alert("품번을 한 개 이상 입력해주세요.");
    return;
  }

  if (!Number.isFinite(price) || price < 0) {
    alert("올바른 단가를 입력해주세요.");
    return;
  }

  const values = {
    category_id: categoryId,
    title,
    image_url: imageUrl,
    item_numbers: itemNumbers,
    price,
    sort_order: sortOrder,
    is_active: isActive
  };

  let response;

  if (id) {
    response = await supabaseClient
      .from("product_groups")
      .update(values)
      .eq("id", Number(id));
  } else {
    response = await supabaseClient
      .from("product_groups")
      .insert(values);
  }

  if (response.error) {
    showMessage(
      "groupMessage",
      "상품 묶음 저장 실패: " + response.error.message,
      true
    );
    return;
  }

  showMessage(
    "groupMessage",
    id
      ? "상품 묶음이 수정되었습니다."
      : "상품 묶음이 등록되었습니다."
  );

  resetGroupForm();
  await loadProductData();
}

/* 상품 묶음 수정 폼에 불러오기 */
function editGroup(id) {
  const group = allGroups.find(
    item => item.id === id
  );

  if (!group) return;

  document.getElementById("groupId").value =
    group.id;

  document.getElementById("groupCategory").value =
    group.category_id;

  document.getElementById("groupTitle").value =
    group.title;

  document.getElementById("groupImage").value =
    group.image_url || "";

  document.getElementById("groupNumbers").value =
    (group.item_numbers || []).join(", ");

  document.getElementById("groupPrice").value =
    group.price;

  document.getElementById("groupSort").value =
    group.sort_order;

  document.getElementById("groupActive").checked =
    group.is_active;

  document
    .getElementById("groupCategory")
    .scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
}

/* 상품 묶음 입력 초기화 */
function resetGroupForm() {
  document.getElementById("groupId").value = "";
  document.getElementById("groupCategory").value = "";
  document.getElementById("groupTitle").value = "";
  document.getElementById("groupImage").value = "";
  document.getElementById("groupNumbers").value = "";
  document.getElementById("groupPrice").value = "";
  document.getElementById("groupSort").value = "0";
  document.getElementById("groupActive").checked = true;

  groupFile.value = "";
  startItem.value = "";
endItem.value = "";
}

/* 상품 묶음 표시·숨김 */
async function toggleGroupActive(id, currentValue) {
  const { error } = await supabaseClient
    .from("product_groups")
    .update({
      is_active: !currentValue
    })
    .eq("id", id);

  if (error) {
    alert("상품 묶음 상태 변경 실패: " + error.message);
    return;
  }

  await loadProductData();
}

/* 상품관리 페이지 시작 */
async function startProductsPage() {
  const allowed = await checkAdminAccess();

  if (!allowed) return;

  await loadProductData();
}

startProductsPage();

async function uploadImage(file, folder) {
  if (!file) return "";

  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 선택할 수 있습니다.");
  }

  const extension =
    file.name.split(".").pop()?.toLowerCase() || "jpg";

  const safeFileName =
    `${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const filePath = `${folder}/${safeFileName}`;

  const { error: uploadError } =
    await supabaseClient.storage
      .from("product-images")
      .upload(filePath, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false
      });

  if (uploadError) {
    throw uploadError;
  }

  const { data } =
    supabaseClient.storage
      .from("product-images")
      .getPublicUrl(filePath);

  return data.publicUrl;
}

generateItemsBtn.addEventListener("click", () => {
  const start = Number(startItem.value);
  const end = Number(endItem.value);

  if (!start || !end || end < start) {
    alert("시작 품번과 끝 품번을 확인해주세요.");
    return;
  }

  const result = [];

  for (let i = start; i <= end; i++) {
    result.push(i);
  }

  document.getElementById("groupNumbers").value =
    result.join(", ");
});