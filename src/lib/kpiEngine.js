// Luật tính KPI — hàm thuần, KHÔNG import supabase. Mọi màn hình KPI và phần
// xuất Excel đều gọi ở đây, nên luật chỉ được viết một chỗ này.
//
// Nguồn nghiệp vụ: KPI/Copy of KPI kho 06.2026.xls (16 sheet, công thức giống nhau).
//   tỉ lệ đạt  = điểm đạt / chỉ tiêu   (trần 100%)
//   quy đổi    = tỉ lệ × trọng số
//   tổng KPI   = Σ quy đổi             (Σ trọng số = 100)

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Điểm đạt của MỘT chỉ tiêu. `diem_chot` (quản lý chốt tay) thắng nhật ký.
// So sánh với null/undefined chứ không dùng falsy — diem_chot = 0 là giá trị hợp lệ.
export function diemDat(ct, logs = []) {
  if (ct.diem_chot !== null && ct.diem_chot !== undefined) return num(ct.diem_chot);
  const tong = logs.reduce((s, l) => s + num(l.so_diem), 0);
  const max = num(ct.chi_tieu);
  return clamp(max + tong, 0, max);
}
