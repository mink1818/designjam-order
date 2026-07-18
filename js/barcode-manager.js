/* Design Jam Order V4 - Barcode Manager */
(function initializeBarcodeManager(window, document) {
  "use strict";

  const LABEL = Object.freeze({ width: 60, height: 35, columns: 3, rows: 7, pageWidth: 210, pageHeight: 297 });
  const state = { items: [], selected: new Set(), active: "4008A", groups: [] };
  const $ = id => document.getElementById(id);
  const elements = {
    excel: $("barcodeExcelFile"), erp: $("barcodeLoadErpButton"), search: $("barcodeSearch"), list: $("barcodeItemList"),
    summary: $("barcodeValidationSummary"), selectedCount: $("barcodeSelectedCount"), preview: $("barcodeLabelPreview"),
    copies: $("barcodeCopyCount"), message: $("barcodeMessage"), selectVisible: $("barcodeSelectVisibleButton"),
    clear: $("barcodeClearSelectionButton"), pdf: $("barcodeGeneratePdfButton"), print: $("barcodePrintButton"),
    one: $("barcodePrintOneButton"), p10: $("barcodePreset10Button"), p50: $("barcodePreset50Button"), p100: $("barcodePreset100Button")
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
    const keyword = normalize(elements.search.value);
    return state.items.filter(item => !keyword || item.includes(keyword));
  }

  function renderList() {
    const visible = visibleItems();
    elements.selectedCount.textContent = `${state.selected.size.toLocaleString()}개 선택`;
    if (!visible.length) { elements.list.innerHTML = "<p>조건에 맞는 품번이 없습니다.</p>"; return; }
    elements.list.innerHTML = visible.map(item => `<label class="barcode-item-row"><input type="checkbox" value="${escapeHtml(item)}" ${state.selected.has(item) ? "checked" : ""}><strong>${escapeHtml(item)}</strong><button class="barcode-preview-button" type="button" data-item="${escapeHtml(item)}">미리보기</button></label>`).join("");
  }

  function renderPreview() {
    elements.preview.innerHTML = `<div class="barcode-label-card"><strong class="barcode-label-number">${escapeHtml(state.active)}</strong><svg class="barcode-label-svg" aria-label="${escapeHtml(state.active)} 바코드"></svg></div>`;
    const svg = elements.preview.querySelector("svg");
    try { window.JsBarcode(svg, state.active, { format: "CODE128", displayValue: false, margin: 0, width: 1.8, height: 66 }); }
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

  function loadErp() {
    const values = [];
    state.groups.forEach(group => (Array.isArray(group.item_numbers) ? group.item_numbers : []).forEach(item => values.push(item)));
    if (!values.length) { elements.message.innerHTML = '<p class="auth-error">ERP 등록상품 품번이 없습니다. 상품을 먼저 등록해주세요.</p>'; return; }
    setItems(values, "ERP 등록상품");
  }

  function buildCanvas(item) {
    const canvas = document.createElement("canvas");
    window.JsBarcode(canvas, item, { format: "CODE128", displayValue: false, margin: 0, width: 2.4, height: 120, background: "#ffffff", lineColor: "#000000" });
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
    const gridWidth = LABEL.width * LABEL.columns, gridHeight = LABEL.height * LABEL.rows;
    const startX = (LABEL.pageWidth - gridWidth) / 2, startY = (LABEL.pageHeight - gridHeight) / 2;
    items.forEach((item, index) => {
      if (index && index % 21 === 0) pdf.addPage();
      const slot = index % 21, col = slot % 3, row = Math.floor(slot / 3), x = startX + col * LABEL.width, y = startY + row * LABEL.height;
      pdf.setTextColor(0); pdf.setFont("helvetica", "bold");
      let fontSize = item.length <= 6 ? 25 : item.length <= 10 ? 21 : 16; pdf.setFontSize(fontSize);
      pdf.text(item, x + LABEL.width / 2, y + 7.2, { align: "center", baseline: "middle", maxWidth: 54 });
      const canvas = buildCanvas(item); const image = canvas.toDataURL("image/png");
      // 품번과 바코드가 겹치지 않도록 상단 간격을 확보하고 좌우 폭을 조금 줄인다.
      pdf.addImage(image, "PNG", x + 5, y + 12.5, 50, 17.5, undefined, "FAST");
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
  elements.erp?.addEventListener("click", loadErp);
  elements.search?.addEventListener("input", renderList);
  elements.list.addEventListener("change", event => { const box = event.target.closest('input[type="checkbox"]'); if (!box) return; box.checked ? state.selected.add(box.value) : state.selected.delete(box.value); elements.selectedCount.textContent = `${state.selected.size.toLocaleString()}개 선택`; });
  elements.list.addEventListener("click", event => { const button = event.target.closest(".barcode-preview-button"); if (!button) return; event.preventDefault(); state.active = button.dataset.item; renderPreview(); });
  elements.selectVisible?.addEventListener("click", () => { visibleItems().forEach(item => state.selected.add(item)); renderList(); });
  elements.clear?.addEventListener("click", () => { state.selected.clear(); renderList(); });
  elements.pdf?.addEventListener("click", () => generatePdf(true));
  elements.print?.addEventListener("click", () => generatePdf(false));
  elements.one?.addEventListener("click", () => generatePdf(false, true));
  [[elements.p10,10],[elements.p50,50],[elements.p100,100]].forEach(([button,count]) => button?.addEventListener("click", () => { elements.copies.value = count; state.selected = new Set([state.active]); renderList(); generatePdf(false); }));
  window.addEventListener("designjam:products-loaded", event => { state.groups = Array.isArray(event.detail?.groups) ? event.detail.groups : []; });
  renderPreview();
})(window, document);
