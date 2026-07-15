/* Design Jam Order V2 - Inventory Manager */
(function initializeInventoryManager(window, document) {
  "use strict";

  const STORAGE_KEY = "designjam.inventory.v2";
  const LOW_STOCK_LIMIT = 10;
  const operations = window.DesignJamOperations;
  let productGroups = [];
  let records = loadRecords();

  const elements = {
    list: document.getElementById("inventoryList"),
    search: document.getElementById("inventorySearch"),
    status: document.getElementById("inventoryStatusFilter"),
    reset: document.getElementById("inventoryResetFilters"),
    exportButton: document.getElementById("inventoryExportButton"),
    message: document.getElementById("inventoryMessage")
  };

  if (!elements.list || !operations) return;

  function loadRecords() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch (error) {
      console.warn("재고 데이터 읽기 실패", error);
      return {};
    }
  }

  function saveRecords() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function buildItems() {
    const unique = new Map();
    productGroups.forEach(group => {
      (Array.isArray(group.item_numbers) ? group.item_numbers : []).forEach(number => {
        const itemNumber = String(number).trim();
        if (!itemNumber) return;
        const sku = operations.buildSku(itemNumber, group.id);
        if (!unique.has(sku)) {
          const saved = records[sku] || {};
          unique.set(sku, operations.createInventoryRecord({
            sku,
            itemNumber,
            groupId: group.id,
            quantity: saved.quantity || 0,
            reservedQuantity: saved.reservedQuantity || 0,
            locationCode: saved.locationCode || "",
            updatedAt: saved.updatedAt
          }));
          unique.get(sku).groupTitle = group.title || "상품 묶음";
          unique.get(sku).barcode = operations.buildBarcodeValue(itemNumber, group.id);
        }
      });
    });
    return Array.from(unique.values()).sort((a, b) =>
      String(a.itemNumber).localeCompare(String(b.itemNumber), "ko", { numeric: true })
    );
  }

  function getStatus(quantity) {
    if (quantity <= 0) return "out";
    if (quantity <= LOW_STOCK_LIMIT) return "low";
    return "normal";
  }

  function updateSummary(items) {
    const values = {
      inventorySkuCount: items.length,
      inventoryTotalQuantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      inventoryLowStockCount: items.filter(item => getStatus(Number(item.quantity)) === "low").length,
      inventoryOutOfStockCount: items.filter(item => getStatus(Number(item.quantity)) === "out").length
    };
    Object.entries(values).forEach(([id, value]) => {
      const node = document.getElementById(id);
      if (node) node.textContent = Number(value).toLocaleString();
    });
  }

  function render() {
    const allItems = buildItems();
    updateSummary(allItems);
    const keyword = (elements.search?.value || "").trim().toLowerCase();
    const statusFilter = elements.status?.value || "all";
    const visible = allItems.filter(item => {
      const matchesKeyword = !keyword || [item.itemNumber, item.groupTitle, item.sku, item.locationCode]
        .join(" ").toLowerCase().includes(keyword);
      const status = getStatus(Number(item.quantity));
      return matchesKeyword && (statusFilter === "all" || status === statusFilter);
    });

    if (!visible.length) {
      elements.list.innerHTML = '<div class="inventory-empty">조건에 맞는 품번이 없습니다.</div>';
      return;
    }

    elements.list.innerHTML = visible.map(item => {
      const status = getStatus(Number(item.quantity));
      const label = status === "out" ? "품절" : status === "low" ? "재고 부족" : "정상";
      return `
        <article class="inventory-row" data-sku="${escapeHtml(item.sku)}">
          <div class="inventory-item-info">
            <strong>품번 ${escapeHtml(item.itemNumber)}</strong>
            <span>${escapeHtml(item.groupTitle)}</span>
            <small>바코드: ${escapeHtml(item.barcode)}</small>
          </div>
          <label>현재고
            <input class="order-input inventory-quantity" type="number" min="0" step="1" value="${Number(item.quantity)}">
          </label>
          <label>창고 위치
            <input class="order-input inventory-location" type="text" maxlength="30" value="${escapeHtml(item.locationCode)}" placeholder="예: A-01-03">
          </label>
          <span class="inventory-status ${status}">${label}</span>
          <button class="cart-btn inventory-save" type="button">저장</button>
        </article>`;
    }).join("");
  }

  function saveRow(row) {
    const sku = row.dataset.sku;
    const quantity = Math.max(0, Number(row.querySelector(".inventory-quantity")?.value || 0));
    const locationCode = row.querySelector(".inventory-location")?.value.trim() || "";
    const item = buildItems().find(entry => entry.sku === sku);
    if (!item) return;
    records[sku] = operations.createInventoryRecord({ ...item, quantity, locationCode });
    saveRecords();
    elements.message.innerHTML = `<p class="product-success">품번 ${escapeHtml(item.itemNumber)} 재고가 저장되었습니다.</p>`;
    render();
  }

  function exportCsv() {
    const items = buildItems();
    const rows = [["품번", "SKU", "바코드", "상품묶음", "현재고", "예약수량", "창고위치", "수정일"],
      ...items.map(item => [item.itemNumber, item.sku, item.barcode, item.groupTitle, item.quantity, item.reservedQuantity, item.locationCode, item.updatedAt])];
    const csv = "\ufeff" + rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `designjam-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  window.addEventListener("designjam:products-loaded", event => {
    productGroups = Array.isArray(event.detail?.groups) ? event.detail.groups : [];
    render();
  });
  elements.search?.addEventListener("input", render);
  elements.status?.addEventListener("change", render);
  elements.reset?.addEventListener("click", () => {
    elements.search.value = "";
    elements.status.value = "all";
    render();
  });
  elements.exportButton?.addEventListener("click", exportCsv);
  elements.list.addEventListener("click", event => {
    const button = event.target.closest(".inventory-save");
    if (button) saveRow(button.closest(".inventory-row"));
  });
})(window, document);
