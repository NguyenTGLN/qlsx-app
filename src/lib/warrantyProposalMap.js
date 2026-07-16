// Biến 1 dòng "xu_ly_phieu_bao_hanh" thành nội dung Phiếu đề nghị sửa chữa bảo hành.
// Thuần, không phụ thuộc React — dùng chung cho cả bản in HTML lẫn Excel.
import { lanDefaultsFromRow } from './warrantyProcessing';

// Chuẩn hóa ngày về dd/mm/yyyy (nhận YYYY-MM-DD, ISO có giờ, hoặc Date). Không parse được -> ''.
export function fmtNgay(v) {
  if (!v) return '';
  const m = String(v).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[3].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[1]}`;
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Lấy giá trị đầu tiên khác rỗng theo thứ tự nguồn: bản app đã sửa (thông_tin_bổ_sung)
// → cột mirror (row) → phiếu gốc (phiếu_gốc_json). Nhờ vậy dữ liệu sửa trong app (tình trạng,
// mã đơn hàng, tên KH, địa chỉ...) sẽ lên đúng trong phiếu đề xuất.
const pick = (tt, row, goc, keys) => {
  for (const src of [tt, row, goc]) {
    for (const k of keys) {
      if (src[k] != null && String(src[k]).trim() !== '') return String(src[k]).trim();
    }
  }
  return '';
};

// Tách chuỗi linh kiện thành mảng: ngăn bởi dấu phẩy, chấm phẩy, hoặc xuống dòng.
const splitLinhKien = (s) => String(s || '')
  .split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);

// Tên đầy đủ người đề xuất (Phụ trách đơn) theo tên đăng nhập/nhân viên — riêng phiếu đề xuất BH.
const PROPOSER_FULL_NAME = {
  duong: 'Nguyễn Thị Thùy Dương',
  xuyen: 'Hoàng Hà Xuyên',
  ngoc: 'Nguyễn Bá Ngọc',
  phong: 'Nguyễn Đình Phong',
};
// Chuẩn hóa tên để tra map: bỏ dấu, đổi đ→d, thường hóa, cắt khoảng trắng.
const normNameKey = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase().trim();
// Tên hiển thị người đề xuất: khớp bảng → tên đầy đủ; không khớp → giữ nguyên tên gốc.
export function resolveProposerName(nguoi) {
  const raw = String(nguoi || '');
  return PROPOSER_FULL_NAME[normNameKey(raw)] || raw;
}

// Tên kỹ thuật phụ trách in trong ô "Ghi chú (Tình trạng)" — cố định theo yêu cầu.
const KY_THUAT_PHU_TRACH = 'Nguyễn Bá Ngọc';

// Gộp nội dung ô "Ghi chú (Tình trạng)": Tình trạng + Chi tiết lỗi + Nguyên nhân + Phương án xử lý
// + Kỹ thuật phụ trách; mỗi mục 1 dòng có nhãn; bỏ qua mục rỗng (riêng Kỹ thuật phụ trách luôn hiện).
function buildTinhTrangGhiChu({ tinhTrang, chiTietLoi, nguyenNhan, phuongAn }) {
  return [
    tinhTrang && `Tình trạng: ${tinhTrang}`,
    chiTietLoi && `Chi tiết lỗi: ${chiTietLoi}`,
    nguyenNhan && `Nguyên nhân: ${nguyenNhan}`,
    phuongAn && `Phương án xử lý: ${phuongAn}`,
    `Kỹ thuật phụ trách: ${KY_THUAT_PHU_TRACH}`,
  ].filter(Boolean).join('\n');
}

export function mapRowToProposal(row, currentUser, now = new Date(), fieldOptions = []) {
  const r = row || {};
  const goc = r['phiếu_gốc_json'] || {};
  const tt = r['thông_tin_bổ_sung'] || {}; // giá trị đã sửa trong app (ưu tiên cao nhất)
  const nguoi = currentUser ? (currentUser.name || currentUser.id || '') : '';
  // Nhãn hiệu lực (app sửa → phiếu gốc → mirror; trường option resolve nhãn từ *_option_id).
  const eff = lanDefaultsFromRow(r, fieldOptions);
  return {
    maPhieu: pick(tt, r, goc, ['phiếu_ghi', 'id_phiếu_ghi']),
    khachHang: pick(tt, r, goc, ['tên_người_yêu_cầu', 'tên_khách_hàng']),
    sdt: pick(tt, r, goc, ['số_điện_thoại_khách_hàng']),
    diaChi: pick(tt, r, goc, ['địa_chỉ_nhận_hàng']),
    maDonHang: pick(tt, r, goc, ['mã_đơn_hàng']),
    ngayLap: fmtNgay(pick(tt, r, goc, ['ngày_lắp_đặt'])),
    maSP: pick(tt, r, goc, ['mã_sản_phẩm']),
    // Ô "Ghi chú (Tình trạng)" = gộp Tình trạng + Chi tiết lỗi + Nguyên nhân + Phương án xử lý + Kỹ thuật phụ trách.
    // Text thuần (tình trạng, phương án) dùng pick (có cả mirror); trường option (chi tiết lỗi, nguyên nhân)
    // lấy nhãn đã resolve từ eff (eff cũng fallback về mirror row[key]/gốc nếu không có *_option_id).
    tinhTrang: buildTinhTrangGhiChu({
      tinhTrang: pick(tt, r, goc, ['tình_trạng']),
      chiTietLoi: eff['chi_tiết_lỗi'],
      nguyenNhan: eff['nguyên_nhân'],
      phuongAn: pick(tt, r, goc, ['phương_án_xử_lý']),
    }),
    linhKienList: splitLinhKien(pick(tt, r, goc, ['linh_kiện'])),
    nguoiPhuTrach: resolveProposerName(nguoi),
    ngayText: `Hôm nay, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()} tại TTBH công ty TNHH Euromade Việt Nam`,
  };
}
