import { describe, test, expect, vi, beforeEach } from 'vitest';

// ── Supabase giả ──────────────────────────────────────────────────
// Ghi lại TỪNG truy vấn (bảng + cột + bộ lọc) để kiểm chứng đúng thứ đã gửi đi,
// không phải đúng thứ mình tưởng đã gửi. Không có lời gọi mạng nào ở đây.
const luot = [];
let ketQua = {};   // { tênBảng: {data, error} | () => {data, error} }

function chuoi(bang) {
  const ghi = { bang, cot: null, loc: [] };
  const q = {};
  const noi = ten => (...args) => {
    if (ten === 'select') ghi.cot = args[0];
    else if (ten !== 'range') ghi.loc.push([ten, ...args]);
    return q;
  };
  for (const m of ['select', 'eq', 'gte', 'lt', 'in', 'or', 'order', 'range']) q[m] = noi(m);
  // Thenable: fetchAllRows await chuỗi này sau khi gắn .range().
  q.then = (ok, that) => {
    luot.push(ghi);
    const r = ketQua[bang] ?? { data: [], error: null };
    return Promise.resolve(typeof r === 'function' ? r(ghi) : r).then(ok, that);
  };
  return q;
}

vi.mock('./supabase', () => ({
  supabase: { from: bang => chuoi(bang) },
  // Bản rút gọn của fetchAllRows thật: gọi makeQuery().range(). Dữ liệu test luôn
  // dưới 1000 dòng nên vòng lặp gom đợt của bản thật chỉ chạy đúng một lượt.
  fetchAllRows: async makeQuery => {
    const { data, error } = await makeQuery().range(0, 999);
    return { data: data || [], error: error || null };
  },
}));

const { taiDuLieuKpi, chiaLo } = await import('./kpiDuLieu');

const bangDaGoi = () => luot.map(x => x.bang);
const soLan = bang => luot.filter(x => x.bang === bang).length;

beforeEach(() => {
  luot.length = 0;
  ketQua = {};
});

// ─────────────────────────────────────────────────────────────────
describe('chiaLo', () => {
  test('chia đúng lô, lô cuối ngắn hơn', () => {
    expect(chiaLo([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  test('mảng rỗng ⇒ không lô nào ⇒ không truy vấn nhật ký nào', () => {
    expect(chiaLo([], 100)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────
describe('kemDanhMuc — khác biệt DUY NHẤT giữa tab KPI và bảng tin cá nhân', () => {
  test('mặc định CÓ danh mục — tab KPI giữ nguyên hành vi cũ', async () => {
    const kq = await taiDuLieuKpi('2026-08');
    // kpi_chi_tieu bị gọi 2 lần: 1 lần lấy kỳ, 1 lần lấy danh mục mọi kỳ.
    expect(soLan('kpi_chi_tieu')).toBe(2);
    expect(kq.danhMuc).toEqual([]);
  });

  test('kemDanhMuc:false ⇒ KHÔNG gửi truy vấn danh mục', async () => {
    await taiDuLieuKpi('2026-08', { kemDanhMuc: false });
    expect(soLan('kpi_chi_tieu')).toBe(1);
    // Truy vấn duy nhất phải là truy vấn LỌC THEO KỲ, không phải truy vấn mọi kỳ.
    const q = luot.find(x => x.bang === 'kpi_chi_tieu');
    expect(q.loc).toContainEqual(['eq', 'ky', '2026-08']);
  });

  test('kemDanhMuc:false vẫn tải đủ mọi nguồn còn lại', async () => {
    const kq = await taiDuLieuKpi('2026-08', { kemDanhMuc: false });
    for (const b of ['cong_viec_duoc_giao', 'production_logs', 'cham_cong',
      'chuyen_can_ngoai_le', 'cai_tien']) {
      expect(bangDaGoi()).toContain(b);
    }
    expect(kq.danhMuc).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────
describe('không được lọc theo người — chấm chung cả bộ phận sẽ sai', () => {
  // apDungChamTuDong suy `thanhVien` từ chính mảng rows. Lọc bớt người ở đây là
  // chia trung bình sai. Khoá bằng test để không ai "tối ưu" nhầm về sau.
  test('kpi_chi_tieu chỉ lọc theo KỲ, không lọc nhan_vien_id', async () => {
    await taiDuLieuKpi('2026-08', { kemDanhMuc: false });
    const q = luot.find(x => x.bang === 'kpi_chi_tieu');
    expect(q.loc.map(l => l[1])).not.toContain('nhan_vien_id');
  });

  test('cham_cong chỉ lọc theo KỲ, không lọc nhan_vien_id', async () => {
    await taiDuLieuKpi('2026-08', { kemDanhMuc: false });
    const q = luot.find(x => x.bang === 'cham_cong');
    expect(q.loc).toContainEqual(['eq', 'ky', '2026-08']);
    expect(q.loc.map(l => l[1])).not.toContain('nhan_vien_id');
  });
});

// ─────────────────────────────────────────────────────────────────
describe('tie-break khi gom đợt 1000 dòng', () => {
  test('kpi_chi_tieu sắp theo thu_tu rồi id', async () => {
    await taiDuLieuKpi('2026-08', { kemDanhMuc: false });
    const q = luot.find(x => x.bang === 'kpi_chi_tieu');
    expect(q.loc.filter(l => l[0] === 'order')).toEqual([['order', 'thu_tu'], ['order', 'id']]);
  });

  test('kpi_nhat_ky sắp theo ngay rồi id', async () => {
    ketQua['kpi_chi_tieu'] = { data: [{ id: 'a' }], error: null };
    await taiDuLieuKpi('2026-08', { kemDanhMuc: false });
    const q = luot.find(x => x.bang === 'kpi_nhat_ky');
    expect(q.loc.filter(l => l[0] === 'order')).toEqual([['order', 'ngay'], ['order', 'id']]);
  });
});

// ─────────────────────────────────────────────────────────────────
describe('chia lô nhật ký theo 100 id', () => {
  test('250 chỉ tiêu ⇒ 3 truy vấn nhật ký, gộp đủ dòng', async () => {
    const ct = Array.from({ length: 250 }, (_, i) => ({ id: `ct${i}` }));
    ketQua['kpi_chi_tieu'] = { data: ct, error: null };
    ketQua['kpi_nhat_ky'] = q => ({
      data: q.loc.find(l => l[0] === 'in')[2].map(id => ({ chi_tieu_id: id })),
      error: null,
    });

    const kq = await taiDuLieuKpi('2026-08', { kemDanhMuc: false });
    expect(soLan('kpi_nhat_ky')).toBe(3);
    expect(kq.logs).toHaveLength(250);
  });

  test('không có chỉ tiêu nào ⇒ KHÔNG gửi truy vấn nhật ký nào', async () => {
    await taiDuLieuKpi('2026-08', { kemDanhMuc: false });
    expect(soLan('kpi_nhat_ky')).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────
describe('nguồn hỏng — hỏng một chỗ không được kéo sập cả màn hình', () => {
  test('kpi_chi_tieu hỏng ⇒ NÉM lỗi (không có KPI nào để hiện)', async () => {
    ketQua['kpi_chi_tieu'] = { data: null, error: { message: 'toang' } };
    await expect(taiDuLieuKpi('2026-08', { kemDanhMuc: false })).rejects.toMatchObject({ message: 'toang' });
  });

  test('kpi_nhat_ky hỏng ⇒ NÉM lỗi (điểm sẽ sai nếu thiếu nhật ký)', async () => {
    ketQua['kpi_chi_tieu'] = { data: [{ id: 'a' }], error: null };
    ketQua['kpi_nhat_ky'] = { data: null, error: { message: 'nk toang' } };
    await expect(taiDuLieuKpi('2026-08', { kemDanhMuc: false })).rejects.toMatchObject({ message: 'nk toang' });
  });

  test.each([
    ['cong_viec_duoc_giao', 'viec'],
    ['production_logs', 'sanXuat'],
    ['cham_cong', 'chamCong'],
    ['chuyen_can_ngoai_le', 'ngoaiLe'],
  ])('%s hỏng ⇒ vẫn trả về, nguồn đó rỗng, loiViec có nội dung', async (bang, khoa) => {
    ketQua[bang] = { data: null, error: { message: `${bang} toang` } };
    const kq = await taiDuLieuKpi('2026-08', { kemDanhMuc: false });
    expect(kq[khoa]).toEqual([]);
    expect(kq.loiViec).toContain('toang');
    // Các nguồn khác vẫn phải được gọi — không dừng dây chuyền.
    expect(bangDaGoi()).toContain('cai_tien');
  });

  test('danh mục hỏng ⇒ nuốt lặng, KHÔNG ghi vào loiViec (ô chọn tự lùi về kỳ đang xem)', async () => {
    let lan = 0;
    ketQua['kpi_chi_tieu'] = () => (++lan === 1
      ? { data: [], error: null }
      : { data: null, error: { message: 'danh muc toang' } });
    const kq = await taiDuLieuKpi('2026-08');
    expect(kq.danhMuc).toEqual([]);
    expect(kq.loiViec).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────
describe('caiTien: null khác []', () => {
  // null = không nối được nguồn ⇒ luật trả "không chấm".
  // [] = nối được nhưng chưa ai gửi bài ⇒ luật chấm 0.
  // Trả nhầm [] khi hỏng là đè 0 lên điểm cũ của người ta.
  test('tải được ⇒ mảng (kể cả rỗng)', async () => {
    const kq = await taiDuLieuKpi('2026-08', { kemDanhMuc: false });
    expect(kq.caiTien).toEqual([]);
  });

  test('hỏng ⇒ null, KHÔNG phải []', async () => {
    ketQua['cai_tien'] = { data: null, error: { message: 'chua co bang' } };
    const kq = await taiDuLieuKpi('2026-08', { kemDanhMuc: false });
    expect(kq.caiTien).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
describe('mốc tháng cắt theo GIỜ MÁY, không phải giờ UTC', () => {
  test('cong_viec_duoc_giao: mốc đầu kỳ đúng nửa đêm giờ máy ngày 01', async () => {
    await taiDuLieuKpi('2026-08', { kemDanhMuc: false });
    const q = luot.find(x => x.bang === 'cong_viec_duoc_giao');
    const tu = new Date(q.loc.find(l => l[0] === 'gte')[2]);
    const den = new Date(q.loc.find(l => l[0] === 'lt')[2]);
    // Đọc lại theo giờ máy: phải là 00:00 ngày 01/08 và 00:00 ngày 01/09.
    expect([tu.getFullYear(), tu.getMonth(), tu.getDate(), tu.getHours()]).toEqual([2026, 7, 1, 0]);
    expect([den.getFullYear(), den.getMonth(), den.getDate(), den.getHours()]).toEqual([2026, 8, 1, 0]);
  });

  test('production_logs: cắt bằng chuỗi ngày, sang năm đúng khi kỳ là tháng 12', async () => {
    await taiDuLieuKpi('2026-12', { kemDanhMuc: false });
    const q = luot.find(x => x.bang === 'production_logs');
    expect(q.loc.find(l => l[0] === 'gte')[2]).toBe('2026-12-01');
    expect(q.loc.find(l => l[0] === 'lt')[2]).toBe('2027-01-01');
  });
});
