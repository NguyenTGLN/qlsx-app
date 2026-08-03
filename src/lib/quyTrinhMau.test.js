import { describe, test, expect } from 'vitest';
import { NHOM, mauTaiLieu, mauSoDo, maSoTiepTheo } from './quyTrinhMau';
import { kiemTraLuuDo } from './quyTrinhKiemTra';

describe('NHOM', () => {
  test('đủ 6 nhóm bộ phận, mã 2 chữ, không trùng', () => {
    expect(NHOM).toHaveLength(6);
    expect(NHOM.map(n => n.ma)).toEqual(['SX', 'CL', 'KH', 'CS', 'BH', 'HC']);
    for (const n of NHOM) {
      expect(n.ma).toMatch(/^[A-Z]{2}$/);
      expect(n.ten).toBeTruthy();
      expect(n.mau).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('mauTaiLieu', () => {
  test('mỗi nhóm có đủ mục 1–4 và 7, không ô nào trống', () => {
    for (const n of NHOM) {
      const t = mauTaiLieu(n.ma);
      expect(t.mucDich.trim()).not.toBe('');
      expect(t.phamVi.trim()).not.toBe('');
      expect(t.vienDan.length).toBeGreaterThan(0);
      expect(t.dinhNghia.length).toBeGreaterThan(0);
      expect(t.hoSoLuu.length).toBeGreaterThan(0);
      for (const d of t.dinhNghia) { expect(d.tu).toBeTruthy(); expect(d.nghia).toBeTruthy(); }
      for (const h of t.hoSoLuu) {
        expect(h.ten).toBeTruthy(); expect(h.boPhan).toBeTruthy();
        expect(h.thoiGian).toBeTruthy(); expect(h.hinhThuc).toBeTruthy();
      }
    }
  });
  test('nhóm lạ → trả mẫu rỗng có đủ khoá, không nổ', () => {
    const t = mauTaiLieu('ZZ');
    expect(t.mucDich).toBe('');
    expect(Array.isArray(t.hoSoLuu)).toBe(true);
  });
  test('trả BẢN SAO — sửa kết quả không làm hỏng mẫu gốc', () => {
    const a = mauTaiLieu('SX'); a.vienDan.push('bậy');
    expect(mauTaiLieu('SX').vienDan).not.toContain('bậy');
  });
  test('mọi nhóm trong NHOM đều CÓ mẫu thật, không rơi về mẫu rỗng', () => {
    // Thêm nhóm vào NHOM mà quên thêm vào MAU thì người dùng nhận mục ISO trống
    // kèm swimlane của Sản xuất — sai một cách im lặng, không báo lỗi ở đâu cả.
    for (const n of NHOM) {
      const t = mauTaiLieu(n.ma);
      expect(t.mucDich.trim(), `nhóm ${n.ma} thiếu mẫu`).not.toBe('');
      expect(t.hoSoLuu.length, `nhóm ${n.ma} thiếu hồ sơ lưu`).toBeGreaterThan(0);
    }
  });
});

describe('mauSoDo', () => {
  test('có sẵn cột, hàng, khối Bắt đầu và Kết thúc đã nối nhau', () => {
    const s = mauSoDo('SX');
    expect(s.lanes.length).toBeGreaterThanOrEqual(3);
    expect(s.phases.length).toBeGreaterThanOrEqual(2);
    expect(s.nodes.some(n => n.t === 'start')).toBe(true);
    expect(s.nodes.some(n => n.t === 'end')).toBe(true);
    expect(s.edges).toHaveLength(1);
  });
  test('mỗi cột có tên và người phụ trách', () => {
    for (const l of mauSoDo('KH').lanes) { expect(l.name).toBeTruthy(); expect(l.owner).toBeTruthy(); }
  });
  test('mẫu có cấu trúc hợp lệ, chỉ còn thiếu bước ở giữa', () => {
    const r = kiemTraLuuDo(mauSoDo('CL'));
    // Mẫu mới tinh CHƯA ban hành được — đó là đúng, phải vẽ bước đã.
    expect(r.loi.map(x => x.ma)).toEqual(['CHUA_CO_BUOC_NAO']);
  });
  test('trả BẢN SAO — sửa sơ đồ không làm hỏng mẫu gốc', () => {
    const a = mauSoDo('SX'); a.nodes.push({ id: 'x' });
    expect(mauSoDo('SX').nodes.some(n => n.id === 'x')).toBe(false);
  });
});

describe('maSoTiepTheo', () => {
  test('đánh số tiếp theo trong nhóm, đệm 2 chữ số', () => {
    expect(maSoTiepTheo('SX', ['QT-SX-01', 'QT-SX-02', 'QT-CL-01'])).toBe('QT-SX-03');
  });
  test('nhóm chưa có quy trình nào → 01', () => {
    expect(maSoTiepTheo('HC', ['QT-SX-01'])).toBe('QT-HC-01');
  });
  test('lấp lỗ hổng KHÔNG được — luôn lớn hơn số lớn nhất đang có', () => {
    expect(maSoTiepTheo('SX', ['QT-SX-01', 'QT-SX-07'])).toBe('QT-SX-08');
  });
  test('bỏ qua mã rác không đúng định dạng', () => {
    expect(maSoTiepTheo('SX', ['QT-SX-01', 'linh tinh', 'QT-SX-abc'])).toBe('QT-SX-02');
  });
  test('danh sách rỗng → 01', () => {
    expect(maSoTiepTheo('BH', [])).toBe('QT-BH-01');
  });
  test('nhóm không hợp lệ thì NÉM LỖI, không sinh mã rác', () => {
    expect(() => maSoTiepTheo(undefined, [])).toThrow(/không hợp lệ/i);
    expect(() => maSoTiepTheo('ZZ', [])).toThrow(/không hợp lệ/i);
    expect(() => maSoTiepTheo('', [])).toThrow(/không hợp lệ/i);
  });

  test('chịu được danh sách null và mã viết thường', () => {
    expect(maSoTiepTheo('SX', null)).toBe('QT-SX-01');
    expect(maSoTiepTheo('sx', ['qt-sx-01'])).toBe('QT-SX-02');   // không cấp trùng số
  });
});
