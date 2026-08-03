import { describe, test, expect } from 'vitest';
import { LANE_W, LOAI_KHOI, nodeX, rectOf, drawW, drawH, phaseTop, phaseOf, timKhoi } from './quyTrinhSoDo';
import { routeEdge } from './quyTrinhSoDo';

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
