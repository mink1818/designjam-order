const supabaseUrl =
  "https://dtjhuejmxrjkcxzvilgw.supabase.co";

  const coverFile =
document.getElementById("categoryCoverFile");

const groupFile =
document.getElementById("groupImageFile");

const groupFiles =
document.getElementById("groupImagesFile");

const mainCategoryName =
document.getElementById("mainCategoryName");

const mainCategoryCover =
document.getElementById("mainCategoryCover");

const mainCategoryCoverFile =
document.getElementById("mainCategoryCoverFile");

const mainCategorySort =
document.getElementById("mainCategorySort");

const mainCategoryActive =
document.getElementById("mainCategoryActive");

const saveMainCategoryButton =
document.getElementById("saveMainCategoryButton");

const mainCategoryList =
document.getElementById("mainCategoryList");

const categoryMain =
document.getElementById("categoryMain");

const groupNumbersInput =
  document.getElementById("groupNumbers");

groupNumbersInput.addEventListener("input", () => {
  const itemNumbers =
    parseCommaList(groupNumbersInput.value);

  renderSoldoutItems(itemNumbers, []);
});

const startItem =
document.getElementById("startItem");

const endItem =
document.getElementById("endItem");

const generateItemsBtn =
document.getElementById("generateItemsBtn");

const itemPattern =
  document.getElementById("itemPattern");

const generatePatternItemsBtn =
  document.getElementById("generatePatternItemsBtn");

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

mainCategoryCoverFile.addEventListener(
  "change",
  async () => {
    const file =
      mainCategoryCoverFile.files[0];

    if (!file) return;

    mainCategoryCoverFile.disabled = true;

    try {
      showMessage(
        "mainCategoryMessage",
        "대분류 대표사진을 업로드하는 중입니다."
      );

      const publicUrl =
        await uploadImage(
          file,
          "main-category-cover"
        );

      mainCategoryCover.value =
        publicUrl;

      showMessage(
        "mainCategoryMessage",
        "대분류 대표사진 업로드가 완료되었습니다."
      );
    } catch (error) {
      showMessage(
        "mainCategoryMessage",
        "대표사진 업로드 실패: " +
          error.message,
        true
      );
    } finally {
      mainCategoryCoverFile.disabled = false;
    }
  }
);

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

groupFiles.addEventListener("change", async () => {
  const files = [...groupFiles.files];

  if (files.length === 0) return;

  groupFiles.disabled = true;

  try {
    showMessage(
      "groupMessage",
      `추가사진 ${files.length}장을 업로드하는 중입니다.`
    );

    const urls = await uploadImages(
      files,
      "product-groups/additional"
    );

    uploadedGroupImageUrls = [
  ...uploadedGroupImageUrls,
  ...urls
];

    showMessage(
      "groupMessage",
      `추가사진 ${urls.length}장 업로드가 완료되었습니다.`
    );
  } catch (error) {
    showMessage(
      "groupMessage",
      "추가사진 업로드 실패: " + error.message,
      true
    );
  } finally {
    groupFiles.disabled = false;
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
let allMainCategories = [];
let uploadedGroupImageUrls = [];

document
  .getElementById("saveCategoryButton")
  .addEventListener("click", saveCategory);

document
  .getElementById("saveGroupButton")
  .addEventListener("click", saveGroup);

  saveMainCategoryButton.addEventListener(
  "click",
  saveMainCategory
);

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

/* HTML 출력 안전 처리 */
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* HTML 속성 출력 안전 처리 */
function escapeAttribute(value) {
  return escapeHtml(value);
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
  <strong>대분류:</strong>
  ${
    escapeHtml(
      allMainCategories.find(
        item => item.id === category.main_category_id
      )?.name || "대분류 미지정"
    )
  }
</p>

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
  <strong>짧은 설명:</strong>
  ${escapeHtml(category.description_text || "-")}
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
        카테고리 수정·대분류 이동
      </button>

      <button
  class="cart-btn clone-btn"
  type="button"
  onclick="cloneCategory(${category.id})"
>
  카테고리 복제
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

      <button
  class="cart-btn delete-btn"
  type="button"
  onclick="deleteCategory(
    ${category.id},
    '${escapeAttribute(category.name)}'
  )"
>
  카테고리 완전 삭제
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
  <strong>설명:</strong><br>
  ${escapeHtml(
    group.description_text || "-"
  )}
</p>

<p>
  <strong>포함 브랜드:</strong><br>
  ${escapeHtml(
    group.brand_text || "-"
  )}
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
  onclick="window.editGroup(${group.id})"
>
  상품 묶음 수정·이동
</button>

        <button
  class="cart-btn clone-btn"
  type="button"
  onclick="cloneGroup(${group.id})"
>
  상품 묶음 복제
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

        <button
  class="cart-btn delete-btn"
  type="button"
  onclick="deleteGroup(${group.id}, '${escapeAttribute(group.title)}')"
>
  상품 묶음 완전 삭제
</button>
      </div>
    `;
  }).join("");
}
/* 대분류 저장·수정 */
async function saveMainCategory() {
  const id =
    document.getElementById("mainCategoryId").value;

  const name =
    mainCategoryName.value.trim();

  const coverUrl =
    mainCategoryCover.value.trim();

  const sortOrder =
    Number(mainCategorySort.value) || 0;

  const isActive =
    mainCategoryActive.checked;

  if (!name) {
    alert("대분류명을 입력해주세요.");
    mainCategoryName.focus();
    return;
  }

  saveMainCategoryButton.disabled = true;
  saveMainCategoryButton.textContent = "저장 중...";

  const values = {
    name: name,
    cover_url: coverUrl,
    sort_order: sortOrder,
    is_active: isActive
  };

  let error;

  if (id) {
    const result =
      await supabaseClient
        .from("product_main_categories")
        .update(values)
        .eq("id", id);

    error = result.error;
  } else {
    const result =
      await supabaseClient
        .from("product_main_categories")
        .insert(values);

    error = result.error;
  }

  saveMainCategoryButton.disabled = false;
  saveMainCategoryButton.textContent = "대분류 저장";

  if (error) {
    showMessage(
      "mainCategoryMessage",
      "대분류 저장 실패: " + error.message,
      true
    );
    return;
  }

  showMessage(
    "mainCategoryMessage",
    id
      ? "대분류가 수정되었습니다."
      : "대분류가 등록되었습니다."
  );

  resetMainCategoryForm();
  await loadMainCategories();
}

/* 대분류 입력 초기화 */
function resetMainCategoryForm() {
  document.getElementById("mainCategoryId").value = "";

  mainCategoryName.value = "";
  mainCategoryCover.value = "";
  mainCategorySort.value = "0";
  mainCategoryActive.checked = true;
  mainCategoryCoverFile.value = "";
}

/* 대분류 수정값 불러오기 */
function editMainCategory(id) {
  const mainCategory =
    allMainCategories.find(
      item => item.id === id
    );

  if (!mainCategory) return;

  document
    .getElementById("mainCategoryId")
    .value = mainCategory.id;

  mainCategoryName.value =
    mainCategory.name || "";

  mainCategoryCover.value =
    mainCategory.cover_url || "";

  mainCategorySort.value =
    mainCategory.sort_order ?? 0;

  mainCategoryActive.checked =
    Boolean(mainCategory.is_active);

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* 연결된 카테고리가 없을 때만 대분류 삭제 */
async function deleteMainCategory(id, name) {
  const linkedCategories = allCategories.filter(
    category => category.main_category_id === id
  );

  if (linkedCategories.length > 0) {
    alert(
      `"${name}" 대분류에는 카테고리가 ${linkedCategories.length}개 연결되어 있습니다.\n\n` +
      "먼저 연결된 카테고리를 다른 대분류로 이동하거나 삭제해주세요."
    );
    return;
  }

  const confirmed = confirm(
    `"${name}" 대분류를 완전히 삭제할까요?\n\n` +
    "삭제한 대분류는 복구할 수 없습니다."
  );

  if (!confirmed) return;

  const secondConfirmed = confirm(
    "정말 완전히 삭제하시겠습니까?"
  );

  if (!secondConfirmed) return;

  const { error } = await supabaseClient
    .from("product_main_categories")
    .delete()
    .eq("id", id);

  if (error) {
    alert(
      "대분류 삭제 실패: " +
      error.message
    );
    return;
  }

  alert("대분류가 삭제되었습니다.");

  resetMainCategoryForm();
  await loadMainCategories();
}

window.deleteMainCategory =
  deleteMainCategory;

window.editMainCategory =
  editMainCategory;

window.resetMainCategoryForm =
  resetMainCategoryForm;

  /* 대분류 목록 불러오기 */
async function loadMainCategories() {
  const { data, error } =
    await supabaseClient
      .from("product_main_categories")
      .select("*")
      .order("sort_order", {
        ascending: true
      })
      .order("id", {
        ascending: true
      });

  if (error) {
    mainCategoryList.innerHTML = `
      <div class="product-card">
        <h2>대분류 불러오기 실패</h2>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
    return;
  }

  allMainCategories = data || [];

  renderMainCategories();
  renderMainCategorySelect();
}

/* 등록된 대분류 화면 표시 */
function renderMainCategories() {
  if (allMainCategories.length === 0) {
    mainCategoryList.innerHTML = `
      <div class="product-card">
        <h2>등록된 대분류가 없습니다</h2>
      </div>
    `;
    return;
  }

  mainCategoryList.innerHTML =
    allMainCategories
      .map(mainCategory => `
        <div class="product-card">

          <div class="order-top">
            <h2>
              ${escapeHtml(mainCategory.name)}
            </h2>

            <span class="status-badge ${
              mainCategory.is_active
                ? "done"
                : "blocked"
            }">
              ${
                mainCategory.is_active
                  ? "표시 중"
                  : "숨김"
              }
            </span>
          </div>

          ${
            mainCategory.cover_url
              ? `
                <img
                  class="admin-product-image"
                  src="${escapeAttribute(
                    mainCategory.cover_url
                  )}"
                  alt="${escapeAttribute(
                    mainCategory.name
                  )}"
                >
              `
              : ""
          }

          <p>
            <strong>표시 순서:</strong>
            ${mainCategory.sort_order ?? 0}
          </p>

          <button
            class="cart-btn"
            type="button"
            onclick="editMainCategory(${mainCategory.id})"
          >
            대분류 수정
          </button>

          <button
  class="cart-btn delete-btn"
  type="button"
  onclick="deleteMainCategory(
    ${mainCategory.id},
    '${escapeAttribute(mainCategory.name)}'
  )"
>
  대분류 완전 삭제
</button>

        </div>
      `)
      .join("");
}

/* 기존 카테고리의 소속 대분류 선택칸 */
function renderMainCategorySelect() {
  categoryMain.innerHTML = `
    <option value="">
      대분류를 선택하세요
    </option>

    ${allMainCategories
      .filter(item => item.is_active)
      .map(item => `
        <option value="${item.id}">
          ${escapeHtml(item.name)}
        </option>
      `)
      .join("")}
  `;
}

/* 카테고리 저장 */
async function saveCategory() {
  const id =
    document.getElementById("categoryId").value;

    const mainCategoryId =
  Number(
    document.getElementById("categoryMain").value
  );

const descriptionText =
  document
    .getElementById("categoryDescription")
    .value
    .trim();

  const name =
    document.getElementById("categoryName").value.trim();

  const price =
    Number(document.getElementById("categoryPrice").value);

  const tags = parseCommaList(
    document.getElementById("categoryTags").value
  );

  const coverUrl =
    document.getElementById("categoryCover").value.trim();

  const sortOrder =
    Number(document.getElementById("categorySort").value) || 0;

  const isActive =
    document.getElementById("categoryActive").checked;

    if (!mainCategoryId) {
  alert("소속 대분류를 선택해주세요.");
  document.getElementById("categoryMain").focus();
  return;
}

  if (!name) {
    alert("카테고리명을 입력해주세요.");
    return;
  }

  if (!Number.isFinite(price) || price < 0) {
    alert("올바른 가격을 입력해주세요.");
    return;
  }

  const values = {
  main_category_id: mainCategoryId,
  description_text: descriptionText,
  name,
  price,
  tags,
  cover_url: coverUrl,
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

    document.getElementById("categoryMain").value =
  category.main_category_id || "";

document.getElementById("categoryDescription").value =
  category.description_text || "";

  document.getElementById("categoryName").value =
    category.name;

  document.getElementById("categoryPrice").value =
    category.price;

  document.getElementById("categoryTags").value =
    (category.tags || []).join(", ");

  document.getElementById("categoryCover").value =
    category.cover_url || "";

    document.getElementById("categoryMain").value =
    category.main_category_id || "";

  document.getElementById("categorySort").value =
    category.sort_order;

  document.getElementById("categoryActive").checked =
    category.is_active;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* 기존 카테고리 정보를 새 카테고리 폼으로 복제 */
function cloneCategory(id) {
  const category = allCategories.find(
    item => item.id === id
  );

  if (!category) {
    alert("복제할 카테고리를 찾지 못했습니다.");
    return;
  }

  /* ID를 비워 새 카테고리로 저장되게 함 */
  document.getElementById("categoryId").value = "";

  document.getElementById("categoryMain").value =
    category.main_category_id || "";

  document.getElementById("categoryName").value =
    `${category.name} 복사본`;

  document.getElementById("categoryPrice").value =
    category.price ?? "";

  document.getElementById("categoryDescription").value =
    category.description_text || "";

  document.getElementById("categoryTags").value =
    (category.tags || []).join(", ");

  document.getElementById("categoryCover").value =
    category.cover_url || "";

  document.getElementById("categorySort").value =
    Number(category.sort_order || 0) + 1;

  document.getElementById("categoryActive").checked =
    Boolean(category.is_active);

  showMessage(
    "categoryMessage",
    "카테고리 정보가 복사되었습니다. 이름과 소속 대분류를 확인한 뒤 저장하세요."
  );

  document
    .getElementById("categoryMain")
    .scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  document.getElementById("categoryName").focus();
  document.getElementById("categoryName").select();
}

window.cloneCategory = cloneCategory;

/* 카테고리 입력 초기화 */
function resetCategoryForm() {
  document.getElementById("categoryId").value = "";
  document.getElementById("categoryMain").value = "";
document.getElementById("categoryDescription").value = "";
  document.getElementById("categoryName").value = "";
  document.getElementById("categoryPrice").value = "";
  document.getElementById("categoryTags").value = "";
  document.getElementById("categoryCover").value = "";
  document.getElementById("categorySort").value = "0";
  document.getElementById("categoryActive").checked = true;

  coverFile.value = "";
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

/* 연결된 상품 묶음이 없을 때만 카테고리 삭제 */
async function deleteCategory(id, name) {
  const linkedGroups = allGroups.filter(
    group => group.category_id === id
  );

  if (linkedGroups.length > 0) {
    alert(
      `"${name}" 카테고리에는 상품 묶음이 ${linkedGroups.length}개 있습니다.\n\n` +
      "먼저 해당 상품 묶음을 다른 카테고리로 이동하거나 삭제해주세요."
    );
    return;
  }

  const confirmed = confirm(
    `"${name}" 카테고리를 완전히 삭제할까요?\n\n` +
    "삭제한 카테고리는 복구할 수 없습니다."
  );

  if (!confirmed) return;

  const secondConfirmed = confirm(
    "정말 삭제하시겠습니까?"
  );

  if (!secondConfirmed) return;

  const { error } = await supabaseClient
    .from("product_categories")
    .delete()
    .eq("id", id);

  if (error) {
    alert(
      "카테고리 삭제 실패: " +
      error.message
    );
    return;
  }

  alert("카테고리가 삭제되었습니다.");

  await loadProductData();
}

window.deleteCategory = deleteCategory;

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

  const soldoutItems = [
  ...document.querySelectorAll(
    ".soldout-item-checkbox:checked"
  )
].map(checkbox => checkbox.value);

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

  description_text:
    document
      .getElementById("groupDescription")
      .value
      .trim(),

  brand_text:
    document
      .getElementById("groupBrand")
      .value
      .trim(),

  image_url: imageUrl,
  image_urls: uploadedGroupImageUrls,
  item_numbers: itemNumbers,
  soldout_items: soldoutItems,
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

  if (!group) {
    alert("상품 묶음 정보를 찾지 못했습니다.");
    return;
  }

  const itemNumbers = group.item_numbers || [];
  const soldoutItems = group.soldout_items || [];

  document.getElementById("groupId").value =
    group.id;

  document.getElementById("groupCategory").value =
    group.category_id;

  document.getElementById("groupTitle").value =
    group.title || "";

  document.getElementById("groupImage").value =
    group.image_url || "";

    document.getElementById("groupDescription").value =
  group.description_text || "";

document.getElementById("groupBrand").value =
  group.brand_text || "";

    uploadedGroupImageUrls =
  Array.isArray(group.image_urls)
    ? [...group.image_urls]
    : [];

    showMessage(
  "groupMessage",
  uploadedGroupImageUrls.length > 0
    ? `기존 추가사진 ${uploadedGroupImageUrls.length}장이 등록되어 있습니다.`
    : "등록된 추가사진이 없습니다."
);

  document.getElementById("groupNumbers").value =
    itemNumbers.join(", ");

  document.getElementById("groupPrice").value =
    group.price ?? "";

  document.getElementById("groupSort").value =
    group.sort_order ?? 0;

  document.getElementById("groupActive").checked =
    Boolean(group.is_active);

  /* 시작·끝 품번 자동 표시 */
  if (itemNumbers.length > 0) {
    startItem.value = itemNumbers[0];
    endItem.value = itemNumbers[itemNumbers.length - 1];
  } else {
    startItem.value = "";
    endItem.value = "";
  }

  /* 품절 체크박스 표시 및 기존 품절상태 복원 */
  const soldoutItemsBox =
  document.getElementById("soldoutItemsBox");

soldoutItemsBox.innerHTML = itemNumbers
  .map(number => {
    const numberText = String(number);

    const checked = soldoutItems
      .map(String)
      .includes(numberText);

    return `
      <label class="soldout-item-option">
        <input
          type="checkbox"
          class="soldout-item-checkbox"
          value="${numberText}"
          ${checked ? "checked" : ""}
        >

        <strong>${numberText}</strong>
        <span>품절</span>
      </label>
    `;
  })
  .join("");

  document
    .getElementById("groupCategory")
    .scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
}

window.editGroup = editGroup;

/* 기존 상품 묶음을 새 상품 묶음으로 복제 */
function cloneGroup(id) {
  const group = allGroups.find(
    item => item.id === id
  );

  if (!group) {
    alert("복제할 상품 묶음을 찾지 못했습니다.");
    return;
  }

  const itemNumbers =
    Array.isArray(group.item_numbers)
      ? group.item_numbers.map(String)
      : [];

  const soldoutItems =
    Array.isArray(group.soldout_items)
      ? group.soldout_items.map(String)
      : [];

  /* ID를 비워서 신규 등록 상태로 만듦 */
  document.getElementById("groupId").value = "";

  document.getElementById("groupCategory").value =
    group.category_id || "";

  document.getElementById("groupTitle").value =
    `${group.title || ""} 복사본`;

  document.getElementById("groupImage").value =
    group.image_url || "";

  document.getElementById("groupNumbers").value =
    itemNumbers.join(", ");

  document.getElementById("groupPrice").value =
    group.price ?? "";

  document.getElementById("groupSort").value =
    Number(group.sort_order || 0) + 1;

  document.getElementById("groupActive").checked =
    Boolean(group.is_active);

  /* 추가사진 주소도 복사 */
  uploadedGroupImageUrls =
    Array.isArray(group.image_urls)
      ? [...group.image_urls]
      : [];

  /* 시작·끝 품번 표시 */
  if (itemNumbers.length > 0) {
    startItem.value = itemNumbers[0];
    endItem.value =
      itemNumbers[itemNumbers.length - 1];
  } else {
    startItem.value = "";
    endItem.value = "";
  }

  /* 혼합 품번 입력칸에도 기존 품번 표시 */
  if (typeof itemPattern !== "undefined") {
    itemPattern.value =
      itemNumbers.join(", ");
  }

  /* 기존 품절 체크 상태 복사 */
  renderSoldoutItems(
  itemNumbers,
  []
);

  showMessage(
    "groupMessage",
    "상품 묶음이 복제되었습니다. 이름·사진·품번을 변경한 뒤 저장하세요."
  );

  document
    .getElementById("groupCategory")
    .scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  document.getElementById("groupTitle").focus();
  document.getElementById("groupTitle").select();
}

window.cloneGroup = cloneGroup;

/* 상품 묶음 입력 초기화 */
function resetGroupForm() {
  document.getElementById("groupId").value = "";
  document.getElementById("groupCategory").value = "";
  document.getElementById("groupTitle").value = "";
  document.getElementById("groupImage").value = "";
document.getElementById("groupDescription").value = "";

document.getElementById("groupBrand").value = "";
  document.getElementById("groupNumbers").value = "";
  document.getElementById("groupPrice").value = "";
  document.getElementById("groupSort").value = "0";
  document.getElementById("groupActive").checked = true;

  groupFile.value = "";
groupFiles.value = "";          // 추가

startItem.value = "";
endItem.value = "";
itemPattern.value = "";

uploadedGroupImageUrls = [];    // 추가

renderSoldoutItems([], []);
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

/* 상품 묶음 완전 삭제 */
async function deleteGroup(id, title) {
  const confirmed = confirm(
    `"${title}" 상품 묶음을 완전히 삭제할까요?\n\n` +
    "삭제된 상품 묶음은 복구할 수 없습니다."
  );

  if (!confirmed) return;

  const secondConfirmed = confirm(
    "정말 삭제하시겠습니까?"
  );

  if (!secondConfirmed) return;

  const { error } = await supabaseClient
    .from("product_groups")
    .delete()
    .eq("id", id);

  if (error) {
    alert(
      "상품 묶음 삭제 실패: " +
      error.message
    );
    return;
  }

  alert("상품 묶음이 삭제되었습니다.");

  await loadProductData();
}

window.deleteGroup = deleteGroup;

/* 상품관리 페이지 시작 */
async function startProductsPage() {
  const allowed = await checkAdminAccess();

  if (!allowed) return;

  await loadMainCategories();

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

async function uploadImages(files, folder) {
  const uploadedUrls = [];

  for (const file of files) {
    const publicUrl = await uploadImage(file, folder);

    if (publicUrl) {
      uploadedUrls.push(publicUrl);
    }
  }

  return uploadedUrls;
}

generateItemsBtn.addEventListener("click", () => {
  const start = Number(startItem.value);
  const end = Number(endItem.value);

  if (!start || !end || end < start) {
    alert("시작 품번과 끝 품번을 확인해주세요.");
    return;
  }

  if (end - start > 1000) {
    alert("한 번에 생성할 수 있는 품번은 최대 1,000개입니다.");
    return;
  }

  const result = [];

  for (let i = start; i <= end; i++) {
    result.push(String(i));
  }

  document.getElementById("groupNumbers").value =
    result.join(", ");

    renderSoldoutItems(result, []);

  document.getElementById("groupTitle").value =
    start === end
      ? String(start)
      : `${start}~${end}`;
});

function parseItemPattern(value) {
  const parts = String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

  const result = [];

  for (const part of parts) {
    const normalized = part.replace(/-/g, "~");

    if (normalized.includes("~")) {
      const rangeParts = normalized
        .split("~")
        .map(item => item.trim());

      if (rangeParts.length !== 2) {
        throw new Error(
          `"${part}" 입력 형식을 확인해주세요.`
        );
      }

      const start = Number(rangeParts[0]);
      const end = Number(rangeParts[1]);

      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        end < start
      ) {
        throw new Error(
          `"${part}" 품번 범위를 확인해주세요.`
        );
      }

      if (end - start > 1000) {
        throw new Error(
          `"${part}" 범위가 너무 큽니다.`
        );
      }

      for (
        let number = start;
        number <= end;
        number++
      ) {
        result.push(String(number));
      }
    } else {
      const number = Number(normalized);

      if (!Number.isInteger(number)) {
        throw new Error(
          `"${part}" 품번을 확인해주세요.`
        );
      }

      result.push(String(number));
    }
  }

  return [...new Set(result)];
}

generatePatternItemsBtn.addEventListener(
  "click",
  () => {
    try {
      const result =
        parseItemPattern(itemPattern.value);

      if (result.length === 0) {
        alert("품번을 입력해주세요.");
        return;
      }

      document.getElementById("groupNumbers").value =
        result.join(", ");

      renderSoldoutItems(result, []);

      document.getElementById("groupTitle").value =
        itemPattern.value.trim();
    } catch (error) {
      alert(error.message);
    }
  }
);

function renderSoldoutItems(
  itemNumbers = [],
  soldoutItems = []
) {
  const soldoutItemsBox =
    document.getElementById("soldoutItemsBox");

  if (!soldoutItemsBox) return;

  if (itemNumbers.length === 0) {
    soldoutItemsBox.innerHTML = `
      <p>
        포함 품번을 입력하거나 자동 생성하면
        품절 선택란이 표시됩니다.
      </p>
    `;
    return;
  }

  soldoutItemsBox.innerHTML = itemNumbers
    .map(number => `
      <label class="soldout-item-option">
        <input
          type="checkbox"
          class="soldout-item-checkbox"
          value="${escapeAttribute(number)}"
          ${soldoutItems.includes(String(number)) ? "checked" : ""}
        >

        <strong>${escapeHtml(number)}</strong>
        <span>품절</span>
      </label>
    `)
    .join("");
}

async function uploadExcelProducts() {
  const excelFileInput =
    document.getElementById("excelFile");

  const excelMessage =
    document.getElementById("excelMessage");

  const file = excelFileInput.files[0];

  if (!file) {
    alert("엑셀 파일을 선택해주세요.");
    return;
  }

  if (typeof XLSX === "undefined") {
    alert(
      "엑셀 라이브러리를 불러오지 못했습니다.\n" +
      "products.html의 스크립트 순서를 확인해주세요."
    );
    return;
  }

  excelMessage.innerHTML =
    "<p>엑셀 내용을 읽는 중입니다...</p>";

  try {
    const arrayBuffer =
      await file.arrayBuffer();

    const workbook =
      XLSX.read(arrayBuffer, {
        type: "array"
      });

    const firstSheetName =
      workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error(
        "엑셀 파일에 시트가 없습니다."
      );
    }

    const worksheet =
      workbook.Sheets[firstSheetName];

    const rows =
      XLSX.utils.sheet_to_json(
        worksheet,
        {
          defval: "",
          raw: false
        }
      );

    if (rows.length === 0) {
      throw new Error(
        "엑셀에 등록할 내용이 없습니다."
      );
    }

    const requiredHeaders = [
  "대분류",
  "카테고리",
  "묶음명",
  "품번",
  "단가"
];

    const firstRowKeys =
      Object.keys(rows[0]);

    const missingHeaders =
      requiredHeaders.filter(
        header =>
          !firstRowKeys.includes(header)
      );

    if (missingHeaders.length > 0) {
      throw new Error(
        "필수 제목이 없습니다: " +
        missingHeaders.join(", ")
      );
    }

    const previewRows =
      rows.slice(0, 20);

    excelMessage.innerHTML = `
      <div class="product-success">
        <h3>
          엑셀 읽기 성공: 총 ${rows.length}개 상품 묶음
        </h3>

        <p>
          아래는 처음 ${previewRows.length}개 미리보기입니다.
        </p>
      </div>

      <div class="excel-preview-wrap">
        <table class="excel-preview-table">
          <thead>
            <tr>
              <th>번호</th>
              <th>대분류</th>
              <th>카테고리</th>
              <th>묶음명</th>
              <th>품번</th>
              <th>단가</th>
            </tr>
          </thead>

          <tbody>
            ${previewRows
              .map((row, index) => `
                <tr>
                  <td>${index + 1}</td>

                  <td>
                    ${escapeHtml(row["대분류"])}
                  </td>

                  <td>
                    ${escapeHtml(row["카테고리"])}
                  </td>

                  <td>
                    ${escapeHtml(row["묶음명"])}
                  </td>

                  <td>
                    ${escapeHtml(row["품번"])}
                  </td>

                  <td>
                    ${Number(
                      String(row["단가"])
                        .replace(/[^0-9.-]/g, "")
                    ).toLocaleString()}원
                  </td>
                </tr>
              `)
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    /*
      다음 단계에서 Supabase 저장에 사용할 수 있도록
      읽은 데이터를 임시 보관합니다.
    */
    window.pendingExcelRows = rows;

    const registerButton =
  document.getElementById("registerExcelButton");

registerButton.style.display = "block";

  } catch (error) {
    console.error(error);

    excelMessage.innerHTML = `
      <p class="auth-error">
        엑셀 읽기 실패:
        ${escapeHtml(error.message)}
      </p>
    `;
  }
}

window.uploadExcelProducts =
  uploadExcelProducts;

function parseItemPattern(value) {
  const parts = String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

  const result = [];

  for (const part of parts) {
    const normalized = part.replace(/-/g, "~");

    if (normalized.includes("~")) {
      const [startText, endText] =
        normalized.split("~").map(item => item.trim());

      const start = Number(startText);
      const end = Number(endText);

      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        end < start
      ) {
        throw new Error(
          `"${part}" 품번 범위를 확인해주세요.`
        );
      }

      if (end - start > 1000) {
        throw new Error(
          `"${part}" 범위가 너무 큽니다.`
        );
      }

      for (let number = start; number <= end; number++) {
        result.push(String(number));
      }
    } else {
      const number = Number(normalized);

      if (!Number.isInteger(number)) {
        throw new Error(
          `"${part}" 품번을 확인해주세요.`
        );
      }

      result.push(String(number));
    }
  }

  return [...new Set(result)];
}

generatePatternItemsBtn.addEventListener(
  "click",
  () => {
    try {
      const result =
        parseItemPattern(itemPattern.value);

      if (result.length === 0) {
        alert("품번을 입력해주세요.");
        return;
      }

      document.getElementById("groupNumbers").value =
        result.join(", ");

      renderSoldoutItems(result, []);

      document.getElementById("groupTitle").value =
        itemPattern.value.trim();
    } catch (error) {
      alert(error.message);
    }
  }
);

async function registerExcelProducts() {
  const rows =
    Array.isArray(window.pendingExcelRows)
      ? window.pendingExcelRows
      : [];

  const excelMessage =
    document.getElementById("excelMessage");

  const registerButton =
    document.getElementById("registerExcelButton");

  if (rows.length === 0) {
    alert("먼저 엑셀 파일을 읽어주세요.");
    return;
  }

  const confirmed = confirm(
    `총 ${rows.length}개의 상품 묶음을 실제 등록할까요?\n\n` +
    "같은 카테고리와 묶음명이 이미 있으면 해당 행은 건너뜁니다."
  );

  if (!confirmed) return;

  registerButton.disabled = true;
  registerButton.textContent = "상품 등록 중...";

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  const errorMessages = [];

  try {
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];

      try {
        const mainCategoryName =
          String(row["대분류"] || "").trim();

        const categoryName =
          String(row["카테고리"] || "").trim();

        const brandText =
          String(row["포함브랜드"] || "").trim();

        const groupTitle =
          String(row["묶음명"] || "").trim();

        const itemPatternText =
          String(row["품번"] || "").trim();

        const descriptionText =
          String(row["설명"] || "").trim();

        const imageUrl =
          String(row["대표사진URL"] || "").trim();

        const price =
          Number(
            String(row["단가"] || "")
              .replace(/[^0-9.-]/g, "")
          );

        const sortOrder =
          Number(
            String(row["표시순서"] || index + 1)
              .replace(/[^0-9.-]/g, "")
          ) || index + 1;

        if (
          !mainCategoryName ||
          !categoryName ||
          !groupTitle ||
          !itemPatternText
        ) {
          throw new Error(
            "대분류·카테고리·묶음명·품번은 필수입니다."
          );
        }

        if (!Number.isFinite(price) || price < 0) {
          throw new Error("단가가 올바르지 않습니다.");
        }

        const itemNumbers =
          parseItemPattern(itemPatternText);

        if (itemNumbers.length === 0) {
          throw new Error("생성된 품번이 없습니다.");
        }

        /* 1. 대분류 확인 또는 생성 */
        let mainCategory =
          allMainCategories.find(
            item =>
              String(item.name).trim() ===
              mainCategoryName
          );

        if (!mainCategory) {
          const {
            data: newMainCategory,
            error: mainCategoryError
          } = await supabaseClient
            .from("product_main_categories")
            .insert({
              name: mainCategoryName,
              cover_url: "",
              sort_order:
                allMainCategories.length + 1,
              is_active: true
            })
            .select()
            .single();

          if (mainCategoryError) {
            throw mainCategoryError;
          }

          mainCategory = newMainCategory;
          allMainCategories.push(mainCategory);
        }

        /* 2. 카테고리 확인 또는 생성 */
        let category =
          allCategories.find(
            item =>
              item.main_category_id ===
                mainCategory.id &&
              String(item.name).trim() ===
                categoryName
          );

        const brandTags =
          brandText
            .split(",")
            .map(item => item.trim())
            .filter(Boolean);

        if (!category) {
          const {
            data: newCategory,
            error: categoryError
          } = await supabaseClient
            .from("product_categories")
.insert({
  main_category_id:
    mainCategory.id,
  name: categoryName,
  description_text: "",
  price,
  tags: brandTags,
  cover_url: imageUrl,
  sort_order: sortOrder,
  is_active: true
})
            .select()
            .single();

          if (categoryError) {
            throw categoryError;
          }

          category = newCategory;
          allCategories.push(category);
        } else {
          /*
            기존 카테고리는 삭제하지 않고
            빈 설명이나 태그만 보완합니다.
          */
          const updatedTags = [
            ...new Set([
              ...(category.tags || []),
              ...brandTags
            ])
          ];

          const updateValues = {
            tags: updatedTags
          };

          await supabaseClient
            .from("product_categories")
            .update(updateValues)
            .eq("id", category.id);
        }

        /* 3. 같은 묶음이 이미 있는지 확인 */
        const duplicateGroup =
          allGroups.find(
            item =>
              item.category_id === category.id &&
              String(item.title).trim() ===
                groupTitle
          );

        if (duplicateGroup) {
          skipCount++;
          continue;
        }

        /* 4. 상품 묶음 등록 */
        const {
          data: newGroup,
          error: groupError
        } = await supabaseClient
          .from("product_groups")
          .insert({
            category_id: category.id,
            title: groupTitle,
            
            description_text: descriptionText,
brand_text: brandText,

            image_url: imageUrl,
            image_urls: [],
            item_numbers: itemNumbers,
            soldout_items: [],
            price,
            sort_order: sortOrder,
            is_active: true
          })
          .select()
          .single();

        if (groupError) {
          throw groupError;
        }

        allGroups.push(newGroup);
        successCount++;

      } catch (rowError) {
        errorCount++;

        errorMessages.push(
          `${index + 2}행: ${rowError.message}`
        );
      }

      excelMessage.innerHTML = `
        <div class="product-success">
          <h3>엑셀 상품 등록 중...</h3>
          <p>
            ${index + 1} / ${rows.length}행 처리
          </p>
          <p>
            성공 ${successCount}개 /
            건너뜀 ${skipCount}개 /
            실패 ${errorCount}개
          </p>
        </div>
      `;
    }

    await loadMainCategories();
    await loadProductData();

    excelMessage.innerHTML = `
      <div class="product-success">
        <h3>엑셀 상품 등록 완료</h3>

        <p>신규 등록: ${successCount}개</p>
        <p>중복 건너뜀: ${skipCount}개</p>
        <p>실패: ${errorCount}개</p>
      </div>

      ${
        errorMessages.length > 0
          ? `
            <div class="excel-error-list">
              <h3>실패한 행</h3>

              ${errorMessages
                .map(message => `
                  <p>${escapeHtml(message)}</p>
                `)
                .join("")}
            </div>
          `
          : ""
      }
    `;

    if (errorCount === 0) {
      window.pendingExcelRows = [];

      document.getElementById("excelFile").value =
        "";

      registerButton.style.display = "none";
    }

  } finally {
    registerButton.disabled = false;
    registerButton.textContent =
      "미리보기 상품 실제 등록";
  }
}

document
  .getElementById("registerExcelButton")
  .addEventListener(
    "click",
    registerExcelProducts
  );

window.registerExcelProducts =
  registerExcelProducts;