import { describe, it, expect } from 'vitest';
import { dsNhanVienChamChung, dungMaTran } from './kpiBangChung';

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
