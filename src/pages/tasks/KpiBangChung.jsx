import React, { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { loiGhiKpi } from '../../lib/kpiWriteGuard';
import {
  dsNhanVienChamChung, dungMaTran, dsChiTieuThemDuoc,
  canHoiLyDo, timDongLyDo, NGUON_BANG_CHUNG,
} from '../../lib/kpiBangChung';
import { ChevronLeft, Plus, X, AlertTriangle } from 'lucide-react';

const soNgan = n => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
const homNay = () => new Date().toISOString().slice(0, 10);

// Bảng chấm chung: dòng = chỉ tiêu, cột = nhân viên, ô = điểm cuối cùng của người đó.
// Mỗi người vẫn có điểm riêng — "chung" là chung MÀN HÌNH NHẬP, không phải chung điểm.
export default function KpiBangChung({ ky, rows, logs, users, me, perm, onBack, onReload }) {
  const [themCT, setThemCT] = useState(false);
  const [loi, setLoi] = useState('');

  const nhanVien = useMemo(() => dsNhanVienChamChung(rows, users), [rows, users]);
  const bang = useMemo(() => dungMaTran(rows, nhanVien), [rows, nhanVien]);

  // Nhật ký gom sẵn theo chi_tieu_id để mỗi ô khỏi quét lại cả mảng.
  const logTheoCT = useMemo(() => {
    const m = new Map();
    for (const l of logs || []) {
      if (!m.has(l.chi_tieu_id)) m.set(l.chi_tieu_id, []);
      m.get(l.chi_tieu_id).push(l);
    }
    return m;
  }, [logs]);

  async function doiChamChung(dong, bat) {
    setLoi('');
    let q = supabase.from('kpi_chi_tieu').update({ cham_chung: bat }).eq('ky', ky).eq('cap_do', 'CA_NHAN');
    // Gom theo mã; chưa chạy migration thì lùi về tên, đúng như khoaChiTieu().
    q = dong.ma ? q.eq('ma', dong.ma) : q.eq('ten', dong.ten);
    const { data, error } = await q.select();
    const l = loiGhiKpi(error, data);
    if (l) { setLoi(l); return; }
    setThemCT(false);
    onReload?.();
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={onBack} style={nutPhu}>
          <ChevronLeft size={13} style={{ verticalAlign: 'middle' }} /> Quay lại
        </button>
        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Bảng chấm chung — kỳ {ky}</div>
        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
          {bang.length} chỉ tiêu × {nhanVien.length} nhân viên
        </span>
      </div>

      {loi && (
        <div style={khungLoi}>
          <AlertTriangle size={14} /> {loi}
        </div>
      )}

      {bang.length === 0 && (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
          Chưa có chỉ tiêu nào ở bảng chung. Bấm “Thêm chỉ tiêu” để đưa vào.
        </div>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...thChung, ...cotGhim, minWidth: 240 }}>Chỉ tiêu</th>
              {nhanVien.map(nv => (
                <th key={nv.id} style={{ ...thChung, minWidth: 110, textAlign: 'center' }}>{nv.ten}</th>
              ))}
              {perm?.create && <th style={{ ...thChung, width: 34 }} aria-label="Bỏ khỏi bảng chung" />}
            </tr>
          </thead>
          <tbody>
            {bang.map(d => (
              <tr key={d.ma || d.ten}>
                <td style={{ ...tdChung, ...cotGhim }}>
                  {d.ma && <div style={nhanMa}>{d.ma}</div>}
                  <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '0.8rem' }}>
                    {d.ten}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                    {d.chi_tieu == null ? 'mức khác nhau theo người' : `tối đa ${soNgan(d.chi_tieu)}`}
                  </div>
                </td>
                {d.o.map((ct, i) => (
                  <td key={nhanVien[i].id} style={{ ...tdChung, padding: 4, textAlign: 'center' }}>
                    {ct
                      ? <OChamDiem
                          ct={ct} logs={logTheoCT.get(ct.id) || []} me={me}
                          doiDuoc={!!perm?.edit} onXong={onReload}
                        />
                      : <span title="Nhân viên này không có chỉ tiêu đó" style={oTrong}>▨</span>}
                  </td>
                ))}
                {perm?.create && (
                  <td style={{ ...tdChung, textAlign: 'center' }}>
                    <button
                      onClick={() => doiChamChung(d, false)}
                      title="Bỏ khỏi bảng chung (điểm đã chấm vẫn giữ nguyên)"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}
                    >
                      <X size={13} color="#94a3b8" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {perm?.create && (
        <button onClick={() => setThemCT(true)} style={{ ...nutPhu, marginTop: 10 }}>
          <Plus size={13} style={{ verticalAlign: 'middle' }} /> Thêm chỉ tiêu
        </button>
      )}

      {themCT && (
        <PopupThemChiTieu
          rows={rows}
          onChon={dong => doiChamChung(dong, true)}
          onClose={() => setThemCT(false)}
        />
      )}
    </div>
  );
}

// Một ô của ma trận. Lưu khi rời ô (blur) chứ không có nút "Lưu tất cả": điền tới đâu chắc
// tới đó, và lỗi hiện ngay tại ô sai thay vì một thông báo chung chung cho 52 ô.
function OChamDiem({ ct, logs, me, doiDuoc, onXong }) {
  const dongLyDo = timDongLyDo(logs);
  const [diem, setDiem] = useState(ct.diem_chot == null ? '' : String(ct.diem_chot));
  const [lyDo, setLyDo] = useState(dongLyDo?.ly_do || '');
  const [loi, setLoi] = useState('');
  const [dangLuu, setDangLuu] = useState(false);

  const soDiem = diem.trim() === '' ? null : Number(diem);
  const hoiLyDo = canHoiLyDo(ct, soDiem);
  const thieu = hoiLyDo;
  const du = soDiem != null && !thieu;

  async function luu() {
    setLoi('');
    if (diem.trim() !== '' && !Number.isFinite(soDiem)) { setLoi('Không phải số'); return; }
    if (soDiem != null && (soDiem < 0 || (ct.chi_tieu != null && soDiem > ct.chi_tieu))) {
      setLoi(`Phải trong khoảng 0…${soNgan(ct.chi_tieu)}`);
      return;
    }
    setDangLuu(true);
    const l = await ghiOChamChung({ ct, diem: soDiem, lyDo, me });
    setDangLuu(false);
    if (l) { setLoi(l); return; }
    onXong?.();
  }

  return (
    <div>
      <input
        type="text" inputMode="decimal" value={diem} disabled={!doiDuoc || dangLuu}
        onChange={e => setDiem(e.target.value)}
        onBlur={luu}
        aria-label={`Điểm ${ct.ten}`}
        style={{
          width: 62, padding: '0.35rem', borderRadius: 7, textAlign: 'center',
          border: `1px solid ${loi ? '#dc2626' : '#e2e8f0'}`,
          background: loi ? '#fef2f2' : thieu ? '#fff5f6' : du ? '#f0fdf4' : '#fff',
          fontWeight: 700, fontSize: '0.82rem',
        }}
      />
      {hoiLyDo && (
        <input
          type="text" value={lyDo} disabled={!doiDuoc || dangLuu}
          onChange={e => setLyDo(e.target.value)}
          onBlur={luu}
          placeholder="lý do trừ điểm"
          aria-label={`Lý do ${ct.ten}`}
          style={{
            marginTop: 3, width: 100, padding: '0.25rem 0.35rem', borderRadius: 6,
            border: '1px solid #fecaca', fontSize: '0.68rem',
          }}
        />
      )}
      {loi && <div style={{ fontSize: '0.65rem', color: '#b91c1c', marginTop: 2 }}>{loi}</div>}
    </div>
  );
}

// Ghi một ô: điểm vào kpi_chi_tieu.diem_chot, lý do vào MỘT dòng kpi_nhat_ky nguồn
// BANG_CHUNG (so_diem = 0 nên không đụng phép tính, chỉ chở chữ).
//
// `.select()` ở mọi lệnh là BẮT BUỘC: PostgREST coi "RLS lọc hết dòng" là thành công,
// trả 204 với error = null. Không kiểm qua loiGhiKpi thì người không phải ADMIN gõ điểm,
// thấy form đóng êm, tưởng đã chấm — cuối tháng bảng lương lấy số cũ.
// Trả null nếu ghi được, hoặc chuỗi lỗi tiếng Việt.
async function ghiOChamChung({ ct, diem, lyDo, me }) {
  const nguoi = me?.name || me?.id || null;
  const { data, error } = await supabase
    .from('kpi_chi_tieu')
    .update({
      diem_chot: diem,
      chot_boi: diem == null ? null : nguoi,
      chot_luc: diem == null ? null : new Date().toISOString(),
    })
    .eq('id', ct.id)
    .select();
  const l = loiGhiKpi(error, data);
  if (l) return l;

  // Dòng lý do cũ phải tra TỪ DB, KHÔNG lấy từ `logs` của props: props chỉ mới lại sau khi
  // vòng tải lại chạy xong, mà ô này lưu ngay lúc rời ô. Sửa lý do hai lần liên tiếp đủ
  // nhanh thì lần sau vẫn thấy props cũ ("chưa có dòng nào") và chèn dòng thứ hai — chỉ tiêu
  // đeo 2 lý do, sai giao kèo mỗi chỉ tiêu đúng MỘT dòng BANG_CHUNG.
  const { data: dsCu, error: loiTra } = await supabase
    .from('kpi_nhat_ky').select('id')
    .eq('chi_tieu_id', ct.id).eq('nguon', NGUON_BANG_CHUNG);
  if (loiTra) return 'Lỗi đọc nhật ký: ' + (loiTra.message || String(loiTra));
  const coDongCu = (dsCu || []).length > 0;

  const can = canHoiLyDo(ct, diem);
  const chu = (lyDo || '').trim();

  // Lọc theo (chi_tieu_id, nguon) chứ không theo id: dữ liệu lỡ có sẵn 2 dòng trùng thì
  // lệnh này dọn/ghi đè hết, tự lành lại về đúng một dòng.
  //
  // Kéo điểm về tối đa (hoặc xoá điểm) → dọn luôn dòng lý do, đừng để lý do cũ nằm lại
  // trên một chỉ tiêu đã đủ điểm.
  if (!can || !chu) {
    if (!coDongCu) return null;
    const r = await supabase.from('kpi_nhat_ky').delete()
      .eq('chi_tieu_id', ct.id).eq('nguon', NGUON_BANG_CHUNG).select();
    return loiGhiKpi(r.error, r.data);
  }

  if (coDongCu) {
    const r = await supabase.from('kpi_nhat_ky')
      .update({ ly_do: chu, ngay: homNay(), nguoi_ghi: nguoi })
      .eq('chi_tieu_id', ct.id).eq('nguon', NGUON_BANG_CHUNG).select();
    return loiGhiKpi(r.error, r.data);
  }

  const r = await supabase.from('kpi_nhat_ky').insert({
    chi_tieu_id: ct.id, ngay: homNay(), so_diem: 0,
    ly_do: chu, nguon: NGUON_BANG_CHUNG, nguoi_ghi: nguoi,
  }).select();
  return loiGhiKpi(r.error, r.data);
}

// Popup “＋ Thêm chỉ tiêu”: liệt kê các chỉ tiêu chưa vào bảng chung, kèm mã và số người có.
function PopupThemChiTieu({ rows, onChon, onClose }) {
  const [tim, setTim] = useState('');
  const ds = useMemo(() => dsChiTieuThemDuoc(rows), [rows]);
  const loc = ds.filter(c =>
    !tim.trim()
    || c.ten.toLowerCase().includes(tim.toLowerCase())
    || (c.ma || '').toLowerCase().includes(tim.toLowerCase()));

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, padding: 16, width: 'min(560px,100%)',
          maxHeight: '80vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', flex: 1 }}>Thêm chỉ tiêu vào bảng chung</div>
          <button onClick={onClose} style={{ ...nutPhu, padding: '0.25rem 0.5rem' }}><X size={13} /></button>
        </div>

        <input
          value={tim} onChange={e => setTim(e.target.value)}
          placeholder="Tìm theo mã hoặc tên…"
          style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.8rem', marginBottom: 8 }}
        />

        {loc.length === 0 && (
          <div style={{ fontSize: '0.78rem', color: '#94a3b8', padding: '0.8rem 0' }}>
            Không còn chỉ tiêu nào để thêm.
          </div>
        )}

        {loc.map(c => (
          <button
            key={c.ma || c.ten}
            onClick={() => onChon(c)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              padding: '0.5rem 0.6rem', marginBottom: 4, borderRadius: 9,
              border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
            }}
          >
            {c.ma && <span style={nhanMa}>{c.ma}</span>}
            <span style={{ flex: 1, minWidth: 0, fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.ten}
            </span>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', flexShrink: 0 }}>{c.soNguoi} người</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const thChung = {
  background: '#f8fafc', textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem',
  textTransform: 'uppercase', letterSpacing: '0.03em', color: '#64748b',
  borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', position: 'sticky', top: 0,
};
const tdChung = { padding: '8px 10px', borderBottom: '1px solid #eef2f7', verticalAlign: 'top' };
// Cột tên chỉ tiêu ghim trái: cuộn ngang 13 cột mà mất tên dòng thì không biết đang chấm cái gì.
const cotGhim = { position: 'sticky', left: 0, background: '#fff', zIndex: 1, borderRight: '1px solid #e2e8f0' };
const nhanMa = {
  display: 'inline-block', fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px',
  borderRadius: 5, background: '#f1f5f9', color: '#64748b', marginBottom: 3,
};
const oTrong = { color: '#e2e8f0', fontSize: '1rem' };
const nutPhu = {
  padding: '0.4rem 0.7rem', borderRadius: 8, border: '1px solid #e2e8f0',
  background: '#fff', fontSize: '0.76rem', cursor: 'pointer',
};
const khungLoi = {
  padding: '0.6rem 0.7rem', borderRadius: 10, background: '#fef2f2', color: '#b91c1c',
  fontSize: '0.78rem', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
};
