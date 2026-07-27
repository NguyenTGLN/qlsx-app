// Dựng props cho <WarehouseReceiptPrint> từ 1 phiếu + các dòng inventory_picking_logs của nó.
// Thuần, không phụ thuộc React — dùng chung cho nút "Xem Phiếu" (xem trên màn hình)
// và nút "In Phiếu" (in giấy) để hai đường không bao giờ lệch nội dung.
import { resolveNguoiNhan } from './receiptSigner';

// notes phiếu nhập lưu dạng "{lý do} - {nguồn}" (hoặc chỉ "{lý do}"); phiếu xuất chỉ có lý do.
export const splitNote = (n) => {
  const s = String(n || '').trim();
  const idx = s.indexOf(' - ');
  return idx < 0 ? { reason: s, source: '' } : { reason: s.slice(0, idx).trim(), source: s.slice(idx + 3).trim() };
};

const uniqJoin = (arr) => [...new Set(arr.filter(Boolean))].join(', ');

/** Khóa đánh dấu "đã lấy" của 1 dòng: mã hàng + vị trí — không phụ thuộc thứ tự dòng trả về. */
export const pickKey = (r) => `${r.ma}||${r.kho}`;

// product_code của picking-log: phiếu SẢN XUẤT lưu mã thành phẩm thật, các loại phiếu
// khác nhét mã giả để thoả ràng buộc NOT NULL — những mã này không phải hàng hóa.
const PRODUCT_CODE_GIA = new Set(['DON_HANG', 'XUAT_KHO', 'NHAP_KHO', 'CHUYEN_SX']);

export function buildReceiptProps(order, logs = [], { unitMap = {}, nccMap = {}, nameMap = {} } = {}) {
  const isNK = order.type === 'NHẬP KHO';

  let reason, source;
  if (isNK) {
    const parts = logs.map(it => splitNote(it.notes));
    reason = uniqJoin(parts.map(p => p.reason)) || order.type;
    source = uniqJoin(parts.map(p => p.source));
  } else {
    reason = uniqJoin(logs.map(it => String(it.notes || '').trim())) || order.type;
    source = '';
  }

  const rows = logs.map(it => ({
    ma: it.component_code,
    ten: it.component_name,
    dvt: unitMap[it.component_code] || '',
    sl: Math.abs(Number(it.quantity_taken) || 0),
    // Tồn còn lại tại đúng vị trí đó sau khi lấy hàng — chốt tại thời điểm lập phiếu.
    slConLai: it.quantity_after == null ? null : Number(it.quantity_after),
    kho: it.location,
    ghiChu: it.notes || '',
    maDonHang: it.ma_don_hang || '',
  }));

  // Địa chỉ + SĐT lấy từ NCC theo tên nguồn (nếu khớp), không có thì bỏ trống.
  const ncc = source ? nccMap[source.trim().toLowerCase()] : null;

  // Mã thành phẩm — phiếu sản xuất xuất linh kiện RA ĐỂ LÀM cái gì.
  const thanhPham = [...new Set(logs.map(it => it.product_code).filter(Boolean))]
    .filter(ma => !PRODUCT_CODE_GIA.has(ma))
    .map(ma => ({ ma, ten: nameMap[ma] || '' }));

  return {
    kind: isNK ? 'NK' : (order.type === 'CHUYỂN VỊ TRÍ SX' ? 'CV' : 'XK'),
    code: order.order_code,
    date: order.created_at,
    source: source || reason,
    reason,
    diaChi: ncc ? ncc.dia_chi : '',
    sdt: ncc ? ncc.so_dien_thoai : '',
    rows,
    thanhPham,
    nguoiNhan: resolveNguoiNhan(order.created_by),
  };
}
