import { describe, it, expect } from 'vitest';
import {
  DANH_MUC_HO_TRO, laViecHoTro, hieuSuatCoDinh, thongTinViec,
  tinhHieuSuat, ghiChuHopLe,
} from './congViecHoTro';

const phieuHoTro = (product_code, cach = 'CO_DINH_100') => ({
  order_code: `VIEC-${product_code}`, product_code,
  loai_viec: 'HO_TRO', cach_tinh_hieu_suat: cach,
});
const phieuSanXuat = { order_code: 'PSX-20260723-12', product_code: 'WT-028S-RO', loai_viec: 'SAN_XUAT', cach_tinh_hieu_suat: 'DINH_MUC' };

describe('DANH_MUC_HO_TRO', () => {
  it('đủ 5 mã việc, đúng thứ tự hiển thị', () => {
    expect(DANH_MUC_HO_TRO.map(v => v.ma)).toEqual(['GH', 'NH', 'DK', 'DTNB', 'PS']);
  });

  it('nhãn đủ ngắn để nằm 1 dòng trên điện thoại', () => {
    // Luật giao diện của dự án: nhãn nút/thẻ tối đa 10 ký tự.
    for (const v of DANH_MUC_HO_TRO) expect(v.nhan.length).toBeLessThanOrEqual(10);
  });

  it('mã nào cũng có gợi ý ghi chú', () => {
    for (const v of DANH_MUC_HO_TRO) expect(v.goiY.length).toBeGreaterThan(0);
  });
});

describe('laViecHoTro', () => {
  it('nhận đúng phiếu hỗ trợ và phiếu sản xuất', () => {
    expect(laViecHoTro(phieuHoTro('NH'))).toBe(true);
    expect(laViecHoTro(phieuSanXuat)).toBe(false);
  });

  it('phiếu cũ chưa có cột loai_viec vẫn coi là sản xuất', () => {
    expect(laViecHoTro({ order_code: 'PSX-20260728-04' })).toBe(false);
    expect(laViecHoTro(null)).toBe(false);
  });
});

describe('hieuSuatCoDinh', () => {
  it('chỉ đúng với phiếu CO_DINH_100', () => {
    expect(hieuSuatCoDinh(phieuHoTro('NH'))).toBe(true);
    expect(hieuSuatCoDinh(phieuHoTro('GH', 'DINH_MUC'))).toBe(false);
    expect(hieuSuatCoDinh(phieuSanXuat)).toBe(false);
    expect(hieuSuatCoDinh(null)).toBe(false);
  });
});

describe('thongTinViec', () => {
  it('tra được nhãn và gợi ý theo mã', () => {
    expect(thongTinViec('DTNB')).toMatchObject({ ma: 'DTNB', nhan: 'Đào tạo' });
    expect(thongTinViec('NH').goiY).toMatch(/Nhập hàng gì/);
  });

  it('mã lạ trả null chứ không ném lỗi', () => {
    expect(thongTinViec('KHONG-CO')).toBeNull();
    expect(thongTinViec(undefined)).toBeNull();
  });
});

describe('tinhHieuSuat', () => {
  const dl = { soLuong: 20, soGio: 4, soNguoi: 2, dinhMucGioMotSP: 0.1667 };

  it('phiếu CO_DINH_100 luôn ra 100, bất kể số lượng và giờ', () => {
    expect(tinhHieuSuat(phieuHoTro('DK'), dl)).toBe(100);
    expect(tinhHieuSuat(phieuHoTro('DK'), { soLuong: 0, soGio: 8, soNguoi: 1, dinhMucGioMotSP: 0 })).toBe(100);
  });

  it('phiếu DINH_MUC tính theo đúng công thức cũ', () => {
    // (20/2 người) / 4 giờ * 0.1667 * 100 = 41.675 → làm tròn 42
    expect(tinhHieuSuat(phieuHoTro('GH', 'DINH_MUC'), dl)).toBe(42);
    expect(tinhHieuSuat(phieuSanXuat, dl)).toBe(42);
  });

  it('thiếu dữ liệu thì hiệu suất bằng 0, không ra NaN', () => {
    expect(tinhHieuSuat(phieuSanXuat, { soLuong: 0, soGio: 4, soNguoi: 2, dinhMucGioMotSP: 0.1667 })).toBe(0);
    expect(tinhHieuSuat(phieuSanXuat, { soLuong: 20, soGio: 0, soNguoi: 2, dinhMucGioMotSP: 0.1667 })).toBe(0);
    expect(tinhHieuSuat(phieuSanXuat, { soLuong: 20, soGio: 4, soNguoi: 0, dinhMucGioMotSP: 0.1667 })).toBe(0);
    expect(tinhHieuSuat(phieuSanXuat, { soLuong: 20, soGio: 4, soNguoi: 2, dinhMucGioMotSP: 0 })).toBe(0);
  });
});

describe('ghiChuHopLe', () => {
  it('việc hỗ trợ bắt buộc có ghi chú', () => {
    expect(ghiChuHopLe(phieuHoTro('PS'), 'Sửa băng chuyền số 2')).toBe(true);
    expect(ghiChuHopLe(phieuHoTro('PS'), '')).toBe(false);
    expect(ghiChuHopLe(phieuHoTro('PS'), '   ')).toBe(false);
    expect(ghiChuHopLe(phieuHoTro('PS'), null)).toBe(false);
  });

  it('phiếu sản xuất không bắt buộc ghi chú', () => {
    expect(ghiChuHopLe(phieuSanXuat, '')).toBe(true);
  });
});
