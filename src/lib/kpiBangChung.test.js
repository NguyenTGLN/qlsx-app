import { describe, it, expect } from 'vitest';
import { dsNhanVienChamChung } from './kpiBangChung';

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
