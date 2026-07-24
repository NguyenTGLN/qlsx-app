// ============================================================
// Engine quy đổi GIÁ TRỊ CẢI TIẾN thành tiền + chấm điểm xếp loại.
// Spec: docs/superpowers/specs/2026-07-24-cai-tien-design.md
//
// Toàn bộ là hàm thuần: nhận metrics + config, không đọc DB, không side effect —
// UI gọi realtime khi nhân viên gõ số (pattern kpiTuDong.js / stagingMove.js).
// Mọi input người dùng đi qua so(): chữ / âm / thiếu → 0, KHÔNG BAO GIỜ ra NaN
// hay tiền âm — số này hiển thị công khai và là cơ sở xếp hạng.
// ============================================================

export const CATEGORIES = [
  { key: 'nang_suat',    label: 'Năng suất / Tốc độ',   icon: '⚡', mau: '#b45309', mauNen: '#fef3c7', goiY: 'Làm nhanh hơn, bớt thao tác thừa' },
  { key: 'chat_luong',   label: 'Chất lượng',            icon: '🎯', mau: '#047857', mauNen: '#d1fae5', goiY: 'Giảm lỗi, giảm hàng hỏng, bảo hành' },
  { key: 'chi_phi',      label: 'Tiết kiệm chi phí',     icon: '💰', mau: '#a16207', mauNen: '#fef9c3', goiY: 'Giảm vật tư, điện nước, phế liệu' },
  { key: 'rui_ro',       label: 'Giảm rủi ro',           icon: '🛡️', mau: '#b91c1c', mauNen: '#fee2e2', goiY: 'An toàn hơn, bớt nguy cơ sự cố' },
  { key: 'don_gian_hoa', label: 'Đơn giản hóa',          icon: '🧩', mau: '#1d4ed8', mauNen: '#dbeafe', goiY: 'Ai cũng làm được, đào tạo nhanh hơn' },
  { key: 'quy_trinh',    label: 'Quy trình',             icon: '🔄', mau: '#0e7490', mauNen: '#cffafe', goiY: 'Bớt bước, bớt chờ đợi, bớt giấy tờ' },
  { key: '5s',           label: '5S',                    icon: '🧹', mau: '#6d28d9', mauNen: '#ede9fe', goiY: 'Sàng lọc, sắp xếp, sạch sẽ, săn sóc, sẵn sàng' },
  { key: 'moi_truong',   label: 'Môi trường làm việc',   icon: '🌿', mau: '#15803d', mauNen: '#dcfce7', goiY: 'Nơi làm việc đẹp, thoải mái hơn' },
];

// Giá trị mặc định khi bảng cai_tien_config chưa có / chưa tải được.
// Đã chốt với chủ app 24/07/2026. Admin sửa trong DB, không sửa ở đây.
export const DEFAULT_CONFIG = {
  don_gia_gio: 35_000,      // đ/giờ công
  ngay_cong_thang: 26,      // ngày công/tháng
  chi_phi_loi: 180_000,     // đ cho 1 SP lỗi (sửa lại + bảo hành + uy tín)
  trong_so: { gia_tri: 40, sang_tao: 20, nhan_rong: 20, no_luc: 10, bang_chung: 10 },
  nguong: { A: 80, B: 60, C: 40 },
};

// Ép về số không âm. Cho phép số thập phân (xác suất 0,5 lần/năm; 1,5% lỗi).
function so(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function lam1(v) { return Math.round(v * 10) / 10; }

export function fmtTien(v) {
  const n = so(v);
  if (n >= 1e9) return n / 1e9 >= 100
    ? Math.round(n / 1e9).toLocaleString('vi-VN') + ' tỷ'
    : (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
  if (n >= 1e6) return (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' triệu';
  return Math.round(n).toLocaleString('vi-VN') + ' đ';
}

// Thời gian tiết kiệm của MỘT khu vực: phút/ngày × số người hưởng lợi.
// Dùng chung cho quy_trinh / 5s / moi_truong và phần cộng thêm của don_gian_hoa.
function gioKhuVucThang(metrics, cfg) {
  const phut = so(metrics.phut_ngay);
  const nguoi = so(metrics.so_nguoi) || 1; // không nhập = 1 người (chính tác giả)
  return (phut * nguoi * cfg.ngay_cong_thang) / 60;
}

const ZERO = { gio_thang: 0, tien_thang: 0, tien_nam: 0 };

// → { gio_thang, tien_thang, tien_nam, dien_giai }
// gio_thang = 0 với loại không quy đổi qua giờ công (chi_phi, rui_ro, chat_luong).
export function tinhGiaTri(category, metrics, config) {
  const cfg = { ...DEFAULT_CONFIG, ...(config || {}) };
  const m = metrics || {};

  if (m.chua_do) {
    return { ...ZERO, dien_giai: 'Chưa đo được số liệu — quản lý sẽ đánh giá khi duyệt' };
  }

  let gio_thang = 0, tien_thang = 0, tien_nam = 0, dien_giai = '';

  switch (category) {
    case 'nang_suat': {
      const tietKiemPhut = Math.max(0, so(m.truoc) - so(m.sau)) * so(m.sl_ngay) * cfg.ngay_cong_thang;
      gio_thang = tietKiemPhut / 60;
      tien_thang = gio_thang * cfg.don_gia_gio;
      dien_giai = `Tiết kiệm ${lam1(gio_thang).toLocaleString('vi-VN')} giờ/tháng`;
      break;
    }
    case 'chat_luong': {
      const loiGiam = Math.max(0, so(m.loi_truoc) - so(m.loi_sau)) / 100 * so(m.sl_thang);
      tien_thang = loiGiam * (so(m.chi_phi_loi) || cfg.chi_phi_loi);
      dien_giai = `Giảm ${lam1(loiGiam).toLocaleString('vi-VN')} SP lỗi/tháng`;
      break;
    }
    case 'chi_phi': {
      tien_thang = Math.max(0, so(m.tien_truoc_thang) - so(m.tien_sau_thang));
      dien_giai = 'Chi phí giảm trực tiếp mỗi tháng';
      break;
    }
    case 'rui_ro': {
      // Điểm rủi ro = khả năng xảy ra (1-5) × mức độ thiệt hại (1-5).
      // Giá trị = phần rủi ro kỳ vọng hằng năm được loại bỏ.
      const diemTruoc = so(m.kn_truoc) * so(m.md_truoc);
      const diemSau = so(m.kn_sau) * so(m.md_sau);
      if (diemTruoc > 0 && diemSau < diemTruoc) {
        const tyLeGiam = (diemTruoc - diemSau) / diemTruoc;
        tien_nam = so(m.thiet_hai) * so(m.xac_suat_nam) * tyLeGiam;
        tien_thang = tien_nam / 12;
        dien_giai = `Điểm rủi ro ${diemTruoc} → ${diemSau} (giảm ${Math.round(tyLeGiam * 100)}%)`;
      } else {
        dien_giai = 'Rủi ro không giảm theo số liệu đã nhập';
      }
      break;
    }
    case 'don_gian_hoa': {
      // Giờ đào tạo tiết kiệm cho mỗi người mới, quy về tháng + phần thao tác hằng ngày.
      const gioDaoTaoThang = Math.max(0, so(m.gio_dt_truoc) - so(m.gio_dt_sau)) * so(m.nguoi_nam) / 12;
      gio_thang = gioDaoTaoThang + gioKhuVucThang(m, cfg);
      tien_thang = gio_thang * cfg.don_gia_gio;
      dien_giai = `Tiết kiệm ${lam1(gio_thang).toLocaleString('vi-VN')} giờ/tháng (đào tạo + thao tác)`;
      break;
    }
    case 'quy_trinh':
    case '5s':
    case 'moi_truong': {
      gio_thang = gioKhuVucThang(m, cfg);
      tien_thang = gio_thang * cfg.don_gia_gio;
      dien_giai = gio_thang > 0
        ? `Khu vực tiết kiệm ${lam1(gio_thang).toLocaleString('vi-VN')} giờ/tháng`
        : 'Cải tiến định tính — quản lý đánh giá thêm khi duyệt';
      break;
    }
    default:
      return { ...ZERO, dien_giai: 'Loại cải tiến không hợp lệ' };
  }

  if (!tien_nam) tien_nam = tien_thang * 12;
  return {
    gio_thang: lam1(gio_thang),
    tien_thang: Math.round(tien_thang),
    tien_nam: Math.round(tien_nam),
    dien_giai,
  };
}

// Chấm 5 tiêu chí, mỗi tiêu chí 1-5. Thiếu tiêu chí nào → null (chưa chấm xong,
// UI không cho bấm Duyệt). Trọng số + ngưỡng lấy từ config để admin chỉnh được.
export function chamDiem(scores, config) {
  const cfg = { ...DEFAULT_CONFIG, ...(config || {}) };
  const trongSo = cfg.trong_so || DEFAULT_CONFIG.trong_so;
  if (!scores) return null;
  let tong = 0;
  for (const [tieuChi, ts] of Object.entries(trongSo)) {
    const diem = Number(scores[tieuChi]);
    if (!Number.isFinite(diem) || diem < 1 || diem > 5) return null;
    tong += (diem / 5) * ts;
  }
  const tong_diem = lam1(tong);
  const ng = cfg.nguong || DEFAULT_CONFIG.nguong;
  const xep_loai = tong_diem >= ng.A ? 'A' : tong_diem >= ng.B ? 'B' : tong_diem >= ng.C ? 'C' : 'GHI_NHAN';
  return { tong_diem, xep_loai };
}
