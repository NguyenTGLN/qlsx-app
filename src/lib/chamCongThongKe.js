// ─────────────────────────────────────────────────────────────────────────────
// Thống kê chấm công theo nhóm — hàm thuần, không chạm Supabase, không chạm React.
//
// Nhóm KHÔNG có bảng riêng: nó là cột `lien_ket_bo_phan` của dòng chỉ tiêu
// `ma = 'CHUYEN_CAN_BO_PHAN'` trong kpi_chi_tieu, tức CÙNG một nguồn với điểm KPI chuyên cần
// bộ phận. Cố ý vậy: chủ app muốn đổi nhóm là điểm KPI đổi theo, không có hai nơi lệch nhau.
// ─────────────────────────────────────────────────────────────────────────────

import { NGAY_PHEP_THANG } from './kpiTuDong';

// `ma` của dòng chỉ tiêu mang khoá nhóm. Dòng chỉ tiêu khác cũng có cột lien_ket_bo_phan
// nhưng nghĩa khác — lọc theo `ma` chứ không quét bừa.
export const MA_CHI_TIEU_NHOM = 'CHUYEN_CAN_BO_PHAN';

// Nhãn nhóm trong DB viết dài cho bảng KPI ("CHUYÊN CẦN BỘ PHẬN — SẢN XUẤT"). Ở đây cột hẹp,
// lấy phần sau dấu — cho gọn. Không có dấu — thì giữ nguyên: kỳ 2026-06 cả công ty chung một
// nhóm tên "CHUYÊN CẦN BỘ PHẬN", cắt bừa là ra chuỗi rỗng.
export function nhanNhomGon(ten) {
  if (!ten) return '';
  const i = String(ten).lastIndexOf('—');
  const gon = i >= 0 ? String(ten).slice(i + 1) : String(ten);
  return gon.trim();
}

// kpiRows → { theoNguoi: Map(nhan_vien_id → khoáNhóm), nhan: Map(khoáNhóm → nhãn) }
export function docNhomTuKpi(kpiRows = []) {
  const theoNguoi = new Map();
  const nhan = new Map();
  for (const r of kpiRows || []) {
    if (r?.ma !== MA_CHI_TIEU_NHOM || !r.lien_ket_bo_phan) continue;
    if (r.cap_do === 'CA_NHAN' && r.nhan_vien_id) {
      theoNguoi.set(r.nhan_vien_id, r.lien_ket_bo_phan);
    } else if (r.cap_do === 'BO_PHAN') {
      const n = nhanNhomGon(r.ten);
      if (n) nhan.set(r.lien_ket_bo_phan, n);
    }
  }
  return { theoNguoi, nhan };
}
