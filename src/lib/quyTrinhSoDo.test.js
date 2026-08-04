import { describe, test, expect } from 'vitest';
import { LANE_W, LOAI_KHOI, nodeX, rectOf, drawW, drawH, phaseTop, phaseOf, timKhoi } from './quyTrinhSoDo';
import { routeEdge } from './quyTrinhSoDo';
import { themBuoc, xoaKhoi, doiCot, thuTuBuoc } from './quyTrinhSoDo';
import { tuXepLai } from './quyTrinhSoDo';
import { xoaCot, xoaHang } from './quyTrinhSoDo';
import { hutHang, NGUONG_HUT } from './quyTrinhSoDo';
import { daiBuoc, DUNG_SAI_DAI } from './quyTrinhSoDo';

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

describe('kéo tay điều chỉnh đường nối — lech', () => {
  const nn = (id, lane, y, w = 164, h = 56) => ({ id, t: 'step', lane, y, dx: 0, w, h, tx: id });
  const mk = (nodes, ...edges) => ({
    lanes: [{}, {}, {}, {}], phases: [{ name: 'x', h: 900 }], nodes, edges,
  });
  const E = (them = {}) => ({ id: 'e', a: 'a', b: 'b', k: 'n', lbl: '', ...them });

  // MỐC BYTE — chuỗi d mà bản TỰ ĐỘNG (chưa có lech) sinh ra, chép nguyên văn.
  // Mọi sơ đồ đã lưu trong DB đều KHÔNG có lech; đổi một ký tự ở đây là đổi bản
  // in của tài liệu ISO đã ban hành, nên phải so từng byte chứ không so hình dạng.
  const MOC = {
    ngang:     'M188 128 L448 128',
    xuongThang:'M318 156 L318 300',
    xuongLech: 'M106 156 L106 219 Q106 228 115 228 L521 228 Q530 228 530 237 L530 300',
    lenLech:   'M106 400 L106 137 Q106 128 115 128 L448 128',
    lenThang:  'M318 400 L318 156',
  };
  const dung = {
    ngang:      lech => mk([nn('a', 0, 100), nn('b', 2, 100)], E({ lech })),
    xuongThang: lech => mk([nn('a', 1, 100), nn('b', 1, 300)], E({ lech })),
    xuongLech:  lech => mk([nn('a', 0, 100), nn('b', 2, 300)], E({ lech })),
    lenLech:    lech => mk([nn('a', 0, 400), nn('b', 2, 100)], E({ lech })),
    lenThang:   lech => mk([nn('a', 1, 400), nn('b', 1, 100)], E({ lech })),
  };
  const ve = (ten, lech) => {
    const s = dung[ten](lech);
    return routeEdge(s, s.edges[0]);
  };

  // Rút các điểm NEO của path (M · đầu mút L · đầu mút Q) thành một đường gấp
  // khúc, rồi hỏi "điểm này có nằm trên đó không". Cách duy nhất chứng minh núm
  // kéo đậu trên NÉT VẼ chứ không lửng lơ cạnh nó.
  const diemPath = (d) => {
    const so = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    const pts = [];
    let i = 0;
    for (const c of d.match(/[MLQ]/g) || []) {
      if (c === 'Q') i += 2;                 // bỏ điểm điều khiển, chỉ lấy đầu mút
      pts.push([so[i], so[i + 1]]);
      i += 2;
    }
    return pts;
  };
  // Mọi cặp toạ độ có mặt trong d, KỂ CẢ điểm điều khiển của Q. Góc bo 9px cắt
  // ngang qua đỉnh nên đỉnh không nằm trên nét vẽ — nó là điểm điều khiển. Muốn
  // chứng minh tu/den là đỉnh THẬT của đường thì phải soi ở đây.
  const dinhPath = d => (d.match(/-?\d+(?:\.\d+)?\s-?\d+(?:\.\d+)?/g) || [])
    .map(c => c.split(/\s+/).map(Number));
  const laDinh = (d, [x, y]) => dinhPath(d).some(p => p[0] === x && p[1] === y);
  const namTren = (d, [x, y]) => {
    const pts = diemPath(d);
    return pts.slice(0, -1).some((p, i) => {
      const q = pts[i + 1];
      const cheo = (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
      return Math.abs(cheo) < 1e-6
        && x >= Math.min(p[0], q[0]) - 1e-6 && x <= Math.max(p[0], q[0]) + 1e-6
        && y >= Math.min(p[1], q[1]) - 1e-6 && y <= Math.max(p[1], q[1]) + 1e-6;
    });
  };

  test('KHÔNG có lech → vẽ y hệt bản tự động, từng byte', () => {
    for (const ten of Object.keys(MOC)) expect(ve(ten, undefined).d).toBe(MOC[ten]);
  });

  test('lech = 0 → vẫn y hệt bản tự động, từng byte', () => {
    for (const ten of Object.keys(MOC)) expect(ve(ten, 0).d).toBe(MOC[ten]);
  });

  test('đích ở DƯỚI lệch cột: lech 40 hạ đoạn ngang xuống đúng 40, không đổi gì khác', () => {
    const a = ve('xuongLech', 0), b = ve('xuongLech', 40);
    expect(b.keo.y - a.keo.y).toBe(40);
    expect(b.keo.x).toBe(a.keo.x);
    expect(b.keo.tu[0]).toBe(a.keo.tu[0]);           // bề ngang đoạn ngang giữ nguyên
    expect(b.keo.den[0]).toBe(a.keo.den[0]);
    const dA = diemPath(a.d), dB = diemPath(b.d);
    expect(dB[0]).toEqual(dA[0]);                    // vẫn ra đúng cạnh dưới khối nguồn
    expect(dB.at(-1)).toEqual(dA.at(-1));            // vẫn đâm đúng cạnh trên khối đích
  });

  test('lech ÂM nâng đoạn ngang lên đúng bằng đó', () => {
    expect(ve('xuongLech', -40).keo.y - ve('xuongLech', 0).keo.y).toBe(-40);
  });

  test('vòng ngược LÊN: lech dịch nhánh DỌC sang ngang đúng bằng lech', () => {
    const a = ve('lenLech', 0), b = ve('lenLech', 30);
    expect(a.keo.huong).toBe('doc');
    expect(b.keo.x - a.keo.x).toBe(30);
    expect(b.keo.tu[0] - a.keo.tu[0]).toBe(30);
    expect(b.keo.den[0] - a.keo.den[0]).toBe(30);
    expect(diemPath(b.d).at(-1)).toEqual(diemPath(a.d).at(-1));   // vẫn đâm đúng cạnh bên khối đích
  });

  test('đoạn ngang mang huong "ngang", đoạn dọc mang huong "doc"', () => {
    expect(ve('xuongLech', 0).keo.huong).toBe('ngang');
    expect(ve('lenLech', 0).keo.huong).toBe('doc');
  });

  test('trường hợp KHÔNG chỉnh tay được trả keo:null và BỎ QUA lech', () => {
    for (const ten of ['ngang', 'xuongThang', 'lenThang']) {
      expect(ve(ten, 0).keo).toBeNull();
      expect(ve(ten, 120).keo).toBeNull();
      expect(ve(ten, 120).d).toBe(MOC[ten]);         // lech không được đụng vào
      expect(ve(ten, -120).d).toBe(MOC[ten]);
    }
  });

  test('keo.x / keo.y đậu ĐÚNG trên nét vẽ, và là trung điểm của tu–den', () => {
    for (const [ten, lech] of [['xuongLech', 0], ['xuongLech', 40], ['xuongLech', -30],
      ['lenLech', 0], ['lenLech', 40], ['lenLech', -40]]) {
      const r = ve(ten, lech);
      expect(namTren(r.d, [r.keo.x, r.keo.y])).toBe(true);
      expect(r.keo.x).toBe((r.keo.tu[0] + r.keo.den[0]) / 2);
      expect(r.keo.y).toBe((r.keo.tu[1] + r.keo.den[1]) / 2);
      // tu/den là ĐỈNH thật của đường (góc bo 9px cắt qua chúng nên chúng nằm
      // ở vai trò điểm điều khiển, không nằm trên nét) — không phải số bịa ra.
      expect(laDinh(r.d, r.keo.tu)).toBe(true);
      expect(laDinh(r.d, r.keo.den)).toBe(true);
    }
  });

  test('lech quá lớn bị KẸP — chỗ bẻ không lùi lên trên cạnh dưới khối nguồn', () => {
    const r = ve('xuongLech', -9999);
    expect(r.keo.y).toBeGreaterThan(100 + 56);       // vẫn nằm DƯỚI đáy khối nguồn
    const pts = diemPath(r.d);
    // Không quặt ngược: mọi điểm neo của path đều đi xuống hoặc ngang, không lên.
    for (let i = 1; i < pts.length; i++) expect(pts[i][1]).toBeGreaterThanOrEqual(pts[i - 1][1]);
    expect(Number.isFinite(r.keo.y)).toBe(true);
  });

  test('lech DƯƠNG quá lớn cũng bị kẹp trước cạnh trên khối đích', () => {
    const r = ve('xuongLech', 9999);
    expect(r.keo.y).toBeLessThan(300);               // chưa chạm cạnh trên khối đích
    const pts = diemPath(r.d);
    for (let i = 1; i < pts.length; i++) expect(pts[i][1]).toBeGreaterThanOrEqual(pts[i - 1][1]);
  });

  test('vòng ngược lên: lech quá lớn bị kẹp trong bề ngang khối nguồn', () => {
    const A = rectOf(dung.lenLech(0).nodes[0]);
    for (const l of [-9999, 9999]) {
      const r = ve('lenLech', l);
      expect(r.keo.x).toBeGreaterThan(A.x);
      expect(r.keo.x).toBeLessThan(A.x + A.w);
      expect(namTren(r.d, [r.keo.x, r.keo.y])).toBe(true);
    }
  });

  test('lech rác (chuỗi / NaN / null / true) → coi như 0, tuyệt đối không có NaN trong path', () => {
    for (const rac of ['40', 'abc', NaN, null, true, {}, [], Infinity, -Infinity]) {
      for (const ten of Object.keys(MOC)) {
        const r = ve(ten, rac);
        expect(r.d).toBe(MOC[ten]);
        expect(r.d).not.toMatch(/NaN|Infinity|undefined/);
        expect(r.nhan.every(Number.isFinite)).toBe(true);
        if (r.keo) {
          expect([r.keo.x, r.keo.y, ...r.keo.tu, ...r.keo.den].every(Number.isFinite)).toBe(true);
        }
      }
    }
  });

  test('HAI đường nối bẻ trùng chỗ → chỉnh lech một cái là tách ra', () => {
    // Đúng cảnh người dùng gặp: hai nhánh khác cột nhưng chỗ bẻ rơi cùng một
    // độ cao, hai đoạn ngang chồng khít lên nhau trên quãng x dùng chung.
    const s = mk(
      [nn('a1', 0, 100), nn('b1', 2, 300), nn('a2', 1, 108), nn('b2', 3, 292)],
      { id: 'e1', a: 'a1', b: 'b1', k: 'n', lbl: '' },
      { id: 'e2', a: 'a2', b: 'b2', k: 'n', lbl: '' },
    );
    const r1 = routeEdge(s, s.edges[0]), r2 = routeEdge(s, s.edges[1]);
    expect(r1.keo.y).toBe(r2.keo.y);                       // TRÙNG — đúng lỗi đang có
    const chungX = Math.min(r1.keo.den[0], r2.keo.den[0]) - Math.max(r1.keo.tu[0], r2.keo.tu[0]);
    expect(chungX).toBeGreaterThan(0);                     // và có quãng x dùng chung thật

    const s2 = { ...s, edges: [s.edges[0], { ...s.edges[1], lech: 24 }] };
    const r2b = routeEdge(s2, s2.edges[1]);
    expect(routeEdge(s2, s2.edges[0]).d).toBe(r1.d);       // đường KHÔNG chỉnh giữ nguyên
    expect(Math.abs(r2b.keo.y - r1.keo.y)).toBe(24);
  });

  test('lech đi cùng sơ đồ qua các phép biến đổi khác — không bị đánh rơi', () => {
    const s = mk([nn('a', 0, 100), nn('b', 2, 300)], E({ lech: 36 }));
    expect(xoaKhoi(s, 'khong-co').edges[0].lech).toBe(36);
    expect(doiCot(s, 'a', 1).edges[0].lech).toBe(36);
    expect(tuXepLai(s).edges[0].lech).toBe(36);
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

describe('xoá cột', () => {
  // Cột 1 (Kế hoạch) CỐ Ý bỏ trống — xoá cột còn khối là bị từ chối, nên bài
  // kiểm tra dồn chỉ số phải đặt chỗ trống đúng ở cột sắp xoá.
  const base = () => ({
    lanes: [
      { name: 'Kinh doanh', owner: 'NV Kinh doanh', color: '#111111' },
      { name: 'Kế hoạch',   owner: 'NV Kế hoạch',   color: '#222222' },
      { name: 'Kho',        owner: 'Thủ kho',       color: '#333333' },
      { name: 'Sản xuất',   owner: 'Tổ trưởng SX',  color: '#444444' },
      { name: 'QC',         owner: 'NV QC',         color: '#555555' },
    ],
    phases: [{ name: 'G1', h: 400 }],
    nodes: [
      { id: 'a', t: 'start', lane: 0, y: 30,  dx: 0, w: 164, h: 48, tx: 'Bắt đầu', desc: '', form: '—', time: '—' },
      { id: 'c', t: 'step',  lane: 2, y: 110, dx: 0, w: 164, h: 56, tx: 'Xuất kho', desc: '', form: '—', time: '—' },
      { id: 'd', t: 'step',  lane: 3, y: 190, dx: 0, w: 164, h: 56, tx: 'Lắp ráp',  desc: '', form: '—', time: '—' },
      { id: 'e', t: 'check', lane: 4, y: 270, dx: 0, w: 164, h: 56, tx: 'Kiểm QC',  desc: '', form: '—', time: '—' },
    ],
    edges: [
      { id: 'e1', a: 'a', b: 'c', lbl: '', k: 'n' },
      { id: 'e2', a: 'c', b: 'd', lbl: '', k: 'n' },
      { id: 'e3', a: 'd', b: 'e', lbl: '', k: 'n' },
    ],
  });

  const boPhan = (s, id) => s.lanes[s.nodes.find(n => n.id === id).lane].name;

  test('bỏ đúng cột khỏi danh sách, các cột còn lại giữ nguyên thứ tự', () => {
    const s = xoaCot(base(), 1);
    expect(s.lanes.map(l => l.name)).toEqual(['Kinh doanh', 'Kho', 'Sản xuất', 'QC']);
  });

  test('DỒN CHỈ SỐ — mọi khối vẫn thuộc đúng BỘ PHẬN cũ sau khi xoá cột giữa', () => {
    const g = base();
    const truoc = g.nodes.map(n => [n.id, g.lanes[n.lane].name]);
    const s = xoaCot(g, 1);
    for (const [id, ten] of truoc) expect(boPhan(s, id)).toBe(ten);
  });

  test('khối ở cột BÊN TRÁI chỗ xoá không bị dời chỉ số', () => {
    const s = xoaCot(base(), 1);
    expect(s.nodes.find(n => n.id === 'a').lane).toBe(0);
    expect(s.nodes.find(n => n.id === 'c').lane).toBe(1);   // 2 → 1
    expect(s.nodes.find(n => n.id === 'e').lane).toBe(3);   // 4 → 3
  });

  test('không đụng tới khối và đường nối — chỉ đổi chỉ số cột', () => {
    const s = xoaCot(base(), 1);
    expect(s.nodes).toHaveLength(4);
    expect(s.edges).toHaveLength(3);
    expect(s.nodes.map(n => n.y)).toEqual([30, 110, 190, 270]);
  });

  test('TỪ CHỐI xoá cột còn khối, và nói rõ còn mấy khối', () => {
    const g = base();
    expect(() => xoaCot(g, 2)).toThrow(/còn 1 khối/i);
    expect(() => xoaCot(g, 2)).toThrow(/Kho/);
  });

  test('TỪ CHỐI xoá cột cuối cùng còn lại', () => {
    const g = { lanes: [{ name: 'A', owner: 'a', color: '#111111' }], phases: [{ name: 'G1', h: 200 }], nodes: [], edges: [] };
    expect(() => xoaCot(g, 0)).toThrow(/ít nhất một cột/i);
  });

  test('chỉ số ngoài phạm vi → lỗi tiếng Việt rõ ràng, không nổ ngầm', () => {
    expect(() => xoaCot(base(), 9)).toThrow(/không có cột/i);
    expect(() => xoaCot(base(), -1)).toThrow(/không có cột/i);
    expect(() => xoaCot(base(), 1.5)).toThrow(/không có cột/i);
  });

  test('BẤT BIẾN — sơ đồ gốc không bị sửa', () => {
    const g = base(), truoc = JSON.stringify(g);
    xoaCot(g, 1);
    expect(JSON.stringify(g)).toBe(truoc);
  });

  test('bị từ chối thì KHÔNG đổi gì hết', () => {
    const g = base(), truoc = JSON.stringify(g);
    expect(() => xoaCot(g, 2)).toThrow();
    expect(JSON.stringify(g)).toBe(truoc);
  });
});

describe('xoá hàng giai đoạn', () => {
  // Hàng 0 CỐ Ý bỏ trống để xoá được; khối nằm ở hàng 1 và hàng 2.
  // Mốc hàng: G1 [0,130) · G2 [130,330) · G3 [330,480)
  const base = () => ({
    lanes: [
      { name: 'Kho', owner: 'Thủ kho',      color: '#111111' },
      { name: 'SX',  owner: 'Tổ trưởng SX', color: '#222222' },
    ],
    phases: [{ name: 'Tiếp nhận', h: 130 }, { name: 'Chuẩn bị', h: 200 }, { name: 'Sản xuất', h: 150 }],
    nodes: [
      { id: 'g2', t: 'step', lane: 0, y: 150, dx: 0, w: 164, h: 56, tx: 'Soạn hàng', desc: '', form: '—', time: '—' },
      { id: 'g3', t: 'step', lane: 1, y: 340, dx: 0, w: 164, h: 56, tx: 'Lắp ráp',   desc: '', form: '—', time: '—' },
    ],
    edges: [{ id: 'e1', a: 'g2', b: 'g3', lbl: '', k: 'n' }],
  });

  const giaiDoan = (s, id) => s.phases[phaseOf(s, s.nodes.find(n => n.id === id))].name;

  test('bỏ đúng hàng khỏi danh sách giai đoạn', () => {
    const s = xoaHang(base(), 0);
    expect(s.phases.map(p => p.name)).toEqual(['Chuẩn bị', 'Sản xuất']);
    expect(drawH(s)).toBe(350);
  });

  test('khối ở HÀNG 3 vẫn nằm ở hàng 2 — cùng một GIAI ĐOẠN, chỉ đổi số', () => {
    const g = base();
    expect(phaseOf(g, g.nodes.find(n => n.id === 'g3'))).toBe(2);
    expect(giaiDoan(g, 'g3')).toBe('Sản xuất');

    const s = xoaHang(g, 0);
    expect(phaseOf(s, s.nodes.find(n => n.id === 'g3'))).toBe(1);
    expect(giaiDoan(s, 'g3')).toBe('Sản xuất');
  });

  test('MỌI khối phía dưới dịch lên đúng bằng chiều cao hàng bị xoá', () => {
    const s = xoaHang(base(), 0);
    expect(s.nodes.find(n => n.id === 'g2').y).toBe(150 - 130);
    expect(s.nodes.find(n => n.id === 'g3').y).toBe(340 - 130);
  });

  test('khối ở hàng TRÊN chỗ xoá không bị dịch', () => {
    const g = base();
    g.nodes = [
      { id: 'tren', t: 'step', lane: 0, y: 30,  dx: 0, w: 164, h: 56, tx: 'Trên',  desc: '', form: '—', time: '—' },
      { id: 'duoi', t: 'step', lane: 0, y: 340, dx: 0, w: 164, h: 56, tx: 'Dưới',  desc: '', form: '—', time: '—' },
    ];
    g.edges = [];
    const s = xoaHang(g, 1);                        // xoá hàng GIỮA (đang trống), h = 200
    expect(s.nodes.find(n => n.id === 'tren').y).toBe(30);
    expect(s.nodes.find(n => n.id === 'duoi').y).toBe(340 - 200);
    expect(giaiDoan(s, 'tren')).toBe('Tiếp nhận');
    expect(giaiDoan(s, 'duoi')).toBe('Sản xuất');
  });

  test('TỪ CHỐI xoá hàng còn khối, và nói rõ còn mấy khối', () => {
    const g = base();
    expect(() => xoaHang(g, 1)).toThrow(/còn 1 khối/i);
    expect(() => xoaHang(g, 1)).toThrow(/Chuẩn bị/);
  });

  test('TỪ CHỐI xoá hàng cuối cùng còn lại', () => {
    const g = { lanes: [{ name: 'A', owner: 'a', color: '#111111' }], phases: [{ name: 'G1', h: 200 }], nodes: [], edges: [] };
    expect(() => xoaHang(g, 0)).toThrow(/ít nhất một hàng/i);
  });

  test('chỉ số ngoài phạm vi → lỗi tiếng Việt rõ ràng, không nổ ngầm', () => {
    expect(() => xoaHang(base(), 7)).toThrow(/không có hàng/i);
    expect(() => xoaHang(base(), -2)).toThrow(/không có hàng/i);
  });

  test('BẤT BIẾN — sơ đồ gốc không bị sửa', () => {
    const g = base(), truoc = JSON.stringify(g);
    xoaHang(g, 0);
    expect(JSON.stringify(g)).toBe(truoc);
  });

  test('bị từ chối thì KHÔNG đổi gì hết', () => {
    const g = base(), truoc = JSON.stringify(g);
    expect(() => xoaHang(g, 1)).toThrow();
    expect(JSON.stringify(g)).toBe(truoc);
  });

  test('giữ nguyên khối và đường nối — chỉ dịch toạ độ', () => {
    const s = xoaHang(base(), 0);
    expect(s.nodes).toHaveLength(2);
    expect(s.edges).toEqual([{ id: 'e1', a: 'g2', b: 'g3', lbl: '', k: 'n' }]);
  });
});

describe('hút ngang hàng khi kéo khối', () => {
  // h = 56 là khối Thao tác, h = 86 là khối Quyết định — đúng số ở LOAI_KHOI.
  const nn = (id, y, h = 56, lane = 0) => ({
    id, t: h === 86 ? 'dec' : 'step', lane, y, dx: 0, w: 164, h, tx: id,
  });
  const mk = (...nodes) => ({
    lanes: [{ name: 'A' }, { name: 'B' }], phases: [{ name: 'x', h: 600 }], nodes, edges: [],
  });

  test('tâm gần nhau trong ngưỡng → hút về đúng ngang hàng', () => {
    // A: y=100, h=56 → tâm 128. Kéo B tới y=104 → tâm 132, lệch 4.
    const s = mk(nn('A', 100), nn('B', 300));
    expect(hutHang(s, 'B', 104)).toEqual({ y: 100, mocY: 128 });
  });

  test('KHỐI CAO THẤP KHÁC NHAU — tâm bằng nhau, ĐỈNH thì không', () => {
    // Quyết định cao 86 ở y=100 → tâm 143. Thao tác cao 56 kéo tới y=112 → tâm 140.
    const s = mk(nn('QĐ', 100, 86), nn('TT', 400, 56));
    const r = hutHang(s, 'TT', 112);
    expect(r).toEqual({ y: 115, mocY: 143 });
    // Điều phải ghim: TÂM trùng khít…
    expect(115 + 56 / 2).toBe(100 + 86 / 2);
    // …còn ĐỈNH lệch hẳn 15px. Căn đỉnh là hai khối so le trông thấy trên bản in.
    expect(r.y - 100).toBe(15);
  });

  test('đúng bằng ngưỡng vẫn hút', () => {
    const s = mk(nn('A', 100), nn('B', 300));
    expect(hutHang(s, 'B', 110, 10)).toEqual({ y: 100, mocY: 128 });   // lệch đúng 10
  });

  test('quá ngưỡng 1px → nhả ra, mocY null và y giữ nguyên', () => {
    const s = mk(nn('A', 100), nn('B', 300));
    expect(hutHang(s, 'B', 111, 10)).toEqual({ y: 111, mocY: null });  // lệch 11
  });

  test('sơ đồ chỉ có một khối → không có gì để hút, mocY null', () => {
    const s = mk(nn('A', 100));
    expect(hutHang(s, 'A', 260)).toEqual({ y: 260, mocY: null });
  });

  test('KHÔNG bao giờ tự hút vào chính nó, kể cả khi y trong sơ đồ đã cũ', () => {
    // Trong lúc kéo, y lưu ở sơ đồ vẫn là chỗ cũ. Tính cả chính nó thì khối
    // bị ghim chết tại chỗ xuất phát, kéo đi 4px là bị kéo ngược về.
    const s = mk(nn('A', 100), nn('B', 500));
    expect(hutHang(s, 'B', 504)).toEqual({ y: 504, mocY: null });
  });

  test('id lạ → trả nguyên y, không nổ', () => {
    const s = mk(nn('A', 100), nn('B', 300));
    expect(hutHang(s, 'khong-co', 77)).toEqual({ y: 77, mocY: null });
    expect(hutHang(s, undefined, 77)).toEqual({ y: 77, mocY: null });
    expect(hutHang(null, 'A', 77)).toEqual({ y: 77, mocY: null });
  });

  test('nhiều khối trong tầm → chọn khối GẦN NHẤT', () => {
    // A tâm 128, B tâm 142. Kéo C tới tâm 136: lệch 8 và 6 → B thắng.
    const s = mk(nn('A', 100), nn('B', 114, 56, 1), nn('C', 400));
    expect(hutHang(s, 'C', 108)).toEqual({ y: 114, mocY: 142 });
  });

  test('cách đều hai bên → chọn khối có tâm NHỎ HƠN, không phụ thuộc thứ tự mảng', () => {
    // A tâm 128, B tâm 148, kéo C tới tâm 138 — lệch 10 cả hai.
    const nA = nn('A', 100), nB = nn('B', 120, 56, 1), nC = nn('C', 400);
    expect(hutHang(mk(nA, nB, nC), 'C', 110)).toEqual({ y: 100, mocY: 128 });
    expect(hutHang(mk(nB, nA, nC), 'C', 110)).toEqual({ y: 100, mocY: 128 });
  });

  test('ngưỡng truyền vào có tác dụng', () => {
    const s = mk(nn('A', 100), nn('B', 300));
    expect(hutHang(s, 'B', 104, 2)).toEqual({ y: 104, mocY: null });   // lệch 4 > 2
    expect(hutHang(s, 'B', 124, 30)).toEqual({ y: 100, mocY: 128 });   // lệch 24 < 30
  });

  test('BẤT BIẾN — không sửa sơ đồ gốc, chỉ trả số', () => {
    const s = mk(nn('A', 100), nn('B', 300));
    const truoc = JSON.stringify(s);
    hutHang(s, 'B', 104);
    expect(JSON.stringify(s)).toBe(truoc);
  });

  test('NGUONG_HUT là số dương để giao diện chia cho zoom', () => {
    expect(NGUONG_HUT).toBeGreaterThan(0);
  });
});

describe('dải bước — mỗi bước một hàng', () => {
  // h = 48 Bắt đầu/Kết thúc · 56 Thao tác · 86 Quyết định — đúng số ở LOAI_KHOI.
  const nn = (id, y, h = 56, lane = 0) => ({
    id, t: h === 86 ? 'dec' : 'step', lane, y, dx: 0, w: h === 86 ? 150 : 164, h, tx: id,
  });
  const mk = (cao, ...nodes) => ({
    lanes: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    phases: [{ name: 'x', h: cao }], nodes, edges: [],
  });

  // Điều DUY NHẤT không được phép xảy ra: vạch ngăn xẻ ngang một khối. Vạch nằm
  // ở y1 của mỗi dải từ dải thứ hai trở đi (y1 của dải đầu là mép trên trang,
  // y2 của dải cuối là mép dưới — không vẽ vạch nào ở đó).
  const catQuaKhoi = (s, dai) => dai.slice(1).some(
    d => s.nodes.some(n => n.y < d.y1 && d.y1 < n.y + n.h));

  test('sơ đồ rỗng hoặc hỏng → không có dải nào, không nổ', () => {
    expect(daiBuoc(mk(400))).toEqual([]);
    expect(daiBuoc(null)).toEqual([]);
    expect(daiBuoc({})).toEqual([]);
    expect(daiBuoc({ nodes: [null, 7, 'x'], phases: [{ h: 300 }] })).toEqual([]);
  });

  test('MỘT khối → một dải trùm trọn chiều cao trang', () => {
    expect(daiBuoc(mk(400, nn('A', 100)))).toEqual([{ tam: 128, y1: 0, y2: 400, ids: ['A'] }]);
  });

  test('HAI NHÁNH ĐÃ HÚT NGANG HÀNG — Quyết định 86 và Thao tác 56 tâm bằng nhau → CHUNG một dải', () => {
    // Đúng cặp số hutHang trả ra: dec y=100 h=86 và step y=115 h=56, tâm cùng 143.
    const s = mk(500, nn('Bước mới', 100, 86, 0), nn('Kiểm tra', 115, 56, 1));
    const d = daiBuoc(s);
    expect(d).toHaveLength(1);
    expect(d[0].ids).toEqual(['Bước mới', 'Kiểm tra']);
    expect(d[0].tam).toBe(143);
    // ĐỈNH hai khối lệch nhau 15px: gom theo đỉnh là tách nhầm thành hai dải,
    // đúng thứ người dùng vừa cất công hút cho bằng hàng.
    expect(115 - 100).toBe(15);
  });

  test('ids xếp TRÁI → PHẢI theo nodeX, không theo thứ tự trong mảng', () => {
    const s = mk(400, nn('phai', 100, 56, 2), nn('trai', 100, 56, 0), nn('giua', 100, 56, 1));
    expect(daiBuoc(s)[0].ids).toEqual(['trai', 'giua', 'phai']);
  });

  test('nhiều dải xếp TỪ TRÊN XUỐNG, mỗi dải đủ khối của nó', () => {
    const s = mk(700, nn('c1', 400, 56, 0), nn('a1', 60, 48, 0), nn('b2', 220, 56, 1), nn('b1', 220, 56, 0));
    const d = daiBuoc(s);
    expect(d.map(x => x.ids)).toEqual([['a1'], ['b1', 'b2'], ['c1']]);
    expect(d.map(x => x.tam)).toEqual([84, 248, 428]);
  });

  test('RANH GIỚI nằm chính giữa khe hở: đáy thấp nhất dải trên ↔ đỉnh cao nhất dải dưới', () => {
    // Dải 1: đáy 100+86 = 186 (khối kia đáy 171). Dải 2: đỉnh 260 (khối kia 268).
    // Giữa khe = (186 + 260) / 2 = 223.
    const s = mk(600, nn('A', 100, 86, 0), nn('B', 115, 56, 1), nn('C', 260, 56, 0), nn('D', 268, 56, 1));
    const d = daiBuoc(s);
    expect(d).toHaveLength(2);
    expect(d[0]).toEqual({ tam: 143, y1: 0, y2: 223, ids: ['A', 'B'] });
    expect(d[1]).toEqual({ tam: 292, y1: 223, y2: 600, ids: ['C', 'D'] });
    expect(catQuaKhoi(s, d)).toBe(false);
  });

  test('các dải LIỀN NHAU và phủ kín 0…drawH — không hở, không chồng', () => {
    const s = mk(720, nn('a', 40, 48), nn('b', 180), nn('c', 320, 86), nn('d', 500, 56, 1));
    const d = daiBuoc(s);
    expect(d).toHaveLength(4);
    expect(d[0].y1).toBe(0);
    expect(d[d.length - 1].y2).toBe(720);
    for (let i = 1; i < d.length; i++) expect(d[i].y1).toBe(d[i - 1].y2);
    expect(catQuaKhoi(s, d)).toBe(false);
  });

  test('tâm lệch TRONG dung sai → chung dải; quá dung sai → tách', () => {
    expect(DUNG_SAI_DAI).toBe(24);
    expect(daiBuoc(mk(600, nn('A', 100), nn('B', 124, 56, 1)))).toHaveLength(1);   // lệch đúng 24
    expect(daiBuoc(mk(600, nn('A', 100), nn('B', 125, 56, 1)))).toHaveLength(2);   // lệch 25
  });

  test('dung sai truyền vào có tác dụng', () => {
    const s = mk(600, nn('A', 100), nn('B', 140, 56, 1));   // tâm lệch 40
    expect(daiBuoc(s)).toHaveLength(2);
    expect(daiBuoc(s, 40)).toHaveLength(1);
    expect(daiBuoc(s, 0)).toHaveLength(2);
  });

  test('QUÉT NGẪU NHIÊN 200 sơ đồ — vạch ngăn không lần nào rơi vào trong một khối', () => {
    // Hạt cố định: test hỏng là dựng lại được đúng sơ đồ đó, không phải chạy lại
    // xem có ra nữa không. (mulberry32 — vài dòng, không thêm phụ thuộc nào.)
    const rng = (hat) => () => {
      hat = (hat + 0x6d2b79f5) | 0;
      let t = Math.imul(hat ^ (hat >>> 15), 1 | hat);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const CAO = [48, 56, 86];
    const hong = [];

    for (let hat = 1; hat <= 200; hat++) {
      const r = rng(hat);
      const nodes = [];
      const soHang = 1 + Math.floor(r() * 6);
      let day = 20;
      for (let h = 0; h < soHang; h++) {
        const k = 1 + Math.floor(r() * 3);
        const cao = Array.from({ length: k }, () => CAO[Math.floor(r() * 3)]);
        // Khe ≥ 40 giữa hai hàng, lệch tâm trong hàng ≤ 6 ⇒ hai hàng KHÔNG chồng
        // nhau theo chiều dọc và tâm cách nhau > 70, còn tâm trong cùng một hàng
        // cách nhau ≤ 12. Dung sai 24 vì thế phải cắt ra đúng soHang dải.
        const tam = day + 40 + Math.floor(r() * 60) + Math.max(...cao) / 2;
        const hang = cao.map((c, i) => nn(`h${h}k${i}`, tam + Math.floor(r() * 13) - 6 - c / 2, c, i));
        nodes.push(...hang);
        day = Math.max(...hang.map(n => n.y + n.h));
      }

      const s = mk(day + 60, ...nodes);
      const d = daiBuoc(s);
      if (d.length !== soHang) hong.push(`hạt ${hat}: ${d.length} dải, đáng ra ${soHang}`);
      if (catQuaKhoi(s, d)) hong.push(`hạt ${hat}: vạch ngăn CẮT QUA khối`);
      if (d[0].y1 !== 0) hong.push(`hạt ${hat}: dải đầu không bắt đầu từ 0`);
      if (d[d.length - 1].y2 !== day + 60) hong.push(`hạt ${hat}: dải cuối không chạm đáy trang`);
      for (let i = 0; i < d.length; i++) {
        if (d[i].y2 < d[i].y1) hong.push(`hạt ${hat}: dải ${i} lộn ngược`);
        if (i && d[i].y1 !== d[i - 1].y2) hong.push(`hạt ${hat}: hở giữa dải ${i - 1} và ${i}`);
        if (![d[i].tam, d[i].y1, d[i].y2].every(Number.isFinite)) hong.push(`hạt ${hat}: dải ${i} có số không hợp lệ`);
      }
    }
    expect(hong).toEqual([]);
  });

  test('GIỚI HẠN ĐÃ BIẾT — hai khối CHỒNG NHAU theo chiều dọc thì không đường ngang nào tách được', () => {
    // A: 100…156 (tâm 128). B: 125…181 (tâm 153). Tâm lệch 25 > dung sai nên là
    // hai dải, nhưng hai khối đè lên nhau 31px: mọi y giữa hai tâm đều nằm trong
    // khối này hoặc khối kia. Vạch vẫn đi qua — nó được vẽ DƯỚI khối nên bị chính
    // khối che, và người dùng chỉ cần hút hai khối cho bằng hàng là hết.
    const s = mk(400, nn('A', 100), nn('B', 125, 56, 1));
    const d = daiBuoc(s);
    expect(d).toHaveLength(2);
    expect(d[0].y2).toBe(140.5);       // (156 + 125) / 2
    expect(catQuaKhoi(s, d)).toBe(true);
  });

  test('khối bị kéo tụt xuống dưới đáy trang → dải cuối KHÔNG lộn ngược', () => {
    // Kéo khối bằng tay không nới chiều cao giai đoạn, nên chuyện này có thật.
    const s = mk(120, nn('A', 20), nn('B', 300, 56, 1));
    const d = daiBuoc(s);
    expect(d).toHaveLength(2);
    expect(d[1].y2).toBeGreaterThanOrEqual(d[1].y1);
    expect(d.every(x => [x.tam, x.y1, x.y2].every(Number.isFinite))).toBe(true);
  });

  test('toạ độ hỏng trong so_do (chuỗi, null, thiếu) → tính như 0, KHÔNG đẻ ra NaN', () => {
    const s = mk(300, { id: 'x', t: 'step', lane: 0, w: 164, h: 56, tx: 'x' },   // thiếu y
      { id: 'y', t: 'step', lane: 0, y: '200', dx: 0, w: 164, h: null, tx: 'y' });
    const d = daiBuoc(s);
    expect(d.every(x => [x.tam, x.y1, x.y2].every(Number.isFinite))).toBe(true);
    expect(d.flatMap(x => x.ids).sort()).toEqual(['x', 'y']);
  });

  test('BẤT BIẾN — không sửa sơ đồ gốc, chỉ đọc', () => {
    const s = mk(600, nn('A', 100, 86, 1), nn('B', 115, 56, 0), nn('C', 300));
    const truoc = JSON.stringify(s);
    daiBuoc(s);
    expect(JSON.stringify(s)).toBe(truoc);
  });
});
