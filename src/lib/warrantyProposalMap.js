// Biến 1 dòng "xu_ly_phieu_bao_hanh" thành nội dung Phiếu đề nghị sửa chữa bảo hành.
// Thuần, không phụ thuộc React — dùng chung cho cả bản in HTML lẫn Excel.

// Chuẩn hóa ngày về dd/mm/yyyy (nhận YYYY-MM-DD, ISO có giờ, hoặc Date). Không parse được -> ''.
export function fmtNgay(v) {
  if (!v) return '';
  const m = String(v).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[3].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[1]}`;
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

const pick = (row, goc, keys) => {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== '') return String(row[k]).trim();
  }
  for (const k of keys) {
    if (goc[k] != null && String(goc[k]).trim() !== '') return String(goc[k]).trim();
  }
  return '';
};

// Tách chuỗi linh kiện thành mảng: ngăn bởi dấu phẩy, chấm phẩy, hoặc xuống dòng.
const splitLinhKien = (s) => String(s || '')
  .split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);

export function mapRowToProposal(row, currentUser, now = new Date()) {
  const r = row || {};
  const goc = r['phiếu_gốc_json'] || {};
  const nguoi = currentUser ? (currentUser.name || currentUser.id || '') : '';
  return {
    maPhieu: pick(r, goc, ['phiếu_ghi', 'id_phiếu_ghi']),
    khachHang: pick(r, goc, ['tên_người_yêu_cầu', 'tên_khách_hàng']),
    sdt: pick(r, goc, ['số_điện_thoại_khách_hàng']),
    diaChi: pick(r, goc, ['địa_chỉ_nhận_hàng']),
    maDonHang: pick(r, goc, ['mã_đơn_hàng']),
    ngayLap: fmtNgay(pick(r, goc, ['ngày_lắp_đặt'])),
    maSP: pick(r, goc, ['mã_sản_phẩm']),
    tinhTrang: pick(r, goc, ['tình_trạng', 'chi_tiết_lỗi']),
    linhKienList: splitLinhKien(pick(r, goc, ['linh_kiện'])),
    nguoiPhuTrach: String(nguoi || ''),
    ngayText: `Hôm nay, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()} tại TTBH công ty TNHH Euromade Việt Nam`,
  };
}
