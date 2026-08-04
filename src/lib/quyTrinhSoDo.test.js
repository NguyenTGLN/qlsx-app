import { describe, test, expect } from 'vitest';
import { LANE_W, LOAI_KHOI, nodeX, rectOf, drawW, drawH, timKhoi } from './quyTrinhSoDo';
import { soHangCua, themHang, SO_HANG_TOI_THIEU, SO_HANG_TOI_DA } from './quyTrinhSoDo';
import { routeEdge } from './quyTrinhSoDo';
import { themBuoc, xoaKhoi, doiCot, thuTuBuoc } from './quyTrinhSoDo';
import { datThuTu, boThuTu } from './quyTrinhSoDo';
import { tuXepLai } from './quyTrinhSoDo';
import { xoaCot, xoaHang } from './quyTrinhSoDo';
import { chuyenCot, cotTaiX } from './quyTrinhSoDo';
import { hutHang, NGUONG_HUT } from './quyTrinhSoDo';
import { daiBuoc } from './quyTrinhSoDo';
import { CAO_HANG, tamHang, hangCua, yTaiHang } from './quyTrinhSoDo';
import { soKhoiCat, lanDoc, diemGiao } from './quyTrinhSoDo';
import { CANH_NEO, DAI_MOI, diemNeo, canhHuong, neoHopLe } from './quyTrinhSoDo';
import { kepTrongTrang } from './quyTrinhSoDo';
import { tiLeTrenDuong, tiLeNhanHopLe } from './quyTrinhSoDo';
import { mauSoDo } from './quyTrinhMau';

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
  test('drawW theo số cột, drawH theo SỐ HÀNG', () => {
    expect(drawW(soDo)).toBe(2 * LANE_W);
    // soDo mẫu là bản CŨ (chỉ có phases): 130 + 200 = 330 ⇒ 3 hàng trọn.
    expect(drawH(soDo)).toBe(3 * CAO_HANG);
    expect(drawH({ ...soDo, soHang: 5 })).toBe(5 * CAO_HANG);
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

describe('số hàng (soDo.soHang) — cột "Bước" thay cột "Giai đoạn"', () => {
  test('soHang là nguồn sự thật khi có', () => {
    expect(soHangCua({ soHang: 4 })).toBe(4);
    expect(soHangCua({ soHang: 1 })).toBe(1);
    expect(drawH({ soHang: 4 })).toBe(4 * CAO_HANG);
  });

  test('sơ đồ mới tối thiểu HAI hàng', () => {
    expect(SO_HANG_TOI_THIEU).toBe(2);
    expect(soHangCua({})).toBe(2);
    expect(soHangCua(null)).toBe(2);
    expect(soHangCua({ phases: [] })).toBe(2);
  });

  test('soHang RÁC rơi về đường suy ra, không ép kiểu hộ', () => {
    const ps = [{ name: 'G', h: 5 * CAO_HANG }];
    for (const v of ['5', 5.5, 0, -3, NaN, null, {}, true]) {
      expect(soHangCua({ soHang: v, phases: ps }), `soHang = ${String(v)}`).toBe(5);
    }
  });

  // ĐO ĐƯỢC, không suy luận: daiBuoc dựng mảng dài đúng bằng số hàng, nên một
  // soHang khổng lồ (vẫn là số nguyên hợp lệ) làm Array.from cấp phát tới chết
  // tiến trình — không phải ném lỗi bắt được, mà là TRẮNG màn hình soạn thảo.
  // Cùng cửa ấy còn mở từ phases[].h của bản cũ, nên cả hai đường phải bị kẹp.
  test('SỐ HÀNG KHỔNG LỒ bị kẹp về trần — không dựng nổi mảng tỉ phần tử', () => {
    expect(SO_HANG_TOI_DA).toBe(500);
    for (const v of [1e9, 1e308, Number.MAX_SAFE_INTEGER, SO_HANG_TOI_DA + 1]) {
      expect(soHangCua({ soHang: v }), `soHang = ${v}`).toBe(SO_HANG_TOI_DA);
    }
    // …và qua cửa giai đoạn cũ
    expect(soHangCua({ phases: [{ name: 'g', h: 1e308 }] })).toBe(SO_HANG_TOI_DA);
    expect(soHangCua({ phases: [{ name: 'g', h: 1e11 }, { name: 'g2', h: 1e11 }] })).toBe(SO_HANG_TOI_DA);
  });

  test('dữ liệu hỏng KHÔNG làm vỡ trình vẽ — daiBuoc luôn ra mảng dựng được', () => {
    for (const g of [
      { soHang: 1e9, nodes: [], edges: [] },
      { phases: [{ name: 'g', h: 1e308 }], nodes: [], edges: [] },
      { soHang: Number.MAX_SAFE_INTEGER, nodes: [], edges: [] },
    ]) {
      expect(() => daiBuoc(g)).not.toThrow();
      expect(daiBuoc(g)).toHaveLength(SO_HANG_TOI_DA);
      expect(Number.isFinite(drawH(g))).toBe(true);
    }
  });

  // ── TƯƠNG THÍCH NGƯỢC — điều kiện SỐNG CÒN của thay đổi này ──
  // Mọi sơ đồ đang lưu trên bản chạy thật đều KHÔNG có khoá soHang: chúng chỉ có
  // phases = [{name, h}]. Chúng phải vẽ ra ĐÚNG chiều cao cũ, và không được mất
  // chữ người dùng đã gõ vào tên giai đoạn.
  const banCu = () => ({
    lanes: [{ name: 'Kho', owner: 'Thủ kho', color: '#111111' }],
    phases: [
      { name: 'Tiếp nhận', h: 1 * CAO_HANG },
      { name: 'Thực hiện', h: 3 * CAO_HANG },
      { name: 'Hoàn tất',  h: 2 * CAO_HANG },
    ],
    nodes: [
      { id: 'a', t: 'start', lane: 0, y: yTaiHang(0, 48), dx: 0, w: 164, h: 48, tx: 'a', desc: '', form: '—', time: '—' },
      { id: 'z', t: 'end',   lane: 0, y: yTaiHang(5, 48), dx: 0, w: 164, h: 48, tx: 'z', desc: '', form: '—', time: '—' },
    ],
    edges: [{ id: 'e1', a: 'a', b: 'z', lbl: '', k: 'n' }],
  });

  test('bản CŨ (có phases, không soHang) vẽ ra ĐÚNG chiều cao như trước', () => {
    const g = banCu();
    const caoCu = g.phases.reduce((s, p) => s + p.h, 0);   // đúng công thức drawH cũ
    expect(caoCu).toBe(720);
    expect(drawH(g)).toBe(caoCu);
    expect(soHangCua(g)).toBe(6);
  });

  test('bản CŨ KHÔNG mất dữ liệu phases qua các phép biến đổi', () => {
    const g = banCu();
    for (const s of [
      tuXepLai(g),
      themBuoc(g, { tuId: 'a', nhanh: '', loai: 'step', cot: 0, ten: 'B' }),
      xoaKhoi(g, 'z'),
      doiCot(g, 'a', 0),
    ]) {
      expect(s.phases).toEqual(g.phases);
    }
  });

  test('chiều cao giai đoạn LẺ (sơ đồ soạn trước khi có lưới) NỚI lên trọn hàng, không co lại', () => {
    const g = { phases: [{ name: 'G1', h: 130 }, { name: 'G2', h: 200 }] };   // 330
    expect(soHangCua(g)).toBe(3);
    expect(drawH(g)).toBe(360);
    expect(drawH(g)).toBeGreaterThanOrEqual(330);   // NỚI — không khối nào rơi ra ngoài
  });

  test('themHang cộng đúng MỘT hàng, và không đụng khối nào', () => {
    const g = banCu();
    const s = themHang(g);
    expect(soHangCua(s)).toBe(7);
    expect(drawH(s)).toBe(drawH(g) + CAO_HANG);
    expect(s.nodes).toEqual(g.nodes);
    expect(JSON.stringify(g)).toBe(JSON.stringify(banCu()));   // BẤT BIẾN
  });

  test('themHang trên sơ đồ MỚI: 2 hàng → 3 hàng', () => {
    expect(soHangCua(themHang(mauSoDo('SX')))).toBe(3);
  });
});

describe('lưới hàng — chiều cao các hàng bằng nhau', () => {
  test('CAO_HANG đủ chứa khối CAO NHẤT và còn hở', () => {
    const caoNhat = Math.max(...Object.values(LOAI_KHOI).map(t => t.h));
    expect(caoNhat).toBe(86);                 // Quyết định — khối cao nhất
    expect(CAO_HANG).toBe(120);
    expect(CAO_HANG - caoNhat).toBe(34);      // hở còn lại, đủ để khối không dính vạch
  });

  test('tamHang — tâm ô giữa hàng, hai hàng liền nhau cách đúng CAO_HANG', () => {
    expect(tamHang(0)).toBe(60);
    expect(tamHang(1)).toBe(180);
    expect(tamHang(4) - tamHang(3)).toBe(CAO_HANG);
  });

  test('QUYẾT ĐỊNH 86 và THAO TÁC 56 cùng hàng → TÂM bằng nhau, ĐỈNH lệch đúng 15', () => {
    // Điều phải ghim: đặt khối theo TÂM, không theo ĐỈNH. Căn đỉnh thì hai khối
    // "cùng bước" so le 15px — nhìn thấy rõ trên bản in A3.
    const yDec = yTaiHang(2, 86), yStep = yTaiHang(2, 56);
    expect(yDec + 86 / 2).toBe(tamHang(2));
    expect(yStep + 56 / 2).toBe(tamHang(2));
    expect(yDec + 86 / 2).toBe(yStep + 56 / 2);
    expect(yStep - yDec).toBe(15);
  });

  test('hangCua(yTaiHang) KHỨ HỒI đúng với mọi hàng và mọi chiều cao khối', () => {
    for (const r of [0, 1, 2, 3, 7, 40]) {
      for (const h of Object.values(LOAI_KHOI).map(t => t.h)) {
        expect(hangCua({ y: yTaiHang(r, h), h })).toBe(r);
      }
    }
  });

  test('hangCua bắt hàng GẦN NHẤT khi khối lệch khỏi tâm ô', () => {
    expect(hangCua({ y: yTaiHang(1, 56) + 59, h: 56 })).toBe(1);   // chưa quá nửa hàng
    expect(hangCua({ y: yTaiHang(1, 56) + 60, h: 56 })).toBe(2);   // đúng nửa hàng → sang hàng dưới
  });

  test('hàng ÂM vẫn tính được — khối bị kéo lên trên mép trang', () => {
    expect(tamHang(-1)).toBe(-60);
    expect(hangCua({ y: yTaiHang(-1, 56), h: 56 })).toBe(-1);
  });

  test('số âm / khổng lồ / hỏng KHÔNG đẻ ra NaN', () => {
    for (const r of [-3, -1, 0, 1e6, Infinity, -Infinity, NaN, null, undefined, '2', {}]) {
      expect(Number.isFinite(tamHang(r))).toBe(true);
      expect(Number.isFinite(yTaiHang(r, 56))).toBe(true);
      expect(Number.isFinite(yTaiHang(1, r))).toBe(true);
    }
    for (const n of [{}, null, undefined, { y: '10', h: null }, { y: NaN, h: 56 },
      { y: 1e9, h: 56 }, { y: -1e9, h: Infinity }]) {
      expect(Number.isFinite(hangCua(n))).toBe(true);
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

  test('bước mới rơi vào TÂM Ô của hàng NGAY DƯỚI khối nguồn, và được nối tự động', () => {
    // n1 ở y=100 h=56 ⇒ tâm 128 ⇒ hàng 1. Bước mới xuống hàng 2, tâm 300.
    const s = themBuoc(base(), { tuId: 'n1', nhanh: '', loai: 'check', cot: 2, ten: 'Kiểm QC' });
    const moi = s.nodes.find(n => n.tx === 'Kiểm QC');
    expect(moi).toBeTruthy();
    expect(moi.t).toBe('check');
    expect(moi.lane).toBe(2);
    expect(hangCua(moi)).toBe(hangCua(base().nodes[0]) + 1);
    expect(moi.y + moi.h / 2).toBe(tamHang(2));        // ĐÚNG tâm ô, không xê xích
    expect(moi.y).toBe(272);
    expect(s.edges.some(e => e.a === 'n1' && e.b === moi.id && e.k === 'n')).toBe(true);
  });

  test('nhánh NG rẽ NGANG — CÙNG HÀNG với khối nguồn và mang nhãn NG', () => {
    // n2 là Quyết định y=220 h=86 ⇒ tâm 263 ⇒ hàng 2. Nhánh NG ở lại hàng 2.
    const s = themBuoc(base(), { tuId: 'n2', nhanh: 'ng', loai: 'step', cot: 0, ten: 'Tái chế' });
    const moi = s.nodes.find(n => n.tx === 'Tái chế');
    expect(hangCua(moi)).toBe(hangCua(base().nodes[1]));
    expect(moi.y + moi.h / 2).toBe(tamHang(2));
    expect(moi.y).toBe(272);
    const e = s.edges.find(x => x.b === moi.id);
    expect(e.k).toBe('ng');
    expect(e.lbl).toBe('NG');
  });

  test('nguồn ĐÃ THẲNG LƯỚI thì nhánh NG NGANG BẰNG nó — tâm trùng, đỉnh lệch 15', () => {
    // Điều người dùng nhìn thấy: rẽ ngang phải thật sự nằm ngang. Đúng khi nguồn
    // đậu đúng tâm ô — mọi khối do themBuoc/tuXepLai đặt ra đều thế.
    const g = base();
    g.nodes[1].y = yTaiHang(2, 86);                    // Quyết định về đúng tâm hàng 2
    const s = themBuoc(g, { tuId: 'n2', nhanh: 'ng', loai: 'step', cot: 0, ten: 'Tái chế' });
    const nguon = s.nodes.find(n => n.id === 'n2');
    const moi = s.nodes.find(n => n.tx === 'Tái chế');
    expect(moi.y + moi.h / 2).toBe(nguon.y + nguon.h / 2);
    expect(moi.y - nguon.y).toBe(15);                  // đỉnh so le, tâm thì không
  });

  test('mọi khối thêm vào CÙNG MỘT HÀNG đều trùng tâm, dù cao thấp khác nhau', () => {
    const g = base();
    const a = themBuoc(g, { tuId: 'n1', nhanh: '', loai: 'dec',  cot: 0, ten: 'Hình thoi' });
    const b = themBuoc(g, { tuId: 'n1', nhanh: '', loai: 'step', cot: 2, ten: 'Chữ nhật' });
    const d = a.nodes.find(n => n.tx === 'Hình thoi'), t = b.nodes.find(n => n.tx === 'Chữ nhật');
    expect(d.h).toBe(86); expect(t.h).toBe(56);
    expect(d.y + d.h / 2).toBe(t.y + t.h / 2);         // TÂM bằng nhau…
    expect(t.y - d.y).toBe(15);                        // …ĐỈNH lệch đúng 15
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

  test('MỌC THÊM HÀNG khi lưu đồ dài ra — trang luôn chứa hết khối', () => {
    let s = base(); delete s.phases; s.soHang = 2;
    s = themBuoc(s, { tuId: 'n1', nhanh: '', loai: 'step', cot: 1, ten: 'Dài ra' });
    // và phải đủ chứa khối thấp nhất
    expect(drawH(s)).toBeGreaterThanOrEqual((hangCua(s.nodes.at(-1)) + 1) * CAO_HANG);
    expect(drawH(s) % CAO_HANG).toBe(0);
  });

  test('CHỈ NỚI, không co: trang cao sẵn 9 hàng thì thêm bước không rút ngắn nó', () => {
    let s = base(); delete s.phases; s.soHang = 9;
    s = themBuoc(s, { tuId: 'n1', nhanh: '', loai: 'step', cot: 1, ten: 'X' });
    expect(soHangCua(s)).toBe(9);
  });

  test('thêm bước LIÊN TỤC trên sơ đồ mẫu: trang luôn trọn hàng và chứa hết khối', () => {
    let s = mauSoDo('SX');
    let tu = 'n_start';
    for (let i = 0; i < 8; i++) {
      s = themBuoc(s, { tuId: tu, nhanh: '', loai: i % 3 === 1 ? 'dec' : 'step', cot: i % 3, ten: `B${i}` });
      tu = s.nodes.at(-1).id;
      expect(drawH(s) % CAO_HANG).toBe(0);
      // và khối nào cũng đậu đúng tâm ô, không khối nào lọt ra ngoài đáy trang
      for (const n of s.nodes) {
        expect(n.y + n.h / 2).toBe(tamHang(hangCua(n)));
        expect(n.y + n.h).toBeLessThanOrEqual(drawH(s));
      }
    }
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

  // Trước đây các tầng được dồn lên đầu TỪNG GIAI ĐOẠN, nên khoảng trống giữa
  // hai giai đoạn còn lại. Không còn giai đoạn thì cũng không còn mốc nào để dồn
  // vào: mọi tầng dồn lên từ hàng 0, LIỀN NHAU. Chiều cao trang vẫn CHỈ NỚI nên
  // chỗ trống ở đáy người dùng cố ý chừa ra không mất.
  test('mọi tầng dồn lên từ hàng 0, không chừa hàng trống ở giữa', () => {
    const s = tuXepLai(base());
    const hg = [...new Set(s.nodes.map(n => hangCua(n)))].sort((a, b) => a - b);
    expect(hg).toEqual([0, 1, 2]);
  });

  test('số hàng CHỈ NỚI — trang cao sẵn không bị co lại', () => {
    const g = base();                       // phases 300 + 300 = 600 ⇒ 5 hàng
    expect(soHangCua(g)).toBe(5);
    expect(soHangCua(tuXepLai(g))).toBe(5);            // 3 tầng, nhưng KHÔNG co về 3
    expect(soHangCua(tuXepLai({ ...g, soHang: 3 }))).toBe(3);
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

  test('sơ đồ không có khối nào thì trả bản sao, không nổ', () => {
    const g = { lanes: [{ name: 'A', owner: 'a', color: '#111111' }], phases: [], nodes: [], edges: [] };
    expect(() => tuXepLai(g)).not.toThrow();
    expect(tuXepLai(g).phases).toEqual([]);            // dữ liệu cũ đi theo nguyên vẹn
    expect(soHangCua(tuXepLai(g))).toBe(SO_HANG_TOI_THIEU);
  });

  test('sơ đồ MỚI (không có khoá phases) xếp lại được, không nổ', () => {
    const g = { lanes: [{ name: 'A' }], soHang: 2, nodes: [], edges: [] };
    expect(() => tuXepLai(g)).not.toThrow();
    expect(tuXepLai(g).phases).toBeUndefined();        // không mọc thêm khoá cũ
  });

  test('LƯỚI — mọi khối về đúng TÂM Ô sau khi xếp lại', () => {
    const s = tuXepLai(base());
    for (const n of s.nodes) expect(n.y + n.h / 2).toBe(tamHang(hangCua(n)));
  });

  test('trang luôn cao TRỌN HÀNG, kể cả từ giai đoạn cũ cao lẻ', () => {
    const g = base();
    g.phases = [{ name: 'G1', h: 137 }, { name: 'G2', h: 301 }];
    const s = tuXepLai(g);
    expect(drawH(s) % CAO_HANG).toBe(0);
    expect(s.phases).toEqual(g.phases);        // chữ người dùng gõ không bị sửa
  });

  test('SƠ ĐỒ XÔ LỆCH (kiểu đã lưu từ trước) — một lần bấm là về lưới, KHÔNG đảo hàng', () => {
    const g = {
      lanes: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      phases: [{ name: 'G1', h: 160 }, { name: 'G2', h: 320 }, { name: 'G3', h: 200 }],
      nodes: [
        { id: 'a', t: 'start', lane: 0, y: 46,  dx: 11, w: 164, h: 48, tx: 'a', desc: '', form: '—', time: '—' },
        { id: 'b', t: 'dec',   lane: 1, y: 133, dx: 0,  w: 150, h: 86, tx: 'b', desc: '', form: '—', time: '—' },
        { id: 'c', t: 'step',  lane: 2, y: 150, dx: -7, w: 164, h: 56, tx: 'c', desc: '', form: '—', time: '—' },
        { id: 'd', t: 'step',  lane: 0, y: 291, dx: 0,  w: 164, h: 56, tx: 'd', desc: '', form: '—', time: '—' },
        { id: 'e', t: 'end',   lane: 1, y: 553, dx: 3,  w: 164, h: 48, tx: 'e', desc: '', form: '—', time: '—' },
      ],
      edges: [],
    };
    const doc = ds => ds.slice().sort((x, y) => (x.y + x.h / 2) - (y.y + y.h / 2)).map(n => n.id);
    const truoc = doc(g.nodes);
    const s = tuXepLai(g);

    for (const n of s.nodes) {
      expect(n.y + n.h / 2).toBe(tamHang(hangCua(n)));   // đúng tâm ô
      expect(n.dx).toBe(0);
    }
    expect(doc(s.nodes)).toEqual(truoc);                 // KHÔNG đảo thứ tự hàng
    const hg = id => hangCua(s.nodes.find(n => n.id === id));
    expect(hg('b')).toBe(hg('c'));                       // vốn cùng tầng thì vẫn chung hàng
    expect(hg('a')).toBeLessThan(hg('b'));
    expect(drawH(s) % CAO_HANG).toBe(0);
    // và KHÔNG khối nào lọt ra ngoài đáy trang sau khi xếp
    for (const n of s.nodes) expect(n.y + n.h).toBeLessThanOrEqual(drawH(s));
  });

  test('BẤT ĐỘNG — xếp lại lần hai không dời thêm gì nữa', () => {
    const mot = tuXepLai(base());
    expect(JSON.stringify(tuXepLai(mot))).toBe(JSON.stringify(mot));
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

describe('chuyển cột — đổi chỗ cột bộ phận', () => {
  // MỖI CỘT một khối: bài kiểm tra quan trọng nhất của cả phép này là "khối nào
  // cũng còn đúng bộ phận cũ", nên phải có khối ở mọi cột để mà đối chiếu.
  // dx cố ý để lệch ở vài khối — nó là phần kéo tay TRONG cột, phải đi theo khối.
  const base = () => ({
    lanes: [
      { name: 'Kinh doanh', owner: 'NV Kinh doanh', color: '#111111' },
      { name: 'Kế hoạch',   owner: 'NV Kế hoạch',   color: '#222222' },
      { name: 'Kho',        owner: 'Thủ kho',       color: '#333333' },
      { name: 'Sản xuất',   owner: 'Tổ trưởng SX',  color: '#444444' },
      { name: 'QC',         owner: 'NV QC',         color: '#555555' },
    ],
    phases: [{ name: 'G1', h: 480 }],
    nodes: [
      { id: 'a', t: 'start', lane: 0, y: 30,  dx: 0,   w: 164, h: 48, tx: 'Bắt đầu',      desc: '',   form: '—',  time: '—' },
      { id: 'b', t: 'step',  lane: 1, y: 110, dx: -12, w: 164, h: 56, tx: 'Lên kế hoạch', desc: 'd1', form: 'F1', time: '1h' },
      { id: 'c', t: 'step',  lane: 2, y: 190, dx: 0,   w: 164, h: 56, tx: 'Xuất kho',     desc: '',   form: '—',  time: '—' },
      { id: 'd', t: 'step',  lane: 3, y: 270, dx: 24,  w: 164, h: 56, tx: 'Lắp ráp',      desc: '',   form: '—',  time: '—' },
      { id: 'e', t: 'check', lane: 4, y: 350, dx: 0,   w: 164, h: 56, tx: 'Kiểm QC',      desc: '',   form: '—',  time: '—' },
    ],
    edges: [
      { id: 'e1', a: 'a', b: 'b', lbl: '', k: 'n' },
      { id: 'e2', a: 'b', b: 'c', lbl: '', k: 'n' },
      { id: 'e3', a: 'c', b: 'd', lbl: '', k: 'n' },
      { id: 'e4', a: 'd', b: 'e', lbl: '', k: 'n' },
    ],
  });

  // Bộ phận của MỌI khối, đọc đúng lối bảng diễn giải đọc: soDo.lanes[n.lane].
  const boPhan = s => s.nodes.map(n => `${n.id}:${s.lanes[n.lane]?.name ?? '—'}`);

  test('BẤT BIẾN — chuyển cột thì khối nào cũng GIỮ NGUYÊN bộ phận của nó', () => {
    const g = base();
    const truoc = boPhan(g);
    const s = chuyenCot(g, 1, 3);
    expect(boPhan(s)).toEqual(truoc);
  });

  test('BẤT BIẾN giữ được với MỌI cặp (tu, den) — quét hết 5×5', () => {
    const truoc = boPhan(base());
    for (let tu = 0; tu < 5; tu++) {
      for (let den = 0; den < 5; den++) {
        expect(boPhan(chuyenCot(base(), tu, den))).toEqual(truoc);
      }
    }
  });

  test('DỜI CHỖ chứ không ĐỔI CHỖ — các cột khác dồn theo, không hoán vị', () => {
    // Cột 3 về vị trí 0: 0,1,2 dồn sang phải một bậc.
    expect(chuyenCot(base(), 3, 0).lanes.map(l => l.name))
      .toEqual(['Sản xuất', 'Kinh doanh', 'Kế hoạch', 'Kho', 'QC']);
    // Cột 1 sang vị trí 3: 2,3 dồn sang trái một bậc.
    expect(chuyenCot(base(), 1, 3).lanes.map(l => l.name))
      .toEqual(['Kinh doanh', 'Kho', 'Sản xuất', 'Kế hoạch', 'QC']);
  });

  test('chỉ số cột mới ĐÚNG CHỖ — cột đã chuyển đậu đúng vị trí `den`', () => {
    const s = chuyenCot(base(), 1, 3);
    expect(s.lanes[3].name).toBe('Kế hoạch');
    expect(s.nodes.find(n => n.id === 'b').lane).toBe(3);
    expect(s.nodes.find(n => n.id === 'c').lane).toBe(1);   // Kho: 2 → 1
    expect(s.nodes.find(n => n.id === 'd').lane).toBe(2);   // Sản xuất: 3 → 2
    expect(s.nodes.find(n => n.id === 'a').lane).toBe(0);   // ngoài quãng dời: đứng yên
    expect(s.nodes.find(n => n.id === 'e').lane).toBe(4);
  });

  test('ĐẦU → CUỐI', () => {
    const s = chuyenCot(base(), 0, 4);
    expect(s.lanes.map(l => l.name))
      .toEqual(['Kế hoạch', 'Kho', 'Sản xuất', 'QC', 'Kinh doanh']);
    expect(boPhan(s)).toEqual(boPhan(base()));
  });

  test('CUỐI → ĐẦU', () => {
    const s = chuyenCot(base(), 4, 0);
    expect(s.lanes.map(l => l.name))
      .toEqual(['QC', 'Kinh doanh', 'Kế hoạch', 'Kho', 'Sản xuất']);
    expect(boPhan(s)).toEqual(boPhan(base()));
  });

  test('lưu đồ chỉ có MỘT cột — không có chỗ nào để chuyển, trả nguyên sơ đồ cũ', () => {
    const g = {
      lanes: [{ name: 'A', owner: 'a', color: '#111111' }],
      phases: [{ name: 'G1', h: 200 }],
      nodes: [{ id: 'x', t: 'step', lane: 0, y: 10, dx: 0, w: 164, h: 56, tx: 'X' }],
      edges: [],
    };
    expect(chuyenCot(g, 0, 0)).toBe(g);
    expect(chuyenCot(g, 0, 1)).toBe(g);
  });

  test('HAI cột — đổi chỗ được, và cả hai khối vẫn đúng bộ phận', () => {
    const g = {
      lanes: [
        { name: 'Kho', owner: 'Thủ kho', color: '#111111' },
        { name: 'QC',  owner: 'NV QC',   color: '#222222' },
      ],
      phases: [{ name: 'G1', h: 200 }],
      nodes: [
        { id: 'x', t: 'step',  lane: 0, y: 10, dx: 0, w: 164, h: 56, tx: 'X' },
        { id: 'y', t: 'check', lane: 1, y: 90, dx: 0, w: 164, h: 56, tx: 'Y' },
      ],
      edges: [],
    };
    const s = chuyenCot(g, 0, 1);
    expect(s.lanes.map(l => l.name)).toEqual(['QC', 'Kho']);
    expect(s.nodes.find(n => n.id === 'x').lane).toBe(1);
    expect(s.nodes.find(n => n.id === 'y').lane).toBe(0);
    expect(boPhan(s)).toEqual(boPhan(g));
  });

  test('dx và MỌI trường khác của khối đi qua nguyên vẹn — chỉ `lane` đổi', () => {
    const g = base();
    const s = chuyenCot(g, 1, 3);
    for (const cu of g.nodes) {
      const moi = s.nodes.find(n => n.id === cu.id);
      expect({ ...moi, lane: cu.lane }).toEqual(cu);
    }
    expect(s.nodes.find(n => n.id === 'b').dx).toBe(-12);
    expect(s.nodes.find(n => n.id === 'd').dx).toBe(24);
  });

  test('đường nối, giai đoạn và thứ tự đánh tay đi theo nguyên vẹn', () => {
    const g = { ...base(), thuTu: ['d', 'b', 'c'] };
    const s = chuyenCot(g, 4, 1);
    expect(s.edges).toEqual(g.edges);
    expect(s.phases).toEqual(g.phases);
    expect(s.thuTu).toEqual(['d', 'b', 'c']);
    expect(s.thuTu).not.toBe(g.thuTu);          // chép ra, không dùng chung mảng
  });

  test('đối số rác → trả CHÍNH sơ đồ cũ, để giao diện khỏi tiêu một nấc hoàn tác', () => {
    const g = base();
    for (const [tu, den] of [
      [2, 2], [-1, 2], [2, -1], [5, 0], [0, 5], [1.5, 2], [2, 1.5],
      [NaN, 2], [2, NaN], ['1', 2], [2, '1'], [null, 2], [2, null],
      [undefined, 0], [Infinity, 0], [0, Infinity],
    ]) {
      expect(chuyenCot(g, tu, den)).toBe(g);
    }
  });

  test('sơ đồ hỏng (thiếu lanes) → trả nguyên sơ đồ cũ, không nổ', () => {
    const g = { nodes: [], edges: [], phases: [] };
    expect(chuyenCot(g, 0, 1)).toBe(g);
    expect(chuyenCot(null, 0, 1)).toBe(null);
  });

  test('lane RÁC trong so_do không bị gán bừa sang một bộ phận khác', () => {
    // so_do là jsonb: lane có thể là chuỗi, số ngoài phạm vi, null.
    // Luật đúng = luật bảng diễn giải đang đọc: lanes[lane]. Chuỗi '2' vẫn tra ra
    // đúng cột 2 nên PHẢI được dời theo; 99 và null vốn đã là '—' nên để yên.
    const g = base();
    g.nodes.push(
      { id: 'r1', t: 'step', lane: '2',  y: 400, dx: 0, w: 164, h: 56, tx: 'Rác chuỗi' },
      { id: 'r2', t: 'step', lane: 99,   y: 400, dx: 0, w: 164, h: 56, tx: 'Rác ngoài phạm vi' },
      { id: 'r3', t: 'step', lane: null, y: 400, dx: 0, w: 164, h: 56, tx: 'Rác null' },
    );
    const truoc = boPhan(g);
    const s = chuyenCot(g, 1, 3);
    expect(boPhan(s)).toEqual(truoc);
    expect(s.nodes.find(n => n.id === 'r1').lane).toBe(1);   // '2' → cột Kho, nay ở 1
    expect(s.nodes.find(n => n.id === 'r2').lane).toBe(99);  // vô nghĩa trước, vô nghĩa sau
    expect(s.nodes.find(n => n.id === 'r3').lane).toBe(null);
  });

  test('BẤT BIẾN — sơ đồ gốc không bị sửa', () => {
    const g = base(), truoc = JSON.stringify(g);
    chuyenCot(g, 1, 3);
    chuyenCot(g, 4, 0);
    expect(JSON.stringify(g)).toBe(truoc);
  });

  test('KHỨ HỒI — chuyển đi rồi chuyển về là y hệt bản đầu', () => {
    const g = base();
    expect(chuyenCot(chuyenCot(g, 1, 3), 3, 1)).toEqual(g);
    expect(chuyenCot(chuyenCot(g, 0, 4), 4, 0)).toEqual(g);
  });

  test('cotTaiX — hoành độ trên giấy đọc ra chỉ số cột, kẹp ở hai mép', () => {
    const g = base();
    expect(cotTaiX(g, 0)).toBe(0);
    expect(cotTaiX(g, LANE_W - 1)).toBe(0);
    expect(cotTaiX(g, LANE_W)).toBe(1);
    expect(cotTaiX(g, LANE_W * 3 + 5)).toBe(3);
    expect(cotTaiX(g, -500)).toBe(0);                  // kéo ra ngoài mép trái
    expect(cotTaiX(g, LANE_W * 99)).toBe(4);           // kéo ra ngoài mép phải
    expect(cotTaiX(g, NaN)).toBe(0);                   // rác tính như 0
    expect(cotTaiX({ lanes: [] }, 10)).toBe(0);
  });
});

describe('xoá hàng', () => {
  // Sơ đồ 4 hàng. Hàng 0 và hàng 3 CỐ Ý bỏ trống để xoá được; khối đậu đúng tâm
  // ô của hàng 1 và hàng 2.
  const base = () => ({
    lanes: [
      { name: 'Kho', owner: 'Thủ kho',      color: '#111111' },
      { name: 'SX',  owner: 'Tổ trưởng SX', color: '#222222' },
    ],
    soHang: 4,
    nodes: [
      { id: 'h1', t: 'step', lane: 0, y: yTaiHang(1, 56), dx: 0, w: 164, h: 56, tx: 'Soạn hàng', desc: '', form: '—', time: '—' },
      { id: 'h2', t: 'step', lane: 1, y: yTaiHang(2, 56), dx: 0, w: 164, h: 56, tx: 'Lắp ráp',   desc: '', form: '—', time: '—' },
    ],
    edges: [{ id: 'e1', a: 'h1', b: 'h2', lbl: '', k: 'n' }],
  });

  test('bớt đúng MỘT hàng khỏi trang', () => {
    const s = xoaHang(base(), 0);
    expect(soHangCua(s)).toBe(3);
    expect(drawH(s)).toBe(3 * CAO_HANG);
  });

  test('MỌI khối phía dưới dịch lên đúng MỘT hàng', () => {
    const s = xoaHang(base(), 0);
    expect(hangCua(s.nodes.find(n => n.id === 'h1'))).toBe(0);
    expect(hangCua(s.nodes.find(n => n.id === 'h2'))).toBe(1);
    // vẫn đậu đúng tâm ô, không lệch lưới
    for (const n of s.nodes) expect(n.y + n.h / 2).toBe(tamHang(hangCua(n)));
  });

  test('khối ở hàng TRÊN chỗ xoá không bị dịch', () => {
    const g = base();
    g.nodes[0].y = yTaiHang(0, 56);                 // h1 lên hàng 0
    const s = xoaHang(g, 1);                        // xoá hàng GIỮA (đang trống)
    expect(hangCua(s.nodes.find(n => n.id === 'h1'))).toBe(0);
    expect(hangCua(s.nodes.find(n => n.id === 'h2'))).toBe(1);
  });

  test('TỪ CHỐI xoá hàng còn khối, và nói rõ còn mấy khối', () => {
    const g = base();
    expect(() => xoaHang(g, 1)).toThrow(/còn 1 khối/i);
    expect(() => xoaHang(g, 1)).toThrow(/Bước 2/);
  });

  test('TỪ CHỐI xoá hàng cuối cùng còn lại', () => {
    const g = { lanes: [{ name: 'A', owner: 'a', color: '#111111' }], soHang: 1, nodes: [], edges: [] };
    expect(() => xoaHang(g, 0)).toThrow(/ít nhất một hàng/i);
  });

  test('BẢN CŨ (chỉ có phases) xoá hàng được, và giữ nguyên phases đã lưu', () => {
    const g = {
      lanes: [{ name: 'A' }],
      phases: [{ name: 'Tiếp nhận', h: 2 * CAO_HANG }, { name: 'Hoàn tất', h: CAO_HANG }],
      nodes: [], edges: [],
    };
    const s = xoaHang(g, 0);
    expect(soHangCua(s)).toBe(2);                   // 3 hàng → 2
    expect(s.phases).toEqual(g.phases);             // chữ người dùng gõ còn nguyên
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
    expect(s.edges).toEqual([{ id: 'e1', a: 'h1', b: 'h2', lbl: '', k: 'n' }]);
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
    const r = hutHang(s, 'B', 504);
    expect(r.y).not.toBe(500);          // KHÔNG bị kéo về chỗ xuất phát
    expect(r.mocY).toBeNull();          // và không gióng vào khối nào cả
    expect(r.y).toBe(yTaiHang(4, 56));  // rơi về tâm ô hàng 4 (512) — nam châm lưới
  });

  test('NAM CHÂM LƯỚI — kéo tới gần tâm ô thì hút vào tâm ô, KHÔNG vẽ đường gióng', () => {
    const s = mk(nn('A', 100));
    // tâm ô hàng 3 = 420 ⇒ khối cao 56 đậu ở y = 392. Kéo tới 396 (lệch 4).
    expect(hutHang(s, 'A', 396)).toEqual({ y: 392, mocY: null });
    // ngoài ngưỡng thì nhả ra, y giữ nguyên
    expect(hutHang(s, 'A', 381)).toEqual({ y: 381, mocY: null });
  });

  test('CÁCH ĐỀU tâm khối và tâm ô → khối thắng, để còn thấy đường gióng', () => {
    // A đặt đúng tâm ô hàng 1 (180) ⇒ hai nam châm TRÙNG NHAU, phải ra đường gióng.
    const s = mk(nn('A', yTaiHang(1, 56)), nn('B', 600));
    expect(hutHang(s, 'B', yTaiHang(1, 56) + 6)).toEqual({ y: yTaiHang(1, 56), mocY: 180 });
  });

  test('toạ độ hỏng ở khối khác KHÔNG kéo theo NaN vào khối đang kéo', () => {
    const s = mk({ id: 'X', t: 'step', lane: 0, y: 'abc', dx: 0, w: 164, h: 56, tx: 'X' }, nn('B', 300));
    const r = hutHang(s, 'B', 304);
    expect(Number.isFinite(r.y)).toBe(true);
    expect(r.mocY === null || Number.isFinite(r.mocY)).toBe(true);
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

describe('dải bước — HÀNG ĐỀU, mỗi hàng cao đúng CAO_HANG', () => {
  // h = 48 Bắt đầu/Kết thúc · 56 Thao tác · 86 Quyết định — đúng số ở LOAI_KHOI.
  const nn = (id, y, h = 56, lane = 0) => ({
    id, t: h === 86 ? 'dec' : 'step', lane, y, dx: 0, w: h === 86 ? 150 : 164, h, tx: id,
  });
  const mk = (cao, ...nodes) => ({
    lanes: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    phases: [{ name: 'x', h: cao }], nodes, edges: [],
  });
  /** Khối đặt ĐÚNG LƯỚI ở hàng r — đúng chỗ themBuoc / tuXepLai đặt nó. */
  const oHang = (id, r, h = 56, lane = 0) => nn(id, yTaiHang(r, h), h, lane);

  // Sơ đồ rỗng hay hỏng vẫn ra ĐÚNG SO_HANG_TOI_THIEU dải trống, không nổ. Bản
  // cũ trả mảng rỗng vì chiều cao trang suy từ phases; nay trang mới nào cũng có
  // sẵn hai hàng, nên "không hàng nào" không còn là trạng thái hợp lệ.
  test('sơ đồ rỗng hoặc hỏng → vẫn ra hai dải trống, không nổ', () => {
    for (const g of [null, {}, { nodes: [], phases: [] }, { nodes: [null, 7, 'x'], phases: [] }]) {
      const d = daiBuoc(g);
      expect(d).toHaveLength(SO_HANG_TOI_THIEU);
      expect(d.every(x => x.ids.length === 0)).toBe(true);
    }
  });

  test('trang CÓ chiều cao nhưng CHƯA có khối nào → vẫn đủ hàng, ids rỗng', () => {
    // Lưới có TRƯỚC, khối rơi vào lưới sau. Bản cũ gom theo khối nên trang trống
    // là không thấy hàng nào — không biết đặt khối vào đâu cho thẳng.
    const d = daiBuoc(mk(480));
    expect(d).toHaveLength(4);
    expect(d.every(x => x.ids.length === 0)).toBe(true);
    expect(d.map(x => x.y1)).toEqual([0, 120, 240, 360]);
  });

  test('MỌI dải cao ĐÚNG CAO_HANG và lợp kín 0…drawH — không hở, không chồng', () => {
    const s = mk(720, oHang('a', 0, 48), oHang('b', 2, 86, 1), oHang('c', 5));
    const d = daiBuoc(s);
    expect(d).toHaveLength(6);
    expect(d.every(x => x.y2 - x.y1 === CAO_HANG)).toBe(true);
    expect(d[0].y1).toBe(0);
    expect(d.at(-1).y2).toBe(drawH(s));
    for (let i = 1; i < d.length; i++) expect(d[i].y1).toBe(d[i - 1].y2);
  });

  test('CHIỀU CAO HÀNG KHÔNG PHỤ THUỘC chỗ khối đứng — đúng điều người dùng yêu cầu', () => {
    const goc    = mk(600, nn('A', 30), nn('B', 400, 86, 1));
    const xoTung = mk(600, nn('A', 137), nn('B', 211, 86, 1));
    const cao = s => daiBuoc(s).map(d => d.y2 - d.y1);
    expect(cao(goc)).toEqual(cao(xoTung));
    expect([...new Set(cao(goc))]).toEqual([CAO_HANG]);
  });

  test('tam của dải là TÂM Ô — không phải trung bình tâm các khối trong đó', () => {
    const d = daiBuoc(mk(360, oHang('a', 1, 86), oHang('b', 1, 56, 1)));
    expect(d.map(x => x.tam)).toEqual([tamHang(0), tamHang(1), tamHang(2)]);
  });

  test('QUYẾT ĐỊNH 86 và THAO TÁC 56 cùng hàng → CHUNG một dải', () => {
    const d = daiBuoc(mk(480, oHang('Bước mới', 1, 86, 0), oHang('Kiểm tra', 1, 56, 1)));
    expect(d[1].ids).toEqual(['Bước mới', 'Kiểm tra']);
    expect(d.filter(x => x.ids.length)).toHaveLength(1);
    // ĐỈNH hai khối vẫn lệch 15px — gom theo đỉnh là tách nhầm chúng ra.
    const [a, b] = [yTaiHang(1, 86), yTaiHang(1, 56)];
    expect(b - a).toBe(15);
  });

  test('ids xếp TRÁI → PHẢI theo nodeX, không theo thứ tự trong mảng', () => {
    const d = daiBuoc(mk(360, oHang('phai', 1, 56, 2), oHang('trai', 1, 56, 0), oHang('giua', 1, 56, 1)));
    expect(d[1].ids).toEqual(['trai', 'giua', 'phai']);
  });

  test('mỗi khối nằm ĐÚNG MỘT dải, và là dải chứa TÂM nó', () => {
    const s = mk(720, oHang('a', 0, 48), oHang('b', 1, 86, 1), oHang('c', 1, 56, 2), oHang('d', 4));
    const d = daiBuoc(s);
    expect(d.flatMap(x => x.ids).sort()).toEqual(['a', 'b', 'c', 'd']);
    for (const x of d) {
      for (const id of x.ids) {
        const n = s.nodes.find(m => m.id === id);
        expect(n.y + n.h / 2).toBeGreaterThanOrEqual(x.y1);
        expect(n.y + n.h / 2).toBeLessThan(x.y2);
      }
    }
  });

  test('khối LỆCH LƯỚI (sơ đồ lưu từ trước) rơi vào hàng GẦN NHẤT, dải vẫn đều', () => {
    const s = mk(480, nn('A', 100), nn('B', 265, 86, 1));
    const d = daiBuoc(s);
    expect(d.every(x => x.y2 - x.y1 === CAO_HANG)).toBe(true);
    expect(d[1].ids).toEqual(['A']);      // tâm 128 → hàng 1
    expect(d[2].ids).toEqual(['B']);      // tâm 308 → hàng 2
  });

  test('khối bị kéo TỤT quá đáy trang → nới thêm hàng, không dải nào lộn ngược', () => {
    // Kéo khối bằng tay không nới chiều cao giai đoạn, nên chuyện này có thật.
    const d = daiBuoc(mk(120, nn('A', 20), oHang('B', 4)));
    expect(d).toHaveLength(5);
    expect(d.every(x => x.y2 - x.y1 === CAO_HANG)).toBe(true);
    expect(d[4].ids).toEqual(['B']);
  });

  test('khối bị kéo lên TRÊN mép trang → gom về hàng 0, không biến mất', () => {
    const d = daiBuoc(mk(360, nn('tren', -400)));
    expect(d[0].ids).toEqual(['tren']);
    expect(d.flatMap(x => x.ids)).toEqual(['tren']);
  });

  test('toạ độ hỏng trong so_do (chuỗi, null, thiếu) → tính như 0, KHÔNG đẻ ra NaN', () => {
    const s = mk(300, { id: 'x', t: 'step', lane: 0, w: 164, h: 56, tx: 'x' },   // thiếu y
      { id: 'y', t: 'step', lane: 0, y: '200', dx: 0, w: 164, h: null, tx: 'y' },
      null, 7, 'x');
    const d = daiBuoc(s);
    expect(d.every(x => [x.tam, x.y1, x.y2].every(Number.isFinite))).toBe(true);
    expect(d.flatMap(x => x.ids).sort()).toEqual(['x', 'y']);
  });

  test('QUÉT NGẪU NHIÊN 200 sơ đồ — dải luôn đều, luôn kín, khối nào cũng có dải', () => {
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
      for (let h = 0; h < soHang; h++) {
        const k = 1 + Math.floor(r() * 3);
        // CỐ Ý xô lệch khỏi lưới ±40px: sơ đồ lưu từ trước lệch tứ tung, dải vẫn
        // phải đều tăm tắp và không được đánh rơi khối nào.
        for (let i = 0; i < k; i++) {
          const c = CAO[Math.floor(r() * 3)];
          nodes.push(nn(`h${h}k${i}`, yTaiHang(h, c) + Math.floor(r() * 81) - 40, c, i));
        }
      }
      const cao = (1 + Math.floor(r() * 9)) * CAO_HANG;
      const s = mk(cao, ...nodes);
      const d = daiBuoc(s);

      if (!d.length) hong.push(`hạt ${hat}: không có dải nào`);
      if (d[0].y1 !== 0) hong.push(`hạt ${hat}: dải đầu không bắt đầu từ 0`);
      if (d.at(-1).y2 < cao) hong.push(`hạt ${hat}: dải cuối chưa chạm đáy trang`);
      const co = d.flatMap(x => x.ids).sort();
      if (co.length !== nodes.length) hong.push(`hạt ${hat}: ${co.length}/${nodes.length} khối có dải`);
      for (let i = 0; i < d.length; i++) {
        if (d[i].y2 - d[i].y1 !== CAO_HANG) hong.push(`hạt ${hat}: dải ${i} cao ${d[i].y2 - d[i].y1}`);
        if (i && d[i].y1 !== d[i - 1].y2) hong.push(`hạt ${hat}: hở giữa dải ${i - 1} và ${i}`);
        if (![d[i].tam, d[i].y1, d[i].y2].every(Number.isFinite)) hong.push(`hạt ${hat}: dải ${i} có số không hợp lệ`);
      }
    }
    expect(hong).toEqual([]);
  });

  test('BẤT BIẾN — không sửa sơ đồ gốc, chỉ đọc', () => {
    const s = mk(600, oHang('A', 1, 86, 1), oHang('B', 1, 56, 0), oHang('C', 3));
    const truoc = JSON.stringify(s);
    daiBuoc(s);
    expect(JSON.stringify(s)).toBe(truoc);
  });
});

// ── LÁCH KHỐI ────────────────────────────────────────────────────
// Lỗi người dùng chỉ trên ảnh chụp: một nhánh dọc bổ THẲNG QUA ba khối liền.
const K = (id, lane, hang, t = 'step') => {
  const T = LOAI_KHOI[t];
  return { id, t, lane, y: yTaiHang(hang, T.h), dx: 0, w: T.w, h: T.h, tx: id };
};
const mkS = (soCot, nodes, ...edges) => ({
  lanes: Array.from({ length: soCot }, () => ({})),
  phases: [{ name: 'x', h: 8 * CAO_HANG }],
  nodes, edges,
});
const veE = (s, i = 0) => routeEdge(s, s.edges[i]);

describe('lách khối — nhánh dọc tránh khối chắn', () => {
  test('soKhoiCat — đếm khối bị cắt, CHẠM MÉP không tính, bỏ qua khối đầu/cuối', () => {
    const s = mkS(3, [K('a', 0, 0), K('c', 0, 1), K('b', 0, 2)]);
    const A = rectOf(s.nodes[1]);
    expect(soKhoiCat(s, [[A.cx, 0], [A.cx, 900]], [])).toBe(3);
    expect(soKhoiCat(s, [[A.cx, 0], [A.cx, 900]], ['a', 'b'])).toBe(1);
    expect(soKhoiCat(s, [[A.x, 0], [A.x, 900]], [])).toBe(0);          // đúng mép trái
    expect(soKhoiCat(s, [[A.x + A.w, 0], [A.x + A.w, 900]], [])).toBe(0);
    expect(soKhoiCat(s, [[0, A.cy], [900, A.cy]], [])).toBe(1);        // ngang, cắt đúng một khối
  });

  test('soKhoiCat — số rác không đẻ ra kết quả bừa', () => {
    const s = mkS(3, [{ id: 'x', t: 'step', lane: 0, y: '10', dx: null, w: NaN, h: 56, tx: 'x' }]);
    expect(Number.isFinite(soKhoiCat(s, [[106, 0], [106, 900]], []))).toBe(true);
    expect(soKhoiCat(null, [[0, 0], [1, 1]], [])).toBe(0);
    expect(soKhoiCat(mkS(1, []), null, [])).toBe(0);
  });

  test('lanDoc — mép cột và tim cột, tăng dần', () => {
    expect(lanDoc({ lanes: [{}, {}] })).toEqual([0, 106, 212, 318, 424]);
    expect(lanDoc(null)).toEqual([0]);
  });

  test('KHÔNG có khối chắn → d y hệt bản cũ, từng byte', () => {
    const e = { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' };
    const s1 = mkS(3, [K('a', 0, 0), K('b', 2, 2)], e);
    const s2 = mkS(3, [K('a', 0, 0), K('b', 2, 2), K('x', 1, 6)], e);
    expect(veE(s1).d).toBe('M106 88 L106 171 Q106 180 115 180 L521 180 Q530 180 530 189 L530 272');
    expect(veE(s2).d).toBe(veE(s1).d);
  });

  test('nhánh dọc XUYÊN QUA BA KHỐI cùng cột → lách sang làn trống, không cắt khối nào nữa', () => {
    const s = mkS(3, [K('a', 0, 0), K('c1', 0, 1), K('c2', 0, 2), K('c3', 0, 3), K('b', 0, 4)],
      { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' });
    expect(soKhoiCat(s, [[106, 88], [106, 512]], ['a', 'b'])).toBe(3);   // bản cũ: bổ qua 3 khối
    const r = veE(s);
    expect(soKhoiCat(s, r.pts, ['a', 'b'])).toBe(0);
    expect(r.keo.huong).toBe('doc');
    expect(r.pts.some(p => p[0] === 212)).toBe(true);                    // làn giữa cột 0 và 1
  });

  test('vòng ngược LÊN xuyên khối → cũng lách', () => {
    const s = mkS(3, [K('b', 2, 0), K('c1', 0, 1), K('c2', 0, 2), K('a', 0, 3)],
      { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' });
    expect(soKhoiCat(s, [[106, 392], [106, 60], [448, 60]], ['a', 'b'])).toBe(2);
    expect(soKhoiCat(s, veE(s).pts, ['a', 'b'])).toBe(0);
  });

  test('không làn nào đỡ hơn → GIỮ NGUYÊN bản cũ, không nổ', () => {
    // Khối chắn trải rộng −50…250, trùm KÍN cả hai làn ứng viên (0 và 212).
    const chan = { id: 'c', t: 'step', lane: 0, y: yTaiHang(1, 56), dx: -6, w: 300, h: 56, tx: 'c' };
    const s = mkS(1, [K('a', 0, 0), chan, K('b', 0, 2)], { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' });
    expect(veE(s).d).toBe('M106 88 L106 272');
  });

  test('đường vòng: lech vẫn nhích được nhánh dọc, và vẫn bị KẸP', () => {
    const nodes = [K('a', 0, 0), K('c1', 0, 1), K('c2', 0, 2), K('c3', 0, 3), K('b', 0, 4)];
    const mkE = lech => mkS(3, nodes, { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '', lech });
    const a = veE(mkE(0)), b = veE(mkE(40));
    expect(b.keo.x - a.keo.x).toBe(40);
    expect(b.keo.tu[0] - a.keo.tu[0]).toBe(40);
    expect(veE(mkE(-9999)).keo.x).toBe(0);
    expect(veE(mkE(9999)).keo.x).toBe(drawW(mkE(0)));
    for (const l of [0, 40, -40, 9999, -9999]) {
      const r = veE(mkE(l));
      expect(r.d).not.toMatch(/NaN|Infinity|undefined/);
      expect(r.keo.x).toBe((r.keo.tu[0] + r.keo.den[0]) / 2);
    }
  });

  test('lech rác trên đường vòng → coi như 0', () => {
    const nodes = [K('a', 0, 0), K('c1', 0, 1), K('c2', 0, 2), K('b', 0, 3)];
    const goc = veE(mkS(3, nodes, { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' })).d;
    for (const rac of ['40', 'abc', NaN, null, true, {}, []]) {
      expect(veE(mkS(3, nodes, { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '', lech: rac })).d).toBe(goc);
    }
  });

  test('đi NGANG cùng tầm cao thì không lách — chỉ nhánh DỌC mới xét', () => {
    const s = mkS(3, [K('a', 0, 0), K('c', 1, 0), K('b', 2, 0)],
      { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' });
    expect(veE(s).d).toBe('M188 60 L448 60');
  });
});

// ── NHỊP CẦU ─────────────────────────────────────────────────────
describe('diemGiao — chỗ hai đường nối cắt nhau', () => {
  // e1 bẻ ngang ở y=180 chạy từ x=106 tới x=742; e2 bổ dọc ở x=318 từ y=88 tới 272.
  const cheo = () => mkS(4,
    [K('a1', 0, 0), K('b1', 3, 2), K('a2', 1, 0), K('b2', 1, 2)],
    { id: 'e1', a: 'a1', b: 'b1', k: 'n', lbl: '' },
    { id: 'e2', a: 'a2', b: 'b2', k: 'n', lbl: '' });

  test('cắt nhau THẬT → đúng một điểm, đúng chỗ', () => {
    expect(diemGiao(cheo())).toEqual([{ x: 318, y: 180 }]);
  });

  test('chữ T — đầu mút đường này đậu ĐÚNG trên đường kia → KHÔNG tính', () => {
    const s = cheo();
    s.nodes[3] = { ...s.nodes[3], y: 180 };        // b2 có cạnh trên đúng y=180
    expect(diemGiao(s)).toEqual([]);
  });

  test('chung khối nguồn → KHÔNG tính là cắt', () => {
    const s = mkS(3, [K('a', 1, 0), K('b', 0, 2), K('c', 2, 2)],
      { id: 'e1', a: 'a', b: 'b', k: 'n', lbl: '' },
      { id: 'e2', a: 'a', b: 'c', k: 'n', lbl: '' });
    expect(diemGiao(s)).toEqual([]);
  });

  test('hai đoạn NGANG trùng nhau → KHÔNG tính là cắt', () => {
    const s = mkS(4, [K('a1', 0, 0), K('b1', 2, 2), K('a2', 1, 0), K('b2', 3, 2)],
      { id: 'e1', a: 'a1', b: 'b1', k: 'n', lbl: '' },
      { id: 'e2', a: 'a2', b: 'b2', k: 'n', lbl: '' });
    const r1 = routeEdge(s, s.edges[0]), r2 = routeEdge(s, s.edges[1]);
    expect(r1.keo.y).toBe(r2.keo.y);              // hai đoạn ngang ĐÚNG cùng độ cao
    expect(diemGiao(s)).toEqual([]);
  });

  test('khối bị xoá → bỏ qua, không nổ', () => {
    const s = cheo();
    s.edges.push({ id: 'e3', a: 'khong-co', b: 'b2', k: 'n', lbl: '' });
    expect(() => diemGiao(s)).not.toThrow();
    expect(diemGiao(s)).toEqual([{ x: 318, y: 180 }]);
    expect(diemGiao({ nodes: [], edges: null, lanes: [] })).toEqual([]);
    expect(diemGiao(null)).toEqual([]);
  });

  test('THỨ TỰ ổn định — đảo thứ tự đường nối vẫn ra đúng một danh sách', () => {
    const s = cheo();
    const dao = { ...s, edges: [s.edges[1], s.edges[0]] };
    expect(diemGiao(dao)).toEqual(diemGiao(s));
  });

  test('sơ đồ không có chỗ cắt → mảng rỗng', () => {
    expect(diemGiao(mauSoDo('SX'))).toEqual([]);
  });
});

describe('nhịp cầu vẽ trên đường NGANG', () => {
  const cheo = () => mkS(4,
    [K('a1', 0, 0), K('b1', 3, 2), K('a2', 1, 0), K('b2', 1, 2)],
    { id: 'e1', a: 'a1', b: 'b1', k: 'n', lbl: '' },
    { id: 'e2', a: 'a2', b: 'b2', k: 'n', lbl: '' });

  test('KHÔNG truyền giao → d y hệt từng byte', () => {
    const s = cheo();
    expect(routeEdge(s, s.edges[0], []).d).toBe(routeEdge(s, s.edges[0]).d);
    expect(routeEdge(s, s.edges[0]).d)
      .toBe('M106 88 L106 171 Q106 180 115 180 L733 180 Q742 180 742 189 L742 272');
  });

  test('truyền giao → đường NGANG có cung nhảy, đường DỌC giữ nguyên', () => {
    const s = cheo();
    const g = diemGiao(s);
    expect(routeEdge(s, s.edges[0], g).d)
      .toBe('M106 88 L106 171 Q106 180 115 180 L313 180 A5 5 0 0 1 323 180 L733 180 Q742 180 742 189 L742 272');
    expect(routeEdge(s, s.edges[1], g).d).toBe(routeEdge(s, s.edges[1]).d);   // đường dọc: không nhảy
  });

  test('cung nhảy nằm SÁT chỗ bẻ thì bỏ qua — không vẽ cung tràn qua góc bo', () => {
    const s = cheo();
    const r = routeEdge(s, s.edges[0], [{ x: 117, y: 180 }, { x: 731, y: 180 }]);
    expect(r.d).toBe(routeEdge(s, s.edges[0]).d);
  });

  test('giao rác không đẻ ra NaN trong path', () => {
    const s = cheo();
    for (const rac of [[{ x: NaN, y: 180 }], [{ x: 318 }], [null], 'abc', 7]) {
      expect(routeEdge(s, s.edges[0], rac).d).not.toMatch(/NaN|Infinity|undefined/);
    }
  });
});

// ── GHIM ĐIỂM NỐI VÀO CẠNH KHỐI ──────────────────────────────────
// Bốn điểm nối ở giữa mỗi cạnh khối, ghim được đầu RA (e.raA) và đầu VÀO
// (e.vaoB) — đúng thứ Visio có. Ghim rồi thì đường KHÔNG lách khối nữa:
// người dùng đã tự quyết lối đi, tự ý kéo sang lối khác cho đỡ xấu là quyết
// thay họ.
describe('ghim điểm nối — neoHopLe / diemNeo / canhHuong', () => {
  test('neoHopLe nhận đúng bốn cạnh, mọi thứ khác là KHÔNG GHIM', () => {
    expect(CANH_NEO).toEqual(['tren', 'phai', 'duoi', 'trai']);
    for (const c of CANH_NEO) expect(neoHopLe(c)).toBe(c);
    // so_do là jsonb — 42, null, 'xyz', object đều lọt xuống được. Khoá hỏng
    // phải rơi về đường TỰ ĐỘNG, không được làm mất đường nối trên bản in.
    for (const rac of ['xyz', 42, null, undefined, true, {}, [], 'TREN', ' tren']) {
      expect(neoHopLe(rac)).toBeNull();
    }
  });

  test('diemNeo trả ĐÚNG trung điểm cạnh và pháp tuyến hướng ra ngoài', () => {
    const r = rectOf(K('x', 0, 0));            // x 24…188, y 32…88
    expect(diemNeo(r, 'tren')).toEqual({ p: [r.cx, r.y], n: [0, -1] });
    expect(diemNeo(r, 'duoi')).toEqual({ p: [r.cx, r.y + r.h], n: [0, 1] });
    expect(diemNeo(r, 'trai')).toEqual({ p: [r.x, r.cy], n: [-1, 0] });
    expect(diemNeo(r, 'phai')).toEqual({ p: [r.x + r.w, r.cy], n: [1, 0] });
    // bốn điểm nằm đúng trên biên, và đối xứng qua tâm
    for (const c of CANH_NEO) {
      const { p } = diemNeo(r, c);
      expect(p.every(Number.isFinite)).toBe(true);
    }
  });

  test('canhHuong trả cạnh QUAY VỀ phía điểm — theo mặt tia từ tâm xuyên qua', () => {
    const r = rectOf(K('x', 1, 2));            // tâm (318, 300), 164×56
    expect(canhHuong(r, [318, -500])).toBe('tren');
    expect(canhHuong(r, [318, 900])).toBe('duoi');
    expect(canhHuong(r, [-500, 300])).toBe('trai');
    expect(canhHuong(r, [900, 300])).toBe('phai');
    // khối RỘNG (164×56): lệch ngang 100, lệch dọc 60 ⇒ vẫn là mặt TRÊN,
    // vì 100/82 < 60/28. So thô |dx| với |dy| thì ra 'phai' — sai mặt.
    expect(canhHuong(r, [418, 240])).toBe('tren');
    // khối rộng/cao 0 (dữ liệu hỏng) không được đẻ ra Infinity/NaN
    expect(CANH_NEO).toContain(canhHuong({ x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0 }, [0, 0]));
    expect(CANH_NEO).toContain(canhHuong({ x: 0, y: 0, w: NaN, h: NaN, cx: NaN, cy: NaN }, [1, 1]));
  });
});

describe('ghim điểm nối — đường nối bám đúng cạnh đã ghim', () => {
  // A trên-trái (cột 0, hàng 0) · B dưới-phải (cột 2, hàng 3) — bố cục thường
  // gặp nhất và đủ rộng để cả 16 cặp cạnh đều có chỗ mà đi.
  const doi = (them = {}) => mkS(3, [K('a', 0, 0), K('b', 2, 3)],
    { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '', ...them });
  const rA = rectOf(doi().nodes[0]);
  const rB = rectOf(doi().nodes[1]);
  const huong = (p, q) => [Math.sign(q[0] - p[0]), Math.sign(q[1] - p[1])];
  const dai = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);

  test('16 CẶP CẠNH — đường bắt đầu và kết thúc ĐÚNG trung điểm cạnh đã ghim', () => {
    const hong = [];
    for (const raA of CANH_NEO) {
      for (const vaoB of CANH_NEO) {
        const s = doi({ raA, vaoB });
        const r = routeEdge(s, s.edges[0]);
        const dauA = diemNeo(rA, raA).p, dauB = diemNeo(rB, vaoB).p;
        if (String(r.pts[0]) !== String(dauA)) hong.push(`${raA}→${vaoB}: đầu ở ${r.pts[0]}, phải là ${dauA}`);
        if (String(r.pts.at(-1)) !== String(dauB)) hong.push(`${raA}→${vaoB}: cuối ở ${r.pts.at(-1)}, phải là ${dauB}`);
        if (/NaN|Infinity|undefined/.test(r.d)) hong.push(`${raA}→${vaoB}: path có số hỏng — ${r.d}`);
        if (r.neo.raA !== raA || r.neo.vaoB !== vaoB) hong.push(`${raA}→${vaoB}: neo trả ${r.neo.raA}→${r.neo.vaoB}`);
        // mọi đoạn phải VUÔNG GÓC — diemGiao chỉ soi được đoạn thẳng đứng/nằm ngang
        for (let i = 0; i < r.pts.length - 1; i++) {
          const [p, q] = [r.pts[i], r.pts[i + 1]];
          if (p[0] !== q[0] && p[1] !== q[1]) hong.push(`${raA}→${vaoB}: đoạn ${i} đi chéo`);
        }
      }
    }
    expect(hong).toEqual([]);
  });

  test('ĐOẠN MỒI — đường rời khối theo đúng pháp tuyến cạnh, dài ít nhất DAI_MOI', () => {
    // Hai cặp KHÔNG kể: hai đầu quay LƯNG vào nhau (ra cạnh trên khối trên,
    // vào cạnh dưới khối dưới — và bản ngang của nó). Lối đi đúng cho chúng
    // là một chữ U bốn lần bẻ; ở đây cố ý chỉ cho phép hai lần bẻ, nên đường
    // buộc phải quặt ngược. Ghim là người dùng tự quyết, và đây là cái giá.
    const quayLung = ['tren→duoi', 'trai→phai'];
    const hong = [];
    for (const raA of CANH_NEO) {
      for (const vaoB of CANH_NEO) {
        if (quayLung.includes(`${raA}→${vaoB}`)) continue;
        const s = doi({ raA, vaoB });
        const { pts } = routeEdge(s, s.edges[0]);
        const nA = diemNeo(rA, raA).n, nB = diemNeo(rB, vaoB).n;
        const raHuong = huong(pts[0], pts[1]);
        const vaoHuong = huong(pts.at(-2), pts.at(-1));
        if (String(raHuong) !== String(nA)) hong.push(`${raA}→${vaoB}: ra hướng ${raHuong}, phải là ${nA}`);
        if (String(vaoHuong) !== String([-nB[0], -nB[1]])) hong.push(`${raA}→${vaoB}: vào hướng ${vaoHuong}`);
        if (dai(pts[0], pts[1]) < DAI_MOI) hong.push(`${raA}→${vaoB}: mồi ra chỉ dài ${dai(pts[0], pts[1])}`);
        if (dai(pts.at(-2), pts.at(-1)) < DAI_MOI) hong.push(`${raA}→${vaoB}: mồi vào quá ngắn`);
      }
    }
    expect(hong).toEqual([]);
  });

  test('không quá HAI chỗ bẻ giữa hai đoạn mồi — đường đọc được, không ngoằn ngoèo', () => {
    for (const raA of CANH_NEO) {
      for (const vaoB of CANH_NEO) {
        const s = doi({ raA, vaoB });
        const { pts } = routeEdge(s, s.edges[0]);
        // pts = mồi ra + tối đa 2 chỗ bẻ + mồi vào ⇒ nhiều nhất 5 điểm
        expect(pts.length).toBeLessThanOrEqual(5);
      }
    }
  });

  test('ra DƯỚI vào TRÊN cùng cột → thẳng tuột, không có chỗ bẻ để chỉnh', () => {
    const s = mkS(3, [K('a', 1, 0), K('b', 1, 2)],
      { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '', raA: 'duoi', vaoB: 'tren' });
    const r = routeEdge(s, s.edges[0]);
    expect(r.keo).toBeNull();
    expect(r.d).toBe('M318 88 L318 272');
    // …và ĐÚNG BẰNG đường tự động của chính cặp khối ấy: ghim cặp cạnh hiển
    // nhiên thì không được làm hình đổi đi.
    expect(r.d).toBe(veE(mkS(3, [K('a', 1, 0), K('b', 1, 2)],
      { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' })).d);
  });

  test('ra PHẢI vào TRÁI cùng hàng → thẳng tuột, y hệt bản tự động', () => {
    const nodes = [K('a', 0, 0), K('b', 2, 0)];
    const s = mkS(3, nodes, { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '', raA: 'phai', vaoB: 'trai' });
    expect(veE(s).d).toBe('M188 60 L448 60');
    expect(veE(s).keo).toBeNull();
  });

  test('ra DƯỚI vào TRÁI → lối chữ L, đúng MỘT chỗ bẻ', () => {
    const s = doi({ raA: 'duoi', vaoB: 'trai' });
    const r = routeEdge(s, s.edges[0]);
    expect(r.pts).toEqual([[106, 88], [106, 420], [448, 420]]);
    expect(r.keo.huong).toBe('ngang');
    expect(r.keo.y).toBe(420);
  });

  test('GHIM TẮT PHÉP LÁCH KHỐI — đường đi thẳng qua khối chắn, không tự vòng', () => {
    // Đúng ba khối chắn của bài "lách khối": bản tự động vòng sang làn trống.
    const nodes = [K('a', 0, 0), K('c1', 0, 1), K('c2', 0, 2), K('c3', 0, 3), K('b', 0, 4)];
    const tuDong = mkS(3, nodes, { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' });
    expect(soKhoiCat(tuDong, veE(tuDong).pts, ['a', 'b'])).toBe(0);      // tự động: né hết

    const ghim = mkS(3, nodes, { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '', raA: 'duoi', vaoB: 'tren' });
    const r = veE(ghim);
    expect(soKhoiCat(ghim, r.pts, ['a', 'b'])).toBe(3);                  // ghim: đi thẳng, cắt cả ba
    expect(r.pts[0]).toEqual([106, 88]);
  });
});

describe('ghim điểm nối — một đầu ghim, đầu kia tự động', () => {
  const mk = (them) => mkS(3, [K('a', 0, 0), K('b', 2, 3)],
    { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '', ...them });

  test('ghim đầu RA thì đầu VÀO tự chọn cạnh QUAY VỀ chỗ đầu ra đang đứng', () => {
    // B ở dưới-phải: ra cạnh dưới khối A ⇒ vào cạnh TRÊN khối B.
    const r = veE(mk({ raA: 'duoi' }));
    expect(r.neo).toEqual({ raA: 'duoi', vaoB: 'tren' });
    expect(r.pts.at(-1)).toEqual([530, 392]);          // đúng trung điểm cạnh trên B
  });

  test('ghim đầu VÀO thì đầu RA tự chọn cạnh quay về phía đó', () => {
    const r = veE(mk({ vaoB: 'trai' }));
    expect(r.neo.vaoB).toBe('trai');
    expect(r.pts.at(-1)).toEqual([448, 420]);
    expect(CANH_NEO).toContain(r.neo.raA);
    expect(r.pts[0]).toEqual(diemNeo(rectOf(mk({}).nodes[0]), r.neo.raA).p);
  });

  test('đầu tự động giải theo CHỖ ĐẦU KIA ĐỨNG, không theo tâm khối', () => {
    // Ghim đầu ra vào cạnh TRÊN khối A (điểm ra nằm CAO hơn cả B) ⇒ đầu vào
    // phải quay LÊN — cạnh trên khối B. Nếu tính theo tâm khối A (nằm ngang
    // tầm giữa) thì kết quả không đổi ở đây, nên lấy bố cục ép rõ hơn:
    // A nằm DƯỚI B, ghim đầu ra vào cạnh TRÊN A ⇒ điểm ra ở phía trên A,
    // vẫn thấp hơn B ⇒ vào cạnh DƯỚI B.
    const s = mkS(1, [K('a', 0, 3), K('b', 0, 0)],
      { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '', raA: 'tren' });
    expect(veE(s).neo).toEqual({ raA: 'tren', vaoB: 'duoi' });
  });

  test('đường TỰ ĐỘNG cũng khai báo cạnh nó đang ra/vào — để giao diện tô sáng', () => {
    const xuong = mkS(3, [K('a', 0, 0), K('b', 2, 2)], { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' });
    expect(veE(xuong).neo).toEqual({ raA: 'duoi', vaoB: 'tren' });
    const ngang = mkS(3, [K('a', 0, 0), K('b', 2, 0)], { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' });
    expect(veE(ngang).neo).toEqual({ raA: 'phai', vaoB: 'trai' });
    const len = mkS(3, [K('a', 0, 3), K('b', 2, 0)], { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' });
    expect(veE(len).neo).toEqual({ raA: 'tren', vaoB: 'trai' });
  });
});

describe('ghim điểm nối — lech vẫn kéo tay được', () => {
  const mk = (them) => mkS(3, [K('a', 0, 0), K('b', 2, 3)],
    { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '', ...them });

  test('cặp DỌC: lech hạ lằn ngang xuống đúng bằng đó, hai đầu KHÔNG rời cạnh', () => {
    const a = veE(mk({ raA: 'duoi', vaoB: 'tren' }));
    const b = veE(mk({ raA: 'duoi', vaoB: 'tren', lech: 40 }));
    expect(a.keo.huong).toBe('ngang');
    expect(b.keo.y - a.keo.y).toBe(40);
    expect(b.pts[0]).toEqual(a.pts[0]);
    expect(b.pts.at(-1)).toEqual(a.pts.at(-1));
  });

  test('cặp NGANG: lech dời lằn dọc sang ngang đúng bằng đó', () => {
    const a = veE(mk({ raA: 'phai', vaoB: 'trai' }));
    const b = veE(mk({ raA: 'phai', vaoB: 'trai', lech: -30 }));
    expect(a.keo.huong).toBe('doc');
    expect(b.keo.x - a.keo.x).toBe(-30);
    expect(b.pts[0]).toEqual(a.pts[0]);
    expect(b.pts.at(-1)).toEqual(a.pts.at(-1));
  });

  test('cặp KHÁC TRỤC (chữ L): kéo lằn ra là mọc thêm chỗ bẻ, hai đầu vẫn nguyên', () => {
    const a = veE(mk({ raA: 'duoi', vaoB: 'trai' }));
    const b = veE(mk({ raA: 'duoi', vaoB: 'trai', lech: -60 }));
    expect(a.pts).toHaveLength(3);                     // chữ L
    expect(b.pts).toHaveLength(5);                     // kéo ra thì thành bốn đoạn
    expect(b.keo.y - a.keo.y).toBe(-60);
    expect(b.pts[0]).toEqual(a.pts[0]);
    expect(b.pts.at(-1)).toEqual(a.pts.at(-1));
  });

  test('lech quá lớn bị KẸP — lằn không lùi vào trong đoạn mồi', () => {
    const A = rectOf(mk({}).nodes[0]), B = rectOf(mk({}).nodes[1]);
    const tren = veE(mk({ raA: 'duoi', vaoB: 'tren', lech: -9999 }));
    expect(tren.keo.y).toBeGreaterThanOrEqual(A.y + A.h + DAI_MOI);
    const duoi = veE(mk({ raA: 'duoi', vaoB: 'tren', lech: 9999 }));
    expect(duoi.keo.y).toBeLessThanOrEqual(B.y - DAI_MOI);
    for (const l of [-9999, -60, 0, 60, 9999]) {
      for (const raA of CANH_NEO) {
        for (const vaoB of CANH_NEO) {
          const r = veE(mk({ raA, vaoB, lech: l }));
          expect(r.d).not.toMatch(/NaN|Infinity|undefined/);
          if (r.keo) expect([r.keo.x, r.keo.y, ...r.keo.tu, ...r.keo.den].every(Number.isFinite)).toBe(true);
        }
      }
    }
  });

  test('núm kéo đậu trên ĐỈNH THẬT của đường, và là trung điểm tu–den', () => {
    for (const [raA, vaoB] of [['duoi', 'tren'], ['phai', 'trai'], ['duoi', 'trai'], ['phai', 'tren']]) {
      const r = veE(mk({ raA, vaoB }));
      expect(r.keo).not.toBeNull();
      expect(r.keo.x).toBe((r.keo.tu[0] + r.keo.den[0]) / 2);
      expect(r.keo.y).toBe((r.keo.tu[1] + r.keo.den[1]) / 2);
      const dinh = p => r.pts.some(q => q[0] === p[0] && q[1] === p[1]);
      expect(dinh(r.keo.tu)).toBe(true);
      expect(dinh(r.keo.den)).toBe(true);
    }
  });

  test('lech RÁC trên đường đã ghim → coi như 0', () => {
    const goc = veE(mk({ raA: 'duoi', vaoB: 'tren' })).d;
    for (const rac of ['40', 'abc', NaN, null, true, {}, []]) {
      expect(veE(mk({ raA: 'duoi', vaoB: 'tren', lech: rac })).d).toBe(goc);
    }
  });
});

describe('ghim điểm nối — không ghim thì KHÔNG đổi một byte nào', () => {
  const dung = () => [
    mkS(3, [K('a', 0, 0), K('b', 2, 0)], { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' }),
    mkS(3, [K('a', 1, 0), K('b', 1, 2)], { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' }),
    mkS(3, [K('a', 0, 0), K('b', 2, 2)], { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' }),
    mkS(3, [K('a', 0, 3), K('b', 2, 0)], { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' }),
    mkS(3, [K('a', 0, 0), K('c1', 0, 1), K('c2', 0, 2), K('b', 0, 3)],
      { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' }),
  ];

  test('KHOÁ GHIM RÁC bị bỏ qua hẳn — d ra đúng từng byte như khi không có khoá', () => {
    for (const rac of ['xyz', 42, null, undefined, true, {}, [], 0, '', 'TREN']) {
      dung().forEach((s, i) => {
        const goc = veE(s).d;
        const ban = { ...s, edges: [{ ...s.edges[0], raA: rac, vaoB: rac }] };
        expect(veE(ban).d, `dựng ${i} với rác ${String(rac)}`).toBe(goc);
      });
    }
  });

  test('THÊM khoá ghim vào rồi BỎ đi thì về đúng đường cũ', () => {
    for (const s of dung()) {
      const goc = veE(s).d;
      const ghim = { ...s, edges: [{ ...s.edges[0], raA: 'trai', vaoB: 'phai' }] };
      expect(veE(ghim).d).not.toBe(goc);                        // có ghim thì phải khác
      const bo = { ...s, edges: [{ id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' }] };
      expect(veE(bo).d).toBe(goc);
    }
  });

  test('QUÉT NGẪU NHIÊN 600 sơ đồ — thêm khoá ghim RÁC không đổi một đường nào', () => {
    // Hạt cố định (mulberry32) để test hỏng là dựng lại được đúng sơ đồ đó.
    const rng = (hat) => () => {
      hat = (hat + 0x6d2b79f5) | 0;
      let t = Math.imul(hat ^ (hat >>> 15), 1 | hat);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const RAC = ['xyz', 42, null, true, '', 'TREN', {}, [], 0, -1];
    const hong = [];
    for (let hat = 1; hat <= 600; hat++) {
      const r = rng(hat);
      const soCot = 1 + Math.floor(r() * 4);
      const nodes = [];
      const soKhoi = 2 + Math.floor(r() * 5);
      for (let i = 0; i < soKhoi; i++) {
        nodes.push(K(`n${i}`, Math.floor(r() * soCot), Math.floor(r() * 6),
          r() < 0.25 ? 'dec' : 'step'));
      }
      const edges = [];
      for (let i = 0; i + 1 < soKhoi; i++) {
        if (r() < 0.6) continue;
        edges.push({ id: `e${i}`, a: `n${i}`, b: `n${i + 1}`, k: 'n', lbl: '' });
      }
      if (!edges.length) edges.push({ id: 'e0', a: 'n0', b: `n${soKhoi - 1}`, k: 'n', lbl: '' });
      const s = mkS(soCot, nodes, ...edges);
      const bao = {
        ...s,
        edges: s.edges.map((e, i) => ({ ...e, raA: RAC[i % RAC.length], vaoB: RAC[(i + 3) % RAC.length] })),
      };
      const g = diemGiao(s);
      for (let i = 0; i < s.edges.length; i++) {
        const truoc = routeEdge(s, s.edges[i], g).d;
        const sau = routeEdge(bao, bao.edges[i], g).d;
        if (truoc !== sau) hong.push(`hạt ${hat} đường ${i}: ${truoc} ≠ ${sau}`);
        if (/NaN|Infinity|undefined/.test(sau)) hong.push(`hạt ${hat} đường ${i}: số hỏng`);
      }
    }
    expect(hong).toEqual([]);
  });

  test('QUÉT NGẪU NHIÊN — mọi cặp ghim đều ra đường sạch, bám đúng hai đầu', () => {
    const rng = (hat) => () => {
      hat = (hat + 0x6d2b79f5) | 0;
      let t = Math.imul(hat ^ (hat >>> 15), 1 | hat);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const hong = [];
    for (let hat = 1; hat <= 300; hat++) {
      const r = rng(hat);
      const soCot = 1 + Math.floor(r() * 4);
      const hangA = Math.floor(r() * 6);
      // Hai khối CHỒNG KHÍT lên nhau là lỗi của lưu đồ (kiemTraLuuDo bắt), và
      // lúc đó bốn chấm ghim của hai khối trùng nhau nên không còn đường nào để
      // mà đo — cảnh đó có bài riêng ngay dưới. Ở đây ép hai khối khác hàng.
      const A = K('a', Math.floor(r() * soCot), hangA, r() < 0.3 ? 'dec' : 'step');
      const B = K('b', Math.floor(r() * soCot), (hangA + 1 + Math.floor(r() * 5)) % 6,
        r() < 0.3 ? 'dec' : 'step');
      const raA = CANH_NEO[Math.floor(r() * 4)], vaoB = CANH_NEO[Math.floor(r() * 4)];
      const lech = [0, 24, -24, 9999, -9999][Math.floor(r() * 5)];
      const s = mkS(soCot, [A, B], { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '', raA, vaoB, lech });
      const x = routeEdge(s, s.edges[0]);
      const tag = `hạt ${hat} (${raA}→${vaoB}, lech ${lech})`;
      if (/NaN|Infinity|undefined/.test(x.d)) hong.push(`${tag}: số hỏng trong path`);
      if (String(x.pts[0]) !== String(diemNeo(rectOf(A), raA).p)) hong.push(`${tag}: đầu sai chỗ`);
      if (String(x.pts.at(-1)) !== String(diemNeo(rectOf(B), vaoB).p)) hong.push(`${tag}: cuối sai chỗ`);
      if (!x.nhan.every(Number.isFinite)) hong.push(`${tag}: nhãn có số hỏng`);
      if (x.pts.length > 5) hong.push(`${tag}: ${x.pts.length} điểm — quá hai chỗ bẻ`);
      for (let i = 0; i < x.pts.length - 1; i++) {
        if (x.pts[i][0] !== x.pts[i + 1][0] && x.pts[i][1] !== x.pts[i + 1][1]) hong.push(`${tag}: đoạn chéo`);
        if (x.pts[i][0] === x.pts[i + 1][0] && x.pts[i][1] === x.pts[i + 1][1]) hong.push(`${tag}: đoạn dài 0`);
      }
    }
    expect(hong).toEqual([]);
  });
});

describe('ghim điểm nối — cảnh hỏng thì hỏng cho gọn', () => {
  test('HAI KHỐI CHỒNG KHÍT, ghim cùng một cạnh → đường thu về một điểm, KHÔNG nổ', () => {
    // kiemTraLuuDo đã bắt cảnh này là LỖI của lưu đồ. Việc của routeEdge chỉ là
    // đừng nổ và đừng thả NaN vào bản vẽ — mất cả ảnh vì một khối đặt đè nhau
    // thì người dùng không còn gì để nhìn mà sửa.
    for (const canh of CANH_NEO) {
      const s = mkS(2, [K('a', 0, 1), { ...K('b', 0, 1), id: 'b' }],
        { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '', raA: canh, vaoB: canh });
      const r = veE(s);
      expect(r.d).not.toMatch(/NaN|Infinity|undefined/);
      expect(r.pts.length).toBeGreaterThanOrEqual(2);
      expect(r.nhan.every(Number.isFinite)).toBe(true);
      expect(r.keo).toBeNull();
    }
  });

  test('khối đầu hoặc cuối đã bị xoá → vẫn trả null, ghim không cứu được', () => {
    const s = mkS(2, [K('a', 0, 0)],
      { id: 'e', a: 'a', b: 'khong-co', k: 'n', lbl: '', raA: 'duoi', vaoB: 'tren' });
    expect(veE(s)).toBeNull();
  });

  test('toạ độ khối kia HỎNG: đầu ĐÃ GHIM vẫn bám đúng cạnh của khối lành', () => {
    // so_do là jsonb — y/w/h hỏng vốn đã đẩy NaN vào cả đường TỰ ĐỘNG (chặn ở
    // cửa vào bản xuất, xem soDoSach của quyTrinhSvg). Điều ghim phải giữ được:
    // đầu nằm ở khối lành vẫn đậu đúng chấm người dùng chọn, không nổ.
    const hong = { id: 'b', t: 'step', lane: 1, y: 'abc', dx: 0, w: 164, h: 56, tx: 'b' };
    const s = mkS(2, [K('a', 0, 0), hong],
      { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '', raA: 'duoi', vaoB: 'tren' });
    expect(() => veE(s)).not.toThrow();
    expect(veE(s).pts[0]).toEqual(diemNeo(rectOf(K('a', 0, 0)), 'duoi').p);
    expect(veE(s).neo).toEqual({ raA: 'duoi', vaoB: 'tren' });
  });
});

describe('ghim điểm nối — nhịp cầu vẫn bắc trên đường đã ghim', () => {
  test('diemGiao vẫn bắt được chỗ cắt khi đường bị ghim, và đường ngang vẫn nhảy', () => {
    // e1 ghim dưới→trên, bẻ ngang ở giữa; e2 bổ dọc cắt qua nó.
    const s = mkS(4, [K('a1', 0, 0), K('b1', 3, 2), K('a2', 1, 0), K('b2', 1, 2)],
      { id: 'e1', a: 'a1', b: 'b1', k: 'n', lbl: '', raA: 'duoi', vaoB: 'tren' },
      { id: 'e2', a: 'a2', b: 'b2', k: 'n', lbl: '' });
    const g = diemGiao(s);
    expect(g).toEqual([{ x: 318, y: 180 }]);
    const co = routeEdge(s, s.edges[0], g).d;
    expect(co).toContain('A5 5 0 0 1');                 // có nhịp cầu
    expect(co).not.toBe(routeEdge(s, s.edges[0]).d);
    expect(routeEdge(s, s.edges[1], g).d).toBe(routeEdge(s, s.edges[1]).d);   // đường dọc không nhảy
  });
});

describe('đánh số bước bằng tay — soDo.thuTu', () => {
  const K = (id, y, lane = 0) => ({
    id, t: 'step', lane, y, dx: 0, w: 164, h: 56, tx: id, desc: '', form: '—', time: '—',
  });
  // Năm bước xếp thẳng một cột, cách đều — thứ tự THEO VỊ TRÍ là n1…n5.
  const base = () => ({
    lanes: [{ name: 'A', owner: 'a', color: '#111111' }, { name: 'B', owner: 'b', color: '#222222' }],
    phases: [{ name: 'G', h: 7 * CAO_HANG }],
    nodes: [
      { id: 'n0', t: 'start', lane: 0, y: 12, dx: 0, w: 164, h: 48, tx: 'Bắt đầu' },
      K('n1', 100), K('n2', 220), K('n3', 340), K('n4', 460), K('n5', 580),
      { id: 'n9', t: 'end', lane: 0, y: 700, dx: 0, w: 164, h: 48, tx: 'Kết thúc' },
    ],
    edges: [],
  });

  test('không có thuTu ⇒ vẫn là thứ tự theo VỊ TRÍ, y như cũ', () => {
    expect(thuTuBuoc(base())).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
  });

  test('có thuTu ⇒ đi theo danh sách đó', () => {
    const s = { ...base(), thuTu: ['n3', 'n1', 'n2', 'n4', 'n5'] };
    expect(thuTuBuoc(s)).toEqual(['n3', 'n1', 'n2', 'n4', 'n5']);
  });

  test('thuTu THIẾU vài khối ⇒ phần thiếu nối vào cuối theo VỊ TRÍ', () => {
    const s = { ...base(), thuTu: ['n4', 'n2'] };
    expect(thuTuBuoc(s)).toEqual(['n4', 'n2', 'n1', 'n3', 'n5']);
  });

  test('KHỐI MỚI thêm sau không phá thứ tự đã chọn — nó xuống cuối', () => {
    const s = { ...base(), thuTu: ['n3', 'n1', 'n2', 'n4', 'n5'] };
    const s2 = themBuoc(s, { tuId: 'n5', loai: 'step', cot: 1, ten: 'Bước mới' });
    const moi = s2.nodes[s2.nodes.length - 1];
    expect(thuTuBuoc(s2)).toEqual(['n3', 'n1', 'n2', 'n4', 'n5', moi.id]);
  });

  test('XOÁ khối nằm trong thuTu ⇒ nó rụng khỏi thứ tự, số vẫn liền 1..n', () => {
    const s = { ...base(), thuTu: ['n3', 'n1', 'n2', 'n4', 'n5'] };
    const s2 = xoaKhoi(s, 'n1');
    expect(thuTuBuoc(s2)).toEqual(['n3', 'n2', 'n4', 'n5']);
  });

  test('thuTu KHÔNG được chứa Bắt đầu / Kết thúc, kể cả khi bị nhét vào', () => {
    const s = { ...base(), thuTu: ['n9', 'n2', 'n0', 'n1'] };
    const r = thuTuBuoc(s);
    expect(r).not.toContain('n0');
    expect(r).not.toContain('n9');
    expect(r).toEqual(['n2', 'n1', 'n3', 'n4', 'n5']);
  });

  test.each([
    ['null', null],
    ['chuỗi', 'abc'],
    ['số', 7],
    ['mảng số', [1, 2, 3]],
    ['mảng rỗng', []],
    ['toàn id đã xoá', ['zzz', 'yyy']],
    ['có null lẫn trong', ['n2', null, undefined, 'n1']],
    ['id lặp lại', ['n2', 'n2', 'n2', 'n1', 'n1']],
    ['object', { 0: 'n1' }],
  ])('thuTu RÁC (%s) ⇒ không nổ, không sinh số trùng, vẫn đủ 5 bước', (_ten, rac) => {
    const s = { ...base(), thuTu: rac };
    let r;
    expect(() => { r = thuTuBuoc(s); }).not.toThrow();
    expect(r).toHaveLength(5);
    expect(new Set(r).size).toBe(5);
    expect(r.slice().sort()).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
  });

  test('rác hoàn toàn ⇒ rơi HẲN về thứ tự vị trí', () => {
    for (const rac of [null, 'abc', 7, [1, 2, 3], [], ['zzz'], { 0: 'n1' }]) {
      expect(thuTuBuoc({ ...base(), thuTu: rac })).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
    }
  });

  test('id lặp trong thuTu chỉ tính LẦN ĐẦU', () => {
    const s = { ...base(), thuTu: ['n3', 'n3', 'n1', 'n3'] };
    expect(thuTuBuoc(s)).toEqual(['n3', 'n1', 'n2', 'n4', 'n5']);
  });

  // ── datThuTu ──────────────────────────────────────────────────
  test('ĐÚNG VIỆC NGƯỜI DÙNG XIN: khối số 3 đổi thành 2 ⇒ khối số 2 cũ thành 3', () => {
    const s = base();
    expect(thuTuBuoc(s).indexOf('n3') + 1).toBe(3);      // đang là 3
    const s2 = datThuTu(s, 'n3', 2);
    const sau = thuTuBuoc(s2);
    expect(sau.indexOf('n3') + 1).toBe(2);               // thành 2
    expect(sau.indexOf('n2') + 1).toBe(3);               // bước 2 cũ tự thành 3
    expect(sau).toEqual(['n1', 'n3', 'n2', 'n4', 'n5']); // n1, n4, n5 giữ nguyên số
  });

  test('nhảy XA (5 → 2): các bước ở giữa dồn xuống một bậc, phần trên không đụng', () => {
    const sau = thuTuBuoc(datThuTu(base(), 'n5', 2));
    expect(sau).toEqual(['n1', 'n5', 'n2', 'n3', 'n4']);
    expect(sau.indexOf('n1') + 1).toBe(1);
  });

  test('nhảy XUỐNG (2 → 4): các bước ở giữa dồn lên một bậc', () => {
    expect(thuTuBuoc(datThuTu(base(), 'n2', 4))).toEqual(['n1', 'n3', 'n4', 'n2', 'n5']);
  });

  test('DỜI CHỖ chứ không ĐỔI CHỖ — 5→2 không đẩy n2 xuống cuối', () => {
    const sau = thuTuBuoc(datThuTu(base(), 'n5', 2));
    expect(sau[sau.length - 1]).toBe('n4');
  });

  test('kẹp vào 1..n: số nhỏ hơn 1 về đầu, số lớn quá về cuối', () => {
    expect(thuTuBuoc(datThuTu(base(), 'n3', 0))).toEqual(['n3', 'n1', 'n2', 'n4', 'n5']);
    expect(thuTuBuoc(datThuTu(base(), 'n3', -9))).toEqual(['n3', 'n1', 'n2', 'n4', 'n5']);
    expect(thuTuBuoc(datThuTu(base(), 'n3', 99))).toEqual(['n1', 'n2', 'n4', 'n5', 'n3']);
  });

  test('ghi ĐỦ danh sách, không ghi lửng — mọi bước đang có đều nằm trong thuTu', () => {
    const s = datThuTu(base(), 'n3', 2);
    expect(s.thuTu).toEqual(['n1', 'n3', 'n2', 'n4', 'n5']);
    expect(new Set(s.thuTu).size).toBe(s.thuTu.length);
  });

  test.each([
    ['NaN', NaN], ['chuỗi số', '2'], ['số lẻ', 2.5], ['null', null],
    ['undefined', undefined], ['vô cực', Infinity], ['object', {}], ['mảng', [2]],
  ])('viTri RÁC (%s) ⇒ trả NGUYÊN sơ đồ cũ, không bịa ra thứ tự nào', (_ten, rac) => {
    const s = base();
    expect(datThuTu(s, 'n3', rac)).toBe(s);
    expect(thuTuBuoc(datThuTu(s, 'n3', rac))).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
  });

  test.each([
    ['id không có', 'khong-co'], ['khối Bắt đầu', 'n0'], ['khối Kết thúc', 'n9'],
    ['null', null], ['undefined', undefined],
  ])('id không đánh số được (%s) ⇒ trả NGUYÊN sơ đồ cũ', (_ten, id) => {
    const s = base();
    expect(datThuTu(s, id, 2)).toBe(s);
  });

  test('đặt lại ĐÚNG chỗ đang đứng ⇒ trả nguyên sơ đồ cũ, không tốn một nấc hoàn tác', () => {
    const s = base();
    expect(datThuTu(s, 'n3', 3)).toBe(s);
    const s2 = datThuTu(s, 'n3', 2);
    expect(datThuTu(s2, 'n3', 2)).toBe(s2);
  });

  test('BẤT BIẾN: sơ đồ gốc không bị sửa', () => {
    const s = base();
    const truoc = JSON.stringify(s);
    const s2 = datThuTu(s, 'n5', 1);
    expect(JSON.stringify(s)).toBe(truoc);
    expect(s.thuTu).toBeUndefined();
    expect(s2).not.toBe(s);
    expect(s2.nodes).toEqual(s.nodes);
  });

  test('gọi nhiều lần thì cộng dồn đúng', () => {
    let s = base();
    s = datThuTu(s, 'n5', 1);            // n5 n1 n2 n3 n4
    s = datThuTu(s, 'n2', 2);            // n5 n2 n1 n3 n4
    expect(thuTuBuoc(s)).toEqual(['n5', 'n2', 'n1', 'n3', 'n4']);
  });

  test('đã có thuTu thì datThuTu tính TRÊN thứ tự đang hiện, không trên vị trí', () => {
    const s = { ...base(), thuTu: ['n5', 'n4', 'n3', 'n2', 'n1'] };
    expect(thuTuBuoc(datThuTu(s, 'n1', 1))).toEqual(['n1', 'n5', 'n4', 'n3', 'n2']);
  });

  test('thuTu RÁC + datThuTu ⇒ ghi đè bằng danh sách sạch, đủ 5 bước', () => {
    const s = { ...base(), thuTu: ['zzz', 'n2', 'n2', null] };
    const s2 = datThuTu(s, 'n3', 1);
    expect(s2.thuTu).toEqual(['n3', 'n2', 'n1', 'n4', 'n5']);
  });

  // ── boThuTu ───────────────────────────────────────────────────
  test('boThuTu xoá HẲN khoá, số bước quay về suy từ vị trí', () => {
    const s = datThuTu(base(), 'n5', 1);
    const s2 = boThuTu(s);
    expect('thuTu' in s2).toBe(false);
    expect(thuTuBuoc(s2)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
    expect(s.thuTu).toBeDefined();        // bản cũ không bị đụng
  });

  test('boThuTu trên sơ đồ chưa từng đánh số tay ⇒ không nổ, không đổi gì', () => {
    const s = base();
    expect(() => boThuTu(s)).not.toThrow();
    expect(thuTuBuoc(boThuTu(s))).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
  });

  // ── thuTu sống sót qua các phép biến đổi khác ──────────────────
  test('thuTu KHÔNG bị các phép biến đổi khác làm rơi mất', () => {
    const s = { ...base(), thuTu: ['n3', 'n1', 'n2', 'n4', 'n5'] };
    const mong = ['n3', 'n1', 'n2', 'n4', 'n5'];
    // Chép NGUYÊN VĂN, kể cả id vừa bị xoá: chỗ lọc là thuTuBuoc, không phải ở đây.
    expect(doiCot(s, 'n1', 1).thuTu).toEqual(mong);
    expect(tuXepLai(s).thuTu).toEqual(mong);
    expect(xoaKhoi(s, 'n4').thuTu).toEqual(mong);
    expect(themBuoc(s, { tuId: 'n1', loai: 'step', cot: 1, ten: 'x' }).thuTu).toEqual(mong);
    expect(xoaCot(s, 1).thuTu).toEqual(mong);
    const coHangTrong = {
      ...s,
      phases: [{ name: 'trống', h: CAO_HANG }, { name: 'G', h: 7 * CAO_HANG }],
      nodes: s.nodes.map(n => ({ ...n, y: n.y + CAO_HANG })),
    };
    expect(xoaHang(coHangTrong, 0).thuTu).toEqual(mong);
  });

  test('TỰ XẾP LẠI không đảo số bước khi đã đánh số tay', () => {
    const s = { ...base(), thuTu: ['n5', 'n4', 'n3', 'n2', 'n1'] };
    expect(thuTuBuoc(tuXepLai(s))).toEqual(['n5', 'n4', 'n3', 'n2', 'n1']);
  });

  test('thuTu là BẢN SAO, sửa mảng của sơ đồ mới không đụng sơ đồ cũ', () => {
    const s = { ...base(), thuTu: ['n3', 'n1', 'n2', 'n4', 'n5'] };
    const s2 = doiCot(s, 'n1', 1);
    expect(s2.thuTu).not.toBe(s.thuTu);
    s2.thuTu.push('rác');
    expect(s.thuTu).toHaveLength(5);
  });

  test('thuTu RÁC không được chép sang sơ đồ mới', () => {
    const s = { ...base(), thuTu: 'abc' };
    expect(doiCot(s, 'n1', 1).thuTu).toBeUndefined();
  });

  test('xoá rồi thêm: thứ tự vẫn hợp lệ, số liền 1..n, không trùng không hụt', () => {
    let s = { ...base(), thuTu: ['n3', 'n1', 'n2', 'n4', 'n5'] };
    s = xoaKhoi(s, 'n2');
    s = themBuoc(s, { tuId: 'n1', loai: 'step', cot: 1, ten: 'Bước mới' });
    const r = thuTuBuoc(s);
    const buoc = s.nodes.filter(n => n.t !== 'start' && n.t !== 'end').map(n => n.id);
    expect(r).toHaveLength(buoc.length);
    expect(new Set(r).size).toBe(r.length);
    expect(r.slice().sort()).toEqual(buoc.slice().sort());
    expect(r.slice(0, 4)).toEqual(['n3', 'n1', 'n4', 'n5']);
  });

  test('chuỗi lạ trong thuTu KHÔNG lọt ra kết quả — chỉ id có thật mới được nhắc tên', () => {
    // thuTu đi thẳng vào so_do (jsonb). Kết quả của thuTuBuoc được bảng diễn giải
    // và bản in dùng, nên nó chỉ được phép nhả ra id của khối CÓ THẬT: chuỗi lạ
    // chỉ dùng để tra bảng rồi vứt, không bao giờ thành một dòng trên tài liệu.
    const ban = '<script>alert(1)</script>';
    const s = { ...base(), thuTu: [ban, 'n2', { a: 1 }, ['n1'], 'n1'] };
    const r = thuTuBuoc(s);
    expect(r).toEqual(['n2', 'n1', 'n3', 'n4', 'n5']);
    expect(JSON.stringify(r)).not.toContain('script');
    expect(r.every(id => s.nodes.some(n => n.id === id))).toBe(true);
  });

});

describe('đánh số bước theo TÂM khối, không theo MÉP TRÊN', () => {
  // Khối Quyết định cao 86, khối Thao tác cao 56 — đặt cùng một hàng thì tâm
  // trùng nhau nhưng MÉP TRÊN lệch 15px. Mọi thứ khác của phân hệ (lưới hàng,
  // hutHang, tuXepLai, daiBuoc) đều căn theo TÂM, nên đánh số theo mép trên là
  // bảng diễn giải đọc ngược chiều với lưu đồ in ngay phía trên nó.
  const cungHang = () => ({
    lanes: [{ name: 'A', owner: 'a', color: '#111111' }, { name: 'B', owner: 'b', color: '#222222' }],
    phases: [{ name: 'G', h: 3 * CAO_HANG }],
    nodes: [
      { id: 'n0', t: 'start', lane: 0, y: yTaiHang(0, 48), dx: 0, w: 164, h: 48, tx: 'Bắt đầu' },
      // Thao tác ở cột TRÁI, Quyết định ở cột PHẢI — cùng hàng 1, tâm trùng nhau.
      { id: 'tt', t: 'step', lane: 0, y: yTaiHang(1, 56), dx: 0, w: 164, h: 56, tx: 'Thao tác', desc: '', form: '—', time: '—' },
      { id: 'qd', t: 'dec',  lane: 1, y: yTaiHang(1, 86), dx: 0, w: 150, h: 86, tx: 'Quyết định', desc: '', form: '—', time: '—' },
    ],
    edges: [],
  });

  test('hai khối cùng hàng có TÂM trùng nhau nhưng MÉP TRÊN lệch nhau', () => {
    const s = cungHang();
    const tt = s.nodes.find(n => n.id === 'tt'), qd = s.nodes.find(n => n.id === 'qd');
    expect(tt.y + tt.h / 2).toBe(qd.y + qd.h / 2);      // tâm bằng nhau
    expect(qd.y).toBeLessThan(tt.y);                     // mép trên thì không
  });

  test('cùng hàng ⇒ đánh số TRÁI sang PHẢI, khối cao không được chen lên trước', () => {
    expect(thuTuBuoc(cungHang())).toEqual(['tt', 'qd']);
  });

  test('đảo lại: Quyết định ở cột TRÁI thì nó mới được số nhỏ hơn', () => {
    const s = cungHang();
    s.nodes.find(n => n.id === 'tt').lane = 1;
    s.nodes.find(n => n.id === 'qd').lane = 0;
    expect(thuTuBuoc(s)).toEqual(['qd', 'tt']);
  });

  test('khác hàng thì vẫn trên xuống dưới, bất kể khối cao thấp', () => {
    const s = cungHang();
    s.nodes.find(n => n.id === 'qd').y = yTaiHang(2, 86);   // Quyết định xuống hàng dưới
    expect(thuTuBuoc(s)).toEqual(['tt', 'qd']);
  });

  test('thứ tự bước KHỚP thứ tự đọc của daiBuoc — bảng diễn giải và lưu đồ cùng chiều', () => {
    const s = cungHang();
    const theoDai = daiBuoc(s).flatMap(d => d.ids)
      .filter(id => !['n0'].includes(id));
    expect(thuTuBuoc(s)).toEqual(theoDai);
  });

  test('toạ độ RÁC trong so_do (jsonb) không làm thứ tự nhảy loạn — tính như 0', () => {
    const s = cungHang();
    s.nodes.push({ id: 'rac', t: 'step', lane: 0, y: null, dx: 0, w: 164, h: '56', tx: 'rác' });
    let r;
    expect(() => { r = thuTuBuoc(s); }).not.toThrow();
    expect(r).toHaveLength(3);
    expect(r[0]).toBe('rac');                              // tâm 0 ⇒ trên cùng
  });
});

describe('kepTrongTrang — khối không kéo ra khỏi trang được', () => {
  // Ảnh xuất ra lấy viewBox đúng bằng drawW × drawH. Khối kéo ra ngoài khung đó
  // vẫn hiện trên màn hình nhưng RỤNG khỏi bản in — trình soạn thảo không được
  // phép tạo ra cái trạng thái ấy ngay từ đầu.
  const base = () => ({
    lanes: [{ name: 'A', owner: 'a', color: '#111111' }, { name: 'B', owner: 'b', color: '#222222' }],
    phases: [{ name: 'G', h: 3 * CAO_HANG }],           // trang cao 360, rộng 424
    nodes: [{ id: 'n1', t: 'step', lane: 0, y: yTaiHang(1, 56), dx: 0, w: 164, h: 56, tx: 'A' }],
    edges: [],
  });
  const n1 = s => s.nodes.find(n => n.id === 'n1');
  const trong = (s, n, dx, y) => {
    const k = kepTrongTrang(s, n, dx, y);
    const r = rectOf({ ...n, dx: k.dx, y: k.y });
    return r.x >= 0 && r.y >= 0 && r.x + r.w <= drawW(s) && r.y + r.h <= drawH(s);
  };

  test('vị trí đã hợp lệ thì KHÔNG bị dịch đi — không tự ý sửa chỗ người dùng đặt', () => {
    const s = base();
    expect(kepTrongTrang(s, n1(s), 12, 200)).toEqual({ dx: 12, y: 200 });
  });

  test('kéo quá MÉP TRÁI ⇒ dx lùi lại vừa đủ để mép trái khối chạm mép trang', () => {
    const s = base();
    const k = kepTrongTrang(s, n1(s), -999, 200);
    expect(rectOf({ ...n1(s), dx: k.dx }).x).toBe(0);
    expect(trong(s, n1(s), -999, 200)).toBe(true);
  });

  test('kéo quá MÉP PHẢI ⇒ mép phải khối chạm mép phải trang', () => {
    const s = base();
    const k = kepTrongTrang(s, n1(s), 999, 200);
    const r = rectOf({ ...n1(s), dx: k.dx });
    expect(r.x + r.w).toBe(drawW(s));
    expect(trong(s, n1(s), 999, 200)).toBe(true);
  });

  test('kéo quá MÉP TRÊN ⇒ y về 0', () => {
    const s = base();
    expect(kepTrongTrang(s, n1(s), 0, -500).y).toBe(0);
  });

  test('kéo quá MÉP DƯỚI ⇒ đáy khối chạm đáy trang', () => {
    const s = base();
    const k = kepTrongTrang(s, n1(s), 0, 9999);
    expect(k.y + n1(s).h).toBe(drawH(s));
  });

  test('kẹp CẢ HAI TRỤC trong một lần, không phải mỗi trục một lần gọi', () => {
    const s = base();
    expect(trong(s, n1(s), -9999, 9999)).toBe(true);
    expect(trong(s, n1(s), 9999, -9999)).toBe(true);
  });

  test('khối ở cột CUỐI cũng bị kẹp đúng mép phải trang', () => {
    const s = base();
    const n = { ...n1(s), lane: 1 };
    const k = kepTrongTrang(s, n, 999, 100);
    expect(rectOf({ ...n, dx: k.dx }).x + n.w).toBe(drawW(s));
  });

  test('khối Quyết định (cao 86) kẹp theo ĐÚNG chiều cao của nó', () => {
    const s = base();
    const n = { ...n1(s), t: 'dec', w: 150, h: 86 };
    expect(kepTrongTrang(s, n, 0, 9999).y).toBe(drawH(s) - 86);
  });

  test('trang HẸP hơn khối ⇒ về góc trên-trái, không đẻ ra toạ độ âm', () => {
    const s = base();
    s.lanes = [s.lanes[0]];
    s.phases = [{ name: 'G', h: 40 }];
    const k = kepTrongTrang(s, { ...n1(s), w: 500, h: 300 }, 50, 50);
    expect(k.y).toBe(0);
    expect(rectOf({ ...n1(s), w: 500, dx: k.dx }).x).toBe(0);
  });

  test('THUẦN: không sửa sơ đồ lẫn khối truyền vào', () => {
    const s = base();
    const truoc = JSON.stringify(s);
    kepTrongTrang(s, n1(s), -999, 9999);
    expect(JSON.stringify(s)).toBe(truoc);
  });

  test.each([
    ['sơ đồ null', null], ['thiếu lanes/phases', { nodes: [] }],
    ['lanes rỗng', { lanes: [], phases: [] }],
  ])('sơ đồ hỏng (%s) ⇒ không nổ, trả về số thật', (_ten, sHong) => {
    let k;
    expect(() => { k = kepTrongTrang(sHong, { lane: 0, w: 164, h: 56, dx: 0, y: 0 }, 30, 30); }).not.toThrow();
    expect(Number.isFinite(k.dx)).toBe(true);
    expect(Number.isFinite(k.y)).toBe(true);
  });

  test.each([
    ['dx rác', 'abc', 100], ['y rác', 0, null], ['cả hai rác', undefined, NaN],
  ])('toạ độ RÁC (%s) ⇒ vẫn trả số thật, không thả NaN vào bản vẽ', (_ten, dx, y) => {
    const s = base();
    const k = kepTrongTrang(s, n1(s), dx, y);
    expect(Number.isFinite(k.dx)).toBe(true);
    expect(Number.isFinite(k.y)).toBe(true);
  });

  test('khối rác (w/h/lane hỏng) ⇒ không nổ, không trả NaN', () => {
    const s = base();
    const k = kepTrongTrang(s, { id: 'x', lane: 'z', w: null, h: undefined, dx: 0, y: 0 }, 10, 10);
    expect(Number.isFinite(k.dx)).toBe(true);
    expect(Number.isFinite(k.y)).toBe(true);
  });
});

// ── KÉO NHÃN DỌC THEO ĐƯỜNG (e.viTriNhan) ────────────────────────
// Nhãn OK/NG mặc định đậu giữa ĐOẠN DÀI NHẤT. Trên lưu đồ thật, đoạn dài nhất
// thường là một quãng ngang chạy tít sang mép trái — nhãn "OK" lạc hẳn khỏi
// khối Quyết định sinh ra nó. e.viTriNhan là TỈ LỆ 0…1 dọc TỔNG chiều dài
// đường, nên nhãn luôn còn nằm TRÊN nét vẽ kể cả khi khối dời chỗ hay đường
// đổi hình (lách khối).
describe('kéo nhãn dọc theo đường — viTriNhan', () => {
  const CACH = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  const daiDuong = pts => pts.slice(0, -1).reduce((s, p, i) => s + CACH(p, pts[i + 1]), 0);

  /** Quãng đường từ đầu tới điểm p, hoặc null nếu p KHÔNG nằm trên đường.
   *  Đo lại từ đầu bằng phép khác hẳn phép của module — không đem chính hàm
   *  đang thử ra làm thước đo. */
  const quangTaiDiem = (pts, p) => {
    let truoc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const l = CACH(a, b);
      if (l > 0) {
        const cheo = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
        const doc = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l;
        if (Math.abs(cheo) / l < 1e-6 && doc >= -1e-6 && doc <= l + 1e-6) return truoc + doc;
      }
      truoc += l;
    }
    return null;
  };

  // Năm hình dạng đường của routeEdge + một đường LÁCH KHỐI + một đường ĐÃ GHIM.
  const nn = (id, lane, y, w = 164, h = 56) => ({ id, t: 'step', lane, y, dx: 0, w, h, tx: id });
  const mk = (nodes, edge) => ({
    lanes: [{}, {}, {}, {}], phases: [{ name: 'x', h: 900 }], nodes, edges: [edge],
  });
  const E = (them = {}) => ({ id: 'e', a: 'a', b: 'b', k: 'ok', lbl: 'OK', ...them });
  const DUNG = {
    ngang:      t => mk([nn('a', 0, 100), nn('b', 2, 100)], E(t)),
    xuongThang: t => mk([nn('a', 1, 100), nn('b', 1, 300)], E(t)),
    xuongLech:  t => mk([nn('a', 0, 100), nn('b', 2, 300)], E(t)),
    lenLech:    t => mk([nn('a', 0, 400), nn('b', 2, 100)], E(t)),
    lenThang:   t => mk([nn('a', 1, 400), nn('b', 1, 100)], E(t)),
    lach:       t => mkS(3, [K('a', 0, 0), K('c1', 0, 1), K('c2', 0, 2), K('c3', 0, 3), K('b', 0, 4)],
      { id: 'e', a: 'a', b: 'b', k: 'ok', lbl: 'OK', ...t }),
    ghim:       t => mkS(3, [K('a', 0, 0), K('b', 2, 3)],
      { id: 'e', a: 'a', b: 'b', k: 'ok', lbl: 'OK', raA: 'phai', vaoB: 'tren', ...t }),
  };
  const TEN = Object.keys(DUNG);
  const ve = (ten, viTriNhan) => {
    const s = DUNG[ten]({ viTriNhan });
    return routeEdge(s, s.edges[0]);
  };

  // MỐC — nhãn của bản TỰ ĐỘNG (chưa có viTriNhan), chép nguyên văn. Mọi sơ đồ
  // đã lưu trong DB đều KHÔNG có khoá này; đổi một con số ở đây là dời nhãn
  // trên bản in của tài liệu ISO đã ban hành.
  const MOC_NHAN = {
    ngang:      [318, 128],
    xuongThang: [318, 228],
    xuongLech:  [318, 228],
    lenLech:    [277, 128],
    lenThang:   [318, 278],
    lach:       [212, 300],
    ghim:       [359, 60],
  };

  test('KHÔNG có viTriNhan → nhãn y hệt bản tự động, từng con số', () => {
    for (const ten of TEN) expect(ve(ten, undefined).nhan, ten).toEqual(MOC_NHAN[ten]);
  });

  test('viTriNhan 0 / .25 / .5 / .75 / 1 → nhãn nằm ĐÚNG TRÊN đường, đúng quãng', () => {
    const hong = [];
    for (const ten of TEN) {
      const pts = ve(ten, undefined).pts;
      const tong = daiDuong(pts);
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const nhan = ve(ten, t).nhan;
        if (!nhan.every(Number.isFinite)) { hong.push(`${ten} @${t}: nhãn hỏng ${nhan}`); continue; }
        const q = quangTaiDiem(pts, nhan);
        if (q === null) { hong.push(`${ten} @${t}: nhãn ${nhan} KHÔNG nằm trên đường`); continue; }
        if (Math.abs(q - t * tong) > 1e-6) {
          hong.push(`${ten} @${t}: quãng ${q}, phải là ${t * tong}`);
        }
      }
    }
    expect(hong).toEqual([]);
  });

  test('viTriNhan 0 đậu đúng đầu đường, 1 đậu đúng cuối đường', () => {
    for (const ten of TEN) {
      const pts = ve(ten, undefined).pts;
      expect(ve(ten, 0).nhan, ten).toEqual([pts[0][0], pts[0][1]]);
      expect(ve(ten, 1).nhan, ten).toEqual([pts.at(-1)[0], pts.at(-1)[1]]);
    }
  });

  test('viTriNhan KHÔNG đụng vào nét vẽ — chuỗi d ra đúng từng byte', () => {
    for (const ten of TEN) {
      const goc = ve(ten, undefined);
      for (const t of [0, 0.1, 0.5, 0.9, 1]) {
        const r = ve(ten, t);
        expect(r.d, `${ten} @${t}`).toBe(goc.d);
        expect(r.pts, `${ten} @${t}`).toEqual(goc.pts);
        expect(r.keo, `${ten} @${t}`).toEqual(goc.keo);
        expect(r.neo, `${ten} @${t}`).toEqual(goc.neo);
      }
    }
  });

  test('viTriNhan RÁC → coi như KHÔNG có, nhãn về đúng chỗ tự động, không NaN', () => {
    // so_do là jsonb: '0.5', null, NaN, {} đều lọt xuống được. Luật giống hệt
    // doLech và neoHopLe — rác thì rơi về bản TỰ ĐỘNG, không ép kiểu hộ.
    // Số ngoài 0…1 cũng là rác: giao diện không bao giờ đẻ ra được nó, mà kẹp
    // về 0/1 là dán nhãn đè lên mũi tên hoặc lên mép khối — chỗ không đọc được.
    const RAC = ['0.5', '1', 'abc', NaN, null, undefined, true, false, {}, [],
      -1, 2, -0.0001, 1.0001, Infinity, -Infinity, 1e9];
    const hong = [];
    for (const rac of RAC) {
      for (const ten of TEN) {
        const r = ve(ten, rac);
        if (String(r.nhan) !== String(MOC_NHAN[ten])) hong.push(`${ten} với ${String(rac)}: ${r.nhan}`);
        if (!r.nhan.every(Number.isFinite)) hong.push(`${ten} với ${String(rac)}: nhãn có số hỏng`);
        if (/NaN|Infinity|undefined/.test(r.d)) hong.push(`${ten} với ${String(rac)}: path hỏng`);
      }
    }
    expect(hong).toEqual([]);
  });

  test('tiLeNhanHopLe — nhận đúng số thật trong 0…1, mọi thứ khác là KHÔNG ĐẶT', () => {
    for (const v of [0, 0.001, 0.5, 0.999, 1]) expect(tiLeNhanHopLe(v)).toBe(v);
    for (const rac of ['0.5', '1', 'abc', NaN, null, undefined, true, {}, [],
      -1, 2, -1e-9, 1 + 1e-9, Infinity, -Infinity]) {
      expect(tiLeNhanHopLe(rac), String(rac)).toBeNull();
    }
  });

  test('KHỨ HỒI: điểm trên đường → tiLeTrenDuong → nhãn về đúng chỗ đó (<1px)', () => {
    const hong = [];
    for (const ten of TEN) {
      const s = DUNG[ten]({});
      const pts = routeEdge(s, s.edges[0]).pts;
      const tong = daiDuong(pts);
      // 21 điểm rải đều dọc đường, lấy bằng phép nội suy của TEST, không của module.
      for (let k = 0; k <= 20; k++) {
        const can = (k / 20) * tong;
        let con = can, p = [pts[0][0], pts[0][1]];
        for (let i = 0; i < pts.length - 1; i++) {
          const l = CACH(pts[i], pts[i + 1]);
          if (con <= l || i === pts.length - 2) {
            const u = l > 0 ? Math.min(1, con / l) : 0;
            p = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u,
              pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u];
            break;
          }
          con -= l;
        }
        const t = tiLeTrenDuong(s, s.edges[0], p[0], p[1]);
        if (t === null) { hong.push(`${ten} @${k}: tiLeTrenDuong trả null`); continue; }
        if (!(t >= 0 && t <= 1)) { hong.push(`${ten} @${k}: tỉ lệ ${t} ngoài 0…1`); continue; }
        const q = ve(ten, t).nhan;
        if (CACH(p, q) > 1) hong.push(`${ten} @${k}: thả ${p} → về ${q}, lệch ${CACH(p, q)}px`);
      }
    }
    expect(hong).toEqual([]);
  });

  test('tiLeTrenDuong chiếu điểm THẢ LỆCH khỏi đường về chỗ gần nhất TRÊN đường', () => {
    const s = DUNG.xuongLech({});
    const pts = routeEdge(s, s.edges[0]).pts;      // [106,156] [106,228] [530,228] [530,300]
    // Thả cao hơn đoạn ngang 40px, ở giữa: phải bám về đúng (318, 228).
    const t = tiLeTrenDuong(s, s.edges[0], 318, 188);
    const nhan = routeEdge(s, { ...s.edges[0], viTriNhan: t }).nhan;
    expect(quangTaiDiem(pts, nhan)).not.toBeNull();
    expect(Math.abs(nhan[0] - 318)).toBeLessThan(1);
    expect(Math.abs(nhan[1] - 228)).toBeLessThan(1);
    // Thả tít ra ngoài trang vẫn cho một tỉ lệ THẬT trong 0…1, không NaN.
    for (const [x, y] of [[-9999, -9999], [9999, 9999], [0, 0]]) {
      const u = tiLeTrenDuong(s, s.edges[0], x, y);
      expect(Number.isFinite(u)).toBe(true);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
    }
  });

  test('tiLeTrenDuong: đầu vào hỏng → null, không nổ, không NaN', () => {
    const s = DUNG.xuongLech({});
    const e = s.edges[0];
    for (const [x, y] of [[NaN, 0], [0, NaN], ['10', 0], [null, null], [undefined, 5]]) {
      expect(tiLeTrenDuong(s, e, x, y)).toBeNull();
    }
    // đường trỏ tới khối đã xoá — routeEdge trả null thì đây cũng trả null
    expect(tiLeTrenDuong(s, { ...e, b: 'khong-co' }, 300, 200)).toBeNull();
    expect(tiLeTrenDuong(s, null, 300, 200)).toBeNull();
    expect(tiLeTrenDuong(null, e, 300, 200)).toBeNull();
  });

  test('THUẦN: routeEdge và tiLeTrenDuong không sửa sơ đồ lẫn đường nối', () => {
    const s = DUNG.xuongLech({ viTriNhan: 0.3 });
    const truoc = JSON.stringify(s);
    routeEdge(s, s.edges[0]);
    tiLeTrenDuong(s, s.edges[0], 300, 200);
    expect(JSON.stringify(s)).toBe(truoc);
  });

  test('viTriNhan đi cùng sơ đồ qua các phép biến đổi khác — không bị đánh rơi', () => {
    const s = DUNG.xuongLech({ viTriNhan: 0.2 });
    expect(xoaKhoi(s, 'khong-co').edges[0].viTriNhan).toBe(0.2);
    expect(doiCot(s, 'a', 1).edges[0].viTriNhan).toBe(0.2);
    expect(tuXepLai(s).edges[0].viTriNhan).toBe(0.2);
  });

  test('nhãn BÁM ĐƯỜNG khi khối dời chỗ — vẫn đúng tỉ lệ, vẫn trên nét vẽ', () => {
    // Chính lý do chọn "tỉ lệ dọc đường" thay vì {dx,dy}: dời khối là đường đổi
    // hình, mà nhãn vẫn phải nằm trên đường chứ không trôi ra khoảng không.
    for (const yB of [300, 420, 560]) {
      const s = mk([nn('a', 0, 100), nn('b', 2, yB)], E({ viTriNhan: 0.4 }));
      const r = routeEdge(s, s.edges[0]);
      const q = quangTaiDiem(r.pts, r.nhan);
      expect(q, `yB=${yB}`).not.toBeNull();
      expect(Math.abs(q - 0.4 * daiDuong(r.pts))).toBeLessThan(1e-6);
    }
  });

  test('QUÉT NGẪU NHIÊN 2000 sơ đồ — KHÔNG có viTriNhan thì d và nhãn không đổi một byte', () => {
    // Hạt cố định (mulberry32) để test hỏng là dựng lại được đúng sơ đồ đó.
    const rng = (hat) => () => {
      hat = (hat + 0x6d2b79f5) | 0;
      let t = Math.imul(hat ^ (hat >>> 15), 1 | hat);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const RAC = ['0.5', 'xyz', null, true, {}, [], -1, 2, NaN, Infinity];
    const hong = [];
    let soDuong = 0;
    for (let hat = 1; hat <= 2000; hat++) {
      const r = rng(hat);
      const soCot = 1 + Math.floor(r() * 4);
      const soKhoi = 2 + Math.floor(r() * 5);
      const nodes = [];
      for (let i = 0; i < soKhoi; i++) {
        nodes.push(K(`n${i}`, Math.floor(r() * soCot), Math.floor(r() * 6),
          r() < 0.25 ? 'dec' : 'step'));
      }
      const edges = [];
      for (let i = 0; i + 1 < soKhoi; i++) {
        if (r() < 0.6) continue;
        const e = { id: `e${i}`, a: `n${i}`, b: `n${i + 1}`, k: 'n', lbl: r() < 0.5 ? 'OK' : '' };
        if (r() < 0.3) e.lech = Math.floor(r() * 80) - 40;
        if (r() < 0.25) e.raA = CANH_NEO[Math.floor(r() * 4)];
        if (r() < 0.25) e.vaoB = CANH_NEO[Math.floor(r() * 4)];
        edges.push(e);
      }
      if (!edges.length) edges.push({ id: 'e0', a: 'n0', b: `n${soKhoi - 1}`, k: 'n', lbl: 'NG' });
      const s = mkS(soCot, nodes, ...edges);
      // Bản "bẩn": thêm khoá viTriNhan RÁC vào mọi đường. Phải ra y hệt bản sạch.
      const ban = { ...s, edges: s.edges.map((e, i) => ({ ...e, viTriNhan: RAC[i % RAC.length] })) };
      const g = diemGiao(s);
      if (String(diemGiao(ban)) !== String(g)) hong.push(`hạt ${hat}: diemGiao đổi`);
      for (let i = 0; i < s.edges.length; i++) {
        soDuong++;
        const sach = routeEdge(s, s.edges[i], g);
        const bua = routeEdge(ban, ban.edges[i], g);
        if (sach.d !== bua.d) hong.push(`hạt ${hat} đường ${i}: d đổi`);
        if (String(sach.nhan) !== String(bua.nhan)) hong.push(`hạt ${hat} đường ${i}: nhãn đổi`);
        if (/NaN|Infinity|undefined/.test(bua.d)) hong.push(`hạt ${hat} đường ${i}: path hỏng`);
        if (!bua.nhan.every(Number.isFinite)) hong.push(`hạt ${hat} đường ${i}: nhãn hỏng`);
      }
    }
    expect(hong).toEqual([]);
    expect(soDuong).toBeGreaterThan(2000);
  });

  test('QUÉT NGẪU NHIÊN — mọi tỉ lệ hợp lệ đều cho nhãn NẰM TRÊN đường', () => {
    const rng = (hat) => () => {
      hat = (hat + 0x6d2b79f5) | 0;
      let t = Math.imul(hat ^ (hat >>> 15), 1 | hat);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const hong = [];
    for (let hat = 1; hat <= 800; hat++) {
      const r = rng(hat);
      const soCot = 1 + Math.floor(r() * 4);
      const hangA = Math.floor(r() * 6);
      const A = K('a', Math.floor(r() * soCot), hangA, r() < 0.3 ? 'dec' : 'step');
      const B = K('b', Math.floor(r() * soCot), (hangA + 1 + Math.floor(r() * 5)) % 6,
        r() < 0.3 ? 'dec' : 'step');
      const them = {};
      if (r() < 0.4) them.raA = CANH_NEO[Math.floor(r() * 4)];
      if (r() < 0.4) them.vaoB = CANH_NEO[Math.floor(r() * 4)];
      if (r() < 0.4) them.lech = [24, -24, 9999, -9999][Math.floor(r() * 4)];
      const t = r();
      const s = mkS(soCot, [A, B], { id: 'e', a: 'a', b: 'b', k: 'n', lbl: 'OK', ...them, viTriNhan: t });
      const x = routeEdge(s, s.edges[0]);
      const tag = `hạt ${hat} (t=${t.toFixed(3)})`;
      if (!x.nhan.every(Number.isFinite)) { hong.push(`${tag}: nhãn hỏng`); continue; }
      if (quangTaiDiem(x.pts, x.nhan) === null) hong.push(`${tag}: nhãn ${x.nhan} không trên đường`);
      const lai = tiLeTrenDuong(s, s.edges[0], x.nhan[0], x.nhan[1]);
      if (lai === null || Math.abs(lai - t) > 1e-3) hong.push(`${tag}: khứ hồi ra ${lai}`);
    }
    expect(hong).toEqual([]);
  });

  test('HAI KHỐI CHỒNG KHÍT (đường thu về một điểm) → vẫn không NaN, không nổ', () => {
    for (const canh of CANH_NEO) {
      const s = mkS(2, [K('a', 0, 1), { ...K('b', 0, 1), id: 'b' }],
        { id: 'e', a: 'a', b: 'b', k: 'n', lbl: 'OK', raA: canh, vaoB: canh, viTriNhan: 0.5 });
      const r = veE(s);
      expect(r.nhan.every(Number.isFinite)).toBe(true);
      expect(r.d).not.toMatch(/NaN|Infinity|undefined/);
      const t = tiLeTrenDuong(s, s.edges[0], 100, 100);
      expect(t === null || Number.isFinite(t)).toBe(true);
    }
  });
});
