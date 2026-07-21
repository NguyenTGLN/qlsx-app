import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, fetchAllRows } from '../../lib/supabase';
import { tinhBangKpi, giaiThich, kiemTraTrongSo } from '../../lib/kpiEngine';
import { loiGhiKpi } from '../../lib/kpiWriteGuard';
import { xuatExcelKpi, dungDuLieuSheet } from '../../lib/kpiExcel';
import KpiPrint from '../../components/KpiPrint';
import {
  Trophy, ChevronRight, ChevronLeft, AlertTriangle, Plus, X, Loader2,
  FileDown, Printer, Pencil, CalendarPlus,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Tiện ích nhỏ
// ─────────────────────────────────────────────────────────────────────────────

// Kỳ mặc định = tháng hiện tại, dạng 'YYYY-MM'.
function kyHienTai() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 1 chữ số thập phân, chặn "-0.0" khi số âm cực nhỏ do sai số dấu phẩy động.
const so1 = n => (Math.abs(n) < 0.05 ? '0.0' : n.toFixed(1));
// Số gọn cho ô nhỏ: bỏ đuôi .0 vô nghĩa (3.0 → "3", 3.5 → "3.5").
const soNgan = n => String(Math.round(n * 100) / 100);

// Chia mảng thành từng lô. `.in()` của PostgREST đi qua query string, hơn 200 uuid là
// URL ~8KB — nhiều proxy/CDN cắt ở 4-8KB và request hỏng im lặng. Chia lô rồi gộp.
function chiaLo(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const mauTheoDiem = d => (d >= 90 ? '#059669' : d >= 75 ? '#d97706' : '#dc2626');

const oInput = {
  padding: '0.4rem 0.5rem', borderRadius: 8, border: '1px solid #e2e8f0',
  fontSize: '0.8rem', width: '100%', boxSizing: 'border-box', background: '#fff',
};

// ─────────────────────────────────────────────────────────────────────────────
// Màn hình 1: danh sách nhân viên + điểm, xếp hạng
// ─────────────────────────────────────────────────────────────────────────────

export default function KpiTab({ me, users = [], perm = {} }) {
  const [ky, setKy] = useState(kyHienTai());
  const [rows, setRows] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState('');
  const [chon, setChon] = useState(null);   // nhan_vien_id đang xem chi tiết

  const taiDuLieu = useCallback(async () => {
    setLoading(true);
    setLoi('');
    try {
      // fetchAllRows trả { data, error } chứ KHÔNG trả thẳng mảng — phải destructure.
      const { data: ct, error: loiCt } = await fetchAllRows(() =>
        supabase.from('kpi_chi_tieu').select('*').eq('ky', ky).order('thu_tu'));
      if (loiCt) throw loiCt;

      const ids = (ct || []).map(r => r.id);
      const nk = [];
      for (const lo of chiaLo(ids, 100)) {
        const { data, error } = await fetchAllRows(() =>
          supabase.from('kpi_nhat_ky').select('*').in('chi_tieu_id', lo).order('ngay'));
        if (error) throw error;
        if (data) nk.push(...data);
      }

      setRows(ct || []);
      setLogs(nk);
    } catch (err) {
      setLoi(err?.message || String(err));
      setRows([]);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [ky]);

  useEffect(() => { taiDuLieu(); }, [taiDuLieu]);

  // Dòng BO_PHAN dùng chung cho mọi người → luôn kèm vào bảng của từng cá nhân.
  const dongBoPhan = useMemo(() => rows.filter(r => r.cap_do === 'BO_PHAN'), [rows]);

  const bangTheoNguoi = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (r.cap_do === 'BO_PHAN') continue;
      if (!m.has(r.nhan_vien_id)) m.set(r.nhan_vien_id, []);
      m.get(r.nhan_vien_id).push(r);
    }
    const out = [];
    for (const [nvId, list] of m) {
      const kq = tinhBangKpi([...dongBoPhan, ...list], logs);
      const u = users.find(x => x.id === nvId);
      out.push({ nvId, ten: u?.name || nvId, avatar: u?.avatar, ...kq });
    }
    return out.sort((a, b) => b.tongKpi - a.tongKpi);
  }, [rows, logs, users, dongBoPhan]);

  if (loading) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
      <Loader2 size={18} className="spin" style={{ verticalAlign: 'middle', marginRight: 6 }} />
      Đang tải KPI…
    </div>
  );

  if (chon) return (
    <BangKpiMotNguoi
      nvId={chon} ky={ky} users={users} me={me} perm={perm}
      rows={[...dongBoPhan, ...rows.filter(r => r.nhan_vien_id === chon)]}
      logs={logs} onBack={() => setChon(null)} onReload={taiDuLieu}
    />
  );

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="month" value={ky} onChange={e => setKy(e.target.value || kyHienTai())}
          style={{ ...oInput, width: 'auto' }}
        />
        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
          {bangTheoNguoi.length} nhân viên
        </span>

        {/* Xuất cả team một file nhiều sheet — đúng dạng file gốc phòng nhân sự đang dùng,
            và cũng là việc thật hằng tháng (xuất từng người 14 lần thì không ai làm). */}
        {perm?.io && bangTheoNguoi.length > 0 && (
          <button
            onClick={() => xuatExcelKpi(
              bangTheoNguoi.map(p => ({
                rows: [...dongBoPhan, ...rows.filter(r => r.nhan_vien_id === p.nvId)],
                logs,
                tenNhanVien: p.ten,
              })), ky)}
            style={{ ...nutPhu, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}
          >
            <FileDown size={13} /> Xuất Excel cả team
          </button>
        )}
      </div>

      {perm?.create && (
        <TaoKyMoi ky={ky} daCoDuLieu={rows.length > 0} onXong={taiDuLieu} />
      )}

      {loi && (
        <div style={{
          padding: '0.6rem 0.7rem', borderRadius: 10, background: '#fef2f2', color: '#b91c1c',
          fontSize: '0.78rem', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AlertTriangle size={14} /> Không tải được KPI: {loi}
        </div>
      )}

      {!loi && bangTheoNguoi.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
          Chưa có bảng KPI cho kỳ này.
        </div>
      )}

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
        {bangTheoNguoi.map((p, i) => (
          <button
            key={p.nvId} onClick={() => setChon(p.nvId)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '0.7rem',
              borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff',
              cursor: 'pointer', textAlign: 'left', width: '100%',
              outline: p.nvId === me?.id ? '2px solid #2563eb' : 'none',
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', width: 22, flexShrink: 0 }}>
              {i === 0 ? <Trophy size={14} color="#f59e0b" /> : `#${i + 1}`}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 600, fontSize: '0.85rem',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {p.ten}{p.nvId === me?.id && ' (bạn)'}
              </div>
              <div style={{
                fontSize: '0.7rem', color: '#94a3b8',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {p.danhSachMatDiem[0]
                  ? `Mất nhiều nhất: ${p.danhSachMatDiem[0].ten}`
                  : 'Đạt đủ mọi chỉ tiêu'}
              </div>
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: mauTheoDiem(p.tongKpi) }}>
              {so1(p.tongKpi)}
            </div>
            <ChevronRight size={14} color="#cbd5e1" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Màn hình 2: bảng KPI chi tiết một người
// ─────────────────────────────────────────────────────────────────────────────

function BangKpiMotNguoi({ nvId, ky, users, me, perm, rows, logs, onBack, onReload }) {
  // Chỉ giữ ID chứ KHÔNG giữ nguyên object dòng chỉ tiêu: sau khi ghi điểm và tải lại,
  // object cũ đã cũ dữ liệu — popup phải lấy lại từ kết quả engine mới nhất.
  const [popupId, setPopupId] = useState(null);   // id chỉ tiêu | 'TONG' | null
  const [suaCT, setSuaCT] = useState(null);       // dòng đang sửa/thêm, null = không sửa
  const [inBan, setInBan] = useState(false);

  const kq = useMemo(() => tinhBangKpi(rows, logs), [rows, logs]);
  const canhBaoTrongSo = useMemo(() => kiemTraTrongSo(rows), [rows]);
  const nguoi = users.find(u => u.id === nvId);
  const tenNguoi = nguoi?.name || nvId;

  const duLieuIn = useMemo(
    () => dungDuLieuSheet(rows, logs, tenNguoi, ky), [rows, logs, tenNguoi, ky]);

  // Chờ một nhịp cho bản in kịp mount rồi mới gọi window.print().
  useEffect(() => {
    if (!inBan) return undefined;
    const t = setTimeout(() => { window.print(); setInBan(false); }, 80);
    return () => clearTimeout(t);
  }, [inBan]);

  async function luuChiTieu(ct) {
    const ban = {
      ten: ct.ten.trim(),
      mo_ta: ct.mo_ta?.trim() || null,
      nhom: ct.nhom?.trim() || null,
      chi_tieu: ct.chi_tieu,
      trong_so: ct.trong_so,
    };
    // `.select()` BẮT BUỘC: không có nó, một UPDATE bị RLS lọc hết dòng trả 204 + error=null
    // và ta báo "đã lưu" cho một thao tác không chạm được dòng nào. Xem lib/kpiWriteGuard.js.
    const { data, error } = ct.id
      ? await supabase.from('kpi_chi_tieu').update(ban).eq('id', ct.id).select()
      : await supabase.from('kpi_chi_tieu').insert({
          ...ban, ky, cap_do: 'CA_NHAN', nhan_vien_id: nvId,
          // thu_tu lớn nhất + 1, KHÔNG phải số dòng: xoá bớt dòng giữa chừng rồi thêm mới
          // sẽ đụng thu_tu cũ và bảng nhảy lung tung thứ tự.
          thu_tu: rows.reduce((m, r) => Math.max(m, r.thu_tu || 0), 0) + 1,
        }).select();
    const loi = loiGhiKpi(error, data);
    if (loi) return loi;
    setSuaCT(null);
    onReload?.();
    return null;
  }

  // Trả chuỗi lỗi (để form hiện inline) hoặc null khi xong/người dùng huỷ xác nhận.
  async function xoaChiTieu(id) {
    // Nhật ký bị cascade xoá theo. Đếm đúng nhật ký GẮN VÀO DÒNG NÀY (`chi_tieu_id === id`),
    // không dùng `d.logs` — với dòng liên kết bộ phận thì `d.logs` là nhật ký của dòng chung
    // và sẽ KHÔNG mất, báo nhầm số làm người chấm sợ oan hoặc chủ quan.
    const soNhatKy = logs.filter(l => l.chi_tieu_id === id).length;
    const ten = rows.find(r => r.id === id)?.ten || 'chỉ tiêu này';
    const canhBao = soNhatKy > 0
      ? `\n\nXoá luôn ${soNhatKy} dòng nhật ký cộng/trừ điểm của chỉ tiêu này — toàn bộ bằng chứng chấm điểm sẽ mất và KHÔNG khôi phục được.`
      : '\n\nChỉ tiêu này chưa có nhật ký nào.';
    if (!window.confirm(`Xoá "${ten}"?${canhBao}`)) return null;
    // `.select()` như ở luuChiTieu: DELETE bị RLS lọc hết cũng trả 204 + error=null, không có
    // nó thì bấm Xoá xong form đóng êm mà dòng vẫn còn nguyên sau khi reload.
    const { data, error } = await supabase.from('kpi_chi_tieu').delete().eq('id', id).select();
    const loi = loiGhiKpi(error, data);
    if (loi) return loi;
    setSuaCT(null);
    onReload?.();
    return null;
  }

  const ctDangXem = popupId && popupId !== 'TONG'
    ? kq.dong.find(d => d.id === popupId)
    : null;

  // Dòng liên kết bộ phận: nhật ký VÀ điểm chốt đều nằm ở dòng chung (`__bpId`),
  // không phải dòng cá nhân. Ghi sai chỗ thì chấm cho một người sẽ không lan cả nhóm.
  const ctGhi = ctDangXem
    ? (ctDangXem.__bpId ? rows.find(r => r.id === ctDangXem.__bpId) : ctDangXem) || ctDangXem
    : null;

  return (
    <div style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>
      <button
        onClick={onBack}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none',
          color: '#2563eb', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginBottom: 10,
        }}
      >
        <ChevronLeft size={14} /> Danh sách
      </button>

      {perm?.io && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => xuatExcelKpi([{ rows, logs, tenNhanVien: tenNguoi }], ky)}
            style={{ ...nutPhu, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}
          >
            <FileDown size={13} /> Xuất Excel
          </button>
          <button
            onClick={() => setInBan(true)}
            style={{ ...nutPhu, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}
          >
            <Printer size={13} /> In
          </button>
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 14, padding: '1rem', border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{tenNguoi}</div>
        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Kỳ {ky}</div>
        <button
          onClick={() => setPopupId('TONG')}
          title="Bấm để xem cách tính"
          style={{
            border: 'none', background: 'none', cursor: 'pointer', padding: 0, marginTop: 6,
            fontSize: '2rem', fontWeight: 800, color: mauTheoDiem(kq.tongKpi), lineHeight: 1.1,
          }}
        >
          {so1(kq.tongKpi)}
          <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 600 }}> / 100</span>
        </button>
        <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 2 }}>
          Bấm vào bất kỳ con số nào để xem cách tính
        </div>

        {!canhBaoTrongSo.hopLe && (
          <div style={{
            marginTop: 8, padding: '0.5rem 0.6rem', borderRadius: 8,
            background: '#fef2f2', color: '#b91c1c', fontSize: '0.74rem',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            Σ trọng số = {soNgan(canhBaoTrongSo.tong)} (lệch {canhBaoTrongSo.lech > 0 ? '+' : ''}
            {soNgan(canhBaoTrongSo.lech)}) — bảng chỉ tiêu chưa chuẩn.
          </div>
        )}

        {/* Thiếu dòng chấm chung = mất TRỌN trọng số nhưng con số nhìn y hệt "chấm chung được
            0 điểm". Phải nói ra ở đây, không thì người xem tưởng đã bị chấm 0 thật. */}
        {kq.nhomThieuDongChung.length > 0 && (
          <div style={{
            marginTop: 8, padding: '0.5rem 0.6rem', borderRadius: 8,
            background: '#fffbeb', color: '#b45309', fontSize: '0.74rem',
            display: 'flex', alignItems: 'flex-start', gap: 6,
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Thiếu dòng chấm chung cho {kq.nhomThieuDongChung.length > 1 ? 'các nhóm' : 'nhóm'}{' '}
              <b>{kq.nhomThieuDongChung.join(', ')}</b> — các chỉ tiêu này đang tính 0 điểm vì
              CHƯA CÓ dữ liệu chấm, không phải vì bị chấm 0. Tạo dòng chấm chung rồi xem lại.
            </span>
          </div>
        )}
      </div>

      {kq.danhSachMatDiem.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#b91c1c', marginBottom: 6 }}>
            ĐANG MẤT {so1(kq.tongMat)} ĐIỂM
          </div>
          {kq.danhSachMatDiem.map(d => (
            <button
              key={d.id} onClick={() => setPopupId(d.id)}
              style={{
                display: 'flex', width: '100%', alignItems: 'center', gap: 10, textAlign: 'left',
                padding: '0.55rem 0.7rem', marginBottom: 5, borderRadius: 10,
                border: '1px solid #fecaca', background: '#fff', cursor: 'pointer',
              }}
            >
              <span style={{ fontWeight: 800, color: '#dc2626', minWidth: 44, flexShrink: 0 }}>
                −{so1(d.diemMat)}
              </span>
              <span style={{ flex: 1, fontSize: '0.78rem', minWidth: 0 }}>{d.ten}</span>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', flexShrink: 0 }}>
                {soNgan(d.diemDat)}/{soNgan(d.chi_tieu)}
              </span>
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 6 }}>
          TOÀN BỘ CHỈ TIÊU ({kq.dong.length})
        </div>
        {kq.dong.map(d => (
          <DongChiTieu
            key={d.id} d={d}
            onClick={() => setPopupId(d.id)}
            onSua={perm?.create ? () => setSuaCT(d) : null}
          />
        ))}

        {perm?.create && (
          <button
            onClick={() => setSuaCT({ ten: '', mo_ta: '', chi_tieu: 10, trong_so: 0, nhom: '' })}
            style={{ ...nutMo, marginTop: 8 }}
          >
            <Plus size={13} /> Thêm chỉ tiêu
          </button>
        )}
      </div>

      {suaCT && (
        <FormSuaChiTieu
          ct={suaCT} onLuu={luuChiTieu} onXoa={xoaChiTieu} onHuy={() => setSuaCT(null)}
        />
      )}

      {inBan && (
        <div className="kpi-chi-in">
          <KpiPrint duLieu={duLieuIn} />
        </div>
      )}

      {/* Nếp in của dự án (xem ImportStockTab): ẩn bằng `visibility` chứ KHÔNG phải
          `display:none` trên body — bản in nằm trong #root, mà tổ tiên đã display:none thì
          con không cách nào hiện lại được. */}
      <style>{`
        .kpi-chi-in { display: none; }
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body * { visibility: hidden; }
          .kpi-chi-in, .kpi-chi-in * { visibility: visible; }
          .kpi-chi-in {
            display: block !important;
            position: absolute !important; left: 0; top: 0; width: 100%;
            background: #fff !important;
          }
          body, html, #root, main { overflow: visible !important; height: auto !important; }
          div { overflow: visible !important; }
          th, td { border-color: #333 !important; }
        }
      `}</style>

      {popupId === 'TONG' && (
        <PopupTongKpi
          kq={kq} ky={ky} tenNguoi={tenNguoi}
          onChonChiTieu={id => setPopupId(id)}
          onClose={() => setPopupId(null)}
        />
      )}

      {ctDangXem && (
        <PopupDienGiai
          ct={ctDangXem} ctGhi={ctGhi} bpMap={kq.bpMap}
          perm={perm} me={me} onReload={onReload}
          onClose={() => setPopupId(null)}
        />
      )}
    </div>
  );
}

// Một dòng trong bảng "toàn bộ chỉ tiêu".
// Dòng thưởng ngoài trọng số (laThuong): `diemDat` LUÔN là 0 và không có tỉ lệ — điểm thật
// nằm ở `diemQuyDoi`. Vì vậy phải render khác hẳn, tuyệt đối không hiện "0/null" hay "×0".
function DongChiTieu({ d, onClick, onSua }) {
  const thuong = d.laThuong;
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 0, marginBottom: 4, borderRadius: 9,
      border: thuong ? '1px solid #bbf7d0' : '1px solid #e2e8f0', background: '#fff',
      overflow: 'hidden',
    }}>
    <button
      onClick={onClick}
      style={{
        display: 'flex', flex: 1, minWidth: 0, alignItems: 'center', gap: 8, textAlign: 'left',
        padding: '0.5rem 0.65rem', border: 'none', background: 'none', cursor: 'pointer',
      }}
    >
      <span style={{ flex: 1, fontSize: '0.76rem', minWidth: 0 }}>
        {d.ten}
        {d.lien_ket_bo_phan && (
          <span style={{ fontSize: '0.64rem', color: '#2563eb', marginLeft: 5 }}>chung bộ phận</span>
        )}
        {thuong && (
          <span style={{ fontSize: '0.64rem', color: '#059669', marginLeft: 5 }}>ngoài trọng số</span>
        )}
      </span>

      {thuong ? (
        <span style={{ fontSize: '0.7rem', color: '#94a3b8', flexShrink: 0 }}>thưởng</span>
      ) : (
        <>
          <span style={{ fontSize: '0.7rem', color: '#94a3b8', flexShrink: 0 }}>
            {soNgan(d.diemDat)}/{soNgan(d.chi_tieu)}
          </span>
          <span style={{ fontSize: '0.7rem', color: '#cbd5e1', flexShrink: 0 }}>×{soNgan(d.trong_so)}</span>
        </>
      )}

      <span style={{
        fontWeight: 700, fontSize: '0.8rem', minWidth: 40, textAlign: 'right', flexShrink: 0,
        color: thuong ? '#059669' : d.diemMat > 0.001 ? '#dc2626' : '#059669',
      }}>
        {thuong && d.diemQuyDoi >= 0 ? '+' : ''}{so1(d.diemQuyDoi)}
      </span>
    </button>

    {onSua && (
      <button
        onClick={onSua} title="Sửa chỉ tiêu" aria-label={`Sửa chỉ tiêu ${d.ten}`}
        style={{
          border: 'none', borderLeft: '1px solid #f1f5f9', background: '#fff',
          padding: '0 0.6rem', cursor: 'pointer', color: '#94a3b8', flexShrink: 0,
        }}
      >
        <Pencil size={13} />
      </button>
    )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Popup bằng chứng
// ─────────────────────────────────────────────────────────────────────────────

function KhungPopup({ tieuDe, phuDe, onClose, children }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.75rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, padding: '1rem', maxWidth: 460, width: '100%',
          maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>{tieuDe}</h3>
            {phuDe && <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>{phuDe}</div>}
          </div>
          <button
            onClick={onClose} aria-label="Đóng"
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Popup của điểm TỔNG. Engine không có hàm diễn giải riêng cho tổng, nên ở đây chỉ liệt kê
// lại đúng những con số engine đã tính (`diemQuyDoi` từng dòng) — KHÔNG tính lại luật nào.
// Bấm tiếp một dòng sẽ mở popup giaiThich() của dòng đó.
function PopupTongKpi({ kq, ky, tenNguoi, onChonChiTieu, onClose }) {
  return (
    <KhungPopup tieuDe={`Tổng KPI — ${tenNguoi}`} phuDe={`Kỳ ${ky}`} onClose={onClose}>
      <div style={{ fontSize: '0.74rem', color: '#64748b', margin: '10px 0 8px' }}>
        Tổng KPI = cộng điểm quy đổi của {kq.dong.length} chỉ tiêu. Bấm một dòng để xem cách tính
        ra con số đó.
      </div>

      {kq.dong.map(d => (
        <button
          key={d.id} onClick={() => onChonChiTieu(d.id)}
          style={{
            display: 'flex', width: '100%', alignItems: 'center', gap: 8, textAlign: 'left',
            padding: '0.35rem 0', border: 'none', borderBottom: '1px dashed #e2e8f0',
            background: 'none', cursor: 'pointer', fontSize: '0.74rem',
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>{d.ten}</span>
          <span style={{ color: '#cbd5e1', flexShrink: 0 }}>
            {d.laThuong ? 'thưởng' : `×${soNgan(d.trong_so)}`}
          </span>
          <span style={{ fontWeight: 700, minWidth: 40, textAlign: 'right', flexShrink: 0 }}>
            {d.laThuong && d.diemQuyDoi >= 0 ? '+' : ''}{so1(d.diemQuyDoi)}
          </span>
        </button>
      ))}

      <div style={{
        display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 10,
        fontWeight: 800, fontSize: '0.85rem',
      }}>
        <span>TỔNG</span>
        <span style={{ color: mauTheoDiem(kq.tongKpi) }}>{so1(kq.tongKpi)} / 100</span>
      </div>
      {kq.tongMat > 0.001 && (
        <div style={{ fontSize: '0.72rem', color: '#b91c1c', textAlign: 'right', marginTop: 2 }}>
          Đang mất {so1(kq.tongMat)} điểm
        </div>
      )}
    </KhungPopup>
  );
}

// Popup "bằng chứng" của MỘT chỉ tiêu: bấm vào con số nào cũng ra cách tính + nhật ký.
// Chuỗi diễn giải lấy nguyên từ engine (`giaiThich`), UI không tự dựng công thức.
function PopupDienGiai({ ct, ctGhi, bpMap, perm, me, onReload, onClose }) {
  const g = giaiThich(ct, ct.logs || [], bpMap);
  const laBoPhan = !!ct.lien_ket_bo_phan;
  const ghi = ctGhi || ct;

  return (
    <KhungPopup
      tieuDe={g.ten}
      phuDe={laBoPhan ? 'Chỉ tiêu chấm chung cả bộ phận' : ct.laThuong ? 'Thưởng ngoài trọng số' : null}
      onClose={onClose}
    >
      <div style={{ marginTop: 12 }}>
        {g.buoc.map((b, i) => (
          <div
            key={i}
            style={{
              display: 'flex', justifyContent: 'space-between', gap: 10,
              padding: '0.45rem 0', borderBottom: '1px dashed #e2e8f0',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.76rem', fontWeight: 600 }}>{b.nhan}</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{b.dienGiai}</div>
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
              {typeof b.ketQua === 'number'
                ? (b.nhan === 'Tỉ lệ đạt' ? `${soNgan(b.ketQua * 100)}%` : soNgan(b.ketQua))
                : ''}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 6 }}>
          Nhật ký ({g.nhatKy.length})
        </div>
        {g.nhatKy.length === 0 && (
          <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Chưa có ghi nhận nào.</div>
        )}
        {g.nhatKy.map(l => (
          <div key={l.id} style={{ display: 'flex', gap: 8, fontSize: '0.74rem', padding: '0.3rem 0' }}>
            <span style={{ color: '#94a3b8', minWidth: 44, flexShrink: 0 }}>
              {new Date(l.ngay).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              {l.ly_do}
              {l.nguoi_ghi && (
                <span style={{ color: '#cbd5e1' }}> — {l.nguoi_ghi}</span>
              )}
            </span>
            {l.nguon === 'TU_DONG' && (
              <span style={{ fontSize: '0.65rem', color: '#2563eb' }} title="Chấm tự động">⚙</span>
            )}
            <span style={{
              fontWeight: 700, flexShrink: 0,
              color: Number(l.so_diem) < 0 ? '#dc2626' : '#059669',
            }}>
              {Number(l.so_diem) > 0 ? '+' : ''}{soNgan(Number(l.so_diem))}
            </span>
          </div>
        ))}
      </div>

      {perm?.edit && (
        <>
          {laBoPhan && (
            <div style={{
              marginTop: 10, padding: '0.45rem 0.6rem', borderRadius: 8,
              background: '#eff6ff', color: '#1d4ed8', fontSize: '0.72rem',
            }}>
              Ghi vào dòng chung của bộ phận — mọi người trong nhóm đều đổi điểm theo.
            </div>
          )}
          <FormGhiDiem
            chiTieuId={ghi.id}
            dangChotTay={ghi.diem_chot !== null && ghi.diem_chot !== undefined}
            me={me} onXong={onReload}
          />
          <FormChotDiem ctGhi={ghi} me={me} onXong={onReload} />
        </>
      )}
    </KhungPopup>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Form ghi điểm (quyền `edit`)
// ─────────────────────────────────────────────────────────────────────────────

const nutPhu = {
  padding: '0.4rem 0.7rem', borderRadius: 8, border: '1px solid #e2e8f0',
  background: '#fff', fontSize: '0.76rem', cursor: 'pointer',
};
const nutChinh = {
  flex: 1, padding: '0.4rem', borderRadius: 8, border: 'none',
  background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: '0.76rem', cursor: 'pointer',
};
const nutMo = {
  marginTop: 10, width: '100%', padding: '0.5rem', borderRadius: 9,
  border: '1px dashed #cbd5e1', background: '#f8fafc', cursor: 'pointer',
  fontSize: '0.76rem', fontWeight: 600, color: '#475569',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
};
const chuLoi = { fontSize: '0.72rem', color: '#b91c1c', fontWeight: 600 };

const homNay = () => new Date().toISOString().slice(0, 10);

// Ghi một dòng nhật ký ± điểm. Lý do BẮT BUỘC — nhật ký chính là bằng chứng của điểm số.
function FormGhiDiem({ chiTieuId, dangChotTay, me, onXong }) {
  const [mo, setMo] = useState(false);
  const [f, setF] = useState({ ngay: homNay(), so_diem: '', ly_do: '' });
  const [loi, setLoi] = useState('');
  const [busy, setBusy] = useState(false);

  async function luu() {
    const diem = Number(f.so_diem);
    if (f.so_diem === '' || !Number.isFinite(diem)) { setLoi('Nhập số điểm (âm để trừ, dương để cộng).'); return; }
    if (diem === 0) { setLoi('Số điểm phải khác 0.'); return; }
    if (!f.ly_do.trim()) { setLoi('Phải ghi lý do — đây là bằng chứng của điểm số.'); return; }

    setLoi('');
    setBusy(true);
    try {
      const { data, error } = await supabase.from('kpi_nhat_ky').insert({
        chi_tieu_id: chiTieuId, ngay: f.ngay, so_diem: diem,
        ly_do: f.ly_do.trim(), nguoi_ghi: me?.name || me?.id, nguon: 'TAY',
      }).select();
      const loiGhi = loiGhiKpi(error, data);
      if (loiGhi) { setLoi(loiGhi); return; }
      setF({ ngay: homNay(), so_diem: '', ly_do: '' });
      setMo(false);
      onXong?.();
    } finally {
      setBusy(false);
    }
  }

  if (!mo) return (
    <button onClick={() => { setMo(true); setLoi(''); }} style={nutMo}>
      <Plus size={13} /> Ghi cộng / trừ điểm
    </button>
  );

  return (
    <div style={{ marginTop: 10, padding: '0.6rem', borderRadius: 10, background: '#f8fafc', display: 'grid', gap: 6 }}>
      {/* Có điểm chốt tay thì engine BỎ QUA toàn bộ nhật ký — phải nói ra, không thì
          người chấm ghi xong thấy điểm không đổi và tưởng app hỏng. */}
      {dangChotTay && (
        <div style={{ fontSize: '0.7rem', color: '#b45309', background: '#fffbeb', padding: '0.4rem 0.5rem', borderRadius: 7 }}>
          Chỉ tiêu này đang có <b>điểm chốt tay</b> — điểm chốt thắng nhật ký, nên ghi thêm ở đây
          sẽ chưa đổi điểm cho tới khi bỏ chốt.
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="date" value={f.ngay} onChange={e => setF({ ...f, ngay: e.target.value })}
          style={{ ...oInput, flex: 1 }}
        />
        <input
          type="number" step="0.5" inputMode="decimal" placeholder="±điểm" value={f.so_diem}
          onChange={e => setF({ ...f, so_diem: e.target.value })}
          style={{ ...oInput, width: 92, flexShrink: 0 }}
        />
      </div>
      <input
        placeholder="Lý do (bắt buộc)" value={f.ly_do}
        onChange={e => setF({ ...f, ly_do: e.target.value })}
        style={oInput}
      />
      {loi && <div style={chuLoi}>{loi}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={luu} disabled={busy} style={nutChinh}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
        <button onClick={() => { setMo(false); setLoi(''); }} style={nutPhu}>Huỷ</button>
      </div>
    </div>
  );
}

// Chốt điểm tay: ghi thẳng `diem_chot` lên dòng chỉ tiêu, thắng mọi nhật ký — kể cả ở
// dòng thưởng ngoài trọng số (engine bỏ ngoại lệ này từ commit 9f2caf3).
// Engine có kẹp [0, chi_tieu] rồi, nhưng kẹp âm thầm nên quản lý gõ 20 trên chỉ tiêu 10
// sẽ không biết mình gõ sai — form phải chặn và nói ra.
function FormChotDiem({ ctGhi, me, onXong }) {
  const dangChot = ctGhi.diem_chot !== null && ctGhi.diem_chot !== undefined;
  const [mo, setMo] = useState(false);
  const [giaTri, setGiaTri] = useState(dangChot ? String(ctGhi.diem_chot) : '');
  const [loi, setLoi] = useState('');
  const [busy, setBusy] = useState(false);

  // Dòng thưởng không có `chi_tieu` nên KHÔNG có trần để kẹp, và cũng không có sàn:
  // điểm ngoài trọng số có thể âm (phạt) y như nhật ký của nó. Chỉ dòng thường mới
  // ràng buộc 0 ≤ x ≤ chi_tieu.
  const laThuong = ctGhi.chi_tieu === null || ctGhi.chi_tieu === undefined;
  const max = laThuong ? null : Number(ctGhi.chi_tieu);

  async function ghi(giaTriMoi) {
    setBusy(true);
    try {
      // `.select()` BẮT BUỘC — đây là chỗ nguy hiểm nhất của module: điểm chốt đi thẳng vào
      // bảng lương. Không có nó, người không phải ADMIN gõ điểm chốt 3, bấm Lưu, form đóng
      // êm (204 + error=null), reload thấy vẫn 10 — họ tin là đã chốt. Xem lib/kpiWriteGuard.js.
      const { data, error } = await supabase
        .from('kpi_chi_tieu')
        .update({
          diem_chot: giaTriMoi,
          chot_boi: giaTriMoi === null ? null : (me?.name || me?.id || null),
          chot_luc: giaTriMoi === null ? null : new Date().toISOString(),
        })
        .eq('id', ctGhi.id)
        .select();
      const loiGhi = loiGhiKpi(error, data);
      if (loiGhi) { setLoi(loiGhi); return; }
      setMo(false);
      setLoi('');
      onXong?.();
    } finally {
      setBusy(false);
    }
  }

  function luu() {
    const raw = giaTri.trim();
    if (raw === '') { setLoi('Nhập điểm chốt, hoặc bấm “Bỏ chốt” để quay lại tính theo nhật ký.'); return; }
    const v = Number(raw);
    if (!Number.isFinite(v)) { setLoi('Điểm chốt phải là một con số.'); return; }
    if (!laThuong) {
      if (v < 0) { setLoi('Điểm chốt không được nhỏ hơn 0.'); return; }
      if (v > max) { setLoi(`Điểm chốt không được lớn hơn chỉ tiêu (${soNgan(max)}).`); return; }
    }
    setLoi('');
    ghi(v);
  }

  if (!mo) return (
    <button onClick={() => { setMo(true); setGiaTri(dangChot ? String(ctGhi.diem_chot) : ''); setLoi(''); }} style={nutMo}>
      {dangChot ? `Sửa điểm chốt (đang chốt ${soNgan(Number(ctGhi.diem_chot))})` : 'Chốt điểm tay'}
    </button>
  );

  return (
    <div style={{ marginTop: 8, padding: '0.6rem', borderRadius: 10, background: '#f8fafc', display: 'grid', gap: 6 }}>
      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
        {laThuong
          ? 'Điểm chốt tay thắng nhật ký. Dòng ngoài trọng số không có trần — cộng hay trừ đều được.'
          : `Điểm chốt tay thắng nhật ký. Hợp lệ: 0 – ${soNgan(max)}.`}
      </div>
      <input
        type="number" step="0.5" inputMode="decimal"
        min={laThuong ? undefined : 0} max={laThuong ? undefined : max}
        placeholder={laThuong ? 'Điểm chốt (±)' : `Điểm chốt (0 – ${soNgan(max)})`}
        value={giaTri} onChange={e => setGiaTri(e.target.value)}
        style={oInput}
      />
      {loi && <div style={chuLoi}>{loi}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={luu} disabled={busy} style={nutChinh}>{busy ? 'Đang lưu…' : 'Lưu điểm chốt'}</button>
        {dangChot && (
          <button onClick={() => ghi(null)} disabled={busy} style={nutPhu}>Bỏ chốt</button>
        )}
        <button onClick={() => { setMo(false); setLoi(''); }} style={nutPhu}>Huỷ</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sửa / thêm / xoá chỉ tiêu (quyền `create`)
// ─────────────────────────────────────────────────────────────────────────────

function FormSuaChiTieu({ ct, onLuu, onXoa, onHuy }) {
  // Giữ chi_tieu/trong_so dạng CHUỖI trong lúc gõ: ép Number ngay mỗi phím sẽ biến ô đang
  // xoá dở thành 0, và "" → 0 làm dòng thưởng (chi_tieu để trống) âm thầm thành chỉ tiêu 0.
  const [f, setF] = useState({
    ...ct,
    chi_tieu: ct.chi_tieu == null ? '' : String(ct.chi_tieu),
    trong_so: ct.trong_so == null ? '' : String(ct.trong_so),
  });
  const [loi, setLoi] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const laThuong = String(f.chi_tieu).trim() === '';
  const laBoPhan = !!ct.lien_ket_bo_phan;

  async function luu() {
    if (!f.ten?.trim()) { setLoi('Phải có tên chỉ tiêu.'); return; }

    const rawCT = String(f.chi_tieu).trim();
    const rawTS = String(f.trong_so).trim();
    const chiTieu = rawCT === '' ? null : Number(rawCT);
    const trongSo = rawTS === '' ? 0 : Number(rawTS);

    if (chiTieu !== null && (!Number.isFinite(chiTieu) || chiTieu < 0)) {
      setLoi('Mức chỉ tiêu phải là số không âm, hoặc để trống nếu là dòng thưởng.'); return;
    }
    // chi_tieu = 0 không phải "dòng thưởng" mà là lỗi nhập: engine cho mất trọn trọng số.
    if (chiTieu === 0) {
      setLoi('Mức chỉ tiêu = 0 sẽ làm chỉ tiêu này mất trọn trọng số. Để trống nếu muốn dòng thưởng ngoài trọng số.');
      return;
    }
    if (!Number.isFinite(trongSo) || trongSo < 0) { setLoi('Trọng số phải là số không âm.'); return; }
    if (chiTieu === null && trongSo !== 0) {
      setLoi('Dòng thưởng ngoài trọng số phải có trọng số = 0.'); return;
    }

    setLoi('');
    setBusy(true);
    try {
      // onLuu trả về chuỗi đã có ngữ cảnh sẵn (xem lib/kpiWriteGuard.js) — KHÔNG thêm tiền tố
      // "Lỗi lưu:" nữa, sẽ thành "Lỗi lưu: Lỗi lưu: ...".
      const err = await onLuu({ ...f, chi_tieu: chiTieu, trong_so: trongSo });
      if (err) setLoi(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onHuy}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 210,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.75rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, padding: '1rem', maxWidth: 460, width: '100%',
          display: 'grid', gap: 8, maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '0.88rem' }}>{f.id ? 'Sửa chỉ tiêu' : 'Thêm chỉ tiêu'}</h3>

        {laBoPhan && (
          <div style={{
            padding: '0.45rem 0.6rem', borderRadius: 8, background: '#eff6ff',
            color: '#1d4ed8', fontSize: '0.72rem',
          }}>
            Chỉ tiêu chấm chung cả bộ phận: điểm đạt lấy từ dòng chung, chỉ trọng số là riêng.
            Mức chỉ tiêu ở đây phải bằng mức của dòng chung, lệch là tỉ lệ đạt sai.
          </div>
        )}

        <input
          placeholder="Nhóm (VD: A. THỰC HIỆN NỘI QUY)" value={f.nhom || ''}
          onChange={e => set('nhom', e.target.value)} style={oInput}
        />
        <input
          placeholder="Tên chỉ tiêu" value={f.ten || ''}
          onChange={e => set('ten', e.target.value)} style={oInput}
        />
        <textarea
          placeholder="Diễn giải / quy định trừ điểm" rows={4} value={f.mo_ta || ''}
          onChange={e => set('mo_ta', e.target.value)}
          style={{ ...oInput, resize: 'vertical', fontFamily: 'inherit' }}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1, fontSize: '0.72rem', color: '#64748b' }}>
            Mức chỉ tiêu (điểm tối đa)
            <input
              type="number" step="1" min={0} inputMode="decimal" placeholder="để trống = thưởng"
              value={f.chi_tieu} onChange={e => set('chi_tieu', e.target.value)} style={oInput}
            />
          </label>
          <label style={{ flex: 1, fontSize: '0.72rem', color: '#64748b' }}>
            Trọng số
            <input
              type="number" step="0.5" min={0} inputMode="decimal"
              value={f.trong_so} onChange={e => set('trong_so', e.target.value)} style={oInput}
            />
          </label>
        </div>

        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
          {laThuong
            ? 'Bỏ trống mức chỉ tiêu = dòng thưởng ngoài trọng số: điểm cộng thẳng vào tổng, không tính tỉ lệ.'
            : 'Σ trọng số của cả bảng phải bằng 100 — sửa xong nhớ xem lại cảnh báo trên đầu bảng.'}
        </div>

        {loi && <div style={chuLoi}>{loi}</div>}

        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={luu} disabled={busy} style={nutChinh}>
            {busy ? 'Đang lưu…' : 'Lưu'}
          </button>
          {f.id && (
            <button
              onClick={async () => {
                setBusy(true);
                // Lỗi xoá hiện inline ngay trong form (như lỗi lưu), không dùng alert():
                // alert() bật lên rồi tắt là hết dấu vết, người dùng đóng form và tưởng đã xoá.
                try {
                  const err = await onXoa(f.id);
                  if (err) setLoi(err);
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              style={{ ...nutPhu, border: '1px solid #fecaca', color: '#dc2626' }}
            >
              Xoá
            </button>
          )}
          <button onClick={onHuy} style={nutPhu}>Huỷ</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tạo kỳ mới bằng cách copy bảng chỉ tiêu kỳ trước (quyền `create`)
// ─────────────────────────────────────────────────────────────────────────────

// Tháng liền trước một kỳ 'YYYY-MM'.
function kyTruoc(ky) {
  const [y, m] = String(ky).split('-').map(Number);
  if (!y || !m) return '';
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function TaoKyMoi({ ky, daCoDuLieu, onXong }) {
  const [mo, setMo] = useState(false);
  const [nguon, setNguon] = useState(kyTruoc(ky));
  const [loi, setLoi] = useState('');
  const [busy, setBusy] = useState(false);

  // Kỳ đã có dữ liệu thì RPC sẽ từ chối — không mời gọi thao tác chắc chắn hỏng.
  if (daCoDuLieu) return null;

  async function tao() {
    if (!nguon) { setLoi('Chọn kỳ nguồn để copy.'); return; }
    if (nguon === ky) { setLoi('Kỳ nguồn phải khác kỳ đang xem.'); return; }
    setLoi('');
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('tao_ky_kpi', { ky_nguon: nguon, ky_moi: ky });
      if (error) { setLoi('Lỗi: ' + error.message); return; }
      if (!data) { setLoi(`Kỳ ${nguon} không có dòng chỉ tiêu nào để copy.`); return; }
      setMo(false);
      onXong?.();
    } finally {
      setBusy(false);
    }
  }

  if (!mo) return (
    <button onClick={() => { setMo(true); setNguon(kyTruoc(ky)); setLoi(''); }} style={nutMo}>
      <CalendarPlus size={13} /> Tạo kỳ {ky} từ kỳ trước
    </button>
  );

  return (
    <div style={{
      marginTop: 10, marginBottom: 10, padding: '0.7rem', borderRadius: 10,
      background: '#f8fafc', display: 'grid', gap: 6,
    }}>
      <div style={{ fontSize: '0.74rem', color: '#475569' }}>
        Copy toàn bộ bảng chỉ tiêu sang kỳ <b>{ky}</b>. Điểm chốt và điểm tự chấm KHÔNG copy —
        kỳ mới bắt đầu từ trạng thái đạt đủ.
      </div>
      <label style={{ fontSize: '0.72rem', color: '#64748b' }}>
        Copy từ kỳ
        <input
          type="month" value={nguon} onChange={e => setNguon(e.target.value)} style={oInput}
        />
      </label>
      {loi && <div style={chuLoi}>{loi}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={tao} disabled={busy} style={nutChinh}>
          {busy ? 'Đang tạo…' : 'Tạo kỳ'}
        </button>
        <button onClick={() => { setMo(false); setLoi(''); }} style={nutPhu}>Huỷ</button>
      </div>
    </div>
  );
}
