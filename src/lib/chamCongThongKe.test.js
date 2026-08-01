import { describe, it, expect } from 'vitest';
import { nhanNhomGon, docNhomTuKpi } from './chamCongThongKe';

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
