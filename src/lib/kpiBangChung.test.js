import { describe, it, expect } from 'vitest';
import {
  dsNhanVienChamChung, dungMaTran, dsChiTieuThemDuoc, canHoiLyDo, timDongLyDo, NGUON_BANG_CHUNG,
  demNguoiTheoChiTieu, phanLoaiChiTieu,
} from './kpiBangChung';

describe('dsNhanVienChamChung', () => {
  const rows = [
    { cap_do: 'CA_NHAN', nhan_vien_id: 'b', ten: '5S' },
    { cap_do: 'CA_NHAN', nhan_vien_id: 'a', ten: '5S' },
    { cap_do: 'CA_NHAN', nhan_vien_id: 'b', ten: 'CHẤM KPI' },
    { cap_do: 'BO_PHAN', nhan_vien_id: null, ten: 'CHUYÊN CẦN BỘ PHẬN' },
  ];
  const users = [{ id: 'a', name: 'An' }, { id: 'b', name: 'Bình' }];

  it('mỗi nhân viên đúng một cột, không trùng', () => {
    expect(dsNhanVienChamChung(rows, users).map(n => n.id)).toEqual(['a', 'b']);
  });

  it('sắp theo tên hiển thị chứ không theo thứ tự dòng', () => {
    expect(dsNhanVienChamChung(rows, users).map(n => n.ten)).toEqual(['An', 'Bình']);
  });

  it('bỏ qua dòng BO_PHAN — nó thuộc cơ chế chấm chung cả bộ phận, khác hẳn', () => {
    expect(dsNhanVienChamChung(rows, users)).toHaveLength(2);
  });

  it('không tìm thấy trong users thì lấy id làm tên, không rơi mất cột', () => {
    const r = [{ cap_do: 'CA_NHAN', nhan_vien_id: 'z', ten: '5S' }];
    expect(dsNhanVienChamChung(r, users)).toEqual([{ id: 'z', ten: 'z', avatar: undefined }]);
  });
});

describe('dungMaTran', () => {
  const nv = [{ id: 'a', ten: 'An' }, { id: 'b', ten: 'Bình' }, { id: 'c', ten: 'Cường' }];
  const rows = [
    { id: 1, cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: '5S', ten: '5S', chi_tieu: 10, thu_tu: 5, cham_chung: true },
    { id: 2, cap_do: 'CA_NHAN', nhan_vien_id: 'b', ma: '5S', ten: '5S', chi_tieu: 10, thu_tu: 3, cham_chung: true },
    { id: 3, cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'CHAM_KPI', ten: 'CHẤM KPI', chi_tieu: 10, thu_tu: 9, cham_chung: true },
    { id: 4, cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'SAN_XUAT', ten: 'SẢN XUẤT', chi_tieu: 10, thu_tu: 6, cham_chung: false },
    { id: 5, cap_do: 'BO_PHAN', nhan_vien_id: null, ma: 'CHUYEN_CAN_BO_PHAN', ten: 'CHUYÊN CẦN BỘ PHẬN', chi_tieu: 10, cham_chung: true },
  ];

  it('chỉ lấy dòng cham_chung, mỗi mã một dòng bảng', () => {
    expect(dungMaTran(rows, nv).map(d => d.ma)).toEqual(['5S', 'CHAM_KPI']);
  });

  it('sắp dòng theo thu_tu nhỏ nhất của chỉ tiêu đó', () => {
    const d = dungMaTran(rows, nv);
    expect(d[0].ma).toBe('5S');
    expect(d[1].ma).toBe('CHAM_KPI');
  });

  it('ô của người CÓ chỉ tiêu là chính dòng chỉ tiêu đó', () => {
    const d5s = dungMaTran(rows, nv)[0];
    expect(d5s.o[0].id).toBe(1);
    expect(d5s.o[1].id).toBe(2);
  });

  it('ô của người KHÔNG có chỉ tiêu là null — vẽ gạch chéo, khác hẳn ô chưa chấm', () => {
    const d5s = dungMaTran(rows, nv)[0];
    expect(d5s.o[2]).toBeNull();
    expect(dungMaTran(rows, nv)[1].o[1]).toBeNull();
  });

  it('dòng BO_PHAN không lọt vào ma trận dù cham_chung = true', () => {
    expect(dungMaTran(rows, nv).some(d => d.ma === 'CHUYEN_CAN_BO_PHAN')).toBe(false);
  });

  it('mức chỉ tiêu giống nhau ở mọi ô thì hiện số đó', () => {
    expect(dungMaTran(rows, nv)[0].chi_tieu).toBe(10);
  });

  it('mức chỉ tiêu khác nhau giữa các người thì để null, không được bịa một số', () => {
    const lech = rows.map(r => (r.id === 2 ? { ...r, chi_tieu: 6 } : r));
    expect(dungMaTran(lech, nv)[0].chi_tieu).toBeNull();
  });

  it('chưa chạy migration (ma = null) thì gom theo tên, không dồn hết vào một dòng', () => {
    const cuMa = rows
      .filter(r => r.cap_do === 'CA_NHAN' && r.cham_chung)
      .map(r => ({ ...r, ma: null }));
    expect(dungMaTran(cuMa, nv).map(d => d.ten)).toEqual(['5S', 'CHẤM KPI']);
  });
});

describe('dsChiTieuThemDuoc', () => {
  const rows = [
    { cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: '5S', ten: '5S', cham_chung: true },
    { cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'SAN_XUAT', ten: 'SẢN XUẤT', cham_chung: false },
    { cap_do: 'CA_NHAN', nhan_vien_id: 'b', ma: 'SAN_XUAT', ten: 'SẢN XUẤT', cham_chung: false },
    { cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'THE_KHO', ten: 'THẺ KHO', cham_chung: false },
    { cap_do: 'BO_PHAN', nhan_vien_id: null, ma: 'CHUYEN_CAN_BO_PHAN', ten: 'CHUYÊN CẦN BỘ PHẬN', cham_chung: false },
  ];

  it('không liệt kê chỉ tiêu đã ở trong bảng chung', () => {
    expect(dsChiTieuThemDuoc(rows).some(c => c.ma === '5S')).toBe(false);
  });

  it('đếm đúng số người có mỗi chỉ tiêu', () => {
    expect(dsChiTieuThemDuoc(rows).find(c => c.ma === 'SAN_XUAT').soNguoi).toBe(2);
  });

  it('nhiều người có thì xếp lên trước', () => {
    expect(dsChiTieuThemDuoc(rows).map(c => c.ma)).toEqual(['SAN_XUAT', 'THE_KHO']);
  });

  it('bỏ dòng BO_PHAN — không đưa chỉ tiêu cả bộ phận vào bảng chung được', () => {
    expect(dsChiTieuThemDuoc(rows).some(c => c.ma === 'CHUYEN_CAN_BO_PHAN')).toBe(false);
  });
});

describe('canHoiLyDo', () => {
  it('đủ điểm tối đa thì không hỏi lý do', () => {
    expect(canHoiLyDo({ chi_tieu: 10 }, 10)).toBe(false);
  });

  it('thiếu điểm thì hỏi lý do', () => {
    expect(canHoiLyDo({ chi_tieu: 10 }, 9)).toBe(true);
  });

  it('0 điểm cũng phải có lý do — đây là lúc cần giải thích nhất', () => {
    expect(canHoiLyDo({ chi_tieu: 10 }, 0)).toBe(true);
  });

  it('chưa chấm (null) thì chưa hỏi gì', () => {
    expect(canHoiLyDo({ chi_tieu: 10 }, null)).toBe(false);
  });

  it('dòng thưởng ngoài trọng số (chi_tieu null) không có mức để so', () => {
    expect(canHoiLyDo({ chi_tieu: null }, 3)).toBe(false);
  });
});

describe('timDongLyDo', () => {
  it('chỉ nhận dòng do bảng chung ghi ra', () => {
    const logs = [
      { id: 1, nguon: 'TAY', ly_do: 'trừ tay' },
      { id: 2, nguon: NGUON_BANG_CHUNG, ly_do: 'để bàn bừa' },
    ];
    expect(timDongLyDo(logs).id).toBe(2);
  });

  it('không có thì trả null chứ không trả dòng nhật ký tay', () => {
    expect(timDongLyDo([{ id: 1, nguon: 'TAY' }])).toBeNull();
  });

  it('danh sách rỗng cũng không nổ', () => {
    expect(timDongLyDo()).toBeNull();
  });
});

describe('demNguoiTheoChiTieu', () => {
  it('đếm theo NGƯỜI chứ không theo dòng — một người lỡ có 2 dòng cùng chỉ tiêu vẫn là 1', () => {
    const rows = [
      { cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: '5S', ten: '5S' },
      { cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: '5S', ten: '5S' },
      { cap_do: 'CA_NHAN', nhan_vien_id: 'b', ma: '5S', ten: '5S' },
    ];
    expect(demNguoiTheoChiTieu(rows).get('5S')).toBe(2);
  });

  it('bỏ dòng BO_PHAN', () => {
    const rows = [
      { cap_do: 'BO_PHAN', nhan_vien_id: null, ma: 'CHUYEN_CAN_BO_PHAN', ten: 'CHUYÊN CẦN BỘ PHẬN' },
      { cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'CHUYEN_CAN_BO_PHAN', ten: 'CHUYÊN CẦN BỘ PHẬN' },
    ];
    expect(demNguoiTheoChiTieu(rows).get('CHUYEN_CAN_BO_PHAN')).toBe(1);
  });

  it('chưa có mã thì gom theo tên', () => {
    const rows = [
      { cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: null, ten: 'THẺ KHO' },
      { cap_do: 'CA_NHAN', nhan_vien_id: 'b', ma: null, ten: 'THẺ KHO' },
    ];
    expect(demNguoiTheoChiTieu(rows).get('THẺ KHO')).toBe(2);
  });

  it('danh sách rỗng trả Map rỗng, không nổ', () => {
    expect(demNguoiTheoChiTieu().size).toBe(0);
  });
});

describe('phanLoaiChiTieu', () => {
  const dem = new Map([['5S', 13], ['SAN_XUAT', 13], ['THE_KHO', 12], ['LAM_SO_KHO', 1]]);

  it('đang chấm ở bảng chung → BANG_CHUNG, kể cả khi chỉ vài người có', () => {
    expect(phanLoaiChiTieu({ ma: 'LAM_SO_KHO', cham_chung: true }, dem, 13)).toBe('BANG_CHUNG');
  });

  it('chưa vào bảng chung nhưng đủ mọi người → CHUNG_MOI_NGUOI', () => {
    expect(phanLoaiChiTieu({ ma: 'SAN_XUAT', cham_chung: false }, dem, 13)).toBe('CHUNG_MOI_NGUOI');
  });

  it('thiếu một người thôi cũng là RIENG — "gần đủ" không phải "đủ"', () => {
    expect(phanLoaiChiTieu({ ma: 'THE_KHO', cham_chung: false }, dem, 13)).toBe('RIENG');
  });

  it('chỉ một người có → RIENG', () => {
    expect(phanLoaiChiTieu({ ma: 'LAM_SO_KHO', cham_chung: false }, dem, 13)).toBe('RIENG');
  });

  it('cham_chung thắng, không cần biết đếm được bao nhiêu', () => {
    expect(phanLoaiChiTieu({ ma: '5S', cham_chung: true }, dem, 13)).toBe('BANG_CHUNG');
  });

  it('chưa biết có bao nhiêu nhân viên (0) thì không được kết luận là chung', () => {
    expect(phanLoaiChiTieu({ ma: '5S', cham_chung: false }, dem, 0)).toBe('RIENG');
  });

  it('chỉ tiêu không có trong bảng đếm → RIENG, không nổ', () => {
    expect(phanLoaiChiTieu({ ma: 'LA_HOAC', cham_chung: false }, dem, 13)).toBe('RIENG');
  });

  it('không truyền bảng đếm cũng không nổ', () => {
    expect(phanLoaiChiTieu({ ma: '5S' })).toBe('RIENG');
  });
});
