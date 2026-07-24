import { describe, it, expect } from 'vitest';
import { CATEGORIES, DEFAULT_CONFIG, tinhGiaTri, chamDiem, fmtTien } from './caiTienValue';

// Spec: docs/superpowers/specs/2026-07-24-cai-tien-design.md
// Mọi số chốt ở đây tính tay từ DEFAULT_CONFIG: 35.000đ/giờ · 26 ngày công · 180.000đ/lỗi.

const C = DEFAULT_CONFIG;

describe('CATEGORIES', () => {
  it('đủ 8 loại theo spec, key không trùng', () => {
    const keys = CATEGORIES.map(c => c.key);
    expect(keys).toEqual(['nang_suat', 'chat_luong', 'chi_phi', 'rui_ro',
      'don_gian_hoa', 'quy_trinh', '5s', 'moi_truong']);
    expect(new Set(keys).size).toBe(8);
    for (const c of CATEGORIES) { expect(c.label).toBeTruthy(); expect(c.icon).toBeTruthy(); }
  });
});

describe('tinhGiaTri — nang_suat', () => {
  it('case chuẩn 12→9 phút, 120 SP/ngày: 156 giờ/tháng, 5,46tr/tháng, 65,52tr/năm', () => {
    const r = tinhGiaTri('nang_suat', { truoc: 12, sau: 9, sl_ngay: 120 }, C);
    expect(r.gio_thang).toBe(156);
    expect(r.tien_thang).toBe(5_460_000);
    expect(r.tien_nam).toBe(65_520_000);
    expect(r.dien_giai).toContain('156');
  });

  it('sau ≥ trước (không nhanh hơn) → 0 hết, không âm', () => {
    const r = tinhGiaTri('nang_suat', { truoc: 9, sau: 12, sl_ngay: 120 }, C);
    expect(r.gio_thang).toBe(0);
    expect(r.tien_nam).toBe(0);
  });

  it('thiếu trường / chữ / âm → 0, không bao giờ NaN', () => {
    for (const m of [{}, { truoc: 'abc', sau: 9 }, { truoc: -5, sau: -9, sl_ngay: -3 }]) {
      const r = tinhGiaTri('nang_suat', m, C);
      expect(Number.isFinite(r.tien_nam)).toBe(true);
      expect(r.tien_nam).toBe(0);
    }
  });
});

describe('tinhGiaTri — chat_luong', () => {
  it('4% → 1,5%, 2500 SP/tháng, 180k/lỗi: 11,25tr/tháng, 135tr/năm', () => {
    const r = tinhGiaTri('chat_luong', { loi_truoc: 4, loi_sau: 1.5, sl_thang: 2500, chi_phi_loi: 180_000 }, C);
    expect(r.tien_thang).toBe(11_250_000);
    expect(r.tien_nam).toBe(135_000_000);
  });

  it('không nhập chi phí lỗi → lấy mặc định từ config', () => {
    const r = tinhGiaTri('chat_luong', { loi_truoc: 4, loi_sau: 1.5, sl_thang: 2500 }, C);
    expect(r.tien_thang).toBe(11_250_000); // config.chi_phi_loi = 180.000
  });

  it('lỗi sau ≥ lỗi trước → 0', () => {
    const r = tinhGiaTri('chat_luong', { loi_truoc: 2, loi_sau: 3, sl_thang: 2500 }, C);
    expect(r.tien_nam).toBe(0);
  });
});

describe('tinhGiaTri — chi_phi', () => {
  it('5tr → 3,8tr mỗi tháng: lợi 1,2tr/tháng', () => {
    const r = tinhGiaTri('chi_phi', { tien_truoc_thang: 5_000_000, tien_sau_thang: 3_800_000 }, C);
    expect(r.tien_thang).toBe(1_200_000);
    expect(r.tien_nam).toBe(14_400_000);
    expect(r.gio_thang).toBe(0); // không quy đổi giờ
  });
});

describe('tinhGiaTri — rui_ro', () => {
  it('điểm 16→4 (giảm 75%), thiệt hại 120tr, xác suất 0,5 lần/năm → tránh được 45tr/năm', () => {
    const r = tinhGiaTri('rui_ro',
      { kn_truoc: 4, md_truoc: 4, kn_sau: 2, md_sau: 2, thiet_hai: 120_000_000, xac_suat_nam: 0.5 }, C);
    expect(r.tien_nam).toBe(45_000_000);
    expect(r.tien_thang).toBe(3_750_000);
  });

  it('rủi ro sau ≥ trước hoặc điểm trước = 0 → 0', () => {
    expect(tinhGiaTri('rui_ro', { kn_truoc: 2, md_truoc: 2, kn_sau: 3, md_sau: 3, thiet_hai: 1e8, xac_suat_nam: 1 }, C).tien_nam).toBe(0);
    expect(tinhGiaTri('rui_ro', { thiet_hai: 1e8, xac_suat_nam: 1 }, C).tien_nam).toBe(0);
  });
});

describe('tinhGiaTri — quy_trinh / 5s / moi_truong (thời gian khu vực)', () => {
  it('15 phút/ngày × 8 người: 52 giờ/tháng, 1,82tr/tháng', () => {
    for (const cat of ['quy_trinh', '5s', 'moi_truong']) {
      const r = tinhGiaTri(cat, { phut_ngay: 15, so_nguoi: 8 }, C);
      expect(r.gio_thang).toBe(52);
      expect(r.tien_thang).toBe(1_820_000);
    }
  });

  it('không nhập số người → mặc định 1 người', () => {
    const r = tinhGiaTri('5s', { phut_ngay: 30 }, C);
    expect(r.gio_thang).toBe(13);
  });

  it('môi trường không có số liệu → 0 hợp lệ (cải tiến định tính)', () => {
    const r = tinhGiaTri('moi_truong', {}, C);
    expect(r.tien_nam).toBe(0);
    expect(Number.isFinite(r.tien_nam)).toBe(true);
  });
});

describe('tinhGiaTri — don_gian_hoa', () => {
  it('đào tạo 8h → 2h, 10 người/năm: 60h/năm = 5h/tháng → 175k/tháng', () => {
    const r = tinhGiaTri('don_gian_hoa', { gio_dt_truoc: 8, gio_dt_sau: 2, nguoi_nam: 10 }, C);
    expect(r.gio_thang).toBe(5);
    expect(r.tien_thang).toBe(175_000);
  });

  it('cộng thêm phần thao tác hằng ngày nếu có (như quy_trinh)', () => {
    const r = tinhGiaTri('don_gian_hoa',
      { gio_dt_truoc: 8, gio_dt_sau: 2, nguoi_nam: 10, phut_ngay: 15, so_nguoi: 8 }, C);
    expect(r.gio_thang).toBe(57);           // 5 + 52
    expect(r.tien_thang).toBe(1_995_000);   // 175k + 1.82tr
  });
});

describe('tinhGiaTri — chưa đo được', () => {
  it('metrics.chua_do = true → 0 hết, diễn giải nói rõ chờ quản lý', () => {
    const r = tinhGiaTri('nang_suat', { chua_do: true, truoc: 12, sau: 9, sl_ngay: 120 }, C);
    expect(r.tien_nam).toBe(0);
    expect(r.dien_giai).toContain('Chưa đo');
  });

  it('loại không hợp lệ → 0, không ném lỗi', () => {
    const r = tinhGiaTri('khong_ton_tai', { phut_ngay: 15 }, C);
    expect(r.tien_nam).toBe(0);
  });
});

describe('chamDiem', () => {
  it('toàn 5 → 100 điểm, loại A', () => {
    const r = chamDiem({ gia_tri: 5, sang_tao: 5, nhan_rong: 5, no_luc: 5, bang_chung: 5 }, C);
    expect(r.tong_diem).toBe(100);
    expect(r.xep_loai).toBe('A');
  });

  it('4/4/5/3/5 → 84 điểm, loại A (case trong mockup ~86 làm tròn từ chấm khác)', () => {
    const r = chamDiem({ gia_tri: 4, sang_tao: 4, nhan_rong: 5, no_luc: 3, bang_chung: 5 }, C);
    expect(r.tong_diem).toBe(84);
    expect(r.xep_loai).toBe('A');
  });

  it('ngưỡng xếp loại: 60=B, 40=C, dưới 40=GHI_NHAN', () => {
    expect(chamDiem({ gia_tri: 3, sang_tao: 3, nhan_rong: 3, no_luc: 3, bang_chung: 3 }, C).xep_loai).toBe('B');
    expect(chamDiem({ gia_tri: 2, sang_tao: 2, nhan_rong: 2, no_luc: 2, bang_chung: 2 }, C).xep_loai).toBe('C');
    expect(chamDiem({ gia_tri: 1, sang_tao: 1, nhan_rong: 1, no_luc: 1, bang_chung: 1 }, C).xep_loai).toBe('GHI_NHAN');
  });

  it('thiếu tiêu chí → null (chưa chấm xong, không được duyệt)', () => {
    expect(chamDiem({ gia_tri: 5, sang_tao: 5 }, C)).toBeNull();
    expect(chamDiem(null, C)).toBeNull();
  });
});

describe('fmtTien', () => {
  it('quy đổi đọc nhanh tiếng Việt', () => {
    expect(fmtTien(65_520_000)).toBe('65,5 triệu');
    expect(fmtTien(1_250_000_000)).toBe('1,25 tỷ');
    expect(fmtTien(850_000)).toBe('850.000 đ');
    expect(fmtTien(0)).toBe('0 đ');
  });
});
