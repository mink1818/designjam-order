/*
 * Design Jam Order V2 - Operations Core
 * 기존 주문/상품 기능과 분리된 운영 확장 공통 모듈입니다.
 * 바코드, 재고, 피킹 기능은 이 모듈의 데이터 규칙을 사용해 단계적으로 연결합니다.
 */
(function initializeDesignJamOperations(global) {
  "use strict";

  const APP_VERSION = "2.0.0";
  const CODE_PREFIX = "DJ";

  function cleanText(value) {
    return String(value ?? "").trim();
  }

  function normalizeCode(value) {
    return cleanText(value)
      .toUpperCase()
      .replace(/\s+/g, "-")
      .replace(/[^0-9A-Z가-힣_-]/g, "");
  }

  function buildSku(itemNumber, groupId = "") {
    const item = normalizeCode(itemNumber);
    const group = normalizeCode(groupId);

    if (!item) return "";
    return group ? `${CODE_PREFIX}-${group}-${item}` : `${CODE_PREFIX}-${item}`;
  }

  function buildBarcodeValue(itemNumber, groupId = "") {
    return buildSku(itemNumber, groupId);
  }

  function createInventoryRecord(values = {}) {
    return {
      sku: cleanText(values.sku),
      itemNumber: cleanText(values.itemNumber),
      groupId: cleanText(values.groupId),
      quantity: Number.isFinite(Number(values.quantity))
        ? Number(values.quantity)
        : 0,
      reservedQuantity: Number.isFinite(Number(values.reservedQuantity))
        ? Number(values.reservedQuantity)
        : 0,
      locationCode: cleanText(values.locationCode),
      updatedAt: values.updatedAt || new Date().toISOString()
    };
  }

  function createPickingTask(values = {}) {
    return {
      orderId: cleanText(values.orderId),
      orderItemId: cleanText(values.orderItemId),
      sku: cleanText(values.sku),
      itemNumber: cleanText(values.itemNumber),
      requestedQuantity: Number.isFinite(Number(values.requestedQuantity))
        ? Number(values.requestedQuantity)
        : 0,
      pickedQuantity: Number.isFinite(Number(values.pickedQuantity))
        ? Number(values.pickedQuantity)
        : 0,
      locationCode: cleanText(values.locationCode),
      status: cleanText(values.status) || "대기",
      updatedAt: values.updatedAt || new Date().toISOString()
    };
  }

  global.DesignJamOperations = Object.freeze({
    version: APP_VERSION,
    codePrefix: CODE_PREFIX,
    featureFlags: Object.freeze({
      barcode: false,
      inventory: true,
      picking: false
    }),
    cleanText,
    normalizeCode,
    buildSku,
    buildBarcodeValue,
    createInventoryRecord,
    createPickingTask
  });
})(window);
