import { describe, it, expect } from 'vitest';
import { viecTrongThang, LUAT_TU_DONG, apDungChamTuDong, NGUON_TU_DONG } from './kpiTuDong';

// Việc mẫu: mặc định tạo tháng 7/2026, giao cho 'a', đã xong đúng hạn.
const viec = (o = {}) => ({
  id: 'CV-1', title: 'Việc gì đó', status: 'COMPLETED',
  created_date: '2026-07-05T03:00:00Z',
  due_date: '2026-07-10T10:00:00Z', completed_date: '2026-07-09T10:00:00Z',
  assignee_ids: ['a'], ...o,
});

describe('viecTrongThang', () => {
  it('lấy việc tạo trong đúng tháng của kỳ', () => {
    const ds = [viec(), viec({ id: 'CV-2', created_date: '2026-06-20T03:00:00Z' })];
    expect(viecTrongThang(ds, 'a', '2026-07').map(t => t.id)).toEqual(['CV-1']);
  });

  it('bỏ việc đã huỷ — không phải lỗi của người làm', () => {
    expect(viecTrongThang([viec({ status: 'CANCELLED' })], 'a', '2026-07')).toHaveLength(0);
  });

  it('việc giao nhóm tính cho MỌI thành viên', () => {
    const ds = [viec({ assignee_ids: ['a', 'b', 'c'] })];
    expect(viecTrongThang(ds, 'b', '2026-07')).toHaveLength(1);
    expect(viecTrongThang(ds, 'c', '2026-07')).toHaveLength(1);
  });

  it('người ngoài nhóm thì không tính', () => {
    expect(viecTrongThang([viec()], 'z', '2026-07')).toHaveLength(0);
  });

  it('dòng cũ chưa migrate assignee_ids vẫn đọc được qua assignee_id', () => {
    const ds = [viec({ assignee_ids: null, assignee_id: 'a' })];
    expect(viecTrongThang(ds, 'a', '2026-07')).toHaveLength(1);
  });

  it('kỳ hỏng hoặc thiếu thì trả rỗng, không nổ', () => {
    expect(viecTrongThang([viec()], 'a', '')).toEqual([]);
    expect(viecTrongThang()).toEqual([]);
  });
});

describe('luật HT_CONG_VIEC_DUNG_HAN', () => {
  const luat = LUAT_TU_DONG.HT_CONG_VIEC_DUNG_HAN;

  it('7/9 đúng hạn ra tỉ lệ 7/9', () => {
    const ds = [
      ...Array.from({ length: 7 }, (_, i) => viec({ id: `O-${i}` })),
      viec({ id: 'T-1', title: 'Gửi báo cáo tuần 3', completed_date: '2026-07-11T10:00:00Z' }),
      viec({ id: 'T-2', title: 'Kiểm kê kho', status: 'IN_PROGRESS', completed_date: null }),
    ];
    const kq = luat({ chi_tieu: 10 }, ds);
    expect(kq.tiLe).toBeCloseTo(7 / 9);
    expect(kq.ghiChu).toContain('7/9');
    expect(kq.ghiChu).toContain('Gửi báo cáo tuần 3');
    expect(kq.ghiChu).toContain('Kiểm kê kho');
  });

  it('việc chưa hoàn thành nằm ở mẫu số, không ở tử số', () => {
    const kq = luat({ chi_tieu: 10 }, [viec({ status: 'IN_PROGRESS', completed_date: null })]);
    expect(kq.tiLe).toBe(0);
  });

  it('không có việc nào thì đủ điểm, ghi chú nói rõ', () => {
    const kq = luat({ chi_tieu: 10 }, []);
    expect(kq.tiLe).toBe(1);
    expect(kq.ghiChu).toContain('không có việc nào');
  });

  it('trễ nhiều hơn 5 việc thì cắt tên, ghi số việc còn lại', () => {
    const tre = Array.from({ length: 8 }, (_, i) =>
      viec({ id: `T-${i}`, title: `Việc trễ ${i}`, completed_date: '2026-07-20T10:00:00Z' }));
    const kq = luat({ chi_tieu: 10 }, tre);
    expect(kq.ghiChu).toContain('3 việc nữa');
    expect(kq.ghiChu).not.toContain('Việc trễ 5');
  });
});

describe('luật VIDEO_KY_THUAT', () => {
  const luat = LUAT_TU_DONG.VIDEO_KY_THUAT;
  const video = (o = {}) => viec({ title: 'Quay video kỹ thuật', ...o });

  it('xong đúng hạn thì đủ điểm', () => {
    expect(luat({ chi_tieu: 6 }, [video()]).tiLe).toBe(1);
  });

  it('xong nhưng trễ thì 50%', () => {
    const kq = luat({ chi_tieu: 6 }, [video({ completed_date: '2026-07-20T10:00:00Z' })]);
    expect(kq.tiLe).toBe(0.5);
    expect(kq.ghiChu).toContain('trễ');
  });

  it('chưa hoàn thành thì 0 điểm', () => {
    expect(luat({ chi_tieu: 6 }, [video({ status: 'IN_PROGRESS', completed_date: null })]).tiLe).toBe(0);
  });

  it('tên gõ khác dấu (KĨ/KỸ) vẫn khớp', () => {
    expect(luat({ chi_tieu: 6 }, [video({ title: 'QUAY VIDEO KĨ THUẬT tháng 7' })]).tiLe).toBe(1);
  });

  it('việc khác trong tháng không bị nhận nhầm là việc quay video', () => {
    const kq = luat({ chi_tieu: 6 }, [viec({ title: 'Dọn kho' })]);
    expect(kq.tiLe).toBeNull();
  });

  it('chưa tạo việc quay video thì KHÔNG chấm, chỉ ghi chú', () => {
    const kq = luat({ chi_tieu: 6 }, []);
    expect(kq.tiLe).toBeNull();
    expect(kq.ghiChu).toContain('Chưa tạo việc quay video');
  });

  it('hai việc khớp, một đúng hạn một trễ → trung bình 75%', () => {
    const kq = luat({ chi_tieu: 6 }, [video(), video({ id: 'CV-2', completed_date: '2026-07-20T10:00:00Z' })]);
    expect(kq.tiLe).toBe(0.75);
  });
});

describe('apDungChamTuDong', () => {
  const dong = (o = {}) => ({
    id: 'ct-1', cap_do: 'CA_NHAN', nhan_vien_id: 'a',
    ma: 'HT_CONG_VIEC_DUNG_HAN', ten: 'HOÀN THÀNH CÔNG VIỆC ĐÚNG THỜI HẠN',
    chi_tieu: 10, trong_so: 10, ...o,
  });
  const NGAY = '2026-07-23';

  it('gán diem_chot theo tỉ lệ luật tính ra', () => {
    const ds = [viec(), viec({ id: 'CV-2', completed_date: '2026-07-20T10:00:00Z' })];
    const kq = apDungChamTuDong([dong()], [], ds, '2026-07', NGAY);
    expect(kq.rows[0].diem_chot).toBe(5);   // 1/2 đúng hạn × chỉ tiêu 10
  });

  it('kèm một dòng nhật ký ảo chở lời giải thích', () => {
    const kq = apDungChamTuDong([dong()], [], [viec()], '2026-07', NGAY);
    const ao = kq.logs.find(l => l.chi_tieu_id === 'ct-1');
    expect(ao.so_diem).toBe(0);
    expect(ao.nguon).toBe(NGUON_TU_DONG);
    expect(ao.ngay).toBe(NGAY);
    expect(ao.ly_do).toContain('Tự động');
  });

  it('luật trả tiLe null thì KHÔNG gán diem_chot, nhưng vẫn có ghi chú', () => {
    const r = dong({ id: 'ct-2', ma: 'VIDEO_KY_THUAT', chi_tieu: 6 });
    const kq = apDungChamTuDong([r], [], [], '2026-07', NGAY);
    expect(kq.rows[0].diem_chot).toBeUndefined();
    expect(kq.logs.find(l => l.chi_tieu_id === 'ct-2').ly_do).toContain('Chưa tạo việc');
  });

  it('chỉ tiêu không có luật thì giữ nguyên, không mọc dòng ảo', () => {
    const r = dong({ id: 'ct-3', ma: '5S' });
    const kq = apDungChamTuDong([r], [], [viec()], '2026-07', NGAY);
    expect(kq.rows[0]).toEqual(r);
    expect(kq.logs).toHaveLength(0);
  });

  it('nhật ký thật vẫn còn nguyên bên cạnh dòng ảo', () => {
    const that = { id: 'nk-1', chi_tieu_id: 'ct-1', so_diem: -2, ly_do: 'trừ tay', nguon: 'TAY' };
    const kq = apDungChamTuDong([dong()], [that], [viec()], '2026-07', NGAY);
    expect(kq.logs.filter(l => l.chi_tieu_id === 'ct-1')).toHaveLength(2);
    expect(kq.logs).toContain(that);
  });

  it('KHÔNG sửa mảng gốc — dữ liệu vừa tải về phải nguyên vẹn', () => {
    const r = dong();
    const rows = [r];
    const logs = [];
    apDungChamTuDong(rows, logs, [viec({ completed_date: '2026-07-20T10:00:00Z' })], '2026-07', NGAY);
    expect(r.diem_chot).toBeUndefined();
    expect(rows).toHaveLength(1);
    expect(logs).toHaveLength(0);
  });

  it('dòng BO_PHAN không bị luật đụng vào', () => {
    const r = { id: 'bp-1', cap_do: 'BO_PHAN', nhan_vien_id: null, ma: 'HT_CONG_VIEC_DUNG_HAN', chi_tieu: 10 };
    const kq = apDungChamTuDong([r], [], [viec()], '2026-07', NGAY);
    expect(kq.rows[0]).toEqual(r);
    expect(kq.logs).toHaveLength(0);
  });
});

describe('luật BC_KET_QUA_CONG_VIEC (báo cáo cuối ngày)', () => {
  const luat = LUAT_TU_DONG.BC_KET_QUA_CONG_VIEC;
  const bc = (o = {}) => viec({ title: 'Báo cáo công việc cuối ngày', ...o });

  it('tính theo tỉ lệ HOÀN THÀNH, không theo đúng hạn', () => {
    // 3 việc: 1 xong đúng hạn, 1 xong nhưng trễ, 1 chưa xong → 2/3 chứ không phải 1/3.
    const kq = luat({ chi_tieu: 10 }, [
      bc(),
      bc({ id: 'CV-2', due_date: '2026-07-10T10:00:00Z', completed_date: '2026-07-15T10:00:00Z' }),
      bc({ id: 'CV-3', status: 'IN_PROGRESS', completed_date: null }),
    ]);
    expect(kq.tiLe).toBeCloseTo(2 / 3);
  });

  it('ghi chú liệt kê NGÀY chưa báo cáo, không liệt kê tên việc trùng nhau', () => {
    const kq = luat({ chi_tieu: 10 }, [
      bc(),
      bc({ id: 'CV-2', status: 'IN_PROGRESS', completed_date: null, due_date: '2026-07-05T10:00:00Z' }),
    ]);
    expect(kq.ghiChu).toContain('1/2');
    expect(kq.ghiChu).toContain('05/07');
    expect(kq.ghiChu).not.toContain('Báo cáo công việc cuối ngày');
  });

  it('khớp cả tên có thêm chữ "kết quả"', () => {
    const kq = luat({ chi_tieu: 10 }, [bc({ title: 'Báo cáo kết quả công việc cuối ngày 05/07' })]);
    expect(kq.tiLe).toBe(1);
  });

  it('việc khác trong tháng không bị nhận nhầm', () => {
    expect(luat({ chi_tieu: 10 }, [viec({ title: 'Dọn kho cuối ngày' })]).tiLe).toBeNull();
  });

  it('chưa có việc báo cáo nào thì KHÔNG chấm, chỉ ghi chú', () => {
    const kq = luat({ chi_tieu: 10 }, []);
    expect(kq.tiLe).toBeNull();
    expect(kq.ghiChu).toContain('Chưa có việc báo cáo cuối ngày');
  });

  it('thiếu quá 5 ngày thì cắt bớt, ghi số ngày còn lại', () => {
    const ds = Array.from({ length: 8 }, (_, i) => bc({
      id: `CV-${i}`, status: 'IN_PROGRESS', completed_date: null,
      due_date: `2026-07-1${i}T10:00:00Z`,
    }));
    expect(luat({ chi_tieu: 10 }, ds).ghiChu).toContain('3 ngày nữa');
  });

  it('làm đủ mọi ngày thì không có phần "Chưa làm"', () => {
    const kq = luat({ chi_tieu: 10 }, [bc(), bc({ id: 'CV-2' })]);
    expect(kq.tiLe).toBe(1);
    expect(kq.ghiChu).not.toContain('Chưa làm');
  });
});
