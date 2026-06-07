// Danh sách lý do xuất kho thủ công + ánh xạ sang loại (type) phục vụ
// phân biệt doanh số (XB) và demand đề xuất đặt hàng (XB + XDG).
// Xem spec: docs/superpowers/specs/2026-06-07-xuat-kho-thu-cong-nhieu-ma-ly-do-design.md
export const EXPORT_REASONS = [
  { label: 'Bán ra',                type: 'XB' },
  { label: 'Trả cho khách',         type: 'KHAC' },
  { label: 'Xuất bảo hành',         type: 'XB' },
  { label: 'Xuất sản xuất',         type: 'XBS', needsOrderRef: true },
  { label: 'KM',                    type: 'XB' },
  { label: 'Xuất đi gia công',      type: 'KHAC' },
  { label: 'Xuất lên VP',           type: 'KHAC' },
  { label: 'Xuất trả lại NCC',      type: 'KHAC' },
  { label: 'Xuất tạm ứng',          type: 'KHAC' },
  { label: 'Xuất hủy',              type: 'KHAC' },
  { label: 'Xuất chuyển mã',        type: 'KHAC' },
  { label: 'Xuất làm chương trình', type: 'KHAC' },
  { label: 'Xuất cho sếp',          type: 'KHAC' },
  { label: 'Dùng cho kho',          type: 'KHAC' },
  { label: 'Chuyển kho',            type: 'KHAC' },
  { label: 'Tháo máy',              type: 'KHAC' },
  { label: 'Đổi hàng',              type: 'XB' },
  { label: 'Test',                  type: 'KHAC' },
  { label: 'Đi kiểm nghiệm',        type: 'KHAC' },
  { label: 'Xuất đóng hàng',        type: 'XDG' },
  { label: 'Xuất tặng',             type: 'XB' },
  { label: 'Xuất lắp mẫu',          type: 'KHAC' },
  { label: 'Xuất hỏng',             type: 'KHAC' },
  { label: 'Xuất bổ sung',          type: 'XBS', needsOrderRef: true },
  { label: 'Xuất sửa chữa',         type: 'XBS', needsOrderRef: true },
  { label: 'Cho mượn',              type: 'KHAC' },
  { label: 'Xuất mẫu',              type: 'KHAC' },
].map(Object.freeze);
Object.freeze(EXPORT_REASONS);

const BY_LABEL = new Map(EXPORT_REASONS.map(r => [r.label, r]));

export function reasonType(label) {
  return BY_LABEL.get(label)?.type || 'KHAC';
}

export function reasonNeedsOrderRef(label) {
  return BY_LABEL.get(label)?.needsOrderRef === true;
}
