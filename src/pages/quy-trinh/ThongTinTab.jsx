import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Plus, Trash2, Save, Loader2, Wand2 } from 'lucide-react';
import { NHOM, mauTaiLieu } from '../../lib/quyTrinhMau';
import * as api from '../../lib/quyTrinhApi';

/* ═══════════════════════════════════════════════════════════════
   THÔNG TIN TÀI LIỆU — mục 1–4 và 7 của bản in ISO.

   Mục 5 (lưu đồ) và 6 (diễn giải) SINH RA từ sơ đồ, mục 8 sinh ra từ
   danh sách phiên bản. Chỉ năm mục còn lại là chữ người soạn tự viết,
   và chúng nằm gọn trong phienBan.tai_lieu — màn hình này sửa đúng nó.

   Bố cục/màu chuyển từ docs/mockups/quy-trinh-mockup.html (.iso-grid
   trong #v-print), biến CSS đổi sang giá trị thật của app.
   Tệp này KHÔNG chạm Supabase trực tiếp — mọi truy vấn qua quyTrinhApi.

   ── NGUỒN SỰ THẬT CỦA tai_lieu — đọc trước khi sửa tệp này ──────
   Màn hình này KHÔNG giữ bản nháp riêng. Mọi ô nhập ghi THẲNG vào
   mo.phienBan.tai_lieu qua setMo, ngay lúc rời ô.

   Vì SoanThaoTab.luuNhap() gửi `tai_lieu: pb.tai_lieu` đọc NGUYÊN VĂN
   từ mo.phienBan. Giữ một bản nháp riêng trong useState ở đây thì lần
   "Lưu nháp" kế tiếp bấm ở tab Trình vẽ sẽ ghi lại bản CŨ, xoá sạch
   mục 1–4 và 7 vừa gõ — im lặng, không một thông báo lỗi.

   Thêm một lý do nữa: QuyTrinhApp chỉ render ĐÚNG tab đang mở, nên tab
   này bị unmount mỗi lần chuyển tab. State cục bộ mất theo.
   ═══════════════════════════════════════════════════════════════ */

// Bảng màu lấy từ :root chế độ sáng của mockup.
const C = {
  nen: '#f6f8fb', mat: '#ffffff', mat2: '#f1f5f9',
  vien: '#e2e8f0', vien2: '#cbd5e1',
  chu: '#0f172a', chu2: '#475569', chu3: '#748094',
  do: '#dc2626',
};
const MONO = "'Cascadia Mono',Consolas,'SF Mono',ui-monospace,monospace";

const TT = {
  draft:     { ten: 'Bản nháp',     mau: '#64748b' },
  wait:      { ten: 'Chờ duyệt',    mau: '#2563eb' },
  published: { ten: 'Đã ban hành',  mau: '#16a34a' },
  expired:   { ten: 'Hết hiệu lực', mau: '#dc2626' },
};

/* ── Chuẩn hoá tai_lieu ────────────────────────────────────────
   Dòng cũ trong DB có thể là null, {}, hoặc thiếu bất kỳ khoá nào —
   quy_trinh_phien_ban.tai_lieu là jsonb, không có ràng buộc hình dạng.
   Mọi chỗ đọc danh sách đi qua đây, nên .map trên undefined không xảy ra.
   Giữ nguyên các khoá lạ (…o trước) để không nuốt dữ liệu của bản sau. */
const chuoi = v => String(v ?? '');
const mangChuoi = v => (Array.isArray(v) ? v.map(chuoi) : []);

function chuanHoa(t) {
  const o = (t && typeof t === 'object' && !Array.isArray(t)) ? t : {};
  return {
    ...o,
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

/* ── Ô nhập ghi khi RỜI Ô, không phải mỗi lần gõ ────────────────
   Cùng lý lẽ với ONhap của SoanThaoTab: mỗi ký tự một lần setMo là mỗi
   ký tự một lần render lại cả cây, và ô nhập mất dấu nháy.
   Không kiểm soát giá trị (defaultValue) + key theo GIÁ TRỊ ở nơi gọi ⇒
   nạp lại mẫu hay xoá một dòng thì ô tự dựng lại theo dữ liệu mới. */
function ONhap({ nhan, giaTri, onLuu, doc, dong, goiY, ghiChu, id }) {
  const luu = (ev) => {
    const v = ev.target.value;
    if (!doc && v !== (giaTri ?? '')) onLuu(v);
  };
  const chung = {
    id, defaultValue: giaTri ?? '', onBlur: luu, readOnly: !!doc,
    placeholder: goiY, style: { ...S.inp, ...(doc ? S.inpDoc : null) },
  };
  return (
    <div style={S.fld}>
      {nhan && <label htmlFor={id} style={S.lbl}>{nhan}</label>}
      {dong ? <textarea {...chung} rows={dong} style={{ ...chung.style, ...S.ta }} />
        : <input type="text" {...chung} />}
      {ghiChu && <p style={S.note}>{ghiChu}</p>}
    </div>
  );
}

/** Ô nhập trần dùng trong bảng/danh sách: không nhãn, không lề dưới. */
function OTran({ giaTri, onLuu, doc, goiY, nhan }) {
  return (
    <input
      type="text" aria-label={nhan} defaultValue={giaTri ?? ''} readOnly={!!doc}
      placeholder={goiY} style={{ ...S.inp, ...(doc ? S.inpDoc : null) }}
      onBlur={(ev) => {
        const v = ev.target.value;
        if (!doc && v !== (giaTri ?? '')) onLuu(v);
      }} />
  );
}

function NutXoa({ onClick, doc, nhan }) {
  if (doc) return null;
  return (
    <button type="button" className="qt-xoa" onClick={onClick} title={nhan} aria-label={nhan}>
      <Trash2 size={13} />
    </button>
  );
}

function NutThem({ onClick, doc, children }) {
  if (doc) return null;
  return (
    <button type="button" className="qt-them" onClick={onClick}>
      <Plus size={13} />{children}
    </button>
  );
}

function Khoi({ so, tieuDe, phu, children }) {
  return (
    <section style={S.khoi}>
      <div style={S.khoiDau}>
        <span style={S.khoiSo}>{so}</span>
        <div style={{ minWidth: 0 }}>
          <h3 style={S.khoiTen}>{tieuDe}</h3>
          {phu && <p style={S.khoiPhu}>{phu}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Rong({ tieuDe, phu }) {
  return (
    <div style={S.rong}>
      <FileText size={30} strokeWidth={1.4} color={C.vien2} />
      <div style={{ fontWeight: 700, color: C.chu2, marginTop: 8 }}>{tieuDe}</div>
      <div style={{ marginTop: 4 }}>{phu}</div>
    </div>
  );
}

export default function ThongTinTab({
  mo, setMo, soDo, pSoanThao, mau = '#ea580c',
  chuaLuu = false, danhDauDaLuu = () => {}, danhDauChuaLuu = () => {},
}) {
  const [dangLuu, setDangLuu] = useState(false);
  const [bao, setBao] = useState(null);      // { id, tx }

  const pb = mo?.phienBan || null;
  const tt = pb?.trang_thai || 'draft';
  const ttNhan = TT[tt] || { ten: tt, mau: C.chu3 };

  // Khoá y hệt SoanThaoTab: bản đã ban hành / hết hiệu lực là tài liệu đang có
  // hiệu lực pháp lý trong hồ sơ ISO. RLS vẫn cho ghi đè, nên phải khoá ở đây.
  const banKhoa = tt === 'published' || tt === 'expired';
  const coSua = !!pSoanThao?.edit && !!pb && !banKhoa;

  const tl = useMemo(() => chuanHoa(pb?.tai_lieu), [pb?.tai_lieu]);

  // Bản mới nhất để nút Lưu đọc, phòng trường hợp trình duyệt không dời tiêu
  // điểm khi bấm nút (Safari) ⇒ closure của onClick có thể là bản trước blur.
  const tlRef = useRef(tl);
  useEffect(() => { tlRef.current = tl; });

  const noi = useCallback((tx) => setBao({ id: Math.random(), tx }), []);
  useEffect(() => {
    if (!bao) return undefined;
    const h = setTimeout(() => setBao(null), 4600);
    return () => clearTimeout(h);
  }, [bao]);

  /** Vá tai_lieu NGAY trên mo — nguồn sự thật dùng chung với SoanThaoTab.
   *  Nhận HÀM để hai lần vá trong cùng một batch React vẫn đọc bản mới nhất
   *  (thêm hai dòng liên tiếp mà đọc `tl` của render cũ là mất một dòng). */
  const sua = useCallback((fn) => {
    // Tab này sửa tai_lieu qua setMo, KHÔNG qua doiSoDo, nên phải tự bật cờ
    // "chưa lưu". Thiếu dòng này thì Admin sang tab Trình vẽ bấm Ban hành mà
    // không có gì cản, và mục 1–4 vừa gõ không nằm trong bản được ban hành.
    danhDauChuaLuu();
    setMo((m) => {
      if (!m?.phienBan) return m;
      const cu = chuanHoa(m.phienBan.tai_lieu);
      return { ...m, phienBan: { ...m.phienBan, tai_lieu: { ...cu, ...fn(cu) } } };
    });
  }, [setMo, danhDauChuaLuu]);

  // Bấm nút trong thanh công cụ ⇒ ép ô đang gõ rời tiêu điểm TRƯỚC, để lần gõ
  // cuối cùng kịp ghi vào mo. Safari không tự focus <button> khi bấm chuột.
  const chotO = () => {
    const el = document.activeElement;
    if (el && el !== document.body && typeof el.blur === 'function') el.blur();
  };

  const napMau = () => {
    if (!coSua) return;
    const nhom = mo?.quyTrinh?.nhom || '';
    const nh = NHOM.find(n => n.ma === nhom);
    if (!nh) {
      // mauTaiLieu() trả về mẫu RỖNG cho nhóm lạ. Đè nội dung đang có bằng
      // toàn ô trống rồi mới cho biết là không có mẫu thì đã muộn.
      alert(`Nhóm “${nhom || '—'}” không có mẫu sẵn, nạp lại sẽ xoá trắng mục 1–4 và 7.\n`
        + 'Hãy đổi nhóm bộ phận của quy trình ở tab Danh mục trước.');
      return;
    }
    const ok = window.confirm(
      `Nạp lại mẫu nhóm “${nh.ten}” sẽ ĐÈ toàn bộ mục 1, 2, 3, 4 và 7 đang có.\n`
      + 'Ba tên ký (người lập / kiểm tra / duyệt) được giữ nguyên.\n\nTiếp tục?');
    if (!ok) return;
    const m = mauTaiLieu(nhom);
    sua(() => ({
      mucDich: m.mucDich, phamVi: m.phamVi,
      vienDan: m.vienDan, dinhNghia: m.dinhNghia, hoSoLuu: m.hoSoLuu,
    }));
    noi(`Đã nạp lại mẫu nhóm ${nh.ten}. Bấm Lưu tài liệu để ghi xuống máy chủ.`);
  };

  const luu = async () => {
    if (!coSua || !pb?.id || dangLuu) return;
    const taiLieu = tlRef.current;
    // Gửi sơ đồ ĐANG VẼ chứ không phải pb.so_do: người soạn có thể vừa sửa lưu
    // đồ rồi sang đây bấm Lưu, gửi bản cũ là xoá phần vừa vẽ — đúng cái bẫy
    // ngược lại với bẫy tai_lieu ở SoanThaoTab.
    const soDoLuu = soDo ?? pb.so_do ?? null;
    setDangLuu(true);
    try {
      await api.luuNhap(pb.id, {
        so_do: soDoLuu, tai_lieu: taiLieu, ghi_chu_sua_doi: pb.ghi_chu_sua_doi,
      });
      danhDauDaLuu();
      setMo(m => (m?.phienBan
        ? { ...m, phienBan: { ...m.phienBan, so_do: soDoLuu, tai_lieu: taiLieu } }
        : m));
      noi(`Đã lưu tài liệu bản nháp v${pb.phien_ban || '—'}.`);
    } catch (e) {
      alert(e?.message || 'Không lưu được tài liệu.');
    } finally {
      setDangLuu(false);
    }
  };

  // ── Rỗng: chưa mở quy trình nào ───────────────────────────────
  if (!pb) {
    return (
      <div style={S.trong}>
        <style>{CSS}</style>
        <Rong
          tieuDe="Chưa mở quy trình nào."
          phu={(
            <>
              Sang tab <b>Danh mục quy trình</b> rồi bấm vào một thẻ để mở nó.
              <br />Mục đích, phạm vi, định nghĩa và hồ sơ lưu thuộc về một
              phiên bản cụ thể của quy trình.
            </>
          )} />
      </div>
    );
  }

  const doc = !coSua;          // doc = chỉ đọc
  const lyDoKhoa = banKhoa
    ? `Bản ${ttNhan.ten} chỉ để xem. Muốn sửa thì tạo phiên bản mới.`
    : !pSoanThao?.edit ? 'Bạn không có quyền sửa nội dung quy trình — màn hình chỉ để xem.'
      : '';

  return (
    <div className="qt-wrap">
      <style>{CSS}</style>

      {/* ── Thanh công cụ ───────────────────────────────────────── */}
      <div className="qt-bar" onPointerDownCapture={chotO}>
        <div style={S.title}>
          <span style={{ ...S.code, color: mau, background: mau + '18' }}>
            {mo?.quyTrinh?.ma_so || '—'}
          </span>
          <strong style={S.titleTx} title={mo?.quyTrinh?.ten || ''}>
            {mo?.quyTrinh?.ten || 'Chưa đặt tên'}
          </strong>
          <span style={S.ver}>v{pb.phien_ban || '—'}</span>
          <span style={{ ...S.pill, color: ttNhan.mau, background: ttNhan.mau + '22' }}>
            <span style={S.dot} />{ttNhan.ten}
          </span>
        </div>

        <span style={{ flex: 1 }} />

        {chuaLuu && !banKhoa && (
          <span style={S.chuaLuu} title="Thay đổi mới chỉ nằm trên màn hình, chưa xuống máy chủ.">
            <span style={S.chuaLuuCham} />Chưa lưu
          </span>
        )}
        {coSua && (
          <button type="button" className="qt-btn" style={S.btn} onClick={napMau}
            title="Điền lại mục 1–4 và 7 bằng mẫu sẵn của nhóm bộ phận">
            <Wand2 size={14} /> Nạp lại mẫu theo nhóm
          </button>
        )}
        {coSua && (
          <button type="button" className="qt-btn"
            style={{ ...S.btn, ...S.btnChinh, background: mau, boxShadow: `0 2px 10px ${mau}66` }}
            onClick={luu} disabled={dangLuu} title="Ghi mục 1–4 và 7 xuống máy chủ">
            {dangLuu ? <Loader2 size={14} className="qt-spin" /> : <Save size={14} />} Lưu tài liệu
          </button>
        )}
      </div>

      {lyDoKhoa && <div className="qt-khoa">{lyDoKhoa}</div>}

      {/* ── Nội dung ────────────────────────────────────────────── */}
      <div className="qt-body">
        <div className="qt-cot">

          <p style={S.dan}>
            Năm mục dưới đây là phần <b>chữ người soạn tự viết</b> trên bản in ISO.
            Mục <b>5. Lưu đồ</b> và <b>6. Diễn giải</b> sinh thẳng từ sơ đồ ở tab
            Trình vẽ, mục <b>8. Theo dõi sửa đổi</b> sinh từ danh sách phiên bản —
            không gõ tay ở đâu cả.
          </p>

          <div className="qt-doi">
            <Khoi so="1" tieuDe="Mục đích"
              phu="Quy trình này sinh ra để làm gì, kết quả mong muốn là gì.">
              <ONhap id="qt-mucdich" giaTri={tl.mucDich} doc={doc} dong={5}
                key={`md${tl.mucDich}`} onLuu={v => sua(() => ({ mucDich: v }))}
                goiY="VD: Quy định trình tự và trách nhiệm trong hoạt động sản xuất, bảo đảm sản phẩm làm ra đạt yêu cầu kỹ thuật." />
            </Khoi>

            <Khoi so="2" tieuDe="Phạm vi áp dụng"
              phu="Áp dụng cho hoạt động nào, bộ phận nào, từ đâu đến đâu.">
              <ONhap id="qt-phamvi" giaTri={tl.phamVi} doc={doc} dong={5}
                key={`pv${tl.phamVi}`} onLuu={v => sua(() => ({ phamVi: v }))}
                goiY="VD: Áp dụng cho toàn bộ hoạt động sản xuất tại nhà máy, từ khi tiếp nhận đơn hàng đến khi nhập kho thành phẩm." />
            </Khoi>
          </div>

          <Khoi so="3" tieuDe="Tài liệu viện dẫn"
            phu="Tiêu chuẩn, quy trình khác hoặc biểu mẫu mà quy trình này dựa vào.">
            {tl.vienDan.length === 0 && (
              <p style={S.trongDong}>Chưa có tài liệu viện dẫn nào.</p>
            )}
            {tl.vienDan.map((v, i) => (
              <div key={`vd${i}`} style={S.dong}>
                <span style={S.dongSo}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <OTran key={`vdo${i}|${v}`} giaTri={v} doc={doc}
                    nhan={`Tài liệu viện dẫn dòng ${i + 1}`}
                    goiY="VD: ISO 9001:2015 — điều khoản 8.5 Sản xuất và cung cấp dịch vụ"
                    onLuu={x => sua(c => ({
                      vienDan: c.vienDan.map((y, k) => (k === i ? x : y)),
                    }))} />
                </div>
                <NutXoa doc={doc} nhan={`Xoá dòng ${i + 1}`}
                  onClick={() => sua(c => ({ vienDan: c.vienDan.filter((y, k) => k !== i) }))} />
              </div>
            ))}
            <NutThem doc={doc}
              onClick={() => sua(c => ({ vienDan: [...c.vienDan, ''] }))}>Thêm tài liệu</NutThem>
          </Khoi>

          <Khoi so="4" tieuDe="Định nghĩa &amp; từ viết tắt"
            phu="Chữ viết tắt dùng trong lưu đồ và bảng diễn giải phải có mặt ở đây.">
            {tl.dinhNghia.length === 0 && (
              <p style={S.trongDong}>Chưa có định nghĩa nào.</p>
            )}
            {tl.dinhNghia.map((d, i) => (
              <div key={`dn${i}`} style={S.dong}>
                <span style={S.dongSo}>{i + 1}</span>
                <div style={{ width: 132, flexShrink: 0 }}>
                  <OTran key={`dnt${i}|${d.tu}`} giaTri={d.tu} doc={doc}
                    nhan={`Từ viết tắt dòng ${i + 1}`} goiY="VD: BOM"
                    onLuu={x => sua(c => ({
                      dinhNghia: c.dinhNghia.map((y, k) => (k === i ? { ...y, tu: x } : y)),
                    }))} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <OTran key={`dnn${i}|${d.nghia}`} giaTri={d.nghia} doc={doc}
                    nhan={`Nghĩa dòng ${i + 1}`} goiY="VD: Định mức nguyên vật liệu cho một sản phẩm"
                    onLuu={x => sua(c => ({
                      dinhNghia: c.dinhNghia.map((y, k) => (k === i ? { ...y, nghia: x } : y)),
                    }))} />
                </div>
                <NutXoa doc={doc} nhan={`Xoá định nghĩa dòng ${i + 1}`}
                  onClick={() => sua(c => ({ dinhNghia: c.dinhNghia.filter((y, k) => k !== i) }))} />
              </div>
            ))}
            <NutThem doc={doc}
              onClick={() => sua(c => ({ dinhNghia: [...c.dinhNghia, { tu: '', nghia: '' }] }))}>
              Thêm định nghĩa
            </NutThem>
          </Khoi>

          <Khoi so="7" tieuDe="Hồ sơ lưu"
            phu="Bằng chứng phải giữ lại sau khi chạy quy trình — phần đánh giá ISO soi kỹ nhất.">
            <div className="qt-tblbox">
              <table className="qt-tbl">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>TT</th>
                    <th style={{ width: '34%' }}>Tên hồ sơ</th>
                    <th style={{ width: '18%' }}>Bộ phận lưu</th>
                    <th style={{ width: '16%' }}>Thời gian lưu</th>
                    <th>Hình thức lưu</th>
                    {!doc && <th style={{ width: 40 }} aria-label="Xoá" />}
                  </tr>
                </thead>
                <tbody>
                  {tl.hoSoLuu.length === 0 && (
                    <tr>
                      <td colSpan={doc ? 5 : 6} style={S.oTrong}>
                        Chưa khai hồ sơ lưu nào. Mục 7 để trống là một điểm trừ khi đánh giá ISO.
                      </td>
                    </tr>
                  )}
                  {tl.hoSoLuu.map((h, i) => (
                    <tr key={`hs${i}`}>
                      <td style={S.oSo}>{i + 1}</td>
                      <td>
                        <OTran key={`hst${i}|${h.ten}`} giaTri={h.ten} doc={doc}
                          nhan={`Tên hồ sơ dòng ${i + 1}`} goiY="VD: Phiếu lệnh sản xuất (PSX)"
                          onLuu={x => sua(c => ({
                            hoSoLuu: c.hoSoLuu.map((y, k) => (k === i ? { ...y, ten: x } : y)),
                          }))} />
                      </td>
                      <td>
                        <OTran key={`hsb${i}|${h.boPhan}`} giaTri={h.boPhan} doc={doc}
                          nhan={`Bộ phận lưu dòng ${i + 1}`} goiY="VD: Kho"
                          onLuu={x => sua(c => ({
                            hoSoLuu: c.hoSoLuu.map((y, k) => (k === i ? { ...y, boPhan: x } : y)),
                          }))} />
                      </td>
                      <td>
                        <OTran key={`hsg${i}|${h.thoiGian}`} giaTri={h.thoiGian} doc={doc}
                          nhan={`Thời gian lưu dòng ${i + 1}`} goiY="VD: 24 tháng"
                          onLuu={x => sua(c => ({
                            hoSoLuu: c.hoSoLuu.map((y, k) => (k === i ? { ...y, thoiGian: x } : y)),
                          }))} />
                      </td>
                      <td>
                        <OTran key={`hsh${i}|${h.hinhThuc}`} giaTri={h.hinhThuc} doc={doc}
                          nhan={`Hình thức lưu dòng ${i + 1}`} goiY="VD: Bản cứng có ký giao nhận + bản mềm"
                          onLuu={x => sua(c => ({
                            hoSoLuu: c.hoSoLuu.map((y, k) => (k === i ? { ...y, hinhThuc: x } : y)),
                          }))} />
                      </td>
                      {!doc && (
                        <td style={{ textAlign: 'center' }}>
                          <NutXoa doc={doc} nhan={`Xoá hồ sơ dòng ${i + 1}`}
                            onClick={() => sua(c => ({
                              hoSoLuu: c.hoSoLuu.filter((y, k) => k !== i),
                            }))} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <NutThem doc={doc}
              onClick={() => sua(c => ({
                hoSoLuu: [...c.hoSoLuu, { ten: '', boPhan: '', thoiGian: '', hinhThuc: '' }],
              }))}>
              Thêm hồ sơ
            </NutThem>
          </Khoi>

          <Khoi so="✍" tieuDe="Chữ ký trên bản in"
            phu="Ba ô ký ở đầu trang A3. Ghi chức danh cũng được, không bắt buộc là tên người.">
            <div className="qt-ba">
              <ONhap id="qt-nguoilap" nhan="Người lập" giaTri={tl.nguoiLap} doc={doc}
                key={`nl${tl.nguoiLap}`} onLuu={v => sua(() => ({ nguoiLap: v }))}
                goiY="VD: Đỗ Hương Nguyên" />
              <ONhap id="qt-nguoikt" nhan="Người kiểm tra" giaTri={tl.nguoiKiemTra} doc={doc}
                key={`nk${tl.nguoiKiemTra}`} onLuu={v => sua(() => ({ nguoiKiemTra: v }))}
                goiY="VD: Trưởng phòng QA" />
              <ONhap id="qt-nguoiduyet" nhan="Người duyệt" giaTri={tl.nguoiDuyet} doc={doc}
                key={`nd${tl.nguoiDuyet}`} onLuu={v => sua(() => ({ nguoiDuyet: v }))}
                goiY="VD: Giám đốc Nhà máy" />
            </div>
          </Khoi>

          {coSua && (
            <p style={S.dan}>
              Nội dung gõ ở đây được giữ chung với tab Trình vẽ, nên bấm
              <b> Lưu nháp</b> bên đó cũng ghi luôn mục 1–4 và 7. Nhưng chưa bấm
              nút nào thì <b>chưa có gì xuống máy chủ</b> — đóng trình duyệt là mất.
            </p>
          )}
        </div>
      </div>

      {bao && (
        <div style={S.toasts}><div style={S.toast}>{bao.tx}</div></div>
      )}
    </div>
  );
}

/* ── Hover / bảng / responsive: chèn 1 thẻ <style> như ModuleShell,
      phần còn lại vẫn là style inline như các trang khác của app. ── */
const CSS = `
.qt-wrap { flex:1; display:flex; flex-direction:column; min-height:0; }
.qt-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:8px 12px;
  background:${C.mat}; border-bottom:1px solid ${C.vien}; }
.qt-btn { transition:filter .15s; }
.qt-btn:hover:not(:disabled) { filter:brightness(.96); }
.qt-btn:disabled { opacity:.45; cursor:not-allowed; }
.qt-spin { animation:qt-rot 1s linear infinite; }
@keyframes qt-rot { to { transform:rotate(360deg); } }

.qt-khoa { padding:8px 12px; background:${C.mat2}; border-bottom:1px solid ${C.vien};
  font-size:11.5px; font-weight:600; color:${C.chu2}; line-height:1.45; }

.qt-body { flex:1; overflow:auto; background:${C.nen}; padding:16px 18px 40px; }
.qt-cot { max-width:1080px; margin:0 auto; }
.qt-doi { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.qt-ba { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }

.qt-them { display:inline-flex; align-items:center; gap:5px; margin-top:8px; padding:6px 11px;
  border:1px dashed ${C.vien2}; background:${C.mat}; border-radius:9px; cursor:pointer;
  font-family:inherit; font-size:12px; font-weight:600; color:${C.chu2}; transition:all .14s; }
.qt-them:hover { background:${C.mat2}; border-style:solid; color:${C.chu}; }

.qt-xoa { flex-shrink:0; display:grid; place-items:center; width:30px; height:30px; padding:0;
  border:1px solid ${C.vien}; background:${C.mat}; border-radius:8px; cursor:pointer;
  color:${C.chu3}; transition:all .14s; }
.qt-xoa:hover { border-color:#fecaca; background:#fef2f2; color:${C.do}; }

.qt-tblbox { border:1px solid ${C.vien}; border-radius:10px; overflow:auto; background:${C.mat}; }
.qt-tbl { border-collapse:collapse; width:100%; min-width:720px; font-size:12.5px; }
.qt-tbl thead th { text-align:left; font-size:10px; font-weight:800; letter-spacing:.06em;
  text-transform:uppercase; color:${C.chu3}; background:${C.mat2}; padding:8px 9px;
  border-bottom:1px solid ${C.vien}; white-space:nowrap; }
.qt-tbl tbody td { padding:5px 6px; border-bottom:1px solid ${C.vien}; vertical-align:middle; }
.qt-tbl tbody tr:last-child td { border-bottom:none; }

@media (max-width:820px) {
  .qt-doi, .qt-ba { grid-template-columns:1fr; }
  .qt-body { padding:12px 10px 32px; }
}
@media (prefers-reduced-motion: reduce) {
  .qt-btn, .qt-them, .qt-xoa { transition:none; }
  .qt-spin { animation:none; }
}
`;

const S = {
  trong: { flex: 1, display: 'grid', placeItems: 'center', padding: 24, background: C.nen },
  rong: {
    padding: '26px 14px', textAlign: 'center', color: C.chu3, fontSize: 12.5, lineHeight: 1.6,
    background: C.mat, border: `1px dashed ${C.vien2}`, borderRadius: 13, maxWidth: 460,
  },

  title: { display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, maxWidth: '54%' },
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

  btn: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9,
    fontSize: 12.5, fontWeight: 600, border: `1px solid ${C.vien}`, background: C.mat,
    color: C.chu2, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  btnChinh: { border: 'none', color: '#fff' },

  dan: {
    margin: '0 0 14px', padding: '10px 12px', borderRadius: 10, background: C.mat,
    border: `1px solid ${C.vien}`, fontSize: 12, lineHeight: 1.6, color: C.chu2,
  },

  khoi: {
    background: C.mat, border: `1px solid ${C.vien}`, borderRadius: 12,
    padding: '13px 14px 14px', marginBottom: 14,
  },
  khoiDau: { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 11 },
  khoiSo: {
    flexShrink: 0, display: 'grid', placeItems: 'center', width: 24, height: 24,
    borderRadius: 7, background: C.mat2, color: C.chu2,
    fontFamily: MONO, fontSize: 12, fontWeight: 800,
  },
  khoiTen: { margin: 0, fontSize: 14, fontWeight: 800, color: C.chu, letterSpacing: '-.01em' },
  khoiPhu: { margin: '2px 0 0', fontSize: 11.5, lineHeight: 1.5, color: C.chu3 },

  fld: { marginBottom: 0 },
  lbl: { display: 'block', fontSize: 11, fontWeight: 700, color: C.chu2, marginBottom: 4 },
  inp: {
    width: '100%', padding: '7px 9px', border: `1px solid ${C.vien}`, borderRadius: 8,
    background: C.nen, outline: 'none', fontSize: 13, color: C.chu, fontFamily: 'inherit',
  },
  inpDoc: { background: C.mat2, color: C.chu2 },
  ta: { resize: 'vertical', minHeight: 92, lineHeight: 1.55 },
  note: { fontSize: 10.5, color: C.chu3, margin: '4px 0 0', lineHeight: 1.45 },

  dong: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  dongSo: {
    flexShrink: 0, width: 18, textAlign: 'right', fontFamily: MONO,
    fontSize: 11, fontWeight: 700, color: C.chu3,
  },
  trongDong: {
    margin: '0 0 4px', padding: '9px 10px', borderRadius: 9, background: C.mat2,
    fontSize: 11.5, color: C.chu3, lineHeight: 1.5,
  },
  oSo: { textAlign: 'center', fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.chu3 },
  oTrong: { padding: '14px 10px', textAlign: 'center', fontSize: 11.5, color: C.chu3, lineHeight: 1.5 },

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
