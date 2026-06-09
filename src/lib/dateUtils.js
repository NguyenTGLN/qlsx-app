/**
 * Trả về ngày hiện tại theo local timezone dạng YYYY-MM-DD.
 * Dùng thay cho `new Date().toISOString().split('T')[0]`
 * vì toISOString() trả về UTC, gây lệch ngày ở VN (UTC+7).
 */
export function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Parse một giá trị ngày từ ô Excel về chuỗi YYYY-MM-DD (local).
 * Chấp nhận: 'YYYY-MM-DD', 'dd/MM/yyyy', số serial Excel. Trả null nếu không hợp lệ.
 */
export function parseImportDate(value) {
  if (value === null || value === undefined || value === '') return null;

  // Số serial Excel: số ngày kể từ 1899-12-30
  if (typeof value === 'number' && isFinite(value)) {
    const ms = Math.round((value - 25569) * 86400 * 1000); // 25569 = 1970-01-01 theo serial Excel
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  const str = String(value).trim();
  // Đã là ISO YYYY-MM-DD (có thể kèm giờ) → lấy 10 ký tự đầu
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // dd/MM/yyyy hoặc dd-MM-yyyy
  // Giả định dd/MM/yyyy (locale VN) — KHÔNG phải M/D/YYYY kiểu Mỹ
  m = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, '0');
    const mm = String(m[2]).padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }

  return null;
}
