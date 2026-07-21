import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, fetchAllRows } from '../../lib/supabase';
import { tinhBangKpi, giaiThich, kiemTraTrongSo } from '../../lib/kpiEngine';
import { Trophy, ChevronRight, ChevronLeft, AlertTriangle, Plus, X, Loader2 } from 'lucide-react';

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
      </div>

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

  const kq = useMemo(() => tinhBangKpi(rows, logs), [rows, logs]);
  const canhBaoTrongSo = useMemo(() => kiemTraTrongSo(rows), [rows]);
  const nguoi = users.find(u => u.id === nvId);
  const tenNguoi = nguoi?.name || nvId;

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
        {kq.dong.map(d => <DongChiTieu key={d.id} d={d} onClick={() => setPopupId(d.id)} />)}
      </div>

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
function DongChiTieu({ d, onClick }) {
  const thuong = d.laThuong;
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', width: '100%', alignItems: 'center', gap: 8, textAlign: 'left',
        padding: '0.5rem 0.65rem', marginBottom: 4, borderRadius: 9,
        border: thuong ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
        background: '#fff', cursor: 'pointer',
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
      const { error } = await supabase.from('kpi_nhat_ky').insert({
        chi_tieu_id: chiTieuId, ngay: f.ngay, so_diem: diem,
        ly_do: f.ly_do.trim(), nguoi_ghi: me?.name || me?.id, nguon: 'TAY',
      });
      if (error) { setLoi('Lỗi lưu: ' + error.message); return; }
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

// Chốt điểm tay: ghi thẳng `diem_chot` lên dòng chỉ tiêu, thắng mọi nhật ký.
// Engine có kẹp [0, chi_tieu] rồi, nhưng kẹp âm thầm nên quản lý gõ 20 trên chỉ tiêu 10
// sẽ không biết mình gõ sai — form phải chặn và nói ra.
function FormChotDiem({ ctGhi, me, onXong }) {
  const dangChot = ctGhi.diem_chot !== null && ctGhi.diem_chot !== undefined;
  const [mo, setMo] = useState(false);
  const [giaTri, setGiaTri] = useState(dangChot ? String(ctGhi.diem_chot) : '');
  const [loi, setLoi] = useState('');
  const [busy, setBusy] = useState(false);

  // Dòng thưởng ngoài trọng số: engine tính điểm thưởng THUẦN từ nhật ký và không hề đọc
  // `diem_chot`, nên cho chốt tay ở đây chỉ tạo một con số chết trong DB.
  if (ctGhi.chi_tieu === null || ctGhi.chi_tieu === undefined) return null;

  const max = Number(ctGhi.chi_tieu);

  async function ghi(giaTriMoi) {
    setBusy(true);
    try {
      const { error } = await supabase
        .from('kpi_chi_tieu')
        .update({
          diem_chot: giaTriMoi,
          chot_boi: giaTriMoi === null ? null : (me?.name || me?.id || null),
          chot_luc: giaTriMoi === null ? null : new Date().toISOString(),
        })
        .eq('id', ctGhi.id);
      if (error) { setLoi('Lỗi lưu: ' + error.message); return; }
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
    if (v < 0) { setLoi('Điểm chốt không được nhỏ hơn 0.'); return; }
    if (v > max) { setLoi(`Điểm chốt không được lớn hơn chỉ tiêu (${soNgan(max)}).`); return; }
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
        Điểm chốt tay thắng nhật ký. Hợp lệ: 0 – {soNgan(max)}.
      </div>
      <input
        type="number" step="0.5" min={0} max={max} inputMode="decimal"
        placeholder={`Điểm chốt (0 – ${soNgan(max)})`}
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
