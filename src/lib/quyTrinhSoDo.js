// ============================================================
// QUY TRÌNH — hình học & biến đổi sơ đồ lưu đồ swimlane.
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md
//
// Cột = bộ phận, hàng = giai đoạn. Người thực hiện SUY RA từ cột,
// không lưu trùng ở khối — đổi cột là đổi người, một nguồn sự thật.
//
// Mọi hàm biến đổi trả về SƠ ĐỒ MỚI (bất biến) để hoàn tác chỉ là
// đẩy/rút ngăn xếp, và để test so sánh được trước/sau.
// Module thuần: không gọi DB, không đụng API trình duyệt.
// ============================================================

export const GUT = 112;      // bề ngang cột nhãn giai đoạn
export const LANE_W = 212;   // bề ngang mỗi cột bộ phận
export const HEAD_H = 46;    // chiều cao hàng tiêu đề cột

export const LOAI_KHOI = {
  start: { nhan: 'Bắt đầu',    mau: '#16a34a', w: 164, h: 48 },
  end:   { nhan: 'Kết thúc',   mau: '#475569', w: 164, h: 48 },
  step:  { nhan: 'Thao tác',   mau: '#2563eb', w: 164, h: 56 },
  dec:   { nhan: 'Quyết định', mau: '#d97706', w: 150, h: 86 },
  check: { nhan: 'Kiểm tra',   mau: '#0891b2', w: 164, h: 56 },
  doc:   { nhan: 'Tài liệu',   mau: '#7c3aed', w: 164, h: 56 },
  data:  { nhan: 'Dữ liệu',    mau: '#db2777', w: 164, h: 56 },
};

export const MAU_DUONG = { n: '#64748b', ok: '#16a34a', ng: '#dc2626' };

export const laneX = i => i * LANE_W;
export const nodeX = n => laneX(n.lane) + LANE_W / 2 - n.w / 2 + (n.dx || 0);

export function rectOf(n) {
  const x = nodeX(n);
  return { x, y: n.y, w: n.w, h: n.h, cx: x + n.w / 2, cy: n.y + n.h / 2 };
}

export const drawW = soDo => soDo.lanes.length * LANE_W;
export const drawH = soDo => soDo.phases.reduce((s, p) => s + p.h, 0);
export const phaseTop = (soDo, i) => soDo.phases.slice(0, i).reduce((s, p) => s + p.h, 0);
export const timKhoi = (soDo, id) => soDo.nodes.find(n => n.id === id);

export function phaseOf(soDo, n) {
  let acc = 0;
  for (let i = 0; i < soDo.phases.length; i++) {
    acc += soDo.phases[i].h;
    if (n.y + n.h / 2 < acc) return i;
  }
  return soDo.phases.length - 1;
}

/** Đường nối gấp khúc vuông góc, bo góc 9px — kiểu lưu đồ ISO.
 *  Trả { d, nhan:[x,y] }, hoặc null nếu thiếu khối đầu/cuối. */
export function routeEdge(soDo, e) {
  const A0 = timKhoi(soDo, e.a), B0 = timKhoi(soDo, e.b);
  if (!A0 || !B0) return null;
  const A = rectOf(A0), B = rectOf(B0);
  const dx = B.cx - A.cx, dy = B.cy - A.cy;
  let pts;

  if (Math.abs(dy) < 46) {                       // cùng tầm cao → đi ngang
    const phai = dx > 0;
    pts = [[phai ? A.x + A.w : A.x, A.cy], [phai ? B.x : B.x + B.w, B.cy]];
  } else if (dy > 0) {                           // đi xuống
    if (Math.abs(dx) < 24) {
      pts = [[A.cx, A.y + A.h], [B.cx, B.y]];
    } else {
      const giua = Math.max(A.y + A.h + 18, (A.y + A.h + B.y) / 2);
      pts = [[A.cx, A.y + A.h], [A.cx, giua], [B.cx, giua], [B.cx, B.y]];
    }
  } else {                                       // vòng ngược lên
    if (Math.abs(dx) < 24) {
      pts = [[A.cx, A.y], [B.cx, B.y + B.h]];
    } else {
      const phai = dx > 0;
      pts = [[A.cx, A.y], [A.cx, B.cy], [phai ? B.x : B.x + B.w, B.cy]];
    }
  }

  let d = `M${pts[0][0]} ${pts[0][1]}`;
  const R = 9;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(cx - px, cy - py) || 1, l2 = Math.hypot(nx - cx, ny - cy) || 1;
    const r = Math.min(R, l1 / 2, l2 / 2);
    d += ` L${cx + (px - cx) / l1 * r} ${cy + (py - cy) / l1 * r}`;
    d += ` Q${cx} ${cy} ${cx + (nx - cx) / l2 * r} ${cy + (ny - cy) / l2 * r}`;
  }
  const cuoi = pts[pts.length - 1];
  d += ` L${cuoi[0]} ${cuoi[1]}`;

  // Nhãn đặt giữa đoạn dài nhất
  let best = 0, bl = -1;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (len > bl) { bl = len; best = i; }
  }
  return { d, nhan: [(pts[best][0] + pts[best + 1][0]) / 2, (pts[best][1] + pts[best + 1][1]) / 2] };
}

const KHOANG_DOC = 46;   // khoảng hở dọc giữa hai bước nối tiếp

const sao = soDo => ({
  lanes:  soDo.lanes.map(l => ({ ...l })),
  phases: soDo.phases.map(p => ({ ...p })),
  nodes:  soDo.nodes.map(n => ({ ...n })),
  edges:  soDo.edges.map(e => ({ ...e })),
});

let dem = 0;
const idMoi = tien => `${tien}${Date.now().toString(36)}${(dem++).toString(36)}`;

/** Thứ tự đánh số bước: trên xuống dưới, trái sang phải. Bỏ Bắt đầu/Kết thúc. */
export function thuTuBuoc(soDo) {
  return soDo.nodes
    .filter(n => n.t !== 'start' && n.t !== 'end')
    .slice()
    .sort((a, b) => (a.y - b.y) || (nodeX(a) - nodeX(b)))
    .map(n => n.id);
}

/** Thêm bước nối tiếp từ một khối. Tự đặt chỗ, tự nối, tự đẩy khối chắn chỗ.
 *  nhanh: '' | 'ok' | 'ng'  — 'ng' rẽ ngang cùng tầm, còn lại xuống dưới. */
export function themBuoc(soDo, { tuId, nhanh = '', loai, cot, ten }) {
  const nguon = timKhoi(soDo, tuId);
  if (!nguon) throw new Error('Không tìm thấy khối nguồn khi thêm bước: ' + tuId);
  const T = LOAI_KHOI[loai];
  if (!T) throw new Error('Loại khối không hợp lệ: ' + loai);

  const s = sao(soDo);
  // Nhánh NG rẽ ngang chỉ có nghĩa khi sang cột KHÁC. Chọn đúng cột của khối
  // nguồn thì rẽ ngang sẽ chồng lên chính nó, nên rơi về cách đặt thường: xuống dưới.
  const cungCot = cot === nguon.lane;
  const y = (nhanh === 'ng' && !cungCot)
    ? nguon.y + Math.round((nguon.h - T.h) / 2)
    : nguon.y + nguon.h + KHOANG_DOC;

  // Đẩy DỒN: mọi khối trong cột đích nằm từ chỗ chèn trở xuống đều dịch cùng
  // một khoảng, nên thứ tự trên-dưới giữ nguyên và không sinh khối chồng nhau.
  // Trừ chính khối nguồn ra — đẩy nguồn thì nhánh của nó rơi lên trên nó.
  const dichXuong = T.h + KHOANG_DOC;
  for (const n of s.nodes) {
    if (n.lane === cot && n.id !== tuId && n.y + n.h > y - 12) n.y += dichXuong;
  }

  const id = idMoi('n');
  s.nodes.push({
    id, t: loai, lane: cot, y, dx: 0, w: T.w, h: T.h,
    tx: (ten || '').trim() || 'Bước mới',
    desc: '', form: '—', time: '—', color: null,
  });
  s.edges.push({
    id: idMoi('e'), a: tuId, b: id,
    lbl: nhanh === 'ok' ? 'OK' : nhanh === 'ng' ? 'NG' : '',
    k: nhanh || 'n',
  });

  // Nới hàng cuối nếu lưu đồ dài ra
  const can = Math.max(...s.nodes.map(n => n.y + n.h)) + 34;
  if (can > drawH(s)) s.phases[s.phases.length - 1].h += can - drawH(s);
  return s;
}

export function xoaKhoi(soDo, id) {
  const s = sao(soDo);
  s.nodes = s.nodes.filter(n => n.id !== id);
  s.edges = s.edges.filter(e => e.a !== id && e.b !== id);
  return s;
}

/** Đổi cột = đổi bộ phận phụ trách = đổi người thực hiện ở bảng diễn giải. */
export function doiCot(soDo, id, cot) {
  const s = sao(soDo);
  const n = s.nodes.find(x => x.id === id);
  if (n) { n.lane = cot; n.dx = 0; }
  return s;
}

/** Căn giữa khối theo cột và giãn đều trong từng giai đoạn.
 *  CỐ Ý không đảo thứ tự: người dùng phải đoán được kết quả trước khi bấm. */
export function tuXepLai(soDo) {
  if (!soDo?.phases?.length) return sao(soDo);   // không có hàng nào thì không xếp gì
  const s = sao(soDo);
  const HO = 44, LE = 28;
  const nhom = s.phases.map(() => []);
  for (const n of s.nodes) nhom[phaseOf(soDo, n)].push(n);

  nhom.forEach((g, i) => {
    g.sort((a, b) => (a.y - b.y) || (nodeX(a) - nodeX(b)));
    const tang = [];
    for (const n of g) {
      // Cùng một cột thì KHÔNG bao giờ chung tầng: một tầng nghĩa là "nằm cạnh
      // nhau trên một hàng", hai khối cùng cột không thể cạnh nhau. Bỏ điều kiện
      // này thì hai khối cùng cột cách nhau <44px sẽ trùng khít pixel và một
      // bước biến mất khỏi bản in.
      const t = tang.find(t => Math.abs(t.y - n.y) < HO
                            && !t.items.some(m => m.lane === n.lane));
      if (t) t.items.push(n); else tang.push({ y: n.y, items: [n] });
    }
    let cur = LE;
    for (const t of tang) {
      const hMax = Math.max(...t.items.map(n => n.h));
      for (const n of t.items) {
        n.dx = 0;
        n.y = phaseTop(s, i) + cur + Math.round((hMax - n.h) / 2);
      }
      cur += hMax + HO;
    }
    s.phases[i].h = Math.max(s.phases[i].h, cur - HO + LE);
  });
  return s;
}
