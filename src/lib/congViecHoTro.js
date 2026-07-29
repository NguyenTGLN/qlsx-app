// Quy tắc cho CÔNG VIỆC HỖ TRỢ — việc hàng ngày của thợ nhưng không phải sản xuất:
// đóng đơn giao hàng, nhập hàng, dọn kho, đào tạo nội bộ, việc phát sinh.
//
// Các việc này có mã trong danh mục nhưng KHÔNG có BOM, KHÔNG có tồn kho, KHÔNG
// xuất nhập gì. Chúng được gắn vào 5 phiếu thường trực `VIEC-*` trong
// `production_orders`, đánh dấu bằng cột `loai_viec = 'HO_TRO'`.
//
// Tách khỏi React/Supabase để test được quy tắc mà không phải dựng màn hình.

// `nhan` tối đa 10 ký tự — luật giao diện của dự án: chữ trên nút/thẻ luôn 1 dòng,
// máy 375px chia đôi màn hình thì quá 10 ký tự là bắt đầu bị cắt.
export const DANH_MUC_HO_TRO = [
  { ma: 'GH',   nhan: 'Giao hàng', tenDayDu: 'Đóng đơn giao hàng', goiY: 'Đơn nào, cho khách nào?' },
  { ma: 'NH',   nhan: 'Nhập hàng', tenDayDu: 'Nhập hàng',          goiY: 'Nhập hàng gì, của ai?' },
  { ma: 'DK',   nhan: 'Dọn kho',   tenDayDu: 'Dọn kho',            goiY: 'Dọn khu nào?' },
  { ma: 'DTNB', nhan: 'Đào tạo',   tenDayDu: 'Đào tạo nội bộ',     goiY: 'Đào tạo nội dung gì?' },
  { ma: 'PS',   nhan: 'Phát sinh', tenDayDu: 'Việc phát sinh',     goiY: 'Việc phát sinh gì?' },
];

export const laViecHoTro = order => order?.loai_viec === 'HO_TRO';

export const hieuSuatCoDinh = order =>
  laViecHoTro(order) && order?.cach_tinh_hieu_suat === 'CO_DINH_100';

export const thongTinViec = ma =>
  DANH_MUC_HO_TRO.find(v => v.ma === ma) || null;

// Hiệu suất %, làm tròn về số nguyên — giữ ĐÚNG công thức cũ của màn báo cáo để
// phiếu sản xuất thật không bị chấm lệch đi:
//   (số lượng / số người) / số giờ * định mức giờ-một-sản-phẩm * 100
export function tinhHieuSuat(order, { soLuong, soGio, soNguoi, dinhMucGioMotSP }) {
  if (hieuSuatCoDinh(order)) return 100;

  const sl = parseFloat(soLuong) || 0;
  const gio = parseFloat(soGio) || 0;
  const nguoi = parseInt(soNguoi, 10) || 0;
  const dinhMuc = parseFloat(dinhMucGioMotSP) || 0;
  if (sl <= 0 || gio <= 0 || nguoi <= 0 || dinhMuc <= 0) return 0;

  return Math.round((sl / nguoi / gio) * dinhMuc * 100);
}

// Việc hỗ trợ BẮT BUỘC ghi chú — không ghi thì bản ghi chỉ còn "ai đó làm gì đó
// 3 tiếng", không tra được. Phiếu sản xuất thì ghi chú là tùy chọn.
export const ghiChuHopLe = (order, ghiChu) =>
  !laViecHoTro(order) || String(ghiChu || '').trim().length > 0;
