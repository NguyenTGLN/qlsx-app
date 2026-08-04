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

export const KE_HO_BE = 12;   // hở tối thiểu giữa chỗ bẻ và cạnh khối, khi kéo tay

/** `lech` của một đường nối, đã lọc rác. CHỈ nhận số thật: `lech` nằm trong
 *  so_do (jsonb) nên số lưu xuống lấy lên vẫn là số — gặp chuỗi hay null nghĩa
 *  là dữ liệu hỏng, ép kiểu hộ lúc đó chỉ giấu cái hỏng đi. Number.isFinite
 *  KHÔNG tự ép kiểu: '40', NaN, null, true, {} đều rơi về 0. */
const doLech = e => (Number.isFinite(e?.lech) ? e.lech : 0);

/** Nhích chỗ bẻ đi `lech`, kẹp trong [lo, hi] để đường không quặt ngược vào
 *  chính khối vừa đi ra.
 *  · lech = 0 thì trả THẲNG giá trị tự động, không kẹp: mọi sơ đồ đã lưu đều
 *    không có lech, vẽ chúng phải ra đúng từng byte như trước.
 *  · Khoảng cho phép luôn được nới để CHỨA giá trị tự động — hai khối sát nhau
 *    có thể làm lo > hi, kẹp cứng lúc đó sẽ dời đường đi ngay cả khi lech nhỏ. */
function nhich(tuDong, lech, lo, hi) {
  if (!lech) return tuDong;
  return Math.min(Math.max(tuDong + lech, Math.min(lo, tuDong)), Math.max(hi, tuDong));
}

/** Đường nối gấp khúc vuông góc, bo góc 9px — kiểu lưu đồ ISO.
 *  Trả { d, nhan:[x,y], keo }, hoặc null nếu thiếu khối đầu/cuối.
 *
 *  `keo` tả ĐOẠN KÉO TAY ĐƯỢC để giao diện đặt núm mà không phải tính lấy một
 *  toạ độ nào — null nghĩa là đường này thẳng tuột, không có chỗ bẻ để chỉnh:
 *    { huong:'ngang', x, y, tu:[x,y], den:[x,y] }  kéo LÊN/XUỐNG, đổi y
 *    { huong:'doc',   x, y, tu:[x,y], den:[x,y] }  kéo TRÁI/PHẢI, đổi x
 *  x,y là TRUNG ĐIỂM đoạn đó (chỗ đặt núm); tu/den là hai đầu.
 *
 *  e.lech là số dôi TƯƠNG ĐỐI so với chỗ bẻ tự động, không phải toạ độ tuyệt
 *  đối: lưu toạ độ thì kéo khối một cái là chỗ bẻ rơi lại đằng sau. */
export function routeEdge(soDo, e) {
  const A0 = timKhoi(soDo, e.a), B0 = timKhoi(soDo, e.b);
  if (!A0 || !B0) return null;
  const A = rectOf(A0), B = rectOf(B0);
  const dx = B.cx - A.cx, dy = B.cy - A.cy;
  const lech = doLech(e);
  let pts, keo = null;

  if (Math.abs(dy) < 46) {                       // cùng tầm cao → đi ngang
    const phai = dx > 0;
    pts = [[phai ? A.x + A.w : A.x, A.cy], [phai ? B.x : B.x + B.w, B.cy]];
  } else if (dy > 0) {                           // đi xuống
    if (Math.abs(dx) < 24) {
      pts = [[A.cx, A.y + A.h], [B.cx, B.y]];
    } else {
      const giua = nhich(Math.max(A.y + A.h + 18, (A.y + A.h + B.y) / 2), lech,
        A.y + A.h + KE_HO_BE, B.y - KE_HO_BE);
      pts = [[A.cx, A.y + A.h], [A.cx, giua], [B.cx, giua], [B.cx, B.y]];
      keo = { huong: 'ngang', x: (A.cx + B.cx) / 2, y: giua, tu: [A.cx, giua], den: [B.cx, giua] };
    }
  } else {                                       // vòng ngược lên
    if (Math.abs(dx) < 24) {
      pts = [[A.cx, A.y], [B.cx, B.y + B.h]];
    } else {
      const phai = dx > 0;
      // Nhánh dọc leo ra từ cạnh TRÊN khối nguồn, nên kẹp trong bề ngang khối
      // đó: đẩy quá là đường mọc ra từ khoảng không cạnh khối.
      const doc = nhich(A.cx, lech, A.x + KE_HO_BE, A.x + A.w - KE_HO_BE);
      pts = [[doc, A.y], [doc, B.cy], [phai ? B.x : B.x + B.w, B.cy]];
      keo = { huong: 'doc', x: doc, y: (A.y + B.cy) / 2, tu: [doc, A.y], den: [doc, B.cy] };
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
  return {
    d,
    nhan: [(pts[best][0] + pts[best + 1][0]) / 2, (pts[best][1] + pts[best + 1][1]) / 2],
    keo,
  };
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

/** Xoá một cột. Trả sơ đồ MỚI. Ném lỗi nếu cột còn khối — người dùng phải
 *  kéo khối đi trước, để họ tự thấy bước của mình đổi bộ phận phụ trách. */
export function xoaCot(soDo, i) {
  const lanes = soDo?.lanes || [];
  if (!Number.isInteger(i) || i < 0 || i >= lanes.length) {
    throw new Error(`Không có cột số ${Number(i) + 1} để xoá — lưu đồ đang có ${lanes.length} cột.`);
  }
  if (lanes.length <= 1) {
    throw new Error('Lưu đồ phải còn ít nhất một cột bộ phận — không xoá được cột cuối cùng.');
  }
  const dung = (soDo.nodes || []).filter(n => n.lane === i);
  if (dung.length) {
    throw new Error(
      `Cột “${lanes[i].name}” còn ${dung.length} khối. Hãy chuyển các khối này sang cột khác `
      + 'rồi mới xoá cột — đổi cột là đổi người thực hiện, phải do người dùng tự quyết.');
  }

  const s = sao(soDo);
  s.lanes.splice(i, 1);
  // lane là CHỈ SỐ vào lanes. Bỏ một cột thì mọi cột bên phải tụt một bậc; không
  // dời theo thì khối lặng lẽ nhảy sang bộ phận khác mà không có lỗi nào báo ra.
  for (const n of s.nodes) if (n.lane > i) n.lane -= 1;
  return s;
}

/** Xoá một hàng giai đoạn. Trả sơ đồ MỚI. Ném lỗi nếu hàng còn khối. */
export function xoaHang(soDo, i) {
  const phases = soDo?.phases || [];
  if (!Number.isInteger(i) || i < 0 || i >= phases.length) {
    throw new Error(`Không có hàng giai đoạn số ${Number(i) + 1} để xoá — lưu đồ đang có ${phases.length} hàng.`);
  }
  if (phases.length <= 1) {
    throw new Error('Lưu đồ phải còn ít nhất một hàng giai đoạn — không xoá được hàng cuối cùng.');
  }
  const nodes = soDo.nodes || [];
  const dung = nodes.filter(n => phaseOf(soDo, n) === i);
  if (dung.length) {
    throw new Error(
      `Hàng “${phases[i].name}” còn ${dung.length} khối. Hãy kéo các khối này sang giai đoạn khác `
      + 'rồi mới xoá hàng.');
  }

  // Khối KHÔNG mang chỉ số hàng — nó nằm ở đâu là do y tuyệt đối, phaseOf đọc
  // ngược ra từ mốc cộng dồn chiều cao. Bỏ một hàng cao h mà không kéo phần dưới
  // lên đúng h thì mốc dịch còn khối đứng yên: cùng một khối, sang tên giai đoạn
  // khác, không một dòng lỗi nào báo.
  const cao = phases[i].h;
  const s = sao(soDo);
  s.phases.splice(i, 1);
  for (let k = 0; k < nodes.length; k++) {
    if (phaseOf(soDo, nodes[k]) > i) s.nodes[k].y -= cao;
  }
  return s;
}

export const NGUONG_HUT = 10;   // tâm cách nhau bao nhiêu px thì nam châm bắt

/** Hút khối đang kéo về ngang hàng với khối khác.
 *  Trả { y, mocY } — y đã hút (hoặc y gốc nếu không có gì để hút),
 *  và mocY là toạ độ đường gióng để vẽ, hoặc null nếu không hút vào đâu.
 *
 *  So theo TÂM chứ không theo ĐỈNH. Khối Quyết định cao 86, khối Thao tác cao
 *  56 — căn đỉnh thì hai khối "cùng bước" vẫn so le 15px, nhìn thấy rõ trên bản
 *  in A3. Ngang hàng theo mắt người là tâm trùng nhau.
 *
 *  Khối đang kéo KHÔNG tính chính nó: lúc kéo, y lưu ở sơ đồ vẫn là chỗ cũ, tính
 *  vào thì nó tự ghim mình tại chỗ xuất phát, nhích 4px là bị kéo ngược về.
 *
 *  Chọn khối GẦN NHẤT. Cách đều thì lấy khối có tâm NHỎ HƠN (nằm trên) — luật cố
 *  định, không phụ thuộc thứ tự khối trong mảng, để cùng một thao tác kéo luôn
 *  cho cùng một kết quả.
 *
 *  Thuần: chỉ đọc soDo và trả về số, không sửa gì. */
export function hutHang(soDo, id, y, nguong = NGUONG_HUT) {
  const ds = soDo?.nodes || [];
  const n = ds.find(m => m.id === id);
  if (!n) return { y, mocY: null };
  const tam = y + n.h / 2;

  let gan = null;
  for (const m of ds) {
    if (m.id === id) continue;
    const c = m.y + m.h / 2;
    const d = Math.abs(c - tam);
    if (d > nguong) continue;
    if (!gan || d < gan.d || (d === gan.d && c < gan.c)) gan = { d, c };
  }
  if (!gan) return { y, mocY: null };
  return { y: gan.c - n.h / 2, mocY: gan.c };
}

export const DUNG_SAI_DAI = 24;   // tâm cách nhau bao nhiêu px thì vẫn tính là MỘT hàng
// Nền so le và vạch ngăn của dải bước. Để ở đây để trình vẽ và bản xuất SVG
// dùng CHUNG một bộ màu — hai nơi tô lệch nhau là bản in khác màn hình.
export const MAU_DAI = { nen: '#f8fafc', vach: '#e9eef5' };

/** Gom khối thành các DẢI BƯỚC theo tâm dọc. Hai khối đã hút ngang hàng
 *  (tâm bằng nhau) luôn vào chung một dải.
 *  Trả [{ tam, y1, y2, ids }] xếp từ trên xuống — y1/y2 là mép dải để vẽ.
 *
 *  CHỈ ĐỌC chỗ khối đang đứng: không dời khối nào, không đẻ thêm luật xếp tự
 *  động. Người dùng vẫn cầm quyền đặt khối ở đâu, dải chỉ vẽ lại kết quả đó.
 *
 *  So theo TÂM chứ không theo ĐỈNH, cùng lý lẽ với hutHang: Quyết định cao 86
 *  và Thao tác cao 56 nằm ngang hàng thì đỉnh lệch nhau 15px. Gom theo đỉnh là
 *  tách nhầm đúng hai khối người dùng vừa cất công hút cho bằng hàng.
 *
 *  Mép chung của hai dải nằm CHÍNH GIỮA khe hở — giữa đáy thấp nhất của dải trên
 *  và đỉnh cao nhất của dải dưới — nên vạch ngăn rơi vào khe, không xẻ ngang khối
 *  nào. Riêng khi hai khối CHỒNG NHAU theo chiều dọc mà tâm vẫn cách nhau quá
 *  dung sai thì không đường ngang nào tách được chúng (mọi y giữa hai tâm đều
 *  nằm trong khối này hoặc khối kia); lúc đó vạch vẫn đi qua, nhưng nó được vẽ
 *  DƯỚI khối nên bị chính khối che đi.
 *
 *  Số hỏng (chuỗi, null, thiếu — so_do là jsonb, không ràng buộc kiểu) tính như
 *  0, đúng lối doLech: không ép kiểu hộ để khỏi giấu cái hỏng đi, nhưng cũng
 *  không thả NaN chảy vào toạ độ vẽ. */
export function daiBuoc(soDo, dungSai = DUNG_SAI_DAI) {
  const soThat = v => (Number.isFinite(v) ? v : 0);
  const khoi = [];
  for (const n of (Array.isArray(soDo?.nodes) ? soDo.nodes : [])) {
    if (!n || typeof n !== 'object') continue;
    const y = soThat(n.y), h = soThat(n.h);
    khoi.push({ id: n.id, x: soThat(nodeX(n)), tam: y + h / 2, tren: y, duoi: y + h });
  }
  if (!khoi.length) return [];

  const sai = soThat(dungSai);
  const cao = Array.isArray(soDo?.phases) ? soThat(drawH(soDo)) : 0;
  // Thứ tự khối trong mảng là thứ tự người dùng THÊM, không liên quan gì tới chỗ
  // chúng đứng trên trang — phải sắp theo tâm rồi mới gom.
  khoi.sort((a, b) => (a.tam - b.tam) || (a.x - b.x));

  const nhom = [];
  for (const k of khoi) {
    const g = nhom[nhom.length - 1];
    // So với khối LIỀN TRƯỚC, không so với khối mở đầu nhóm: luật là "hai tâm
    // cách nhau trong dung sai thì chung một dải", và nó phải đúng với mọi cặp.
    if (g && k.tam - g.tamCuoi <= sai) {
      g.ds.push(k);
      g.tamCuoi = k.tam;
      g.tren = Math.min(g.tren, k.tren);
      g.duoi = Math.max(g.duoi, k.duoi);
    } else {
      nhom.push({ ds: [k], tamCuoi: k.tam, tren: k.tren, duoi: k.duoi });
    }
  }

  const dai = [];
  let y1 = 0;
  nhom.forEach((g, i) => {
    const sau = nhom[i + 1];
    // Math.max(y1, …): kéo khối bằng tay KHÔNG nới chiều cao giai đoạn, nên khối
    // tụt xuống dưới đáy trang là chuyện có thật — mép dưới rơi lên trên mép trên
    // thì dải cao âm, trình duyệt bỏ luôn hình đó. Kẹp một nhịp là hết, các dải
    // vẫn liền mạch vì mép dưới của dải này là mép trên của dải kia.
    const y2 = Math.max(y1, sau ? (g.duoi + sau.tren) / 2 : cao);
    dai.push({
      tam: g.ds.reduce((s, k) => s + k.tam, 0) / g.ds.length,
      y1,
      y2,
      ids: g.ds.slice().sort((a, b) => a.x - b.x).map(k => k.id),
    });
    y1 = y2;
  });
  return dai;
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
