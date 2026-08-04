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
