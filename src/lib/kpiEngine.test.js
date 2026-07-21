import { describe, it, expect } from 'vitest';
import { diemDat } from './kpiEngine';

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
