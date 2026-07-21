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

// Kết quả tính của MỘT dòng chỉ tiêu.
// `bpMap`: { [lien_ket_bo_phan]: điểm đạt của dòng BO_PHAN } — xem tinhBangKpi().
//
// Dòng có lien_ket_bo_phan lấy ĐIỂM ĐẠT từ dòng bộ phận nhưng giữ TRỌNG SỐ riêng:
// chấm một lần cho cả bộ phận, mỗi người quy đổi theo trọng số của mình.
export function tinhChiTieu(ct, logs = [], bpMap = {}) {
  const laBoPhan = !!ct.lien_ket_bo_phan;
  const dat = laBoPhan ? num(bpMap[ct.lien_ket_bo_phan]) : diemDat(ct, logs);
  const max = num(ct.chi_tieu);
  const trongSo = num(ct.trong_so);

  // chi_tieu null/0 = dòng thưởng ngoài trọng số: cộng thẳng điểm nhật ký, không có tỉ lệ.
  if (!max) {
    const thuong = logs.reduce((s, l) => s + num(l.so_diem), 0);
    return { diemDat: dat, tiLeDat: null, diemQuyDoi: thuong, diemMat: 0, laThuong: true };
  }

  const tiLeDat = clamp(dat / max, 0, 1);
  const diemQuyDoi = tiLeDat * trongSo;
  return { diemDat: dat, tiLeDat, diemQuyDoi, diemMat: trongSo - diemQuyDoi, laThuong: false };
}
