import React, { useState, useEffect, useMemo } from 'react';
import { usePersistedState } from '../../lib/usePersistedState';
import { taskDb } from '../../lib/task_supabase';
import { Search, RefreshCw, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { useTabPerm, useAuth } from '../../lib/AuthContext';
import { TRANG_THAI_XU_LY, TRANG_THAI_DONG_BO, isQualifyingTicket, getEffectiveSteps } from '../../lib/warrantyProcessing';
import ProcessingModal from './ProcessingModal';

const statusMeta = (id) => TRANG_THAI_XU_LY.find(s => s.id === id) || { label: id || 'Chưa xử lý', color: '#64748b' };
const fmtDateTime = (v) => v ? new Date(String(v).replace(/Z$/i, '')).toLocaleString('vi-VN') : '-';
const badge = (color, label) => <span style={{ background: color + '22', color, padding: '3px 9px', borderRadius: '12px', fontWeight: 600, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{label}</span>;

// Cột workflow: dãy "đèn" các bước. Vàng SÁNG = chưa xong, vàng NHẠT (tắt đèn) = đã xong.
// Bấm 1 đèn để bật/tắt xong ngay trên danh sách (cần quyền sửa). Không mở popup khi bấm đèn.
function StepChips({ row, perm, onToggle }) {
  const steps = getEffectiveSteps(row['các_bước']);
  return (
    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '3px', alignItems: 'center' }}>
      {steps.map((s, i) => {
        const done = s['trạng_thái'] === 'xong';
        const name = s['tên'] || `Bước ${i + 1}`;
        return (
          <span
            key={i}
            onClick={(e) => { e.stopPropagation(); if (perm.edit) onToggle(row, i, steps); }}
            title={name + (done ? ' — đã xong' : ' — chưa xong')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '1px 6px',
              borderRadius: '8px', fontSize: '0.6rem', fontWeight: 600, whiteSpace: 'nowrap',
              userSelect: 'none', cursor: perm.edit ? 'pointer' : 'default', flex: '0 0 auto',
              ...(done
                ? { background: '#fefce8', color: '#a8a29e', border: '1px solid #fde68a', textDecoration: 'line-through' }
                : { background: '#fde047', color: '#713f12', border: '1px solid #eab308' }),
            }}
          >
            {done ? '✓' : ''}{name}
          </span>
        );
      })}
    </div>
  );
}

// Đăng ký cột danh sách. Thứ tự hiển thị = thứ tự ở đây. Người dùng bật/tắt qua nút "Ẩn/Hiện cột".
const LIST_COLUMNS = [
  { key: 'phiếu_ghi', label: 'Phiếu ghi', render: r => <span style={{ fontWeight: 600, color: '#1e293b' }}>{r['phiếu_ghi'] || r['id_phiếu_ghi']}</span> },
  { key: 'mã_đơn_hàng', label: 'Mã ĐH', render: r => r['mã_đơn_hàng'] || '-' },
  { key: 'mã_sản_phẩm', label: 'Mã SP', render: r => r['mã_sản_phẩm'] || '-' },
  { key: 'nhóm_sản_phẩm', label: 'Nhóm SP', render: r => r['nhóm_sản_phẩm'] || '-' },
  { key: 'số_điện_thoại_khách_hàng', label: 'SĐT', render: r => <span style={{ color: '#3b82f6' }}>{r['số_điện_thoại_khách_hàng'] || '-'}</span> },
  { key: 'chi_tiết_lỗi', label: 'Chi tiết lỗi', render: r => r['chi_tiết_lỗi'] || '-' },
  { key: 'linh_kiện', label: 'Linh kiện lỗi', render: r => r['linh_kiện'] || '-' },
  { key: 'ngày_lắp_đặt', label: 'Ngày lắp', render: r => r['ngày_lắp_đặt'] || '-' },
  { key: 'thời_điểm_tạo', label: 'Ngày tạo', render: r => r['thời_điểm_tạo'] || '-' },
  { key: 'trạng_thái_phiếu_ghi', label: 'TT phiếu (CS)', render: r => r['trạng_thái_phiếu_ghi'] || '-' },
  { key: 'người_phụ_trách', label: 'Người phụ trách', render: r => r['người_phụ_trách'] || <span style={{ color: '#cbd5e1' }}>Chưa giao</span> },
  { key: 'ngày_hẹn', label: 'Ngày hẹn', render: r => r['ngày_hẹn'] ? fmtDateTime(r['ngày_hẹn']) : '-' },
  { key: 'tổng_chi_phí', label: 'Chi phí', render: r => (Number(r['tổng_chi_phí']) || 0).toLocaleString('vi-VN') + ' đ' },
  { key: 'kết_quả_xử_lý', label: 'Kết quả', render: r => r['kết_quả_xử_lý'] || '-' },
  { key: 'trạng_thái_xử_lý', label: 'Trạng thái xử lý', render: r => { const m = statusMeta(r['trạng_thái_xử_lý'] || 'chưa_xử_lý'); return badge(m.color, m.label); } },
  { key: 'các_bước', label: 'Các bước (WF)', render: (r, ctx) => <StepChips row={r} perm={ctx.perm} onToggle={ctx.onToggleStep} /> },
  { key: 'trạng_thái_đồng_bộ', label: 'Đồng bộ', render: r => { const m = TRANG_THAI_DONG_BO[r['trạng_thái_đồng_bộ']] || TRANG_THAI_DONG_BO['nháp']; return badge(m.color, m.label); } },
];
const TRUNCATE_KEYS = ['chi_tiết_lỗi', 'kết_quả_xử_lý', 'linh_kiện'];
const DEFAULT_VISIBLE = ['phiếu_ghi', 'mã_đơn_hàng', 'mã_sản_phẩm', 'số_điện_thoại_khách_hàng', 'chi_tiết_lỗi', 'người_phụ_trách', 'trạng_thái_xử_lý', 'các_bước', 'trạng_thái_đồng_bộ'];

export default function WarrantyProcessing() {
  const perm = useTabPerm('warranty', 'xuLy');
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedState('wproc_search', '');
  const [statusFilter, setStatusFilter] = usePersistedState('wproc_statusFilter', 'all');
  const [showClosed, setShowClosed] = usePersistedState('wproc_showClosed', false);
  const [visibleCols, setVisibleCols] = usePersistedState('wproc_visibleCols', DEFAULT_VISIBLE);
  const [showColMenu, setShowColMenu] = useState(false);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = usePersistedState('wproc_rowsPerPage', 50);
  const [editing, setEditing] = useState(null);

  // Cột đang hiện (giữ thứ tự đăng ký, bỏ qua key lạ trong localStorage cũ).
  const cols = LIST_COLUMNS.filter(c => visibleCols.includes(c.key));
  const toggleCol = (key) => setVisibleCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const fetchRows = async () => {
    setLoading(true);
    try {
      const all = [];
      const step = 1000;
      for (let from = 0; ; from += step) {
        const { data, error } = await taskDb
          .from('xu_ly_phieu_bao_hanh')
          .select('*')
          .order('thời_điểm_tạo', { ascending: false })
          .range(from, from + step - 1);
        if (error) { console.warn('[WarrantyProcessing] fetch error:', error.message); break; }
        all.push(...(data || []));
        if (!data || data.length < step) break;
      }
      setRows(all);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRows(); }, []);

  const filtered = useMemo(() => {
    let r = rows;
    // Mặc định chỉ hiện phiếu CÒN MỞ (new/open/pending + đúng phân loại). Phiếu đã đóng ở
    // Caresoft vẫn giữ bản ghi xử lý nhưng ẩn khỏi tab, trừ khi bật "Hiện cả phiếu đã đóng".
    if (!showClosed) r = r.filter(isQualifyingTicket);
    if (statusFilter !== 'all') r = r.filter(x => (x['trạng_thái_xử_lý'] || 'chưa_xử_lý') === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(x => ['phiếu_ghi', 'mã_đơn_hàng', 'mã_sản_phẩm', 'số_điện_thoại_khách_hàng', 'chi_tiết_lỗi', 'người_phụ_trách']
        .some(k => String(x[k] || '').toLowerCase().includes(q)));
    }
    return r;
  }, [rows, statusFilter, search, showClosed]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const pageRows = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  // Lưu (giữ trạng_thái_đồng_bộ hiện tại, không đẩy)
  const handleSave = async (id, payload) => {
    const { error } = await taskDb.from('xu_ly_phieu_bao_hanh').update(payload).eq('id', id);
    if (error) { alert('Lỗi lưu: ' + error.message); return; }
    setEditing(null);
    await fetchRows();
  };

  // Hoàn tất & đồng bộ: set cờ pending → webhook n8n sẽ đẩy về Caresoft
  const handleSync = async (id, payload) => {
    const { error } = await taskDb.from('xu_ly_phieu_bao_hanh')
      .update({ ...payload, 'trạng_thái_đồng_bộ': 'pending', 'lỗi_đồng_bộ': null }).eq('id', id);
    if (error) { alert('Lỗi đồng bộ: ' + error.message); return; }
    alert('Đã đánh dấu phiếu chờ đồng bộ về Caresoft.');
    setEditing(null);
    await fetchRows();
  };

  // Tick 1 bước ngay trên danh sách: lật trạng_thái rồi lưu các_bước (vật chất hóa
  // workflow chuẩn vào phiếu nếu trước đó phiếu chưa có bước). Cập nhật lạc quan UI.
  const toggleStepDone = async (row, index, steps) => {
    const next = steps.map((s, i) => i === index
      ? { ...s, 'trạng_thái': s['trạng_thái'] === 'xong' ? 'chưa_xong' : 'xong' }
      : s);
    setRows(prev => prev.map(x => x.id === row.id ? { ...x, 'các_bước': next } : x));
    const { error } = await taskDb.from('xu_ly_phieu_bao_hanh').update({ 'các_bước': next }).eq('id', row.id);
    if (error) { alert('Lỗi cập nhật bước: ' + error.message); await fetchRows(); }
  };

  if (loading && rows.length === 0) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><RefreshCw size={36} className="spin" color="#6366f1" /></div>;
  }

  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: '1rem 0.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
      {/* Bộ lọc */}
      <div className="filter-bar" style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem', padding: '0 0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.4rem 0.6rem', flex: '1 1 240px' }}>
          <Search size={16} color="#94a3b8" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Tìm phiếu, mã ĐH, SP, SĐT, lỗi, người phụ trách..." style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.85rem' }} />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.85rem' }}>
          <option value="all">Tất cả trạng thái xử lý</option>
          {TRANG_THAI_XU_LY.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button onClick={fetchRows} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#475569' }}><RefreshCw size={15} /> Làm mới</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showClosed} onChange={e => { setShowClosed(e.target.checked); setPage(1); }} /> Hiện cả phiếu đã đóng
        </label>

        {/* Ẩn / Hiện cột */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowColMenu(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#475569' }}><Filter size={15} /> Ẩn / Hiện cột</button>
          {showColMenu && (
            <div className="responsive-pop" style={{ position: 'absolute', top: '110%', right: 0, zIndex: 100, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', width: '230px', maxHeight: '360px', overflowY: 'auto', padding: '0.8rem' }}>
              <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '0.8rem', color: '#64748b', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>Cột hiển thị</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {LIST_COLUMNS.map(c => (
                  <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={visibleCols.includes(c.key)} onChange={() => toggleCol(c.key)} /> {c.label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bảng */}
      <div style={{ width: '100%', overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: Math.max(600, cols.length * 130) }}>
          <thead style={{ background: '#f1f5f9' }}>
            <tr>
              {cols.map(c => (
                <th key={c.key} style={{ padding: '0.8rem 0.5rem', borderBottom: '2px solid #e2e8f0', fontWeight: 600, fontSize: '0.75rem', color: '#475569', whiteSpace: 'nowrap' }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={Math.max(1, cols.length)} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Không có phiếu cần xử lý.</td></tr>
            ) : pageRows.map((r, idx) => (
              <tr key={r.id} onClick={() => setEditing(r)} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 ? '#f8fafc' : '#fff', cursor: 'pointer' }}>
                {cols.map(c => {
                  const isSteps = c.key === 'các_bước';
                  return (
                    <td key={c.key} style={{
                      padding: '0.6rem 0.5rem', fontSize: '0.78rem', color: '#334155',
                      maxWidth: isSteps ? 'none' : (TRUNCATE_KEYS.includes(c.key) ? '220px' : 'none'),
                      minWidth: isSteps ? 260 : undefined,
                      overflow: isSteps ? 'visible' : 'hidden',
                      textOverflow: isSteps ? 'clip' : 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {c.render(r, { perm, onToggleStep: toggleStepDone })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phân trang */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Tổng <b>{filtered.length}</b> phiếu</span>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '2px 4px' }}>
            <option value={20}>20 dòng</option><option value={50}>50 dòng</option><option value={100}>100 dòng</option>
          </select>
          <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
            <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ padding: '0.4rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}><ChevronLeft size={16} /></button>
            <span style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>Trang {page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={{ padding: '0.4rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {editing && <ProcessingModal row={editing} perm={perm} currentUser={user} onClose={() => setEditing(null)} onSave={handleSave} onSync={handleSync} />}
    </div>
  );
}
