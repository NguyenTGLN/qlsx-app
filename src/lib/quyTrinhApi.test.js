import { describe, test, expect, vi, beforeEach } from 'vitest';

// ── Mock supabase client ──────────────────────────────────────────
// quyTrinhApi là lớp DUY NHẤT của phân hệ chạm DB, nên mọi test ở đây phải
// chặn nó lại — không có lời gọi thật nào đi ra ngoài.
const calls = { rpc: [] };
let rpcResult = { data: null, error: null };

vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
    }),
    rpc: (ten, tham) => { calls.rpc.push({ ten, tham }); return Promise.resolve(rpcResult); },
  },
  fetchAllRows: () => Promise.resolve({ data: [], error: null }),
}));

const api = await import('./quyTrinhApi');

beforeEach(() => {
  calls.rpc = [];
  rpcResult = { data: null, error: null };
});

// ── Khoá nội dung theo trạng thái ─────────────────────────────────
// Luật này phải KHỚP TỪNG CHỮ với trigger qt_canh_trang_thai trong
// sql/quy_trinh.sql: trigger khoá khi old.trang_thai khác 'draft'. Giao diện
// khoá hẹp hơn trigger thì người dùng bấm được nút Lưu rồi ăn lỗi PL/pgSQL —
// đúng thứ đã xảy ra với bản chờ duyệt.
describe('banKhoaNoiDung — chỉ bản NHÁP mới sửa được nội dung', () => {
  test('bản nháp KHÔNG khoá', () => {
    expect(api.banKhoaNoiDung('draft')).toBe(false);
  });

  test('bản CHỜ DUYỆT khoá — Admin phải duyệt đúng thứ mình đang đọc', () => {
    expect(api.banKhoaNoiDung('wait')).toBe(true);
  });

  test('bản đã ban hành và hết hiệu lực vẫn khoá như cũ', () => {
    expect(api.banKhoaNoiDung('published')).toBe(true);
    expect(api.banKhoaNoiDung('expired')).toBe(true);
  });

  test.each([
    ['null', null], ['undefined', undefined], ['rỗng', ''],
    ['chuỗi lạ', 'ABC'], ['số', 7], ['object', {}],
  ])('trạng thái lạ (%s) ⇒ KHOÁ, không mở nhầm', (_ten, tt) => {
    expect(api.banKhoaNoiDung(tt)).toBe(true);
  });
});

describe('lyDoKhoaNoiDung — nói đúng cái nút người dùng phải đi tìm', () => {
  test('bản chờ duyệt chỉ sang nút "Trả lại", KHÔNG bảo tạo phiên bản mới', () => {
    const s = api.lyDoKhoaNoiDung('wait', 'Chờ duyệt');
    expect(s).toContain('Chờ duyệt');
    expect(s).toContain('Trả lại');
    expect(s).not.toContain('phiên bản mới');
  });

  test('bản đã ban hành giữ nguyên lời cũ — chỉ sang việc tạo phiên bản mới', () => {
    const s = api.lyDoKhoaNoiDung('published', 'Đã ban hành');
    expect(s).toContain('Đã ban hành');
    expect(s).toContain('phiên bản mới');
    expect(s).not.toContain('Trả lại');
  });

  test('bản hết hiệu lực nói y như bản đã ban hành', () => {
    expect(api.lyDoKhoaNoiDung('expired', 'Hết hiệu lực')).toContain('phiên bản mới');
  });

  test('bản nháp không khoá ⇒ không có lời nào', () => {
    expect(api.lyDoKhoaNoiDung('draft', 'Bản nháp')).toBe('');
  });

  test('thiếu tên trạng thái vẫn ra câu đọc được, không có "undefined"', () => {
    for (const tt of ['wait', 'published', 'expired']) {
      const s = api.lyDoKhoaNoiDung(tt);
      expect(s).not.toContain('undefined');
      expect(s.length).toBeGreaterThan(10);
    }
  });
});

// ── Tạo phiên bản mới ─────────────────────────────────────────────
// Toàn bộ luật (chủ sở hữu, chỉ một việc dở dang, chép so_do/tai_lieu, đánh số
// lần ban hành) nằm trong rpc_qt_tao_phien_ban ở sql/quy_trinh.sql — một bản
// luật, chạy ở máy chủ. Phía này chỉ gọi đúng tên hàm, đúng tên tham số và
// không nuốt lỗi.
describe('taoPhienBanMoi', () => {
  test('gọi đúng RPC với đúng tên tham số', async () => {
    rpcResult = { data: 'pb-moi', error: null };
    await api.taoPhienBanMoi('qt-1');
    expect(calls.rpc).toEqual([{ ten: 'rpc_qt_tao_phien_ban', tham: { p_quy_trinh_id: 'qt-1' } }]);
  });

  test('trả về id bản mới để màn hình mở thẳng nó ra', async () => {
    rpcResult = { data: 'pb-moi', error: null };
    expect(await api.taoPhienBanMoi('qt-1')).toBe('pb-moi');
  });

  test('lỗi từ máy chủ được NÉM RA kèm việc đang làm, không nuốt', async () => {
    rpcResult = { data: null, error: { message: 'Quy trình này đang có một bản nháp' } };
    await expect(api.taoPhienBanMoi('qt-1')).rejects.toThrow(/Không tạo được phiên bản mới/);
    await expect(api.taoPhienBanMoi('qt-1')).rejects.toThrow(/đang có một bản nháp/);
  });

  test('KHÔNG tự đi lấp lời từ chối của máy chủ bằng một giá trị giả', async () => {
    rpcResult = { data: null, error: { message: 'Chỉ người soạn hoặc Admin' } };
    let da = false;
    try { await api.taoPhienBanMoi('qt-1'); } catch { da = true; }
    expect(da).toBe(true);
  });
});
