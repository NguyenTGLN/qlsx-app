import React, { useMemo } from 'react';
import { GitBranch } from 'lucide-react';
import { LOAI_KHOI, timKhoi } from '../../lib/quyTrinhSoDo';
import { dongDienGiai } from '../../lib/quyTrinhDienGiai';

/* ═══════════════════════════════════════════════════════════════
   BẢNG DIỄN GIẢI — mục 6 của bản in ISO.

   Bảng này KHÔNG có dữ liệu riêng: nó là hình chiếu của sơ đồ, do
   dongDienGiai() dựng ra. Thêm một khối ở tab Trình vẽ là có ngay một
   dòng ở đây; sửa ở đây ghi NGƯỢC vào chính khối đó.

   Cột "Người thực hiện" CỐ Ý chỉ để đọc: nó suy ra từ CỘT của khối
   (soDo.lanes[n.lane].owner). Cho sửa ở đây là dựng nguồn sự thật thứ
   hai — bảng nói một đằng, lưu đồ in ra một nẻo.

   Bố cục/màu chuyển từ docs/mockups/quy-trinh-mockup.html (#v-table).
   Tệp này KHÔNG chạm Supabase: mọi thay đổi đi qua doiSoDo, và xuống
   máy chủ bằng nút "Lưu nháp" ở tab Trình vẽ lưu đồ.
   ═══════════════════════════════════════════════════════════════ */

// Bảng màu lấy từ :root chế độ sáng của mockup.
const C = {
  nen: '#f6f8fb', mat: '#ffffff', mat2: '#f1f5f9',
  vien: '#e2e8f0', vien2: '#cbd5e1',
  chu: '#0f172a', chu2: '#475569', chu3: '#748094',
  do: '#dc2626', xanh: '#16a34a',
};
const MONO = "'Cascadia Mono',Consolas,'SF Mono',ui-monospace,monospace";

const TT = {
  draft:     { ten: 'Bản nháp',     mau: '#64748b' },
  wait:      { ten: 'Chờ duyệt',    mau: '#2563eb' },
  published: { ten: 'Đã ban hành',  mau: '#16a34a' },
  expired:   { ten: 'Hết hiệu lực', mau: '#dc2626' },
};

const rong = v => !String(v ?? '').trim() || String(v).trim() === '—';

/* ── Ô nhập ghi khi RỜI Ô, không phải mỗi lần gõ ────────────────
   Bắt buộc, không phải để tối ưu: doiSoDo đẩy MỘT bản sơ đồ vào ngăn
   xếp hoàn tác mỗi lần gọi. Ghi theo từng ký tự thì gõ một câu 40 chữ
   là 40 bước hoàn tác, và Ctrl+Z ở tab Trình vẽ hết dùng được.
   defaultValue + key theo giá trị ở nơi gọi ⇒ hoàn tác/đổi cột thì ô
   tự dựng lại theo sơ đồ mới. */
function ONhap({ giaTri, onLuu, doc, dong, goiY, nhan }) {
  const luu = (ev) => {
    const v = ev.target.value;
    if (!doc && v !== (giaTri ?? '')) onLuu(v);
  };
  const chung = {
    'aria-label': nhan, defaultValue: giaTri ?? '', onBlur: luu, readOnly: !!doc,
    placeholder: goiY, style: { ...S.inp, ...(doc ? S.inpDoc : null) },
  };
  return dong
    ? <textarea {...chung} rows={dong} style={{ ...chung.style, ...S.ta }} />
    : <input type="text" {...chung} />;
}

function Rong({ tieuDe, phu }) {
  return (
    <div style={S.rong}>
      <GitBranch size={30} strokeWidth={1.4} color={C.vien2} />
      <div style={{ fontWeight: 700, color: C.chu2, marginTop: 8 }}>{tieuDe}</div>
      <div style={{ marginTop: 4 }}>{phu}</div>
    </div>
  );
}

export default function DienGiaiTab({ mo, soDo, doiSoDo, pSoanThao, mau = '#ea580c' }) {
  const tt = mo?.phienBan?.trang_thai || 'draft';
  const ttNhan = TT[tt] || { ten: tt, mau: C.chu3 };

  // Khoá y hệt SoanThaoTab: bản đã ban hành / hết hiệu lực là tài liệu đang có
  // hiệu lực pháp lý trong hồ sơ ISO. RLS vẫn cho ghi đè, nên phải khoá ở đây.
  const banKhoa = tt === 'published' || tt === 'expired';
  const coSua = !!pSoanThao?.edit && !!soDo && !banKhoa;

  // dongDienGiai() tự trả [] khi soDo là null hoặc chưa có khối nào.
  const dong = useMemo(() => dongDienGiai(soDo), [soDo]);

  /** Ghi ngược một trường vào khối. Đi qua doiSoDo nên Ctrl+Z ở tab Trình vẽ
   *  hoàn tác được đúng một lần gõ ở bảng này. */
  const va = (khoiId, k, v) => {
    if (!coSua || !soDo) return;
    doiSoDo({
      ...soDo,
      nodes: soDo.nodes.map(n => (n.id === khoiId ? { ...n, [k]: v } : n)),
    });
  };

  // ── Rỗng: chưa mở quy trình nào ───────────────────────────────
  if (!soDo) {
    return (
      <div style={S.trong}>
        <style>{CSS}</style>
        <Rong
          tieuDe="Chưa mở quy trình nào."
          phu={(
            <>
              Sang tab <b>Danh mục quy trình</b> rồi bấm vào một thẻ để mở lưu đồ của nó.
              <br />Bảng diễn giải sinh thẳng từ lưu đồ, nên chưa có lưu đồ thì
              chưa có gì để diễn giải.
            </>
          )} />
      </div>
    );
  }

  const doc = !coSua;
  const lyDoKhoa = banKhoa
    ? `Bản ${ttNhan.ten} chỉ để xem. Muốn sửa thì tạo phiên bản mới.`
    : !pSoanThao?.edit ? 'Bạn không có quyền sửa nội dung quy trình — màn hình chỉ để xem.'
      : '';

  return (
    <div className="qd-wrap">
      <style>{CSS}</style>

      <div className="qd-bar">
        <div style={S.title}>
          <span style={{ ...S.code, color: mau, background: mau + '18' }}>
            {mo?.quyTrinh?.ma_so || '—'}
          </span>
          <strong style={S.titleTx} title={mo?.quyTrinh?.ten || ''}>
            {mo?.quyTrinh?.ten || 'Chưa đặt tên'}
          </strong>
          <span style={S.ver}>v{mo?.phienBan?.phien_ban || '—'}</span>
          <span style={{ ...S.pill, color: ttNhan.mau, background: ttNhan.mau + '22' }}>
            <span style={S.dot} />{ttNhan.ten}
          </span>
        </div>
        <span style={{ flex: 1 }} />
        <span style={S.dem}>{dong.length} bước</span>
      </div>

      {lyDoKhoa && <div className="qd-khoa">{lyDoKhoa}</div>}

      <div className="qd-body">
        <div className="qd-dau">
          <h2 style={S.h2}>II. Diễn giải lưu đồ</h2>
          <p style={S.h2p}>
            Bảng này sinh thẳng từ lưu đồ — thêm một khối ở tab <b>Trình vẽ lưu đồ</b> là
            có ngay một dòng ở đây, và số thứ tự bước chạy theo vị trí khối trên trang.
            {coSua && (
              <> Sửa ở bảng ghi ngược vào chính khối đó; bấm <b>Lưu nháp</b> bên
                tab Trình vẽ để ghi xuống máy chủ.</>
            )}
          </p>
        </div>

        {dong.length === 0 ? (
          <Rong
            tieuDe="Lưu đồ chưa có bước nào."
            phu={(
              <>
                Lưu đồ mới chỉ có khối <b>Bắt đầu</b> và <b>Kết thúc</b> — hai khối này
                không vào bảng diễn giải.
                <br />Sang tab <b>Trình vẽ lưu đồ</b>, bấm một khối rồi bấm nút <b>＋</b> để
                thêm bước đầu tiên.
              </>
            )} />
        ) : (
          <div className="qd-tblbox">
            <table className="qd-tbl">
              <thead>
                <tr>
                  <th style={{ width: 210 }}>Bước</th>
                  <th style={{ width: 140 }}>Người thực hiện</th>
                  <th>Diễn giải chi tiết</th>
                  <th style={{ width: 190 }}>Hồ sơ / Biểu mẫu</th>
                  <th style={{ width: 96 }}>Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {dong.map((r) => {
                  const n = timKhoi(soDo, r.khoiId) || {};
                  const c = n.color || LOAI_KHOI[r.loai]?.mau || C.chu2;
                  const vien = r.nhanh === 'ok' ? C.xanh : r.nhanh === 'ng' ? C.do : null;
                  return (
                    <tr key={r.khoiId}>
                      <td style={{
                        ...S.oBuoc,
                        boxShadow: vien ? `inset 3px 0 0 ${vien}` : undefined,
                      }}>
                        <span style={{ ...S.sq, background: c }}>{r.stt}</span>
                        <span style={S.buocTen}>{r.ten}</span>
                        {r.nhanh === 'ok' && (
                          <span style={{ ...S.brtag, color: C.xanh, background: `${C.xanh}24` }}>Nhánh OK</span>
                        )}
                        {r.nhanh === 'ng' && (
                          <span style={{ ...S.brtag, color: C.do, background: `${C.do}20` }}>Nhánh NG</span>
                        )}
                        <span style={S.loaiKhoi}>{LOAI_KHOI[r.loai]?.nhan || r.loai}</span>
                      </td>

                      {/* Chỉ ĐỌC — người thực hiện lấy từ cột của khối. */}
                      <td style={S.oNguoi}
                        title="Lấy từ cột của bước. Đổi bằng cách chuyển bước sang cột khác ở tab Trình vẽ lưu đồ.">
                        {r.nguoiThucHien}
                        <span style={S.boPhan}>cột {r.boPhan}</span>
                      </td>

                      {/* Chỉ đọc thì in CHỮ THƯỜNG như mockup, không phải ô nhập
                          xám: người xem không sửa được, đưa cho họ một khung
                          nhập trông như bấm vào gõ được là nói dối giao diện.
                          Câu nhắc "chặn ban hành" cũng chỉ có nghĩa với người
                          sửa được — người xem không làm gì với nó. */}
                      <td>
                        {doc ? (
                          rong(n.desc)
                            ? <span style={S.mo}>—</span>
                            : <span style={S.dienGiai}>{n.desc}</span>
                        ) : (
                          <>
                            <ONhap key={`d${r.khoiId}|${n.desc ?? ''}`} giaTri={n.desc} doc={doc} dong={3}
                              nhan={`Diễn giải bước ${r.stt} — ${r.ten}`}
                              goiY="Cách làm, tiêu chuẩn đạt và cách xử lý khi không đạt."
                              onLuu={v => va(r.khoiId, 'desc', v)} />
                            {rong(n.desc) && (
                              <p style={S.canhBao}>Bỏ trống ô này là một LỖI chặn ban hành.</p>
                            )}
                          </>
                        )}
                      </td>

                      <td>
                        {doc ? (
                          r.hoSo.length
                            ? <span style={{ display: 'block' }}>
                              {r.hoSo.map((f, k) => <span key={k} style={S.chip}>{f}</span>)}
                            </span>
                            : <span style={S.mo}>—</span>
                        ) : (
                          <ONhap key={`f${r.khoiId}|${n.form ?? ''}`} giaTri={n.form} doc={doc}
                            nhan={`Hồ sơ biểu mẫu bước ${r.stt}`}
                            goiY="Ngăn cách bằng dấu ·"
                            onLuu={v => va(r.khoiId, 'form', v)} />
                        )}
                      </td>

                      <td>
                        {doc ? <span style={S.mo}>{r.thoiGian}</span> : (
                          <ONhap key={`t${r.khoiId}|${n.time ?? ''}`} giaTri={n.time} doc={doc}
                            nhan={`Thời gian chuẩn bước ${r.stt}`} goiY="VD: 15 phút / lô"
                            onLuu={v => va(r.khoiId, 'time', v)} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p style={S.chuThich}>
          <b>Người thực hiện</b> không sửa được ở bảng này: nó lấy từ cột chứa bước.
          Muốn đổi thì sang tab <b>Trình vẽ lưu đồ</b> kéo bước sang cột khác, hoặc
          sửa ô <b>Người thực hiện</b> trong thuộc tính cột — đổi một lần là mọi bước
          trong cột đổi theo, và bản in không bao giờ lệch với lưu đồ.
        </p>
      </div>
    </div>
  );
}

/* ── Hover / bảng / responsive: chèn 1 thẻ <style> như ModuleShell,
      phần còn lại vẫn là style inline như các trang khác của app. ── */
const CSS = `
.qd-wrap { flex:1; display:flex; flex-direction:column; min-height:0; }
.qd-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:8px 12px;
  background:${C.mat}; border-bottom:1px solid ${C.vien}; }
.qd-khoa { padding:8px 12px; background:${C.mat2}; border-bottom:1px solid ${C.vien};
  font-size:11.5px; font-weight:600; color:${C.chu2}; line-height:1.45; }

.qd-body { flex:1; overflow:auto; background:${C.nen}; padding:16px 18px 40px; }
.qd-dau { margin-bottom:13px; }

.qd-tblbox { background:${C.mat}; border:1px solid ${C.vien}; border-radius:12px;
  overflow:auto; box-shadow:0 1px 2px rgba(15,23,42,.05); }
.qd-tbl { border-collapse:collapse; width:100%; min-width:940px; font-size:12.5px; }
.qd-tbl thead th { position:sticky; top:0; z-index:1; background:${C.mat2}; text-align:left;
  font-size:10.5px; font-weight:800; letter-spacing:.07em; text-transform:uppercase;
  color:${C.chu3}; padding:10px; border-bottom:1px solid ${C.vien}; white-space:nowrap; }
.qd-tbl tbody td { padding:8px 10px; border-bottom:1px solid ${C.vien}; vertical-align:top;
  line-height:1.55; }
.qd-tbl tbody tr:last-child td { border-bottom:none; }
.qd-tbl tbody tr:hover { background:${C.mat2}; }

@media (max-width:820px) { .qd-body { padding:12px 10px 32px; } }
`;

const S = {
  trong: { flex: 1, display: 'grid', placeItems: 'center', padding: 24, background: C.nen },
  rong: {
    padding: '26px 14px', textAlign: 'center', color: C.chu3, fontSize: 12.5, lineHeight: 1.6,
    background: C.mat, border: `1px dashed ${C.vien2}`, borderRadius: 13,
    maxWidth: 480, margin: '0 auto',
  },

  title: { display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, maxWidth: '70%' },
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
  dem: {
    fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.chu2,
    background: C.mat2, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
  },

  h2: { margin: '0 0 3px', fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', color: C.chu },
  h2p: { margin: 0, fontSize: 12.5, lineHeight: 1.6, color: C.chu3, maxWidth: '76ch' },

  oBuoc: { verticalAlign: 'top' },
  sq: {
    display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: 5,
    color: '#fff', fontFamily: MONO, fontSize: 10.5, fontWeight: 800,
    marginRight: 7, verticalAlign: '-4px',
  },
  buocTen: { fontWeight: 700, color: C.chu },
  brtag: {
    fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 4,
    marginLeft: 6, whiteSpace: 'nowrap',
  },
  loaiKhoi: { display: 'block', marginTop: 3, fontSize: 10.5, color: C.chu3 },

  oNguoi: { whiteSpace: 'nowrap', fontWeight: 600, color: C.chu2 },
  boPhan: { display: 'block', marginTop: 2, fontSize: 10.5, fontWeight: 500, color: C.chu3 },

  inp: {
    width: '100%', padding: '6px 8px', border: `1px solid ${C.vien}`, borderRadius: 7,
    background: C.nen, outline: 'none', fontSize: 12.5, color: C.chu, fontFamily: 'inherit',
  },
  inpDoc: { background: 'transparent', border: '1px solid transparent', padding: '6px 0' },
  ta: { resize: 'vertical', minHeight: 58, lineHeight: 1.5 },

  canhBao: { margin: '3px 0 0', fontSize: 10.5, fontWeight: 700, color: C.do, lineHeight: 1.4 },
  chip: {
    display: 'inline-block', background: C.mat2, border: `1px solid ${C.vien}`,
    borderRadius: 5, padding: '2px 6px', margin: '1px 3px 1px 0',
    fontFamily: MONO, fontSize: 10.5, color: C.chu2,
  },
  mo: { color: C.chu2, whiteSpace: 'nowrap' },
  dienGiai: { color: C.chu, whiteSpace: 'pre-wrap' },

  chuThich: {
    margin: '14px 0 0', padding: '10px 12px', borderRadius: 10, background: C.mat,
    border: `1px solid ${C.vien}`, fontSize: 11.5, lineHeight: 1.6, color: C.chu2,
  },
};
