import { describe, test, expect } from 'vitest';
import { LANE_W, LOAI_KHOI, nodeX, rectOf, drawW, drawH, phaseTop, phaseOf, timKhoi } from './quyTrinhSoDo';
import { routeEdge } from './quyTrinhSoDo';
import { themBuoc, xoaKhoi, doiCot, thuTuBuoc } from './quyTrinhSoDo';
import { tuXepLai } from './quyTrinhSoDo';

const soDo = {
  lanes: [
    { name: 'Kinh doanh', owner: 'NV Kinh doanh', color: '#2563eb' },
    { name: 'Kho',        owner: 'Thủ kho',       color: '#0d9488' },
  ],
  phases: [{ name: 'Tiếp nhận', h: 130 }, { name: 'Chuẩn bị', h: 200 }],
  nodes: [
    { id: 'n1', t: 'start', lane: 0, y: 30, dx: 0, w: 164, h: 48, tx: 'Bắt đầu' },
    { id: 'n2', t: 'step',  lane: 1, y: 160, dx: 0, w: 164, h: 56, tx: 'Kiểm tra tồn' },
  ],
  edges: [],
};

describe('hình học', () => {
  test('nodeX căn giữa khối trong cột của nó', () => {
    expect(nodeX(soDo.nodes[0])).toBe(0 * LANE_W + LANE_W / 2 - 164 / 2);
    expect(nodeX(soDo.nodes[1])).toBe(1 * LANE_W + LANE_W / 2 - 164 / 2);
  });
  test('nodeX cộng thêm dx khi người dùng kéo lệch', () => {
    expect(nodeX({ ...soDo.nodes[0], dx: 24 })).toBe(LANE_W / 2 - 82 + 24);
  });
  test('rectOf trả đủ 4 cạnh và tâm', () => {
    const r = rectOf(soDo.nodes[1]);
    expect(r).toEqual({ x: LANE_W + 24, y: 160, w: 164, h: 56, cx: LANE_W + 106, cy: 188 });
  });
  test('drawW theo số cột, drawH theo tổng chiều cao hàng', () => {
    expect(drawW(soDo)).toBe(2 * LANE_W);
    expect(drawH(soDo)).toBe(330);
  });
  test('phaseTop cộng dồn chiều cao các hàng phía trên', () => {
    expect(phaseTop(soDo, 0)).toBe(0);
    expect(phaseTop(soDo, 1)).toBe(130);
  });
  test('phaseOf trả hàng chứa tâm khối', () => {
    expect(phaseOf(soDo, soDo.nodes[0])).toBe(0);
    expect(phaseOf(soDo, soDo.nodes[1])).toBe(1);
  });
  test('phaseOf kẹp về hàng cuối khi khối rơi quá đáy', () => {
    expect(phaseOf(soDo, { ...soDo.nodes[1], y: 9999 })).toBe(1);
  });
  test('timKhoi tìm theo id, không thấy trả undefined', () => {
    expect(timKhoi(soDo, 'n2').tx).toBe('Kiểm tra tồn');
    expect(timKhoi(soDo, 'zzz')).toBeUndefined();
  });
  test('LOAI_KHOI đủ 7 loại, loại nào cũng có nhãn/màu/kích thước', () => {
    expect(Object.keys(LOAI_KHOI)).toEqual(['start','end','step','dec','check','doc','data']);
    for (const k of Object.keys(LOAI_KHOI)) {
      expect(LOAI_KHOI[k].nhan).toBeTruthy();
      expect(LOAI_KHOI[k].mau).toMatch(/^#[0-9a-f]{6}$/i);
      expect(LOAI_KHOI[k].w).toBeGreaterThan(0);
      expect(LOAI_KHOI[k].h).toBeGreaterThan(0);
    }
  });
});

// Đếm số đoạn thẳng trong path để biết đường bẻ mấy góc.
const soDoan = d => (d.match(/L/g) || []).length;

describe('định tuyến đường nối', () => {
  const nn = (id, lane, y, w = 164, h = 56) => ({ id, t: 'step', lane, y, dx: 0, w, h, tx: id });
  const mk = (nodes, edge) => ({ lanes: [{}, {}, {}], phases: [{ name: 'x', h: 900 }], nodes, edges: [edge] });

  test('cùng tầm cao → đi ngang, không bẻ góc', () => {
    const s = mk([nn('a', 0, 100), nn('b', 2, 100)], { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' });
    const { d } = routeEdge(s, s.edges[0]);
    expect(soDoan(d)).toBe(1);
  });

  test('đích ở dưới, thẳng cột → đi thẳng xuống', () => {
    const s = mk([nn('a', 1, 100), nn('b', 1, 300)], { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' });
    const { d } = routeEdge(s, s.edges[0]);
    expect(soDoan(d)).toBe(1);
    expect(d.startsWith('M318 156')).toBe(true); // ra cạnh dưới khối a
  });

  test('đích ở dưới và lệch cột → bẻ 2 góc (xuống, ngang, xuống)', () => {
    const s = mk([nn('a', 0, 100), nn('b', 2, 300)], { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' });
    const { d } = routeEdge(s, s.edges[0]);
    expect(d).toContain('Q');           // có bo góc
    expect(soDoan(d)).toBeGreaterThan(1);
  });

  test('đích ở trên → vòng ngược lên rồi đâm vào cạnh bên', () => {
    const s = mk([nn('a', 0, 400), nn('b', 2, 100)], { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' });
    const { d } = routeEdge(s, s.edges[0]);
    expect(d).toContain('Q');
  });

  test('trả toạ độ nhãn nằm trên đường', () => {
    const s = mk([nn('a', 0, 100), nn('b', 2, 100)], { id: 'e', a: 'a', b: 'b', k: 'ok', lbl: 'OK' });
    const { nhan } = routeEdge(s, s.edges[0]);
    expect(nhan).toHaveLength(2);
    expect(Number.isFinite(nhan[0])).toBe(true);
    expect(Number.isFinite(nhan[1])).toBe(true);
  });

  test('thiếu khối đầu hoặc cuối → trả null thay vì ném lỗi', () => {
    const s = mk([nn('a', 0, 100)], { id: 'e', a: 'a', b: 'khong-co', k: 'n', lbl: '' });
    expect(routeEdge(s, s.edges[0])).toBeNull();
  });
});

describe('thêm bước bằng nút ＋', () => {
  const base = () => ({
    lanes: [
      { name: 'Kế hoạch', owner: 'NV Kế hoạch', color: '#7c3aed' },
      { name: 'Kho',      owner: 'Thủ kho',     color: '#0d9488' },
      { name: 'QC',       owner: 'NV QC',       color: '#16a34a' },
    ],
    phases: [{ name: 'G1', h: 600 }],
    nodes: [
      { id: 'n1', t: 'step', lane: 1, y: 100, dx: 0, w: 164, h: 56, tx: 'Xuất kho', desc: 'x', form: '—', time: '—' },
      { id: 'n2', t: 'dec',  lane: 1, y: 220, dx: 0, w: 150, h: 86, tx: 'Đạt?',     desc: 'x', form: '—', time: '—' },
    ],
    edges: [{ id: 'e1', a: 'n1', b: 'n2', lbl: '', k: 'n' }],
  });

  test('bước mới nằm DƯỚI khối nguồn và được nối tự động', () => {
    const s = themBuoc(base(), { tuId: 'n1', nhanh: '', loai: 'check', cot: 2, ten: 'Kiểm QC' });
    const moi = s.nodes.find(n => n.tx === 'Kiểm QC');
    expect(moi).toBeTruthy();
    expect(moi.t).toBe('check');
    expect(moi.lane).toBe(2);
    expect(moi.y).toBe(100 + 56 + 46);
    expect(s.edges.some(e => e.a === 'n1' && e.b === moi.id && e.k === 'n')).toBe(true);
  });

  test('nhánh NG rẽ NGANG cùng tầm cao và mang nhãn NG', () => {
    const s = themBuoc(base(), { tuId: 'n2', nhanh: 'ng', loai: 'step', cot: 0, ten: 'Tái chế' });
    const moi = s.nodes.find(n => n.tx === 'Tái chế');
    expect(moi.y).toBe(220 + Math.round((86 - 56) / 2));
    const e = s.edges.find(x => x.b === moi.id);
    expect(e.k).toBe('ng');
    expect(e.lbl).toBe('NG');
  });

  test('nhánh OK mang nhãn OK', () => {
    const s = themBuoc(base(), { tuId: 'n2', nhanh: 'ok', loai: 'doc', cot: 1, ten: 'Nhập kho' });
    expect(s.edges.find(x => x.b === s.nodes.at(-1).id).lbl).toBe('OK');
  });

  test('khối đang chắn chỗ trong cùng cột bị đẩy xuống', () => {
    const s = themBuoc(base(), { tuId: 'n1', nhanh: '', loai: 'step', cot: 1, ten: 'Chèn giữa' });
    const n2 = s.nodes.find(n => n.id === 'n2');
    expect(n2.y).toBeGreaterThan(220);
  });

  test('không có tên thì dùng "Bước mới", và luôn có sẵn ô diễn giải', () => {
    const s = themBuoc(base(), { tuId: 'n1', nhanh: '', loai: 'step', cot: 1, ten: '' });
    const moi = s.nodes.at(-1);
    expect(moi.tx).toBe('Bước mới');
    expect(typeof moi.desc).toBe('string');
  });

  test('nới chiều cao hàng cuối khi lưu đồ dài ra', () => {
    let s = base(); s.phases = [{ name: 'G1', h: 180 }];
    s = themBuoc(s, { tuId: 'n1', nhanh: '', loai: 'step', cot: 1, ten: 'Dài ra' });
    expect(drawH(s)).toBeGreaterThan(180);
  });

  test('BẤT BIẾN — sơ đồ gốc không bị sửa', () => {
    const goc = base();
    const truoc = JSON.stringify(goc);
    themBuoc(goc, { tuId: 'n1', nhanh: '', loai: 'step', cot: 1, ten: 'X' });
    expect(JSON.stringify(goc)).toBe(truoc);
  });

  test('nguồn không tồn tại → ném lỗi rõ ràng', () => {
    expect(() => themBuoc(base(), { tuId: 'zzz', nhanh: '', loai: 'step', cot: 0, ten: 'X' }))
      .toThrow(/không tìm thấy khối nguồn/i);
  });

  test('đẩy DỒN — chèn giữa cột 3 bước không tạo ra khối chồng nhau', () => {
    const s0 = base();
    s0.nodes = [
      { id: 'a', t: 'step', lane: 1, y: 100, dx: 0, w: 164, h: 56, tx: 'A', desc: '', form: '—', time: '—' },
      { id: 'b', t: 'step', lane: 1, y: 220, dx: 0, w: 164, h: 56, tx: 'B', desc: '', form: '—', time: '—' },
      { id: 'c', t: 'step', lane: 1, y: 330, dx: 0, w: 164, h: 56, tx: 'C', desc: '', form: '—', time: '—' },
    ];
    s0.edges = [];
    const s = themBuoc(s0, { tuId: 'a', nhanh: '', loai: 'step', cot: 1, ten: 'Chèn' });

    const trongCot = s.nodes.filter(n => n.lane === 1).sort((x, y2) => x.y - y2.y);
    for (let i = 1; i < trongCot.length; i++) {
      expect(trongCot[i].y).toBeGreaterThanOrEqual(trongCot[i - 1].y + trongCot[i - 1].h);
    }
    // thứ tự tương đối giữ nguyên: A trước Chèn trước B trước C
    expect(trongCot.map(n => n.tx)).toEqual(['A', 'Chèn', 'B', 'C']);
  });

  test('nhánh NG vào ĐÚNG cột của khối nguồn thì rơi xuống dưới, không chồng nguồn', () => {
    const s = themBuoc(base(), { tuId: 'n2', nhanh: 'ng', loai: 'step', cot: 1, ten: 'NG cùng cột' });
    const nguon = s.nodes.find(n => n.id === 'n2');
    const moi = s.nodes.find(n => n.tx === 'NG cùng cột');
    expect(nguon.y).toBe(220);                          // nguồn KHÔNG bị đẩy
    expect(moi.y).toBeGreaterThanOrEqual(nguon.y + nguon.h);
    expect(s.edges.find(e => e.b === moi.id).lbl).toBe('NG');   // vẫn là nhánh NG
  });
});

describe('xoá khối & đổi cột', () => {
  const base = () => ({
    lanes: [{ name: 'A', owner: 'Người A', color: '#111111' }, { name: 'B', owner: 'Người B', color: '#222222' }],
    phases: [{ name: 'G1', h: 400 }],
    nodes: [
      { id: 'n1', t: 'step', lane: 0, y: 40,  dx: 12, w: 164, h: 56, tx: 'A', desc: '', form: '—', time: '—' },
      { id: 'n2', t: 'step', lane: 0, y: 160, dx: 0,  w: 164, h: 56, tx: 'B', desc: '', form: '—', time: '—' },
    ],
    edges: [{ id: 'e1', a: 'n1', b: 'n2', lbl: '', k: 'n' }],
  });

  test('xoá khối kéo theo mọi đường nối của nó', () => {
    const s = xoaKhoi(base(), 'n2');
    expect(s.nodes).toHaveLength(1);
    expect(s.edges).toHaveLength(0);
  });

  test('đổi cột thì reset dx để khối căn giữa cột mới', () => {
    const s = doiCot(base(), 'n1', 1);
    const n1 = s.nodes.find(n => n.id === 'n1');
    expect(n1.lane).toBe(1);
    expect(n1.dx).toBe(0);
  });

  test('thuTuBuoc bỏ Bắt đầu/Kết thúc, xếp trên→dưới rồi trái→phải', () => {
    const s = base();
    s.nodes.push({ id: 'n0', t: 'start', lane: 0, y: 0, dx: 0, w: 164, h: 48, tx: 'Bắt đầu' });
    expect(thuTuBuoc(s)).toEqual(['n1', 'n2']);
  });
});

describe('tự xếp lại', () => {
  const base = () => ({
    lanes: [{ name: 'A', owner: 'a', color: '#111111' }, { name: 'B', owner: 'b', color: '#222222' }],
    phases: [{ name: 'G1', h: 300 }, { name: 'G2', h: 300 }],
    nodes: [
      { id: 'n1', t: 'step', lane: 0, y: 30,  dx: 37, w: 164, h: 56, tx: 'một',  desc: '', form: '—', time: '—' },
      { id: 'n2', t: 'step', lane: 1, y: 150, dx: -9, w: 164, h: 56, tx: 'hai',  desc: '', form: '—', time: '—' },
      { id: 'n3', t: 'step', lane: 0, y: 380, dx: 21, w: 164, h: 56, tx: 'ba',   desc: '', form: '—', time: '—' },
    ],
    edges: [],
  });

  test('mọi khối căn giữa cột — dx về 0', () => {
    const s = tuXepLai(base());
    expect(s.nodes.every(n => n.dx === 0)).toBe(true);
  });

  test('KHÔNG đảo thứ tự trên-dưới đã dựng', () => {
    const s = tuXepLai(base());
    const y = id => s.nodes.find(n => n.id === id).y;
    expect(y('n1')).toBeLessThan(y('n2'));
    expect(y('n2')).toBeLessThan(y('n3'));
  });

  test('khối vẫn nằm đúng giai đoạn cũ', () => {
    const goc = base();
    const s = tuXepLai(goc);
    for (const n of s.nodes) {
      const cu = goc.nodes.find(x => x.id === n.id);
      expect(phaseOf(s, n)).toBe(phaseOf(goc, cu));
    }
  });

  test('hai khối cùng tầm cao được giữ chung một tầng', () => {
    const g = base();
    g.nodes[1].y = 34;
    const s = tuXepLai(g);
    const n1 = s.nodes.find(n => n.id === 'n1'), n2 = s.nodes.find(n => n.id === 'n2');
    expect(n1.y).toBe(n2.y);
  });

  test('BẤT BIẾN — sơ đồ gốc không bị sửa', () => {
    const g = base(), truoc = JSON.stringify(g);
    tuXepLai(g);
    expect(JSON.stringify(g)).toBe(truoc);
  });

  test('hai khối CÙNG CỘT không bao giờ chung tầng — không có bước nào biến mất', () => {
    const g = base();
    g.nodes = [
      { id: 'x', t: 'step', lane: 0, y: 100, dx: 0, w: 164, h: 56, tx: 'X', desc: '', form: '—', time: '—' },
      { id: 'y', t: 'step', lane: 0, y: 130, dx: 0, w: 164, h: 56, tx: 'Y', desc: '', form: '—', time: '—' },
    ];
    const s = tuXepLai(g);
    const a = s.nodes.find(n => n.id === 'x'), b = s.nodes.find(n => n.id === 'y');
    expect(a.y).not.toBe(b.y);
    expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(Math.min(a.h, b.h));
  });

  test('khối cùng cột chồng nhau được GỠ ra, không phải bị giấu đi', () => {
    const g = base();
    g.nodes = [
      { id: 'd', t: 'dec',  lane: 0, y: 100, dx: 0, w: 150, h: 86, tx: 'Đạt?',   desc: '', form: '—', time: '—' },
      { id: 'r', t: 'step', lane: 0, y: 115, dx: 0, w: 164, h: 56, tx: 'Tái chế', desc: '', form: '—', time: '—' },
    ];
    const s = tuXepLai(g);
    const A = rectOf(s.nodes.find(n => n.id === 'd'));
    const B = rectOf(s.nodes.find(n => n.id === 'r'));
    const chong = A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h;
    expect(chong).toBe(false);
  });

  test('khác cột thì VẪN gộp chung tầng như cũ', () => {
    const g = base();
    g.nodes[1].y = 34;                    // n1 lane 0 y=30, n2 lane 1 y=34
    const s = tuXepLai(g);
    expect(s.nodes.find(n => n.id === 'n1').y).toBe(s.nodes.find(n => n.id === 'n2').y);
  });

  test('sơ đồ không có hàng nào thì trả bản sao, không nổ', () => {
    const g = { lanes: [{ name: 'A', owner: 'a', color: '#111111' }], phases: [], nodes: [], edges: [] };
    expect(() => tuXepLai(g)).not.toThrow();
    expect(tuXepLai(g).phases).toEqual([]);
  });
});
