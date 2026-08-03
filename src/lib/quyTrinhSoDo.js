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
