import { describe, it, expect } from 'vitest';
import { BO_LOC, NHAN_BO_LOC, tinhDaLam, gomTienDo, locPhieuSanXuat, demTheoBoLoc, locViecHoTro } from './locPhieuSanXuat';

// Dựng theo đúng hình dạng dữ liệu supabase trả về:
//   .select('*, production_logs(actual_quantity)')
const phieu = (order_code, target, daLam, created_at, status = 'pending') => ({
  id: order_code,
  order_code,
  product_code: 'X',
  target_quantity: target,
  status,
  created_at,
  production_logs: daLam.map(q => ({ actual_quantity: q })),
});

describe('tinhDaLam', () => {
  it('cộng dồn actual_quantity của các log', () => {
    expect(tinhDaLam(phieu('P', 26, [10, 6], '2026-07-27'))).toBe(16);
  });

  it('lệnh chưa có log nào thì đã làm = 0', () => {
    expect(tinhDaLam(phieu('P', 26, [], '2026-07-27'))).toBe(0);
    expect(tinhDaLam({ order_code: 'P' })).toBe(0);
  });
});

describe('gomTienDo', () => {
  it('tính produced/remaining và cờ xong', () => {
    const [a, b] = gomTienDo([
      phieu('A', 26, [10, 6], '2026-07-27'),
      phieu('B', 20, [20], '2026-07-28'),
    ]);
    expect(a).toMatchObject({ produced: 16, remaining: 10, xong: false });
    expect(b).toMatchObject({ produced: 20, remaining: 0, xong: true });
  });

  it('sai số dấu phẩy động vẫn coi là xong', () => {
    // 0.1*3 ≠ 0.3 trong số thực nhị phân — remaining ra ~ -5.5e-17.
    const [o] = gomTienDo([phieu('A', 0.3, [0.1, 0.1, 0.1], '2026-07-28')]);
    expect(o.remaining).not.toBe(0);
    expect(o.xong).toBe(true);
  });

  it('làm vượt chỉ tiêu cũng là xong', () => {
    const [o] = gomTienDo([phieu('A', 10, [12], '2026-07-28')]);
    expect(o).toMatchObject({ remaining: -2, xong: true });
  });

  it('không mutate dòng gốc', () => {
    const src = [phieu('A', 26, [16], '2026-07-27')];
    gomTienDo(src);
    expect(src[0].produced).toBeUndefined();
  });
});

describe('locPhieuSanXuat', () => {
  const ds = [
    phieu('PSX-20260723-12', 26, [16], '2026-07-27T09:42:00Z'),   // đang làm, còn 10
    phieu('PSX-20260728-01', 100, [100], '2026-07-28T03:24:00Z'), // xong
    phieu('PSX-20260728-04', 152, [], '2026-07-28T09:00:00Z'),    // đang làm, chưa báo cáo
  ];

  it('Tất cả: giữ đủ phiếu, mới tạo nhất lên đầu', () => {
    expect(locPhieuSanXuat(ds, BO_LOC.TAT_CA).map(o => o.order_code))
      .toEqual(['PSX-20260728-04', 'PSX-20260728-01', 'PSX-20260723-12']);
  });

  it('Đang thực hiện: chỉ phiếu còn sản lượng phải làm', () => {
    expect(locPhieuSanXuat(ds, BO_LOC.DANG_LAM).map(o => o.order_code))
      .toEqual(['PSX-20260728-04', 'PSX-20260723-12']);
  });

  it('Đã hoàn thành: chỉ phiếu đã đủ sản lượng', () => {
    expect(locPhieuSanXuat(ds, BO_LOC.HOAN_THANH).map(o => o.order_code))
      .toEqual(['PSX-20260728-01']);
  });

  it('status completed vào tab hoàn thành dù chưa đủ sản lượng', () => {
    const x = [phieu('P', 100, [3], '2026-07-28T01:00:00Z', 'completed')];
    expect(locPhieuSanXuat(x, BO_LOC.HOAN_THANH)).toHaveLength(1);
    expect(locPhieuSanXuat(x, BO_LOC.DANG_LAM)).toHaveLength(0);
  });

  it('lệnh đã huỷ không nằm trong bất kỳ tab nào', () => {
    const x = [phieu('P', 10, [], '2026-07-28T01:00:00Z', 'cancelled')];
    expect(locPhieuSanXuat(x, BO_LOC.TAT_CA)).toHaveLength(0);
    expect(locPhieuSanXuat(x, BO_LOC.DANG_LAM)).toHaveLength(0);
    expect(locPhieuSanXuat(x, BO_LOC.HOAN_THANH)).toHaveLength(0);
  });

  it('phiếu thiếu created_at xuống cuối, không nhảy lên đầu', () => {
    const x = [phieu('KHONG-NGAY', 5, [], null), ...ds];
    expect(locPhieuSanXuat(x, BO_LOC.TAT_CA).at(-1).order_code).toBe('KHONG-NGAY');
  });

  it('không mutate mảng gốc', () => {
    const src = [...ds];
    locPhieuSanXuat(src, BO_LOC.TAT_CA);
    expect(src.map(o => o.order_code)).toEqual(ds.map(o => o.order_code));
  });

  it('danh sách rỗng / thiếu tham số không ném lỗi', () => {
    expect(locPhieuSanXuat()).toEqual([]);
    expect(locPhieuSanXuat([], BO_LOC.DANG_LAM)).toEqual([]);
  });
});

describe('demTheoBoLoc', () => {
  it('số đếm 3 tab khớp với kết quả lọc', () => {
    const ds = [
      phieu('A', 26, [16], '2026-07-27T09:42:00Z'),
      phieu('B', 100, [100], '2026-07-28T03:24:00Z'),
      phieu('C', 152, [], '2026-07-28T09:00:00Z'),
      phieu('D', 5, [], '2026-07-28T10:00:00Z', 'cancelled'),
    ];
    expect(demTheoBoLoc(ds)).toEqual({
      [BO_LOC.TAT_CA]: 3,
      [BO_LOC.DANG_LAM]: 2,
      [BO_LOC.HOAN_THANH]: 1,
    });
  });
});

describe('phiếu công việc hỗ trợ', () => {
  const hoTro = (ma, daLam = []) => ({
    id: `VIEC-${ma}`, order_code: `VIEC-${ma}`, product_code: ma,
    target_quantity: 0, status: 'pending', created_at: '2026-07-01T00:00:00Z',
    loai_viec: 'HO_TRO', cach_tinh_hieu_suat: ma === 'GH' ? 'DINH_MUC' : 'CO_DINH_100',
    production_logs: daLam.map(q => ({ actual_quantity: q })),
  });

  const ds = [
    phieu('PSX-20260723-12', 26, [16], '2026-07-27T09:42:00Z'),
    phieu('PSX-20260728-01', 100, [100], '2026-07-28T03:24:00Z'),
    hoTro('GH', [5]),   // target 0, đã làm 5 → "còn lại" âm
    hoTro('NH'),
  ];

  it('không lọt vào bất kỳ tab nào trong 3 tab', () => {
    for (const bo of [BO_LOC.TAT_CA, BO_LOC.DANG_LAM, BO_LOC.HOAN_THANH]) {
      const ma = locPhieuSanXuat(ds, bo).map(o => o.order_code);
      expect(ma.some(x => x.startsWith('VIEC-'))).toBe(false);
    }
  });

  it('GH đã có báo cáo vẫn KHÔNG bị xếp vào tab Hoàn thành', () => {
    expect(locPhieuSanXuat(ds, BO_LOC.HOAN_THANH).map(o => o.order_code))
      .toEqual(['PSX-20260728-01']);
  });

  it('không được đếm vào số của 3 nút lọc', () => {
    expect(demTheoBoLoc(ds)).toEqual({
      [BO_LOC.TAT_CA]: 2,
      [BO_LOC.DANG_LAM]: 1,
      [BO_LOC.HOAN_THANH]: 1,
    });
  });
});

describe('locViecHoTro', () => {
  const hoTro = (ma) => ({
    id: `VIEC-${ma}`, order_code: `VIEC-${ma}`, product_code: ma,
    target_quantity: 0, status: 'pending', created_at: '2026-07-01T00:00:00Z',
    loai_viec: 'HO_TRO', cach_tinh_hieu_suat: 'CO_DINH_100', production_logs: [],
  });

  it('trả đúng các phiếu hỗ trợ, xếp theo thứ tự danh mục chứ không theo ngày tạo', () => {
    const ds = [hoTro('PS'), phieu('PSX-1', 5, [], '2026-07-28T00:00:00Z'), hoTro('GH'), hoTro('DK')];
    expect(locViecHoTro(ds).map(o => o.product_code)).toEqual(['GH', 'DK', 'PS']);
  });

  it('mã hỗ trợ lạ (không có trong danh mục) vẫn hiện, xếp cuối', () => {
    const la = { ...hoTro('XX'), product_code: 'XX' };
    expect(locViecHoTro([la, hoTro('GH')]).map(o => o.product_code)).toEqual(['GH', 'XX']);
  });

  it('danh sách rỗng / thiếu tham số không ném lỗi', () => {
    expect(locViecHoTro()).toEqual([]);
    expect(locViecHoTro([])).toEqual([]);
  });
});
