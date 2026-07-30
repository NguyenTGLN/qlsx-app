// Đọc-ghi Supabase cho ĐỢT đề xuất linh kiện. Phần tính toán thuần nằm ở mrp.js.
// Xem spec: docs/superpowers/specs/2026-07-29-de-xuat-linh-kien-theo-dot-design.md

// Mã đợt: DX-DDMMYY-NN. Đổi '2026-07-29' → '290726'.
function dateTag(isoDate) {
  const [y, m, d] = String(isoDate).split('-');
  return `${d}${m}${y.slice(-2)}`;
}

// Số kế tiếp trong ngày. KHÔNG lấp lỗ hổng: luôn lớn hơn số lớn nhất đang có, để một
// mã đợt đã dùng không bao giờ bị gán lại cho đợt khác — nếu không, hai đợt khác nhau
// trong cùng ngày có thể mang cùng mã sau khi một đợt bị huỷ.
export function nextBatchCode(existingCodes, isoDate) {
  const prefix = `DX-${dateTag(isoDate)}-`;
  const max = (existingCodes || []).reduce((m, c) => {
    if (typeof c !== 'string' || !c.startsWith(prefix)) return m;
    const n = parseInt(c.slice(prefix.length), 10);
    return Number.isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}
