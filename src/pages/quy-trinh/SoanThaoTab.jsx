import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MousePointer2, Spline, Columns3, Rows3, Wand2, Undo2, Redo2, Trash2,
  Minus, Plus, Save, Send, BadgeCheck, RotateCcw, Loader2, GitBranch, CopyPlus,
} from 'lucide-react';
import {
  GUT, LANE_W, HEAD_H, LOAI_KHOI, MAU_DUONG, MAU_DAI, NGUONG_HUT,
  laneX, nodeX, rectOf, drawW, drawH, timKhoi, routeEdge, thuTuBuoc,
  themBuoc, xoaKhoi, doiCot, tuXepLai, xoaCot, xoaHang, themHang, soHangCua, hutHang, daiBuoc,
  diemGiao, CANH_NEO, diemNeo, neoHopLe, datThuTu, boThuTu, kepTrongTrang,
  tiLeTrenDuong, tiLeNhanHopLe, chuyenCot, cotTaiX,
} from '../../lib/quyTrinhSoDo';
import { kiemTraLuuDo } from '../../lib/quyTrinhKiemTra';
import { dongDienGiai } from '../../lib/quyTrinhDienGiai';
import * as api from '../../lib/quyTrinhApi';

/* ═══════════════════════════════════════════════════════════════
   TRÌNH VẼ LƯU ĐỒ — màn hình chính của phân hệ Quy trình.

   Cách vẽ CỐ Ý không phải kéo-thả tự do: chọn một khối rồi bấm nút ＋
   của nó, bước mới tự đặt chỗ và tự nối. Kéo-thả tự do sinh ra lưu đồ
   xiêu vẹo và khối mồ côi — thứ làm trượt đánh giá ISO.

   Bố cục/màu chuyển từ docs/mockups/quy-trinh-mockup.html (#v-editor).
   TOÀN BỘ hình học nằm ở src/lib/quyTrinhSoDo.js — tệp này chỉ vẽ và
   bắt sự kiện. Thấy mình đang tính toạ độ nghĩa là đang chép lại thứ
   đã có (và đã có 37 test), hãy đi tìm nó.
   Tệp này KHÔNG chạm Supabase trực tiếp — mọi truy vấn qua quyTrinhApi.
   ═══════════════════════════════════════════════════════════════ */

// Bảng màu lấy từ :root chế độ sáng của mockup. GIẤY luôn trắng.
const C = {
  nen: '#f6f8fb', mat: '#ffffff', mat2: '#f1f5f9', mat3: '#e9eef5',
  vien: '#e2e8f0', vien2: '#cbd5e1',
  chu: '#0f172a', chu2: '#475569', chu3: '#748094',
  giay: '#ffffff', giayVien: '#dfe6ef', giayBang: '#f7f9fc',
  do: '#dc2626', xanh: '#16a34a', lam: '#2563eb', xam: '#64748b',
};
const MONO = "'Cascadia Mono',Consolas,'SF Mono',ui-monospace,monospace";

const TT = {
  draft:     { ten: 'Bản nháp',     mau: '#64748b' },
  wait:      { ten: 'Chờ duyệt',    mau: '#2563eb' },
  published: { ten: 'Đã ban hành',  mau: '#16a34a' },
  expired:   { ten: 'Hết hiệu lực', mau: '#dc2626' },
};

// Loại khối được chọn ở bảng ＋ (đúng thứ tự mockup). 'start' không có mặt:
// một lưu đồ chỉ có một khối Bắt đầu, và nó không bao giờ là bước NỐI TIẾP.
const LOAI_POP = ['step', 'check', 'dec', 'doc', 'end'];
const PAL = ['#2563eb', '#0891b2', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#475569'];
const BUOC_LUOI = 8;   // kéo khối bám lưới 8px cho thẳng hàng mắt thường

// Khung bắt chuột quanh NHÃN đường nối (chỗ kéo nhãn trượt dọc đường).
// CỐ Ý to hơn hẳn núm chỗ bẻ (đường kính 19): chỗ đặt nhãn tự động — giữa đoạn
// dài nhất — trùng đúng vào núm chỗ bẻ ở lối "xuống lệch cột" và lối lách khối.
// Núm vẽ SAU nên nó nằm trên và giữ nguyên vùng bấm cũ; khung nhãn rộng 44 thì
// hai đầu vẫn thò ra mỗi bên 12px để mà bắt. Kéo một cái là nhãn rời chỗ ấy hẳn.
const NHAN_W = 44, NHAN_H = 24;

// Tên bốn cạnh khối bằng tiếng Việt — chỉ là CHỮ, để hiện lên mách nước và bảng
// bên phải. Hình học của bốn điểm nối nằm ở diemNeo bên quyTrinhSoDo.
const TEN_CANH = { tren: 'cạnh trên', phai: 'cạnh phải', duoi: 'cạnh dưới', trai: 'cạnh trái' };

// ── Biến đổi thuần, KHÔNG hình học: vá một trường rồi trả sơ đồ mới. ──
// Mọi thay đổi phải đi qua doiSoDo (bất biến) thì Ctrl+Z mới đúng.
const vaKhoi = (soDo, id, va) => ({
  ...soDo, nodes: soDo.nodes.map(n => (n.id === id ? { ...n, ...va } : n)),
});
const vaCanh = (soDo, id, va) => ({
  ...soDo, edges: soDo.edges.map(e => (e.id === id ? { ...e, ...va } : e)),
});
const boCanh = (soDo, id) => ({ ...soDo, edges: soDo.edges.filter(e => e.id !== id) });
// XOÁ HẲN khoá chứ không đặt về 0 hay chuỗi rỗng: đường quay lại đúng dạng của
// một đường chưa từng bị chỉnh, và bản lưu không đọng lại khoá thừa nào.
const boKhoa = (soDo, id, khoa) => ({
  ...soDo,
  edges: soDo.edges.map((e) => {
    if (e.id !== id) return e;
    const con = { ...e };
    for (const k of khoa) delete con[k];
    return con;
  }),
});
const boLech = (soDo, id) => boKhoa(soDo, id, ['lech']);
const vaCot = (soDo, i, va) => ({
  ...soDo, lanes: soDo.lanes.map((l, k) => (k === i ? { ...l, ...va } : l)),
});

let dem = 0;
const idMoi = tien => `${tien}${Date.now().toString(36)}${(dem++).toString(36)}`;

const themCanh = (soDo, a, b) => ({
  ...soDo, edges: [...soDo.edges, { id: idMoi('e'), a, b, lbl: '', k: 'n' }],
});

/** Khối RỜI (không nối tiếp khối nào). Mượn đúng phép đặt chỗ của themBuoc —
 *  đẩy khối chắn chỗ, nới hàng cuối — rồi gỡ đường nối nó vừa tạo. Nhờ vậy
 *  tệp này không phải tự tính lấy một toạ độ nào. */
function themKhoiRoi(soDo, loai, tuId, cot) {
  const s = themBuoc(soDo, { tuId, loai, cot, ten: LOAI_KHOI[loai]?.nhan || 'Khối mới' });
  const moi = s.nodes[s.nodes.length - 1];
  return { ...s, edges: s.edges.filter(e => e.b !== moi.id), idMoi: moi.id };
}

const rong = v => !String(v ?? '').trim() || String(v).trim() === '—';

// Ban hành / Trả lại đều nạp lại phiên bản TỪ DB, và RPC ban hành đóng dấu lên
// bản ĐÃ LƯU. Bấm khi còn thay đổi chưa lưu ⇒ bản ban hành khác bản trên màn
// hình. KHÔNG tự lưu hộ: ban hành là hành vi có chủ đích lên một bản cụ thể,
// âm thầm gộp thêm phần đang sửa là duyệt luôn thứ chưa ai chọn để duyệt.
const CANH_BAO_CHUA_LUU = 'Còn thay đổi chưa lưu. Hãy bấm "Lưu nháp" trước — '
  + 'nếu không, bản được ban hành sẽ KHÁC với bản đang hiện trên màn hình.';

/* ── Ô nhập ghi khi RỜI Ô, không phải mỗi lần gõ ────────────────
   Gõ một câu 40 ký tự mà mỗi ký tự đẩy một bản vào ngăn xếp hoàn tác
   thì Ctrl+Z trở nên vô dụng. Không kiểm soát giá trị (defaultValue) +
   key ở nơi gọi ⇒ hoàn tác đổi giá trị thì ô tự dựng lại theo. */
function ONhap({ nhan, giaTri, onLuu, doc, dong, goiY, ghiChu, id, kieu = 'text', them }) {
  const luu = (ev) => {
    const v = ev.target.value;
    if (!doc && v !== (giaTri ?? '')) onLuu(v);
  };
  const chung = {
    id, defaultValue: giaTri ?? '', onBlur: luu, readOnly: !!doc,
    placeholder: goiY, style: { ...S.inp, ...(doc ? S.inpDoc : null) },
    ...them,
  };
  return (
    <div style={S.fld}>
      <label htmlFor={id} style={S.lbl}>{nhan}</label>
      {dong ? <textarea {...chung} rows={dong} style={{ ...chung.style, ...S.ta }} />
        : <input type={kieu} {...chung} />}
      {ghiChu && <p style={S.note}>{ghiChu}</p>}
    </div>
  );
}

// Ô "Số thứ tự bước" ở bảng bên phải. Huy hiệu số ở góc khối bấm vào là nhảy
// tới đây, nên hai chỗ phải cùng biết một cái id.
const ID_STT = 'qe-f-stt';

function Rong({ tieuDe, phu }) {
  return (
    <div style={S.rong}>
      <GitBranch size={30} strokeWidth={1.4} color={C.vien2} />
      <div style={{ fontWeight: 700, color: C.chu2, marginTop: 8 }}>{tieuDe}</div>
      <div style={{ marginTop: 4 }}>{phu}</div>
    </div>
  );
}

export default function SoanThaoTab({
  isAdmin, mo, setMo, soDo, doiSoDo, hoanTac, lamLai, coHoanTac, coLamLai,
  pSoanThao, napLai, mau = '#ea580c', chuaLuu = false, danhDauDaLuu = () => {},
  moQuyTrinh,
}) {
  const [chon, setChon] = useState(null);        // { loai:'node'|'edge'|'lane'|'hang', id }
  const [cheDo, setCheDo] = useState('chon');    // 'chon' | 'noi'
  const [nguonNoi, setNguonNoi] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [keo, setKeo] = useState(null);          // { id, dx, y, mocY } — vị trí TẠM lúc kéo khối
  const [noiKeo, setNoiKeo] = useState(null);    // { tuId, x, y } — đường nối đang kéo
  const [keoLech, setKeoLech] = useState(null);  // { id, lech } — chỗ bẻ đang kéo tay
  const [keoNhan, setKeoNhan] = useState(null);  // { id, tiLe } — nhãn đang trượt dọc đường
  const [keoCot, setKeoCot] = useState(null);    // { tu, den } — cột đang kéo đổi chỗ
  const [pop, setPop] = useState(null);          // bảng chọn của nút ＋
  const [dangChay, setDangChay] = useState('');  // tên hành động đang gọi API
  const [toasts, setToasts] = useState([]);

  const keoRef = useRef(null);
  const noiRef = useRef(null);
  const lechRef = useRef(null);
  const nhanRef = useRef(null);
  const cotRef = useRef(null);
  const cvRef = useRef(null);
  const giayRef = useRef(null);
  const rf = useRef({});

  const toast = useCallback((noiDung) => {
    const id = idMoi('t');
    setToasts(ts => [...ts, { id, noiDung }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 4200);
  }, []);

  const pb = mo?.phienBan || null;
  const tt = pb?.trang_thai || 'draft';
  const ttNhan = TT[tt] || { ten: tt, mau: C.chu3 };

  // CHỈ BẢN NHÁP MỚI SỬA ĐƯỢC. Luật ở api.banKhoaNoiDung, khớp từng chữ với
  // trigger qt_canh_trang_thai — trigger mới là chốt chặn thật, đây là để màn
  // hình nói cùng một điều thay vì để người dùng bấm nút rồi ăn lỗi PL/pgSQL.
  const banKhoa = api.banKhoaNoiDung(tt);
  const coSua = !!pSoanThao?.edit && !!soDo && !banKhoa;

  // ── Dẫn xuất từ sơ đồ ─────────────────────────────────────────
  // Sơ đồ ĐANG HIỂN THỊ: trong lúc kéo, khối (và chỗ bẻ đường nối) theo con trỏ
  // để hình chạy theo cho mượt. Bản CAM KẾT (soDo) chỉ đổi khi thả tay — một
  // bước hoàn tác cho một lần chỉnh, không phải một bước cho mỗi pixel.
  const soDoHien = useMemo(() => {
    if (!soDo) return soDo;
    let s = soDo;
    if (keo) s = { ...s, nodes: s.nodes.map(n => (n.id === keo.id ? { ...n, dx: keo.dx, y: keo.y } : n)) };
    if (keoLech) s = { ...s, edges: s.edges.map(e => (e.id === keoLech.id ? { ...e, lech: keoLech.lech } : e)) };
    if (keoNhan) {
      s = { ...s, edges: s.edges.map(e => (e.id === keoNhan.id ? { ...e, viTriNhan: keoNhan.tiLe } : e)) };
    }
    return s;
  }, [soDo, keo, keoLech, keoNhan]);

  const thuTu = useMemo(() => (soDoHien ? thuTuBuoc(soDoHien) : []), [soDoHien]);

  // Dải bước — HÀNG ĐỀU, mỗi dải cao đúng CAO_HANG. Lưới có trước, khối rơi vào
  // lưới, nên kéo khối KHÔNG làm hàng cao thấp đổi theo nữa — đúng điều người
  // dùng yêu cầu. Toàn bộ phép chia hàng nằm ở daiBuoc; tệp này chỉ đọc y1/y2.
  const dai = useMemo(() => (soDoHien ? daiBuoc(soDoHien) : []), [soDoHien]);

  // Chỗ hai đường nối CẮT NHAU — tính một lần cho cả bản vẽ rồi truyền vào từng
  // đường để nó tự bẻ nhịp cầu. Toàn bộ hình học nằm ở diemGiao/routeEdge; tệp
  // này không tính lấy một toạ độ nào, và màn hình dùng ĐÚNG hàm mà bản in dùng.
  const giaoNoi = useMemo(() => (soDoHien ? diemGiao(soDoHien) : []), [soDoHien]);

  // kiemTraLuuDo O(n²) ở phần soát khối chồng nhau. Nhớ theo soDo (bản CAM KẾT)
  // nên kéo khối, đổi vùng chọn, gõ chữ, phóng to đều KHÔNG chạy lại.
  const { loi, canhBao } = useMemo(
    () => (soDo ? kiemTraLuuDo(soDo) : { loi: [], canhBao: [] }), [soDo]);

  const khoiChon = chon?.loai === 'node' && soDo ? timKhoi(soDo, chon.id) : null;
  const canhChon = chon?.loai === 'edge' && soDo ? soDo.edges.find(e => e.id === chon.id) : null;

  // Đường ĐANG CHỌN, đã định tuyến sẵn: núm chỗ bẻ và bốn chấm ghim điểm nối đều
  // đọc từ đây nên chỉ phải định tuyến MỘT lần. routeEdge trả sẵn `keo` (chỗ đặt
  // núm và hai đầu đoạn kéo được) lẫn `neo` (cạnh đường đang thật sự ra/vào, kể
  // cả khi còn tự động) — tệp này không tính lấy một toạ độ nào.
  const noiChon = (() => {
    if (!soDoHien || chon?.loai !== 'edge') return null;
    const e = soDoHien.edges.find(x => x.id === chon.id);
    const r = e ? routeEdge(soDoHien, e) : null;
    const A = r ? timKhoi(soDoHien, e.a) : null, B = r ? timKhoi(soDoHien, e.b) : null;
    if (!r || !A || !B) return null;
    return {
      keo: r.keo || null,
      // Chỗ NHÃN đang đậu (routeEdge đã tính cả phần kéo tay viTriNhan) và chữ
      // của nó — khung kéo nhãn chỉ mọc khi đường thật sự CÓ nhãn để mà kéo.
      // Toạ độ khối hỏng (so_do là jsonb) làm nhãn thành NaN: thà không có
      // khung còn hơn đặt một khung ở transform="translate(NaN NaN)".
      nhan: r.nhan.every(Number.isFinite) ? r.nhan : null,
      lbl: String(e.lbl ?? '').trim(),
      // Hai đầu đường: khối để đặt chấm, cạnh ĐANG GHIM (null là để tự động) và
      // cạnh ĐANG CÓ HIỆU LỰC (để tô sáng chấm mà đường thật sự đang dùng).
      dau: [
        { khoa: 'raA', ten: A.tx, r: rectOf(A), ghim: neoHopLe(e.raA), dang: r.neo.raA },
        { khoa: 'vaoB', ten: B.tx, r: rectOf(B), ghim: neoHopLe(e.vaoB), dang: r.neo.vaoB },
      ],
    };
  })();
  // null nghĩa là đường ấy thẳng tuột, không có chỗ bẻ nào để chỉnh.
  const numLech = noiChon?.keo || null;

  // Mốc đường gióng ngang hàng — chỉ tồn tại trong lúc kéo, và chỉ khi nam châm
  // đang bắt vào một khối nào đó. hutHang đã trả sẵn con số này lúc kéo nên ở đây
  // không phải tính lại toạ độ nào. Thả tay ⇒ keo về null ⇒ đường gióng tắt.
  const mocGiong = keo?.mocY ?? null;

  // ── Thao tác trên sơ đồ ───────────────────────────────────────
  const nhayToi = useCallback((id) => {
    if (!id) return;
    setChon({ loai: 'node', id });
    const el = cvRef.current?.querySelector(`[data-node="${id}"]`);
    if (el?.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, []);

  // Bấm huy hiệu số ở góc khối = nhảy tới ô "Số thứ tự bước" bên phải, con trỏ
  // bôi sẵn số cũ để gõ đè. Huy hiệu chỉ rộng 19px: nhét ô nhập vào trong đó thì
  // bấm trượt nhiều hơn bấm trúng, nên nó chỉ là CÁI NÚT DẪN, chỗ sửa ở bảng.
  const chinhSoBuoc = useCallback(() => {
    const el = document.getElementById(ID_STT);
    if (!el) return;
    el.focus();
    if (typeof el.select === 'function') el.select();
  }, []);

  const xoaDangChon = useCallback(() => {
    const g = rf.current;
    if (!g.coSua || !g.soDo) return;
    if (g.chon?.loai === 'node') {
      g.doiSoDo(xoaKhoi(g.soDo, g.chon.id));
      setChon(null);
      g.toast('Đã xoá khối và các đường nối của nó.');
    } else if (g.chon?.loai === 'edge') {
      g.doiSoDo(boCanh(g.soDo, g.chon.id));
      setChon(null);
      g.toast('Đã xoá đường nối.');
    }
  }, []);

  // Xoá cột / hàng — phép tính nằm ở xoaCot/xoaHang, ở đây chỉ hỏi lại và
  // chuyển lời từ chối của nó ra màn hình. KHÔNG tự đi dời khối hộ người dùng:
  // dời khối là đổi bộ phận phụ trách, chuyện đó phải do họ nhìn thấy mà quyết.
  const xoaCotTai = (i) => {
    if (!coSua) return;
    const ten = soDo.lanes[i]?.name || `Cột ${i + 1}`;
    if (!window.confirm(`Xoá cột “${ten}” khỏi lưu đồ?\n\nHoàn tác được bằng Ctrl+Z.`)) return;
    try {
      doiSoDo(xoaCot(soDo, i));
      setChon(null);
      toast(`Đã xoá cột “${ten}”. Các cột bên phải dịch sang trái một bậc.`);
    } catch (e) {
      alert(e?.message || 'Không xoá được cột.');
    }
  };

  // Đổi chỗ cột bộ phận. Toàn bộ phép dời — kể cả việc ánh xạ lại `lane` của MỌI
  // khối để không bước nào sang tên bộ phận khác — nằm ở chuyenCot; ở đây chỉ đẩy
  // một nấc hoàn tác và nói lại kết quả. Dùng chung cho CẢ HAI lối: kéo tên cột
  // và hai nút ◀ ▶ ở bảng bên phải, nên hai lối không thể lệch nhau.
  const chuyenCotTai = (tu, den) => {
    if (!coSua) return;
    // Số thứ tự bước suy từ VỊ TRÍ trên trang (trên xuống, rồi TRÁI SANG PHẢI),
    // nên đổi chỗ cột có thể đánh số lại các bước cùng hàng. Số bước đi vào bản
    // in ISO và bị trích dẫn ra miệng ("bước 5 làm sai") — đổi âm thầm là điều
    // phải tránh. Đúng cách nút "Tự xếp lại" đang báo.
    const truoc = dongDienGiai(soDo).map(r => r.khoiId);
    const moi = chuyenCot(soDo, tu, den);
    // chuyenCot trả CHÍNH sơ đồ cũ khi không có gì đổi (ngoài phạm vi, cùng chỗ)
    // — Ctrl+Z không nên tiêu một nấc vào đó.
    if (moi === soDo) return;
    const sau = dongDienGiai(moi).map(r => r.khoiId);
    const ten = soDo.lanes[tu]?.name || `Cột ${tu + 1}`;
    doiSoDo(moi);
    setChon({ loai: 'lane', id: den });     // cột vừa dời vẫn là cột đang chọn
    // Đã ghim thứ tự bằng tay thì số bước KHÔNG chạy theo vị trí nữa, nên không
    // có gì để cảnh báo — điều kiện đặt trên khoá ĐÃ LỌC, y như nút "Đánh số lại
    // theo vị trí": khoá rác trong so_do vốn đã bị thuTuBuoc coi như không có.
    const danhTay = Array.isArray(soDo.thuTu) && soDo.thuTu.length > 0;
    toast(`Đã chuyển cột “${ten}” sang vị trí ${den + 1}. Mọi bước giữ nguyên bộ phận phụ trách.`
      + (!danhTay && truoc.join() !== sau.join()
        ? ' Số thứ tự bước có thay đổi — xem lại bảng diễn giải trước khi in.' : ''));
  };

  const xoaHangTai = (i) => {
    if (!coSua) return;
    if (!window.confirm(`Xoá hàng “Bước ${i + 1}”?\n\nHoàn tác được bằng Ctrl+Z.`)) return;
    try {
      doiSoDo(xoaHang(soDo, i));
      setChon(null);
      toast(`Đã xoá một hàng. Các khối phía dưới dịch lên một hàng, số bước đánh lại từ đầu.`);
    } catch (e) {
      alert(e?.message || 'Không xoá được hàng.');
    }
  };

  const xepLai = () => {
    if (!coSua) return;
    // Số thứ tự bước suy từ VỊ TRÍ trên trang. Xếp lại có thể gộp hai khối lệch
    // nhau chút ít về cùng một hàng ⇒ thứ tự đọc đổi theo. Số bước đi vào bản in
    // và bị trích dẫn ra miệng ("bước 5 làm sai"), nên đổi âm thầm là điều phải tránh.
    const truoc = dongDienGiai(soDo).map(r => r.khoiId);
    const moi = tuXepLai(soDo);
    const sau = dongDienGiai(moi).map(r => r.khoiId);
    doiSoDo(moi);
    if (truoc.join() !== sau.join()) {
      toast('Đã xếp lại. Số thứ tự bước có thay đổi — xem lại bảng diễn giải trước khi in.');
    } else {
      toast('Đã xếp lại lưu đồ: khối căn giữa cột và về đúng tâm ô của lưới hàng.');
    }
  };

  // ── Bảng chọn của nút ＋ ──────────────────────────────────────
  const moPop = (ev, n, nhanh) => {
    ev.stopPropagation();
    ev.preventDefault();
    if (!coSua) return;
    const r = ev.currentTarget.getBoundingClientRect();
    // Cột mặc định: nhánh NG rẽ NGANG nên phải sang cột khác; các nhánh còn lại
    // đi xuống trong chính cột của khối nguồn.
    const cotMd = nhanh === 'ng'
      ? (n.lane > 0 ? n.lane - 1 : Math.min(1, soDo.lanes.length - 1))
      : n.lane;
    setChon({ loai: 'node', id: n.id });
    setPop({
      tuId: n.id, tuTen: n.tx, nhanh, laneNguon: n.lane,
      ten: '', loai: 'step', cot: cotMd,
      x: r.left + r.width / 2, y: r.bottom + 8,
    });
  };

  const themTuPop = () => {
    if (!pop || !coSua) return;
    try {
      const s = themBuoc(soDo, {
        tuId: pop.tuId, nhanh: pop.nhanh, loai: pop.loai, cot: pop.cot, ten: pop.ten,
      });
      const moi = s.nodes[s.nodes.length - 1];
      doiSoDo(s);
      setChon({ loai: 'node', id: moi.id });
      setPop(null);
      toast(`Đã thêm “${moi.tx}” vào cột ${soDo.lanes[pop.cot]?.name || '—'} và nối tự động.`);
    } catch (e) {
      setPop(null);
      alert(e?.message || 'Không thêm được bước.');
    }
  };

  // ── Kéo khối ──────────────────────────────────────────────────
  const nenKhoi = (ev, n) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    if (cheDo === 'noi') {
      if (!coSua) return;
      if (!nguonNoi) { setNguonNoi(n.id); toast('Chọn tiếp khối đích để nối.'); return; }
      if (nguonNoi === n.id) { setNguonNoi(null); return; }
      const s = themCanh(soDo, nguonNoi, n.id);
      doiSoDo(s);
      setChon({ loai: 'edge', id: s.edges[s.edges.length - 1].id });
      setNguonNoi(null); setCheDo('chon');
      toast('Đã tạo đường nối. Đặt nhãn OK / NG ở bảng bên phải.');
      return;
    }
    setChon({ loai: 'node', id: n.id });
    if (!coSua) return;
    keoRef.current = {
      id: n.id, sx: ev.clientX, sy: ev.clientY,
      dx0: n.dx || 0, y0: n.y, dx: n.dx || 0, y: n.y, di: false,
    };
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* trình duyệt không hỗ trợ */ }
  };

  const dichKhoi = (ev) => {
    const k = keoRef.current;
    if (!k) return;
    // Chia cho zoom: con trỏ đi 100px trên màn hình ở mức 50% là 200px trên giấy.
    const dx = (ev.clientX - k.sx) / zoom;
    const dy = (ev.clientY - k.sy) / zoom;
    if (!k.di) {
      if (Math.hypot(dx, dy) < 3) return;   // rung tay khi bấm chọn không tính là kéo
      k.di = true;
    }
    const dxLuoi = Math.round((k.dx0 + dx) / BUOC_LUOI) * BUOC_LUOI;
    const oLuoi = Math.max(4, Math.round((k.y0 + dy) / BUOC_LUOI) * BUOC_LUOI);
    // Nam châm ngang hàng ĐÈ LÊN lưới 8px, không thay nó: lưới chỉ cho ra bội số
    // của 8, mà khối Quyết định (cao 86) muốn TRÙNG TÂM với khối Thao tác (cao 56)
    // thì y phải lệch nhau 15 — con số không bao giờ rơi trúng lưới. Canh bằng mắt
    // trên lưới vẫn lệch 3-4px, và 3-4px đó nhìn thấy rõ trên bản in.
    // Ngưỡng chia cho zoom y như quãng kéo ở trên, để nam châm ở 50% và 150%
    // cắn cùng một khoảng trên MÀN HÌNH. Phép hút nằm ở hutHang, không ở đây.
    const hut = hutHang(soDo, k.id, oLuoi, NGUONG_HUT / zoom);
    // Kẹp CẢ HAI TRỤC vào trong trang, sau nam châm — thứ gì dời khối cuối cùng
    // thì thứ đó phải bị kẹp. Khối lọt ra ngoài khung drawW × drawH vẫn hiện ở
    // đây nhưng RỤNG khỏi ảnh xuất và bản in; kiemTraLuuDo có bắt (NGOAI_TRANG)
    // nhưng chặn ở lúc ban hành là bắt người dùng gỡ một mớ đã lỡ dựng. Phép kẹp
    // nằm ở kepTrongTrang, tệp này không tính lấy một toạ độ nào.
    const n = timKhoi(soDo, k.id);
    const trongTrang = kepTrongTrang(soDo, n, dxLuoi, hut.y);
    k.dx = trongTrang.dx;
    k.y = trongTrang.y;
    // Kẹp rồi mà y đổi thì khối KHÔNG còn ngang hàng với khối vừa hút vào —
    // để vạch gióng lại là vẽ một đường nói dối.
    setKeo({ id: k.id, dx: k.dx, y: k.y, mocY: k.y === hut.y ? hut.mocY : null });
  };

  const thaKhoi = () => {
    const k = keoRef.current;
    if (!k) return;
    keoRef.current = null;
    setKeo(null);
    if (!k.di || !soDo) return;
    const n = timKhoi(soDo, k.id);
    if (!n) return;
    const dat = { ...n, dx: k.dx, y: k.y };
    // Rơi vào cột nào thì thuộc cột đó — người thực hiện đổi theo cột.
    const cot = Math.max(0, Math.min(soDo.lanes.length - 1,
      Math.floor((nodeX(dat) + dat.w / 2) / LANE_W)));
    let s = vaKhoi(soDo, k.id, { dx: k.dx, y: k.y });
    if (cot !== n.lane) s = doiCot(s, k.id, cot);   // doiCot tự đưa dx về 0, căn giữa cột mới
    doiSoDo(s);
    if (cot !== n.lane) {
      const l = soDo.lanes[cot] || {};
      toast(`Đã chuyển sang cột ${l.name || '—'} — người thực hiện thành ${l.owner || '—'}.`);
    }
  };

  // ── Kéo để nối ────────────────────────────────────────────────
  // HAI cử chỉ kéo trên cùng một khối, tách nhau bằng CHỖ BẤM chứ không bằng
  // ngưỡng thời gian hay quãng đường — thứ luôn đoán sai một trong hai:
  //   · bấm vào THÂN khối  → nenKhoi  → dời khối;
  //   · bấm vào NÚM tròn ⤳ → nenNoi   → kéo ra đường nối.
  // Núm gọi stopPropagation ở pointerdown nên nenKhoi không bao giờ chạy cùng,
  // và keoRef vẫn null suốt lúc kéo nối ⇒ dichKhoi/thaKhoi tự thoát ở dòng đầu.
  const diemGiay = (ev) => {
    const r = giayRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    // Chia cho zoom như dichKhoi: khung giấy đang bị scale(), rect trả về là số đo
    // trên MÀN HÌNH, còn toạ độ khối thì tính trên GIẤY.
    return { x: (ev.clientX - r.left) / zoom, y: (ev.clientY - r.top) / zoom };
  };

  const nenNoi = (ev, n) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    ev.preventDefault();
    if (!coSua) return;
    noiRef.current = { tuId: n.id };
    setNoiKeo({ tuId: n.id, ...diemGiay(ev) });
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* trình duyệt không hỗ trợ */ }
  };

  const dichNoi = (ev) => {
    if (!noiRef.current) return;
    ev.stopPropagation();
    setNoiKeo({ tuId: noiRef.current.tuId, ...diemGiay(ev) });
  };

  const huyNoi = (ev) => {
    if (!noiRef.current) return;
    ev.stopPropagation();
    noiRef.current = null;
    setNoiKeo(null);
  };

  const thaNoi = (ev) => {
    const k = noiRef.current;
    if (!k) return;
    ev.stopPropagation();
    noiRef.current = null;
    setNoiKeo(null);
    if (!coSua || !soDo) return;
    // Thả xuống đâu thì hỏi thẳng DOM chỗ đó, không dò theo toạ độ: lớp phủ
    // đường nối đã pointer-events:none nên phép thử này chạm đúng khối.
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const dich = el?.closest?.('[data-node]')?.getAttribute('data-node');
    if (!dich) { toast('Đã bỏ nối — thả ra chỗ trống thì không tạo đường nào.'); return; }
    // Khối tự nối vào chính nó là một LỖI ở kiemTraLuuDo. Chặn ngay ở đây thì
    // người dùng không phải đi xoá một thứ mà giao diện vừa mời họ tạo ra.
    if (dich === k.tuId) { toast('Một khối không nối được vào chính nó.'); return; }
    const s = themCanh(soDo, k.tuId, dich);
    doiSoDo(s);
    setChon({ loai: 'edge', id: s.edges[s.edges.length - 1].id });
    toast('Đã tạo đường nối. Đặt nhãn OK / NG ở bảng bên phải.');
  };

  // ── Kéo chỗ bẻ của đường nối ──────────────────────────────────
  // Cử chỉ THỨ BA, tách khỏi hai cử chỉ kia đúng bằng CHỖ BẤM như chúng:
  //   · bấm THÂN khối → dời khối · bấm núm ⤳ → kéo nối · bấm núm trên ĐƯỜNG → chỉnh chỗ bẻ.
  // Núm nằm đè lên vệt bắt sự kiện của chính đường đó nên phải stopPropagation
  // ở pointerdown, và nó được vẽ SAU mọi đường (SVG không có z-index, cái vẽ sau
  // nằm trên). keoRef/noiRef vẫn null suốt lúc này ⇒ dichKhoi/thaNoi tự thoát.
  //
  // Số ghi vào sơ đồ là lech TƯƠNG ĐỐI so với chỗ bẻ tự động, nên kéo khối đi
  // thì chỗ bẻ vẫn bám theo. Hình học của việc đó nằm trọn ở routeEdge.
  const nenLech = (ev, huong) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    ev.preventDefault();
    if (!coSua || !canhChon) return;
    const goc = Number.isFinite(canhChon.lech) ? canhChon.lech : 0;
    lechRef.current = { id: canhChon.id, huong, sx: ev.clientX, sy: ev.clientY, goc, lech: goc };
    setKeoLech({ id: canhChon.id, lech: goc });
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* trình duyệt không hỗ trợ */ }
  };

  const dichLech = (ev) => {
    const k = lechRef.current;
    if (!k) return;
    ev.stopPropagation();
    // Chia cho zoom y như dichKhoi, rồi bám lưới 8px y như kéo khối.
    const di = (k.huong === 'doc' ? ev.clientX - k.sx : ev.clientY - k.sy) / zoom;
    k.lech = Math.round((k.goc + di) / BUOC_LUOI) * BUOC_LUOI;
    setKeoLech({ id: k.id, lech: k.lech });
  };

  const thaLech = (ev) => {
    const k = lechRef.current;
    if (!k) return;
    ev.stopPropagation();
    lechRef.current = null;
    setKeoLech(null);
    // Không nhích được pixel nào thì KHÔNG đẩy gì vào ngăn xếp hoàn tác: bấm
    // trúng núm rồi thả ra là chuyện thường, Ctrl+Z không nên tiêu vào đó một nấc.
    if (!coSua || !soDo || k.lech === k.goc) return;
    doiSoDo(k.lech === 0 ? boLech(soDo, k.id) : vaCanh(soDo, k.id, { lech: k.lech }));
  };

  const huyLech = (ev) => {
    if (!lechRef.current) return;
    ev.stopPropagation();
    lechRef.current = null;
    setKeoLech(null);
  };

  // ── Kéo nhãn OK / NG trượt dọc đường nối ──────────────────────
  // Cử chỉ THỨ NĂM, tách khỏi bốn cử chỉ kia đúng bằng CHỖ BẤM như chúng:
  //   · bấm THÂN khối → dời khối · núm ⤳ → kéo nối · núm trên đường → chỗ bẻ
  //   · chấm giữa cạnh khối → ghim điểm nối · KHUNG QUANH NHÃN → trượt nhãn.
  //
  // Khung nhãn và núm chỗ bẻ CÙNG thuộc một đường đang chọn và CÓ THỂ trùng chỗ:
  // nhãn tự động đậu giữa đoạn DÀI NHẤT, mà ở lối "xuống lệch cột" và lối lách
  // khối thì đoạn ấy chính là đoạn kéo được, nên hai tâm rơi trùng nhau. Tách
  // bằng THỨ TỰ VẼ + KÍCH THƯỚC, không bằng ngưỡng thời gian:
  //   · khung nhãn vẽ TRƯỚC (nằm dưới) và rộng 44×24;
  //   · núm chỗ bẻ và bốn chấm ghim vẫn vẽ SAU nên nằm trên, vùng bấm y như cũ —
  //     cử chỉ cũ không mất một pixel nào;
  //   · núm chỉ rộng 19 nên hai đầu khung nhãn vẫn thò ra 12px mỗi bên để bắt,
  //     và kéo một cái là nhãn rời hẳn chỗ ấy (viTriNhan được ghi lại).
  // nhanRef null suốt lúc kéo thứ khác ⇒ dichNhan/thaNhan tự thoát ở dòng đầu,
  // và ngược lại keoRef/noiRef/lechRef null suốt lúc kéo nhãn.
  //
  // Số ghi vào sơ đồ là TỈ LỆ 0…1 dọc đường, không phải toạ độ: kéo khối đi hay
  // đường đổi hình thì nhãn vẫn bám trên nét vẽ. Phép đổi điểm thả thành tỉ lệ
  // nằm trọn ở tiLeTrenDuong — tệp này không tính lấy một toạ độ nào.
  const nenNhan = (ev) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    ev.preventDefault();          // y như bốn cử chỉ kia: đừng để trình duyệt bôi đen
    if (!coSua || !canhChon) return;
    const goc = tiLeNhanHopLe(canhChon.viTriNhan);
    nhanRef.current = { id: canhChon.id, goc, tiLe: goc, sx: ev.clientX, sy: ev.clientY, di: false };
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* trình duyệt không hỗ trợ */ }
  };

  const dichNhan = (ev) => {
    const k = nhanRef.current;
    if (!k) return;
    ev.stopPropagation();
    const e = soDo?.edges?.find(x => x.id === k.id);
    if (!e) return;
    // Rung tay khi bấm chọn không tính là kéo — y như dichKhoi. Núm chỗ bẻ khỏi
    // cần vì nó bám lưới 8px, còn nhãn trượt liên tục nên 1px rung cũng đủ đẩy
    // một nấc hoàn tác và bật cờ "Chưa lưu".
    if (!k.di) {
      if (Math.hypot(ev.clientX - k.sx, ev.clientY - k.sy) / zoom < 3) return;
      k.di = true;
    }
    // diemGiay đã chia cho zoom y như dichKhoi/dichNoi — con trỏ đi 100px trên
    // màn hình ở mức 50% là 200px trên giấy.
    const p = diemGiay(ev);
    // Đo trên bản CAM KẾT: hình đường không phụ thuộc viTriNhan, nên lấy sơ đồ
    // đang kéo cũng ra đúng chừng ấy — mà lấy bản cam kết thì không có vòng lặp
    // "vị trí nhãn quyết định vị trí nhãn".
    const t = tiLeTrenDuong(soDo, e, p.x, p.y);
    if (t === null) return;       // đường trỏ tới khối đã xoá — không đoán bừa
    k.tiLe = t;
    setKeoNhan({ id: k.id, tiLe: t });
  };

  const thaNhan = (ev) => {
    const k = nhanRef.current;
    if (!k) return;
    ev.stopPropagation();
    nhanRef.current = null;
    setKeoNhan(null);
    // Bấm trúng khung rồi thả ngay là chuyện thường — Ctrl+Z không nên tiêu một
    // nấc vào đó. Một lần kéo = MỘT bước hoàn tác, ghi đúng lúc thả tay.
    if (!coSua || !soDo || !k.di || k.tiLe === null || k.tiLe === k.goc) return;
    doiSoDo(vaCanh(soDo, k.id, { viTriNhan: k.tiLe }));
  };

  const huyNhan = (ev) => {
    if (!nhanRef.current) return;
    ev.stopPropagation();
    nhanRef.current = null;
    setKeoNhan(null);
  };

  // ── Ghim điểm nối vào cạnh khối ───────────────────────────────
  // Cử chỉ THỨ TƯ, tách khỏi ba cử chỉ kia đúng bằng CHỖ BẤM như chúng — và ở
  // đây còn chặt hơn: bốn chấm chỉ mọc khi đang chọn một ĐƯỜNG NỐI, mà núm ＋
  // và núm ⤳ lại chỉ mọc khi đang chọn một KHỐI (hienNum đòi chon.loai==='node'),
  // nên hai bộ KHÔNG BAO GIỜ cùng có mặt trên màn hình. Chấm nằm trong lớp phủ,
  // là một lớp DOM khác hẳn lớp khối, nên pointerdown ở đây không tới được khối
  // bên dưới; keoRef/noiRef/lechRef vẫn null suốt nên dichKhoi/thaNoi/dichLech
  // tự thoát ở dòng đầu.
  //
  // Bấm đúng chấm ĐANG GHIM thì gỡ ghim — cùng một chỗ bấm, hai chiều, không
  // phải đi tìm nút "bỏ" ở đâu khác (bảng bên phải vẫn có nút bỏ cả hai đầu).
  const ghimNeo = (ev, khoa, canh) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    ev.preventDefault();          // y như ba cử chỉ kia: đừng để trình duyệt bôi đen
    if (!coSua || !canhChon) return;
    const cu = neoHopLe(canhChon[khoa]);
    doiSoDo(cu === canh
      ? boKhoa(soDo, canhChon.id, [khoa])
      : vaCanh(soDo, canhChon.id, { [khoa]: canh }));
    toast(cu === canh
      ? 'Đã bỏ ghim đầu này — đường tự chọn cạnh trở lại.'
      : `Đã ghim vào ${TEN_CANH[canh]}. Đường đã ghim thôi tự lách khối chắn.`);
  };

  // ── Kéo TÊN CỘT để đổi chỗ cột ────────────────────────────────
  // Cử chỉ THỨ SÁU, tách khỏi năm cử chỉ kia đúng bằng CHỖ BẤM như chúng — và ở
  // đây là chỗ tách rạch ròi nhất trong cả tệp: năm cử chỉ kia đều nằm TRONG
  // KHUNG GIẤY (thân khối, núm ＋/⤳ mọc trên khối, núm chỗ bẻ, bốn chấm ghim và
  // khung nhãn đều nằm trong lớp phủ của khung giấy), còn hàng TÊN CỘT là một dải
  // riêng cao HEAD_H nằm PHÍA TRÊN khung giấy — không khối nào, không lớp phủ nào
  // với tới được. Hai vùng không giao nhau một pixel.
  // pointerdown ở đây vốn đã stopPropagation từ trước (để bấm chọn cột không bị
  // nền canvas huỷ chọn ngay sau đó), và cotRef vẫn null suốt lúc kéo thứ khác ⇒
  // dichCot/thaCot tự thoát ở dòng đầu; ngược lại keoRef/noiRef/lechRef/nhanRef
  // null suốt lúc kéo cột.
  //
  // BẤM mà không kéo vẫn CHỈ LÀ BẤM CHỌN CỘT, y như trước: chọn xong ngay ở
  // pointerdown, rồi phải đi quá 3px (đúng ngưỡng của dichKhoi/dichNhan) mới tính
  // là kéo. Nhờ vậy tính năng mới không lấy mất cú bấm cũ.
  const nenCot = (ev, i) => {
    ev.stopPropagation();
    setChon({ loai: 'lane', id: i });
    // Đọc soDo.lanes chứ không đọc biến `lanes` (khai báo mãi phía dưới): một cột
    // thì không có chỗ nào để chuyển sang, đừng bắt đầu cử chỉ kéo làm gì.
    if (ev.button !== 0 || !coSua || (soDo?.lanes?.length || 0) <= 1) return;
    ev.preventDefault();          // y như bốn cử chỉ kia: đừng để trình duyệt bôi đen
    cotRef.current = { tu: i, den: i, sx: ev.clientX, di: false };
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* trình duyệt không hỗ trợ */ }
  };

  const dichCot = (ev) => {
    const k = cotRef.current;
    if (!k) return;
    ev.stopPropagation();
    if (!k.di) {
      // Chia cho zoom y như dichKhoi/dichNhan, để ngưỡng cắn cùng một khoảng
      // trên MÀN HÌNH ở mọi mức phóng to.
      if (Math.abs(ev.clientX - k.sx) / zoom < 3) return;
      k.di = true;
    }
    // Cột đích đọc từ hoành độ con trỏ TRÊN GIẤY. diemGiay đã chia cho zoom và
    // trừ gốc khung giấy; phép đổi hoành độ thành chỉ số cột nằm ở cotTaiX —
    // tệp này không tính lấy một toạ độ nào.
    k.den = cotTaiX(soDo, diemGiay(ev).x);
    setKeoCot({ tu: k.tu, den: k.den });
  };

  const thaCot = (ev) => {
    const k = cotRef.current;
    if (!k) return;
    ev.stopPropagation();
    cotRef.current = null;
    setKeoCot(null);
    // Chỉ bấm chọn rồi thả ra là chuyện thường — không đẩy gì vào ngăn xếp hoàn
    // tác. chuyenCotTai cũng tự bỏ qua khi tu === den.
    if (!k.di) return;
    chuyenCotTai(k.tu, k.den);
  };

  const huyCot = (ev) => {
    if (!cotRef.current) return;
    ev.stopPropagation();
    cotRef.current = null;
    setKeoCot(null);
  };

  // ── Phím tắt ──────────────────────────────────────────────────
  // Đọc mọi thứ qua ref: handler gắn MỘT lần, không dựng lại theo từng render,
  // và hoàn toàn không giữ bản sao sơ đồ nào. Ctrl+Z gọi thẳng hoanTac() —
  // hàm này ở QuyTrinhApp là setState theo hàm nên giữ phím cho tự lặp vẫn đúng.
  useEffect(() => {
    rf.current = { soDo, chon, coSua, doiSoDo, hoanTac, lamLai, toast, coHoanTac, coLamLai };
  });

  useEffect(() => {
    const trongO = (t) => {
      const tag = t?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable;
    };
    const nghe = (ev) => {
      if (trongO(ev.target)) return;      // đang gõ chữ thì phím tắt phải câm
      const g = rf.current;
      if (ev.key === 'Escape') {
        setPop(null); setChon(null); setNguonNoi(null);
        noiRef.current = null; setNoiKeo(null);
        lechRef.current = null; setKeoLech(null);   // bỏ luôn lần chỉnh đang dở
        nhanRef.current = null; setKeoNhan(null);
        cotRef.current = null; setKeoCot(null);     // cột đang kéo về lại chỗ cũ
        return;
      }
      if (ev.key === 'Delete' || ev.key === 'Del') {
        if (!g.coSua) return;
        ev.preventDefault();
        xoaDangChon();
        return;
      }
      const z = (ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z');
      const y = (ev.ctrlKey || ev.metaKey) && (ev.key === 'y' || ev.key === 'Y');
      if (z || y) {
        if (!g.coSua) return;
        ev.preventDefault();
        if (y || ev.shiftKey) g.lamLai(); else g.hoanTac();
      }
    };
    window.addEventListener('keydown', nghe);
    return () => window.removeEventListener('keydown', nghe);
  }, [xoaDangChon]);

  // Bấm ra ngoài thì đóng bảng chọn ＋.
  useEffect(() => {
    if (!pop) return undefined;
    const ngoai = (ev) => {
      if (ev.target.closest?.('[data-pop]') || ev.target.closest?.('[data-addh]')) return;
      setPop(null);
    };
    document.addEventListener('pointerdown', ngoai, true);
    return () => document.removeEventListener('pointerdown', ngoai, true);
  }, [pop]);

  // ── Vòng duyệt ────────────────────────────────────────────────
  const lamMoiMo = async () => {
    if (!mo?.quyTrinh?.id) return;
    const dsPb = await api.taiPhienBan(mo.quyTrinh.id);
    setMo({ quyTrinh: mo.quyTrinh, phienBan: api.banDangLam(dsPb), dsPhienBan: dsPb });
    await napLai();
  };

  const chay = async (ten, viec) => {
    setDangChay(ten);
    try { await viec(); }
    catch (e) { alert(e?.message || 'Thao tác không thành công.'); }
    finally { setDangChay(''); }
  };

  const luuNhap = () => chay('luu', async () => {
    await api.luuNhap(pb.id, {
      so_do: soDo, tai_lieu: pb.tai_lieu, ghi_chu_sua_doi: pb.ghi_chu_sua_doi,
    });
    danhDauDaLuu();
    setMo(m => ({ ...m, phienBan: { ...m.phienBan, so_do: soDo } }));
    toast(`Đã lưu bản nháp v${pb.phien_ban}.`);
  });

  // Lưu TRƯỚC rồi mới gửi: gửi duyệt bản trên màn hình mà chưa ghi xuống thì
  // người duyệt đọc phải bản cũ, và người soạn không hề biết.
  const guiDuyet = () => chay('gui', async () => {
    await api.luuNhap(pb.id, {
      so_do: soDo, tai_lieu: pb.tai_lieu, ghi_chu_sua_doi: pb.ghi_chu_sua_doi,
    });
    danhDauDaLuu();
    await api.guiDuyet(pb.id);
    await lamMoiMo();
    toast(`Đã lưu và gửi duyệt bản v${pb.phien_ban}. Chờ Admin ban hành.`);
  });

  const banHanh = () => {
    // Chặn ở đây chứ không chỉ ở nút: nút có thể bấm được trong một nhịp render
    // cũ, và đây là thao tác không lùi lại được.
    if (chuaLuu) { alert(CANH_BAO_CHUA_LUU); return; }
    chay('ban', async () => {
      await api.banHanh(pb.id);
      await lamMoiMo();
      toast(`Đã ban hành v${pb.phien_ban}. Bản đang hiệu lực trước đó chuyển sang hết hiệu lực.`);
    });
  };

  // Soát xét một bản ĐÃ BAN HÀNH: chép nguyên nội dung sang một bản nháp mới.
  // Trước đây ba tab soạn thảo bảo "muốn sửa thì tạo phiên bản mới" mà app không
  // hề có việc đó — một lỗi chính tả trong quy trình ISO đã ban hành kẹt vĩnh viễn.
  //
  // Hỏi lại trước khi gọi: nó ghi thật một dòng xuống DB và đưa cả quy trình về
  // trạng thái "Bản nháp" ở màn hình danh mục.
  const taoPhienBanMoi = () => {
    if (!pb?.id || !mo?.quyTrinh?.id) return;
    const ok = window.confirm(
      `Tạo phiên bản mới từ bản v${pb.phien_ban || '—'} đang hiệu lực?\n\n`
      + 'Toàn bộ lưu đồ và nội dung tài liệu được chép sang một BẢN NHÁP mới để sửa.\n'
      + 'Bản đang hiệu lực GIỮ NGUYÊN cho tới khi bản mới được Admin ban hành.');
    if (!ok) return;
    chay('pbmoi', async () => {
      await api.taoPhienBanMoi(mo.quyTrinh.id);
      // Nạp lại danh mục TRƯỚC (đầu bảng vừa lùi về 'draft'), rồi mở lại chính
      // quy trình này — banDangLam ưu tiên bản nháp nên bản vừa tạo được mở ra,
      // kèm ngăn xếp hoàn tác và cờ "chưa lưu" dựng lại từ đầu.
      await napLai();
      await moQuyTrinh?.(mo.quyTrinh);
      toast('Đã tạo phiên bản mới và mở bản nháp. Sửa xong thì bấm "Gửi duyệt".');
    });
  };

  const traLai = () => {
    // Hỏi lý do TRƯỚC rồi mới chặn là bắt người ta gõ xong một đoạn để vứt đi.
    if (chuaLuu) { alert(CANH_BAO_CHUA_LUU); return; }
    const lyDo = window.prompt('Lý do trả lại bản này về nháp:', '');
    if (lyDo === null) return;
    if (!lyDo.trim()) { alert('Phải ghi lý do trả lại để người soạn biết cần sửa gì.'); return; }
    chay('tra', async () => {
      await api.traLai(pb.id, lyDo.trim());
      await lamMoiMo();
      toast('Đã trả lại bản này về trạng thái nháp.');
    });
  };

  // ── Rỗng: chưa mở quy trình nào ───────────────────────────────
  if (!soDo) {
    return (
      <div style={S.trong}>
        <style>{CSS}</style>
        <Rong
          tieuDe="Chưa mở quy trình nào để vẽ."
          phu={(
            <>
              Sang tab <b>Danh mục quy trình</b> rồi bấm vào một thẻ để mở lưu đồ của nó.
              <br />Trình vẽ chỉ làm việc trên quy trình đang mở.
            </>
          )} />
      </div>
    );
  }

  const lanes = soDo.lanes || [];
  const W = GUT + drawW(soDoHien);
  const H = HEAD_H + drawH(soDoHien);

  // Neo đầu đường nối đang kéo. Toạ độ lấy nguyên từ rectOf — tệp này không
  // tính lấy một điểm nào trên giấy.
  const khoiKeoNoi = noiKeo ? timKhoi(soDoHien, noiKeo.tuId) : null;
  const neoKeoNoi = khoiKeoNoi ? rectOf(khoiKeoNoi) : null;

  // Soát xét CHỈ mở ra từ bản đang HIỆU LỰC. Bản 'expired' cố ý không có nút:
  // soát xét một bản đã bị thay thế là làm tiếp từ tài liệu cũ hơn cái đang dán
  // ở xưởng. Máy chủ còn soát tiếp chủ sở hữu và "chỉ một việc dở dang một lúc".
  const taoBanMoiDuoc = tt === 'published' && !!pSoanThao?.edit;
  const banHanhDuoc = isAdmin && tt === 'wait' && loi.length === 0 && !chuaLuu;
  // "Chưa lưu" đứng TRƯỚC danh sách lỗi trong thứ tự báo: lỗi đã hiện sẵn ở
  // thanh đỏ phía trên, còn "chưa lưu" thì không nhìn thấy ở đâu khác.
  const lyDoKhoaBanHanh = !isAdmin ? 'Chỉ Admin mới được duyệt và ban hành.'
    : tt !== 'wait' ? 'Chỉ ban hành được bản đang chờ duyệt.'
      : chuaLuu ? CANH_BAO_CHUA_LUU
        : loi.length ? `Còn ${loi.length} lỗi phải sửa trước khi ban hành.`
          : 'Ban hành bản này';

  const nut = (props) => {
    const { on, ...rest } = props;
    return (
      <button type="button" className="qe-tool" data-on={on ? '1' : undefined}
        style={on ? { background: mau, color: '#fff' } : undefined} {...rest} />
    );
  };

  return (
    <div className="qe-wrap">
      <style>{CSS}</style>

      {/* ── Thanh công cụ ───────────────────────────────────────── */}
      <div className="qe-bar">
        <div style={S.title}>
          <span style={{ ...S.code, color: mau, background: mau + '18' }}>{mo?.quyTrinh?.ma_so || '—'}</span>
          <strong style={S.titleTx} title={mo?.quyTrinh?.ten || ''}>{mo?.quyTrinh?.ten || 'Chưa đặt tên'}</strong>
          <span style={S.ver}>v{pb?.phien_ban || '—'}</span>
          <span style={{ ...S.pill, color: ttNhan.mau, background: ttNhan.mau + '22' }}>
            <span style={S.dot} />{ttNhan.ten}
          </span>
        </div>

        <div className="qe-tgroup">
          {nut({
            on: cheDo === 'chon', onClick: () => { setCheDo('chon'); setNguonNoi(null); },
            children: <><MousePointer2 size={13} />Chọn</>, title: 'Chế độ chọn và kéo khối',
          })}
          {nut({
            on: cheDo === 'noi', disabled: !coSua,
            onClick: () => {
              setCheDo('noi'); setNguonNoi(null);
              toast('Chế độ nối: bấm khối nguồn rồi bấm khối đích. Dùng cho mũi tên quay ngược (làm lại, NG).');
            },
            children: <><Spline size={13} />Nối</>,
            title: 'Vẽ mũi tên quay ngược — thứ nút ＋ không tạo được',
          })}
        </div>

        <div className="qe-tgroup">
          {nut({
            disabled: !coSua,
            onClick: () => {
              doiSoDo({ ...soDo, lanes: [...lanes, { name: 'Bộ phận mới', owner: 'Chưa gán', color: C.xam }] });
              setChon({ loai: 'lane', id: lanes.length });
              toast('Đã thêm một cột. Đặt tên bộ phận và người thực hiện ở bảng bên phải.');
            },
            children: <><Columns3 size={13} />Thêm cột</>, title: 'Thêm một cột bộ phận',
          })}
          {nut({
            disabled: !coSua,
            onClick: () => {
              // Số hàng là của lib; ở đây chỉ bấm nút. Hàng mới tự mang số bước
              // tiếp theo, không có tên và không có chiều cao để đặt.
              const moi = soHangCua(soDo);        // hàng vừa mọc ra là hàng cuối
              doiSoDo(themHang(soDo));
              setChon({ loai: 'hang', id: moi });
              toast(`Đã thêm hàng “Bước ${moi + 1}”.`);
            },
            children: <><Rows3 size={13} />Thêm hàng</>, title: 'Thêm một hàng bước ở cuối lưu đồ',
          })}
          {nut({
            disabled: !coSua, onClick: xepLai,
            children: <><Wand2 size={13} />Tự xếp lại</>,
            title: 'Căn giữa cột và đưa mọi khối về đúng tâm ô của lưới hàng',
          })}
        </div>

        <div className="qe-tgroup">
          {nut({
            disabled: !coSua || !coHoanTac, onClick: () => hoanTac(),
            children: <><Undo2 size={13} />Hoàn tác</>, title: 'Hoàn tác (Ctrl+Z)',
          })}
          {nut({
            disabled: !coSua || !coLamLai, onClick: () => lamLai(),
            children: <><Redo2 size={13} />Làm lại</>, title: 'Làm lại (Ctrl+Shift+Z)',
          })}
          {nut({
            disabled: !coSua || !chon, onClick: xoaDangChon,
            children: <><Trash2 size={13} />Xoá</>, title: 'Xoá phần đang chọn (Delete)',
          })}
        </div>

        <div className="qe-tgroup">
          {nut({
            onClick: () => setZoom(z => Math.max(0.5, Math.round((z - 0.1) * 10) / 10)),
            children: <Minus size={13} />, title: 'Thu nhỏ', 'aria-label': 'Thu nhỏ',
          })}
          <span style={S.zoomV}>{Math.round(zoom * 100)}%</span>
          {nut({
            onClick: () => setZoom(z => Math.min(1.5, Math.round((z + 0.1) * 10) / 10)),
            children: <Plus size={13} />, title: 'Phóng to', 'aria-label': 'Phóng to',
          })}
        </div>

        <span style={{ flex: 1 }} />

        {chuaLuu && !banKhoa && (
          <span style={S.chuaLuu} title="Thay đổi mới chỉ nằm trên màn hình, chưa xuống máy chủ.">
            <span style={S.chuaLuuCham} />Chưa lưu
          </span>
        )}
        {pSoanThao?.edit && !banKhoa && (
          <button type="button" className="qe-btn" style={S.btn}
            onClick={luuNhap} disabled={!!dangChay} title="Ghi bản nháp xuống máy chủ">
            {dangChay === 'luu' ? <Loader2 size={14} className="qe-spin" /> : <Save size={14} />} Lưu nháp
          </button>
        )}
        {pSoanThao?.edit && tt === 'draft' && (
          <button type="button" className="qe-btn" style={S.btn}
            onClick={guiDuyet} disabled={!!dangChay} title="Lưu rồi chuyển sang trạng thái chờ duyệt">
            {dangChay === 'gui' ? <Loader2 size={14} className="qe-spin" /> : <Send size={14} />} Gửi duyệt
          </button>
        )}
        {isAdmin && tt === 'wait' && (
          <button type="button" className="qe-btn" style={S.btn}
            onClick={traLai} disabled={!!dangChay || chuaLuu}
            title={chuaLuu ? CANH_BAO_CHUA_LUU : 'Trả bản này về nháp kèm lý do'}>
            {dangChay === 'tra' ? <Loader2 size={14} className="qe-spin" /> : <RotateCcw size={14} />} Trả lại
          </button>
        )}
        {isAdmin && (
          <button type="button" className="qe-btn"
            style={{ ...S.btn, ...S.btnChinh, background: mau, boxShadow: `0 2px 10px ${mau}66` }}
            onClick={banHanh} disabled={!banHanhDuoc || !!dangChay} title={lyDoKhoaBanHanh}>
            {dangChay === 'ban' ? <Loader2 size={14} className="qe-spin" /> : <BadgeCheck size={14} />} Ban hành
          </button>
        )}
      </div>

      {/* ── Lỗi / cảnh báo ──────────────────────────────────────── */}
      {(loi.length > 0 || canhBao.length > 0 || banKhoa) && (
        <div className="qe-loibar">
          {banKhoa && (
            <div style={{ ...S.loiDong, color: C.chu2, background: C.mat2, borderColor: C.vien2, cursor: 'default' }}>
              {api.lyDoKhoaNoiDung(tt, ttNhan.ten)}
              {/* Cách gỡ đặt NGAY CẠNH lời giải thích: dòng này là chỗ duy nhất
                  người dùng đọc được vì sao màn hình khoá, nên nút mở khoá phải
                  ở đây chứ không nằm lẫn trong thanh công cụ phía trên. */}
              {taoBanMoiDuoc && (
                <button type="button" className="qe-btn"
                  style={{ ...S.btn, ...S.btnNho, marginLeft: 4 }}
                  onClick={taoPhienBanMoi} disabled={!!dangChay}
                  title="Chép lưu đồ và tài liệu của bản này sang một bản nháp mới để sửa">
                  {dangChay === 'pbmoi'
                    ? <Loader2 size={13} className="qe-spin" />
                    : <CopyPlus size={13} />} Tạo phiên bản mới
                </button>
              )}
            </div>
          )}
          {loi.map((l, i) => (
            <button key={`l${i}`} type="button"
              style={{ ...S.loiDong, cursor: l.khoiId ? 'pointer' : 'default' }}
              onClick={() => nhayToi(l.khoiId)}
              title={l.khoiId ? 'Bấm để nhảy tới khối này' : undefined}>
              <span style={S.loiCham} />{l.thongDiep}
            </button>
          ))}
          {canhBao.map((l, i) => (
            <button key={`c${i}`} type="button"
              style={{ ...S.loiDong, ...S.canhBaoDong, cursor: l.khoiId ? 'pointer' : 'default' }}
              onClick={() => nhayToi(l.khoiId)}
              title={l.khoiId ? 'Bấm để nhảy tới khối này' : undefined}>
              <span style={{ ...S.loiCham, background: '#d97706' }} />{l.thongDiep}
            </button>
          ))}
        </div>
      )}

      <div className="qe-ed">
        {/* ── Bảng khối hình bên trái ───────────────────────────── */}
        <aside className="qe-palette">
          <h3 style={S.h3}>Cách vẽ</h3>
          <div style={{ ...S.hint, borderLeft: `3px solid ${mau}` }}>
            Bấm một khối → hiện nút <b style={{ color: mau }}>＋</b> ngay dưới nó → chọn loại khối và cột.
            <br /><br />
            Bước mới <b>tự đặt đúng chỗ và tự nối</b> vào khối cũ. Không phải kéo, không phải canh hàng.
            <br /><br />
            Khối <b>Quyết định</b> có hai nút ＋: nhánh <b style={{ color: C.xanh }}>OK</b> đi xuống,
            nhánh <b style={{ color: C.do }}>NG</b> rẽ trái.
            <br /><br />
            Kéo khối tới gần ngang hàng một khối khác thì nó <b>tự hút cho bằng hàng</b>,
            kèm một <b style={{ color: mau }}>vạch gióng nét đứt</b> chạy suốt trang.
            <br /><br />
            <b>Số ở góc khối</b> là số thứ tự bước. Bấm vào nó rồi gõ số khác ở ô
            <b> Số thứ tự bước</b> bên phải — bước đang giữ số đó tự dồn theo, khối không xê dịch.
          </div>

          <h3 style={{ ...S.h3, marginTop: 18 }}>Thêm khối rời</h3>
          {Object.entries(LOAI_KHOI).map(([k, T]) => (
            <button key={k} type="button" className="qe-shp" disabled={!coSua}
              onClick={() => {
                const goc = khoiChon || soDo.nodes[0];
                if (!goc) { alert('Lưu đồ chưa có khối nào để đặt khối rời cạnh.'); return; }
                try {
                  const s = themKhoiRoi(soDo, k, goc.id, goc.lane);
                  doiSoDo(s);
                  setChon({ loai: 'node', id: s.idMoi });
                  toast(`Đã thêm khối ${T.nhan} chưa nối. Dùng Nối hoặc kéo vào đúng cột.`);
                } catch (e) { alert(e?.message || 'Không thêm được khối.'); }
              }}>
              <span style={S.shpG}>
                <i style={{ ...S.shpI, background: T.mau, ...HINH_NHO[k] }} />
              </span>
              {T.nhan}
            </button>
          ))}
          <div style={S.hint}>
            Chỉ dùng khi cần một khối <b>không nối tiếp</b> khối nào. Bình thường hãy dùng nút <b>＋</b>.
          </div>

          <h3 style={{ ...S.h3, marginTop: 18 }}>Vòng lặp quay lại</h3>
          <div style={S.hint}>
            Dùng cho mũi tên <b>quay ngược lên</b> (làm lại, hàng NG) — thứ nút ＋ không tạo được.
            Hai cách, kết quả giống hệt nhau:
            <br /><br />
            <b>Kéo:</b> bấm khối nguồn → giữ chuột ở núm tròn
            <b style={{ color: mau }}> ⤳</b> cạnh phải khối → kéo sang khối đích rồi thả.
            Đường đứt nét chạy theo con trỏ cho thấy đang nối tới đâu.
            <br /><br />
            <b>Bấm:</b> bấm <b>Nối</b> trên thanh công cụ → bấm khối nguồn → bấm khối đích.
            <br /><br />
            Thả ra chỗ trống thì <b>không tạo gì</b>. Một khối không nối được vào chính nó.
          </div>

          <h3 style={{ ...S.h3, marginTop: 18 }}>Đường nối chồng nhau</h3>
          <div style={S.hint}>
            Hai đường bẻ trúng cùng một độ cao thì vẽ đè lên nhau, bản in không đọc được.
            <br /><br />
            Bấm vào <b>đường nối</b> → hiện một <b style={{ color: mau }}>núm tròn</b> ngay
            chỗ bẻ → kéo núm đó ra cho hai đường tách nhau. Núm ngang thì kéo
            <b> lên/xuống</b>, núm dọc thì kéo <b>trái/phải</b>.
            <br /><br />
            Đường <b>thẳng tuột</b> không có chỗ bẻ nên không có núm — chuyện đó bình thường.
            <br /><br />
            Chỗ bẻ nhớ theo <b>khoảng lệch</b> chứ không phải toạ độ, nên kéo khối đi thì nó
            vẫn bám theo. Muốn bỏ: bấm <b>Đưa về tự động</b> ở bảng bên phải.
          </div>

          <h3 style={{ ...S.h3, marginTop: 18 }}>Ghim điểm nối</h3>
          <div style={S.hint}>
            Bấm <b>đường nối</b> → hiện <b style={{ color: mau }}>4 chấm</b> ở giữa mỗi cạnh khối
            đầu và khối cuối → bấm một chấm để ghim đường vào đúng cạnh đó, bấm lại chấm đang
            ghim để bỏ. Đường <b>đã ghim thôi tự lách</b> khối chắn.
          </div>

          <h3 style={{ ...S.h3, marginTop: 18 }}>Kéo nhãn OK / NG</h3>
          <div style={S.hint}>
            Bấm <b>đường nối</b> → kéo <b style={{ color: mau }}>khung nét đứt</b> quanh nhãn
            để trượt nhãn dọc theo đường; trả về chỗ cũ bằng nút <b>Đưa nhãn về giữa</b> bên phải.
          </div>

          <h3 style={{ ...S.h3, marginTop: 18 }}>Sửa cột và hàng</h3>
          <div style={S.hint}>
            Bấm <b>tên cột</b> để đổi tên bộ phận; bấm <b>nhãn Bước N</b> ở cột trái để
            xem và <b>xoá</b> hàng đó. Số bước đánh <b>tự động</b> theo hàng, không đặt tên được.
            <br /><br />
            Chỉ xoá được cột/hàng <b>đang trống</b>. Còn khối thì phải chuyển đi trước —
            đổi cột là đổi người thực hiện, máy không quyết hộ.
            <br /><br />
            <b>Đổi chỗ cột:</b> kéo ngang <b>tên cột</b>, hoặc dùng
            <b style={{ color: mau }}> ◀ Chuyển trái</b> /
            <b style={{ color: mau }}> Chuyển phải ▶</b> ở bảng bên phải. Khối đi theo cột
            của mình nên <b>bộ phận phụ trách không đổi</b>.
          </div>

          <h3 style={{ ...S.h3, marginTop: 18 }}>Phím tắt</h3>
          <div style={S.hint}>
            <kbd style={S.kbd}>Del</kbd> xoá phần đang chọn<br />
            <kbd style={S.kbd}>Ctrl</kbd>+<kbd style={S.kbd}>Z</kbd> hoàn tác<br />
            <kbd style={S.kbd}>Esc</kbd> bỏ chọn / đóng bảng chọn / huỷ đường đang kéo<br />
            Kéo khối sang cột khác → <b>người thực hiện tự đổi theo cột</b>.
          </div>
        </aside>

        {/* ── Canvas ────────────────────────────────────────────── */}
        <div className="qe-cvscroll" ref={cvRef}>
          <div style={{
            transformOrigin: '0 0', transform: `scale(${zoom})`, padding: 20,
            width: (W + 40) * zoom, height: (H + 40) * zoom,
          }}>
            <div className="qe-cv" data-noi={cheDo === 'noi' ? '1' : undefined}
              style={{ width: W, height: H }}
              onPointerDown={(ev) => {
                if (ev.target === ev.currentTarget) { setChon(null); setNguonNoi(null); }
              }}>

              <div className="qe-guthead" style={{ width: GUT }}>Bước</div>

              {/* Tên cột: bấm để chọn, KÉO NGANG để đổi chỗ cột. Cột đang kéo mờ
                  đi, cột đích viền nét đứt — thêm một dải phủ suốt chiều cao cột
                  đích ở trong khung giấy, để thấy rõ cột sẽ đậu vào đâu. */}
              {lanes.map((l, i) => (
                <div key={`lh${i}`} className="qe-lanehead"
                  data-sel={chon?.loai === 'lane' && chon.id === i ? '1' : undefined}
                  data-keo={keoCot?.tu === i ? '1' : undefined}
                  data-dich={keoCot && keoCot.den === i && keoCot.den !== keoCot.tu ? '1' : undefined}
                  style={{
                    left: GUT + laneX(i), width: LANE_W, color: l.color || C.xam,
                    background: `${l.color || C.xam}14`,
                    cursor: coSua && lanes.length > 1 ? (keoCot ? 'grabbing' : 'grab') : 'pointer',
                  }}
                  onPointerDown={(ev) => nenCot(ev, i)}
                  onPointerMove={dichCot}
                  onPointerUp={thaCot}
                  onPointerCancel={huyCot}
                  title={coSua && lanes.length > 1
                    ? `${l.name} — ${l.owner || '—'}\nKéo ngang để đổi chỗ cột. `
                      + 'Khối trong cột đi theo cột, bộ phận phụ trách không đổi.'
                    : `${l.name} — ${l.owner || '—'}`}>
                  {l.name}
                </div>
              ))}

              {/* Cột BƯỚC: một ô mỗi hàng, số đánh tự động. Mốc hàng lấy nguyên
                  từ daiBuoc — cùng danh sách với dải nền trong khung giấy, nên
                  nhãn không thể lệch khỏi hàng nó đang gọi tên. */}
              {dai.map((d, i) => (
                <div key={`hg${i}`} className="qe-hanglbl"
                  data-sel={chon?.loai === 'hang' && chon.id === i ? '1' : undefined}
                  style={{ top: HEAD_H + d.y1, height: d.y2 - d.y1, width: GUT }}
                  onPointerDown={(ev) => { ev.stopPropagation(); setChon({ loai: 'hang', id: i }); }}
                  title={`Bước ${i + 1} — ${d.ids.length} khối`}>
                  Bước {i + 1}
                </div>
              ))}

              <div ref={giayRef} style={{
                position: 'absolute', left: GUT, top: HEAD_H,
                width: drawW(soDoHien), height: drawH(soDoHien),
              }}>
                {/* ── DẢI BƯỚC: hàng đều, mỗi hàng cao đúng CAO_HANG ──
                    Lớp ĐẦU TIÊN trong khung giấy nên nằm dưới cùng — dưới cột,
                    dưới đường nối và khối. Cả lớp KHÔNG ăn chuột nên khối và
                    đường nối bên trên bấm, kéo y như cũ. Nền so le tô rất nhạt
                    và nằm DƯỚI nền cột, nên nền cột (đậm hơn) vẫn đọc trước. */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
                  {dai.map((d, i) => (
                    <div key={`db${i}`} style={{
                      position: 'absolute', left: 0, right: 0,
                      top: d.y1, height: d.y2 - d.y1,
                      background: i % 2 ? MAU_DAI.nen : 'transparent',
                      borderTop: i ? `1px solid ${MAU_DAI.vach}` : undefined,
                    }} />
                  ))}
                </div>

                {lanes.map((l, i) => (
                  <div key={`lb${i}`} style={{
                    position: 'absolute', top: 0, bottom: 0, left: laneX(i), width: LANE_W,
                    borderLeft: `1px solid ${C.giayVien}`,
                    background: i % 2 ? 'rgba(148,163,184,.045)' : 'transparent',
                  }} />
                ))}
                {/* CHỖ CỘT SẼ ĐẬU khi đang kéo tên cột. Phủ suốt chiều cao cột đích
                    nên nhìn một cái là biết cả cột sẽ nằm ở đâu, chứ không phải đoán
                    theo một vạch mảnh trên hàng tiêu đề. Không ăn chuột và chỉ tồn
                    tại trong lúc kéo, nên không cử chỉ nào bị nó chắn. */}
                {keoCot && keoCot.den !== keoCot.tu && (
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: laneX(keoCot.den), width: LANE_W,
                    background: `${mau}14`, border: `2px dashed ${mau}`, borderRadius: 6,
                    pointerEvents: 'none', zIndex: 7,
                  }} />
                )}

                {/* Đường nối — d LUÔN lấy từ routeEdge, không tự vẽ */}
                <svg className="qe-edges" width={drawW(soDoHien)} height={drawH(soDoHien)}>
                  <defs>
                    {Object.entries(MAU_DUONG).map(([k, c]) => (
                      <marker key={k} id={`qe-ar-${k}`} viewBox="0 0 10 10" refX="9" refY="5"
                        markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
                        <path d="M0 0L10 5L0 10z" fill={c} />
                      </marker>
                    ))}
                    <marker id="qe-ar-keo" viewBox="0 0 10 10" refX="9" refY="5"
                      markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
                      <path d="M0 0L10 5L0 10z" fill={mau} />
                    </marker>
                  </defs>
                  {(soDoHien.edges || []).map((e) => {
                    const r = routeEdge(soDoHien, e, giaoNoi);
                    if (!r) return null;    // đầu hoặc cuối đã bị xoá — bỏ qua, không vẽ
                    const k = e.k || 'n';
                    const c = MAU_DUONG[k] || MAU_DUONG.n;
                    const daChon = chon?.loai === 'edge' && chon.id === e.id;
                    return (
                      <g key={e.id}>
                        <path d={r.d} fill="none" stroke={c} strokeLinejoin="round" strokeLinecap="round"
                          strokeWidth={daChon ? 3 : 1.7}
                          strokeDasharray={k === 'ng' ? '6 4' : undefined}
                          markerEnd={`url(#qe-ar-${k})`} />
                        <path d={r.d} fill="none" stroke="transparent" strokeWidth={14}
                          style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                          onPointerDown={(ev) => { ev.stopPropagation(); setChon({ loai: 'edge', id: e.id }); }} />
                        {e.lbl && (
                          <text x={r.nhan[0]} y={r.nhan[1]} fill={c}
                            fontSize={10.5} fontWeight={700} textAnchor="middle"
                            dominantBaseline="middle" paintOrder="stroke"
                            stroke="#fff" strokeWidth={4} strokeLinejoin="round">{e.lbl}</text>
                        )}
                      </g>
                    );
                  })}

                  {/* Đường nối đang kéo — chỉ là hình vẽ tạm, chưa có trong sơ đồ */}
                  {neoKeoNoi && (
                    <g pointerEvents="none">
                      <line x1={neoKeoNoi.cx} y1={neoKeoNoi.cy} x2={noiKeo.x} y2={noiKeo.y}
                        stroke={mau} strokeWidth={2} strokeDasharray="7 5" strokeLinecap="round"
                        markerEnd="url(#qe-ar-keo)" />
                      <circle cx={neoKeoNoi.cx} cy={neoKeoNoi.cy} r={4} fill={mau} />
                    </g>
                  )}
                </svg>

                {/* Khối */}
                {(soDoHien.nodes || []).map((n) => {
                  const T = LOAI_KHOI[n.t] || LOAI_KHOI.step;
                  const c = n.color || T.mau;
                  const so = thuTu.indexOf(n.id) + 1;
                  const daChon = chon?.loai === 'node' && chon.id === n.id;
                  const laDauNoi = nguonNoi === n.id;
                  // Núm ＋ và núm nối chỉ mọc trên khối ĐANG CHỌN. Khối Kết thúc
                  // không có núm nào: nó là điểm cuối, không có bước sau và cũng
                  // không có đường ra. (Cần một ngoại lệ thật thì vẫn còn chế độ Nối.)
                  const hienNum = coSua && daChon && cheDo === 'chon' && n.t !== 'end';
                  return (
                    <div key={n.id} className="qe-node" data-node={n.id} data-t={n.t}
                      data-sel={daChon ? '1' : undefined} data-src={laDauNoi ? '1' : undefined}
                      style={{
                        left: nodeX(n), top: n.y, width: n.w, height: n.h,
                        cursor: cheDo === 'noi' ? 'crosshair' : coSua ? 'grab' : 'pointer',
                      }}
                      onPointerDown={(ev) => nenKhoi(ev, n)}
                      onPointerMove={dichKhoi}
                      onPointerUp={thaKhoi}
                      onPointerCancel={thaKhoi}>
                      <div className="qe-shape" style={{ background: laDauNoi ? mau : c }}>
                        <div className="qe-shapein"><span className="qe-tx">{n.tx}</span></div>
                      </div>
                      {/* Huy hiệu SỐ BƯỚC. Trên khối ĐANG CHỌN nó là cái nút dẫn tới ô
                          "Số thứ tự bước" bên phải — đúng chỗ người dùng chỉ tay vào khi
                          hỏi cách đổi số. Nút nằm TRONG khối nên phải chặn pointerdown y
                          như núm ＋ và núm ⤳, nếu không bấm số một cái là khối bắt đầu bị kéo. */}
                      {n.t !== 'start' && n.t !== 'end' && so > 0 && (
                        daChon && coSua ? (
                          <button type="button" className="qe-num"
                            style={{ background: c, fontFamily: MONO }}
                            title={`Bước ${so} — bấm để sửa số thứ tự ở bảng bên phải`}
                            onPointerDown={(ev) => ev.stopPropagation()}
                            onClick={(ev) => { ev.stopPropagation(); chinhSoBuoc(); }}>{so}</button>
                        ) : (
                          <span className="qe-num" style={{ background: c, fontFamily: MONO }}>{so}</span>
                        )
                      )}
                      {daChon && <span className="qe-selbox" style={{ borderColor: mau }} />}

                      {hienNum && (n.t === 'dec' ? (
                        <>
                          <button type="button" data-addh className="qe-addh qe-addh-down"
                            style={{ borderColor: C.xanh, color: C.xanh }}
                            title="Thêm bước cho nhánh OK"
                            onPointerDown={(ev) => ev.stopPropagation()}
                            onClick={(ev) => moPop(ev, n, 'ok')}>
                            ＋<b className="qe-addh-lbl" style={{ color: C.xanh }}>OK</b>
                          </button>
                          <button type="button" data-addh className="qe-addh qe-addh-left"
                            style={{ borderColor: C.do, color: C.do }}
                            title="Thêm bước cho nhánh NG"
                            onPointerDown={(ev) => ev.stopPropagation()}
                            onClick={(ev) => moPop(ev, n, 'ng')}>
                            ＋<b className="qe-addh-lbl" style={{ color: C.do }}>NG</b>
                          </button>
                        </>
                      ) : (
                        <button type="button" data-addh className="qe-addh qe-addh-down"
                          style={{ borderColor: mau, color: mau }}
                          title="Thêm bước tiếp theo"
                          onPointerDown={(ev) => ev.stopPropagation()}
                          onClick={(ev) => moPop(ev, n, '')}>＋</button>
                      ))}

                      {hienNum && (
                        <button type="button" className="qe-addh qe-noih"
                          style={{ borderColor: mau, color: mau }}
                          aria-label="Kéo sang khối khác để nối"
                          title="Kéo từ đây thả vào khối khác để tạo đường nối — dùng cả cho mũi tên quay ngược (làm lại, NG)"
                          onPointerDown={(ev) => nenNoi(ev, n)}
                          onPointerMove={dichNoi}
                          onPointerUp={thaNoi}
                          onPointerCancel={huyNoi}>
                          <Spline size={12} strokeWidth={2.6} />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* ── LỚP PHỦ TRÊN CÙNG: đường gióng ngang hàng + núm chỗ bẻ ──
                    LỚP PHỦ RIÊNG, đặt SAU lớp khối và z-index cao hơn núm ＋/⤳.
                    Để trong <svg> đường nối thì khối (vẽ sau) đè lên mất: lưu đồ
                    càng dày thì càng dễ có khối nằm đúng chỗ bẻ — mà dày chính là
                    lúc người dùng cần tách đường nhất. Núm phải với tới được ở
                    đúng lúc đó. Đường gióng cũng vậy: nó phải nhìn thấy được ĐÈ
                    LÊN khối đang kéo, nếu không thì đúng lúc cần nhất lại bị che.
                    Cả lớp phủ pointer-events:none nên KHÔNG chắn chuột của khối
                    bên dưới; chỉ riêng cái núm bật lại pointer-events.
                    Nằm chung khung giấy với lớp khối nên cùng hệ toạ độ — không
                    phải trừ GUT/HEAD_H hay tính lại điểm nào.
                    Núm chỗ bẻ chỉ hiện khi ĐANG CHỌN một đường; đường thẳng tuột
                    thì routeEdge trả keo = null nên không có núm. Đường gióng chỉ
                    hiện khi đang kéo khối VÀ nam châm đang bắt. */}
                {coSua && (mocGiong != null || numLech || noiChon) && (
                  <svg className="qe-lechlop" data-lech={numLech ? numLech.huong : undefined}
                    width={drawW(soDoHien)} height={drawH(soDoHien)}>

                    {/* Đường gióng: vạch mảnh nét đứt chạy SUỐT bề ngang trang, không
                        đầu mũi tên. Đường nối thì luôn đi từ khối này tới khối kia và
                        có mũi tên — nhìn một cái là biết vạch này không phải đường nối,
                        chỉ là cái thước tạm. */}
                    {mocGiong != null && (
                      <line x1={0} y1={mocGiong} x2={drawW(soDoHien)} y2={mocGiong}
                        stroke={mau} strokeWidth={1.3} strokeDasharray="4 5" opacity={0.95} />
                    )}

                    {/* ── KHUNG KÉO NHÃN OK / NG ──
                        Vẽ ĐẦU TIÊN trong ba thứ bắt chuột của lớp phủ nên nằm
                        DƯỚI bốn chấm ghim và núm chỗ bẻ: hai cử chỉ cũ giữ
                        nguyên từng pixel vùng bấm, còn khung nhãn thì to hơn
                        hẳn nên chỗ trùng vẫn còn viền mà bắt. Chỉ mọc khi đường
                        THẬT SỰ có nhãn — kéo một khung rỗng thì kéo cái gì.
                        Toạ độ lấy nguyên từ routeEdge (r.nhan), không tự tính. */}
                    {noiChon?.lbl && noiChon.nhan && (
                      <g transform={`translate(${noiChon.nhan[0]} ${noiChon.nhan[1]})`}>
                        <rect x={-NHAN_W / 2} y={-NHAN_H / 2} width={NHAN_W} height={NHAN_H} rx={7}
                          fill="transparent" stroke={mau} strokeWidth={1.2}
                          strokeDasharray="3 3" opacity={0.8}
                          style={{ pointerEvents: 'all', touchAction: 'none', cursor: 'move' }}
                          onPointerDown={nenNhan}
                          onPointerMove={dichNhan}
                          onPointerUp={thaNhan}
                          onPointerCancel={huyNhan}>
                          <title>
                            {`Kéo để trượt nhãn “${noiChon.lbl}” dọc theo đường nối — `}
                            đưa nó về gần khối cần chú thích. Trả về giữa: nút “Đưa nhãn về giữa”
                            ở bảng bên phải.
                          </title>
                        </rect>
                      </g>
                    )}

                    {/* ── BỐN CHẤM GHIM ĐIỂM NỐI (kiểu Visio) ──
                        Ở giữa mỗi cạnh khối ĐẦU và khối CUỐI của đường đang chọn.
                        Bấm một chấm là ghim đầu đường vào đúng cạnh ấy; bấm lại
                        chấm đang ghim là bỏ ghim. Chấm ĐANG CÓ HIỆU LỰC tô đặc
                        (kể cả khi đường còn tự động — routeEdge cho biết nó đang
                        ra/vào cạnh nào), chấm ĐÃ GHIM thêm một vòng ngoài.
                        Toạ độ lấy nguyên từ diemNeo, không tự tính điểm nào.
                        Vẽ TRƯỚC núm chỗ bẻ để núm ấy nằm trên: núm là cử chỉ kéo,
                        bị một cái chấm nuốt mất thì khó chịu hơn là ngược lại. */}
                    {noiChon && noiChon.dau.flatMap(dau => CANH_NEO.map((canh) => {
                      const [x, y] = diemNeo(dau.r, canh).p;
                      const daGhim = dau.ghim === canh;
                      const dangDung = dau.dang === canh;
                      const dauTen = dau.khoa === 'raA' ? 'đầu ra' : 'đầu vào';
                      return (
                        <g key={`${dau.khoa}-${canh}`}>
                          {daGhim && (
                            <circle cx={x} cy={y} r={8.5} fill="none"
                              stroke={mau} strokeWidth={1.4} opacity={0.5} />
                          )}
                          <circle cx={x} cy={y} r={dangDung ? 5 : 4.2}
                            fill={dangDung ? mau : '#fff'} stroke={dangDung ? '#fff' : mau}
                            strokeWidth={dangDung ? 1.6 : 1.8}
                            style={{ pointerEvents: 'all', touchAction: 'none', cursor: 'pointer' }}
                            onPointerDown={(ev) => ghimNeo(ev, dau.khoa, canh)}>
                            <title>
                              {daGhim
                                ? `Đang ghim ${dauTen} ở ${TEN_CANH[canh]} khối “${dau.ten}”. `
                                  + 'Bấm lần nữa để bỏ ghim, trả đường về tự động.'
                                : `Ghim ${dauTen} vào ${TEN_CANH[canh]} khối “${dau.ten}”. `
                                  + 'Đường đã ghim không tự lách khối chắn nữa.'}
                            </title>
                          </circle>
                        </g>
                      );
                    }))}

                    {numLech && (
                      <>
                        <line
                          x1={numLech.tu[0]} y1={numLech.tu[1]}
                          x2={numLech.den[0]} y2={numLech.den[1]}
                          stroke={mau} strokeWidth={2.4} strokeLinecap="round" opacity={0.35} />
                        {/* Dời cả nhóm tới chỗ routeEdge chỉ, rồi vẽ núm quanh gốc 0,0:
                            hai gạch chỉ hướng kéo là hằng số, không phải phép tính. */}
                        <g transform={`translate(${numLech.x} ${numLech.y})`}>
                          <circle r={9.5} fill="#fff" stroke={mau} strokeWidth={2}
                            style={{
                              pointerEvents: 'all', touchAction: 'none',
                              cursor: numLech.huong === 'doc' ? 'ew-resize' : 'ns-resize',
                            }}
                            onPointerDown={(ev) => nenLech(ev, numLech.huong)}
                            onPointerMove={dichLech}
                            onPointerUp={thaLech}
                            onPointerCancel={huyLech}>
                            <title>
                              {numLech.huong === 'doc'
                                ? 'Kéo trái/phải để dời nhánh dọc — tách đường này khỏi đường đang chồng lên nó'
                                : 'Kéo lên/xuống để dời chỗ bẻ — tách đường này khỏi đường đang chồng lên nó'}
                            </title>
                          </circle>
                          <path
                            d={numLech.huong === 'doc'
                              ? 'M-3 -4V4M3 -4V4'
                              : 'M-4 -3H4M-4 3H4'}
                            stroke={mau} strokeWidth={1.6} strokeLinecap="round" />
                        </g>
                      </>
                    )}
                  </svg>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Bảng thuộc tính bên phải ──────────────────────────── */}
        <aside className="qe-insp">
          {khoiChon ? (
            <KhoiInsp key={khoiChon.id} n={khoiChon} soDo={soDo} doiSoDo={doiSoDo}
              coSua={coSua} mau={mau} toast={toast} />
          ) : canhChon ? (
            <CanhInsp key={canhChon.id} e={canhChon} soDo={soDo} doiSoDo={doiSoDo}
              coSua={coSua} onXoa={() => { doiSoDo(boCanh(soDo, canhChon.id)); setChon(null); toast('Đã xoá đường nối.'); }} />
          ) : chon?.loai === 'lane' && lanes[chon.id] ? (
            <CotInsp key={`lane${chon.id}`} i={chon.id} l={lanes[chon.id]} soDo={soDo}
              doiSoDo={doiSoDo} coSua={coSua} onXoa={() => xoaCotTai(chon.id)}
              onChuyen={den => chuyenCotTai(chon.id, den)} />
          ) : chon?.loai === 'hang' && dai[chon.id] ? (
            <HangInsp key={`hg${chon.id}`} i={chon.id} d={dai[chon.id]} soHang={dai.length}
              coSua={coSua} onXoa={() => xoaHangTai(chon.id)} />
          ) : (
            <Rong
              tieuDe="Chưa chọn gì trên lưu đồ."
              phu="Bấm một khối để sửa tên, người thực hiện, diễn giải và biểu mẫu đi kèm. Bấm tên cột để đổi bộ phận." />
          )}
        </aside>
      </div>

      {/* ── Bảng chọn của nút ＋ ─────────────────────────────────── */}
      {pop && (
        <div data-pop style={{ ...S.pop, left: Math.max(8, Math.min(pop.x - 126, window.innerWidth - 260)), top: pop.y }}
          role="dialog" aria-label="Thêm bước tiếp theo">
          <h4 style={S.popH}>
            {pop.nhanh === 'ok' ? 'Thêm bước cho nhánh OK'
              : pop.nhanh === 'ng' ? 'Thêm bước cho nhánh NG' : 'Thêm bước tiếp theo'}
          </h4>
          <p style={S.popFrom}>Nối tiếp từ <b>{pop.tuTen}</b></p>

          <div style={S.fld}>
            <label htmlFor="qe-pop-ten" style={S.lbl}>Tên bước</label>
            <input id="qe-pop-ten" type="text" style={S.inp} autoFocus value={pop.ten}
              placeholder="VD: Kiểm tra kích thước vỏ máy"
              onChange={e => setPop(p => ({ ...p, ten: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); themTuPop(); }
                if (e.key === 'Escape') { e.preventDefault(); setPop(null); }
              }} />
          </div>

          <div style={S.fld}>
            <span style={S.lbl}>Loại khối</span>
            <div style={S.kinds}>
              {LOAI_POP.map(k => {
                const T = LOAI_KHOI[k];
                const on = pop.loai === k;
                return (
                  <button key={k} type="button" onClick={() => setPop(p => ({ ...p, loai: k }))}
                    style={{
                      ...S.kindBtn,
                      borderColor: on ? T.mau : C.vien,
                      color: on ? T.mau : C.chu3,
                      background: on ? T.mau + '1f' : C.nen,
                    }}>
                    <span style={{ ...S.kindI, background: T.mau, ...HINH_NHO[k] }} />
                    {T.nhan}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={S.fld}>
            <label htmlFor="qe-pop-cot" style={S.lbl}>Cột — bộ phận làm bước này</label>
            <select id="qe-pop-cot" style={S.inp} value={pop.cot}
              onChange={e => setPop(p => ({ ...p, cot: Number(e.target.value) }))}>
              {lanes.map((l, i) => (
                // Nhánh NG là mũi tên RẼ NGANG, chỉ có nghĩa khi sang cột khác.
                // themBuoc có xử lý an toàn cho trường hợp cùng cột (rơi xuống dưới),
                // nhưng người dùng chọn "rẽ ngang" mà được một bước đi xuống thì khó
                // hiểu — chặn ở chỗ chọn rõ ràng hơn là im lặng đổi ý họ.
                pop.nhanh === 'ng' && i === pop.laneNguon
                  ? null
                  : <option key={i} value={i}>{l.name}</option>
              ))}
            </select>
            {pop.nhanh === 'ng' && (
              <p style={S.note}>
                Nhánh NG rẽ ngang sang cột khác, nên cột <b>{lanes[pop.laneNguon]?.name}</b> không
                nằm trong danh sách.
              </p>
            )}
          </div>

          <div style={S.popRow}>
            <button type="button" className="qe-btn" style={{ ...S.btn, ...S.btnNho }}
              onClick={() => setPop(null)}>Huỷ</button>
            <button type="button" className="qe-btn"
              style={{ ...S.btn, ...S.btnNho, ...S.btnChinh, background: mau }}
              onClick={themTuPop}>Thêm bước</button>
          </div>
        </div>
      )}

      {/* ── Thông báo ───────────────────────────────────────────── */}
      <div style={S.toasts}>
        {toasts.map(t => <div key={t.id} style={S.toast}>{t.noiDung}</div>)}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   BẢNG THUỘC TÍNH
   ══════════════════════════════════════════════════════════════ */

function KhoiInsp({ n, soDo, doiSoDo, coSua, mau, toast }) {
  const T = LOAI_KHOI[n.t] || LOAI_KHOI.step;
  const l = soDo.lanes[n.lane] || {};
  const va = (k, v) => doiSoDo(vaKhoi(soDo, n.id, { [k]: v }));

  // Số bước đọc từ thuTuBuoc — CÙNG một hàm mà bảng diễn giải và bản in dùng,
  // nên ba chỗ không bao giờ nói ba số khác nhau. Bắt đầu/Kết thúc không mang số.
  const ds = thuTuBuoc(soDo);
  const so = ds.indexOf(n.id) + 1;
  const coSo = so > 0;
  const dangDanhTay = Array.isArray(soDo.thuTu) && soDo.thuTu.length > 0;

  // Gõ rác rồi rời ô thì ô phải trả về con số THẬT. datThuTu từ chối giá trị
  // hỏng nên sơ đồ không đổi, mà ô lại đang giữ thứ người dùng vừa gõ — dựng
  // lại ô sau mỗi lần ghi là cách rẻ nhất để hai bên khớp nhau.
  const [lanNhap, setLanNhap] = useState(0);

  const datSo = (v) => {
    setLanNhap(k => k + 1);
    const tx = String(v ?? '').trim();
    if (!tx) return;                       // xoá trắng ô rồi đi chỗ khác = không đổi gì
    const s = datThuTu(soDo, n.id, Number(tx));
    if (s === soDo) return;                // số hỏng, hoặc bước đã đứng đúng chỗ đó
    doiSoDo(s);
    toast(`“${n.tx}” thành bước ${thuTuBuoc(s).indexOf(n.id) + 1}. Các bước khác dồn theo — `
      + 'khối trên trang không xê dịch.');
  };

  return (
    <>
      <h3 style={S.h3}>Thuộc tính bước</h3>
      <p style={S.kind}>
        {T.nhan} · cột <b style={{ color: l.color || C.chu2 }}>{l.name || '—'}</b>
      </p>

      <ONhap id="qe-f-tx" nhan="Tên bước" giaTri={n.tx} doc={!coSua}
        key={`tx${n.tx}`} onLuu={v => va('tx', v.trim() || 'Bước mới')} />

      {/* SỐ THỨ TỰ BƯỚC — mặc định suy từ chỗ khối đứng, sửa được bằng tay.
          Bắt đầu/Kết thúc không có số nên cũng không có ô này. */}
      {coSo && (
        <ONhap id={ID_STT} nhan="Số thứ tự bước" kieu="number" giaTri={String(so)}
          doc={!coSua} key={`stt${so}-${lanNhap}`} them={{ min: 1, max: ds.length, step: 1 }}
          onLuu={datSo}
          ghiChu={`Đang là bước ${so} trong ${ds.length}. Gõ số khác rồi rời ô: bước đang giữ `
            + 'số đó dồn theo một bậc, còn khối trên trang không xê dịch.'} />
      )}

      {/* Chỉ hiện khi ĐÃ đánh số tay — chưa đánh thì không có gì để trả về, mà
          mời người dùng bấm một nút không làm gì là mời họ đi tìm xem nó hỏng ở đâu.
          Điều kiện đặt trên khoá ĐÃ LỌC (mảng, còn phần tử) y như nút bỏ ghim
          của đường nối: khoá rác trong so_do vốn đã bị coi như không có. */}
      {coSua && coSo && dangDanhTay && (
        <div style={S.fld}>
          <button type="button" className="qe-btn" style={{ ...S.btn, ...S.btnNho }}
            onClick={() => {
              doiSoDo(boThuTu(soDo));
              toast('Đã bỏ đánh số tay. Số bước chạy lại theo vị trí khối trên trang.');
            }}
            title="Bỏ thứ tự đánh tay của cả lưu đồ, đánh số lại theo chỗ khối đang đứng">
            Đánh số lại theo vị trí
          </button>
          <p style={S.note}>
            Lưu đồ này đang đánh số <b>bằng tay</b>. Bỏ đi thì số bước lại chạy theo vị trí:
            trên xuống dưới, trái sang phải.
          </p>
        </div>
      )}

      <div style={S.fld}>
        <label htmlFor="qe-f-lane" style={S.lbl}>Cột — bộ phận phụ trách</label>
        <select id="qe-f-lane" style={{ ...S.inp, ...(coSua ? null : S.inpDoc) }} disabled={!coSua}
          value={n.lane}
          onChange={(ev) => {
            const i = Number(ev.target.value);
            doiSoDo(doiCot(soDo, n.id, i));
            const m = soDo.lanes[i] || {};
            toast(`Đã chuyển sang cột ${m.name || '—'} — người thực hiện thành ${m.owner || '—'}.`);
          }}>
          {soDo.lanes.map((x, i) => <option key={i} value={i}>{x.name}</option>)}
        </select>
        <p style={S.note}>Đổi cột là đổi luôn người thực hiện trong bảng diễn giải.</p>
      </div>

      {/* Người thực hiện KHÔNG lưu ở khối — nó suy ra từ cột, một nguồn sự thật. */}
      <ONhap id="qe-f-who" nhan="Người thực hiện" giaTri={l.owner || ''} doc
        onLuu={() => {}} ghiChu="Lấy từ cột. Sửa ở phần thuộc tính cột." />

      <ONhap id="qe-f-desc" nhan="Diễn giải chi tiết" giaTri={n.desc} doc={!coSua} dong={4}
        key={`desc${n.desc}`} onLuu={v => va('desc', v)}
        goiY="Cách làm, tiêu chuẩn đạt và cách xử lý khi không đạt."
        ghiChu={rong(n.desc) && n.t !== 'start' && n.t !== 'end'
          ? 'Bỏ trống ô này là một LỖI chặn ban hành.' : undefined} />

      <ONhap id="qe-f-form" nhan="Hồ sơ / Biểu mẫu" giaTri={n.form} doc={!coSua}
        key={`form${n.form}`} onLuu={v => va('form', v)}
        goiY="Ngăn cách bằng dấu ·" ghiChu="VD: Phiếu QC · Nhật ký sản xuất" />

      <ONhap id="qe-f-time" nhan="Thời gian chuẩn" giaTri={n.time} doc={!coSua}
        key={`time${n.time}`} onLuu={v => va('time', v)} goiY="VD: 15 phút / lô" />

      <div style={S.fld}>
        <span style={S.lbl}>Màu khối</span>
        <div style={S.swatches}>
          {PAL.map(c => (
            <button key={c} type="button" disabled={!coSua} aria-label={`Màu ${c}`}
              onClick={() => va('color', c)}
              style={{
                ...S.swatch, background: c,
                borderColor: (n.color || T.mau) === c ? C.chu : 'transparent',
              }} />
          ))}
          <button type="button" disabled={!coSua} title="Trả về màu mặc định của loại khối"
            onClick={() => va('color', null)} style={{ ...S.swatch, ...S.swatchMd, color: mau }}>↺</button>
        </div>
      </div>
    </>
  );
}

function CanhInsp({ e, soDo, doiSoDo, coSua, onXoa }) {
  const a = timKhoi(soDo, e.a), b = timKhoi(soDo, e.b);
  return (
    <>
      <h3 style={S.h3}>Thuộc tính đường nối</h3>
      <p style={S.kind}>{a?.tx || 'Khối đã xoá'} → {b?.tx || 'Khối đã xoá'}</p>

      <ONhap id="qe-f-lbl" nhan="Nhãn trên đường" giaTri={e.lbl} doc={!coSua}
        key={`lbl${e.lbl}`} onLuu={v => doiSoDo(vaCanh(soDo, e.id, { lbl: v }))}
        goiY="VD: OK, NG, Đủ, Thiếu" />

      {/* Chỉ hiện khi nhãn ĐÃ bị kéo tay — không có gì để trả về thì không mời
          người dùng bấm. Điều kiện đặt trên chính khoá viTriNhan (CHƯA lọc rác)
          chứ không trên giá trị đã lọc: giá trị hỏng vẫn nằm trong bản lưu, và
          đây là chỗ duy nhất xoá hẳn nó ra được. */}
      {coSua && e.viTriNhan != null && (
        <div style={S.fld}>
          <button type="button" className="qe-btn" style={{ ...S.btn, ...S.btnNho }}
            onClick={() => doiSoDo(boKhoa(soDo, e.id, ['viTriNhan']))}
            title="Bỏ phần kéo tay, trả nhãn về giữa đoạn dài nhất của đường">
            Đưa nhãn về giữa
          </button>
          <p style={S.note}>
            {tiLeNhanHopLe(e.viTriNhan) !== null ? (
              <>
                Nhãn đang đậu ở <b>{Math.round(tiLeNhanHopLe(e.viTriNhan) * 100)}%</b> chiều dài
                đường. Số này là TỈ LỆ dọc đường, không phải toạ độ — kéo khối đi thì nhãn
                vẫn bám trên nét vẽ.
              </>
            ) : (
              <>
                Bản lưu đang có một vị trí nhãn <b>không hợp lệ</b> nên nhãn vẫn nằm ở giữa
                như thường. Bấm nút trên để xoá hẳn khoá đó khỏi bản lưu.
              </>
            )}
          </p>
        </div>
      )}

      <div style={S.fld}>
        <label htmlFor="qe-f-k" style={S.lbl}>Loại nhánh</label>
        <select id="qe-f-k" style={{ ...S.inp, ...(coSua ? null : S.inpDoc) }} disabled={!coSua}
          value={e.k || 'n'} onChange={ev => doiSoDo(vaCanh(soDo, e.id, { k: ev.target.value }))}>
          <option value="n">Thường (xám, nét liền)</option>
          <option value="ok">Nhánh OK (xanh, nét liền)</option>
          <option value="ng">Nhánh NG (đỏ, nét đứt)</option>
        </select>
        <p style={S.note}>Nhánh OK / NG được tô màu tương ứng ở bảng diễn giải và bản in.</p>
      </div>

      {/* Chỉ hiện khi đường ĐÃ bị kéo tay — không có gì để trả về thì không mời
          người dùng bấm. Điều kiện đặt trên chính khoá lech chứ không đặt trên
          "có chỗ bẻ hay không": kéo khối đi làm đường thành thẳng tuột thì lech
          cũ vẫn nằm đó, và đây là chỗ duy nhất gỡ được nó ra. */}
      {coSua && e.lech != null && e.lech !== 0 && (
        <div style={S.fld}>
          <button type="button" className="qe-btn" style={{ ...S.btn, ...S.btnNho }}
            onClick={() => doiSoDo(boLech(soDo, e.id))}
            title="Bỏ phần chỉnh tay, trả chỗ bẻ về chỗ máy tự tính">
            Đưa về tự động
          </button>
          <p style={S.note}>
            Chỗ bẻ đang được kéo tay lệch <b>{String(e.lech)}px</b> so với chỗ tự động.
            Số này là khoảng LỆCH, không phải toạ độ — kéo khối đi thì chỗ bẻ vẫn bám theo.
          </p>
        </div>
      )}

      {/* Chỉ hiện khi ĐÃ ghim ít nhất một đầu. Điều kiện đặt trên khoá đã lọc
          rác (neoHopLe) chứ không trên khoá thô: khoá hỏng trong so_do được coi
          như không ghim, nên không được mời người dùng đi bỏ một thứ không có. */}
      {coSua && (neoHopLe(e.raA) || neoHopLe(e.vaoB)) && (
        <div style={S.fld}>
          <button type="button" className="qe-btn" style={{ ...S.btn, ...S.btnNho }}
            onClick={() => doiSoDo(boKhoa(soDo, e.id, ['raA', 'vaoB']))}
            title="Bỏ điểm nối đã ghim ở cả hai đầu, để đường tự chọn cạnh như cũ">
            Bỏ ghim, để tự động
          </button>
          <p style={S.note}>
            Đang ghim đầu ra ở <b>{TEN_CANH[neoHopLe(e.raA)] || 'cạnh tự chọn'}</b> khối đầu,
            đầu vào ở <b>{TEN_CANH[neoHopLe(e.vaoB)] || 'cạnh tự chọn'}</b> khối cuối.
            Đường đã ghim <b>không tự lách</b> khối chắn nữa — lối đi là do bạn quyết.
          </p>
        </div>
      )}

      {coSua && (
        <button type="button" className="qe-btn" style={{ ...S.btn, ...S.btnNho, color: C.do }}
          onClick={onXoa}>Xoá đường nối này</button>
      )}
    </>
  );
}

function CotInsp({ i, l, soDo, doiSoDo, coSua, onXoa, onChuyen }) {
  const va = (k, v) => doiSoDo(vaCot(soDo, i, { [k]: v }));
  const dung = soDo.nodes.filter(n => n.lane === i).length;
  const soCot = soDo.lanes.length;
  return (
    <>
      <h3 style={S.h3}>Thuộc tính cột</h3>
      <p style={S.kind}>Cột {i + 1} / {soCot} · {dung} khối đang nằm trong cột này</p>

      {/* ĐỔI CHỖ CỘT — lối chính xác, đi kèm lối kéo tên cột trên lưu đồ. Hai nút
          thấy được ngay nên người dùng không phải đoán là kéo được; kéo thì nhanh
          hơn khi phải đi xa. Cả hai đều gọi chuyenCotTai nên không thể lệch nhau.
          Tắt ở hai đầu: cột đầu không có chỗ nào bên trái để mà sang. */}
      {coSua && soCot > 1 && (
        <div style={S.fld}>
          <span style={S.lbl}>Đổi chỗ cột</span>
          <div style={S.doiCho}>
            <button type="button" className="qe-btn" disabled={i === 0}
              style={{ ...S.btn, ...S.btnNho, flex: 1, justifyContent: 'center' }}
              onClick={() => onChuyen(i - 1)}
              title={i === 0 ? 'Cột này đã ở ngoài cùng bên trái.'
                : `Đổi chỗ với cột “${soDo.lanes[i - 1]?.name || '—'}”`}>
              ◀ Chuyển trái
            </button>
            <button type="button" className="qe-btn" disabled={i >= soCot - 1}
              style={{ ...S.btn, ...S.btnNho, flex: 1, justifyContent: 'center' }}
              onClick={() => onChuyen(i + 1)}
              title={i >= soCot - 1 ? 'Cột này đã ở ngoài cùng bên phải.'
                : `Đổi chỗ với cột “${soDo.lanes[i + 1]?.name || '—'}”`}>
              Chuyển phải ▶
            </button>
          </div>
          <p style={S.note}>
            Khối trong cột <b>đi theo cột của mình</b> — bộ phận phụ trách của mọi bước
            giữ nguyên. Trên lưu đồ còn kéo ngang <b>tên cột</b> được. Hoàn tác bằng Ctrl+Z.
          </p>
        </div>
      )}

      <ONhap id="qe-f-lname" nhan="Tên bộ phận" giaTri={l.name} doc={!coSua}
        key={`ln${l.name}`} onLuu={v => va('name', v.trim() || 'Bộ phận mới')} />

      <ONhap id="qe-f-lowner" nhan="Người thực hiện" giaTri={l.owner} doc={!coSua}
        key={`lo${l.owner}`} onLuu={v => va('owner', v)}
        ghiChu="Giá trị này đi thẳng vào cột “Người thực hiện” của bảng diễn giải cho MỌI bước trong cột." />

      <div style={S.fld}>
        <span style={S.lbl}>Màu cột</span>
        <div style={S.swatches}>
          {PAL.map(c => (
            <button key={c} type="button" disabled={!coSua} aria-label={`Màu ${c}`}
              onClick={() => va('color', c)}
              style={{ ...S.swatch, background: c, borderColor: l.color === c ? C.chu : 'transparent' }} />
          ))}
        </div>
      </div>

      {coSua && (
        <>
          <button type="button" className="qe-btn" disabled={dung > 0 || soDo.lanes.length <= 1}
            style={{ ...S.btn, ...S.btnNho, color: C.do }} onClick={onXoa}
            title={dung > 0
              ? `Cột còn ${dung} khối — chuyển chúng sang cột khác trước đã.`
              : soDo.lanes.length <= 1 ? 'Lưu đồ phải còn ít nhất một cột.'
                : 'Xoá cột này khỏi lưu đồ'}>
            Xoá cột này
          </button>
          <p style={S.note}>
            {dung > 0
              ? `Còn ${dung} khối trong cột. Hãy kéo chúng sang cột khác trước — đổi cột là đổi
                 người thực hiện, chỗ này không tự quyết hộ.`
              : 'Các cột bên phải sẽ dịch sang trái một bậc. Hoàn tác được bằng Ctrl+Z.'}
          </p>
        </>
      )}
    </>
  );
}

/** Bảng thuộc tính của một HÀNG. Hàng không còn gì để đặt tên hay chỉnh chiều
 *  cao — nhãn là "Bước N" đánh tự động, mọi hàng cao bằng nhau — nên chỗ này
 *  chỉ còn cho biết hàng đang chứa gì và nút xoá. */
function HangInsp({ i, d, soHang, coSua, onXoa }) {
  const dung = d.ids.length;
  return (
    <>
      <h3 style={S.h3}>Thuộc tính hàng</h3>
      <p style={S.kind}>Bước {i + 1} · {dung} khối đang nằm trong hàng này</p>

      <p style={S.note}>
        Số bước đánh <b>tự động</b> theo thứ tự hàng từ trên xuống, không đặt tên
        được. Xoá hoặc thêm hàng là các bước phía dưới tự đánh số lại.
      </p>

      {coSua && (
        <>
          <button type="button" className="qe-btn" disabled={dung > 0 || soHang <= 1}
            style={{ ...S.btn, ...S.btnNho, color: C.do }} onClick={onXoa}
            title={dung > 0
              ? `Hàng còn ${dung} khối — kéo chúng sang hàng khác trước đã.`
              : soHang <= 1 ? 'Lưu đồ phải còn ít nhất một hàng.'
                : 'Xoá hàng này khỏi lưu đồ'}>
            Xoá hàng này
          </button>
          <p style={S.note}>
            {dung > 0
              ? `Còn ${dung} khối trong hàng. Hãy kéo chúng sang hàng khác trước khi xoá hàng.`
              : 'Các khối phía dưới dịch lên đúng một hàng nên thứ tự trước sau không đổi. '
                + 'Hoàn tác được bằng Ctrl+Z.'}
          </p>
        </>
      )}
    </>
  );
}

/* ── Hình nhỏ minh hoạ loại khối, đúng hình dạng thật ── */
const HINH_NHO = {
  start: { borderRadius: 999 },
  end: { borderRadius: 999 },
  step: { borderRadius: 3 },
  check: { borderRadius: 3 },
  dec: { clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)' },
  doc: { clipPath: 'polygon(0 0,100% 0,100% 80%,50% 100%,0 80%)' },
  data: { clipPath: 'polygon(14% 0,100% 0,86% 100%,0 100%)' },
};

/* ── Hover / hình khối / responsive: chèn 1 thẻ <style> như ModuleShell,
      phần còn lại vẫn là style inline như các trang khác của app. ── */
const CSS = `
.qe-wrap { flex:1; display:flex; flex-direction:column; min-height:0; }
.qe-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:8px 12px;
  background:${C.mat}; border-bottom:1px solid ${C.vien}; }
.qe-tgroup { display:flex; gap:2px; padding:2px; background:${C.mat2}; border-radius:9px; }
.qe-tool { display:flex; align-items:center; gap:5px; padding:5px 9px; border:none; background:none;
  border-radius:7px; font-family:inherit; font-size:12px; font-weight:600; color:${C.chu2};
  cursor:pointer; transition:background .14s,color .14s; white-space:nowrap; }
.qe-tool:hover:not(:disabled) { background:${C.mat}; color:${C.chu}; }
.qe-tool[data-on] { background:${C.chu}; color:#fff; }
.qe-tool:disabled { opacity:.35; cursor:not-allowed; }
.qe-btn { transition:filter .15s; }
.qe-btn:hover:not(:disabled) { filter:brightness(.96); }
.qe-btn:disabled { opacity:.45; cursor:not-allowed; }
.qe-spin { animation:qe-rot 1s linear infinite; }
@keyframes qe-rot { to { transform:rotate(360deg); } }

.qe-loibar { display:flex; flex-wrap:wrap; gap:6px; padding:8px 12px; background:#fff7f5;
  border-bottom:1px solid ${C.vien}; max-height:104px; overflow-y:auto; }

.qe-ed { flex:1; display:grid; grid-template-columns:184px 1fr 272px; min-height:0; }
.qe-palette { border-right:1px solid ${C.vien}; background:${C.mat}; overflow-y:auto; padding:12px 10px; }
.qe-insp { border-left:1px solid ${C.vien}; background:${C.mat}; overflow-y:auto; padding:13px 12px; }
.qe-shp { width:100%; display:flex; align-items:center; gap:9px; padding:7px 8px; margin-bottom:3px;
  border:1px solid transparent; background:none; border-radius:9px; text-align:left; cursor:pointer;
  font-family:inherit; font-size:12.5px; font-weight:600; color:${C.chu2}; transition:all .14s; }
.qe-shp:hover:not(:disabled) { background:${C.mat2}; border-color:${C.vien}; color:${C.chu}; }
.qe-shp:disabled { opacity:.4; cursor:not-allowed; }

.qe-cvscroll { overflow:auto; background:${C.mat2}; position:relative; }
.qe-cv { position:relative; background:${C.giay}; color:${C.giayVien};
  border:1px solid ${C.giayVien}; border-radius:6px; box-shadow:0 6px 20px -8px rgba(15,23,42,.18); }
.qe-guthead { position:absolute; left:0; top:0; height:${HEAD_H}px; display:grid; place-items:center;
  font-size:10px; font-weight:800; letter-spacing:.07em; text-transform:uppercase; color:#94a3b8;
  border-bottom:2px solid ${C.giayVien}; background:${C.giayBang}; }
/* touch-action:none để kéo bằng ngón tay không bị trình duyệt cướp thành cuộn
   trang giữa chừng — y như .qe-node đã làm cho cử chỉ kéo khối. */
.qe-lanehead { position:absolute; top:0; height:${HEAD_H}px; display:grid; place-items:center;
  padding:0 8px; font-size:12px; font-weight:700; text-align:center; line-height:1.25; cursor:pointer;
  border-left:1px solid ${C.giayVien}; border-bottom:2px solid currentColor; overflow:hidden;
  user-select:none; touch-action:none; }
.qe-lanehead[data-sel] { outline:2px solid currentColor; outline-offset:-2px; }
/* Cột ĐANG KÉO mờ đi (nó sắp rời chỗ), cột ĐÍCH viền nét đứt. Hai dấu hiệu khác
   hẳn nhau nên không lẫn với nhau, và cũng không lẫn với viền LIỀN của data-sel. */
.qe-lanehead[data-keo] { opacity:.42; }
.qe-lanehead[data-dich] { outline:2px dashed currentColor; outline-offset:-3px; }
.qe-hanglbl { position:absolute; left:0; display:grid; place-items:center; padding:0 8px;
  font-size:11.5px; font-weight:700; color:#475569; text-align:center; line-height:1.3; cursor:pointer;
  border-top:1px solid ${C.giayVien}; background:${C.giayBang}; }
.qe-hanglbl[data-sel] { outline:2px solid ${C.chu2}; outline-offset:-2px; }
.qe-edges { position:absolute; inset:0; overflow:visible; pointer-events:none; }
/* Núm chỉnh chỗ bẻ phải nổi TRÊN lớp khối — khối vẽ sau lớp đường nối nên nằm
   đè lên nó, và núm ＋/⤳ đã chiếm z-index 5, nên lấy 6. Cả lớp KHÔNG ăn chuột,
   chỉ riêng cái núm bên trong bật lại pointer-events, vì vậy khối nằm dưới lớp
   phủ vẫn bấm chọn và kéo được y như khi không có núm nào. */
.qe-lechlop { position:absolute; inset:0; overflow:visible; pointer-events:none; z-index:6; }

.qe-node { position:absolute; user-select:none; touch-action:none; }
.qe-shape { position:absolute; inset:0; }
.qe-shapein { position:absolute; inset:2px; background:${C.giay}; display:grid; place-items:center;
  padding:5px 8px; }
.qe-tx { font-size:11.5px; font-weight:600; text-align:center; line-height:1.3; color:${C.chu};
  overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; }
.qe-node[data-t="start"] .qe-shape, .qe-node[data-t="start"] .qe-shapein,
.qe-node[data-t="end"] .qe-shape, .qe-node[data-t="end"] .qe-shapein { border-radius:999px; }
.qe-node[data-t="step"] .qe-shape, .qe-node[data-t="check"] .qe-shape { border-radius:9px; }
.qe-node[data-t="step"] .qe-shapein, .qe-node[data-t="check"] .qe-shapein { border-radius:7px; }
.qe-node[data-t="dec"] .qe-shape, .qe-node[data-t="dec"] .qe-shapein {
  clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%); }
.qe-node[data-t="dec"] .qe-shapein { inset:3px; }
.qe-node[data-t="doc"] .qe-shape, .qe-node[data-t="doc"] .qe-shapein {
  clip-path:polygon(0 0,100% 0,100% 84%,50% 100%,0 84%); }
.qe-node[data-t="data"] .qe-shape, .qe-node[data-t="data"] .qe-shapein {
  clip-path:polygon(11% 0,100% 0,89% 100%,0 100%); }
.qe-num { position:absolute; left:-8px; top:-8px; width:19px; height:19px; border-radius:50%;
  color:#fff; font-size:10.5px; font-weight:800; display:grid; place-items:center; z-index:2;
  box-shadow:0 1px 4px rgba(15,23,42,.28); }
/* Trên khối đang chọn, huy hiệu số là một cái NÚT dẫn tới ô sửa số bên phải.
   Gỡ hết nét mặc định của <button> để nó trông y hệt huy hiệu tĩnh. */
button.qe-num { border:none; padding:0; cursor:pointer; }
button.qe-num:hover { filter:brightness(1.12); }
.qe-selbox { position:absolute; inset:-7px; border:1.5px dashed; border-radius:4px; pointer-events:none; }
.qe-cv[data-noi] .qe-node { cursor:crosshair; }

.qe-addh { position:absolute; width:23px; height:23px; border-radius:50%; padding:0; z-index:5;
  border:1.5px solid; background:#fff; font-family:inherit; font-size:13px; font-weight:800;
  line-height:1; display:grid; place-items:center; cursor:pointer;
  box-shadow:0 2px 6px rgba(15,23,42,.2); transition:transform .14s; }
.qe-addh:hover { transform:scale(1.14); }
.qe-addh-down { left:50%; margin-left:-11.5px; bottom:-32px; }
.qe-addh-left { top:50%; margin-top:-11.5px; left:-32px; }
/* Núm KÉO ĐỂ NỐI — cạnh phải, chỗ duy nhất chưa bị núm ＋ nào chiếm. */
.qe-noih { top:50%; margin-top:-11.5px; right:-32px; cursor:crosshair; touch-action:none; }
.qe-addh-lbl { position:absolute; top:24px; left:50%; transform:translateX(-50%);
  font-size:9px; font-weight:800; letter-spacing:.04em; white-space:nowrap; pointer-events:none; }

@media (max-width:1180px) { .qe-ed { grid-template-columns:160px 1fr 244px; } }
@media (max-width:900px) {
  .qe-ed { grid-template-columns:1fr; }
  .qe-palette, .qe-insp { display:none; }
}
@media (prefers-reduced-motion: reduce) {
  .qe-tool, .qe-btn, .qe-shp, .qe-addh { transition:none; }
  .qe-addh:hover { transform:none; }
  .qe-spin { animation:none; }
}
`;

const S = {
  trong: { flex: 1, display: 'grid', placeItems: 'center', padding: 24, background: C.nen },

  title: { display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, maxWidth: '38%' },
  code: {
    fontFamily: MONO, fontSize: 11.5, fontWeight: 700, padding: '3px 7px',
    borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0,
  },
  titleTx: {
    fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden',
    textOverflow: 'ellipsis', color: C.chu, minWidth: 0,
  },
  ver: {
    fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.chu2,
    background: C.mat2, padding: '2px 6px', borderRadius: 5, flexShrink: 0,
  },
  pill: {
    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
    padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0,
  },
  dot: { width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 },
  chuaLuu: {
    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700,
    color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a',
    padding: '4px 9px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0,
  },
  chuaLuuCham: {
    width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0,
  },
  zoomV: {
    fontSize: 11.5, fontWeight: 700, color: C.chu2, minWidth: 40, textAlign: 'center',
    fontVariantNumeric: 'tabular-nums', alignSelf: 'center',
  },

  btn: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9,
    fontSize: 12.5, fontWeight: 600, border: `1px solid ${C.vien}`, background: C.mat,
    color: C.chu2, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  btnChinh: { border: 'none', color: '#fff' },
  btnNho: { padding: '6px 10px', fontSize: 12, borderRadius: 8 },

  loiDong: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 8,
    border: '1px solid #fecaca', background: '#fef2f2', color: C.do,
    fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', textAlign: 'left', lineHeight: 1.4,
  },
  canhBaoDong: { border: '1px solid #fde68a', background: '#fffbeb', color: '#b45309' },
  loiCham: { width: 6, height: 6, borderRadius: '50%', background: C.do, flexShrink: 0 },

  h3: {
    margin: '0 0 8px 2px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em',
    textTransform: 'uppercase', color: C.chu3,
  },
  kind: { fontSize: 12, color: C.chu3, margin: '0 0 13px' },
  hint: {
    marginTop: 12, marginBottom: 4, padding: '9px 10px', borderRadius: 9,
    background: C.mat2, fontSize: 11.5, lineHeight: 1.55, color: C.chu3,
  },
  kbd: {
    fontFamily: MONO, fontSize: 10.5, background: C.mat, color: C.chu2,
    border: `1px solid ${C.vien2}`, borderBottomWidth: 2, borderRadius: 4, padding: '1px 4px',
  },
  shpG: { width: 30, height: 22, flexShrink: 0, display: 'grid', placeItems: 'center' },
  shpI: { display: 'block', width: 24, height: 15 },

  fld: { marginBottom: 11 },
  lbl: { display: 'block', fontSize: 11, fontWeight: 700, color: C.chu2, marginBottom: 4 },
  inp: {
    width: '100%', padding: '7px 9px', border: `1px solid ${C.vien}`, borderRadius: 8,
    background: C.nen, outline: 'none', fontSize: 13, color: C.chu, fontFamily: 'inherit',
  },
  inpDoc: { background: C.mat2, color: C.chu2 },
  ta: { resize: 'vertical', minHeight: 64, lineHeight: 1.5 },
  note: { fontSize: 10.5, color: C.chu3, margin: '4px 0 0', lineHeight: 1.45 },

  doiCho: { display: 'flex', gap: 6 },

  swatches: { display: 'flex', gap: 5, flexWrap: 'wrap' },
  swatch: {
    width: 22, height: 22, borderRadius: 6, border: '2px solid transparent',
    padding: 0, cursor: 'pointer',
  },
  swatchMd: {
    background: C.mat2, borderColor: C.vien2, fontSize: 12, fontWeight: 800,
    lineHeight: 1, fontFamily: 'inherit',
  },

  rong: {
    padding: '26px 14px', textAlign: 'center', color: C.chu3, fontSize: 12.5, lineHeight: 1.6,
    background: C.mat, border: `1px dashed ${C.vien2}`, borderRadius: 13, maxWidth: 420,
  },

  pop: {
    position: 'fixed', zIndex: 400, width: 252, background: C.mat, border: `1px solid ${C.vien}`,
    borderRadius: 13, boxShadow: '0 18px 48px -16px rgba(15,23,42,.32)', padding: 12,
  },
  popH: { margin: '0 0 2px', fontSize: 12.5, fontWeight: 800, color: C.chu },
  popFrom: { margin: '0 0 10px', fontSize: 11, color: C.chu3, lineHeight: 1.4 },
  popRow: { display: 'flex', gap: 7, justifyContent: 'flex-end', marginTop: 11 },
  kinds: { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 4 },
  kindBtn: {
    padding: '7px 0 5px', border: '1px solid', borderRadius: 8, display: 'grid',
    placeItems: 'center', gap: 3, fontSize: 8.5, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  kindI: { display: 'block', width: 18, height: 11 },

  toasts: {
    position: 'fixed', left: '50%', bottom: 22, transform: 'translateX(-50%)', zIndex: 500,
    display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'center', pointerEvents: 'none',
  },
  toast: {
    background: C.chu, color: C.nen, fontSize: 12.5, fontWeight: 600, padding: '9px 14px',
    borderRadius: 10, boxShadow: '0 18px 48px -16px rgba(15,23,42,.5)',
    maxWidth: 'min(440px,90vw)', lineHeight: 1.45,
  },
};
