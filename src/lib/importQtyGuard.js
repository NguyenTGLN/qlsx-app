// Chốt chặn mất hàng khi lưu phiếu nhập kho.
//
// executeImport chỉ ghi những dòng có SL nhập > 0, nên một mã đang được tick nhưng
// để SL = 0 sẽ biến mất khỏi phiếu mà không báo gì. Điều này từng xảy ra thật:
// lăn chuột ngang qua ô <input type="number"> đang focus làm Chrome tự trừ số về 0,
// và mã hàng đó rơi khỏi phiếu lúc lưu (xem guard lăn chuột trong main.jsx).
//
// findZeroQtyItems liệt kê đúng những mã sắp bị bỏ để hỏi lại người dùng trước khi ghi.

// Các mã ĐANG CHỌN nhưng tổng SL nhập trên mọi vị trí = 0 (kể cả chưa có vị trí nào).
export function findZeroQtyItems(blocks) {
  const out = [];
  for (const b of blocks || []) {
    for (const item of b.items || []) {
      if (item.selected === false) continue;   // bỏ tick = cố ý không nhập
      const total = (item.locations || []).reduce((s, l) => s + (Number(l.import_qty) || 0), 0);
      if (!(total > 0)) out.push({ source: b.sourceValue || '', code: item.code, name: item.name });
    }
  }
  return out;
}

// Câu cảnh báo gom theo mã đơn/nguồn. Rỗng = không có gì để cảnh báo.
export function zeroQtyWarning(list) {
  if (!list || list.length === 0) return '';
  const bySource = new Map();
  for (const r of list) {
    const key = r.source || '(không có mã đơn)';
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key).push(r.code);
  }
  const lines = [...bySource.entries()].map(([src, codes]) => `  • ${src}: ${codes.join(', ')}`);
  return [
    `${list.length} mã hàng đang để SL nhập = 0 nên sẽ KHÔNG được ghi vào phiếu:`,
    ...lines,
    '',
    'Bấm OK để lưu và bỏ qua các mã này, hoặc Cancel để quay lại điền số lượng.',
  ].join('\n');
}
