import React, { useMemo, useRef, useState } from 'react';
import { Printer, FileImage, FileText, Loader2, GitBranch } from 'lucide-react';
import { soDoSangSvg } from '../../lib/quyTrinhSvg';
import { dongDienGiai } from '../../lib/quyTrinhDienGiai';
import { xuatPng, xuatDocx, inPdf } from '../../lib/quyTrinhXuat';
import * as api from '../../lib/quyTrinhApi';

/* ═══════════════════════════════════════════════════════════════
   XEM TRƯỚC & XUẤT — tờ giấy A4 dọc và ba đường xuất tệp.

   Màn hình này KHÔNG tính gì cả, chỉ ghép lại:
     · mục 1–4, 7 và ba tên ký ← mo.phienBan.tai_lieu (tab Thông tin tài liệu)
     · mục 5 ← soDoSangSvg(soDo)            — đã thoát ký tự qua thoatXml, có test
     · mục 6 ← dongDienGiai(soDo)           — hình chiếu của sơ đồ, có test
     · mục 8 ← api.lichSuSuaDoi(dsPhienBan) — sắp tăng dần theo lần ban hành

   ── BA CHỖ DỄ SAI, ĐỌC TRƯỚC KHI SỬA ───────────────────────────

   1. QUYỀN XUẤT LÀ pDanhMuc.io, KHÔNG PHẢI pSoanThao.io.
      Cap `io` chỉ khai ở tab `danh_muc` (src/lib/permRegistry.js). Cap mà tab
      không khai thì getTabPerm trả false cho MỌI người, kể cả ADMIN — lấy nhầm
      sang pSoanThao là ba nút xuất tắt câm với tất cả, không một dòng lỗi ở đâu.

   2. XUẤT THEO SƠ ĐỒ ĐANG NHÌN THẤY, không phải phienBan.so_do.
      xuatPng/xuatDocx đọc `phienBan.so_do` — tức bản ĐÃ LƯU. Người soạn sửa lưu
      đồ, chưa lưu, sang đây bấm Xuất Word thì tệp tải về khác hẳn tờ giấy họ vừa
      xem, và không có gì báo. Nên ở đây truyền một bản phienBan đã vá `so_do`
      bằng sơ đồ trên màn hình (biến `pbXuat`). Không sửa quyTrinhXuat.js vì nó
      còn dùng ở chỗ khác.

   3. soDoSangSvg gọi thẳng soDo.lanes.forEach.
      Dòng cũ trong DB có thể là {} (cột so_do jsonb default '{}'), nên phải kiểm
      mảng TRƯỚC khi gọi, không thì cả tab trắng màn hình.

   Bố cục/màu chuyển từ docs/mockups/quy-trinh-mockup.html (#v-print).
   Tệp này KHÔNG chạm Supabase — lichSuSuaDoi là hàm thuần trong quyTrinhApi.
   ═══════════════════════════════════════════════════════════════ */

// Bảng màu lấy từ :root chế độ sáng của mockup.
const C = {
  nen: '#f1f5f9', mat: '#ffffff', mat2: '#f1f5f9',
  vien: '#e2e8f0', vien2: '#cbd5e1',
  chu: '#0f172a', chu2: '#475569', chu3: '#748094',
  giay: '#ffffff', giayChu: '#0f172a', giayVien: '#dfe6ef',
};
const MONO = "'Cascadia Mono',Consolas,'SF Mono',ui-monospace,monospace";

const CONG_TY = 'CÔNG TY TNHH EUROMADE VIỆT NAM';
const THUONG_HIEU = 'EUROMADE';

const TT = {
  draft:     { ten: 'Bản nháp',     mau: '#64748b' },
  wait:      { ten: 'Chờ duyệt',    mau: '#2563eb' },
  published: { ten: 'Đã ban hành',  mau: '#16a34a' },
  expired:   { ten: 'Hết hiệu lực', mau: '#dc2626' },
};

/* ── Chuẩn hoá tai_lieu ────────────────────────────────────────
   Giống ThongTinTab: quy_trinh_phien_ban.tai_lieu là jsonb không ràng buộc
   hình dạng, dòng cũ có thể là null, {}, hay vienDan: null. Mọi chỗ đọc danh
   sách ở dưới đi qua đây nên .map trên undefined không xảy ra. */
const chuoi = v => String(v ?? '');
const mangChuoi = v => (Array.isArray(v) ? v.map(chuoi) : []);

function chuanHoa(t) {
  const o = (t && typeof t === 'object' && !Array.isArray(t)) ? t : {};
  return {
    mucDich: chuoi(o.mucDich),
    phamVi: chuoi(o.phamVi),
    vienDan: mangChuoi(o.vienDan),
    dinhNghia: Array.isArray(o.dinhNghia)
      ? o.dinhNghia.map(d => ({ tu: chuoi(d?.tu), nghia: chuoi(d?.nghia) }))
      : [],
    hoSoLuu: Array.isArray(o.hoSoLuu)
      ? o.hoSoLuu.map(h => ({
        ten: chuoi(h?.ten), boPhan: chuoi(h?.boPhan),
        thoiGian: chuoi(h?.thoiGian), hinhThuc: chuoi(h?.hinhThuc),
      }))
      : [],
    nguoiLap: chuoi(o.nguoiLap),
    nguoiKiemTra: chuoi(o.nguoiKiemTra),
    nguoiDuyet: chuoi(o.nguoiDuyet),
  };
}

/* ── Ép các ô HÌNH HỌC về số ────────────────────────────────────
   BẮT BUỘC, và là phần bảo mật của tệp này. soDoSangSvg thoát mọi ô CHỮ qua
   thoatXml (tên bước, tên cột, màu, nhãn đường — đã đo, đều an toàn), nhưng
   các ô toạ độ thì nó nội suy THẲNG vào chuỗi SVG vì mặc định chúng là số:

     <rect x="…" y="${r.y}" width="${r.w}" height="${r.h}" …/>

   so_do là jsonb, không có ràng buộc kiểu. Nhét một CHUỖI vào n.y / n.h /
   n.dx / phases[].h là thoát ra khỏi thuộc tính và chèn được thẻ thật —
   đã đo được <script>, <img onerror>, <foreignObject> lọt vào trang.

   Trước Task 18 chuỗi đó vô hại: chỗ dùng duy nhất là soDoSangPng, nạp SVG
   qua <img> blob — trình duyệt KHÔNG chạy script trong ảnh. Tab này là chỗ
   đầu tiên đổ nó thẳng vào DOM bằng dangerouslySetInnerHTML (grep cả repo
   chỉ có một chỗ, là đây), nên chính nó biến dữ liệu bẩn thành mã chạy được.

   Làm sạch Ở ĐÂY chứ không sửa quyTrinhSvg.js: hàm đó có 18 test và còn dùng
   cho đường xuất tệp. Number() giữ nguyên mọi giá trị số hợp lệ nên lưu đồ
   thật vẽ ra không đổi một pixel — đã so chuỗi SVG trước/sau, giống hệt. */
const so = (v, mac = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : mac;
};

function lamSachHinhHoc(sd) {
  const oSach = o => (o && typeof o === 'object' && !Array.isArray(o));
  return {
    ...sd,
    // `phases` chỉ còn ở sơ đồ lưu từ trước (nay chiều cao trang là soDo.soHang).
    // Vẫn phải rửa vì bản cũ suy chiều cao trang từ nó — nhưng chỉ khi CÓ.
    ...(Array.isArray(sd.phases)
      ? { phases: sd.phases.map(p => (oSach(p) ? { ...p, h: so(p.h) } : p)) }
      : null),
    nodes: Array.isArray(sd.nodes)
      ? sd.nodes.map(n => (oSach(n)
        ? { ...n, y: so(n.y), w: so(n.w), h: so(n.h), dx: so(n.dx), lane: so(n.lane) }
        : n))
      : sd.nodes,
  };
}

const ngayVn = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

/** Số hai chữ số cho ô "Lần ban hành" / "Lần sửa". Giữ ĐÚNG cách đánh số của
 *  quyTrinhDocx.js để tờ giấy trên màn hình và tệp Word không lệch nhau. */
const hai = (v) => {
  const s = String(v ?? '').trim();
  return s ? s.padStart(2, '0') : '—';
};

const hoac = (v, thay = '—') => (String(v ?? '').trim() || thay);

function Rong({ tieuDe, phu }) {
  return (
    <div style={S.rong}>
      <GitBranch size={30} strokeWidth={1.4} color={C.vien2} />
      <div style={{ fontWeight: 700, color: C.chu2, marginTop: 8 }}>{tieuDe}</div>
      <div style={{ marginTop: 4 }}>{phu}</div>
    </div>
  );
}

export default function XemTruocTab({ mo, soDo, pDanhMuc, mau = '#ea580c', chuaLuu = false }) {
  // '' khi rảnh, 'png' | 'docx' khi đang chạy. Ref đi kèm vì hai cú bấm liên
  // tiếp trong CÙNG một vòng React vẫn đọc được state cũ — ref đổi ngay lập tức.
  const [dangXuat, setDangXuat] = useState('');
  const banRef = useRef(false);

  const qt = mo?.quyTrinh || null;
  const pb = mo?.phienBan || null;
  const tt = pb?.trang_thai || 'draft';
  const ttNhan = TT[tt] || { ten: tt, mau: C.chu3 };

  const tl = useMemo(() => chuanHoa(pb?.tai_lieu), [pb?.tai_lieu]);

  // Sơ đồ đang nhìn thấy; rơi về bản đã lưu phòng khi ls.soDo chưa có.
  const sd = soDo || pb?.so_do || null;

  /* Lưu đồ và bảng diễn giải dựng TRONG CÙNG một chỗ có bắt lỗi. Cả hai đều
     duyệt soDo.nodes: soDoSangSvg đọc n.t để tra LOAI_KHOI, thuTuBuoc cũng
     đọc n.t. Một phần tử rác trong mảng jsonb (đo được: nodes:[null]) làm cả
     hai ném lỗi, và lỗi ném ra giữa render là TRẮNG NGUYÊN phân hệ — đúng lúc
     người ta mở màn hình này để in. Bắt ở đây thì hỏng dữ liệu chỉ mất cái
     hình, bảy mục còn lại vẫn đọc được. */
  const ve = useMemo(() => {
    // CHỈ soi `lanes`: soDoSangSvg gọi thẳng soDo.lanes.forEach. Chiều cao trang
    // nay là soDo.soHang, và drawH tự lo mọi hình dạng dữ liệu — đòi `phases`
    // phải là mảng thì mọi sơ đồ soạn từ nay (không còn khoá đó) đều mất hình.
    if (!Array.isArray(sd?.lanes)) {
      return { svg: '', dong: [], hong: false, sach: sd };
    }
    try {
      const sach = lamSachHinhHoc(sd);
      return { svg: soDoSangSvg(sach), dong: dongDienGiai(sach), hong: false, sach };
    } catch {
      return { svg: '', dong: [], hong: true, sach: sd };
    }
  }, [sd]);

  /* lichSuSuaDoi() gọi thẳng dsPhienBan.slice().sort((a,b) => a.lan_ban_hanh…)
     ⇒ null/undefined ném lỗi, và MỘT phần tử null LỌT TRONG mảng cũng ném
     (đo được). Array.isArray() một mình không đủ — phải lọc cả bên trong. */
  const lichSu = useMemo(() => api.lichSuSuaDoi(
    (Array.isArray(mo?.dsPhienBan) ? mo.dsPhienBan : [])
      .filter(p => p && typeof p === 'object'),
  ), [mo?.dsPhienBan]);

  const coXuat = !!pDanhMuc?.io;      // CAP io CHỈ KHAI Ở TAB danh_muc
  const banIn = !!qt && !!pb;

  const chay = async (viec, fn) => {
    if (banRef.current) return;       // chặn bấm đúp trước cả khi React render lại
    banRef.current = true;
    setDangXuat(viec);
    try {
      // Cả PNG lẫn Word đều dựng ảnh lưu đồ trước tiên, nên sơ đồ hỏng là hai
      // đường này CHẮC CHẮN gãy — chặn sớm để người dùng đọc được câu tiếng
      // Việt thay vì một TypeError tiếng Anh nảy lên trong hộp alert.
      if (ve.hong) {
        throw new Error('Dữ liệu sơ đồ của phiên bản này bị hỏng nên không dựng được '
          + 'ảnh lưu đồ. Hãy mở tab Trình vẽ lưu đồ để kiểm tra rồi lưu lại.');
      }
      await fn();
    } catch (e) {
      alert(e?.message || 'Không xuất được tệp. Hãy thử lại.');
    } finally {
      banRef.current = false;
      setDangXuat('');
    }
  };

  // ── Rỗng: chưa mở quy trình nào ───────────────────────────────
  if (!banIn) {
    return (
      <div style={S.trong}>
        <style>{CSS}</style>
        <Rong
          tieuDe="Chưa mở quy trình nào."
          phu={(
            <>
              Sang tab <b>Danh mục quy trình</b> rồi bấm vào một thẻ để mở nó.
              <br />Bản in A4 dựng từ một phiên bản cụ thể của quy trình, nên chưa
              mở thì chưa có gì để xem trước hay xuất ra.
            </>
          )} />
      </div>
    );
  }

  // Xuất theo sơ đồ ĐANG NHÌN THẤY (xem ghi chú số 2 ở đầu tệp). tai_lieu thì
  // mo.phienBan đã là nguồn sự thật sống — ThongTinTab ghi thẳng vào đó.
  // Dùng bản đã ép số để tệp xuất ra khớp từng nét với tờ giấy trên màn hình.
  const pbXuat = { ...pb, so_do: ve.sach };
  const dangChay = !!dangXuat;

  const lyDoNhap = tt === 'published' ? ''
    : `Phiên bản này đang ở trạng thái “${ttNhan.ten}”. Bản in và tệp xuất ra `
      + 'chỉ để xem thử — chưa phải tài liệu có hiệu lực trong hồ sơ ISO.';

  return (
    <div className="qx-wrap">
      <style>{CSS}</style>

      {/* ── Thanh công cụ (không in ra giấy) ─────────────────────── */}
      <div className="qx-bar">
        <div style={S.lbl}>
          Bản in khổ A4 dọc
          <small style={S.lblPhu}>
            Khối kiểm soát tài liệu · lưu đồ · bảng diễn giải · hồ sơ lưu · theo dõi sửa đổi
          </small>
        </div>

        <span style={{ ...S.pill, color: ttNhan.mau, background: ttNhan.mau + '22' }}>
          <span style={S.dot} />{ttNhan.ten}
        </span>
        {chuaLuu && (
          <span style={S.chuaLuu}
            title="Tệp xuất ra lấy đúng lưu đồ đang hiện trên tờ giấy này, kể cả phần chưa lưu.">
            <span style={S.chuaLuuCham} />Chưa lưu
          </span>
        )}

        {coXuat ? (
          <>
            <button type="button" className="qx-btn" style={S.btn} disabled={dangChay}
              onClick={() => chay('png', () => xuatPng(qt, pbXuat))}
              title="Tải ảnh PNG của riêng lưu đồ, cỡ 2× cho nét khi in dán xưởng">
              {dangXuat === 'png' ? <Loader2 size={14} className="qx-spin" /> : <FileImage size={14} />}
              {dangXuat === 'png' ? 'Đang dựng ảnh…' : 'Xuất PNG dán xưởng'}
            </button>

            <button type="button" className="qx-btn" style={S.btn} disabled={dangChay}
              onClick={() => chay('docx', () => xuatDocx(qt, pbXuat, lichSu))}
              title="Tải tệp Word .docx khổ A4 dọc, sửa được, để nộp hồ sơ ISO">
              {dangXuat === 'docx' ? <Loader2 size={14} className="qx-spin" /> : <FileText size={14} />}
              {dangXuat === 'docx' ? 'Đang dựng tệp Word…' : 'Xuất Word A4'}
            </button>

            <button type="button" className="qx-btn"
              style={{ ...S.btn, ...S.btnChinh, background: mau, boxShadow: `0 2px 10px ${mau}66` }}
              disabled={dangChay} onClick={inPdf}
              title="Mở hộp thoại in — chọn khổ A4 dọc, hoặc “Lưu thành PDF”">
              <Printer size={14} /> In / PDF A4
            </button>
          </>
        ) : (
          <span style={S.khongQuyen}>
            Bạn không có quyền xuất tệp của phân hệ Quy Trình — màn hình này chỉ để xem trước.
          </span>
        )}
      </div>

      {lyDoNhap && <div className="qx-khoa">{lyDoNhap}</div>}

      {/* ── Tờ giấy ──────────────────────────────────────────────── */}
      <div className="qx-body">
        <div className="qt-paper">

          {/* Khối kiểm soát tài liệu */}
          <div className="qx-ctl">
            <div className="qx-brand">
              <b>{THUONG_HIEU}</b>
              <span>{CONG_TY}</span>
            </div>
            <div className="qx-name">
              <b>{hoac(qt.ten, 'Chưa đặt tên quy trình')}</b>
              <span>Nhóm bộ phận: {hoac(qt.nhom)}</span>
            </div>
            <div className="qx-fields">
              <div>Mã số: <b>{hoac(qt.ma_so)}</b></div>
              <div>Lần ban hành: <b>{hai(pb.lan_ban_hanh)}</b></div>
              <div>Ngày hiệu lực: <b>{ngayVn(pb.ngay_hieu_luc)}</b></div>
              <div>Phiên bản: <b>{hoac(pb.phien_ban)}</b></div>
              <div>Trang: <b>1/1</b></div>
              <div>Khổ giấy: <b>A4</b></div>
            </div>
          </div>

          {/* Ba ô chữ ký */}
          <div className="qx-sign">
            <div><b>Người lập</b><span>{hoac(tl.nguoiLap)}</span></div>
            <div><b>Người kiểm tra</b><span>{hoac(tl.nguoiKiemTra)}</span></div>
            <div><b>Người duyệt</b><span>{hoac(tl.nguoiDuyet)}</span></div>
          </div>

          {/* ── 1–4 ───────────────────────────────────────────────── */}
          <h3 className="qx-sec">1–4. Mục đích · Phạm vi · Tài liệu viện dẫn · Định nghĩa</h3>
          <div className="qx-iso">
            <div>
              <b>1. Mục đích</b>
              {tl.mucDich || <i style={S.thieu}>Chưa khai — điền ở tab Thông tin tài liệu.</i>}
            </div>
            <div>
              <b>2. Phạm vi áp dụng</b>
              {tl.phamVi || <i style={S.thieu}>Chưa khai — điền ở tab Thông tin tài liệu.</i>}
            </div>
            <div>
              <b>3. Tài liệu viện dẫn</b>
              {tl.vienDan.length === 0
                ? <i style={S.thieu}>Chưa khai tài liệu viện dẫn nào.</i>
                : <ul>{tl.vienDan.map((v, i) => <li key={i}>{hoac(v, '')}</li>)}</ul>}
            </div>
            <div>
              <b>4. Định nghĩa &amp; từ viết tắt</b>
              {tl.dinhNghia.length === 0
                ? <i style={S.thieu}>Chưa khai định nghĩa nào.</i>
                : (
                  <ul>
                    {tl.dinhNghia.map((d, i) => (
                      <li key={i}><b style={S.tu}>{hoac(d.tu)}</b> — {hoac(d.nghia, '')}</li>
                    ))}
                  </ul>
                )}
            </div>
          </div>

          {/* ── 5. Lưu đồ ─────────────────────────────────────────── */}
          <h3 className="qx-sec">5. Lưu đồ quy trình</h3>
          {ve.svg ? (
            /* An toàn: soDoSangSvg thoát MỌI giá trị người dùng nhập qua thoatXml
               — có test riêng cho đúng việc này ở quyTrinhSvg.test.js. Không dựng
               tay bất kỳ mẩu markup nào từ chữ người dùng. */
            <div className="qx-flow" dangerouslySetInnerHTML={{ __html: ve.svg }} />
          ) : ve.hong ? (
            <p className="qx-trong">
              Không dựng được hình lưu đồ — dữ liệu sơ đồ của phiên bản này bị hỏng.
              Hãy mở tab <b>Trình vẽ lưu đồ</b> để kiểm tra trước khi in hay xuất tệp.
            </p>
          ) : (
            <p className="qx-trong">
              Phiên bản này chưa có dữ liệu lưu đồ hợp lệ. Sang tab <b>Trình vẽ lưu đồ</b> để
              dựng cột bộ phận và các bước, rồi quay lại đây.
            </p>
          )}

          {/* ── 6. Diễn giải ──────────────────────────────────────── */}
          <h3 className="qx-sec">6. Diễn giải lưu đồ</h3>
          <table className="qx-tbl">
            <thead>
              <tr>
                <th style={{ width: 40 }}>Bước</th>
                <th style={{ width: 210 }}>Nội dung</th>
                <th style={{ width: 120 }}>Người thực hiện</th>
                <th>Diễn giải chi tiết</th>
                <th style={{ width: 170 }}>Hồ sơ / Biểu mẫu</th>
              </tr>
            </thead>
            <tbody>
              {ve.dong.length === 0 ? (
                <tr>
                  <td colSpan={5} className="qx-oTrong">
                    {ve.hong
                      ? 'Không đọc được các bước — dữ liệu sơ đồ của phiên bản này bị hỏng.'
                      : 'Lưu đồ chưa có bước nào ngoài Bắt đầu và Kết thúc.'}
                  </td>
                </tr>
              ) : ve.dong.map(r => (
                <tr key={r.khoiId}
                  className={r.nhanh === 'ok' ? 'qx-ok' : r.nhanh === 'ng' ? 'qx-ng' : undefined}>
                  <td className="qx-c">{r.stt}</td>
                  <td><b>{hoac(r.ten, 'Chưa đặt tên bước')}</b></td>
                  <td>{hoac(r.nguoiThucHien)}</td>
                  <td style={S.giuDong}>
                    {r.dienGiai || <i style={S.thieu}>Chưa viết diễn giải cho bước này.</i>}
                  </td>
                  <td>{r.hoSo.length ? r.hoSo.join(' · ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── 7. Hồ sơ lưu ──────────────────────────────────────── */}
          <h3 className="qx-sec">7. Hồ sơ lưu</h3>
          <table className="qx-tbl">
            <thead>
              <tr>
                <th style={{ width: 40 }}>TT</th>
                <th style={{ width: 230 }}>Tên hồ sơ</th>
                <th style={{ width: 130 }}>Bộ phận lưu</th>
                <th style={{ width: 120 }}>Thời gian lưu</th>
                <th>Hình thức lưu</th>
              </tr>
            </thead>
            <tbody>
              {tl.hoSoLuu.length === 0 ? (
                <tr>
                  <td colSpan={5} className="qx-oTrong">
                    Chưa khai hồ sơ lưu nào — mục 7 để trống là một điểm trừ khi đánh giá ISO.
                  </td>
                </tr>
              ) : tl.hoSoLuu.map((h, i) => (
                <tr key={i}>
                  <td className="qx-c">{i + 1}</td>
                  <td>{hoac(h.ten)}</td>
                  <td>{hoac(h.boPhan)}</td>
                  <td>{hoac(h.thoiGian)}</td>
                  <td>{hoac(h.hinhThuc)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── 8. Theo dõi sửa đổi ───────────────────────────────── */}
          <h3 className="qx-sec">8. Theo dõi sửa đổi tài liệu</h3>
          <table className="qx-tbl">
            <thead>
              <tr>
                <th style={{ width: 66 }}>Lần sửa</th>
                <th style={{ width: 96 }}>Ngày</th>
                <th style={{ width: 86 }}>Phiên bản</th>
                <th>Nội dung sửa đổi</th>
                <th style={{ width: 140 }}>Người sửa</th>
              </tr>
            </thead>
            <tbody>
              {lichSu.length === 0 ? (
                <tr>
                  <td colSpan={5} className="qx-oTrong">Chưa có phiên bản nào để theo dõi.</td>
                </tr>
              ) : lichSu.map((r, i) => (
                <tr key={`${r.lan_ban_hanh}|${i}`}>
                  <td className="qx-c">{hai(r.lan_ban_hanh)}</td>
                  <td className="qx-c">{hoac(r.ngay)}</td>
                  <td className="qx-c">{hoac(r.phien_ban)}</td>
                  <td style={S.giuDong}>{hoac(r.noiDung, '')}</td>
                  <td>{hoac(r.nguoi)}</td>
                </tr>
              ))}
            </tbody>
          </table>

        </div>
      </div>
    </div>
  );
}

/* ── Lưới/bảng/khổ in: chèn 1 thẻ <style> như ModuleShell,
      phần còn lại vẫn là style inline như các trang khác của app. ── */
const CSS = `
.qx-wrap { flex:1; display:flex; flex-direction:column; min-height:0; }
.qx-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:8px 12px;
  background:${C.mat}; border-bottom:1px solid ${C.vien}; }
.qx-btn { transition:filter .15s; }
.qx-btn:hover:not(:disabled) { filter:brightness(.96); }
.qx-btn:disabled { opacity:.45; cursor:not-allowed; }
.qx-spin { animation:qx-rot 1s linear infinite; }
@keyframes qx-rot { to { transform:rotate(360deg); } }

.qx-khoa { padding:8px 12px; background:${C.mat2}; border-bottom:1px solid ${C.vien};
  font-size:11.5px; font-weight:600; color:${C.chu2}; line-height:1.45; }

.qx-body { flex:1; overflow:auto; background:${C.nen}; padding:18px; }

/* ── Tờ giấy ───────────────────────────────────────────────────
   794px = 210mm ở 96dpi, đúng bề ngang A4 dọc mà @page đang đặt. Tờ giấy
   trên màn hình phải BẰNG tờ giấy in ra: lệch nhau thì bảng nào vừa chỗ ở
   đây lại tràn cột khi in, mà không có gì báo trước. */
.qt-paper { width:794px; max-width:100%; margin:0 auto; background:${C.giay};
  color:${C.giayChu}; border:1px solid ${C.giayVien}; border-radius:4px;
  box-shadow:0 18px 48px -16px rgba(15,23,42,.32); padding:26px 30px 30px; }

.qx-ctl { display:grid; grid-template-columns:150px 1fr 250px; border:1.5px solid #334155; }
.qx-ctl > div { padding:8px 11px; border-right:1px solid #334155; min-width:0; }
.qx-ctl > div:last-child { border-right:none; }
.qx-brand { display:flex; flex-direction:column; justify-content:center; gap:2px; text-align:center; }
.qx-brand b { font-size:15px; font-weight:800; letter-spacing:.02em; color:#0f172a; }
.qx-brand span { font-size:9.5px; color:#64748b; font-weight:600; letter-spacing:.03em; line-height:1.35; }
.qx-name { display:flex; flex-direction:column; justify-content:center; align-items:center;
  gap:4px; text-align:center; }
.qx-name b { font-size:16px; font-weight:800; letter-spacing:.01em; text-transform:uppercase;
  line-height:1.3; overflow-wrap:anywhere; }
.qx-name span { font-size:11px; color:#475569; font-weight:600; }
.qx-fields { display:grid; grid-template-columns:1fr 1fr; gap:0 8px; font-size:10.5px;
  padding:0 !important; }
.qx-fields > div { padding:4px 9px; border-bottom:1px solid #cbd5e1; display:flex;
  justify-content:space-between; gap:6px; }
.qx-fields > div:nth-child(odd) { border-right:1px solid #cbd5e1; }
.qx-fields > div:nth-last-child(-n+2) { border-bottom:none; }
.qx-fields b { font-family:${MONO}; font-weight:700; font-variant-numeric:tabular-nums; }

.qx-sign { display:grid; grid-template-columns:repeat(3,1fr); border:1.5px solid #334155;
  border-top:none; }
.qx-sign > div { padding:7px 11px 30px; border-right:1px solid #334155; text-align:center; }
.qx-sign > div:last-child { border-right:none; }
.qx-sign b { display:block; font-size:10px; font-weight:800; letter-spacing:.06em;
  text-transform:uppercase; color:#475569; }
.qx-sign span { display:block; font-size:11.5px; font-weight:600; margin-top:2px; }

.qx-sec { margin:20px 0 11px; font-size:13px; font-weight:800; letter-spacing:.04em;
  text-transform:uppercase; color:#0f172a; padding-bottom:5px; border-bottom:2px solid #334155; }

.qx-iso { display:grid; grid-template-columns:1fr 1fr; gap:0; border:1px solid #94a3b8;
  border-bottom:none; }
.qx-iso > div { padding:8px 11px; border-bottom:1px solid #94a3b8; font-size:11px;
  line-height:1.55; color:#1e293b; min-width:0; overflow-wrap:anywhere; }
.qx-iso > div:nth-child(odd) { border-right:1px solid #94a3b8; }
.qx-iso > div > b:first-child { display:block; font-size:10px; font-weight:800;
  letter-spacing:.05em; text-transform:uppercase; color:#475569; margin-bottom:3px; }
.qx-iso ul { margin:0; padding-left:16px; }
.qx-iso li { margin-bottom:1px; }

.qx-flow { overflow:hidden; display:flex; justify-content:center; }
.qx-flow svg { max-width:100%; height:auto; }

.qx-trong { margin:0; padding:18px 12px; text-align:center; font-size:11.5px; line-height:1.6;
  color:#475569; border:1px dashed ${C.vien2}; border-radius:8px; background:#f8fafc; }

.qx-tbl { width:100%; border-collapse:collapse; font-size:11px; table-layout:fixed; }
.qx-tbl th { background:#eef2f7; color:#334155; text-align:left; padding:6px 8px;
  border:1px solid #94a3b8; font-size:10px; font-weight:800; text-transform:uppercase;
  letter-spacing:.05em; }
.qx-tbl td { padding:6px 8px; border:1px solid #cbd5e1; vertical-align:top; line-height:1.5;
  color:#1e293b; overflow-wrap:anywhere; }
.qx-tbl td.qx-c { text-align:center; font-weight:700; font-family:${MONO}; }
.qx-tbl tr.qx-ok td.qx-c { background:#eafaf0; }
.qx-tbl tr.qx-ng td.qx-c { background:#fdeeee; }
.qx-tbl td.qx-oTrong { text-align:center; color:#64748b; font-style:italic; padding:12px 8px; }

@media (max-width:820px) {
  .qx-body { padding:10px; }
  .qt-paper { padding:16px 14px 20px; }
  .qx-ctl { grid-template-columns:1fr; }
  .qx-ctl > div { border-right:none; border-bottom:1px solid #334155; }
  .qx-iso { grid-template-columns:1fr; }
  .qx-iso > div:nth-child(odd) { border-right:none; }
}

/* ── Khổ in A4 dọc: chỉ còn tờ giấy, không khung ứng dụng ──── */
@media print {
  @page { size: A4 portrait; margin: 10mm; }
  body * { visibility: hidden; }
  .qt-paper, .qt-paper * { visibility: visible; }
  .qt-paper { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none; border: none; }
  /* Nền ô tiêu đề bảng và vệt màu nhánh OK/NG mặc định bị trình duyệt bỏ khi in;
     không giữ lại thì bản in khác hẳn bản xem trước. */
  .qt-paper, .qt-paper * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* Thanh công cụ đã bị ẩn nhưng VẪN chiếm chỗ ⇒ dễ đẻ ra một trang trắng. */
  .qx-bar, .qx-khoa { display: none !important; }
  .qx-body { padding: 0; background: #fff; overflow: visible; }
  .qt-paper { max-width: none; padding: 0; }
}
`;

const S = {
  trong: { flex: 1, display: 'grid', placeItems: 'center', padding: 24, background: C.nen },
  rong: {
    padding: '26px 14px', textAlign: 'center', color: C.chu3, fontSize: 12.5, lineHeight: 1.6,
    background: C.mat, border: `1px dashed ${C.vien2}`, borderRadius: 13,
    maxWidth: 480, margin: '0 auto',
  },

  lbl: { fontSize: 12.5, fontWeight: 700, color: C.chu, marginRight: 'auto', minWidth: 0 },
  lblPhu: { display: 'block', fontWeight: 500, fontSize: 11, color: C.chu3, lineHeight: 1.45 },
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
  chuaLuuCham: { width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 },

  btn: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9,
    fontSize: 12.5, fontWeight: 600, border: `1px solid ${C.vien}`, background: C.mat,
    color: C.chu2, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  btnChinh: { border: '1px solid transparent', color: '#fff' },
  khongQuyen: {
    fontSize: 11.5, fontWeight: 600, color: C.chu3, background: C.mat2,
    border: `1px solid ${C.vien}`, padding: '6px 10px', borderRadius: 9, lineHeight: 1.4,
  },

  thieu: { color: '#94a3b8', fontStyle: 'italic' },
  tu: {
    display: 'inline', fontSize: 'inherit', fontWeight: 700, textTransform: 'none',
    letterSpacing: 0, color: '#1e293b', marginBottom: 0,
  },
  giuDong: { whiteSpace: 'pre-wrap' },
};
