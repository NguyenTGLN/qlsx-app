/**
 * Trả về ngày hiện tại theo local timezone dạng YYYY-MM-DD.
 * Dùng thay cho `new Date().toISOString().split('T')[0]`
 * vì toISOString() trả về UTC, gây lệch ngày ở VN (UTC+7).
 */
export function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
