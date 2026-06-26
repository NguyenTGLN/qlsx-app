// Helper thuần cho tab "Xử lý phiếu bảo hành".
// ⚠️ PROCESSING_STATUSES / PROCESSING_CATEGORIES phải KHỚP danh sách IN(...) trong
//    sql/setup_xu_ly_phieu_bao_hanh.sql (trigger + backfill).

export const PROCESSING_STATUSES = ['new', 'open', 'pending'];
export const PROCESSING_CATEGORIES = ['Bảo hành', 'Chăm sóc khách hàng'];

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

export function computeTotalCost(parts) {
  if (!Array.isArray(parts)) return 0;
  return parts.reduce((sum, p) => {
    if (!p || p['tính_phí'] === false) return sum;
    const qty = Number(p['số_lượng']) || 0;
    const price = Number(p['đơn_giá']) || 0;
    return sum + qty * price;
  }, 0);
}
