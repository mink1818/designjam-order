/* Design Jam Order V4 - Barcode Manager */
(function initializeBarcodeManager(window, document) {
  "use strict";

  const LABELS = Object.freeze({
    "60x35": Object.freeze({ width: 60, height: 35, columns: 3, rows: 7, pageWidth: 210, pageHeight: 297, font: [25, 21, 16], textY: 7.2, barcodeX: 2.5, barcodeY: 12.5, barcodeW: 55, barcodeH: 17.5, jsWidth: 2.8, jsHeight: 120, label: "60×35mm · Code128 · A4 3×7" }),
    "45x25": Object.freeze({ width: 45, height: 25, columns: 4, rows: 10, pageWidth: 210, pageHeight: 297, font: [18, 15, 12], textY: 5.4, barcodeX: 2.25, barcodeY: 9.2, barcodeW: 40.5, barcodeH: 12.2, jsWidth: 2.35, jsHeight: 96, label: "45×25mm · Code128 · A4 4×10" }),
    "80x50": Object.freeze({ width: 80, height: 50, columns: 2, rows: 5, pageWidth: 210, pageHeight: 297, font: [31, 27, 21], textY: 10, barcodeX: 4, barcodeY: 18, barcodeW: 72, barcodeH: 25, jsWidth: 3.25, jsHeight: 145, label: "80×50mm · Code128 · A4 2×5" })
  });
  const SIZE_STORAGE_KEY = "designjam_barcode_label_size";
  const savedSize = localStorage.getItem(SIZE_STORAGE_KEY);
  const state = { items: [], selected: new Set(), active: "4008A", groups: [], categories: [], size: LABELS[savedSize] ? savedSize : "60x35" };
  const $ = id => document.getElementById(id);
  const elements = {
    excel: $("barcodeExcelFile"), erp: $("barcodeLoadErpButton"), list: $("barcodeItemList"),
    summary: $("barcodeValidationSummary"), selectedCount: $("barcodeSelectedCount"), preview: $("barcodeLabelPreview"),
    copies: $("barcodeCopyCount"), message: $("barcodeMessage"), selectVisible: $("barcodeSelectVisibleButton"),
    clear: $("barcodeClearSelectionButton"), selectAll: $("barcodeSelectAllButton"), deselectAll: $("barcodeDeselectAllButton"), deleteSelected: $("barcodeDeleteSelectedButton"), deleteAll: $("barcodeDeleteAllButton"), pdf: $("barcodeGeneratePdfButton"), print: $("barcodePrintButton"),
    one: $("barcodePrintOneButton"), p10: $("barcodePreset10Button"), p50: $("barcodePreset50Button"), p100: $("barcodePreset100Button"),
    specBadge: $("barcodeSpecBadge"), previewSpec: $("barcodePreviewSpec"),
    searchInput: $("barcodeSearchInput"), searchButton: $("barcodeSearchButton"),
    sizeInputs: [...document.querySelectorAll('input[name="barcodeLabelSize"]')]
  };
  if (!elements.list) return;

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function normalize(value) {
    return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function parseItemPattern(value) {
    const external = window.parseItemPattern;
    if (typeof external === "function") return external(value);
    const parts = String(value || "").replace(/[～〜]/g, "~").replace(/[–—−]/g, "-").split(/[\n,;/]+/).map(v => v.trim()).filter(Boolean);
    const result = [];
    const parseCode = text => {
      const clean = normalize(text); const match = clean.match(/^([^0-9]*)(\d+)([^0-9]*)$/);
      return match ? { text: clean, ok: true, prefix: match[1], numberText: match[2], number: Number(match[2]), suffix: match[3] } : { text: clean, ok: false };
    };
    parts.forEach(original => {
      let part = original.replace(/\s+/g, "");
      if (!part.includes("~")) {
        const range = part.match(/^(\d+[^0-9-]*)-(\d+[^0-9-]*)$/);
        if (range) part = `${range[1]}~${range[2]}`;
      }
      const rangeParts = part.split("~").filter(Boolean);
      if (rangeParts.length === 1) { const code = parseCode(rangeParts[0]); if (!code.text) throw new Error(`"${original}" 품번이 비어 있습니다.`); result.push(code.text); return; }
      if (rangeParts.length !== 2) throw new Error(`"${original}" 입력 형식을 확인해주세요.`);
      const start = parseCode(rangeParts[0]), end = parseCode(rangeParts[1]);
      if (!start.ok || !end.ok || start.prefix !== end.prefix || start.suffix !== end.suffix) throw new Error(`"${original}" 범위를 확인해주세요.`);
      if (Math.abs(end.number - start.number) > 1000) throw new Error(`"${original}" 범위가 너무 큽니다.`);
      const step = end.number >= start.number ? 1 : -1, width = Math.max(start.numberText.length, end.numberText.length), pad = /^0/.test(start.numberText) || /^0/.test(end.numberText);
      for (let n = start.number; step > 0 ? n <= end.number : n >= end.number; n += step) result.push(`${start.prefix}${pad ? String(n).padStart(width, "0") : n}${start.suffix}`);
    });
    return [...new Set(result)];
  }

  function validateItem(item) {
    if (!item) return "빈 품번";
    if (item.length > 30) return "30자 초과";
    if (!/^[0-9A-Z가-힣_-]+$/.test(item)) return "지원하지 않는 문자";
    return "";
  }

  function setItems(rawValues, sourceName) {
    const expanded = [], errors = [];
    rawValues.forEach((value, index) => {
      try { expanded.push(...parseItemPattern(value)); }
      catch (error) { errors.push(`${index + 1}행: ${error.message}`); }
    });
    const normalized = expanded.map(normalize).filter(Boolean);
    const unique = [...new Set(normalized)].sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
    const invalid = unique.map(item => ({ item, error: validateItem(item) })).filter(row => row.error);
    state.items = unique.filter(item => !validateItem(item));
    state.selected = new Set(state.items);
    state.active = state.items[0] || "4008A";
    elements.summary.className = `barcode-validation-summary ${errors.length || invalid.length ? "warning" : "success"}`;
    elements.summary.innerHTML = `<b>${escapeHtml(sourceName)}</b> · 원본 ${rawValues.length.toLocaleString()}개 · 분리 ${expanded.length.toLocaleString()}개 · 중복 제거 ${Math.max(0, normalized.length - unique.length).toLocaleString()}개 · 정상 ${state.items.length.toLocaleString()}개${errors.length ? ` · 오류 ${errors.length}개` : ""}${invalid.length ? ` · 제외 ${invalid.length}개` : ""}`;
    if (errors.length) elements.message.innerHTML = `<div class="excel-error-list"><h3>품번 오류</h3>${errors.slice(0, 30).map(v => `<p>${escapeHtml(v)}</p>`).join("")}</div>`; else elements.message.innerHTML = "";
    renderList(); renderPreview();
  }

  function visibleItems() {
    return state.items;
  }

  function renderList() {
    const visible = visibleItems();
    elements.selectedCount.textContent = `${state.selected.size.toLocaleString()}개 선택`;
    if (!visible.length) { elements.list.innerHTML = "<p>조건에 맞는 품번이 없습니다.</p>"; return; }
    elements.list.innerHTML = visible.map(item => `<label class="barcode-item-row"><input type="checkbox" value="${escapeHtml(item)}" ${state.selected.has(item) ? "checked" : ""}><strong>${escapeHtml(item)}</strong><button class="barcode-preview-button" type="button" data-item="${escapeHtml(item)}">미리보기</button></label>`).join("");
  }

  function currentLabel() {
    return LABELS[state.size] || LABELS["60x35"];
  }

  function applyLabelSize(sizeKey, persist = true) {
    if (!LABELS[sizeKey]) return;
    state.size = sizeKey;
    if (persist) localStorage.setItem(SIZE_STORAGE_KEY, sizeKey);
    elements.sizeInputs.forEach(input => { input.checked = input.value === sizeKey; });
    const label = currentLabel();
    if (elements.specBadge) elements.specBadge.textContent = label.label;
    if (elements.previewSpec) elements.previewSpec.textContent = `실제 비율 ${label.width}×${label.height}mm`;
    if (elements.preview) {
      elements.preview.dataset.labelSize = sizeKey;
      elements.preview.style.setProperty("--barcode-label-ratio", `${label.width} / ${label.height}`);
    }
    renderPreview();
  }

  function renderPreview() {
    elements.preview.innerHTML = `<div class="barcode-label-card"><strong class="barcode-label-number">${escapeHtml(state.active)}</strong><svg class="barcode-label-svg" aria-label="${escapeHtml(state.active)} 바코드"></svg></div>`;
    const svg = elements.preview.querySelector("svg");
    const label = currentLabel();
    const previewHeight = state.size === "45x25" ? 52 : state.size === "80x50" ? 82 : 66;
    const previewWidth = state.size === "45x25" ? 1.9 : state.size === "80x50" ? 2.5 : 2.2;
    try { window.JsBarcode(svg, state.active, { format: "CODE128", displayValue: false, margin: 0, width: previewWidth, height: previewHeight }); }
    catch (error) { elements.message.innerHTML = `<p class="auth-error">바코드 미리보기 실패: ${escapeHtml(error.message)}</p>`; }
  }

  async function readExcel(file) {
    if (!window.XLSX) throw new Error("엑셀 라이브러리를 불러오지 못했습니다.");
    const data = await file.arrayBuffer(); const workbook = window.XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]]; if (!sheet) throw new Error("엑셀 시트가 없습니다.");
    const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    if (!rows.length) throw new Error("엑셀에 데이터가 없습니다.");
    const headers = Object.keys(rows[0]); const preferred = ["품번", "상품번호", "item_number", "itemnumber", "sku"];
    const itemHeader = preferred.find(name => headers.some(h => normalize(h) === normalize(name))) || headers.find(h => /품번|상품번호|ITEM|SKU/i.test(h));
    if (!itemHeader) throw new Error("품번 열을 찾지 못했습니다. 열 이름을 '품번'으로 입력해주세요.");
    return rows.map(row => row[itemHeader]).filter(value => String(value).trim());
  }


  async function waitForErpSnapshot(timeoutMs = 7000) {
    if (window.__designjamProductsSnapshot) {
      applyProductsSnapshot(window.__designjamProductsSnapshot);
      return true;
    }
    return await new Promise(resolve => {
      let finished = false;
      const done = value => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        window.removeEventListener("designjam:products-loaded", onLoaded);
        resolve(value);
      };
      const onLoaded = event => {
        applyProductsSnapshot(event.detail);
        done(true);
      };
      const timer = setTimeout(() => done(Boolean(state.groups.length)), timeoutMs);
      window.addEventListener("designjam:products-loaded", onLoaded, { once: true });
      window.dispatchEvent(new CustomEvent("designjam:request-products-snapshot"));
    });
  }

  async function loadErp() {
    const connected = await waitForErpSnapshot();
    if (!connected) { elements.message.innerHTML = '<p class="auth-error">ERP 상품정보 연결이 완료되지 않았습니다. 잠시 후 다시 시도해주세요.</p>'; return; }
    const values = [];
    state.groups.forEach(group => (Array.isArray(group.item_numbers) ? group.item_numbers : []).forEach(item => values.push(item)));
    if (!values.length) { elements.message.innerHTML = '<p class="auth-error">ERP 등록상품 품번이 없습니다. 상품을 먼저 등록해주세요.</p>'; return; }
    setItems(values, "ERP 등록상품");
  }

  function buildCanvas(item, label = currentLabel()) {
    const canvas = document.createElement("canvas");
    window.JsBarcode(canvas, item, { format: "CODE128", displayValue: false, margin: 0, width: label.jsWidth, height: label.jsHeight, background: "#ffffff", lineColor: "#000000" });
    return canvas;
  }

  function getOutputItems(onlyActive = false) {
    const copies = Math.max(1, Math.min(1000, Number(elements.copies.value) || 1));
    const base = onlyActive ? [state.active] : state.items.filter(item => state.selected.has(item));
    return base.flatMap(item => Array.from({ length: copies }, () => item));
  }

  function createPdf(items) {
    if (!items.length) throw new Error("출력할 품번을 선택해주세요.");
    const jsPDF = window.jspdf?.jsPDF; if (!jsPDF) throw new Error("PDF 라이브러리를 불러오지 못했습니다.");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const label = currentLabel();
    const perPage = label.columns * label.rows;
    const gridWidth = label.width * label.columns, gridHeight = label.height * label.rows;
    const startX = (label.pageWidth - gridWidth) / 2, startY = (label.pageHeight - gridHeight) / 2;
    items.forEach((item, index) => {
      if (index && index % perPage === 0) pdf.addPage();
      const slot = index % perPage, col = slot % label.columns, row = Math.floor(slot / label.columns), x = startX + col * label.width, y = startY + row * label.height;
      pdf.setTextColor(0); pdf.setFont("helvetica", "bold");
      const fontSize = item.length <= 6 ? label.font[0] : item.length <= 10 ? label.font[1] : label.font[2];
      pdf.setFontSize(fontSize);
      pdf.text(item, x + label.width / 2, y + label.textY, { align: "center", baseline: "middle", maxWidth: label.width - 8 });
      const canvas = buildCanvas(item, label); const image = canvas.toDataURL("image/png");
      pdf.addImage(image, "PNG", x + label.barcodeX, y + label.barcodeY, label.barcodeW, label.barcodeH, undefined, "FAST");
    });
    return pdf;
  }

  function generatePdf(download = true, onlyActive = false) {
    try {
      const items = getOutputItems(onlyActive), pdf = createPdf(items), filename = `designjam-barcode-${new Date().toISOString().slice(0,10)}.pdf`;
      if (download) pdf.save(filename); else { const blobUrl = pdf.output("bloburl"); const popup = window.open(blobUrl, "_blank"); if (!popup) throw new Error("팝업이 차단되었습니다. 브라우저에서 팝업을 허용해주세요."); }
      elements.message.innerHTML = `<p class="product-success">${items.length.toLocaleString()}장 바코드 라벨을 생성했습니다.</p>`;
    } catch (error) { elements.message.innerHTML = `<p class="auth-error">${escapeHtml(error.message)}</p>`; }
  }

  elements.excel?.addEventListener("change", async event => { const file = event.target.files?.[0]; if (!file) return; elements.message.innerHTML = "<p>엑셀 품번을 읽는 중...</p>"; try { setItems(await readExcel(file), file.name); } catch (error) { elements.message.innerHTML = `<p class="auth-error">엑셀 읽기 실패: ${escapeHtml(error.message)}</p>`; } });
  function loadDirectInput() {
    const value = elements.searchInput?.value || "";
    if (!value.trim()) {
      elements.message.innerHTML = '<p class="auth-error">검색하거나 출력할 품번을 입력해주세요.</p>';
      elements.searchInput?.focus();
      return;
    }
    try {
      setItems([value], "직접 입력");
    } catch (error) {
      elements.message.innerHTML = `<p class="auth-error">품번 입력 오류: ${escapeHtml(error.message)}</p>`;
    }
  }

  elements.erp?.addEventListener("click", () => loadErp());
  elements.searchButton?.addEventListener("click", loadDirectInput);
  elements.searchInput?.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      loadDirectInput();
    }
  });
  elements.list.addEventListener("change", event => { const box = event.target.closest('input[type="checkbox"]'); if (!box) return; box.checked ? state.selected.add(box.value) : state.selected.delete(box.value); elements.selectedCount.textContent = `${state.selected.size.toLocaleString()}개 선택`; });
  elements.list.addEventListener("click", event => { const button = event.target.closest(".barcode-preview-button"); if (!button) return; event.preventDefault(); state.active = button.dataset.item; renderPreview(); });
  elements.selectVisible?.addEventListener("click", () => { visibleItems().forEach(item => state.selected.add(item)); renderList(); });
  elements.clear?.addEventListener("click", () => { state.selected.clear(); renderList(); });

  elements.selectAll?.addEventListener("click", () => { state.selected = new Set(state.items); renderList(); });
  elements.deselectAll?.addEventListener("click", () => { state.selected.clear(); renderList(); });
  elements.deleteSelected?.addEventListener("click", () => {
    if (!state.selected.size) { elements.message.innerHTML = '<p class="auth-error">지울 품번을 먼저 선택해주세요.</p>'; return; }
    if (!window.confirm(`선택한 ${state.selected.size.toLocaleString()}개 품번을 목록에서 지울까요?`)) return;
    state.items = state.items.filter(item => !state.selected.has(item));
    state.selected.clear();
    state.active = state.items[0] || "4008A";
    renderList(); renderPreview();
  });
  elements.deleteAll?.addEventListener("click", () => {
    if (!state.items.length) return;
    if (!window.confirm("품번 목록을 모두 지울까요?")) return;
    state.items = []; state.selected.clear(); state.active = "4008A";
    elements.summary.className = "barcode-validation-summary";
    elements.summary.textContent = "품번 목록을 모두 지웠습니다.";
    renderList(); renderPreview();
  });

  elements.pdf?.addEventListener("click", () => generatePdf(true));
  elements.print?.addEventListener("click", () => generatePdf(false));
  elements.one?.addEventListener("click", () => generatePdf(false, true));
  [[elements.p10,10],[elements.p50,50],[elements.p100,100]].forEach(([button,count]) => button?.addEventListener("click", () => { elements.copies.value = count; state.selected = new Set([state.active]); renderList(); generatePdf(false); }));
  elements.sizeInputs.forEach(input => input.addEventListener("change", () => applyLabelSize(input.value)));
  function applyProductsSnapshot(snapshot) {
    state.groups = Array.isArray(snapshot?.groups) ? snapshot.groups : [];
    state.categories = Array.isArray(snapshot?.categories) ? snapshot.categories : [];
    window.__designjamBarcodeCategories = state.categories;
  }

  window.addEventListener("designjam:products-loaded", event => applyProductsSnapshot(event.detail));
  if (window.__designjamProductsSnapshot) applyProductsSnapshot(window.__designjamProductsSnapshot);
  applyLabelSize(state.size, false);
})(window, document);
