// Sinh SQL cho scripts/import-kpi-excel.mjs. Tách khỏi script để test được: script đọc
// file Excel thật ngay khi load module nên không unit-test trực tiếp được.

// Literal SQL: rỗng/null → `null`, còn lại nhân đôi dấu nháy đơn.
export const q = v =>
  (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

// Số SQL: chỉ nhận số hữu hạn, còn lại `null` (chuỗi rỗng KHÔNG được thành 0).
export const n = v => (typeof v === 'number' && Number.isFinite(v) ? v : 'null');

// Ngày cuối của kỳ 'YYYY-MM' → 'YYYY-MM-DD'. Dùng `new Date(y, m, 0)` (ngày 0 của tháng
// SAU) nên tự đúng cả tháng 28/29/30/31 mà không cần bảng tra.
export function ngayCuoiKy(ky) {
  const [y, m] = String(ky).split('-').map(Number);
  const d = new Date(y, m, 0);
  const p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Bọc một câu `insert into kpi_chi_tieu ... values (...)` (KHÔNG có dấu ; cuối) thành
// một câu có kèm dòng nhật ký giữ nguyên văn ghi chú cột O của file Excel.
//
// Vì sao bắt buộc: cột O là LÝ DO trừ điểm của kỳ đã chấm. Import mà bỏ nó đi thì kỳ T6
// vào app với diem_chot = 3/10 nhưng popup bằng chứng hiện "Chưa có ghi nhận nào" — lý do
// trừ 7 điểm nằm lại trong Excel gốc, nhân viên khiếu nại thì không ai chứng minh được.
//
// `so_diem = 0` là cố ý: engine cộng dồn nhật ký để ra điểm đạt, nên dòng này phải TRUNG
// TÍNH tuyệt đối với phép tính (điểm thật đã nằm ở `diem_chot` copy từ cột K). Nó chỉ tồn
// tại để giữ BẰNG CHỨNG CHỮ.
//
// Dùng data-modifying CTE (`with ... returning`) vì id dòng chỉ tiêu là uuid sinh phía DB
// — không biết trước để viết sẵn vào câu insert nhật ký.
export function sqlChiTieuKemGhiChu(insertChiTieu, { ghiChu, ngay, nguoiGhi = 'Nhập từ Excel' }) {
  const chu = ghiChu === null || ghiChu === undefined ? '' : String(ghiChu).trim();
  if (!chu) return insertChiTieu + ';';
  return [
    `with ct as (`,
    `  ${insertChiTieu} returning id`,
    `)`,
    `insert into kpi_nhat_ky (chi_tieu_id, ngay, so_diem, ly_do, nguon, nguoi_ghi)`,
    `select id, ${q(ngay)}, 0, ${q(chu)}, 'TAY', ${q(nguoiGhi)} from ct;`,
  ].join('\n');
}
