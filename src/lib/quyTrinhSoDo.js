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

// ── LƯỚI HÀNG ────────────────────────────────────────────────────
// Chiều dọc chia thành các HÀNG CAO BẰNG NHAU. Khối rơi vào TÂM Ô — giao của
// hàng với cột — nên khối Quyết định (cao 86) và khối Thao tác (cao 56) cùng
// hàng thì trông thẳng hàng. Căn theo TÂM chứ không theo ĐỈNH: căn đỉnh là hai
// khối "cùng bước" so le 15px, nhìn thấy rõ trên bản in A3. Đúng luật hutHang
// đã dùng từ trước.
//
// 120 = khối cao nhất (Quyết định, 86) + 34 hở, đủ để khối không dính vạch ngăn.
//
// KHÔNG có ô "hàng" nào lưu ở khối: hàng SUY RA từ y, y vẫn là nguồn sự thật duy
// nhất. Lưới là LUẬT ĐẶT KHỐI, không phải trường dữ liệu mới — nhờ vậy mọi sơ đồ
// đã lưu vẫn đọc và vẽ được y như cũ, chỉ là chưa thẳng lưới cho tới khi người
// dùng bấm "Tự xếp lại".
//
// Chiều cao giai đoạn (phases[].h) phải là BỘI SỐ của CAO_HANG, nếu không mốc
// ngăn giai đoạn xẻ ngang giữa một hàng. Mọi chỗ TẠO hoặc NỚI h đều phải giữ.
export const CAO_HANG = 120;

/** Số thật, không ép kiểu hộ: so_do là jsonb nên '10', null, NaN đều có thể lọt
 *  vào toạ độ. Chúng tính như 0 — lệch chỗ thì còn sửa được, NaN thì vỡ bản vẽ. */
const soThat = v => (Number.isFinite(v) ? v : 0);

/** Tâm ô của hàng r — chỗ đặt TÂM khối. */
export const tamHang = r => soThat(r) * CAO_HANG + CAO_HANG / 2;

/** Khối đang ở hàng nào, đọc ngược ra từ TÂM khối. */
export const hangCua = n => Math.round((soThat(n?.y) + soThat(n?.h) / 2 - CAO_HANG / 2) / CAO_HANG);

/** y để khối cao h rơi đúng tâm hàng r. */
export const yTaiHang = (r, h) => tamHang(r) - soThat(h) / 2;

/** Làm tròn LÊN bội số CAO_HANG, tối thiểu một hàng. Dùng ở MỌI chỗ tạo hoặc
 *  nới chiều cao giai đoạn — h lẻ là mốc ngăn giai đoạn cắt ngang giữa hàng.
 *  Xuất ra ngoài để giao diện gọi được mà không phải tự tính lấy con số nào. */
export const tronCaoGiaiDoan = v => Math.max(CAO_HANG, Math.ceil(soThat(v) / CAO_HANG) * CAO_HANG);

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
 *  nhanh: '' | 'ok' | 'ng'  — 'ng' rẽ ngang cùng hàng, còn lại xuống hàng dưới.
 *
 *  Khối mới LUÔN rơi vào TÂM Ô — giao của hàng với cột đã chọn. Không còn cộng
 *  dồn pixel từ chỗ khối nguồn đang đứng: cộng pixel thì mỗi lần thêm một bước
 *  lại đẻ ra một độ cao hàng khác nhau, đúng thứ người dùng bảo phải hết. */
export function themBuoc(soDo, { tuId, nhanh = '', loai, cot, ten }) {
  const nguon = timKhoi(soDo, tuId);
  if (!nguon) throw new Error('Không tìm thấy khối nguồn khi thêm bước: ' + tuId);
  const T = LOAI_KHOI[loai];
  if (!T) throw new Error('Loại khối không hợp lệ: ' + loai);

  const s = sao(soDo);
  // Nhánh NG rẽ ngang chỉ có nghĩa khi sang cột KHÁC. Chọn đúng cột của khối
  // nguồn thì rẽ ngang sẽ chồng lên chính nó, nên rơi về cách đặt thường: xuống dưới.
  //
  // Nhánh NG dùng ĐÚNG HÀNG của khối nguồn, nên nguồn đứng thẳng lưới thì hai
  // khối trùng tâm — rẽ ngang thật sự nằm ngang. Nguồn còn lệch lưới (sơ đồ lưu
  // từ trước) thì khối mới vẫn về tâm ô: cái mới luôn đúng lưới, cái cũ chỉnh
  // một lần bằng nút "Tự xếp lại".
  const cungCot = cot === nguon.lane;
  const hangNguon = hangCua(nguon);
  const hang = (nhanh === 'ng' && !cungCot) ? hangNguon : hangNguon + 1;
  const y = yTaiHang(hang, T.h);

  // Đẩy DỒN THEO HÀNG: mọi khối trong cột đích nằm từ hàng chèn trở xuống đều
  // tụt đúng MỘT HÀNG, nên thứ tự trên-dưới giữ nguyên, không sinh khối chồng
  // nhau, và khối bị đẩy vẫn đậu đúng tâm ô của hàng mới. Đẩy theo pixel thì
  // khối bị đẩy rơi ra ngoài lưới ngay lần chèn đầu tiên.
  // Trừ chính khối nguồn ra — đẩy nguồn thì nhánh của nó rơi lên trên nó.
  for (const n of s.nodes) {
    if (n.lane === cot && n.id !== tuId && hangCua(n) >= hang) n.y += CAO_HANG;
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

  // Nới hàng cuối nếu lưu đồ dài ra — nới THEO HÀNG TRỌN VẸN, không nới lẻ:
  // giai đoạn cao lẻ là mốc ngăn giai đoạn xẻ ngang giữa một hàng.
  const can = (Math.max(...s.nodes.map(n => hangCua(n))) + 1) * CAO_HANG;
  if (s.phases.length && can > drawH(s)) {
    const p = s.phases[s.phases.length - 1];
    p.h = tronCaoGiaiDoan(soThat(p.h) + (can - drawH(s)));
  }
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

/** Hút khối đang kéo về ngang hàng với khối khác, HOẶC về tâm ô của hàng gần nhất.
 *  Trả { y, mocY } — y đã hút (hoặc y gốc nếu không có gì để hút),
 *  và mocY là toạ độ đường gióng để vẽ, hoặc null nếu không hút vào khối nào.
 *
 *  Hai nam châm, cùng một luật "so theo TÂM":
 *    · tâm khối khác  → có đường gióng, vì có khối thật để gióng vào;
 *    · tâm ô của lưới → không đường gióng, vì chẳng gióng vào khối nào cả.
 *  Khối đã thẳng lưới thì hai nam châm TRÙNG NHAU, nên thêm cái thứ hai không
 *  làm hỏng cái thứ nhất; cách đều thì khối thắng, để người dùng thấy đường gióng.
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
  // Số hỏng trong so_do (jsonb, không ràng buộc kiểu) làm d thành NaN, mà
  // `NaN > nguong` là false — không chặn ở đây thì khối rác thành đích hút và
  // trả về y = NaN, khối biến mất khỏi bản vẽ.
  const xet = (c, moc) => {
    const d = Math.abs(c - tam);
    if (!Number.isFinite(d) || d > nguong) return;
    if (!gan || d < gan.d || (d === gan.d && c < gan.c)) gan = { d, c, moc };
  };
  // Xét KHỐI trước, tâm ô sau: cách đều nhau thì khối đã đăng ký trước sẽ thắng
  // (luật `c < gan.c` không lật ngược khi hai tâm bằng nhau), nên vẫn có đường gióng.
  for (const m of ds) if (m.id !== id) xet(m.y + m.h / 2, m.y + m.h / 2);
  xet(tamHang(Math.round((tam - CAO_HANG / 2) / CAO_HANG)), null);

  if (!gan) return { y, mocY: null };
  return { y: gan.c - n.h / 2, mocY: gan.moc };
}

// Nền so le và vạch ngăn của dải bước. Để ở đây để trình vẽ và bản xuất SVG
// dùng CHUNG một bộ màu — hai nơi tô lệch nhau là bản in khác màn hình.
//
// Bản đầu để rất nhạt (#f8fafc / #e9eef5) cho khỏi lấn cột, nhưng người dùng
// bảo nhìn không rõ hàng. Đậm lên như dưới đây: nền dải ~7% xanh lạnh, vạch ngăn
// đủ rõ để đọc được từng bước trên bản in A3 kể cả khi in đen trắng.
// Vẫn nhạt hơn nền cột (rgba(148,163,184,.045) chồng LÊN nền dải) nên cột vẫn là
// cấu trúc chính, dải bước là chia nhỏ bên trong.
export const MAU_DAI = { nen: '#e8eff8', vach: '#c2d0e0' };

/** Các DẢI BƯỚC của trang — HÀNG ĐỀU, mỗi dải cao đúng CAO_HANG.
 *  Trả [{ tam, y1, y2, ids }] xếp từ trên xuống — y1/y2 là mép dải để vẽ,
 *  tam là tâm ô, ids là các khối rơi vào hàng đó (trái → phải).
 *
 *  Dải KHÔNG còn suy ra từ chỗ khối đang đứng nữa: bản cũ gom khối theo tâm nên
 *  mỗi hàng cao một kiểu, đúng thứ người dùng bảo phải hết ("chiều cao các hàng
 *  bằng nhau"). Nay lưới có trước, khối rơi vào lưới — hàng nào không có khối
 *  vẫn là một hàng, ids rỗng.
 *
 *  Phủ TRỌN chiều cao trang: số dải đủ để chứa cả drawH lẫn hàng thấp nhất còn
 *  khối (kéo khối bằng tay không nới chiều cao giai đoạn, nên khối tụt quá đáy
 *  trang là chuyện có thật). Chiều cao giai đoạn là bội số CAO_HANG thì các dải
 *  khép đúng vào drawH, không thừa không thiếu.
 *
 *  Khối bị kéo lên TRÊN mép trang (hàng âm) tính vào hàng 0: không có hàng nào
 *  ở trên đó để nó thuộc về, mà bỏ hẳn thì khối biến mất khỏi danh sách ids.
 *
 *  CHỈ ĐỌC: không dời khối nào. Số hỏng (chuỗi, null, thiếu — so_do là jsonb,
 *  không ràng buộc kiểu) tính như 0, không thả NaN chảy vào toạ độ vẽ. */
export function daiBuoc(soDo) {
  const khoi = [];
  for (const n of (Array.isArray(soDo?.nodes) ? soDo.nodes : [])) {
    if (!n || typeof n !== 'object') continue;
    khoi.push({ id: n.id, x: soThat(nodeX(n)), hang: Math.max(0, hangCua(n)) });
  }

  const cao = Array.isArray(soDo?.phases) ? soThat(drawH(soDo)) : 0;
  let soHang = Math.max(0, Math.ceil(cao / CAO_HANG));
  for (const k of khoi) soHang = Math.max(soHang, k.hang + 1);
  if (!soHang) return [];

  const dai = Array.from({ length: soHang }, (_, r) => ({
    tam: tamHang(r), y1: r * CAO_HANG, y2: (r + 1) * CAO_HANG, ids: [],
  }));
  // Thứ tự khối trong mảng là thứ tự người dùng THÊM, không liên quan gì tới chỗ
  // chúng đứng trên trang — ids phải xếp lại theo x để đọc trái → phải.
  for (const k of khoi.slice().sort((a, b) => a.x - b.x)) dai[k.hang].ids.push(k.id);
  return dai;
}

/** Căn giữa khối theo cột và ĐƯA CẢ SƠ ĐỒ VỀ ĐÚNG LƯỚI HÀNG.
 *  Mỗi tầng khối chiếm trọn một hàng, khối rơi vào tâm ô; chiều cao giai đoạn
 *  làm tròn lên bội số CAO_HANG để mốc ngăn giai đoạn không xẻ ngang hàng nào.
 *
 *  Đây cũng là nút "chỉnh lại cho thẳng lưới" của những sơ đồ lưu từ trước khi
 *  có lưới: chúng vẫn mở, vẫn vẽ, vẫn in được, chỉ là chưa thẳng hàng cho tới
 *  khi bấm nút này một lần.
 *
 *  CỐ Ý không đảo thứ tự: người dùng phải đoán được kết quả trước khi bấm. Thứ
 *  tự tầng và cách gom tầng giữ y như cũ — chỉ đổi chỗ ĐẶT tầng, không đổi tầng
 *  nào gồm những khối nào. */
export function tuXepLai(soDo) {
  if (!soDo?.phases?.length) return sao(soDo);   // không có hàng nào thì không xếp gì
  const s = sao(soDo);
  const HO = 44;
  const nhom = s.phases.map(() => []);
  for (const n of s.nodes) nhom[phaseOf(soDo, n)].push(n);

  let hang = 0;                 // hàng đầu tiên của giai đoạn đang xếp
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
    // Mỗi tầng một hàng, khối đặt theo TÂM nên khối cao thấp khác nhau vẫn thẳng.
    tang.forEach((t, k) => {
      for (const n of t.items) { n.dx = 0; n.y = yTaiHang(hang + k, n.h); }
    });
    // Giai đoạn phải đủ hàng cho các tầng của nó, và luôn là bội số CAO_HANG —
    // chỉ NỚI, không co lại, để chỗ trống người dùng cố ý chừa ra không mất đi.
    const soHang = Math.max(tang.length, tronCaoGiaiDoan(s.phases[i].h) / CAO_HANG);
    s.phases[i].h = soHang * CAO_HANG;
    hang += soHang;
  });
  return s;
}
