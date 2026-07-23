import { describe, it, expect } from 'vitest';
import { viecTrongThang, sanXuatTrongThang, LUAT_TU_DONG, apDungChamTuDong, NGUON_TU_DONG } from './kpiTuDong';

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

describe('HT_CONG_VIEC_DUNG_HAN loại việc báo cáo cuối ngày', () => {
  const luat = LUAT_TU_DONG.HT_CONG_VIEC_DUNG_HAN;
  const bc = (o = {}) => viec({ title: 'Báo cáo công việc cuối ngày', ...o });

  it('báo cáo cuối ngày không lọt vào mẫu số — nếu không là tính điểm hai lần', () => {
    // 1 việc thường trễ + 3 báo cáo đúng hạn. Không loại thì ra 3/4 (75%), loại thì 0/1 (0%).
    const kq = luat({ chi_tieu: 10 }, [
      viec({ id: 'X', title: 'Sửa máy', completed_date: '2026-07-20T10:00:00Z' }),
      bc({ id: 'B1' }), bc({ id: 'B2' }), bc({ id: 'B3' }),
    ]);
    expect(kq.tiLe).toBe(0);
    expect(kq.ghiChu).toContain('0/1');
  });

  it('ghi chú nói rõ đã bỏ bao nhiêu báo cáo, để đối chiếu với tab Công việc không thấy hụt số', () => {
    const kq = luat({ chi_tieu: 10 }, [viec({ id: 'X' }), bc({ id: 'B1' }), bc({ id: 'B2' })]);
    expect(kq.ghiChu).toContain('không tính 2 báo cáo cuối ngày');
  });

  it('không có báo cáo nào thì ghi chú không nhắc tới chuyện loại trừ', () => {
    expect(luat({ chi_tieu: 10 }, [viec()]).ghiChu).not.toContain('không tính');
  });

  it('cả tháng chỉ có báo cáo cuối ngày → đủ điểm, ghi chú nói rõ vì sao trống', () => {
    const kq = luat({ chi_tieu: 10 }, [bc({ id: 'B1' }), bc({ id: 'B2' })]);
    expect(kq.tiLe).toBe(1);
    expect(kq.ghiChu).toContain('không tính báo cáo cuối ngày');
  });

  it('tên việc trễ liệt kê ra không còn lẫn báo cáo cuối ngày', () => {
    const kq = luat({ chi_tieu: 10 }, [
      viec({ id: 'X', title: 'Sửa máy', completed_date: '2026-07-20T10:00:00Z' }),
      bc({ id: 'B1', status: 'IN_PROGRESS', completed_date: null }),
    ]);
    expect(kq.ghiChu).toContain('Sửa máy');
    expect(kq.ghiChu).not.toContain('Báo cáo công việc cuối ngày');
  });
});

describe('sanXuatTrongThang', () => {
  const log = (o = {}) => ({ worker_id: 'a', performance_rate: 100, execution_date: '2026-07-05', ...o });

  it('lấy bản ghi của đúng người trong đúng tháng', () => {
    const ds = [log(), log({ execution_date: '2026-06-30' }), log({ worker_id: 'b' })];
    expect(sanXuatTrongThang(ds, 'a', '2026-07')).toHaveLength(1);
  });

  it('kỳ thiếu hoặc danh sách rỗng thì trả rỗng, không nổ', () => {
    expect(sanXuatTrongThang([log()], 'a', '')).toEqual([]);
    expect(sanXuatTrongThang()).toEqual([]);
  });
});

describe('luật SAN_XUAT (hiệu suất sản xuất)', () => {
  const luat = LUAT_TU_DONG.SAN_XUAT;
  const log = (r) => ({ worker_id: 'a', performance_rate: r, execution_date: '2026-07-05' });

  it('điểm theo hiệu suất trung bình cộng, không gia quyền theo sản lượng', () => {
    // 90 và 70 → trung bình 80% → 0.8, dù sản lượng hai lần có khác nhau.
    const kq = luat({ chi_tieu: 40 }, [], [log(90), log(70)]);
    expect(kq.tiLe).toBeCloseTo(0.8);
    expect(kq.ghiChu).toContain('80%');
    expect(kq.ghiChu).toContain('2 lần chấm');
  });

  it('vượt 100% chỉ tính tối đa, và ghi chú nói rõ', () => {
    const kq = luat({ chi_tieu: 40 }, [], [log(120), log(110)]);
    expect(kq.tiLe).toBe(1);
    expect(kq.ghiChu).toContain('115%');
    expect(kq.ghiChu).toContain('vượt 100%');
  });

  it('hiệu suất 0 thì 0 điểm chứ không phải bỏ qua', () => {
    expect(luat({ chi_tieu: 40 }, [], [log(0)]).tiLe).toBe(0);
  });

  it('chưa có bản ghi sản xuất nào thì KHÔNG chấm, chỉ ghi chú', () => {
    const kq = luat({ chi_tieu: 40 }, [], []);
    expect(kq.tiLe).toBeNull();
    expect(kq.ghiChu).toContain('Chưa có bản ghi sản xuất');
  });

  it('luật này không đụng tới danh sách công việc', () => {
    const kq = luat({ chi_tieu: 40 }, [viec(), viec({ id: 'CV-2' })], [log(50)]);
    expect(kq.tiLe).toBe(0.5);
  });
});

describe('apDungChamTuDong truyền dữ liệu sản xuất', () => {
  it('gán diem_chot cho chỉ tiêu SAN_XUAT theo hiệu suất của đúng người', () => {
    const rows = [
      { id: 'ct-a', cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'SAN_XUAT', chi_tieu: 40 },
      { id: 'ct-b', cap_do: 'CA_NHAN', nhan_vien_id: 'b', ma: 'SAN_XUAT', chi_tieu: 40 },
    ];
    const sx = [
      { worker_id: 'a', performance_rate: 50, execution_date: '2026-07-05' },
      { worker_id: 'b', performance_rate: 100, execution_date: '2026-07-05' },
    ];
    const kq = apDungChamTuDong(rows, [], [], '2026-07', '2026-07-23', sx);
    expect(kq.rows[0].diem_chot).toBe(20);
    expect(kq.rows[1].diem_chot).toBe(40);
  });

  it('không truyền dữ liệu sản xuất thì chỉ tiêu đó không bị chấm 0 oan', () => {
    const rows = [{ id: 'ct-a', cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'SAN_XUAT', chi_tieu: 40 }];
    const kq = apDungChamTuDong(rows, [], [], '2026-07', '2026-07-23');
    expect(kq.rows[0].diem_chot).toBeUndefined();
  });
});

describe('luật CHUYEN_CAN_BO_PHAN (trung bình đầu người)', () => {
  const luat = LUAT_TU_DONG.CHUYEN_CAN_BO_PHAN;
  const cc = (id, o = {}) => ({ nhan_vien_id: id, ky: '2026-07', di_muon_phut: 0, ve_som_phut: 0, nghi: false, ...o });

  it('trung bình dưới 30 phút thì không trừ', () => {
    // 2 người, tổng 40 phút → trung bình 20.
    const kq = luat({ chi_tieu: 10 }, [], [], [cc('a', { di_muon_phut: 40 })], ['a', 'b']);
    expect(kq.tiLe).toBe(1);
  });

  it('CHIA cho số người chứ không lấy tổng — nhóm đông không bị phạt vì đông', () => {
    // Tổng 206 phút: nhóm 7 người → TB 29 → không trừ; nhóm 2 người → TB 103 → trừ 10.
    const ds = [cc('a', { di_muon_phut: 206 })];
    expect(luat({ chi_tieu: 10 }, [], [], ds, ['a', 'b', 'c', 'd', 'e', 'f', 'g']).tiLe).toBe(1);
    expect(luat({ chi_tieu: 10 }, [], [], ds, ['a', 'b']).tiLe).toBe(0);
  });

  it('cộng cả về sớm vào số phút, không chỉ đi muộn', () => {
    const kq = luat({ chi_tieu: 10 }, [], [], [cc('a', { di_muon_phut: 30, ve_som_phut: 40 })], ['a']);
    expect(kq.tiLe).toBe(0.7);   // TB 70 phút → trừ 3
  });

  it('ba bậc ngưỡng phút: 30-60 trừ 1, 61-90 trừ 3, từ 91 trừ 10', () => {
    const diem = p => luat({ chi_tieu: 10 }, [], [], [cc('a', { di_muon_phut: p })], ['a']).tiLe * 10;
    expect(diem(29)).toBe(10);
    expect(diem(30)).toBe(9);
    expect(diem(61)).toBe(7);
    expect(diem(91)).toBe(0);
  });

  it('nghỉ vượt phép trừ thêm, tính trên số ngày nghỉ trung bình', () => {
    // 1 người, 5 ngày nghỉ, phép 1 ngày → vượt 4 → trừ 10.
    const ds = Array.from({ length: 5 }, (_, i) => cc('a', { nghi: true, ngay: `2026-07-0${i + 1}` }));
    expect(luat({ chi_tieu: 10 }, [], [], ds, ['a']).tiLe).toBe(0);
  });

  it('ghi chú nói rõ cả số trung bình lẫn số tổng của nhóm', () => {
    const kq = luat({ chi_tieu: 10 }, [], [], [cc('a', { di_muon_phut: 60 })], ['a', 'b']);
    expect(kq.ghiChu).toContain('2 người');
    expect(kq.ghiChu).toContain('30 phút');
    expect(kq.ghiChu).toContain('60 phút');
  });

  it('chưa có chấm công thì KHÔNG chấm, không chấm 0', () => {
    expect(luat({ chi_tieu: 10 }, [], [], [], ['a']).tiLe).toBeNull();
  });

  it('nhóm không có thành viên nào thì KHÔNG chấm — chia cho 0 sẽ ra Infinity', () => {
    expect(luat({ chi_tieu: 10 }, [], [], [cc('a', { di_muon_phut: 60 })], []).tiLe).toBeNull();
  });
});

describe('luật CHUYEN_CAN_CA_NHAN', () => {
  const luat = LUAT_TU_DONG.CHUYEN_CAN_CA_NHAN;
  const cc = (o = {}) => ({ nhan_vien_id: 'a', ky: '2026-07', di_muon_phut: 0, nghi: false, ...o });

  it('muộn quá 15 phút trừ 5 mỗi lần', () => {
    expect(luat({ chi_tieu: 10 }, [], [], [cc({ di_muon_phut: 20 })]).tiLe).toBe(0.5);
  });

  it('muộn 6–15 phút trừ 1 mỗi lần', () => {
    expect(luat({ chi_tieu: 10 }, [], [], [cc({ di_muon_phut: 10 })]).tiLe).toBe(0.9);
  });

  it('muộn từ 5 phút trở xuống không trừ', () => {
    expect(luat({ chi_tieu: 10 }, [], [], [cc({ di_muon_phut: 5 })]).tiLe).toBe(1);
  });

  it('hai bậc KHÔNG cộng chồng — muộn 20 phút trừ 5, không phải 6', () => {
    const kq = luat({ chi_tieu: 10 }, [], [], [cc({ di_muon_phut: 20 })]);
    expect(kq.tiLe).toBe(0.5);
    expect(kq.ghiChu).toContain('0 lần muộn 6–15 phút');
  });

  it('nghỉ vượt phép trừ 3 mỗi ngày', () => {
    const ds = [cc({ nghi: true }), cc({ nghi: true }), cc({ nghi: true })];
    expect(luat({ chi_tieu: 10 }, [], [], ds).tiLe).toBeCloseTo(0.4);   // vượt 2 ngày → −6
  });

  it('trừ quá mức chỉ tiêu thì sàn 0, không ra điểm âm', () => {
    const ds = Array.from({ length: 5 }, () => cc({ di_muon_phut: 30 }));
    expect(luat({ chi_tieu: 10 }, [], [], ds).tiLe).toBe(0);
  });

  it('luôn nhường điểm chốt tay — dữ liệu chấm công chỉ đo được một phần quy định', () => {
    expect(luat({ chi_tieu: 10 }, [], [], [cc()]).nhuongChamTay).toBe(true);
    expect(luat({ chi_tieu: 10 }, [], [], []).nhuongChamTay).toBe(true);
  });

  it('ghi chú nói rõ phần chưa tính được', () => {
    expect(luat({ chi_tieu: 10 }, [], [], [cc()]).ghiChu).toContain('có phép/không phép');
  });
});

describe('apDungChamTuDong với chỉ tiêu bộ phận', () => {
  const NGAY = '2026-07-23';
  const bp = { id: 'bp-sx', cap_do: 'BO_PHAN', nhan_vien_id: null, lien_ket_bo_phan: 'CHUYEN_CAN_SX', ma: 'CHUYEN_CAN_BO_PHAN', chi_tieu: 10 };
  const cn = id => ({ id: `ct-${id}`, cap_do: 'CA_NHAN', nhan_vien_id: id, lien_ket_bo_phan: 'CHUYEN_CAN_SX', ma: 'CHUYEN_CAN_BO_PHAN', chi_tieu: 10 });
  const cc = (id, phut) => ({ nhan_vien_id: id, ky: '2026-07', di_muon_phut: phut, ve_som_phut: 0, nghi: false });

  it('chấm vào DÒNG CHUNG, không chấm dòng cá nhân', () => {
    const rows = [bp, cn('a'), cn('b')];
    const kq = apDungChamTuDong(rows, [], [], '2026-07', NGAY, [], [cc('a', 122), cc('b', 0)]);
    expect(kq.rows[0].diem_chot).toBe(7);          // TB 61 phút / 2 người → bậc 61-90 → trừ 3
    expect(kq.rows[1].diem_chot).toBeUndefined();  // dòng cá nhân không bị chấm
    expect(kq.rows[2].diem_chot).toBeUndefined();
  });

  it('chỉ đếm thành viên nối vào ĐÚNG nhóm đó', () => {
    const nguoiNhomKhac = { ...cn('z'), id: 'ct-z', lien_ket_bo_phan: 'CHUYEN_CAN_BH' };
    const rows = [bp, cn('a'), nguoiNhomKhac];
    const kq = apDungChamTuDong(rows, [], [], '2026-07', NGAY, [], [cc('a', 60), cc('z', 600)]);
    // Chỉ tính a: 60 phút / 1 người → bậc 30-60 → trừ 1. Nếu tính lẫn z thì TB 330 → 0 điểm.
    expect(kq.rows[0].diem_chot).toBe(9);
  });

  it('nhóm toàn công ty tính trên MỌI nhân viên dù chỉ nối 1 người', () => {
    const bpAll = { ...bp, id: 'bp-all', lien_ket_bo_phan: 'CHUYEN_CAN_TOAN_CTY' };
    const admin = { ...cn('admin'), id: 'ct-admin', lien_ket_bo_phan: 'CHUYEN_CAN_TOAN_CTY' };
    const rows = [bpAll, admin, cn('a'), cn('b')];
    // 3 người (admin, a, b), tổng 90 phút → TB 30 → trừ 1.
    const kq = apDungChamTuDong(rows, [], [], '2026-07', NGAY, [], [cc('admin', 90)]);
    expect(kq.rows[0].diem_chot).toBe(9);
  });

  it('chấm công của kỳ khác không lọt vào', () => {
    const rows = [bp, cn('a')];
    const cu = { ...cc('a', 600), ky: '2026-06' };
    const kq = apDungChamTuDong(rows, [], [], '2026-07', NGAY, [], [cu]);
    expect(kq.rows[0].diem_chot).toBeUndefined();  // không có dữ liệu kỳ này → không chấm
  });

  it('điểm chốt tay của người thật thắng điểm tự động ở chuyên cần cá nhân', () => {
    const r = { id: 'ct-cn', cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'CHUYEN_CAN_CA_NHAN', chi_tieu: 10, diem_chot: 4, chot_boi: 'Nguyên' };
    const kq = apDungChamTuDong([r], [], [], '2026-07', NGAY, [], [cc('a', 0)]);
    expect(kq.rows[0].diem_chot).toBe(4);
    expect(kq.logs[0].ly_do).toContain('đang dùng điểm chốt tay của Nguyên');
  });

  it('không có ai chốt tay thì điểm tự động vẫn được dùng', () => {
    const r = { id: 'ct-cn', cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'CHUYEN_CAN_CA_NHAN', chi_tieu: 10 };
    const kq = apDungChamTuDong([r], [], [], '2026-07', NGAY, [], [cc('a', 20)]);
    expect(kq.rows[0].diem_chot).toBe(5);
  });
});
