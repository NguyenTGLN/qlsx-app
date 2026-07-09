// Logic thuần cho luồng "Thêm BOM thủ công" ở tab BOM.
// Tách khỏi React/DB để unit test độc lập.
//
// product : { code, name } | null — thành phẩm đã chọn từ danh mục.
// lines   : [{ component_code, component_name, unit, quantity }] — các dòng linh kiện.
// existingComps : Set<string> | string[] — mã linh kiện ĐÃ có sẵn trong DB cho thành phẩm này.

/** Kiểm tra dữ liệu nhập trước khi lưu. Trả { ok:true } hoặc { ok:false, error }. */
export function validateManualBom(product, lines) {
  if (!product || !product.code) {
    return { ok: false, error: 'Chưa chọn mã thành phẩm.' };
  }
  const chosen = (lines || []).filter(l => (l.component_code || '').trim());
  if (chosen.length === 0) {
    return { ok: false, error: 'Chưa chọn linh kiện nào.' };
  }
  const bad = chosen.filter(l => {
    const q = parseFloat(l.quantity);
    return isNaN(q) || q <= 0;
  });
  if (bad.length > 0) {
    const codes = bad.map(l => l.component_code).join(', ');
    return { ok: false, error: `Số lượng phải là số > 0. Kiểm tra linh kiện: ${codes}` };
  }
  return { ok: true };
}

/**
 * Dựng danh sách bản ghi để insert vào bom_items.
 * Bỏ qua linh kiện đã có sẵn trong DB (existingComps) và linh kiện trùng trong cùng lô (giữ dòng đầu).
 * Trả { inserts: object[], skipped: number }.
 */
export function buildBomInserts(product, lines, existingComps = []) {
  const existing = existingComps instanceof Set ? existingComps : new Set(existingComps);
  const seen = new Set();
  const inserts = [];
  let skipped = 0;
  for (const l of (lines || [])) {
    const code = (l.component_code || '').trim();
    if (!code) continue; // dòng chưa chọn linh kiện → bỏ, không tính là trùng
    if (existing.has(code) || seen.has(code)) { skipped++; continue; }
    seen.add(code);
    inserts.push({
      product_code: product.code,
      product_name: product.name || '',
      component_code: code,
      unit: (l.unit || '').trim(),
      quantity: parseFloat(l.quantity),
    });
  }
  return { inserts, skipped };
}
