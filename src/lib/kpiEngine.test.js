import { describe, it, expect } from 'vitest';
import {
  diemDat, tinhChiTieu, tinhBangKpi, kiemTraTrongSo, giaiThich,
} from './kpiEngine';

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

  it('diem_chot vượt chỉ tiêu bị kẹp về trần — điểm đạt > chỉ tiêu là vô nghĩa', () => {
    expect(diemDat({ chi_tieu: 10, diem_chot: 20 }, [])).toBe(10);
  });

  it('diem_chot âm bị kẹp về sàn 0', () => {
    expect(diemDat({ chi_tieu: 10, diem_chot: -5 }, [])).toBe(0);
  });

  it('dòng thưởng (chi_tieu rỗng) không có trần nên diem_chot giữ nguyên', () => {
    expect(diemDat({ chi_tieu: null, diem_chot: 2 }, [])).toBe(2);
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

  it('chi_tieu undefined cũng là dòng thưởng như chi_tieu null', () => {
    const r = tinhChiTieu({ trong_so: 0 }, [{ so_diem: 2 }]);
    expect(r.laThuong).toBe(true);
    expect(r.tiLeDat).toBeNull();
    expect(r.diemQuyDoi).toBeCloseTo(2);
  });

  it('chi_tieu = 0 là lỗi nhập, KHÔNG phải dòng thưởng → mất trọn trọng số', () => {
    const r = tinhChiTieu({ chi_tieu: 0, trong_so: 6 }, [{ so_diem: 5 }]);
    expect(r.laThuong).toBe(false);
    expect(r.tiLeDat).toBe(0);
    expect(r.diemQuyDoi).toBe(0);
    expect(r.diemMat).toBe(6);
  });
});

// Bảng thật của Lê Văn Bích, kỳ 2026-06, rút gọn còn các dòng có mất điểm
// + 1 dòng gộp đại diện 8 chỉ tiêu đạt đủ (tổng trọng số 84).
function bangBich() {
  const rows = [
    { id: 'bp1', cap_do: 'BO_PHAN', lien_ket_bo_phan: 'CHUYEN_CAN_KHO',
      ten: 'CHUYÊN CẦN BỘ PHẬN', chi_tieu: 10, trong_so: 0, diem_chot: 0 },
    { id: 'c1', cap_do: 'CA_NHAN', lien_ket_bo_phan: 'CHUYEN_CAN_KHO',
      ten: 'CHUYÊN CẦN BỘ PHẬN', chi_tieu: 10, trong_so: 5, nhom: 'A' },
    { id: 'c2', cap_do: 'CA_NHAN', ten: 'CHUYÊN CẦN CÁ NHÂN',
      chi_tieu: 10, trong_so: 7, diem_chot: 3, nhom: 'A' },
    { id: 'c3', cap_do: 'CA_NHAN', ten: 'ĐÓNG GÓP CẢI TIẾN',
      chi_tieu: 2, trong_so: 4, diem_chot: 0, nhom: 'C' },
    { id: 'c4', cap_do: 'CA_NHAN', ten: 'CÁC CHỈ TIÊU ĐẠT ĐỦ',
      chi_tieu: 10, trong_so: 84, diem_chot: 10, nhom: 'B' },
  ];
  return rows;
}

describe('tinhBangKpi', () => {
  it('tổng điểm Bích T6/2026 = 86.1 (đối chiếu Excel thật)', () => {
    const r = tinhBangKpi(bangBich(), []);
    expect(r.tongKpi).toBeCloseTo(86.1);
    expect(r.tongMat).toBeCloseTo(13.9);
  });

  it('dòng BO_PHAN không nằm trong danh sách hiển thị của cá nhân', () => {
    const r = tinhBangKpi(bangBich(), []);
    expect(r.dong.map(d => d.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('danhSachMatDiem xếp giảm dần theo điểm mất', () => {
    const r = tinhBangKpi(bangBich(), []);
    expect(r.danhSachMatDiem.map(d => d.id)).toEqual(['c1', 'c2', 'c3']);
    expect(r.danhSachMatDiem[0].diemMat).toBe(5);
  });

  it('nhật ký được gom đúng về từng chỉ tiêu', () => {
    const rows = [{ id: 'c1', cap_do: 'CA_NHAN', ten: 'X', chi_tieu: 10, trong_so: 100 }];
    const logs = [{ chi_tieu_id: 'c1', so_diem: -4, ly_do: 'Đi muộn' }];
    const r = tinhBangKpi(rows, logs);
    expect(r.tongKpi).toBeCloseTo(60);
    expect(r.dong[0].logs).toHaveLength(1);
  });

  it('dòng liên kết bộ phận trả __bpId để ghi nhật ký đúng chỗ chung', () => {
    const r = tinhBangKpi(bangBich(), []);
    expect(r.dong.find(d => d.id === 'c1').__bpId).toBe('bp1');
    expect(r.dong.find(d => d.id === 'c2').__bpId).toBeUndefined();
  });

  it('dòng thưởng đẩy tổng vượt 100', () => {
    const rows = [
      { id: 'a', cap_do: 'CA_NHAN', ten: 'X', chi_tieu: 10, trong_so: 100, diem_chot: 10 },
      { id: 'b', cap_do: 'CA_NHAN', ten: 'THƯỞNG', chi_tieu: null, trong_so: 0 },
    ];
    const r = tinhBangKpi(rows, [{ chi_tieu_id: 'b', so_diem: 2 }]);
    expect(r.tongKpi).toBeCloseTo(102);
  });
});

describe('kiemTraTrongSo', () => {
  it('Σ trọng số = 100 thì không cảnh báo', () => {
    expect(kiemTraTrongSo(bangBich()).hopLe).toBe(true);
  });

  it('Σ trọng số ≠ 100 thì cảnh báo kèm độ lệch', () => {
    const r = kiemTraTrongSo([{ cap_do: 'CA_NHAN', chi_tieu: 10, trong_so: 90 }]);
    expect(r.hopLe).toBe(false);
    expect(r.tong).toBe(90);
    expect(r.lech).toBe(-10);
  });

  it('bỏ qua dòng BO_PHAN và dòng thưởng khi cộng trọng số', () => {
    const r = kiemTraTrongSo([
      { cap_do: 'BO_PHAN', lien_ket_bo_phan: 'X', chi_tieu: 10, trong_so: 999 },
      { cap_do: 'CA_NHAN', chi_tieu: null, trong_so: 999 },
      { cap_do: 'CA_NHAN', chi_tieu: 10, trong_so: 100 },
    ]);
    expect(r.tong).toBe(100);
    expect(r.hopLe).toBe(true);
  });

  it('dòng chi_tieu = 0 vẫn được cộng trọng số để lỗi nhập lộ ra', () => {
    const r = kiemTraTrongSo([
      { cap_do: 'CA_NHAN', chi_tieu: 0, trong_so: 10 },
      { cap_do: 'CA_NHAN', chi_tieu: 10, trong_so: 80 },
    ]);
    expect(r.tong).toBe(90);
    expect(r.lech).toBe(-10);
    expect(r.hopLe).toBe(false);
  });
});

describe('giaiThich', () => {
  const ct = {
    id: 'c2', ten: 'CHUYÊN CẦN CÁ NHÂN', chi_tieu: 10, trong_so: 7,
    diem_chot: 3, chot_boi: 'Nguyên', chot_luc: '2026-06-30T10:00:00Z',
  };
  const logs = [
    { ngay: '2026-06-17', so_diem: -1, ly_do: 'Đi muộn', nguoi_ghi: 'Nguyên' },
    { ngay: '2026-06-27', so_diem: -3, ly_do: 'Quên chấm công', nguoi_ghi: 'Nguyên' },
  ];

  it('trả đủ các bước tính', () => {
    const g = giaiThich(ct, logs);
    expect(g.buoc.map(b => b.nhan)).toEqual(['Điểm đạt', 'Tỉ lệ đạt', 'Điểm quy đổi']);
    expect(g.buoc[2].ketQua).toBeCloseTo(2.1);
  });

  it('nêu rõ điểm do quản lý chốt tay, kèm ai chốt', () => {
    const g = giaiThich(ct, logs);
    expect(g.buoc[0].nguon).toBe('CHOT_TAY');
    expect(g.buoc[0].dienGiai).toContain('Nguyên');
  });

  it('khi không chốt tay thì diễn giải phép trừ từ nhật ký', () => {
    const g = giaiThich({ ...ct, diem_chot: null, chot_boi: null }, logs);
    expect(g.buoc[0].nguon).toBe('NHAT_KY');
    expect(g.buoc[0].dienGiai).toBe('10 − 4 = 6');
  });

  it('trả kèm nhật ký làm bằng chứng', () => {
    expect(giaiThich(ct, logs).nhatKy).toHaveLength(2);
  });

  it('dòng thưởng diễn giải bằng phép cộng, không có tỉ lệ', () => {
    const g = giaiThich({ ten: 'THƯỞNG', chi_tieu: null, trong_so: 0 },
      [{ ngay: '2026-06-30', so_diem: 1.5, ly_do: 'Ý tưởng tốt' }]);
    expect(g.buoc.map(b => b.nhan)).toEqual(['Điểm cộng thêm']);
    expect(g.buoc[0].ketQua).toBeCloseTo(1.5);
  });
});
