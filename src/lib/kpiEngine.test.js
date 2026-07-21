import { describe, it, expect } from 'vitest';
import { diemDat, tinhChiTieu } from './kpiEngine';

describe('diemDat', () => {
  it('không có nhật ký thì đạt tối đa', () => {
    expect(diemDat({ chi_tieu: 10 }, [])).toBe(10);
  });

  it('trừ dần theo nhật ký âm', () => {
    const logs = [{ so_diem: -1 }, { so_diem: -3 }, { so_diem: -3 }];
    expect(diemDat({ chi_tieu: 10 }, logs)).toBe(3);
  });

  it('sàn 0 — trừ quá chỉ tiêu không ra số âm', () => {
    expect(diemDat({ chi_tieu: 10 }, [{ so_diem: -15 }])).toBe(0);
  });

  it('trần chi_tieu — cộng vượt không quá chỉ tiêu', () => {
    expect(diemDat({ chi_tieu: 10 }, [{ so_diem: 5 }])).toBe(10);
  });

  it('diem_chot ghi đè hoàn toàn nhật ký', () => {
    expect(diemDat({ chi_tieu: 10, diem_chot: 3 }, [{ so_diem: -1 }])).toBe(3);
  });

  it('diem_chot = 0 vẫn được tôn trọng (không nhầm với null)', () => {
    expect(diemDat({ chi_tieu: 10, diem_chot: 0 }, [])).toBe(0);
  });
});

describe('tinhChiTieu', () => {
  it('quy đổi theo trọng số — ca thật của Bích T6/2026', () => {
    const r = tinhChiTieu({ chi_tieu: 10, trong_so: 7, diem_chot: 3 }, []);
    expect(r.diemDat).toBe(3);
    expect(r.tiLeDat).toBeCloseTo(0.3);
    expect(r.diemQuyDoi).toBeCloseTo(2.1);
    expect(r.diemMat).toBeCloseTo(4.9);
  });

  it('trần 100% — điểm đạt vượt chỉ tiêu vẫn chỉ tính 100%', () => {
    const r = tinhChiTieu({ chi_tieu: 10, trong_so: 5, diem_chot: 20 }, []);
    expect(r.tiLeDat).toBe(1);
    expect(r.diemQuyDoi).toBe(5);
    expect(r.diemMat).toBe(0);
  });

  it('dòng thưởng ngoài trọng số (chi_tieu null) cộng thẳng, không mất điểm', () => {
    const r = tinhChiTieu({ chi_tieu: null, trong_so: 0 }, [{ so_diem: 1.5 }]);
    expect(r.tiLeDat).toBeNull();
    expect(r.diemQuyDoi).toBeCloseTo(1.5);
    expect(r.diemMat).toBe(0);
  });

  it('chỉ tiêu bộ phận: một điểm đạt, hai trọng số → hai quy đổi khác nhau', () => {
    const bpMap = { CHUYEN_CAN_KHO: 0 }; // điểm đạt chung = 0/10
    const nguyen = tinhChiTieu(
      { chi_tieu: 10, trong_so: 5, lien_ket_bo_phan: 'CHUYEN_CAN_KHO' }, [], bpMap);
    const duong = tinhChiTieu(
      { chi_tieu: 10, trong_so: 9, lien_ket_bo_phan: 'CHUYEN_CAN_KHO' }, [], bpMap);
    expect(nguyen.diemMat).toBe(5);
    expect(duong.diemMat).toBe(9);
  });

  it('chỉ tiêu bộ phận bỏ qua nhật ký riêng của dòng cá nhân', () => {
    const r = tinhChiTieu(
      { chi_tieu: 10, trong_so: 5, lien_ket_bo_phan: 'X' },
      [{ so_diem: -10 }],            // nhật ký này KHÔNG được tính
      { X: 8 });
    expect(r.diemDat).toBe(8);
  });
});
