// Helper thuần cho tab "Xử lý phiếu bảo hành".
// ⚠️ PROCESSING_STATUSES / PROCESSING_CATEGORIES phải KHỚP điều kiện lọc trong
//    sql/setup_xu_ly_phieu_bao_hanh.sql (trigger + backfill).
//    Giá trị thật xác nhận qua SELECT DISTINCT (2026-06-26):
//    - trạng_thái_phiếu_ghi: new/open/pending (mở), closed/solved (đóng).
//    - phân_loại_công_việc: MỘT giá trị gộp duy nhất, KHÔNG phải 2 loại tách rời.

export const PROCESSING_STATUSES = ['new', 'open', 'pending'];
export const PROCESSING_CATEGORIES = ['Bảo hành và Chăm sóc khách hàng'];

// Workflow CHUẨN áp cho mọi phiếu (đổi danh sách này nếu muốn quy trình khác). Mỗi phiếu
// khởi đầu hiển thị các bước này; khi tick xong sẽ "vật chất hóa" vào cột các_bước của phiếu.
// Vẫn có thể thêm/bớt bước RIÊNG cho từng phiếu trong popup.
export const WORKFLOW_STEPS_MAU = [
  'Liên hệ KH',
  'Hẹn lịch',
  'Kiểm tra / Chẩn đoán',
  'Sửa chữa / Thay linh kiện',
  'Nghiệm thu',
  'Đóng phiếu',
];

export const TRANG_THAI_XU_LY = [
  { id: 'chưa_xử_lý',    label: 'Chưa xử lý',    color: '#64748b' },
  { id: 'đang_liên_hệ',  label: 'Đang liên hệ',  color: '#0284c7' },
  { id: 'đã_hẹn_lịch',   label: 'Đã hẹn lịch',   color: '#7c3aed' },
  { id: 'đang_xử_lý',    label: 'Đang xử lý',    color: '#d97706' },
  { id: 'chờ_linh_kiện', label: 'Chờ linh kiện', color: '#dc2626' },
  { id: 'hoàn_tất',      label: 'Hoàn tất',      color: '#15803d' },
];

export const TRANG_THAI_DONG_BO = {
  'nháp':        { label: 'Nháp',        color: '#94a3b8' },
  'pending':     { label: 'Đang đẩy',    color: '#d97706' },
  'đã_đồng_bộ':  { label: 'Đã đồng bộ',  color: '#15803d' },
  'lỗi':         { label: 'Lỗi',         color: '#dc2626' },
};

export function isQualifyingTicket(t) {
  if (!t) return false;
  return PROCESSING_STATUSES.includes(t['trạng_thái_phiếu_ghi'])
    && PROCESSING_CATEGORIES.includes(t['phân_loại_công_việc']);
}

// Danh sách bước hiệu lực của 1 phiếu: dùng bước tùy biến đã lưu nếu có,
// nếu chưa có thì trả về workflow chuẩn (tất cả 'chưa_xong').
export function getEffectiveSteps(cacBuoc) {
  if (Array.isArray(cacBuoc) && cacBuoc.length > 0) return cacBuoc;
  return WORKFLOW_STEPS_MAU.map(t => ({ 'tên': t, 'trạng_thái': 'chưa_xong' }));
}

export function computeTotalCost(parts) {
  if (!Array.isArray(parts)) return 0;
  return parts.reduce((sum, p) => {
    if (!p || p['tính_phí'] === false) return sum;
    const qty = Number(p['số_lượng']) || 0;
    const price = Number(p['đơn_giá']) || 0;
    return sum + qty * price;
  }, 0);
}
