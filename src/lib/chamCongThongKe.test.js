import { describe, it, expect } from 'vitest';
import { nhanNhomGon, docNhomTuKpi, thongKeMotNguoi } from './chamCongThongKe';

describe('nhanNhomGon', () => {
  it('cắt phần trước dấu — để lấy tên nhóm ngắn', () => {
    expect(nhanNhomGon('CHUYÊN CẦN BỘ PHẬN — SẢN XUẤT')).toBe('SẢN XUẤT');
    expect(nhanNhomGon('CHUYÊN CẦN — TOÀN CÔNG TY')).toBe('TOÀN CÔNG TY');
  });

  it('không có dấu — thì giữ nguyên cả chuỗi (kỳ 2026-06 chỉ có một nhóm chung)', () => {
    expect(nhanNhomGon('CHUYÊN CẦN BỘ PHẬN')).toBe('CHUYÊN CẦN BỘ PHẬN');
  });

  it('rỗng / null → chuỗi rỗng, không ném lỗi', () => {
    expect(nhanNhomGon('')).toBe('');
    expect(nhanNhomGon(null)).toBe('');
    expect(nhanNhomGon(undefined)).toBe('');
  });
});

describe('docNhomTuKpi', () => {
  const caNhan = (nv, khoa) => ({
    ma: 'CHUYEN_CAN_BO_PHAN', cap_do: 'CA_NHAN',
    nhan_vien_id: nv, lien_ket_bo_phan: khoa, ten: 'CHUYÊN CẦN BỘ PHẬN',
  });
  const boPhan = (khoa, ten) => ({
    ma: 'CHUYEN_CAN_BO_PHAN', cap_do: 'BO_PHAN',
    nhan_vien_id: null, lien_ket_bo_phan: khoa, ten,
  });

  it('gom được người → khoá nhóm, và khoá nhóm → nhãn', () => {
    const { theoNguoi, nhan } = docNhomTuKpi([
      boPhan('CHUYEN_CAN_SX', 'CHUYÊN CẦN BỘ PHẬN — SẢN XUẤT'),
      caNhan('dvx', 'CHUYEN_CAN_SX'),
      caNhan('vta', 'CHUYEN_CAN_SX'),
      boPhan('CHUYEN_CAN_CSKH', 'CHUYÊN CẦN BỘ PHẬN — CSKH'),
      caNhan('hhx', 'CHUYEN_CAN_CSKH'),
    ]);
    expect(theoNguoi.get('dvx')).toBe('CHUYEN_CAN_SX');
    expect(theoNguoi.get('vta')).toBe('CHUYEN_CAN_SX');
    expect(theoNguoi.get('hhx')).toBe('CHUYEN_CAN_CSKH');
    expect(nhan.get('CHUYEN_CAN_SX')).toBe('SẢN XUẤT');
    expect(nhan.get('CHUYEN_CAN_CSKH')).toBe('CSKH');
  });

  it('bỏ qua dòng chỉ tiêu KHÁC — không phải chỉ tiêu nào cũng là nhóm chuyên cần', () => {
    const { theoNguoi } = docNhomTuKpi([
      { ma: 'HT_CONG_VIEC_DUNG_HAN', cap_do: 'CA_NHAN', nhan_vien_id: 'dvx', lien_ket_bo_phan: 'RAC' },
      caNhan('dvx', 'CHUYEN_CAN_SX'),
    ]);
    expect(theoNguoi.get('dvx')).toBe('CHUYEN_CAN_SX');
  });

  it('nhóm có người nhưng THIẾU dòng BO_PHAN → nhãn lấy chính khoá, không mất người', () => {
    const { theoNguoi, nhan } = docNhomTuKpi([caNhan('dvx', 'CHUYEN_CAN_SX')]);
    expect(theoNguoi.get('dvx')).toBe('CHUYEN_CAN_SX');
    expect(nhan.get('CHUYEN_CAN_SX')).toBeUndefined();
  });

  it('mảng rỗng / undefined → hai Map rỗng, không ném lỗi', () => {
    expect(docNhomTuKpi([]).theoNguoi.size).toBe(0);
    expect(docNhomTuKpi().nhan.size).toBe(0);
  });
});

describe('thongKeMotNguoi', () => {
  const d = (ngay, o = {}) => ({
    nhan_vien_id: 'a', ky: '2026-07', ngay,
    di_muon_phut: 0, ve_som_phut: 0, nghi: false, ...o,
  });
  const khongMien = () => false;

  it('nghỉ 4 ngày không ngày nào có dấu → 1 phép, 3 quá quy định (ca của Tuấn kỳ 7)', () => {
    const tk = thongKeMotNguoi([
      d('2026-07-01', { nghi: true }), d('2026-07-02', { nghi: true }),
      d('2026-07-03', { nghi: true }), d('2026-07-06', { nghi: true }),
    ], khongMien);
    expect(tk.tongNghi).toBe(4);
    expect(tk.nghiPhep).toBe(1);
    expect(tk.nghiQuaQuyDinh).toBe(3);
  });

  it('nghỉ 2 ngày, 1 ngày có dấu Đặc biệt → 2 phép, 0 quá quy định (ca của Xuyên kỳ 7)', () => {
    const tk = thongKeMotNguoi(
      [d('2026-07-18', { nghi: true }), d('2026-07-21', { nghi: true })],
      ngay => ngay === '2026-07-18');
    expect(tk.tongNghi).toBe(2);
    expect(tk.nghiPhep).toBe(2);
    expect(tk.nghiQuaQuyDinh).toBe(0);
    expect(tk.soNgayMien).toBe(1);
  });

  it('nghỉ đúng 1 ngày → vừa hết hạn mức, không quá quy định', () => {
    const tk = thongKeMotNguoi([d('2026-07-06', { nghi: true })], khongMien);
    expect(tk.nghiPhep).toBe(1);
    expect(tk.nghiQuaQuyDinh).toBe(0);
  });

  it('không nghỉ ngày nào → tất cả bằng 0', () => {
    const tk = thongKeMotNguoi([d('2026-07-01'), d('2026-07-02')], khongMien);
    expect(tk.tongNghi).toBe(0);
    expect(tk.nghiPhep).toBe(0);
    expect(tk.nghiQuaQuyDinh).toBe(0);
  });

  it('cộng phút đi muộn và về sớm', () => {
    const tk = thongKeMotNguoi([
      d('2026-07-01', { di_muon_phut: 20 }),
      d('2026-07-02', { di_muon_phut: 6, ve_som_phut: 15 }),
    ], khongMien);
    expect(tk.phutMuon).toBe(26);
    expect(tk.phutVeSom).toBe(15);
  });

  it('ngày có dấu Đặc biệt KHÔNG tính phút muộn (giống hệt cách KPI bỏ ngày miễn)', () => {
    const tk = thongKeMotNguoi([
      d('2026-07-20', { di_muon_phut: 1 }),
      d('2026-07-21', { di_muon_phut: 11 }),
    ], ngay => ngay === '2026-07-20');
    expect(tk.phutMuon).toBe(11);
    expect(tk.soNgayMien).toBe(1);
  });

  it('cột số là null/chuỗi từ DB vẫn cộng ra số, không ra NaN', () => {
    const tk = thongKeMotNguoi([
      { ngay: '2026-07-01', di_muon_phut: null, ve_som_phut: undefined, nghi: false },
      { ngay: '2026-07-02', di_muon_phut: '5', ve_som_phut: '3', nghi: false },
    ], khongMien);
    expect(tk.phutMuon).toBe(5);
    expect(tk.phutVeSom).toBe(3);
  });

  it('không có dòng nào → tất cả 0, không ném lỗi', () => {
    const tk = thongKeMotNguoi([], khongMien);
    expect(tk).toEqual({
      tongNghi: 0, nghiPhep: 0, nghiQuaQuyDinh: 0,
      phutMuon: 0, phutVeSom: 0, soNgayMien: 0,
    });
  });
});
