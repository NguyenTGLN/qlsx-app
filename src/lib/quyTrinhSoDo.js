// ============================================================
// QUY TRÌNH — hình học & biến đổi sơ đồ lưu đồ swimlane.
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md
//
// Cột = bộ phận, hàng = BƯỚC (đánh số tự động "Bước 1", "Bước 2"…).
// Người thực hiện SUY RA từ cột, không lưu trùng ở khối — đổi cột là đổi
// người, một nguồn sự thật.
//
// Mọi hàm biến đổi trả về SƠ ĐỒ MỚI (bất biến) để hoàn tác chỉ là
// đẩy/rút ngăn xếp, và để test so sánh được trước/sau.
// Module thuần: không gọi DB, không đụng API trình duyệt.
// ============================================================

export const GUT = 112;      // bề ngang cột nhãn bước
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
export const drawH = soDo => soHangCua(soDo) * CAO_HANG;
export const timKhoi = (soDo, id) => soDo.nodes.find(n => n.id === id);

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

// ── SỐ HÀNG (soDo.soHang) ────────────────────────────────────────
// Chiều cao trang = SỐ HÀNG × CAO_HANG, chấm hết. Trước đây nó là tổng chiều
// cao các "giai đoạn" người dùng tự đặt tên (soDo.phases = [{name, h}]), mỗi
// giai đoạn cao vài hàng — hai đơn vị chồng lên nhau, và người dùng phải tự
// nghĩ ra tên cho từng cụm. Nay cột trái chỉ còn "Bước 1", "Bước 2"… đánh số
// tự động, một nhãn cho một hàng, nên chỉ cần ĐẾM hàng.
//
// soDo.phases KHÔNG bị xoá khỏi bản lưu — xem chú thích ở sao(). Nó thôi quyết
// định bố cục, thế thôi. Xoá dữ liệu người dùng đã gõ như một hệ quả phụ của
// việc đổi cách vẽ là chuyện không được làm.

/** Sơ đồ mới bắt đầu bằng hai hàng: một cho Bắt đầu, một cho Kết thúc. */
export const SO_HANG_TOI_THIEU = 2;

/** Trần cứng cho số hàng. 500 hàng = 60 000px — đã gấp đôi giới hạn canvas của
 *  trình duyệt (~32 767px), nên KHÔNG lưu đồ thật nào chạm tới.
 *
 *  Có trần vì daiBuoc dựng một mảng DÀI ĐÚNG BẰNG số hàng. so_do là jsonb,
 *  không ràng buộc kiểu: soHang = 1e9 (vẫn là số nguyên hợp lệ với
 *  Number.isInteger) làm Array.from cấp phát một tỉ phần tử — ĐO ĐƯỢC: tiến
 *  trình chết vì hết bộ nhớ, không phải ném lỗi bắt được. Cùng cửa ấy còn mở
 *  từ phases[].h của bản cũ. Trình vẽ trắng màn hình vì một dòng dữ liệu hỏng
 *  là đúng thứ mọi chú thích trong tệp này đang tìm cách chặn.
 *
 *  KẸP về trần chứ không rơi hẳn về SO_HANG_TOI_THIEU: rơi về 2 là mọi khối
 *  bỗng nằm ngoài trang, kiemTraLuuDo báo NGOAI_TRANG hàng loạt và bản in rụng
 *  sạch bước. Kẹp thì giữ được nhiều nhất phần còn đọc được, và phần thật sự
 *  lọt ra ngoài vẫn được NGOAI_TRANG nói ra tử tế. */
export const SO_HANG_TOI_DA = 500;

/** Số hàng của lưu đồ — NGUỒN SỰ THẬT duy nhất về chiều cao trang.
 *
 *  Sơ đồ ĐÃ LƯU không có khoá `soHang` (mọi bản trước thay đổi này). Chúng suy
 *  ra từ tổng chiều cao giai đoạn cũ, làm tròn LÊN bội số CAO_HANG: sơ đồ soạn
 *  bằng bản có lưới thì tổng ấy vốn đã là bội số nên trang cao ĐÚNG BẰNG cũ,
 *  còn sơ đồ soạn từ trước khi có lưới (h lẻ) thì trang NỚI RA tới trọn hàng —
 *  nới thì không khối nào rơi ra ngoài, co lại mới làm mất bước trên bản in.
 *
 *  Rác trong so_do (jsonb, không ràng buộc kiểu: '3', 2.5, null, NaN, {}) rơi
 *  về đường suy ra, đúng luật doLech / neoHopLe / tiLeNhanHopLe đã dùng — ép
 *  kiểu hộ ở đây là lặng lẽ ghi một chiều cao trang người dùng không đặt.
 *
 *  LUÔN trả số nguyên trong [SO_HANG_TOI_THIEU, SO_HANG_TOI_DA]. Cả hai đường
 *  — khoá mới và giai đoạn cũ — đều đi qua cùng một phép kẹp, nên bịt một cửa
 *  mà quên cửa kia là chuyện không xảy ra được. */
export function soHangCua(soDo) {
  const v = soDo?.soHang;
  if (Number.isInteger(v) && v >= 1) return Math.min(v, SO_HANG_TOI_DA);
  const ps = Array.isArray(soDo?.phases) ? soDo.phases : [];
  const cao = ps.reduce((s, p) => s + soThat(p?.h), 0);
  // cao có thể tràn thành Infinity (phases[].h = 1e308 cộng dồn) — Math.min kẹp
  // trước, nên Math.ceil không bao giờ đẻ ra một độ dài mảng vô nghĩa.
  return Math.min(SO_HANG_TOI_DA, Math.max(SO_HANG_TOI_THIEU, Math.ceil(cao / CAO_HANG)));
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

// ── LÁCH KHỐI ────────────────────────────────────────────────────
// Lỗi người dùng chỉ tận tay trên ảnh chụp: một nhánh dọc bổ THẲNG QUA ba khối
// liền. Chỗ ấy KHÔNG chữa được bằng cách nhích chỗ bẻ, vì hai nhánh dọc của bản
// tự động đều DÍNH CỨNG vào tim khối đầu và tim khối cuối — dời x của chúng là
// đường mọc ra từ khoảng không cạnh khối.
//
// Cách chữa: khi bản tự động cắt qua khối, đổi sang lối VÒNG — ra CẠNH BÊN khối
// nguồn, chạy tới một LÀN TRỐNG, đi dọc trong làn đó, rồi đâm vào CẠNH BÊN khối
// đích. Vẫn 3 đoạn như bản cũ, vẫn đúng MỘT chỗ bẻ cho `lech` chỉnh, nên núm kéo
// tay không mất nghĩa. Không làn nào đỡ hơn thì GIỮ NGUYÊN bản cũ: đường xấu còn
// sửa được bằng tay, mất đường thì không.

/** Đoạn thẳng [p,q] có cắt VÀO TRONG hình chữ nhật r không?
 *  Chạm đúng mép KHÔNG tính — đường nối nào cũng chạm mép khối đầu và khối cuối,
 *  tính cả chạm mép thì đường nào cũng "xuyên khối" và mọi sơ đồ đều bị vẽ lại. */
function doanCatRect(p, q, r) {
  const x1 = Math.min(p[0], q[0]), x2 = Math.max(p[0], q[0]);
  const y1 = Math.min(p[1], q[1]), y2 = Math.max(p[1], q[1]);
  return x2 > r.x && x1 < r.x + r.w && y2 > r.y && y1 < r.y + r.h;
}

/** Đường gấp khúc `pts` cắt qua BAO NHIÊU khối (mỗi khối đếm một lần).
 *  boQua: id khối đầu/cuối của chính đường nối — đường phải chạm chúng.
 *
 *  Số hỏng trong so_do (jsonb, không ràng buộc kiểu) bị BỎ QUA hẳn: đem NaN đi so
 *  sánh thì mọi phép so đều false, khối rác lặng lẽ được coi là "không chắn" hoặc
 *  "chắn tất" tuỳ dấu — cả hai đều là quyết định bịa ra từ dữ liệu vô nghĩa. */
export function soKhoiCat(soDo, pts, boQua = []) {
  const ds = Array.isArray(soDo?.nodes) ? soDo.nodes : [];
  if (!Array.isArray(pts) || pts.length < 2) return 0;
  const doan = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1];
    if (![p?.[0], p?.[1], q?.[0], q?.[1]].every(Number.isFinite)) continue;
    doan.push([p, q]);
  }
  let dem = 0;
  for (const n of ds) {
    if (!n || typeof n !== 'object' || boQua.includes(n.id)) continue;
    const r = rectOf(n);
    if (![r.x, r.y, r.w, r.h].every(Number.isFinite)) continue;
    if (doan.some(([p, q]) => doanCatRect(p, q, r))) dem++;
  }
  return dem;
}

/** Các LÀN DỌC ứng viên: mép cột và tim cột — hai chỗ trống tự nhiên của lưới.
 *  Cột rộng 212, khối rộng 164 nên mép cột luôn hở 24px mỗi bên; tim cột là chỗ
 *  đẹp nhất khi cột ấy trống. Danh sách NGẮN và CỐ ĐỊNH: đây là chọn làn, không
 *  phải dò đường — dò đường nhiều khúc thì `lech` (một con số) hết nghĩa. */
export function lanDoc(soDo) {
  const n = Array.isArray(soDo?.lanes) ? soDo.lanes.length : 0;
  const ds = [];
  for (let i = 0; i <= n; i++) {
    ds.push(laneX(i));
    if (i < n) ds.push(laneX(i) + LANE_W / 2);
  }
  return ds;
}

/** Lối vòng qua làn dọc x: ra cạnh bên khối nguồn → chạy tới làn → đi dọc →
 *  đâm vào cạnh bên khối đích. Bốn điểm, ba đoạn — đúng bằng bản tự động. */
function duongVong(A, B, x) {
  return [
    [x > A.cx ? A.x + A.w : A.x, A.cy],
    [x, A.cy],
    [x, B.cy],
    [x > B.cx ? B.x + B.w : B.x, B.cy],
  ];
}

/** Làn dọc đi vòng ÍT CẮT KHỐI NHẤT, hoặc null nếu không làn nào đỡ hơn `chan`.
 *  Cách đều nhau thì lấy làn BÊN PHẢI: lưu đồ đọc trái→phải, vòng bên phải ít
 *  chồng lên dòng chảy chính hơn, và cột đầu tiên không phải bám mép trang. */
function lanTot(soDo, A, B, boQua, chan) {
  const moc = (A.cx + B.cx) / 2;
  let tot = null;
  for (const x of lanDoc(soDo)) {
    // Làn rơi vào GIỮA khối đầu hoặc khối cuối thì đoạn chạy ngang lại đâm ngược
    // vào chính khối vừa ra — vô nghĩa, loại thẳng.
    if ((x > A.x && x < A.x + A.w) || (x > B.x && x < B.x + B.w)) continue;
    const c = soKhoiCat(soDo, duongVong(A, B, x), boQua);
    if (c >= chan) continue;
    const d = Math.abs(x - moc);
    if (!tot || c < tot.c || (c === tot.c && (d < tot.d || (d === tot.d && x > tot.x)))) tot = { c, d, x };
  }
  return tot ? tot.x : null;
}

export const BAN_KINH_CAU = 5;   // bán kính nhịp cầu ở chỗ hai đường nối cắt nhau

/** Tìm chỗ hai đường nối CẮT NHAU thật (một dọc, một ngang).
 *  Trả [{ x, y }] để vẽ nhịp cầu.
 *
 *  CHỈ tính cắt vuông góc THẬT SỰ: đoạn dọc của đường này băng qua GIỮA đoạn
 *  ngang của đường KHÁC. Không tính:
 *    · đầu mút chạm nhau (chữ T) và neo dùng chung — hai đường cùng ra từ một
 *      khối thì gặp nhau ở gốc, vẽ cầu ở đó là bịa ra một chỗ cắt không có;
 *    · hai đoạn cùng phương chồng lên nhau — đó là trùng đường, không phải cắt,
 *      và bắc cầu cũng chẳng gỡ được;
 *    · góc bẻ của chính một đường.
 *  Nên mọi phép so đều dùng dấu NGẶT.
 *
 *  Thứ tự CỐ ĐỊNH theo (x, y), không theo thứ tự đường nối trong mảng: đảo thứ
 *  tự đường nối vẫn ra đúng một danh sách, nên ảnh xuất ra không đổi vô cớ.
 *  Đường trỏ tới khối đã xoá (routeEdge trả null) bị bỏ qua, không nổ. */
export function diemGiao(soDo) {
  const es = Array.isArray(soDo?.edges) ? soDo.edges : [];
  const doc = [], ngang = [];
  es.forEach((e, i) => {
    const r = e && typeof e === 'object' ? routeEdge(soDo, e) : null;
    if (!r) return;
    const pts = r.pts;
    for (let k = 0; k < pts.length - 1; k++) {
      const [x1, y1] = pts[k], [x2, y2] = pts[k + 1];
      if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
      if (x1 === x2 && y1 !== y2) doc.push({ i, x: x1, a: Math.min(y1, y2), b: Math.max(y1, y2) });
      else if (y1 === y2 && x1 !== x2) ngang.push({ i, y: y1, a: Math.min(x1, x2), b: Math.max(x1, x2) });
    }
  });
  const gom = new Map();
  for (const v of doc) {
    for (const h of ngang) {
      if (v.i === h.i) continue;                       // cùng một đường: góc bẻ, không phải cắt
      if (!(h.y > v.a && h.y < v.b)) continue;
      if (!(v.x > h.a && v.x < h.b)) continue;
      const khoa = `${Math.round(v.x * 100)}|${Math.round(h.y * 100)}`;
      if (!gom.has(khoa)) gom.set(khoa, { x: v.x, y: h.y });
    }
  }
  return [...gom.values()].sort((p, q) => (p.x - q.x) || (p.y - q.y));
}

// ── GHIM ĐIỂM NỐI VÀO CẠNH KHỐI (kiểu Visio) ─────────────────────
// Mỗi khối có BỐN điểm nối, ở giữa mỗi cạnh. Người dùng ghim được đầu RA của
// đường (e.raA) vào một cạnh khối nguồn, và đầu VÀO (e.vaoB) vào một cạnh khối
// đích. Không ghim ⇒ đường tự chọn cạnh y như trước, TỪNG BYTE: mọi sơ đồ đã
// lưu đều không có hai khoá này, và bản in của tài liệu ISO đã ban hành không
// được đổi vì một tính năng mới.
//
// GHIM LÀ TẮT PHÉP LÁCH KHỐI của riêng đường đó. Người dùng đã tự tay chọn lối
// ra lối vào; máy kéo đường sang làn khác cho đỡ xấu là quyết thay họ, mà cái
// giá là đường mọc ra từ một cạnh họ không chọn. Đường xấu thì còn kéo lại
// được, đường bỏ ghim thì không.

/** Bốn cạnh khối, thứ tự theo chiều kim đồng hồ từ trên. */
export const CANH_NEO = ['tren', 'phai', 'duoi', 'trai'];

/** Cạnh ghim đã LỌC RÁC — trả cạnh hợp lệ, hoặc null nghĩa là để tự động.
 *  so_do là jsonb, không ràng buộc kiểu: 42, null, 'xyz', {} đều lọt xuống được.
 *  Khoá hỏng phải rơi về đường TỰ ĐỘNG chứ không được làm mất đường nối trên
 *  bản in — mất một mũi tên trong lưu đồ ISO là mất một bước của quy trình. */
export const neoHopLe = v => (CANH_NEO.includes(v) ? v : null);

/** ĐOẠN MỒI: đường phải rời cạnh khối theo đúng pháp tuyến cạnh đó một quãng
 *  rồi mới được bẻ. Không có mồi thì đường chạy DỌC THEO mặt khối, nhìn như thể
 *  nó dính vào cạnh bên cạnh — đúng thứ khiến người ta tưởng ghim hỏng.
 *  24 = khe hở giữa mép khối (rộng 164) và mép cột (rộng 212), nên mồi NGANG
 *  đậu đúng vào vạch cột — làn trống sẵn của lưới, chỗ lanDoc vẫn dùng; và
 *  24 < 32 = nửa khe hở đứng của một hàng (120 − 56), nên mồi DỌC chưa lấn sang
 *  hàng bên. Cũng lớn hơn bán kính bo góc 9 nên góc bo không nuốt mất đoạn mồi. */
export const DAI_MOI = 24;

/** Điểm neo giữa cạnh `canh` của hình chữ nhật r, kèm PHÁP TUYẾN hướng ra ngoài.
 *  Giao diện gọi hàm này để đặt chấm ghim — nhờ vậy không tự tính toạ độ nào. */
export function diemNeo(r, canh) {
  switch (canh) {
    case 'tren': return { p: [r.cx, r.y], n: [0, -1] };
    case 'duoi': return { p: [r.cx, r.y + r.h], n: [0, 1] };
    case 'trai': return { p: [r.x, r.cy], n: [-1, 0] };
    default:     return { p: [r.x + r.w, r.cy], n: [1, 0] };
  }
}

/** Cạnh của khối r QUAY VỀ phía điểm p — mặt mà tia từ tâm r tới p xuyên qua.
 *  Dùng để giải đầu CÒN TỰ ĐỘNG khi người dùng chỉ ghim một đầu: đầu tự động
 *  phải nhìn vào chỗ đầu kia ĐANG ĐỨNG, không phải vào tâm khối kia — ghim đầu
 *  ra vào cạnh trái mà đầu vào vẫn nhắm tâm là đường quặt ngược qua khối.
 *
 *  So theo TỈ LỆ với nửa bề khối chứ không so |dx| với |dy|: khối rộng 164 cao
 *  56, lệch ngang 100 lệch dọc 60 thì tia vẫn ra ở mặt TRÊN. Nhân chéo thay vì
 *  chia để khối rộng/cao 0 (dữ liệu hỏng) không đẻ ra Infinity. */
export function canhHuong(r, p) {
  const dx = soThat(p?.[0]) - soThat(r?.cx), dy = soThat(p?.[1]) - soThat(r?.cy);
  const ngang = Math.abs(dx) * Math.max(1, Math.abs(soThat(r?.h)));
  const doc = Math.abs(dy) * Math.max(1, Math.abs(soThat(r?.w)));
  if (ngang > doc) return dx < 0 ? 'trai' : 'phai';
  return dy < 0 ? 'tren' : 'duoi';
}

/** Điểm p đậu trên cạnh nào của khối r — đọc NGƯỢC ra từ đường đã vẽ, để giao
 *  diện tô sáng đúng chấm đang có hiệu lực kể cả khi đường còn tự động.
 *  Xét trên/dưới trước: lưu đồ chảy từ trên xuống, góc khối tính về cạnh ngang. */
function neoTaiDiem(r, p) {
  const [x, y] = p;
  const trongX = x >= r.x && x <= r.x + r.w, trongY = y >= r.y && y <= r.y + r.h;
  if (trongX && y === r.y) return 'tren';
  if (trongX && y === r.y + r.h) return 'duoi';
  if (trongY && x === r.x) return 'trai';
  if (trongY && x === r.x + r.w) return 'phai';
  return null;
}

/** Bỏ điểm trùng và gộp đoạn cùng phương. Đường còn lại không có đoạn dài 0 nào
 *  — khâu bo góc chia cho độ dài đoạn, gặp 0 là ra góc bo vô nghĩa; và lối chữ L
 *  chỉ hiện ra được sau khi gộp.
 *  Quét trùng LẦN NỮA sau khi gộp: hai khối chồng khít lên nhau thì đầu và cuối
 *  rơi vào cùng một điểm, gộp xong mới lòi ra. Không bao giờ trả dưới hai điểm —
 *  routeEdge dựng nhãn từ pts[0] và pts[1]. */
function gonDuong(pts) {
  const ra = pts.map(p => [p[0], p[1]]);
  const boTrung = () => {
    for (let i = ra.length - 1; i > 0; i--) {
      if (ra[i][0] === ra[i - 1][0] && ra[i][1] === ra[i - 1][1]) ra.splice(i, 1);
    }
  };
  boTrung();
  for (let i = ra.length - 2; i > 0; i--) {
    const [x0, y0] = ra[i - 1], [x1, y1] = ra[i], [x2, y2] = ra[i + 1];
    if ((x0 === x1 && x1 === x2) || (y0 === y1 && y1 === y2)) ra.splice(i, 1);
  }
  boTrung();
  if (ra.length < 2) return [pts[0].slice(), pts[pts.length - 1].slice()];
  return ra;
}

/** Núm kéo tay cho LẰN (doc ? x : y) = gt: đoạn ĐẦU TIÊN của đường nằm đúng trên
 *  lằn đó. Đọc từ đường ĐÃ GỘP nên tu/den luôn là đỉnh thật của nét vẽ.
 *  Đường chỉ còn một đoạn thì trả null: kéo cái đoạn duy nhất ấy là kéo tuột cả
 *  hai đầu ra khỏi cạnh đã ghim. */
function lanKeo(pts, doc, gt) {
  if (pts.length < 3) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1];
    const tren = doc ? (p[0] === gt && q[0] === gt) : (p[1] === gt && q[1] === gt);
    if (!tren || (p[0] === q[0] && p[1] === q[1])) continue;
    return {
      huong: doc ? 'doc' : 'ngang',
      x: (p[0] + q[0]) / 2, y: (p[1] + q[1]) / 2,
      tu: [p[0], p[1]], den: [q[0], q[1]],
    };
  }
  return null;
}

/** Lằn nối hai đoạn mồi CÙNG TRỤC, kèm khoảng cho phép khi kéo tay.
 *  Mỗi đầu mồi áp một chặn: mồi hướng dương chặn dưới, hướng âm chặn trên.
 *   · hai mồi cùng chiều → lằn ra tận đầu mồi XA NHẤT rồi thả tự do về phía đó
 *     (kẹp ở mép trang); đẩy ngược lại là cắt qua chính khối vừa ra;
 *   · hai mồi ngược chiều → lằn ở GIỮA hai đầu mồi. Nếu hai đầu quay LƯNG vào
 *     nhau thì không lối hai lần bẻ nào đi được, lằn giữa chia đôi phần phải
 *     quặt ngược — xấu đều hai bên còn hơn dồn hết vào một bên. */
function lanGiua(a, b, na, nb, min, max) {
  if (na > 0 && nb > 0) { const m = Math.max(a, b); return { tuDong: m, lo: m, hi: Math.max(max, m) }; }
  if (na < 0 && nb < 0) { const m = Math.min(a, b); return { tuDong: m, lo: Math.min(min, m), hi: m }; }
  return { tuDong: (a + b) / 2, lo: Math.min(a, b), hi: Math.max(a, b) };
}

/** Lằn cho lối CHỮ L (hai đầu khác trục): chỉ bị chặn bởi đoạn mồi khối nguồn,
 *  vì đoạn mồi khối đích luôn là đoạn cuối, không đụng tới lằn. */
function lanMoi(a, na, tuDong, min, max) {
  return na > 0
    ? { tuDong, lo: a, hi: Math.max(max, a) }
    : { tuDong, lo: Math.min(min, a), hi: a };
}

/** Đường nối khi ĐÃ GHIM ít nhất một đầu vào một cạnh khối.
 *  Trả { pts, keo, neo } — neo là hai cạnh THẬT SỰ dùng, kể cả cạnh vừa giải
 *  hộ cho đầu còn tự động.
 *
 *  Hình dạng: mồi ra → nhiều nhất hai chỗ bẻ → mồi vào. Hai đầu cùng trục thì
 *  đi hình chữ Z qua một lằn; khác trục thì đi chữ L, và chính chữ L là trường
 *  hợp lằn rơi đúng vào đầu kia — nên kéo lằn ra là chữ L mọc thêm chỗ bẻ,
 *  không nhảy sang một hình khác. */
function duongGhim(soDo, A, B, raA, vaoB, lech) {
  // Đầu còn tự động giải theo chỗ ĐẦU KIA ĐANG ĐỨNG, không theo tâm khối.
  const ca = raA || canhHuong(A, diemNeo(B, vaoB).p);
  const cb = vaoB || canhHuong(B, diemNeo(A, ca).p);
  const { p: pA, n: nA } = diemNeo(A, ca);
  const { p: pB, n: nB } = diemNeo(B, cb);
  const sA = [pA[0] + nA[0] * DAI_MOI, pA[1] + nA[1] * DAI_MOI];
  const sB = [pB[0] + nB[0] * DAI_MOI, pB[1] + nB[1] * DAI_MOI];
  const W = soThat(Array.isArray(soDo?.lanes) ? drawW(soDo) : 0);
  const H = soThat(drawH(soDo));     // drawH tự lo dữ liệu hỏng, không cần chặn ngoài
  const docA = nA[0] === 0, docB = nB[0] === 0;

  let tho, doc, coLan, t;
  if (docA && docB) {                    // hai đầu cùng trục DỌC → lằn NGANG
    t = lanGiua(sA[1], sB[1], nA[1], nB[1], 0, H);
    doc = false; coLan = pA[0] !== pB[0];
    tho = gt => [pA, [pA[0], gt], [pB[0], gt], pB];
  } else if (!docA && !docB) {           // hai đầu cùng trục NGANG → lằn DỌC
    t = lanGiua(sA[0], sB[0], nA[0], nB[0], 0, W);
    doc = true; coLan = pA[1] !== pB[1];
    tho = gt => [pA, [gt, pA[1]], [gt, pB[1]], pB];
  } else if (docA) {                     // ra theo DỌC, vào theo NGANG
    // Chữ L chỉ dùng được khi nó không quặt ngược vào khối nguồn VÀ đâm vào
    // đúng MẶT NGOÀI khối đích; không thì đẩy lằn ra sau đoạn mồi và đi vòng.
    const L = (pB[1] - pA[1]) * nA[1] >= DAI_MOI && (pA[0] - pB[0]) * nB[0] >= DAI_MOI;
    t = lanMoi(sA[1], nA[1], L ? pB[1] : sA[1], 0, H);
    doc = false; coLan = pA[0] !== sB[0];
    tho = gt => [pA, [pA[0], gt], [sB[0], gt], [sB[0], pB[1]], pB];
  } else {                               // ra theo NGANG, vào theo DỌC
    const L = (pB[0] - pA[0]) * nA[0] >= DAI_MOI && (pA[1] - pB[1]) * nB[1] >= DAI_MOI;
    t = lanMoi(sA[0], nA[0], L ? pB[0] : sA[0], 0, W);
    doc = true; coLan = pA[1] !== sB[1];
    tho = gt => [pA, [gt, pA[1]], [gt, sB[1]], [pB[0], sB[1]], pB];
  }

  const gt = nhich(t.tuDong, lech, t.lo, t.hi);
  const pts = gonDuong(tho(gt));
  return { pts, keo: coLan ? lanKeo(pts, doc, gt) : null, neo: { raA: ca, vaoB: cb } };
}

// ── KÉO NHÃN DỌC THEO ĐƯỜNG (e.viTriNhan) ────────────────────────
// Nhãn OK/NG mặc định đậu giữa ĐOẠN DÀI NHẤT của đường. Trên lưu đồ thật, đoạn
// dài nhất thường là một quãng ngang chạy tít sang mép trái, nên chữ "OK" đứng
// lạc hẳn khỏi khối Quyết định đẻ ra nó — đo được trên ảnh người dùng gửi.
//
// Chỗ lưu là e.viTriNhan: TỈ LỆ 0…1 dọc TỔNG chiều dài đường, nằm ngay trong
// so_do (jsonb) — KHÔNG thêm cột, KHÔNG di trú dữ liệu. Đường chưa từng kéo
// nhãn thì không có khoá này và vẽ y như trước, TỪNG BYTE.
//
// Vì sao là TỈ LỆ DỌC ĐƯỜNG chứ không phải một khoảng dời {dx,dy} tự do: khối
// dời chỗ, đường đổi hình (lách khối, đổi cạnh ghim) là chuyện xảy ra tự động
// ở module này. Khoảng dời tự do thì lần đổi hình đầu tiên đã ném nhãn ra
// khoảng không; tỉ lệ thì nhãn luôn còn NẰM TRÊN nét vẽ.
//
// Đo trên đường gấp khúc THÔ (pts), không trên chuỗi d đã bo góc: góc bo 9px
// chỉ ăn bớt vài pixel ở mỗi đỉnh, mà tính độ dài cung Bézier thì đắt và không
// đổi được chỗ đặt chữ quá nửa ký tự.

/** Tỉ lệ đặt nhãn đã LỌC RÁC — số thật trong 0…1, hoặc null nghĩa là để tự động.
 *  so_do là jsonb, không ràng buộc kiểu: '0.5', NaN, null, {}, -1, 2 đều lọt
 *  xuống được. Tất cả rơi về TỰ ĐỘNG, đúng luật doLech và neoHopLe đã dùng —
 *  ép kiểu hộ chỉ giấu cái hỏng đi.
 *
 *  Số NGOÀI 0…1 cũng là rác chứ KHÔNG kẹp về 0/1: giao diện không bao giờ đẻ ra
 *  được giá trị ấy, nên gặp nó nghĩa là dữ liệu hỏng chứ không phải "người dùng
 *  kéo hơi quá tay". Kẹp về 0 hoặc 1 là dán chữ đè lên mũi tên hoặc lên mép
 *  khối — chỗ đọc không ra; rơi về giữa đoạn dài nhất thì ít nhất nó đứng đúng
 *  chỗ của một lưu đồ chưa từng đụng tới tính năng này. */
export const tiLeNhanHopLe = v => (Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);

/** Độ dài từng đoạn của đường gấp khúc, kèm tổng. Đoạn có toạ độ hỏng bị BỎ
 *  QUA hẳn (đúng luật soKhoiCat): đem NaN đi cộng là cả tổng thành NaN, và một
 *  khối rác lặng lẽ nuốt mất chỗ đặt nhãn của cả đường. */
function docDuong(pts) {
  const ds = [];
  let tong = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    if (![ax, ay, bx, by].every(Number.isFinite)) continue;
    const l = Math.hypot(bx - ax, by - ay);
    ds.push({ ax, ay, bx, by, l, truoc: tong });
    tong += l;
  }
  return { ds, tong };
}

/** Điểm ở tỉ lệ t dọc đường gấp khúc, hoặc null nếu không đo được.
 *  Đường thu về MỘT ĐIỂM (hai khối chồng khít — kiemTraLuuDo bắt là lỗi) thì
 *  trả chính điểm đó chứ không chia cho 0. */
function diemTaiTiLe(pts, t) {
  const { ds, tong } = docDuong(pts);
  if (!ds.length) return null;
  if (!(tong > 0)) return [ds[0].ax, ds[0].ay];
  let con = t * tong;
  for (let i = 0; i < ds.length; i++) {
    const d = ds[i];
    if (con <= d.l || i === ds.length - 1) {
      const u = d.l > 0 ? Math.min(1, Math.max(0, con / d.l)) : 0;
      return [d.ax + (d.bx - d.ax) * u, d.ay + (d.by - d.ay) * u];
    }
    con -= d.l;
  }
  return null;
}

/** Điểm thả (x, y) gần nhất trên đường nối → tỉ lệ 0…1 dọc đường.
 *  Trả null khi không đo được: đường trỏ tới khối đã xoá, toạ độ thả hỏng, hay
 *  đường không còn đoạn nào lành. Nơi gọi phải coi null là "không đổi gì" —
 *  ghi bừa một tỉ lệ đoán mò là dời nhãn của người dùng đi chỗ khác.
 *
 *  Chiếu vuông góc lên TỪNG đoạn rồi lấy đoạn GẦN NHẤT; hoà thì lấy đoạn ĐẦU
 *  TIÊN, để cùng một chỗ thả luôn cho cùng một kết quả bất kể thứ tự duyệt.
 *  Con trỏ thả ra ngoài đường (chuyện thường khi kéo nhanh) vẫn ra một tỉ lệ
 *  thật — bám về chỗ gần nhất TRÊN đường, đúng nghĩa "nhãn trượt dọc đường".
 *
 *  Xuất ra ngoài thay vì để giao diện tự tính từ `pts`: đổi một điểm thả thành
 *  tỉ lệ là phép chiếu + cộng dồn độ dài, tức là HÌNH HỌC — mà hình học của
 *  phân hệ này nằm trọn ở tệp đây, không ở JSX. */
export function tiLeTrenDuong(soDo, e, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  // Sơ đồ thiếu mảng nodes thì routeEdge NÉM (timKhoi đọc thẳng soDo.nodes).
  // Hàm này chạy trong tay kéo của giao diện — nổ giữa cử chỉ kéo là trắng cả
  // màn hình soạn thảo, nên chặn ở cửa vào chứ không đổi hành vi routeEdge.
  if (!Array.isArray(soDo?.nodes)) return null;
  const r = (e && typeof e === 'object') ? routeEdge(soDo, e) : null;
  if (!r) return null;
  const { ds, tong } = docDuong(r.pts);
  if (!ds.length) return null;
  if (!(tong > 0)) return 0;

  let tot = null;
  for (const d of ds) {
    const u = d.l > 0
      ? Math.min(1, Math.max(0,
        ((x - d.ax) * (d.bx - d.ax) + (y - d.ay) * (d.by - d.ay)) / (d.l * d.l)))
      : 0;
    const px = d.ax + (d.bx - d.ax) * u, py = d.ay + (d.by - d.ay) * u;
    const cach = Math.hypot(x - px, y - py);
    if (!tot || cach < tot.cach) tot = { cach, t: (d.truoc + d.l * u) / tong };
  }
  return tot ? Math.min(1, Math.max(0, tot.t)) : null;
}

/** Đường nối gấp khúc vuông góc, bo góc 9px — kiểu lưu đồ ISO.
 *  Trả { d, nhan:[x,y], keo, pts }, hoặc null nếu thiếu khối đầu/cuối.
 *  `pts` là đường gấp khúc THÔ (chưa bo góc) — diemGiao soi ở đấy.
 *
 *  `giao` (tuỳ chọn) là danh sách chỗ cắt do diemGiao trả về: truyền vào thì các
 *  đoạn NGANG được bẻ ra một nhịp cầu nửa cung tại mỗi chỗ cắt. Không truyền thì
 *  chuỗi d ra ĐÚNG TỪNG BYTE như trước — mọi sơ đồ đã lưu vẫn vẽ y hệt.
 *
 *  `keo` tả ĐOẠN KÉO TAY ĐƯỢC để giao diện đặt núm mà không phải tính lấy một
 *  toạ độ nào — null nghĩa là đường này thẳng tuột, không có chỗ bẻ để chỉnh:
 *    { huong:'ngang', x, y, tu:[x,y], den:[x,y] }  kéo LÊN/XUỐNG, đổi y
 *    { huong:'doc',   x, y, tu:[x,y], den:[x,y] }  kéo TRÁI/PHẢI, đổi x
 *  x,y là TRUNG ĐIỂM đoạn đó (chỗ đặt núm); tu/den là hai đầu.
 *
 *  e.lech là số dôi TƯƠNG ĐỐI so với chỗ bẻ tự động, không phải toạ độ tuyệt
 *  đối: lưu toạ độ thì kéo khối một cái là chỗ bẻ rơi lại đằng sau.
 *
 *  `nhan` mặc định là trung điểm ĐOẠN DÀI NHẤT; e.viTriNhan (tỉ lệ 0…1 dọc
 *  đường) đưa nó về đúng chỗ người dùng đã kéo — xem khối chú thích phía trên.
 *
 *  `neo` cho biết đường đang RA và VÀO ở cạnh nào của hai khối — cạnh người dùng
 *  ghim (e.raA / e.vaoB), hoặc cạnh chính đường tự động đã chọn. Giao diện tô
 *  sáng chấm đang có hiệu lực bằng ô này, không phải tự đo lấy. */
export function routeEdge(soDo, e, giao) {
  const A0 = timKhoi(soDo, e.a), B0 = timKhoi(soDo, e.b);
  if (!A0 || !B0) return null;
  const A = rectOf(A0), B = rectOf(B0);
  const dx = B.cx - A.cx, dy = B.cy - A.cy;
  const lech = doLech(e);
  const raA = neoHopLe(e?.raA), vaoB = neoHopLe(e?.vaoB);
  let pts, keo = null, neo = null;

  if (raA || vaoB) {                             // ĐÃ GHIM — bám cạnh, không lách
    ({ pts, keo, neo } = duongGhim(soDo, A, B, raA, vaoB, lech));
  } else if (Math.abs(dy) < 46) {                // cùng tầm cao → đi ngang
    const phai = dx > 0;
    pts = [[phai ? A.x + A.w : A.x, A.cy], [phai ? B.x : B.x + B.w, B.cy]];
  } else {
    const xuong = dy > 0, thang = Math.abs(dx) < 24;
    const giua0 = Math.max(A.y + A.h + 18, (A.y + A.h + B.y) / 2);
    // Bản TỰ ĐỘNG, CHƯA cộng lech — chỉ nó mới được quyền quyết định có lách hay
    // không. Xét trên bản đã nhích tay thì kéo núm một cái là đường nhảy đổi cả
    // hình dạng giữa chừng, người dùng không đoán nổi mình đang kéo cái gì.
    const tuDong = xuong
      ? (thang ? [[A.cx, A.y + A.h], [B.cx, B.y]]
        : [[A.cx, A.y + A.h], [A.cx, giua0], [B.cx, giua0], [B.cx, B.y]])
      : (thang ? [[A.cx, A.y], [B.cx, B.y + B.h]]
        : [[A.cx, A.y], [A.cx, B.cy], [dx > 0 ? B.x : B.x + B.w, B.cy]]);
    const chan = soKhoiCat(soDo, tuDong, [A0.id, B0.id]);
    const lan = chan ? lanTot(soDo, A, B, [A0.id, B0.id], chan) : null;

    if (lan !== null) {                          // lối VÒNG qua làn trống
      const W = Array.isArray(soDo?.lanes) ? drawW(soDo) : 0;
      const doc = nhich(lan, lech, Math.min(0, lan), Math.max(W, lan));
      pts = duongVong(A, B, doc);
      keo = { huong: 'doc', x: doc, y: (A.cy + B.cy) / 2, tu: [doc, A.cy], den: [doc, B.cy] };
    } else if (xuong) {                          // đi xuống
      if (thang) {
        pts = tuDong;
      } else {
        const giua = nhich(giua0, lech, A.y + A.h + KE_HO_BE, B.y - KE_HO_BE);
        pts = [[A.cx, A.y + A.h], [A.cx, giua], [B.cx, giua], [B.cx, B.y]];
        keo = { huong: 'ngang', x: (A.cx + B.cx) / 2, y: giua, tu: [A.cx, giua], den: [B.cx, giua] };
      }
    } else {                                     // vòng ngược lên
      if (thang) {
        pts = tuDong;
      } else {
        const phai = dx > 0;
        // Nhánh dọc leo ra từ cạnh TRÊN khối nguồn, nên kẹp trong bề ngang khối
        // đó: đẩy quá là đường mọc ra từ khoảng không cạnh khối.
        const doc = nhich(A.cx, lech, A.x + KE_HO_BE, A.x + A.w - KE_HO_BE);
        pts = [[doc, A.y], [doc, B.cy], [phai ? B.x : B.x + B.w, B.cy]];
        keo = { huong: 'doc', x: doc, y: (A.y + B.cy) / 2, tu: [doc, A.y], den: [doc, B.cy] };
      }
    }
  }

  // Nhịp cầu: chỗ đường NGANG cắt qua đường DỌC thì đường ngang nhảy một nửa
  // cung 5px. Luôn là đường NGANG nhảy, không bao giờ đường dọc — nhảy lung tung
  // mỗi chỗ một kiểu còn khó đọc hơn là không nhảy.
  //
  // Bẻ HẲN nét vẽ chứ không phủ một cung màu nền lên trên: nền chỗ ấy có thể là
  // trắng, là nền dải bước, hay nền cột — phủ màu trắng lên nền dải là để lại
  // một vệt trắng giữa dải xám.
  const cau = Array.isArray(giao)
    ? giao.filter(g => Number.isFinite(g?.x) && Number.isFinite(g?.y)) : [];
  const RC = BAN_KINH_CAU;
  /** Đi hết một đoạn đã cắt góc. Không nhịp cầu nào ⇒ trả ĐÚNG ` L…` như cũ. */
  const diDoan = (sx, sy, ex, ey) => {
    let out = '';
    if (cau.length && sy === ey && sx !== ex) {
      const huong = ex > sx ? 1 : -1;
      const lo = Math.min(sx, ex), hi = Math.max(sx, ex);
      const xs = [...new Set(cau.filter(g => g.y === sy && g.x - RC > lo && g.x + RC < hi)
        .map(g => g.x))].sort((a, b) => (a - b) * huong);
      let truoc = null;
      for (const x of xs) {
        // Hai chỗ cắt sát nhau quá thì chỉ bắc một cầu: hai cung chồng lên nhau
        // vẽ ra một nét ngoằn ngoèo, đọc còn tệ hơn để đường đi thẳng.
        if (truoc !== null && Math.abs(x - truoc) < 2 * RC) continue;
        out += ` L${x - RC * huong} ${sy} A${RC} ${RC} 0 0 ${huong > 0 ? 1 : 0} ${x + RC * huong} ${sy}`;
        truoc = x;
      }
    }
    return out + ` L${ex} ${ey}`;
  };

  let d = `M${pts[0][0]} ${pts[0][1]}`;
  const R = 9;
  let tx = pts[0][0], ty = pts[0][1];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(cx - px, cy - py) || 1, l2 = Math.hypot(nx - cx, ny - cy) || 1;
    const r = Math.min(R, l1 / 2, l2 / 2);
    d += diDoan(tx, ty, cx + (px - cx) / l1 * r, cy + (py - cy) / l1 * r);
    tx = cx + (nx - cx) / l2 * r; ty = cy + (ny - cy) / l2 * r;
    d += ` Q${cx} ${cy} ${tx} ${ty}`;
  }
  const cuoi = pts[pts.length - 1];
  d += diDoan(tx, ty, cuoi[0], cuoi[1]);

  // Nhãn đặt giữa đoạn dài nhất
  let best = 0, bl = -1;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (len > bl) { bl = len; best = i; }
  }
  let nhan = [(pts[best][0] + pts[best + 1][0]) / 2, (pts[best][1] + pts[best + 1][1]) / 2];

  // …trừ khi người dùng đã KÉO nhãn: lúc đó nó đậu ở đúng tỉ lệ ấy dọc đường.
  // Chỉ nhận khi ra được HAI SỐ THẬT — toạ độ khối hỏng (so_do là jsonb) làm
  // phép đo dài đường thành NaN, mà nhãn NaN là chữ biến mất khỏi bản in; rơi
  // lại về chỗ tự động thì tệ nhất cũng chỉ là nhãn đứng sai chỗ.
  const tiLe = tiLeNhanHopLe(e?.viTriNhan);
  if (tiLe !== null) {
    const p = diemTaiTiLe(pts, tiLe);
    if (p && p.every(Number.isFinite)) nhan = p;
  }

  return {
    d,
    nhan,
    keo,
    pts,
    neo: neo || { raA: neoTaiDiem(A, pts[0]), vaoB: neoTaiDiem(B, pts[pts.length - 1]) },
  };
}

const sao = (soDo) => {
  const s = {
    lanes:  soDo.lanes.map(l => ({ ...l })),
    nodes:  soDo.nodes.map(n => ({ ...n })),
    edges:  soDo.edges.map(e => ({ ...e })),
  };
  // Thứ tự bước đánh tay phải SỐNG SÓT qua mọi phép biến đổi: xoá một khối,
  // đổi cột, tự xếp lại… đều không phải là "thôi đánh số tay". Chép NGUYÊN VĂN,
  // kể cả id vừa bị xoá — chỗ lọc là thuTuBuoc, một nơi duy nhất.
  // Chỉ chép khi là MẢNG: khoá rác trong so_do (jsonb) không đáng mang theo,
  // và thuTuBuoc vốn đã coi nó như không có.
  if (Array.isArray(soDo.thuTu)) s.thuTu = soDo.thuTu.slice();
  // GIAI ĐOẠN CŨ: thôi quyết định bố cục, nhưng vẫn là chữ NGƯỜI DÙNG ĐÃ GÕ và
  // vẫn nằm trong bản lưu. Chép nguyên vẹn — xoá dữ liệu của họ như hệ quả phụ
  // của việc đổi cách vẽ là chuyện không được làm. Sơ đồ mới không có khoá này
  // và cũng không mọc thêm.
  if (Array.isArray(soDo.phases)) s.phases = soDo.phases.map(p => ({ ...p }));
  // Số hàng: chỉ mang theo khi HỢP LỆ, đúng ngưỡng soHangCua nhận. Giá trị rác
  // rơi về đường suy ra từ giai đoạn cũ, y như khi chưa từng có khoá này.
  if (Number.isInteger(soDo.soHang) && soDo.soHang >= 1) s.soHang = soDo.soHang;
  return s;
};

let dem = 0;
const idMoi = tien => `${tien}${Date.now().toString(36)}${(dem++).toString(36)}`;

// ── SỐ THỨ TỰ BƯỚC ───────────────────────────────────────────────
// Mặc định số bước SUY RA từ chỗ khối đứng trên trang. Nhưng lưu đồ thật có
// những bước không xếp nổi thành một cột đọc xuôi (hai nhánh song song, vòng
// làm lại), nên người dùng phải sửa được số bằng tay.
//
// Chỗ lưu là soDo.thuTu — một MẢNG ID nằm ngay trong so_do (jsonb), KHÔNG thêm
// cột, KHÔNG di trú dữ liệu. Sơ đồ chưa từng đánh tay thì không có khoá này và
// chạy y như trước, TỪNG BYTE.
//
// Danh sách chỉ là GỢI Ý THỨ TỰ, không phải nguồn sự thật về việc có bước nào:
// bước nào có là do soDo.nodes nói. Nhờ vậy nó tự lành: id đã xoá thì rụng, khối
// mới chưa có tên trong danh sách thì xuống cuối chứ không phá thứ tự đã chọn,
// và danh sách hỏng thì rơi hẳn về thứ tự vị trí.

/** TÂM DỌC của khối — mốc duy nhất để nói hai khối có "cùng hàng" hay không.
 *  Rác trong so_do (jsonb) tính như 0, đúng luật soThat: NaN đem đi so sánh làm
 *  mọi phép so thành false, và thứ tự bước lúc đó phụ thuộc thứ tự khối trong
 *  mảng — tức là phụ thuộc người dùng đã THÊM khối nào trước. */
const tamY = n => soThat(n?.y) + soThat(n?.h) / 2;

/** Thứ tự đánh số bước. Bỏ Bắt đầu/Kết thúc.
 *  · Chưa đánh tay ⇒ trên xuống dưới, trái sang phải — y như xưa.
 *  · Đã đánh tay (soDo.thuTu) ⇒ theo danh sách đó, phần chưa có tên xếp tiếp
 *    vào cuối theo VỊ TRÍ.
 *  Luôn trả một hoán vị ĐỦ và KHÔNG TRÙNG của các bước đang có, nên số bước
 *  luôn liền 1..n — bảng diễn giải và bản in ISO đánh số từ đây.
 *
 *  "Trên xuống dưới" đo bằng TÂM khối, không bằng MÉP TRÊN. Khối Quyết định cao
 *  86 và khối Thao tác cao 56 đặt cùng một hàng thì tâm trùng nhau nhưng mép
 *  trên lệch 15px — so mép trên là Quyết định luôn được số nhỏ hơn, kể cả khi nó
 *  đứng ở cột bên PHẢI. Bảng diễn giải in ngay dưới lưu đồ khi ấy đánh số ngược
 *  chiều với chính lưu đồ đó. Lưới hàng, hutHang, tuXepLai và daiBuoc đều đã căn
 *  theo tâm; đây là chỗ cuối cùng còn lệch luật. */
export function thuTuBuoc(soDo) {
  const viTri = soDo.nodes
    .filter(n => n.t !== 'start' && n.t !== 'end')
    .slice()
    .sort((a, b) => (tamY(a) - tamY(b)) || (nodeX(a) - nodeX(b)))
    .map(n => n.id);

  const tay = Array.isArray(soDo?.thuTu) ? soDo.thuTu : null;
  if (!tay || !tay.length) return viTri;

  // Còn lại = chưa được danh sách gọi tên. Gọi tên rồi thì rút khỏi đây, nên id
  // lặp lại chỉ tính lần đầu và id lạ (khối đã xoá, rác) bị bỏ qua hẳn.
  const conLai = new Set(viTri);
  const ra = [];
  for (const id of tay) {
    if (!conLai.has(id)) continue;
    conLai.delete(id);
    ra.push(id);
  }
  for (const id of viTri) if (conLai.has(id)) ra.push(id);
  return ra;
}

/** Chuyển bước `id` về vị trí thứ `viTri` (đếm từ 1). Các bước khác dồn theo.
 *  Trả sơ đồ MỚI.
 *
 *  DỜI CHỖ, không ĐỔI CHỖ: đưa bước 5 về 2 thì 2,3,4 lùi xuống thành 3,4,5 —
 *  không phải 5 và 2 hoán vị cho nhau. Hai cách này trùng nhau ở hai bước liền
 *  kề (đúng cảnh người dùng mô tả), nhưng với bước nhảy xa thì đổi chỗ làm hai
 *  con số nhảy loạn còn dời chỗ chỉ trượt đi một bậc — thứ đọc được trên bản in.
 *
 *  Trả CHÍNH sơ đồ cũ (không phải bản sao) khi không có gì đổi, để nơi gọi so
 *  tham chiếu là biết có nên đẩy một nấc hoàn tác hay không:
 *    · viTri không phải số nguyên (NaN, '2', 2.5, null, Infinity…) — ép kiểu hộ
 *      ở đây là lặng lẽ ghi một thứ tự người dùng không gõ;
 *    · id không có, hoặc là khối Bắt đầu/Kết thúc — chúng không mang số bước;
 *    · bước đã đứng đúng chỗ đó rồi.
 *  viTri ngoài khoảng 1..n thì KẸP về đầu/cuối: người dùng gõ 99 nghĩa là "cho
 *  xuống cuối", từ chối thẳng chỉ làm họ phải đoán con số cuối cùng là mấy.
 *
 *  Ghi ĐỦ danh sách (mọi bước đang có, theo thứ tự sau khi dời) chứ không ghi
 *  mỗi cái vừa dời: danh sách lửng là chỗ nấp của lỗi thứ tự — phần không được
 *  gọi tên sẽ trôi theo vị trí mỗi lần ai đó kéo một khối. */
export function datThuTu(soDo, id, viTri) {
  if (!Number.isInteger(viTri)) return soDo;
  const ds = thuTuBuoc(soDo);
  const tu = ds.indexOf(id);
  if (tu < 0) return soDo;
  const den = Math.min(Math.max(viTri, 1), ds.length) - 1;
  if (den === tu) return soDo;
  const moi = ds.slice();
  moi.splice(tu, 1);
  moi.splice(den, 0, id);
  return { ...soDo, thuTu: moi };
}

/** Bỏ thứ tự đánh tay — số bước quay về suy từ VỊ TRÍ. Trả sơ đồ MỚI.
 *  XOÁ HẲN khoá chứ không đặt về mảng rỗng: bản lưu quay lại đúng hình dạng của
 *  một sơ đồ chưa từng đánh số tay, không đọng lại khoá thừa nào. */
export function boThuTu(soDo) {
  const s = { ...soDo };
  delete s.thuTu;
  return s;
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

  // Mọc thêm hàng nếu lưu đồ dài ra. CHỈ NỚI, không co lại: chỗ trống người dùng
  // cố ý chừa ra ở đáy trang không được biến mất chỉ vì họ thêm một bước ở trên.
  const can = Math.max(...s.nodes.map(n => hangCua(n))) + 1;
  s.soHang = Math.max(soHangCua(s), can);
  return s;
}

/** Thêm một hàng vào cuối lưu đồ. Trả sơ đồ MỚI.
 *  Hàng mới là "Bước N+1" — không có tên để đặt, không có chiều cao để chỉnh:
 *  mọi hàng cao đúng CAO_HANG. Nhờ vậy giao diện chỉ việc gọi, không tự tính. */
export function themHang(soDo) {
  const s = sao(soDo);
  s.soHang = soHangCua(soDo) + 1;
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

/** Chuyển cột từ vị trí `tu` sang vị trí `den`. Các cột khác dồn theo.
 *  Ánh xạ lại `lane` của MỌI khối. Trả sơ đồ MỚI.
 *
 *  DỜI CHỖ, không ĐỔI CHỖ — đúng luật datThuTu đã dùng cho số bước: đưa cột 4 về
 *  vị trí 1 thì 1,2,3 trượt sang phải một bậc, không phải cột 4 và cột 1 hoán vị
 *  cho nhau. Người dùng kéo một cột đi là muốn ĐẶT nó vào chỗ đó, không phải
 *  quăng cột đang ở đó về chỗ mình vừa rời.
 *
 *  ĐIỀU DUY NHẤT KHÔNG ĐƯỢC SAI: khối phải giữ đúng BỘ PHẬN, không phải giữ đúng
 *  chỉ số. lane là CHỈ SỐ vào lanes, mà bộ phận ấy in ra cột "Người thực hiện"
 *  của bảng diễn giải trong tài liệu ISO — đổi chỗ cột mà quên dời chỉ số là mọi
 *  bước lặng lẽ sang tên bộ phận khác, không một dòng lỗi nào báo ra. Cùng cái
 *  bẫy xoaCot đã phải gỡ, chỉ khác là ở đây chỉ số dời theo cả hai chiều.
 *
 *  Ánh xạ dựng bằng CHÍNH phép splice vừa làm trên danh sách chỉ số, không viết
 *  lại công thức dời bằng tay: hai bên lệch nhau một bậc là hỏng đúng cái đang
 *  phải giữ, mà lệch một bậc thì nhìn bản in không ra ngay.
 *
 *  Tra bảng ánh xạ bằng phép ĐÁNH CHỈ SỐ MẢNG — đúng lối `soDo.lanes[n.lane]` mà
 *  bảng diễn giải đang đọc, nên rác trong so_do (jsonb) được đối xử y hệt hai
 *  nơi: '2' vẫn tra ra cột 2 nên phải dời theo, còn 99 / null / NaN vốn đã không
 *  tra ra cột nào thì để nguyên — gán bừa một chỉ số cho chúng là BỊA ra một bộ
 *  phận phụ trách mà dữ liệu chưa từng nói.
 *
 *  Trả CHÍNH sơ đồ cũ (không phải bản sao) khi không có gì đổi, để nơi gọi so
 *  tham chiếu là biết có nên đẩy một nấc hoàn tác hay không — đúng luật datThuTu:
 *    · tu hoặc den không phải số nguyên (NaN, '2', 2.5, null, Infinity…);
 *    · tu hoặc den ngoài 0…số cột−1 — KHÔNG kẹp về đầu/cuối như datThuTu: ở đây
 *      con số không do người dùng gõ mà do cử chỉ kéo sinh ra, nên số ngoài
 *      phạm vi nghĩa là phép đo hỏng, chứ không phải một ý định "cho ra rìa";
 *    · tu === den — cột đã đứng đúng chỗ đó rồi.
 *  dx đi theo khối NGUYÊN VẸN: nó là phần kéo tay TRONG lòng cột, cả cột dời chỗ
 *  thì phần lệch ấy vẫn còn nguyên nghĩa (khác doiCot — đổi cột của MỘT khối thì
 *  dx phải về 0 để khối căn giữa cột mới). */
export function chuyenCot(soDo, tu, den) {
  const lanes = Array.isArray(soDo?.lanes) ? soDo.lanes : null;
  if (!lanes) return soDo;
  if (!Number.isInteger(tu) || !Number.isInteger(den)) return soDo;
  if (tu < 0 || tu >= lanes.length || den < 0 || den >= lanes.length) return soDo;
  if (tu === den) return soDo;

  const s = sao(soDo);
  s.lanes.splice(den, 0, s.lanes.splice(tu, 1)[0]);

  // moiChiSo[chỉ số CŨ] = chỉ số MỚI, dựng bằng đúng phép splice ở trên.
  const thuTuCu = lanes.map((_, i) => i);
  thuTuCu.splice(den, 0, thuTuCu.splice(tu, 1)[0]);
  const moiChiSo = [];
  thuTuCu.forEach((cu, i) => { moiChiSo[cu] = i; });

  for (const n of s.nodes) {
    const v = moiChiSo[n.lane];
    if (v !== undefined) n.lane = v;
  }
  return s;
}

/** Cột mà hoành độ `x` (toạ độ TRÊN GIẤY, gốc ở mép trái cột đầu tiên) rơi vào.
 *  Kẹp trong 0…số cột−1 nên con trỏ kéo ra ngoài mép trang vẫn cho một cột thật.
 *
 *  Xuất ra ngoài thay vì để giao diện tự chia lấy: đổi một điểm trên màn hình
 *  thành chỉ số cột là HÌNH HỌC, mà hình học của phân hệ này nằm trọn ở tệp đây.
 *  Rác tính như 0 theo đúng luật soThat — NaN đem đi kẹp vẫn ra NaN, và một chỉ
 *  số NaN thả vào chuyenCot thì lặng lẽ không làm gì, người dùng kéo mà không
 *  hiểu vì sao cột đứng yên. */
export function cotTaiX(soDo, x) {
  const n = Array.isArray(soDo?.lanes) ? soDo.lanes.length : 0;
  if (n <= 0) return 0;
  return Math.max(0, Math.min(n - 1, Math.floor(soThat(x) / LANE_W)));
}

/** Hàng mà khối đang đứng, đã kẹp về 0 — dùng chung cho daiBuoc và xoaHang nên
 *  "hàng nào có khối" là MỘT câu trả lời duy nhất. Khối bị kéo lên trên mép
 *  trang (hàng âm) tính vào hàng 0: không có hàng nào ở trên đó để nó thuộc về,
 *  mà bỏ hẳn thì nó vô hình với cả hai nơi. */
const hangKep = n => Math.max(0, hangCua(n));

/** Xoá một hàng. Trả sơ đồ MỚI. Ném lỗi nếu hàng còn khối. */
export function xoaHang(soDo, i) {
  const so = soHangCua(soDo);
  if (!Number.isInteger(i) || i < 0 || i >= so) {
    throw new Error(`Không có hàng số ${Number(i) + 1} để xoá — lưu đồ đang có ${so} hàng.`);
  }
  if (so <= 1) {
    throw new Error('Lưu đồ phải còn ít nhất một hàng — không xoá được hàng cuối cùng.');
  }
  const nodes = soDo.nodes || [];
  const dung = nodes.filter(n => hangKep(n) === i);
  if (dung.length) {
    throw new Error(
      `Hàng “Bước ${i + 1}” còn ${dung.length} khối. Hãy kéo các khối này sang hàng khác `
      + 'rồi mới xoá hàng.');
  }

  // Khối KHÔNG mang chỉ số hàng — nó nằm ở đâu là do y tuyệt đối. Bỏ một hàng mà
  // không kéo phần dưới lên đúng một hàng thì trang ngắn đi còn khối đứng yên:
  // khối cuối lọt ra ngoài đáy trang và rụng khỏi bản in.
  const s = sao(soDo);
  s.soHang = so - 1;
  for (let k = 0; k < nodes.length; k++) {
    if (hangKep(nodes[k]) > i) s.nodes[k].y -= CAO_HANG;
  }
  return s;
}

/** Kẹp một khối vào TRONG trang vẽ: cả hình chữ nhật phải nằm gọn trong
 *  0…drawW × 0…drawH. Trả { dx, y } đã kẹp — KHÔNG sửa sơ đồ, không sửa khối.
 *
 *  Vì sao phải có: ảnh xuất ra (PNG dán xưởng, ảnh nhúng .docx, bản in A3) lấy
 *  viewBox đúng bằng drawW × drawH. Khối kéo ra ngoài khung ấy VẪN hiện trên
 *  màn hình soạn thảo và VẪN có một dòng trong bảng diễn giải, nhưng RỤNG khỏi
 *  mọi bản in — người dùng thấy đủ bước rồi in ra tài liệu ISO thiếu bước.
 *
 *  Kẹp CẢ HAI TRỤC trong một lần gọi: kẹp mỗi trục một chỗ là chỗ còn lại sẽ bị
 *  quên, đúng lối cũ (chỉ chặn y >= 4, còn dx thì thả nổi khi thả lại vào chính
 *  cột đang đứng).
 *
 *  Trang HẸP hoặc THẤP hơn chính khối thì kẹp về góc trên-trái chứ không trả
 *  toạ độ âm: khối lúc ấy vẫn lòi ra thật, nhưng đó là lỗi kiemTraLuuDo phải nói
 *  ra (NGOAI_TRANG), không phải chỗ này lặng lẽ đẩy khối ra ngoài mép kia.
 *
 *  Rác trong so_do (jsonb) tính như 0 — thả NaN vào dx/y là khối biến mất khỏi
 *  bản vẽ, hỏng nặng hơn hẳn lệch chỗ. */
export function kepTrongTrang(soDo, n, dx, y) {
  const W = Array.isArray(soDo?.lanes) ? soThat(drawW(soDo)) : 0;
  const H = soThat(drawH(soDo));       // drawH tự lo dữ liệu hỏng, không cần chặn ngoài
  const w = soThat(n?.w), h = soThat(n?.h);
  const dxVao = soThat(dx);
  // Đi qua rectOf để không chép lại công thức nodeX ở đây — một nguồn sự thật.
  const x = soThat(rectOf({ ...n, dx: dxVao }).x);
  const kep = (v, hi) => Math.max(0, Math.min(v, hi));
  return { dx: dxVao + (kep(x, W - w) - x), y: kep(soThat(y), H - h) };
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
 *  MỘT DẢI = MỘT BƯỚC = một nhãn "Bước N" ở cột trái. Chỉ số trong mảng CHÍNH
 *  là số bước trừ một, nên trình vẽ và bản xuất SVG không nơi nào phải tự đếm
 *  hàng lấy — hai nơi đếm lệch nhau là bản in khác màn hình.
 *
 *  Phủ TRỌN chiều cao trang: số dải đủ để chứa cả drawH lẫn hàng thấp nhất còn
 *  khối (sơ đồ lưu từ trước có thể có khối tụt quá đáy trang — kiemTraLuuDo bắt
 *  là lỗi NGOAI_TRANG, nhưng dải vẫn phải vẽ cho người ta THẤY nó ở đâu).
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
    khoi.push({ id: n.id, x: soThat(nodeX(n)), hang: hangKep(n) });
  }

  let soHang = soHangCua(soDo);
  for (const k of khoi) soHang = Math.max(soHang, k.hang + 1);

  const dai = Array.from({ length: soHang }, (_, r) => ({
    tam: tamHang(r), y1: r * CAO_HANG, y2: (r + 1) * CAO_HANG, ids: [],
  }));
  // Thứ tự khối trong mảng là thứ tự người dùng THÊM, không liên quan gì tới chỗ
  // chúng đứng trên trang — ids phải xếp lại theo x để đọc trái → phải.
  for (const k of khoi.slice().sort((a, b) => a.x - b.x)) dai[k.hang].ids.push(k.id);
  return dai;
}

/** Căn giữa khối theo cột và ĐƯA CẢ SƠ ĐỒ VỀ ĐÚNG LƯỚI HÀNG.
 *  Mỗi tầng khối chiếm trọn một hàng, khối rơi vào tâm ô.
 *
 *  Đây cũng là nút "chỉnh lại cho thẳng lưới" của những sơ đồ lưu từ trước khi
 *  có lưới: chúng vẫn mở, vẫn vẽ, vẫn in được, chỉ là chưa thẳng hàng cho tới
 *  khi bấm nút này một lần.
 *
 *  CỐ Ý không đảo thứ tự: người dùng phải đoán được kết quả trước khi bấm. Thứ
 *  tự tầng và cách gom tầng giữ y như cũ — chỉ đổi chỗ ĐẶT tầng, không đổi tầng
 *  nào gồm những khối nào.
 *
 *  Số hàng CHỈ NỚI, không co lại: chỗ trống người dùng cố ý chừa ra ở đáy trang
 *  không được biến mất chỉ vì họ bấm căn thẳng hàng. */
export function tuXepLai(soDo) {
  const s = sao(soDo);
  const HO = 44;
  const g = s.nodes.slice().sort((a, b) => (a.y - b.y) || (nodeX(a) - nodeX(b)));

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
    for (const n of t.items) { n.dx = 0; n.y = yTaiHang(k, n.h); }
  });

  s.soHang = Math.max(tang.length, soHangCua(soDo));
  return s;
}
