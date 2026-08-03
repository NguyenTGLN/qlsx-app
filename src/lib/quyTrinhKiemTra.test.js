import { describe, test, expect } from 'vitest';
import { kiemTraLuuDo, coTheBanHanh } from './quyTrinhKiemTra';

const K = (id, t, lane, y, extra = {}) => ({
  id, t, lane, y, dx: 0, w: t === 'dec' ? 150 : 164, h: t === 'dec' ? 86 : 56,
  tx: id, desc: 'có diễn giải', form: 'BM-01', time: '1 giờ', ...extra,
});

/** Lưu đồ nhỏ nhưng HỢP LỆ: bắt đầu → thao tác → kết thúc. */
const sach = () => ({
  lanes: [{ name: 'A', owner: 'a', color: '#111111' }],
  phases: [{ name: 'G', h: 400 }],
  nodes: [K('s', 'start', 0, 10), K('b1', 'step', 0, 100), K('e', 'end', 0, 200)],
  edges: [
    { id: 'e1', a: 's',  b: 'b1', lbl: '', k: 'n' },
    { id: 'e2', a: 'b1', b: 'e',  lbl: '', k: 'n' },
  ],
});

describe('kiemTraLuuDo', () => {
  test('lưu đồ hợp lệ → không lỗi, không cảnh báo', () => {
    const r = kiemTraLuuDo(sach());
    expect(r.loi).toEqual([]);
    expect(r.canhBao).toEqual([]);
    expect(coTheBanHanh(sach())).toBe(true);
  });

  test('thiếu khối Bắt đầu → lỗi', () => {
    const s = sach(); s.nodes = s.nodes.filter(n => n.t !== 'start');
    s.edges = s.edges.filter(e => e.a !== 's');
    expect(kiemTraLuuDo(s).loi.some(l => l.ma === 'THIEU_BAT_DAU')).toBe(true);
  });

  test('thiếu khối Kết thúc → lỗi', () => {
    const s = sach(); s.nodes = s.nodes.filter(n => n.t !== 'end');
    s.edges = s.edges.filter(e => e.b !== 'e');
    expect(kiemTraLuuDo(s).loi.some(l => l.ma === 'THIEU_KET_THUC')).toBe(true);
  });

  test('khối mồ côi không có đường vào → lỗi kèm id khối', () => {
    const s = sach(); s.nodes.push(K('mc', 'step', 0, 300));
    s.edges.push({ id: 'e9', a: 'mc', b: 'e', lbl: '', k: 'n' });
    const l = kiemTraLuuDo(s).loi.find(x => x.ma === 'KHONG_CO_DUONG_VAO');
    expect(l.khoiId).toBe('mc');
  });

  test('khối không có đường ra → lỗi', () => {
    const s = sach(); s.nodes.push(K('cut', 'step', 0, 300));
    s.edges.push({ id: 'e9', a: 'b1', b: 'cut', lbl: '', k: 'n' });
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'KHONG_CO_DUONG_RA' && x.khoiId === 'cut')).toBe(true);
  });

  test('khối Quyết định chỉ có 1 nhánh ra → lỗi', () => {
    const s = sach();
    s.nodes.push(K('d', 'dec', 0, 300));
    s.edges.push({ id: 'e8', a: 'b1', b: 'd', lbl: '', k: 'n' });
    s.edges.push({ id: 'e9', a: 'd', b: 'e', lbl: 'OK', k: 'ok' });
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'QUYET_DINH_THIEU_NHANH')).toBe(true);
  });

  test('nhánh của khối Quyết định thiếu nhãn → lỗi', () => {
    const s = sach();
    s.nodes.push(K('d', 'dec', 0, 300), K('b2', 'step', 0, 420));
    s.edges.push(
      { id: 'e8',  a: 'b1', b: 'd',  lbl: '',   k: 'n'  },
      { id: 'e9',  a: 'd',  b: 'e',  lbl: 'OK', k: 'ok' },
      { id: 'e10', a: 'd',  b: 'b2', lbl: '',   k: 'ng' },
      { id: 'e11', a: 'b2', b: 'e',  lbl: '',   k: 'n'  },
    );
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'NHANH_THIEU_NHAN')).toBe(true);
  });

  test('bước thiếu diễn giải → lỗi (tài liệu ISO không được có ô trống)', () => {
    const s = sach(); s.nodes.find(n => n.id === 'b1').desc = '   ';
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'THIEU_DIEN_GIAI')).toBe(true);
  });

  test('Bắt đầu/Kết thúc KHÔNG bị đòi diễn giải', () => {
    const s = sach();
    s.nodes.find(n => n.t === 'start').desc = '';
    s.nodes.find(n => n.t === 'end').desc = '';
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'THIEU_DIEN_GIAI')).toBe(false);
  });

  test('thiếu hồ sơ hoặc thời gian → chỉ CẢNH BÁO, vẫn ban hành được', () => {
    const s = sach();
    s.nodes.find(n => n.id === 'b1').form = '—';
    s.nodes.find(n => n.id === 'b1').time = '—';
    const r = kiemTraLuuDo(s);
    expect(r.loi).toEqual([]);
    expect(r.canhBao.length).toBeGreaterThan(0);
    expect(coTheBanHanh(s)).toBe(true);
  });

  test('hai khối chồng lên nhau → cảnh báo', () => {
    const s = sach(); s.nodes.push(K('ck', 'step', 0, 100));
    s.edges.push({ id: 'e8', a: 'b1', b: 'ck', lbl: '', k: 'n' }, { id: 'e9', a: 'ck', b: 'e', lbl: '', k: 'n' });
    expect(kiemTraLuuDo(s).canhBao.some(x => x.ma === 'CHONG_KHOI')).toBe(true);
  });

  test('còn lỗi thì coTheBanHanh = false', () => {
    const s = sach(); s.nodes.find(n => n.id === 'b1').desc = '';
    expect(coTheBanHanh(s)).toBe(false);
  });

  test('sơ đồ rỗng không làm nổ hàm', () => {
    const r = kiemTraLuuDo({ lanes: [], phases: [], nodes: [], edges: [] });
    expect(r.loi.some(x => x.ma === 'THIEU_BAT_DAU')).toBe(true);
  });
});
