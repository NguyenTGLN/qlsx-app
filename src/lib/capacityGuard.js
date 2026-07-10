// Nguồn sự thật DUY NHẤT cho quy tắc "định mức hợp lệ": có dòng product_capacities
// và capacity_per_hour > 0. Dùng chung cho guard tạo Lệnh SX và guard nhập tiến độ.
// KHÔNG có định mức mặc định — thiếu là thiếu.

export function capacityMap(capRows) {
  const m = new Map();
  for (const r of capRows || []) {
    const code = String(r?.product_code || '').trim();
    const cap = parseFloat(r?.capacity_per_hour);
    if (code && cap > 0) m.set(code, cap);
  }
  return m;
}

// Gộp trùng theo product_code trong CÙNG một batch: dòng SAU ghi đè dòng TRƯỚC
// (last-wins), giữ thứ tự xuất hiện lần đầu, trim + bỏ mã rỗng.
// BẮT BUỘC trước khi upsert onConflict:'product_code' — nếu batch có 2 dòng trùng
// khoá, Postgres báo lỗi "ON CONFLICT DO UPDATE command cannot affect row a second time".
export function dedupeByProductCode(rows) {
  const m = new Map();
  for (const r of rows || []) {
    const code = String(r?.product_code || '').trim();
    if (!code) continue;
    m.set(code, { ...r, product_code: code });
  }
  return [...m.values()];
}

// Trả về mảng mã (unique, giữ thứ tự, đã trim) KHÔNG có định mức hợp lệ trong capRows.
export function missingCapacities(codes, capRows) {
  const m = capacityMap(capRows);
  const seen = new Set();
  const missing = [];
  for (const raw of codes || []) {
    const code = String(raw || '').trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    if (!m.has(code)) missing.push(code);
  }
  return missing;
}
