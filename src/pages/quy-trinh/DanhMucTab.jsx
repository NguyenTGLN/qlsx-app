import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Trash2, X, Loader2, FileText } from 'lucide-react';
import { NHOM, maSoTiepTheo } from '../../lib/quyTrinhMau';
import * as api from '../../lib/quyTrinhApi';

/* ═══════════════════════════════════════════════════════════════
   DANH MỤC QUY TRÌNH — rail lọc bên trái, lưới thẻ bên phải.
   Bố cục/màu chuyển từ docs/mockups/quy-trinh-mockup.html (#v-list),
   biến CSS đổi sang giá trị thật của app.
   Tệp này KHÔNG chạm Supabase trực tiếp — mọi truy vấn qua quyTrinhApi.
   ═══════════════════════════════════════════════════════════════ */

// Bảng màu lấy từ :root chế độ sáng của mockup.
const C = {
  nen: '#f6f8fb', mat: '#ffffff', mat2: '#f1f5f9', mat3: '#e9eef5',
  vien: '#e2e8f0', vien2: '#cbd5e1',
  chu: '#0f172a', chu2: '#475569', chu3: '#748094',
  do: '#dc2626',
};
const MONO = "'Cascadia Mono',Consolas,'SF Mono',ui-monospace,monospace";

// Nhãn + màu pill, khớp cột trang_thai trong sql/quy_trinh.sql.
// Mockup gọi là ok/dead, DB gọi published/expired.
const TT = {
  draft:     { ten: 'Bản nháp',     mau: '#64748b' },
  wait:      { ten: 'Chờ duyệt',    mau: '#2563eb' },
  published: { ten: 'Đã ban hành',  mau: '#16a34a' },
  expired:   { ten: 'Hết hiệu lực', mau: '#dc2626' },
};

// Rail CHỈ lọc ba trạng thái mà cột quy_trinh.trang_thai thật sự nhận.
// 'expired' cố ý không có mặt: hết hiệu lực là trạng thái của một PHIÊN BẢN, và
// khi một bản hết hiệu lực thì đã có bản mới ban hành ⇒ đầu bảng vẫn 'published'.
// Một ô lọc không bao giờ khớp dòng nào còn tệ hơn là không có ô lọc.
// Nhãn 'expired' vẫn giữ trong TT vì bảng theo dõi sửa đổi có hiện phiên bản cũ.
const TT_DS = ['draft', 'wait', 'published'];

const ngayVn = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/** Số bước = số khối trong sơ đồ, trừ Bắt đầu/Kết thúc. null khi chưa có sơ đồ.
 *  Bảng quy_trinh KHÔNG có cột so_do (nó nằm ở quy_trinh_phien_ban), nên với dữ
 *  liệu dsQuyTrinh() trả về hôm nay hàm này luôn trả null và thẻ bỏ hẳn ô "N bước"
 *  — thà thiếu một con số còn hơn bắn một truy vấn cho MỖI thẻ. Ngày nào
 *  dsQuyTrinh() kèm được sơ đồ bản hiện hành thì ô này tự hiện lại, không phải
 *  sửa gì ở đây. */
const demBuoc = (soDo) => {
  const nodes = soDo && soDo.nodes;
  if (!Array.isArray(nodes)) return null;
  return nodes.filter(n => n && n.t !== 'start' && n.t !== 'end').length;
};

function Pill({ mau, children }) {
  return (
    <span style={{ ...S.pill, color: mau, background: mau + '22' }}>
      <span style={S.dot} />{children}
    </span>
  );
}

function Rong({ tieuDe, phu, nut }) {
  return (
    <div style={S.rong}>
      <FileText size={30} strokeWidth={1.5} color={C.vien2} />
      <div style={{ fontWeight: 700, color: C.chu2, marginTop: 8 }}>{tieuDe}</div>
      <div style={{ marginTop: 3 }}>{phu}</div>
      {nut}
    </div>
  );
}

export default function DanhMucTab({ user, isAdmin, ds, onMo, pDanhMuc, napLai, mau = '#ea580c' }) {
  // ds có thể là null (nạp lỗi) hoặc [] (chưa chạy SQL / danh mục trống).
  const dsAn = useMemo(() => (Array.isArray(ds) ? ds : []), [ds]);
  const quyen = pDanhMuc || {};

  const [nhomLoc, setNhomLoc] = useState('');
  const [ttLoc, setTtLoc] = useState('');
  const [tim, setTim] = useState('');

  const [hienModal, setHienModal] = useState(false);
  const [form, setForm] = useState({ ten: '', nhom: NHOM[0].ma });
  const [loiModal, setLoiModal] = useState('');
  const [dangTao, setDangTao] = useState(false);
  const [dangXoa, setDangXoa] = useState(null);

  // Số đếm ở rail luôn tính trên TOÀN danh sách, không theo bộ lọc đang bật —
  // nếu chọn "Chờ duyệt" mà số của từng nhóm tụt theo thì con số hết nghĩa.
  const demNhom = useMemo(() => {
    const m = {};
    for (const q of dsAn) m[q?.nhom] = (m[q?.nhom] || 0) + 1;
    return m;
  }, [dsAn]);
  const demTt = useMemo(() => {
    const m = {};
    for (const q of dsAn) m[q?.trang_thai] = (m[q?.trang_thai] || 0) + 1;
    return m;
  }, [dsAn]);

  const loc = useMemo(() => {
    const k = tim.trim().toLowerCase();
    return dsAn.filter(q =>
      (!nhomLoc || q?.nhom === nhomLoc) &&
      (!ttLoc || q?.trang_thai === ttLoc) &&
      (!k || String(q?.ten || '').toLowerCase().includes(k)
          || String(q?.ma_so || '').toLowerCase().includes(k)));
  }, [dsAn, nhomLoc, ttLoc, tim]);

  const maDaCo = useMemo(() => dsAn.map(q => q?.ma_so), [dsAn]);

  // maSoTiepTheo NÉM khi nhóm không nằm trong NHOM. Bắt ngay tại đây: gọi trần
  // trong thân render thì một giá trị nhóm lạ sẽ quật trắng cả màn hình.
  const maMoi = useMemo(() => {
    try { return { ma: maSoTiepTheo(form.nhom, maDaCo), loi: '' }; }
    catch (e) { return { ma: '', loi: e?.message || 'Không sinh được mã số cho nhóm này.' }; }
  }, [form.nhom, maDaCo]);

  const dongModal = () => { setHienModal(false); setLoiModal(''); };

  useEffect(() => {
    if (!hienModal) return undefined;
    const esc = (e) => { if (e.key === 'Escape' && !dangTao) { setHienModal(false); setLoiModal(''); } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [hienModal, dangTao]);

  // onMo là hàm async ở QuyTrinhApp (nó tải danh sách phiên bản) — không bắt lỗi
  // ở đây thì lỗi mạng thành promise văng ra console, người dùng bấm mãi không thấy gì.
  const moThe = async (qt) => {
    try { await onMo(qt); }
    catch (e) { alert(e?.message || 'Không mở được quy trình này.'); }
  };

  const xoa = async (ev, qt) => {
    ev.stopPropagation();
    if (!window.confirm(
      `Xoá quy trình ${qt.ma_so} — ${qt.ten}?\n\n`
      + 'Toàn bộ nội dung đã soạn của bản nháp sẽ mất và không khôi phục được.')) return;
    setDangXoa(qt.id);
    try {
      await api.xoaQuyTrinh(qt.id);
      await napLai();
    } catch (e) {
      alert(e?.message || 'Không xoá được quy trình.');
    } finally {
      setDangXoa(null);
    }
  };

  const taoMoi = async () => {
    const ten = form.ten.trim();
    if (!ten) { setLoiModal('Chưa nhập tên quy trình.'); return; }
    if (maMoi.loi) { setLoiModal(maMoi.loi); return; }
    // nguoi_soan là MÃ nhân viên: RLS đem cột này so với auth.jwt()->>'nv_id'.
    // Gửi user.name (tên hiển thị) vào đây thì insert bị policy qt_ins chặn thẳng.
    if (!user?.id) { setLoiModal('Không xác định được mã người soạn — hãy đăng nhập lại.'); return; }

    setDangTao(true); setLoiModal('');
    try {
      const { quyTrinh } = await api.taoQuyTrinh({
        ten, nhom: form.nhom, nguoiSoan: user.id, maDaCo,
      });
      await napLai();
      setHienModal(false);
      setForm({ ten: '', nhom: form.nhom });
      await moThe(quyTrinh);
    } catch (e) {
      setLoiModal(e?.message || 'Không tạo được quy trình.');
    } finally {
      setDangTao(false);
    }
  };

  const nhomDangXem = NHOM.find(n => n.ma === nhomLoc);
  const coBoLoc = !!(nhomLoc || ttLoc || tim.trim());

  const railItem = (dangChon, onClick, mauCham, nhan, so, key) => (
    <button key={key} className="qt-rail-item" onClick={onClick}
      aria-pressed={dangChon}
      style={dangChon ? { background: mau + '14', color: mau } : undefined}>
      {mauCham && <span style={{ ...S.swatch, background: mauCham }} />}
      <span style={S.railNhan}>{nhan}</span>
      <span style={{ ...S.railSo, color: dangChon ? mau : C.chu3 }}>{so}</span>
    </button>
  );

  return (
    <div className="qt-wrap">
      <style>{CSS}</style>

      {/* ── Rail lọc ───────────────────────────────────────────── */}
      <aside className="qt-rail">
        <h3 style={S.railH}>Nhóm bộ phận</h3>
        {railItem(nhomLoc === '', () => setNhomLoc(''), mau, 'Tất cả', dsAn.length, 'g-all')}
        {NHOM.map(n => railItem(
          nhomLoc === n.ma, () => setNhomLoc(n.ma), n.mau, n.ten, demNhom[n.ma] || 0, 'g-' + n.ma))}

        <h3 style={{ ...S.railH, marginTop: 16 }}>Trạng thái</h3>
        {railItem(ttLoc === '', () => setTtLoc(''), null, 'Tất cả trạng thái', dsAn.length, 's-all')}
        {TT_DS.map(k => railItem(
          ttLoc === k, () => setTtLoc(k), TT[k].mau, TT[k].ten, demTt[k] || 0, 's-' + k))}
      </aside>

      {/* ── Danh sách ──────────────────────────────────────────── */}
      <div className="qt-main">
        <div style={S.top}>
          <h2 style={S.h2}>{nhomDangXem ? nhomDangXem.ten : 'Tất cả quy trình'}</h2>
          <Pill mau={mau}>{loc.length} quy trình</Pill>
        </div>
        <p style={S.sub}>
          Quy trình đã ban hành là bản có hiệu lực để in và dán tại nơi làm việc.
          Bản nháp và bản chờ duyệt không xuất được tài liệu chính thức.
        </p>

        <div style={{ ...S.top, marginBottom: 14 }}>
          <label style={S.search}>
            <Search size={14} color={C.chu3} />
            <input value={tim} onChange={e => setTim(e.target.value)} style={S.searchInp}
              placeholder="Tìm theo tên hoặc mã quy trình…" aria-label="Tìm quy trình" />
          </label>
          {quyen.create && (
            <button onClick={() => { setForm(f => ({ ...f, ten: '' })); setLoiModal(''); setHienModal(true); }}
              className="qt-btn" style={{ ...S.btn, ...S.btnChinh, background: mau, boxShadow: `0 2px 10px ${mau}66` }}>
              <Plus size={14} /> Tạo quy trình mới
            </button>
          )}
        </div>

        {loc.length > 0 ? (
          <div className="qt-grid">
            {loc.map(q => {
              const nh = NHOM.find(n => n.ma === q?.nhom);
              const gmau = nh ? nh.mau : C.vien2;
              const tt = TT[q?.trang_thai] || { ten: q?.trang_thai || 'Không rõ', mau: C.chu3 };
              const soBuoc = demBuoc(q?.so_do);
              const hieuLuc = ngayVn(q?.ngay_hieu_luc);
              // Hai điều kiện đầu là yêu cầu của màn hình. Điều kiện thứ ba soi
              // đúng policy qt_del `using (trang_thai='draft' and (nguoi_soan = nv_id
              // or ADMIN))`: RLS chặn DELETE bằng cách LỌC MẤT dòng, PostgREST trả
              // 204 KHÔNG kèm error — bấm Xoá nhầm người sẽ "im như thóc", thẻ vẫn
              // nằm đó mà không một lời báo. Thà đừng hiện nút.
              const choXoa = quyen.delete && q?.trang_thai === 'draft'
                && (isAdmin || (!!user?.id && q?.nguoi_soan === user.id));

              const muc = [];
              if (soBuoc !== null) muc.push(<span key="b"><b style={S.metaB}>{soBuoc}</b> bước</span>);
              muc.push(<span key="g">{nh ? nh.ten : (q?.nhom || '—')}</span>);
              if (hieuLuc) muc.push(<span key="h">Hiệu lực <b style={S.metaB}>{hieuLuc}</b></span>);
              muc.push(<span key="n">{q?.nguoi_soan || '—'}</span>);

              return (
                <div key={q.id} className="qt-card" role="button" tabIndex={0}
                  title={`Mở lưu đồ ${q.ma_so}`}
                  onClick={() => moThe(q)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); moThe(q); }
                  }}
                  style={{ ...S.card, borderLeft: `3px solid ${gmau}` }}>
                  <div style={S.cardTop}>
                    <span style={{ ...S.code, color: gmau }}>{q.ma_so}</span>
                    <Pill mau={tt.mau}>{tt.ten}</Pill>
                  </div>
                  <h4 style={S.cardH}>{q.ten}</h4>
                  <div style={S.meta}>
                    {muc.flatMap((m, i) => i === 0 ? [m]
                      : [<span key={'sep' + i} style={{ opacity: 0.55 }}>·</span>, m])}
                  </div>
                  <div style={S.foot}>
                    {q?.phien_ban && <span style={S.ver}>v{q.phien_ban}</span>}
                    <span style={{ fontSize: 11.5, color: C.chu3, fontWeight: 500 }}>
                      Cập nhật {ngayVn(q?.updated_at) || ngayVn(q?.created_at) || '—'}
                    </span>
                    <span style={{ marginLeft: 'auto' }} />
                    {choXoa && (
                      <button className="qt-btn" style={{ ...S.btn, ...S.btnNho, color: C.do }}
                        onClick={e => xoa(e, q)} disabled={dangXoa === q.id}
                        title="Xoá quy trình nháp">
                        {dangXoa === q.id
                          ? <Loader2 size={12} className="spin" />
                          : <Trash2 size={12} />} Xoá
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : dsAn.length === 0 ? (
          <Rong
            tieuDe="Chưa có quy trình nào trong danh mục."
            phu={quyen.create
              ? 'Bấm “Tạo quy trình mới” để dựng quy trình đầu tiên. Nếu bạn vừa thấy thông báo lỗi khi tải, hãy bấm “Làm mới” ở đầu trang.'
              : 'Khi có người soạn quy trình, danh sách sẽ hiện ở đây.'} />
        ) : (
          <Rong
            tieuDe="Không có quy trình nào khớp bộ lọc."
            phu={`Đang lọc ${nhomDangXem ? `nhóm ${nhomDangXem.ten}` : 'tất cả nhóm'}`
              + `${ttLoc ? `, trạng thái ${TT[ttLoc].ten}` : ''}`
              + `${tim.trim() ? `, từ khoá “${tim.trim()}”` : ''}.`}
            nut={coBoLoc && (
              <button className="qt-btn" onClick={() => { setNhomLoc(''); setTtLoc(''); setTim(''); }}
                style={{ ...S.btn, ...S.btnNho, marginTop: 10 }}>Xoá bộ lọc</button>
            )} />
        )}
      </div>

      {/* ── Modal tạo mới ──────────────────────────────────────── */}
      {hienModal && (
        <div style={S.mask}
          onClick={e => { if (e.target === e.currentTarget && !dangTao) dongModal(); }}>
          <div style={S.modal} role="dialog" aria-modal="true" aria-labelledby="qt-modal-title">
            <div style={S.modalH}>
              <div>
                <h2 id="qt-modal-title" style={S.modalTitle}>Tạo quy trình mới</h2>
                <p style={S.modalSub}>Mã số sinh tự động theo nhóm bộ phận bạn chọn.</p>
              </div>
              <button className="qt-x" onClick={dongModal} disabled={dangTao}
                style={S.x} aria-label="Đóng"><X size={15} /></button>
            </div>

            <div style={S.modalB}>
              <div style={S.fld}>
                <label htmlFor="qt-ten" style={S.lbl}>Tên quy trình</label>
                <input id="qt-ten" style={S.inp} value={form.ten} autoFocus
                  onChange={e => setForm(f => ({ ...f, ten: e.target.value }))}
                  placeholder="VD: Quy trình kiểm tra QC đầu vào nguyên vật liệu" />
              </div>

              <div style={S.row2}>
                <div style={S.fld}>
                  <label htmlFor="qt-nhom" style={S.lbl}>Nhóm bộ phận</label>
                  <select id="qt-nhom" style={S.inp} value={form.nhom}
                    onChange={e => setForm(f => ({ ...f, nhom: e.target.value }))}>
                    {NHOM.map(n => <option key={n.ma} value={n.ma}>{n.ten}</option>)}
                  </select>
                </div>
                <div style={S.fld}>
                  <label htmlFor="qt-ma" style={S.lbl}>Mã số</label>
                  <input id="qt-ma" readOnly value={maMoi.ma || '—'}
                    style={{ ...S.inp, fontFamily: MONO, fontWeight: 700,
                      color: maMoi.loi ? C.do : C.chu }} />
                </div>
              </div>

              <div style={{ ...S.fld, marginBottom: 0 }}>
                <label htmlFor="qt-nguoi" style={S.lbl}>Người soạn</label>
                {/* Ô này chỉ để NGƯỜI ĐỌC nhận ra mình — giá trị gửi lên API là user.id. */}
                <input id="qt-nguoi" readOnly value={user?.name || user?.id || '—'} style={S.inp} />
                <p style={S.note}>
                  Quy trình mới luôn ở trạng thái <b>Bản nháp</b>. Chỉ khi người có quyền
                  duyệt bấm ban hành thì bản in mới mang dấu hiệu lực.
                </p>
              </div>

              {(loiModal || maMoi.loi) && (
                <div style={S.loi} role="alert">{loiModal || maMoi.loi}</div>
              )}
            </div>

            <div style={S.modalF}>
              <button className="qt-btn" onClick={dongModal} disabled={dangTao} style={S.btn}>Huỷ</button>
              <button className="qt-btn" onClick={taoMoi} disabled={dangTao || !!maMoi.loi}
                style={{ ...S.btn, ...S.btnChinh, background: mau, boxShadow: `0 2px 10px ${mau}66` }}>
                {dangTao ? <><Loader2 size={14} className="spin" /> Đang tạo…</> : 'Tạo & mở trình vẽ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Hover / responsive: theo cách ModuleShell làm — chèn 1 thẻ <style>,
      phần còn lại vẫn là style inline như các trang khác của app. ── */
const CSS = `
.qt-wrap { flex:1; display:grid; grid-template-columns:224px 1fr; min-height:0; }
.qt-rail { border-right:1px solid ${C.vien}; background:${C.mat}; padding:14px 10px; overflow-y:auto; }
.qt-rail-item { width:100%; display:flex; align-items:center; gap:9px; padding:8px 9px;
  margin-bottom:2px; border:none; background:none; border-radius:9px; text-align:left;
  cursor:pointer; font-family:inherit; font-size:13px; font-weight:600; color:${C.chu2};
  transition:background .15s, color .15s; }
.qt-rail-item:hover { background:${C.mat2}; color:${C.chu}; }
.qt-main { overflow-y:auto; padding:16px 18px 28px; min-width:0; }
.qt-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(310px,1fr)); gap:11px; }
.qt-card { transition:border-color .18s, box-shadow .18s, transform .18s; }
.qt-card:hover { border-color:${C.vien2}; box-shadow:0 6px 20px -8px rgba(15,23,42,.18);
  transform:translateY(-2px); }
.qt-btn { transition:filter .15s, background .15s, border-color .15s; }
.qt-btn:hover:not(:disabled) { filter:brightness(0.96); }
.qt-btn:disabled { opacity:.6; cursor:not-allowed; }
.qt-x:hover:not(:disabled) { background:${C.mat3}; color:${C.chu}; }
@media (max-width:860px) {
  .qt-wrap { grid-template-columns:1fr; }
  .qt-rail { display:none; }
  .qt-main { padding:12px 12px 24px; }
  .qt-card:hover { transform:none; }
}
@media (prefers-reduced-motion: reduce) {
  .qt-card, .qt-rail-item, .qt-btn { transition:none; }
  .qt-card:hover { transform:none; }
}
`;

const S = {
  railH: {
    margin: '0 0 8px 6px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em',
    textTransform: 'uppercase', color: C.chu3,
  },
  railNhan: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  railSo: { marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  swatch: { width: 9, height: 9, borderRadius: 3, flexShrink: 0 },

  top: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 },
  h2: { margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', color: C.chu },
  sub: { margin: '0 0 16px', fontSize: 12.5, color: C.chu3, lineHeight: 1.5 },

  search: {
    display: 'flex', alignItems: 'center', gap: 7, padding: '7px 11px', borderRadius: 9,
    border: `1px solid ${C.vien}`, background: C.mat, minWidth: 220, flex: 1, maxWidth: 360,
  },
  searchInp: {
    border: 'none', background: 'none', outline: 'none', width: '100%',
    fontSize: 13, color: C.chu, fontFamily: 'inherit', minWidth: 0,
  },

  pill: {
    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
    padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap', letterSpacing: '.01em',
  },
  dot: { width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 },

  card: {
    background: C.mat, border: `1px solid ${C.vien}`, borderRadius: 13, padding: '13px 14px',
    boxShadow: '0 1px 2px rgba(15,23,42,.06)', display: 'flex', flexDirection: 'column',
    gap: 9, cursor: 'pointer', textAlign: 'left', minWidth: 0,
  },
  cardTop: { display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  code: {
    fontFamily: MONO, fontSize: 11.5, fontWeight: 600, letterSpacing: '.01em',
    fontVariantNumeric: 'tabular-nums',
  },
  cardH: {
    margin: 0, fontSize: 13.5, fontWeight: 700, lineHeight: 1.35,
    letterSpacing: '-.005em', color: C.chu,
  },
  meta: {
    display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap',
    fontSize: 11.5, color: C.chu3, fontWeight: 500,
  },
  metaB: { color: C.chu2, fontWeight: 600 },
  foot: {
    display: 'flex', alignItems: 'center', gap: 6, paddingTop: 9,
    borderTop: `1px solid ${C.vien}`, marginTop: 1, flexWrap: 'wrap',
  },
  ver: {
    fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.chu2,
    background: C.mat2, padding: '2px 6px', borderRadius: 5,
  },

  btn: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9,
    fontSize: 12.5, fontWeight: 600, border: `1px solid ${C.vien}`, background: C.mat,
    color: C.chu2, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  btnChinh: { border: 'none', color: '#fff' },
  btnNho: { padding: '5px 9px', fontSize: 11.5, borderRadius: 7 },

  rong: {
    gridColumn: '1/-1', padding: '30px 14px', textAlign: 'center',
    color: C.chu3, fontSize: 12.5, lineHeight: 1.6,
    background: C.mat, border: `1px dashed ${C.vien2}`, borderRadius: 13,
  },

  mask: {
    position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,.45)',
    backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
  },
  modal: {
    width: 'min(560px,100%)', maxHeight: '88dvh', overflowY: 'auto', background: C.mat,
    borderRadius: 16, border: `1px solid ${C.vien}`,
    boxShadow: '0 18px 48px -16px rgba(15,23,42,.32)',
  },
  modalH: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '15px 17px',
    borderBottom: `1px solid ${C.vien}`,
  },
  modalTitle: { margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-.01em', color: C.chu },
  modalSub: { margin: '2px 0 0', fontSize: 12, color: C.chu3 },
  modalB: { padding: '15px 17px' },
  modalF: {
    display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '13px 17px',
    borderTop: `1px solid ${C.vien}`,
  },
  x: {
    marginLeft: 'auto', border: 'none', background: C.mat2, color: C.chu2, width: 28, height: 28,
    borderRadius: 8, display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0,
  },

  fld: { marginBottom: 11 },
  lbl: { display: 'block', fontSize: 11, fontWeight: 700, color: C.chu2, marginBottom: 4 },
  inp: {
    width: '100%', padding: '7px 9px', border: `1px solid ${C.vien}`, borderRadius: 8,
    background: C.nen, outline: 'none', fontSize: 13, color: C.chu, fontFamily: 'inherit',
  },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 },
  note: { fontSize: 10.5, color: C.chu3, margin: '4px 0 0', lineHeight: 1.45 },
  loi: {
    marginTop: 12, padding: '9px 11px', borderRadius: 9, fontSize: 12, fontWeight: 600,
    color: C.do, background: '#fef2f2', border: '1px solid #fecaca',
  },
};
